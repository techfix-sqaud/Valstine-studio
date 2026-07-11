import { MongoClient } from 'mongodb';
import { snapshotSchemaGeneric, searchGeneric } from '../generic.js';
import type {
  ColumnInfo, ConnectionPayload, DbAdapter, DbCapabilities, ExplainResult,
  FunctionInfo, IndexInfo, NormalizedResult, SchemaIndexInfo, SchemaSnapshot,
  SearchMatch, TableInfo, TriggerInfo,
} from '../types.js';

const capabilities: DbCapabilities = {
  queryLanguage: 'mongo-shell',
  resultShape: 'document',
  supportsDatabases: true,
  supportsSchemas: false,   // Mongo has no level between database and collection
  supportsTables: true,
  tableLabel: 'Collection',
  supportsColumns: true,    // inferred from a document sample, not fixed ahead of time
  supportsIndexes: true,
  supportsFunctions: false,
  supportsTriggers: false,
  supportsSequences: false,
  supportsExplain: false,   // not surfaced in this pass
  supportsSchemaDiff: false,
  supportsSearch: true,
  supportsProvisioning: false,
  connectionFormVariant: 'host-port',
};

const SAMPLE_SIZE = 50;
const SYSTEM_DBS = new Set(['admin', 'local', 'config']);

const pool = new Map<string, MongoClient>();

function buildUri(c: ConnectionPayload): string {
  if (c.connectionString) return c.connectionString;
  const auth = c.user ? `${encodeURIComponent(c.user)}:${encodeURIComponent(c.password ?? '')}@` : '';
  const host = c.host ?? 'localhost';
  const port = c.port ?? 27017;
  return `mongodb://${auth}${host}:${port}/?directConnection=true`;
}

function connectionKey(c: ConnectionPayload): string {
  return c.connectionString ? `mongodb-uri://${c.connectionString}` : `mongodb://${c.user ?? ''}@${c.host}:${c.port}`;
}

async function getClient(c: ConnectionPayload): Promise<MongoClient> {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;
  const client = new MongoClient(buildUri(c), {
    tls: c.ssl ?? undefined,
    tlsAllowInvalidCertificates: c.ssl ? c.sslRejectUnauthorized === false : undefined,
  });
  await client.connect();
  pool.set(key, client);
  return client;
}

async function destroyClient(c: ConnectionPayload): Promise<void> {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) {
    await existing.close();
    pool.delete(key);
  }
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (typeof value === 'object' && (value as any)._bsontype === 'ObjectId') return 'ObjectId';
  return typeof value;
}

async function testConnection(c: ConnectionPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await getClient(c);
    await client.db(c.database || undefined).command({ ping: 1 });
    return { ok: true };
  } catch (err: any) {
    await destroyClient(c);
    return { ok: false, error: err.message ?? String(err) };
  }
}

async function disconnect(c: ConnectionPayload): Promise<void> {
  await destroyClient(c);
}

// Structured operation format (not free-form JS) so execute() never has to eval
// user input: {"collection":"users","operation":"find","filter":{},"limit":100}
async function execute(c: ConnectionPayload, query: string): Promise<NormalizedResult> {
  let op: any;
  try {
    op = JSON.parse(query);
  } catch {
    throw new Error('Mongo queries must be JSON, e.g. {"collection":"users","operation":"find","filter":{}}');
  }
  if (!op.collection || typeof op.collection !== 'string') {
    throw new Error('Query JSON must include a "collection" field');
  }
  const client = await getClient(c);
  const coll = client.db(c.database || undefined).collection(op.collection);
  const operation = op.operation ?? 'find';
  let docs: Record<string, unknown>[] = [];
  let message: string | undefined;

  switch (operation) {
    case 'find':
      docs = await coll.find(op.filter ?? {}, { projection: op.projection }).limit(op.limit ?? 100).toArray();
      break;
    case 'aggregate':
      docs = await coll.aggregate(op.pipeline ?? []).toArray();
      break;
    case 'countDocuments': {
      const count = await coll.countDocuments(op.filter ?? {});
      return { columns: ['count'], rows: [{ count }], rowCount: 1, status: 'success' };
    }
    case 'insertOne': {
      const r = await coll.insertOne(op.document ?? {});
      message = `Inserted document ${r.insertedId}`;
      docs = [{ insertedId: String(r.insertedId), acknowledged: r.acknowledged }];
      break;
    }
    case 'updateOne': {
      const r = await coll.updateOne(op.filter ?? {}, op.update ?? {});
      message = `Matched ${r.matchedCount}, modified ${r.modifiedCount}`;
      docs = [{ matchedCount: r.matchedCount, modifiedCount: r.modifiedCount }];
      break;
    }
    case 'deleteOne': {
      const r = await coll.deleteOne(op.filter ?? {});
      message = `Deleted ${r.deletedCount} document(s)`;
      docs = [{ deletedCount: r.deletedCount }];
      break;
    }
    default:
      throw new Error(`Unsupported Mongo operation: "${operation}"`);
  }

  const columns = Array.from(new Set(docs.flatMap((d) => Object.keys(d))));
  return { columns, rows: docs, rowCount: docs.length, status: 'success', message, resultShape: 'document' };
}

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  const client = await getClient(c);
  const { databases } = await client.db().admin().listDatabases();
  return databases.map((d) => d.name).filter((name) => !SYSTEM_DBS.has(name)).sort();
}

async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  return [c.database];
}

async function listTables(c: ConnectionPayload, _schema?: string): Promise<TableInfo[]> {
  const client = await getClient(c);
  const collections = await client.db(c.database || undefined).listCollections().toArray();
  return collections.map((col) => ({ name: col.name, schema: c.database, type: 'table' as const }));
}

async function listColumns(c: ConnectionPayload, tableName: string, _schema?: string): Promise<ColumnInfo[]> {
  const client = await getClient(c);
  const docs = await client.db(c.database || undefined).collection(tableName).find({}).limit(SAMPLE_SIZE).toArray();
  const fieldTypes = new Map<string, string>();
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      if (!fieldTypes.has(key)) fieldTypes.set(key, inferType(value));
    }
  }
  return Array.from(fieldTypes.entries()).map(([name, type]) => ({
    name,
    type,
    nullable: true,
    primaryKey: name === '_id',
    defaultValue: null,
  }));
}

async function getRowCount(c: ConnectionPayload, tableName: string, _schema?: string): Promise<number> {
  try {
    const client = await getClient(c);
    return await client.db(c.database || undefined).collection(tableName).estimatedDocumentCount();
  } catch {
    return -1;
  }
}

async function listIndexes(c: ConnectionPayload, tableName: string, _schema?: string): Promise<IndexInfo[]> {
  try {
    const client = await getClient(c);
    const indexes = await client.db(c.database || undefined).collection(tableName).indexes();
    return indexes.map((idx) => ({
      name: idx.name ?? '',
      unique: idx.unique === true,
      columns: Object.keys(idx.key ?? {}).join(', '),
    }));
  } catch {
    return [];
  }
}

async function listSchemaIndexes(c: ConnectionPayload, _schema?: string): Promise<SchemaIndexInfo[]> {
  try {
    const tables = await listTables(c);
    const out: SchemaIndexInfo[] = [];
    for (const t of tables) {
      const idxs = await listIndexes(c, t.name);
      for (const idx of idxs) out.push({ ...idx, tableName: t.name });
    }
    return out;
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
  // Mongo only materializes a database once it has a collection.
  const client = await getClient(c);
  await client.db(name).collection('_placeholder').insertOne({ createdAt: new Date() });
  return { ok: true };
}

async function dropDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }> {
  const client = await getClient(c);
  await client.db(name).dropDatabase();
  return { ok: true };
}

async function createSchema(_c: ConnectionPayload, _name: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Not supported for this database type' };
}

async function dropTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  const client = await getClient(c);
  await client.db(c.database || undefined).collection(table).drop();
}

async function truncateTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  const client = await getClient(c);
  await client.db(c.database || undefined).collection(table).deleteMany({});
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  return snapshotSchemaGeneric(c, mongodbAdapter, onlySchema);
}

async function search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
  return searchGeneric(c, mongodbAdapter, async (_schema, table, cols, t, limit) => {
    const client = await getClient(c);
    const needle = t.toLowerCase();
    const docs = await client.db(c.database || undefined).collection(table).find({}).limit(200).toArray();
    return docs
      .filter((doc) => cols.some((col) => String((doc as any)[col.name] ?? '').toLowerCase().includes(needle)))
      .slice(0, limit);
  }, term, maxPerTable);
}

async function explain(_c: ConnectionPayload, _query: string): Promise<ExplainResult> {
  throw new Error('EXPLAIN is not supported for MongoDB connections');
}

export const mongodbAdapter: DbAdapter = {
  type: 'mongodb',
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
