import Redis from 'ioredis';
import { snapshotSchemaGeneric, searchGeneric } from '../generic.js';
import type {
  ColumnInfo, ConnectionPayload, DbAdapter, DbCapabilities, ExplainResult,
  FunctionInfo, IndexInfo, NormalizedResult, SchemaIndexInfo, SchemaSnapshot,
  SearchMatch, TableInfo, TriggerInfo,
} from '../types.js';

const capabilities: DbCapabilities = {
  queryLanguage: 'redis-command',
  resultShape: 'key-value',
  supportsDatabases: false,  // selection happens via dbIndex, not a listable set
  supportsSchemas: false,
  supportsTables: true,      // pseudo-tables: keys grouped by prefix before the first ':'
  tableLabel: 'Key Group',
  supportsColumns: false,
  supportsIndexes: false,
  supportsFunctions: false,
  supportsTriggers: false,
  supportsSequences: false,
  supportsExplain: false,
  supportsSchemaDiff: false,
  supportsSearch: true,
  supportsProvisioning: false,
  connectionFormVariant: 'host-port',
};

const SCAN_CAP = 2000;
const CATCH_ALL_GROUP = 'keys';

const pool = new Map<string, Redis>();

function connectionKey(c: ConnectionPayload): string {
  return c.connectionString
    ? `redis-uri://${c.connectionString}`
    : `redis://${c.host ?? 'localhost'}:${c.port ?? 6379}/${c.dbIndex ?? 0}`;
}

function getClient(c: ConnectionPayload): Redis {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;
  const client = c.connectionString
    ? new Redis(c.connectionString, { lazyConnect: true, maxRetriesPerRequest: 1 })
    : new Redis({
        host: c.host ?? 'localhost',
        port: c.port ?? 6379,
        password: c.password || undefined,
        db: c.dbIndex ?? 0,
        tls: c.ssl ? { rejectUnauthorized: c.sslRejectUnauthorized ?? true } : undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
  pool.set(key, client);
  return client;
}

async function destroyClient(c: ConnectionPayload): Promise<void> {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) {
    existing.disconnect();
    pool.delete(key);
  }
}

function groupOf(key: string): string {
  const idx = key.indexOf(':');
  return idx === -1 ? CATCH_ALL_GROUP : key.slice(0, idx);
}

// Cursor-based SCAN — never KEYS * (which blocks the whole server on large keyspaces).
async function scanKeys(client: Redis, match: string | undefined, cap: number): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = match
      ? await client.scan(cursor, 'MATCH', match, 'COUNT', 500)
      : await client.scan(cursor, 'COUNT', 500);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0' && keys.length < cap);
  return keys.slice(0, cap);
}

async function testConnection(c: ConnectionPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getClient(c);
    if (client.status !== 'ready') await client.connect();
    await client.ping();
    return { ok: true };
  } catch (err: any) {
    await destroyClient(c);
    return { ok: false, error: err.message ?? String(err) };
  }
}

async function disconnect(c: ConnectionPayload): Promise<void> {
  await destroyClient(c);
}

// Query text is a single raw Redis command line, e.g. "GET foo" or "HGETALL bar".
async function execute(c: ConnectionPayload, query: string): Promise<NormalizedResult> {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error('Enter a Redis command, e.g. GET mykey');
  const [cmd, ...args] = parts;
  const client = getClient(c);
  if (client.status !== 'ready') await client.connect();
  const result = await client.call(cmd, ...args);
  const rows = Array.isArray(result)
    ? result.map((v, i) => ({ index: i, value: v }))
    : [{ value: result }];
  const columns = Array.isArray(result) ? ['index', 'value'] : ['value'];
  return { columns, rows, rowCount: rows.length, status: 'success', resultShape: 'key-value' };
}

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  return [String(c.dbIndex ?? 0)];
}

async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  return [String(c.dbIndex ?? 0)];
}

async function listTables(c: ConnectionPayload, _schema?: string): Promise<TableInfo[]> {
  const client = getClient(c);
  if (client.status !== 'ready') await client.connect();
  const keys = await scanKeys(client, undefined, SCAN_CAP);
  const groups = new Set<string>();
  for (const key of keys) groups.add(groupOf(key));
  return Array.from(groups).sort().map((name) => ({ name, schema: String(c.dbIndex ?? 0), type: 'table' as const }));
}

async function listColumns(_c: ConnectionPayload, _tableName: string, _schema?: string): Promise<ColumnInfo[]> {
  return [
    { name: 'key', type: 'string', nullable: false, primaryKey: true, defaultValue: null },
    { name: 'value', type: 'mixed', nullable: true, primaryKey: false, defaultValue: null },
    { name: 'ttl', type: 'number', nullable: true, primaryKey: false, defaultValue: null },
  ];
}

async function getRowCount(c: ConnectionPayload, tableName: string, _schema?: string): Promise<number> {
  try {
    const client = getClient(c);
    if (client.status !== 'ready') await client.connect();
    const match = tableName === CATCH_ALL_GROUP ? undefined : `${tableName}:*`;
    const keys = await scanKeys(client, match, SCAN_CAP);
    return keys.length;
  } catch {
    return -1;
  }
}

async function listIndexes(_c: ConnectionPayload, _tableName: string, _schema?: string): Promise<IndexInfo[]> {
  return [];
}

async function listSchemaIndexes(_c: ConnectionPayload, _schema?: string): Promise<SchemaIndexInfo[]> {
  return [];
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

async function createDatabase(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Not supported for this database type' };
}

async function dropDatabase(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Not supported for this database type' };
}

async function createSchema(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Not supported for this database type' };
}

async function dropTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  const client = getClient(c);
  if (client.status !== 'ready') await client.connect();
  const match = table === CATCH_ALL_GROUP ? undefined : `${table}:*`;
  const keys = await scanKeys(client, match, SCAN_CAP);
  if (keys.length > 0) await client.del(...keys);
}

async function truncateTable(c: ConnectionPayload, table: string, schema?: string): Promise<void> {
  await dropTable(c, table, schema);
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  return snapshotSchemaGeneric(c, redisAdapter, onlySchema);
}

async function search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
  return searchGeneric(c, redisAdapter, async (_schema, table, _cols, t, limit) => {
    const client = getClient(c);
    if (client.status !== 'ready') await client.connect();
    const match = table === CATCH_ALL_GROUP ? undefined : `${table}:*`;
    const keys = await scanKeys(client, match, 200);
    const needle = t.toLowerCase();
    const matches: Record<string, unknown>[] = [];
    for (const key of keys) {
      if (matches.length >= limit) break;
      const value = await client.get(key).catch(() => null);
      if (value !== null && value.toLowerCase().includes(needle)) {
        matches.push({ key, value });
      }
    }
    return matches;
  }, term, maxPerTable);
}

async function explain(_c: ConnectionPayload, _query: string): Promise<ExplainResult> {
  throw new Error('EXPLAIN is not supported for Redis connections');
}

export const redisAdapter: DbAdapter = {
  type: 'redis',
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
