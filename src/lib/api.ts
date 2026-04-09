import { DBConnection, DBType } from './mock-data';

// Builds the connection payload the server expects
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
  };
}

async function post<T = any>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
  if (!res.ok && parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

export async function testConnection(conn: DBConnection): Promise<{ ok: boolean; error?: string }> {
  return post('/api/test-connection', { connection: toPayload(conn) });
}

export async function disconnectConnection(conn: DBConnection): Promise<{ ok: boolean }> {
  return post('/api/disconnect', { connection: toPayload(conn) });
}

export async function executeQuery(conn: DBConnection, query: string) {
  return post('/api/execute', { connection: toPayload(conn), query });
}

export async function fetchDatabases(conn: DBConnection): Promise<string[]> {
  const r = await post<{ databases: string[] }>('/api/databases', { connection: toPayload(conn) });
  return r.databases ?? [];
}

export async function fetchSchemas(conn: DBConnection): Promise<string[]> {
  const r = await post<{ schemas: string[] }>('/api/schemas', { connection: toPayload(conn) });
  return r.schemas ?? [];
}

export interface RemoteTableInfo {
  name: string;
  schema: string;
  type: 'table' | 'view';
}

export async function fetchTables(conn: DBConnection, schema?: string): Promise<RemoteTableInfo[]> {
  const r = await post<{ tables: RemoteTableInfo[] }>('/api/tables', { connection: toPayload(conn), schema });
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
  const r = await post<{ columns: RemoteColumnInfo[] }>('/api/columns', { connection: toPayload(conn), table, schema });
  return r.columns ?? [];
}

export async function fetchRowCount(conn: DBConnection, table: string, schema?: string): Promise<number> {
  const r = await post<{ count: number }>('/api/row-count', { connection: toPayload(conn), table, schema });
  return r.count ?? -1;
}

export async function createDatabase(conn: DBConnection, name: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/create-database', { connection: toPayload(conn), name });
}

export async function dropDatabase(conn: DBConnection, name: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/drop-database', { connection: toPayload(conn), name });
}

export async function dropTable(conn: DBConnection, table: string, schema?: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/drop-table', { connection: toPayload(conn), table, schema });
}

export async function truncateTable(conn: DBConnection, table: string, schema?: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/truncate-table', { connection: toPayload(conn), table, schema });
}

export async function createSchema(conn: DBConnection, name: string): Promise<{ ok: boolean; error?: string }> {
  return post('/api/create-schema', { connection: toPayload(conn), name });
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
): Promise<SchemaDiffResult> {
  return post('/api/schema-diff', {
    source: toPayload(source),
    target: toPayload(target),
    sourceSchema,
    targetSchema,
  });
}

// ─── Git ───

async function get<T = any>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  const text = await res.text();
  if (!text) throw new Error(`Server returned empty response (HTTP ${res.status})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

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

export const DB_TYPE_META: Record<DBType, { label: string; defaultPort: number; icon: string; color: string }> = {
  pg: { label: 'PostgreSQL', defaultPort: 5432, icon: '🐘', color: 'text-blue-400' },
  mysql: { label: 'MySQL', defaultPort: 3306, icon: '🐬', color: 'text-orange-400' },
  sqlite: { label: 'SQLite', defaultPort: 0, icon: '📦', color: 'text-cyan-400' },
  mssql: { label: 'SQL Server', defaultPort: 1433, icon: '🔷', color: 'text-red-400' },
};
