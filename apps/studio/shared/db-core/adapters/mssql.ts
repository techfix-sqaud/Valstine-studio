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
  return `mssql://${c.user ?? ''}@${c.host}:${c.port}/${c.database}?${sslMode}`;
}

function getDb(c: ConnectionPayload): Knex {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;
  const instance = knex({
    client: 'mssql',
    connection: {
      server: c.host,
      port: c.port ?? 1433,
      database: c.database,
      userName: c.user,
      password: c.password,
      options: { encrypt: c.ssl ?? false, trustServerCertificate: true },
    } as any,
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
  const data = Array.isArray(result) ? result : (result?.rows ?? []);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];
  const columns: string[] = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows, rowCount: rows.length, status: 'success' };
}

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  const r = await getDb(c).raw('SELECT name FROM sys.databases ORDER BY name');
  return (Array.isArray(r) ? r : []).map((row: any) => row.name);
}

async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  const r = await getDb(c).raw(
    "SELECT name FROM sys.schemas WHERE name NOT IN ('guest','INFORMATION_SCHEMA','sys') ORDER BY name",
  );
  return (Array.isArray(r) ? r : []).map((row: any) => row.name);
}

async function listTables(c: ConnectionPayload, schema?: string): Promise<TableInfo[]> {
  const s = schema || 'dbo';
  const r = await getDb(c).raw(
    `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [s],
  );
  return (Array.isArray(r) ? r : []).map((row: any) => ({
    name: row.TABLE_NAME,
    schema: s,
    type: row.TABLE_TYPE === 'VIEW' ? ('view' as const) : ('table' as const),
  }));
}

async function listColumns(c: ConnectionPayload, tableName: string, schema?: string): Promise<ColumnInfo[]> {
  const s = schema || 'dbo';
  const r = await getDb(c).raw(
    `SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
      CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK
     FROM INFORMATION_SCHEMA.COLUMNS c
     LEFT JOIN (
       SELECT ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
       JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
       WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = ? AND tc.TABLE_SCHEMA = ?
     ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
     WHERE c.TABLE_NAME = ? AND c.TABLE_SCHEMA = ?
     ORDER BY c.ORDINAL_POSITION`,
    [tableName, s, tableName, s],
  );
  return (Array.isArray(r) ? r : []).map((row: any) => ({
    name: row.COLUMN_NAME,
    type: row.DATA_TYPE,
    nullable: row.IS_NULLABLE === 'YES',
    primaryKey: row.IS_PK === 1,
    defaultValue: row.COLUMN_DEFAULT ?? null,
  }));
}

async function getRowCount(c: ConnectionPayload, tableName: string, schema?: string): Promise<number> {
  try {
    validateIdentifier(tableName, 'table name');
    if (schema) validateIdentifier(schema, 'schema name');
    const qualified = `"${schema ?? 'public'}"."${tableName}"`;
    const r = await getDb(c).raw(`SELECT COUNT(*) AS cnt FROM ${qualified}`);
    return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
  } catch {
    return -1;
  }
}

async function listIndexes(c: ConnectionPayload, tableName: string, schema?: string): Promise<IndexInfo[]> {
  try {
    const s = schema || 'dbo';
    const r = await getDb(c).raw(
      `SELECT i.name, i.is_unique,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
       FROM sys.indexes i
       JOIN sys.tables t ON t.object_id = i.object_id
       JOIN sys.schemas sc ON sc.schema_id = t.schema_id
       JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
       WHERE t.name = ? AND sc.name = ? AND i.type > 0
       GROUP BY i.name, i.is_unique
       ORDER BY i.name`,
      [tableName, s],
    );
    return (Array.isArray(r) ? r : []).map((row: any) => ({ name: row.name, unique: row.is_unique === 1, columns: row.columns ?? '' }));
  } catch {
    return [];
  }
}

async function listSchemaIndexes(c: ConnectionPayload, schema?: string): Promise<SchemaIndexInfo[]> {
  try {
    const s = schema || 'dbo';
    const r = await getDb(c).raw(
      `SELECT t.name AS table_name, i.name, i.is_unique,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
       FROM sys.indexes i
       JOIN sys.tables t ON t.object_id = i.object_id
       JOIN sys.schemas sc ON sc.schema_id = t.schema_id
       JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
       WHERE sc.name = ? AND i.type > 0
       GROUP BY t.name, i.name, i.is_unique ORDER BY t.name, i.name`, [s],
    );
    return (Array.isArray(r) ? r : []).map((row: any) => ({ name: row.name, tableName: row.table_name, unique: row.is_unique === 1, columns: row.columns ?? '' }));
  } catch {
    return [];
  }
}

async function listFunctions(c: ConnectionPayload, schema?: string): Promise<FunctionInfo[]> {
  try {
    const s = schema || 'dbo';
    const r = await getDb(c).raw(
      `SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS kind,
        COALESCE(DATA_TYPE,'void') AS return_type, 'T-SQL' AS language
       FROM INFORMATION_SCHEMA.ROUTINES
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE IN ('FUNCTION','PROCEDURE')
       ORDER BY ROUTINE_TYPE, ROUTINE_NAME`,
      [s],
    );
    return (Array.isArray(r) ? r : []).map((row: any) => ({ name: row.name, kind: row.kind, returnType: row.return_type, language: 'T-SQL' }));
  } catch {
    return [];
  }
}

async function listTriggers(c: ConnectionPayload, schema?: string): Promise<TriggerInfo[]> {
  try {
    const s = schema || 'dbo';
    const r = await getDb(c).raw(
      `SELECT t.name, OBJECT_NAME(t.parent_id) AS table_name, '' AS event, '' AS timing
       FROM sys.triggers t
       JOIN sys.tables tab ON tab.object_id = t.parent_id
       JOIN sys.schemas sc ON sc.schema_id = tab.schema_id
       WHERE sc.name = ? AND t.is_disabled = 0
       ORDER BY table_name, t.name`,
      [s],
    );
    return (Array.isArray(r) ? r : []).map((row: any) => ({ name: row.name, tableName: row.table_name, event: '', timing: '' }));
  } catch {
    return [];
  }
}

async function listSequences(_c: ConnectionPayload, _schema?: string): Promise<string[]> {
  return [];
}

async function createDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'database name');
  await getDb(c).raw(`CREATE DATABASE [${name}]`);
  return { ok: true };
}

async function dropDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'database name');
  await getDb(c).raw(`DROP DATABASE [${name}]`);
  return { ok: true };
}

async function createSchema(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'schema name');
  await getDb(c).raw(`CREATE SCHEMA [${name}]`);
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
  return snapshotSchemaGeneric(c, mssqlAdapter, onlySchema);
}

async function search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
  return searchGeneric(c, mssqlAdapter, async (schema, table, cols, t, limit) => {
    const conditions = cols.map((col) => `CAST([${col.name}] AS NVARCHAR(MAX)) LIKE ?`).join(' OR ');
    const searchQuery = `SELECT TOP ${limit} * FROM [${schema}].[${table}] WHERE ${conditions}`;
    const bindings = cols.map(() => `%${t}%`);
    const res = await getDb(c).raw(searchQuery, bindings);
    return res?.recordset ?? [];
  }, term, maxPerTable);
}

async function explain(c: ConnectionPayload, query: string): Promise<ExplainResult> {
  const db = getDb(c);
  await db.raw('SET SHOWPLAN_ALL ON');
  const res = await db.raw(query);
  await db.raw('SET SHOWPLAN_ALL OFF');
  return { raw: { type: 'mssql-showplan', rows: res?.recordset ?? [] } };
}

export const mssqlAdapter: DbAdapter = {
  type: 'mssql',
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
