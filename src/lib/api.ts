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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
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

export const DB_TYPE_META: Record<DBType, { label: string; defaultPort: number; icon: string; color: string }> = {
  pg: { label: 'PostgreSQL', defaultPort: 5432, icon: '🐘', color: 'text-blue-400' },
  mysql: { label: 'MySQL', defaultPort: 3306, icon: '🐬', color: 'text-orange-400' },
  sqlite: { label: 'SQLite', defaultPort: 0, icon: '📦', color: 'text-cyan-400' },
  mssql: { label: 'SQL Server', defaultPort: 1433, icon: '🔷', color: 'text-red-400' },
};
