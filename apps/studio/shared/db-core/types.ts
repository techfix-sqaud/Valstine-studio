// Shared, capability-based database adapter contract used by both the Electron
// IPC layer (electron/db-ipc.ts / .cts) and the web server (server/index.ts).
// Keep this file free of driver imports (knex, mongodb, cassandra-driver, ioredis,
// firebase-admin, better-sqlite3, bun:sqlite) so it stays safe to import from src/.

export type DBType =
  | 'pg' | 'mysql' | 'sqlite' | 'mssql'
  | 'cassandra' | 'mongodb' | 'firebase' | 'redis';

export type QueryLanguage = 'sql' | 'cql' | 'mongo-shell' | 'firestore-query' | 'redis-command';
export type ResultShape = 'tabular' | 'document' | 'key-value';

export interface DbCapabilities {
  queryLanguage: QueryLanguage;
  resultShape: ResultShape;
  supportsDatabases: boolean;
  supportsSchemas: boolean;
  supportsTables: boolean;       // false = flat namespace (Redis)
  tableLabel: string;            // "Table" | "Collection" | "Keyspace Table"
  supportsColumns: boolean;      // fixed, introspectable-ahead-of-query columns
  supportsIndexes: boolean;
  supportsFunctions: boolean;
  supportsTriggers: boolean;
  supportsSequences: boolean;
  supportsExplain: boolean;
  supportsSchemaDiff: boolean;
  supportsSearch: boolean;
  supportsProvisioning: boolean; // can ProvisionDialog spin up a local Docker instance
  connectionFormVariant: 'host-port' | 'file' | 'contact-points' | 'service-account';
}

export interface ConnectionPayload {
  type: DBType;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  filename?: string;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
  // Cassandra (Phase 1): contact points (host list) + the datacenter the driver's
  // load-balancing policy should prefer. `database` doubles as the keyspace name.
  contactPoints?: string[];
  localDataCenter?: string;
  // MongoDB/Redis: full connection URI, overrides host/port/user/password when set.
  connectionString?: string;
  // Redis: numbered logical database (0-15).
  dbIndex?: number;
  // Firebase: pasted service-account JSON key + the project id it belongs to.
  serviceAccountJson?: string;
  projectId?: string;
}

export interface NormalizedResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  status: 'success' | 'error';
  message?: string;
  resultShape?: ResultShape;
}

export interface TableInfo {
  name: string;
  schema: string;
  type: 'table' | 'view';
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  columns: string;
}

export interface SchemaIndexInfo {
  name: string;
  tableName: string;
  unique: boolean;
  columns: string;
}

export interface FunctionInfo {
  name: string;
  kind: 'FUNCTION' | 'PROCEDURE';
  returnType: string;
  language: string;
}

export interface TriggerInfo {
  name: string;
  tableName: string;
  event: string;
  timing: string;
}

export interface SchemaSnapshot {
  database: string;
  tables: {
    schema: string;
    name: string;
    columns: ColumnInfo[];
  }[];
}

export interface SchemaDiffEntry {
  type: 'table_added' | 'table_removed' | 'column_added' | 'column_removed' | 'column_changed';
  schema: string;
  table: string;
  column?: string;
  details?: string;
  migrationUp?: string;
  migrationDown?: string;
}

export interface SearchMatch {
  schema: string;
  table: string;
  column: string;
  rows: Record<string, unknown>[];
}

export interface ExplainResult {
  raw: unknown;
  [key: string]: unknown;
}

// Duck-typed handle every SQL adapter's connection pool deals in. Knex satisfies
// this directly; the sqlite adapter's injected driver (bun:sqlite on the server,
// better-sqlite3-via-knex in Electron) is wrapped to satisfy it too.
export interface DbHandle {
  raw(sql: string, bindings?: unknown): Promise<any>;
  destroy(): unknown;
}

export interface DbAdapter {
  type: DBType;
  capabilities: DbCapabilities;

  testConnection(c: ConnectionPayload): Promise<{ ok: boolean; error?: string }>;
  disconnect(c: ConnectionPayload): Promise<void>;
  execute(c: ConnectionPayload, query: string): Promise<NormalizedResult>;

  listDatabases(c: ConnectionPayload): Promise<string[]>;
  listSchemas(c: ConnectionPayload): Promise<string[]>;
  listTables(c: ConnectionPayload, schema?: string): Promise<TableInfo[]>;
  listColumns(c: ConnectionPayload, table: string, schema?: string): Promise<ColumnInfo[]>;
  getRowCount(c: ConnectionPayload, table: string, schema?: string): Promise<number>;
  listIndexes(c: ConnectionPayload, table: string, schema?: string): Promise<IndexInfo[]>;
  listSchemaIndexes(c: ConnectionPayload, schema?: string): Promise<SchemaIndexInfo[]>;
  listFunctions(c: ConnectionPayload, schema?: string): Promise<FunctionInfo[]>;
  listTriggers(c: ConnectionPayload, schema?: string): Promise<TriggerInfo[]>;
  listSequences(c: ConnectionPayload, schema?: string): Promise<string[]>;

  createDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }>;
  dropDatabase(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }>;
  createSchema(c: ConnectionPayload, name: string): Promise<{ ok: boolean; error?: string }>;
  dropTable(c: ConnectionPayload, table: string, schema?: string): Promise<void>;
  truncateTable(c: ConnectionPayload, table: string, schema?: string): Promise<void>;

  snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot>;
  search(c: ConnectionPayload, term: string, maxPerTable?: number): Promise<SearchMatch[]>;
  explain(c: ConnectionPayload, query: string): Promise<ExplainResult>;
}
