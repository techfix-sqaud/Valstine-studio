import { createHash } from 'node:crypto';
import { cert, getApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { snapshotSchemaGeneric, searchGeneric } from '../generic.js';
import type {
  ColumnInfo, ConnectionPayload, DbAdapter, DbCapabilities, ExplainResult,
  FunctionInfo, IndexInfo, NormalizedResult, SchemaIndexInfo, SchemaSnapshot,
  SearchMatch, TableInfo, TriggerInfo,
} from '../types.js';

const capabilities: DbCapabilities = {
  queryLanguage: 'firestore-query',
  resultShape: 'document',
  supportsDatabases: false, // single logical database per project in this pass
  supportsSchemas: false,
  supportsTables: true,
  tableLabel: 'Collection',
  supportsColumns: true,    // inferred from a document sample
  supportsIndexes: false,
  supportsFunctions: false,
  supportsTriggers: false,
  supportsSequences: false,
  supportsExplain: false,
  supportsSchemaDiff: false,
  supportsSearch: true,
  supportsProvisioning: false,
  connectionFormVariant: 'service-account',
};

const SAMPLE_SIZE = 50;
const apps = new Map<string, Firestore>();

function appName(c: ConnectionPayload): string {
  const hash = createHash('sha256').update(c.serviceAccountJson ?? '').digest('hex').slice(0, 16);
  return `valstine-${hash}`;
}

function getFirestoreClient(c: ConnectionPayload): Firestore {
  const name = appName(c);
  const existing = apps.get(name);
  if (existing) return existing;
  if (!c.serviceAccountJson) throw new Error('Service account JSON is required for Firebase connections');
  let credentials: any;
  try {
    credentials = JSON.parse(c.serviceAccountJson);
  } catch {
    throw new Error('Service account JSON is not valid JSON');
  }
  let app: App;
  try {
    app = getApp(name);
  } catch {
    app = initializeApp({ credential: cert(credentials), projectId: c.projectId || credentials.project_id }, name);
  }
  const firestore = getFirestore(app);
  apps.set(name, firestore);
  return firestore;
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object' && typeof (value as any).toDate === 'function') return 'timestamp';
  return typeof value;
}

async function testConnection(c: ConnectionPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getFirestoreClient(c);
    await db.listCollections();
    return { ok: true };
  } catch (err: any) {
    apps.delete(appName(c));
    return { ok: false, error: err.message ?? String(err) };
  }
}

async function disconnect(c: ConnectionPayload): Promise<void> {
  apps.delete(appName(c));
}

// Structured operation format (not free-form JS): {"collection":"users","operation":"get"}
// or {"collection":"users","operation":"where","filters":[["age",">=",18]],"limit":100}
async function execute(c: ConnectionPayload, query: string): Promise<NormalizedResult> {
  let op: any;
  try {
    op = JSON.parse(query);
  } catch {
    throw new Error('Firestore queries must be JSON, e.g. {"collection":"users","operation":"get"}');
  }
  if (!op.collection || typeof op.collection !== 'string') {
    throw new Error('Query JSON must include a "collection" field');
  }
  const db = getFirestoreClient(c);
  let ref: FirebaseFirestore.Query = db.collection(op.collection);
  if (op.operation === 'where' && Array.isArray(op.filters)) {
    for (const [field, opStr, value] of op.filters) {
      ref = ref.where(field, opStr, value);
    }
  }
  const limit = op.limit ?? 100;
  const snapshot = await ref.limit(limit).get();
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return { columns, rows, rowCount: rows.length, status: 'success', resultShape: 'document' };
}

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  return [c.projectId || '(default)'];
}

async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  return [c.projectId || '(default)'];
}

async function listTables(c: ConnectionPayload, _schema?: string): Promise<TableInfo[]> {
  const db = getFirestoreClient(c);
  const collections = await db.listCollections();
  return collections.map((col) => ({ name: col.id, schema: c.projectId || '(default)', type: 'table' as const }));
}

async function listColumns(c: ConnectionPayload, tableName: string, _schema?: string): Promise<ColumnInfo[]> {
  const db = getFirestoreClient(c);
  const snapshot = await db.collection(tableName).limit(SAMPLE_SIZE).get();
  const fieldTypes = new Map<string, string>();
  for (const doc of snapshot.docs) {
    for (const [key, value] of Object.entries(doc.data())) {
      if (!fieldTypes.has(key)) fieldTypes.set(key, inferType(value));
    }
  }
  return Array.from(fieldTypes.entries()).map(([name, type]) => ({
    name,
    type,
    nullable: true,
    primaryKey: false,
    defaultValue: null,
  }));
}

async function getRowCount(c: ConnectionPayload, tableName: string, _schema?: string): Promise<number> {
  try {
    const db = getFirestoreClient(c);
    const result = await db.collection(tableName).count().get();
    return result.data().count;
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

// Deletes top-level documents only — recursive subcollection delete is out of scope.
async function deleteAllDocs(db: Firestore, table: string): Promise<void> {
  const snapshot = await db.collection(table).limit(500).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  for (const doc of snapshot.docs) batch.delete(doc.ref);
  await batch.commit();
  if (snapshot.size === 500) await deleteAllDocs(db, table);
}

async function dropTable(c: ConnectionPayload, table: string, _schema?: string): Promise<void> {
  await deleteAllDocs(getFirestoreClient(c), table);
}

async function truncateTable(c: ConnectionPayload, table: string, schema?: string): Promise<void> {
  await dropTable(c, table, schema);
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  return snapshotSchemaGeneric(c, firebaseAdapter, onlySchema);
}

async function search(c: ConnectionPayload, term: string, maxPerTable = 5): Promise<SearchMatch[]> {
  return searchGeneric(c, firebaseAdapter, async (_schema, table, cols, t, limit) => {
    const db = getFirestoreClient(c);
    const snapshot = await db.collection(table).limit(200).get();
    const needle = t.toLowerCase();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((row) => cols.some((col) => String((row as any)[col.name] ?? '').toLowerCase().includes(needle)))
      .slice(0, limit);
  }, term, maxPerTable);
}

async function explain(_c: ConnectionPayload, _query: string): Promise<ExplainResult> {
  throw new Error('EXPLAIN is not supported for Firebase connections');
}

export const firebaseAdapter: DbAdapter = {
  type: 'firebase',
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
