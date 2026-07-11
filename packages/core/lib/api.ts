import { DBConnection, DBType } from './mock-data';

const isElectron =
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

// Builds the full connection payload (used for test-connection on unsaved connections)
function toPayload(conn: DBConnection) {
  return {
    type: conn.type,
    host: conn.host || 'localhost',
    port: conn.port,
    database: conn.database,
    user: conn.user ?? '',
    password: conn.password ?? '',
    filename: conn.filename,
    ssl: conn.ssl ?? false,
    sslRejectUnauthorized: conn.sslRejectUnauthorized ?? true,
    contactPoints: conn.contactPoints,
    localDataCenter: conn.localDataCenter,
    connectionString: conn.connectionString,
    dbIndex: conn.dbIndex,
    serviceAccountJson: conn.serviceAccountJson,
    projectId: conn.projectId,
  };
}

// Returns either connectionId (for saved connections without password in state) or full inline payload.
// "temp" means the connection hasn't been saved yet — always send inline so the server doesn't look it up.
function toBody(conn: DBConnection): { connectionId: string } | { connection: ReturnType<typeof toPayload> } {
  if (conn.id !== "temp" && !conn.password) return { connectionId: conn.id };
  return { connection: toPayload(conn) };
}

// In Electron the renderer has no HTTP server — route through IPC instead.
// DB/Git operations go through electronAPI.dbQuery (action-based channel map).
// App-state operations (/api/app/*) go through electronAPI.appRequest (method+path).
async function ipcCall<T = any>(action: string, payload: unknown): Promise<T> {
  return (window as any).electronAPI.dbQuery(action, payload);
}

async function appRequestIpc<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  return (window as any).electronAPI.appRequest(method, path, body ?? null);
}

// App-state paths that should be routed through the dedicated appRequest IPC channel
// in Electron (not through the DB action map).
const APP_STATE_PREFIX = '/api/app/';

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (isElectron) {
    // App-state endpoints have a dedicated IPC handler with per-user SQLite storage
    if (path.startsWith(APP_STATE_PREFIX)) {
      return appRequestIpc<T>(method, path, body);
    }
    // DB / Git operations use the existing action-map channel
    const action = path.replace(/^\/api\//, '');
    return ipcCall<T>(action, body ?? {});
  }
  let res: Response;
  try {
    const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    res = await fetch(path, opts);
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  const text = await res.text();
  if (!text) throw new Error(`Server returned empty response (HTTP ${res.status})`);
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Server returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok && parsed.error) throw new Error(parsed.error);
  return parsed;
}

async function post<T = any>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

async function get<T = any>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export async function provisionDatabase(payload: {
  type: DBType;
  containerName?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  filename?: string;
}): Promise<{
  ok: boolean;
  connection?: { type: DBType; host: string; port: number; database: string; user: string; password: string; filename?: string };
  containerId?: string;
  error?: string;
}> {
  return post('/api/provision', payload);
}

export async function uploadSqliteFile(file: File): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (isElectron) throw new Error("File upload not supported in Electron mode");
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/upload-sqlite", { method: "POST", body: form });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }
  const text = await res.text();
  if (!text) throw new Error(`Server returned empty response (HTTP ${res.status})`);
  return JSON.parse(text);
}

export async function testConnection(conn: DBConnection): Promise<{ ok: boolean; error?: string }> {
  // Use connectionId when available so the server resolves the encrypted password from SQLite.
  // Fall back to full payload only for unsaved/in-memory connections (password present in state).
  return post('/api/test-connection', toBody(conn));
}

export async function disconnectConnection(conn: DBConnection): Promise<{ ok: boolean }> {
  return post('/api/disconnect', toBody(conn));
}

export async function executeQuery(conn: DBConnection, query: string) {
  return post('/api/execute', { ...toBody(conn), query });
}

export async function fetchDatabases(conn: DBConnection): Promise<string[]> {
  const r = await post<{ databases: string[] }>('/api/databases', toBody(conn));
  return r.databases ?? [];
}

export async function fetchSchemas(conn: DBConnection): Promise<string[]> {
  const r = await post<{ schemas: string[] }>('/api/schemas', toBody(conn));
  return r.schemas ?? [];
}

export interface RemoteTableInfo {
  name: string;
  schema: string;
  type: 'table' | 'view';
}

export async function fetchTables(conn: DBConnection, schema?: string): Promise<RemoteTableInfo[]> {
  const r = await post<{ tables: RemoteTableInfo[] }>('/api/tables', { ...toBody(conn), schema });
  return r.tables ?? [];
}

export interface RemoteColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
}

export async function fetchColumns(conn: DBConnection, table: string, schema?: string): Promise<RemoteColumnInfo[]> {
  const r = await post<{ columns: RemoteColumnInfo[] }>('/api/columns', { ...toBody(conn), table, schema });
  return r.columns ?? [];
}

export async function fetchRowCount(conn: DBConnection, table: string, schema?: string): Promise<number> {
  const r = await post<{ count: number }>('/api/row-count', { ...toBody(conn), table, schema });
  return r.count ?? -1;
}

export interface RemoteIndexInfo {
  name: string;
  unique: boolean;
  columns: string;
}

export async function fetchIndexes(conn: DBConnection, table: string, schema?: string): Promise<RemoteIndexInfo[]> {
  const r = await post<{ indexes: RemoteIndexInfo[] }>('/api/indexes', { ...toBody(conn), table, schema });
  return r.indexes ?? [];
}

export interface RemoteSchemaIndexInfo {
  name: string;
  tableName: string;
  unique: boolean;
  columns: string;
}

export async function fetchSchemaIndexes(conn: DBConnection, schema?: string): Promise<RemoteSchemaIndexInfo[]> {
  const r = await post<{ indexes: RemoteSchemaIndexInfo[] }>('/api/schema-indexes', { ...toBody(conn), schema });
  return r.indexes ?? [];
}

export interface RemoteFunctionInfo {
  name: string;
  kind: 'FUNCTION' | 'PROCEDURE';
  returnType: string;
  language: string;
}

export async function fetchFunctions(conn: DBConnection, schema?: string): Promise<RemoteFunctionInfo[]> {
  const r = await post<{ functions: RemoteFunctionInfo[] }>('/api/functions', { ...toBody(conn), schema });
  return r.functions ?? [];
}

export interface RemoteTriggerInfo {
  name: string;
  tableName: string;
  event: string;
  timing: string;
}

export async function fetchTriggers(conn: DBConnection, schema?: string): Promise<RemoteTriggerInfo[]> {
  const r = await post<{ triggers: RemoteTriggerInfo[] }>('/api/triggers', { ...toBody(conn), schema });
  return r.triggers ?? [];
}

export async function fetchSequences(conn: DBConnection, schema?: string): Promise<string[]> {
  const r = await post<{ sequences: string[] }>('/api/sequences', { ...toBody(conn), schema });
  return r.sequences ?? [];
}

export async function createDatabase(conn: DBConnection, name: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/create-database', { ...toBody(conn), name });
}

export async function dropDatabase(conn: DBConnection, name: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/drop-database', { ...toBody(conn), name });
}

export async function dropTable(conn: DBConnection, table: string, schema?: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/drop-table', { ...toBody(conn), table, schema });
}

export async function truncateTable(conn: DBConnection, table: string, schema?: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/truncate-table', { ...toBody(conn), table, schema });
}

export async function createSchema(conn: DBConnection, name: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/create-schema', { ...toBody(conn), name });
}

// ─── Schema comparison ───

export interface SchemaDiffEntry {
  type: 'table_added' | 'table_removed' | 'column_added' | 'column_removed' | 'column_changed';
  schema: string;
  table: string;
  column?: string;
  details?: string;
  migrationUp?: string;
  migrationDown?: string;
}

// Exported data shape stored in a diff tab (see @valstine/core/store/app-store and apps/studio's SchemaDiffView).
export interface SchemaDiffData {
  diffs: SchemaDiffEntry[];
  migrationUp: string;
  migrationDown: string;
  sourceLabel: string;
  targetLabel: string;
}

export interface SchemaDiffResult {
  ok: boolean;
  diffs: SchemaDiffEntry[];
  migrationUp: string;
  migrationDown: string;
  source: string;
  target: string;
  error?: string;
}

export async function schemaDiff(
  source: DBConnection,
  target: DBConnection,
  sourceSchema?: string,
  targetSchema?: string,
  sourceDatabaseOverride?: string,
  targetDatabaseOverride?: string,
): Promise<SchemaDiffResult> {
  return post('/api/schema-diff', {
    ...( source.password ? { source: toPayload(source) } : { sourceConnectionId: source.id }),
    ...( target.password ? { target: toPayload(target) } : { targetConnectionId: target.id }),
    sourceSchema,
    targetSchema,
    sourceDatabase: sourceDatabaseOverride,
    targetDatabase: targetDatabaseOverride,
  });
}

export async function explainQuery(
  conn: DBConnection,
  query: string,
): Promise<{ ok: boolean; plan: any; dbType: string; error?: string }> {
  return post('/api/explain', { ...toBody(conn), query });
}

export interface SearchResult {
  schema: string;
  table: string;
  column: string;
  rows: Record<string, unknown>[];
}

export async function searchDatabase(
  conn: DBConnection,
  term: string,
  maxPerTable = 5,
): Promise<{ ok: boolean; results: SearchResult[]; term: string; error?: string }> {
  return post('/api/search', { ...toBody(conn), term, maxPerTable });
}

// ─── Git ───

export interface GitFileStatus {
  status: string;
  path: string;
}

export interface GitStatus {
  ok: boolean;
  branch: string;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
  error?: string;
}

export async function gitStatus(): Promise<GitStatus> {
  return get('/api/git/status');
}

export async function gitBranches(): Promise<{ ok: boolean; branches: string[]; current: string; error?: string }> {
  return get('/api/git/branches');
}

export async function gitDiff(file?: string): Promise<{ ok: boolean; diff: string; stagedDiff: string; error?: string }> {
  return post('/api/git/diff', { file });
}

export async function gitStage(files: string[]): Promise<{ ok: boolean; error?: string }> {
  return post('/api/git/stage', { files });
}

export async function gitUnstage(files: string[]): Promise<{ ok: boolean; error?: string }> {
  return post('/api/git/unstage', { files });
}

export async function gitCommit(message: string): Promise<{ ok: boolean; result?: string; error?: string }> {
  return post('/api/git/commit', { message });
}

export async function gitPush(branch?: string, setUpstream?: boolean): Promise<{ ok: boolean; result?: string; error?: string }> {
  return post('/api/git/push', { branch, setUpstream });
}

export async function gitCheckout(branch: string, create?: boolean): Promise<{ ok: boolean; result?: string; error?: string }> {
  return post('/api/git/checkout', { branch, create });
}

export async function gitCreatePR(title: string, body?: string, base?: string): Promise<{ ok: boolean; prUrl?: string; branch?: string; error?: string }> {
  return post('/api/git/create-pr', { title, body, base });
}

export async function gitLog(limit?: number): Promise<{ ok: boolean; commits: { hash: string; message: string; author: string; date: string }[]; error?: string }> {
  return post('/api/git/log', { limit });
}

export async function gitPull(): Promise<{ ok: boolean; result?: string; error?: string }> {
  return post('/api/git/pull', {});
}

export async function gitAddRemote(name: string, remoteUrl: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/git/add-remote', { name, url: remoteUrl });
}

export async function gitInit(cwd?: string): Promise<{ ok: boolean; result?: string; cwd?: string; error?: string }> {
  return post('/api/git/init', { cwd });
}

// ─── GitHub proxy (server-side for clone; direct GitHub API calls go through github.ts) ───

export async function githubClone(repoUrl: string, targetDir?: string): Promise<{ ok: boolean; clonedTo?: string; result?: string; error?: string }> {
  return post('/api/github/clone', { repoUrl, targetDir });
}

export async function githubSchemaSql(conn: DBConnection): Promise<{ ok: boolean; sql?: string; tableCount?: number; error?: string }> {
  return post('/api/github/schema-sql', toBody(conn));
}

// ─── App state (SQLite-backed, replaces localStorage) ───

export async function appGetConnections(): Promise<DBConnection[]> {
  const r = await get<{ ok: boolean; connections: DBConnection[] }>('/api/app/connections');
  return r.connections ?? [];
}

export async function appSaveConnection(conn: DBConnection): Promise<{ ok: boolean; id?: string; error?: string }> {
  return post('/api/app/connections', conn);
}

export async function appUpdateConnection(conn: DBConnection): Promise<{ ok: boolean; error?: string }> {
  return request('PUT', `/api/app/connections/${conn.id}`, conn);
}

export async function appDeleteConnection(id: string): Promise<{ ok: boolean; error?: string }> {
  return request('DELETE', `/api/app/connections/${id}`);
}

export async function appGetSettings(): Promise<Record<string, any>> {
  const r = await get<{ ok: boolean; settings: Record<string, any> }>('/api/app/settings');
  return r.settings ?? {};
}

export async function appUpdateSettings(settings: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  return request('PUT', '/api/app/settings', settings);
}

export async function appGetHistory(): Promise<any[]> {
  const r = await get<{ ok: boolean; history: any[] }>('/api/app/history');
  return r.history ?? [];
}

export async function appAddHistoryEntry(entry: any): Promise<{ ok: boolean; error?: string }> {
  return post('/api/app/history', entry);
}

export async function appDeleteHistoryEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  return request('DELETE', `/api/app/history/${id}`);
}

export async function appClearHistory(): Promise<{ ok: boolean; error?: string }> {
  return request('DELETE', '/api/app/history');
}

// ─── ApiTester persistence (replaces localStorage) ───

export interface SavedApiRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: string;
  savedAt: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  description: string;
  sql: string;
  tags: string[];
  connectionType: string;
  savedAt: string;
}

export async function appGetSavedQueries(): Promise<SavedQuery[]> {
  const r = await get<{ ok: boolean; queries: SavedQuery[] }>('/api/app/saved-queries');
  return r.queries ?? [];
}

export async function appSaveQuery(q: Omit<SavedQuery, 'id' | 'savedAt'> & { id?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  return post('/api/app/saved-queries', q);
}

export async function appDeleteSavedQuery(id: string): Promise<{ ok: boolean; error?: string }> {
  return request('DELETE', `/api/app/saved-queries/${id}`);
}

export async function appGetApiRequests(): Promise<SavedApiRequest[]> {
  const r = await get<{ ok: boolean; requests: SavedApiRequest[] }>('/api/app/api-requests');
  return r.requests ?? [];
}

export async function appSaveApiRequest(req: SavedApiRequest): Promise<{ ok: boolean; id?: string; error?: string }> {
  return post('/api/app/api-requests', req);
}

export async function appDeleteApiRequest(id: string): Promise<{ ok: boolean; error?: string }> {
  return request('DELETE', `/api/app/api-requests/${id}`);
}

// Builds a display/copy connection string for the "Copy Connection String"
// context-menu actions in ConnectionsList.tsx and DatabaseExplorer.tsx.
export function buildConnectionStringDisplay(conn: DBConnection): string {
  if (conn.type === 'sqlite') return conn.filename ?? conn.database;
  if (conn.type === 'firebase') return conn.projectId ?? '(no project id set)';
  if (conn.connectionString) return conn.connectionString;
  if (conn.type === 'cassandra') {
    const host = conn.contactPoints?.join(',') ?? conn.host;
    return `cassandra://${conn.user ? conn.user + '@' : ''}${host}/${conn.database}`;
  }
  if (conn.type === 'redis') {
    return `redis://${conn.user ? conn.user + '@' : ''}${conn.host}:${conn.port}/${conn.dbIndex ?? 0}`;
  }
  const scheme = conn.type === 'pg' ? 'postgresql' : conn.type;
  return `${scheme}://${conn.user ? conn.user + '@' : ''}${conn.host}:${conn.port}/${conn.database}`;
}

export const DB_TYPE_META: Record<DBType, { label: string; defaultPort: number; icon: string; color: string }> = {
  pg: { label: 'PostgreSQL', defaultPort: 5432, icon: '🐘', color: 'text-blue-400' },
  mysql: { label: 'MySQL', defaultPort: 3306, icon: '🐬', color: 'text-orange-400' },
  sqlite: { label: 'SQLite', defaultPort: 0, icon: '📦', color: 'text-cyan-400' },
  mssql: { label: 'SQL Server', defaultPort: 1433, icon: '🔷', color: 'text-red-400' },
  cassandra: { label: 'Cassandra', defaultPort: 9042, icon: '🌀', color: 'text-purple-400' },
  mongodb: { label: 'MongoDB', defaultPort: 27017, icon: '🍃', color: 'text-green-400' },
  firebase: { label: 'Firebase', defaultPort: 443, icon: '🔥', color: 'text-amber-400' },
  redis: { label: 'Redis', defaultPort: 6379, icon: '🟥', color: 'text-rose-400' },
};

// Per-type UI capabilities — kept in sync with each DbAdapter's `capabilities`
// in shared/db-core/adapters/*.ts (duplicated here since shared/db-core isn't
// imported by the frontend bundle; see Phase 0 plan notes for why).
export const DB_TYPE_CAPABILITIES: Record<DBType, {
  supportsSchemas: boolean;
  supportsFunctions: boolean;
  supportsTriggers: boolean;
  supportsSequences: boolean;
  supportsExplain: boolean;
}> = {
  pg: { supportsSchemas: true, supportsFunctions: true, supportsTriggers: true, supportsSequences: true, supportsExplain: true },
  mysql: { supportsSchemas: true, supportsFunctions: true, supportsTriggers: true, supportsSequences: false, supportsExplain: true },
  sqlite: { supportsSchemas: true, supportsFunctions: false, supportsTriggers: true, supportsSequences: false, supportsExplain: true },
  mssql: { supportsSchemas: true, supportsFunctions: true, supportsTriggers: true, supportsSequences: false, supportsExplain: true },
  cassandra: { supportsSchemas: false, supportsFunctions: false, supportsTriggers: false, supportsSequences: false, supportsExplain: false },
  mongodb: { supportsSchemas: false, supportsFunctions: false, supportsTriggers: false, supportsSequences: false, supportsExplain: false },
  firebase: { supportsSchemas: false, supportsFunctions: false, supportsTriggers: false, supportsSequences: false, supportsExplain: false },
  redis: { supportsSchemas: false, supportsFunctions: false, supportsTriggers: false, supportsSequences: false, supportsExplain: false },
};
