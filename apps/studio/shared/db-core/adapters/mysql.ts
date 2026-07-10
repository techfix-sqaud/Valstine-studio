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
  // MySQL has no real schema concept, but listSchemas() returns a synthetic
  // ['default'] entry and the existing DatabaseExplorer tree already renders
  // that as a schema group — keep supportsSchemas true to match current UI.
  supportsSchemas: true,
  supportsTables: true,
  tableLabel: 'Table',
  supportsColumns: true,
  supportsIndexes: true,
  supportsFunctions: true,
  supportsTriggers: true,
  supportsSequences: false,
  supportsExplain: true,
  supportsSchemaDiff: true,
  supportsSearch: true,
  supportsProvisioning: true,
  connectionFormVariant: 'host-port',
};

const pool = new Map<string, Knex>();

function connectionKey(c: ConnectionPayload): string {
  const sslMode = c.ssl ? (c.sslRejectUnauthorized === false ? 'ssl-noverify' : 'ssl') : 'nossl';
  return `mysql://${c.user ?? ''}@${c.host}:${c.port}/${c.database}?${sslMode}`;
}

function getDb(c: ConnectionPayload): Knex {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;
  const instance = knex({
    client: 'mysql2',
    connection: {
      host: c.host ?? 'localhost',
      port: c.port ?? 3306,
      database: c.database,
      user: c.user ?? '',
      password: c.password ?? '',
      ssl: c.ssl ? { rejectUnauthorized: c.sslRejectUnauthorized ?? true } : undefined,
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
  const [data, fields] = Array.isArray(result) ? result : [result, []];
  if (Array.isArray(data)) {
    const rows: Record<string, unknown>[] = data;
    const columns: string[] = Array.isArray(fields) ? fields.map((f: any) => f.name) : [];
    return { columns, rows, rowCount: rows.length, status: 'success' };
  }
  return {
    columns: ['result'],
    rows: [{ result: `${data.affectedRows ?? 0} row(s) affected` }],
    rowCount: 1,
    status: 'success',
    message: `${data.affectedRows ?? 0} row(s) affected`,
  };
}

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  const [rows] = await getDb(c).raw('SHOW DATABASES');
  return rows.map((r: any) => r.Database);
}

async function listSchemas(_c: ConnectionPayload): Promise<string[]> {
  return ['default'];
}

async function listTables(c: ConnectionPayload, _schema?: string): Promise<TableInfo[]> {
  const [rows] = await getDb(c).raw('SHOW FULL TABLES');
  return rows.map((row: any) => {
    const name = Object.values(row)[0] as string;
    const type = (Object.values(row)[1] as string) === 'VIEW' ? ('view' as const) : ('table' as const);
    return { name, schema: 'default', type };
  });
}

async function listColumns(c: ConnectionPayload, tableName: string, _schema?: string): Promise<ColumnInfo[]> {
  const [rows] = await getDb(c).raw('DESCRIBE ??', [tableName]);
  return rows.map((row: any) => ({
    name: row.Field,
    type: row.Type,
    nullable: row.Null === 'YES',
    primaryKey: row.Key === 'PRI',
    defaultValue: row.Default ?? null,
  }));
}

async function getRowCount(c: ConnectionPayload, tableName: string, _schema?: string): Promise<number> {
  try {
    validateIdentifier(tableName, 'table name');
    const r = await getDb(c).raw(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``);
    return parseInt(r[0]?.[0]?.cnt ?? '0', 10);
  } catch {
    return -1;
  }
}

async function listIndexes(c: ConnectionPayload, tableName: string, _schema?: string): Promise<IndexInfo[]> {
  try {
    const [rows] = await getDb(c).raw('SHOW INDEX FROM ??', [tableName]);
    const byName = new Map<string, { unique: boolean; cols: string[] }>();
    for (const row of rows as any[]) {
      const e = byName.get(row.Key_name) ?? { unique: row.Non_unique === 0, cols: [] };
      e.cols.push(row.Column_name);
      byName.set(row.Key_name, e);
    }
    return Array.from(byName.entries()).map(([name, e]) => ({ name, unique: e.unique, columns: e.cols.join(', ') }));
  } catch {
    return [];
  }
}

async function listSchemaIndexes(c: ConnectionPayload, _schema?: string): Promise<SchemaIndexInfo[]> {
  try {
    const [rows] = await getDb(c).raw(
      `SELECT TABLE_NAME AS table_name, INDEX_NAME AS name,
        IF(NON_UNIQUE=0,1,0) AS is_unique,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columns
       FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
       GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME`,
    );
    return (rows as any[]).map((row) => ({ name: row.name, tableName: row.table_name, unique: row.is_unique === 1, columns: row.columns ?? '' }));
  } catch {
    return [];
  }
}

async function listFunctions(c: ConnectionPayload, _schema?: string): Promise<FunctionInfo[]> {
  try {
    const [rows] = await getDb(c).raw(
      `SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS kind,
        COALESCE(DTD_IDENTIFIER,'void') AS return_type, 'sql' AS language
       FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()
       ORDER BY ROUTINE_TYPE, ROUTINE_NAME`,
    );
    return (rows as any[]).map((row) => ({ name: row.name, kind: row.kind, returnType: row.return_type, language: 'sql' }));
  } catch {
    return [];
  }
}

async function listTriggers(c: ConnectionPayload, _schema?: string): Promise<TriggerInfo[]> {
  try {
    const [rows] = await getDb(c).raw(
      `SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS table_name,
        EVENT_MANIPULATION AS event, ACTION_TIMING AS timing
       FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
       ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`,
    );
    return (rows as any[]).map((row) => ({ name: row.name, tableName: row.table_name, event: row.event, timing: row.timing }));
  } catch {
    return [];
  }
}

async function listSequences(_c: ConnectionPayload, _schema?: string): Promise<string[]> {
  return [];
}

async function createDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'database name');
  await getDb(c).raw(`CREATE DATABASE \`${name}\``);
  return { ok: true };
}

async function dropDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'database name');
  await getDb(c).raw(`DROP DATABASE \`${name}\``);
  return { ok: true };
}

async function createSchema(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Not supported for this database type' };
}

async function dropTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  validateIdentifier(table, 'table name');
  await getDb(c).raw(`DROP TABLE \`${table}\``);
}

async function truncateTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  validateIdentifier(table, 'table name');
  await getDb(c).raw(`TRUNCATE TABLE \`${table}\``);
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  return snapshotSchemaGeneric(c, mysqlAdapter, onlySchema);
}

async function search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
  return searchGeneric(c, mysqlAdapter, async (schema, table, cols, t, limit) => {
    const conditions = cols.map((col) => `CAST(\`${col.name}\` AS CHAR) LIKE ?`).join(' OR ');
    const searchQuery = `SELECT * FROM \`${table}\` WHERE ${conditions} LIMIT ${limit}`;
    const bindings = cols.map(() => `%${t}%`);
    const res = await getDb(c).raw(searchQuery, bindings);
    const rows = Array.isArray(res) ? res[0] : res;
    return Array.isArray(rows) ? rows : [];
  }, term, maxPerTable);
}

async function explain(c: ConnectionPayload, query: string): Promise<ExplainResult> {
  const explainSql = `EXPLAIN FORMAT=JSON ${query}`;
  const res = await getDb(c).raw(explainSql);
  const rows = Array.isArray(res) ? res[0] : res;
  const rowArr = Array.isArray(rows) ? rows : [];
  const raw = rowArr[0]?.['EXPLAIN'] ?? rowArr[0]?.EXPLAIN ?? null;
  return { raw: typeof raw === 'string' ? JSON.parse(raw) : raw };
}

export const mysqlAdapter: DbAdapter = {
  type: 'mysql',
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
