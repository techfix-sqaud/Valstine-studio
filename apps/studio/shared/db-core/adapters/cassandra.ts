import { Client } from 'cassandra-driver';
import { validateIdentifier } from '../sql-utils.js';
import { snapshotSchemaGeneric, searchGeneric } from '../generic.js';
import type {
  ColumnInfo, ConnectionPayload, DbAdapter, DbCapabilities, ExplainResult,
  FunctionInfo, IndexInfo, NormalizedResult, SchemaIndexInfo, SchemaSnapshot,
  SearchMatch, TableInfo, TriggerInfo,
} from '../types.js';

const capabilities: DbCapabilities = {
  queryLanguage: 'cql',
  resultShape: 'tabular',
  supportsDatabases: true,   // "database" = keyspace
  supportsSchemas: false,    // no level between keyspace and table
  supportsTables: true,
  tableLabel: 'Table',
  supportsColumns: true,
  supportsIndexes: true,
  supportsFunctions: false,
  supportsTriggers: false,
  supportsSequences: false,
  supportsExplain: false,    // CQL has no EXPLAIN equivalent surfaced here
  supportsSchemaDiff: true,
  supportsSearch: true,
  supportsProvisioning: true,
  connectionFormVariant: 'contact-points',
};

const pool = new Map<string, Client>();

function connectionKey(c: ConnectionPayload): string {
  const points = (c.contactPoints ?? [c.host ?? 'localhost']).join(',');
  return `cassandra://${c.user ?? ''}@${points}/${c.database}?dc=${c.localDataCenter ?? ''}`;
}

function getClient(c: ConnectionPayload): Client {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;
  const instance = new Client({
    contactPoints: c.contactPoints && c.contactPoints.length > 0 ? c.contactPoints : [c.host ?? 'localhost'],
    localDataCenter: c.localDataCenter || 'datacenter1',
    keyspace: c.database || undefined,
    credentials: c.user ? { username: c.user, password: c.password ?? '' } : undefined,
    protocolOptions: { port: c.port ?? 9042 },
    sslOptions: c.ssl ? { rejectUnauthorized: c.sslRejectUnauthorized ?? true } : undefined,
  });
  pool.set(key, instance);
  return instance;
}

async function destroyClient(c: ConnectionPayload): Promise<void> {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) {
    await existing.shutdown();
    pool.delete(key);
  }
}

function rowToObject(row: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of row.keys()) out[key] = row.get(key);
  return out;
}

async function testConnection(c: ConnectionPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getClient(c);
    await client.connect();
    return { ok: true };
  } catch (err: any) {
    await destroyClient(c);
    return { ok: false, error: err.message ?? String(err) };
  }
}

async function disconnect(c: ConnectionPayload): Promise<void> {
  await destroyClient(c);
}

async function execute(c: ConnectionPayload, query: string): Promise<NormalizedResult> {
  const result = await getClient(c).execute(query, [], { prepare: false });
  const columns = result.columns?.map((col) => col.name) ?? [];
  const rows = (result.rows ?? []).map(rowToObject);
  if (rows.length === 0 && columns.length === 0) {
    return {
      columns: ['result'],
      rows: [{ result: result.wasApplied() ? 'Statement executed successfully' : 'Statement did not apply' }],
      rowCount: 1,
      status: 'success',
    };
  }
  return { columns, rows, rowCount: rows.length, status: 'success' };
}

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  const client = getClient(c);
  const result = await client.execute('SELECT keyspace_name FROM system_schema.keyspaces');
  return (result.rows ?? [])
    .map((r) => r.get('keyspace_name') as string)
    .filter((name) => !['system', 'system_auth', 'system_distributed', 'system_schema', 'system_traces'].includes(name))
    .sort();
}

// Cassandra has no level between keyspace and table — the keyspace itself
// stands in as the one "schema" so snapshotSchema/searchGeneric's walk still works.
async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  return [c.database];
}

async function listTables(c: ConnectionPayload, _schema?: string): Promise<TableInfo[]> {
  const client = getClient(c);
  const result = await client.execute(
    'SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?',
    [c.database],
    { prepare: true },
  );
  return (result.rows ?? []).map((r) => ({ name: r.get('table_name') as string, schema: c.database, type: 'table' as const }));
}

async function listColumns(c: ConnectionPayload, tableName: string, _schema?: string): Promise<ColumnInfo[]> {
  const client = getClient(c);
  const result = await client.execute(
    'SELECT column_name, type, kind FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
    [c.database, tableName],
    { prepare: true },
  );
  return (result.rows ?? []).map((r) => {
    const kind = r.get('kind') as string;
    const isKey = kind === 'partition_key' || kind === 'clustering';
    return {
      name: r.get('column_name') as string,
      type: r.get('type') as string,
      nullable: !isKey,
      primaryKey: isKey,
      defaultValue: null, // CQL has no column-level DEFAULT
    };
  });
}

async function getRowCount(c: ConnectionPayload, tableName: string, _schema?: string): Promise<number> {
  try {
    validateIdentifier(tableName, 'table name');
    const client = getClient(c);
    // COUNT(*) scans the whole table server-side — fine for the explorer's
    // informational row count, same tradeoff the SQL adapters already accept.
    const result = await client.execute(`SELECT COUNT(*) AS cnt FROM "${tableName}"`);
    return Number(result.rows?.[0]?.get('cnt') ?? 0);
  } catch {
    return -1;
  }
}

async function listIndexes(c: ConnectionPayload, tableName: string, _schema?: string): Promise<IndexInfo[]> {
  try {
    const client = getClient(c);
    const result = await client.execute(
      'SELECT index_name, options FROM system_schema.indexes WHERE keyspace_name = ? AND table_name = ?',
      [c.database, tableName],
      { prepare: true },
    );
    return (result.rows ?? []).map((r) => {
      const options = r.get('options') as Record<string, string> | undefined;
      return { name: r.get('index_name') as string, unique: false, columns: options?.target ?? '' };
    });
  } catch {
    return [];
  }
}

async function listSchemaIndexes(c: ConnectionPayload, _schema?: string): Promise<SchemaIndexInfo[]> {
  try {
    const client = getClient(c);
    const result = await client.execute(
      'SELECT table_name, index_name, options FROM system_schema.indexes WHERE keyspace_name = ?',
      [c.database],
      { prepare: true },
    );
    return (result.rows ?? []).map((r) => {
      const options = r.get('options') as Record<string, string> | undefined;
      return { name: r.get('index_name') as string, tableName: r.get('table_name') as string, unique: false, columns: options?.target ?? '' };
    });
  } catch {
    return [];
  }
}

async function listFunctions(_c: ConnectionPayload, _schema?: string): Promise<FunctionInfo[]> {
  return [];
}

async function listTriggers(_c: ConnectionPayload, _schema?: string): Promise<TriggerInfo[]> {
  return [];
}

async function listSequences(_c: ConnectionPayload, _schema?: string): Promise<string[]> {
  return [];
}

async function createDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'keyspace name');
  await getClient(c).execute(
    `CREATE KEYSPACE "${name}" WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}`,
  );
  return { ok: true };
}

async function dropDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  validateIdentifier(name, 'keyspace name');
  await getClient(c).execute(`DROP KEYSPACE "${name}"`);
  return { ok: true };
}

async function createSchema(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Not supported for this database type' };
}

async function dropTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  validateIdentifier(table, 'table name');
  await getClient(c).execute(`DROP TABLE "${table}"`);
}

async function truncateTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  validateIdentifier(table, 'table name');
  await getClient(c).execute(`TRUNCATE TABLE "${table}"`);
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  return snapshotSchemaGeneric(c, cassandraAdapter, onlySchema);
}

async function search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
  return searchGeneric(c, cassandraAdapter, async (_schema, table, cols, t, limit) => {
    // CQL has no cross-column OR/LIKE without ALLOW FILTERING per column and a
    // secondary index — scan the first page and filter client-side instead,
    // matching the "best-effort" spirit of the SQL adapters' search.
    const client = getClient(c);
    const result = await client.execute(`SELECT * FROM "${table}" LIMIT 200`);
    const needle = t.toLowerCase();
    const matches = (result.rows ?? [])
      .map(rowToObject)
      .filter((row) => cols.some((col) => String(row[col.name] ?? '').toLowerCase().includes(needle)));
    return matches.slice(0, limit);
  }, term, maxPerTable);
}

async function explain(_c: ConnectionPayload, _query: string): Promise<ExplainResult> {
  throw new Error('EXPLAIN is not supported for Cassandra connections');
}

export const cassandraAdapter: DbAdapter = {
  type: 'cassandra',
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
