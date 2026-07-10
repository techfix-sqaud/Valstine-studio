import knex, { Knex } from 'knex';
import { validateIdentifier } from '../sql-utils.js';
import { snapshotSchemaGeneric, searchGeneric } from '../generic.js';
import type {
  ColumnInfo, ConnectionPayload, DbAdapter, DbCapabilities, ExplainResult,
  FunctionInfo, IndexInfo, NormalizedResult, SchemaIndexInfo, SchemaSnapshot,
  SearchMatch, TableInfo, TriggerInfo,
} from '../types.js';

const capabilities: DbCapabilities = {
  queryLanguage: 'sql',
  resultShape: 'tabular',
  supportsDatabases: true,
  supportsSchemas: true,
  supportsTables: true,
  tableLabel: 'Table',
  supportsColumns: true,
  supportsIndexes: true,
  supportsFunctions: true,
  supportsTriggers: true,
  supportsSequences: true,
  supportsExplain: true,
  supportsSchemaDiff: true,
  supportsSearch: true,
  supportsProvisioning: true,
  connectionFormVariant: 'host-port',
};

const pool = new Map<string, Knex>();

function connectionKey(c: ConnectionPayload): string {
  const sslMode = c.ssl ? (c.sslRejectUnauthorized === false ? 'ssl-noverify' : 'ssl') : 'nossl';
  return `pg://${c.user ?? ''}@${c.host}:${c.port}/${c.database}?${sslMode}`;
}

function getDb(c: ConnectionPayload): Knex {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;
  const instance = knex({
    client: 'pg',
    connection: {
      host: c.host ?? 'localhost',
      port: c.port ?? 5432,
      database: c.database,
      user: c.user ?? '',
      password: c.password ?? '',
      ssl: c.ssl ? { rejectUnauthorized: c.sslRejectUnauthorized ?? true } : false,
    },
    pool: { min: 0, max: 5 },
  });
  pool.set(key, instance);
  return instance;
}

function destroyDb(c: ConnectionPayload): void {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) {
    existing.destroy();
    pool.delete(key);
  }
}

async function testConnection(c: ConnectionPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    await getDb(c).raw('SELECT 1');
    return { ok: true };
  } catch (err: any) {
    destroyDb(c);
    return { ok: false, error: err.message ?? String(err) };
  }
}

async function disconnect(c: ConnectionPayload): Promise<void> {
  destroyDb(c);
}

async function execute(c: ConnectionPayload, query: string): Promise<NormalizedResult> {
  const result = await getDb(c).raw(query);
  const pgResult = Array.isArray(result) ? result[0] : result;
  const rows: Record<string, unknown>[] = pgResult.rows ?? [];
  const columns: string[] = pgResult.fields?.map((f: any) => f.name) ?? [];
  if (rows.length === 0 && pgResult.command) {
    return {
      columns: ['result'],
      rows: [{ result: `${pgResult.command} — ${pgResult.rowCount ?? 0} row(s) affected` }],
      rowCount: 1,
      status: 'success',
      message: `${pgResult.command} completed successfully`,
    };
  }
  return { columns, rows, rowCount: rows.length, status: 'success' };
}

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  const r = await getDb(c).raw('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname');
  return (r.rows ?? []).map((row: any) => row.datname);
}

async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  const r = await getDb(c).raw(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name",
  );
  return (r.rows ?? []).map((row: any) => row.schema_name);
}

async function listTables(c: ConnectionPayload, schema?: string): Promise<TableInfo[]> {
  const s = schema || 'public';
  const r = await getDb(c).raw(
    `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
    [s],
  );
  return (r.rows ?? []).map((row: any) => ({
    name: row.table_name,
    schema: s,
    type: row.table_type === 'VIEW' ? ('view' as const) : ('table' as const),
  }));
}

async function listColumns(c: ConnectionPayload, tableName: string, schema?: string): Promise<ColumnInfo[]> {
  const s = schema || 'public';
  const r = await getDb(c).raw(
    `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
     FROM information_schema.columns c
     LEFT JOIN (
       SELECT ku.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = ? AND tc.table_schema = ?
     ) pk ON c.column_name = pk.column_name
     WHERE c.table_name = ? AND c.table_schema = ?
     ORDER BY c.ordinal_position`,
    [tableName, s, tableName, s],
  );
  return (r.rows ?? []).map((row: any) => ({
    name: row.column_name,
    type: row.data_type,
    nullable: row.is_nullable === 'YES',
    primaryKey: row.is_pk === true,
    defaultValue: row.column_default ?? null,
  }));
}

async function getRowCount(c: ConnectionPayload, tableName: string, schema?: string): Promise<number> {
  try {
    validateIdentifier(tableName, 'table name');
    if (schema) validateIdentifier(schema, 'schema name');
    const qualified = `"${schema ?? 'public'}"."${tableName}"`;
    const r = await getDb(c).raw(`SELECT COUNT(*) AS cnt FROM ${qualified}`);
    return parseInt(r.rows?.[0]?.cnt ?? '0', 10);
  } catch {
    return -1;
  }
}

async function listIndexes(c: ConnectionPayload, tableName: string, schema?: string): Promise<IndexInfo[]> {
  try {
    const s = schema || 'public';
    const r = await getDb(c).raw(
      `SELECT i.relname AS name, ix.indisunique AS is_unique,
        string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns
       FROM pg_index ix
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE t.relname = ? AND n.nspname = ? AND t.relkind = 'r'
       GROUP BY i.relname, ix.indisunique
       ORDER BY i.relname`,
      [tableName, s],
    );
    return (r.rows ?? []).map((row: any) => ({ name: row.name, unique: row.is_unique === true, columns: row.columns ?? '' }));
  } catch {
    return [];
  }
}

async function listSchemaIndexes(c: ConnectionPayload, schema?: string): Promise<SchemaIndexInfo[]> {
  try {
    const s = schema || 'public';
    const r = await getDb(c).raw(
      `SELECT i.relname AS name, ix.indisunique AS is_unique, t.relname AS table_name,
        string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns
       FROM pg_index ix
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE n.nspname = ? AND t.relkind = 'r'
       GROUP BY i.relname, ix.indisunique, t.relname
       ORDER BY t.relname, i.relname`, [s],
    );
    return (r.rows ?? []).map((row: any) => ({ name: row.name, tableName: row.table_name, unique: row.is_unique === true, columns: row.columns ?? '' }));
  } catch {
    return [];
  }
}

async function listFunctions(c: ConnectionPayload, schema?: string): Promise<FunctionInfo[]> {
  try {
    const s = schema || 'public';
    const r = await getDb(c).raw(
      `SELECT p.proname AS name,
        CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind,
        COALESCE(pg_catalog.pg_get_function_result(p.oid), 'void') AS return_type,
        l.lanname AS language
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_catalog.pg_language l ON l.oid = p.prolang
       WHERE n.nspname = ? AND p.prokind NOT IN ('a', 'w')
       ORDER BY p.prokind, p.proname`, [s],
    );
    return (r.rows ?? []).map((row: any) => ({ name: row.name, kind: row.kind as 'FUNCTION' | 'PROCEDURE', returnType: row.return_type, language: row.language }));
  } catch {
    return [];
  }
}

async function listTriggers(c: ConnectionPayload, schema?: string): Promise<TriggerInfo[]> {
  try {
    const s = schema || 'public';
    const r = await getDb(c).raw(
      `SELECT trigger_name AS name, event_object_table AS table_name,
        string_agg(event_manipulation, '/' ORDER BY event_manipulation) AS event,
        action_timing AS timing
       FROM information_schema.triggers WHERE trigger_schema = ?
       GROUP BY trigger_name, event_object_table, action_timing
       ORDER BY event_object_table, trigger_name`,
      [s],
    );
    return (r.rows ?? []).map((row: any) => ({ name: row.name, tableName: row.table_name, event: row.event ?? '', timing: row.timing ?? '' }));
  } catch {
    return [];
  }
}

async function listSequences(c: ConnectionPayload, schema?: string): Promise<string[]> {
  try {
    const s = schema || 'public';
    const r = await getDb(c).raw(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = ? ORDER BY sequence_name`, [s]);
    return (r.rows ?? []).map((row: any) => row.sequence_name as string);
  } catch {
    return [];
  }
}

async function createDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'database name');
  await getDb(c).raw(`CREATE DATABASE "${name}"`);
  return { ok: true };
}

async function dropDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'database name');
  await getDb(c).raw(`DROP DATABASE "${name}"`);
  return { ok: true };
}

async function createSchema(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'schema name');
  await getDb(c).raw(`CREATE SCHEMA "${name}"`);
  return { ok: true };
}

async function dropTable(c: ConnectionPayload, table: string, schema?: string): Promise<void> {
  validateIdentifier(table, 'table name');
  if (schema) validateIdentifier(schema, 'schema name');
  await getDb(c).raw(`DROP TABLE "${schema ?? 'public'}"."${table}"`);
}

async function truncateTable(c: ConnectionPayload, table: string, schema?: string): Promise<void> {
  validateIdentifier(table, 'table name');
  if (schema) validateIdentifier(schema, 'schema name');
  await getDb(c).raw(`TRUNCATE TABLE "${schema ?? 'public'}"."${table}"`);
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  return snapshotSchemaGeneric(c, postgresAdapter, onlySchema);
}

async function search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
  return searchGeneric(c, postgresAdapter, async (schema, table, cols, t, limit) => {
    const conditions = cols.map((col) => `"${col.name}"::text ILIKE $1`).join(' OR ');
    const searchQuery = `SELECT * FROM "${schema}"."${table}" WHERE ${conditions} LIMIT ${limit}`;
    const res = await (getDb(c) as any).raw(searchQuery, [`%${t}%`]);
    return res?.[0]?.rows ?? res?.rows ?? [];
  }, term, maxPerTable);
}

async function explain(c: ConnectionPayload, query: string): Promise<ExplainResult> {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
  const res = await getDb(c).raw(explainSql);
  const rows = res?.[0]?.rows ?? res?.rows ?? (Array.isArray(res) ? res : []);
  const raw = rows[0]?.['QUERY PLAN']?.[0] ?? rows[0] ?? null;
  return { raw };
}

export const postgresAdapter: DbAdapter = {
  type: 'pg',
  capabilities,
  testConnection,
  disconnect,
  execute,
  listDatabases,
  listSchemas,
  listTables,
  listColumns,
  getRowCount,
  listIndexes,
  listSchemaIndexes,
  listFunctions,
  listTriggers,
  listSequences,
  createDatabase,
  dropDatabase,
  createSchema,
  dropTable,
  truncateTable,
  snapshotSchema,
  search,
  explain,
};
