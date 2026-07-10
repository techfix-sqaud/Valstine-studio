import { validateIdentifier } from '../sql-utils.js';
import { snapshotSchemaGeneric, searchGeneric } from '../generic.js';
import type {
  ColumnInfo, ConnectionPayload, DbAdapter, DbCapabilities, DbHandle, ExplainResult,
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
  supportsFunctions: false,
  supportsTriggers: true,
  supportsSequences: false,
  supportsExplain: true,
  supportsSchemaDiff: true,
  supportsSearch: true,
  supportsProvisioning: true,
  connectionFormVariant: 'file',
};

// SQLite is the one type where the underlying driver genuinely differs by
// runtime: Electron uses knex+better-sqlite3 (a native binary), the Bun web
// server uses bun:sqlite directly via a small `.raw()`-compatible shim. Both
// already satisfy DbHandle ({ raw(), destroy() }), so the adapter takes the
// driver as a factory instead of importing either runtime's SQLite binding.
export function createSqliteAdapter(openDb: (filename: string) => DbHandle): DbAdapter {
  const pool = new Map<string, DbHandle>();

  function connectionKey(c: ConnectionPayload): string {
    return `sqlite:${c.filename ?? c.database}`;
  }

  function getDb(c: ConnectionPayload): DbHandle {
    const key = connectionKey(c);
    const existing = pool.get(key);
    if (existing) return existing;
    const instance = openDb(c.filename ?? c.database);
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
    if (Array.isArray(result)) {
      const rows: Record<string, unknown>[] = result;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { columns, rows, rowCount: rows.length, status: 'success' };
    }
    return {
      columns: ['result'],
      rows: [{ result: 'Statement executed successfully' }],
      rowCount: 1,
      status: 'success',
    };
  }

  async function listDatabases(c: ConnectionPayload): Promise<string[]> {
    return [c.filename ?? c.database];
  }

  async function listSchemas(_c: ConnectionPayload): Promise<string[]> {
    return ['main'];
  }

  async function listTables(c: ConnectionPayload, _schema?: string): Promise<TableInfo[]> {
    const rows = await getDb(c).raw(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      name: row.name,
      schema: 'main',
      type: row.type === 'view' ? ('view' as const) : ('table' as const),
    }));
  }

  async function listColumns(c: ConnectionPayload, tableName: string, _schema?: string): Promise<ColumnInfo[]> {
    validateIdentifier(tableName, 'table name');
    const rows = await getDb(c).raw(`PRAGMA table_info("${tableName}")`);
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      name: row.name,
      type: row.type,
      nullable: row.notnull === 0,
      primaryKey: row.pk === 1,
      defaultValue: row.dflt_value ?? null,
    }));
  }

  async function getRowCount(c: ConnectionPayload, tableName: string, _schema?: string): Promise<number> {
    try {
      validateIdentifier(tableName, 'table name');
      const r = await getDb(c).raw(`SELECT COUNT(*) AS cnt FROM "${tableName}"`);
      return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
    } catch {
      return -1;
    }
  }

  async function listIndexes(c: ConnectionPayload, tableName: string, _schema?: string): Promise<IndexInfo[]> {
    try {
      validateIdentifier(tableName, 'table name');
      const idxList = await getDb(c).raw(`PRAGMA index_list("${tableName}")`);
      const result: IndexInfo[] = [];
      for (const idx of (Array.isArray(idxList) ? idxList : [])) {
        const cols = await getDb(c).raw(`PRAGMA index_info("${idx.name}")`);
        result.push({ name: idx.name, unique: idx.unique === 1, columns: (Array.isArray(cols) ? cols : []).map((c: any) => c.name).join(', ') });
      }
      return result;
    } catch {
      return [];
    }
  }

  async function listSchemaIndexes(c: ConnectionPayload, _schema?: string): Promise<SchemaIndexInfo[]> {
    try {
      const tables = await getDb(c).raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
      const result: SchemaIndexInfo[] = [];
      for (const t of (Array.isArray(tables) ? tables : [])) {
        validateIdentifier(t.name, 'table name');
        const idxList = await getDb(c).raw(`PRAGMA index_list("${t.name}")`);
        for (const idx of (Array.isArray(idxList) ? idxList : [])) {
          const cols = await getDb(c).raw(`PRAGMA index_info("${idx.name}")`);
          result.push({ name: idx.name, tableName: t.name, unique: idx.unique === 1, columns: (Array.isArray(cols) ? cols : []).map((c: any) => c.name).join(', ') });
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  async function listFunctions(_c: ConnectionPayload, _schema?: string): Promise<FunctionInfo[]> {
    return [];
  }

  async function listTriggers(c: ConnectionPayload, _schema?: string): Promise<TriggerInfo[]> {
    try {
      const rows = await getDb(c).raw(`SELECT name, tbl_name AS table_name FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name`);
      return (Array.isArray(rows) ? rows : []).map((row: any) => ({ name: row.name, tableName: row.table_name, event: '', timing: '' }));
    } catch {
      return [];
    }
  }

  async function listSequences(_c: ConnectionPayload, _schema?: string): Promise<string[]> {
    return [];
  }

  async function createDatabase(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'SQLite does not support CREATE DATABASE' };
  }

  async function dropDatabase(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'SQLite does not support DROP DATABASE' };
  }

  async function createSchema(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'Not supported for this database type' };
  }

  async function dropTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
    validateIdentifier(table, 'table name');
    await getDb(c).raw(`DROP TABLE "${table}"`);
  }

  async function truncateTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
    validateIdentifier(table, 'table name');
    await getDb(c).raw(`DELETE FROM "${table}"`);
  }

  const adapter: DbAdapter = {
    type: 'sqlite',
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
    async snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
      return snapshotSchemaGeneric(c, adapter, onlySchema);
    },
    async search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
      return searchGeneric(c, adapter, async (_schema, table, cols, t, limit) => {
        const conditions = cols.map((col) => `CAST("${col.name}" AS TEXT) LIKE ?`).join(' OR ');
        const searchQuery = `SELECT * FROM "${table}" WHERE ${conditions} LIMIT ${limit}`;
        const bindings = cols.map(() => `%${t}%`);
        const res = await getDb(c).raw(searchQuery, bindings);
        return Array.isArray(res) ? res : [];
      }, term, maxPerTable);
    },
    async explain(c: ConnectionPayload, query: string): Promise<ExplainResult> {
      const rows = await getDb(c).raw(`EXPLAIN QUERY PLAN ${query}`);
      return { raw: { type: 'sqlite-qp', nodes: Array.isArray(rows) ? rows : [] } };
    },
  };

  return adapter;
}
