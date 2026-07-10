import { ipcMain, app } from 'electron';
import knex from 'knex';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { encrypt, decrypt } from '../shared/db-core/crypto.js';
import { validateIdentifier } from '../shared/db-core/sql-utils.js';
import { diffSnapshots } from '../shared/db-core/diff.js';
import { createSqliteAdapter } from '../shared/db-core/adapters/sqlite.js';
import { createRegistry, getAdapter } from '../shared/db-core/registry.js';
import type { ConnectionPayload, DBType } from '../shared/db-core/types.js';

// SQLite adapter uses knex+better-sqlite3 here (Electron); the web server injects
// a bun:sqlite-backed driver instead — see server/index.ts.
const sqliteAdapter = createSqliteAdapter((filename) =>
  knex({ client: 'better-sqlite3', connection: { filename }, useNullAsDefault: true }) as any,
);
const registry = createRegistry(sqliteAdapter);
function adapterFor(type: DBType) {
  return getAdapter(registry, type);
}

// ── App-State SQLite (per-OS-user, stored in Electron userData) ──────────
// This provides the same persistence as server/index.ts but scoped to the
// current OS user account — each user has a completely isolated database.

let appDb: Database.Database;
let MASTER_KEY: Buffer;

function initAppDb(): void {
  const userDataPath = app.getPath('userData');
  mkdirSync(userDataPath, { recursive: true });

  appDb = new Database(path.join(userDataPath, 'valstine.db'));
  appDb.pragma('journal_mode = WAL');

  // Load/create master key BEFORE schema work — needed for migration encryption.
  const vaultDir = path.join(userDataPath, 'vault');
  mkdirSync(vaultDir, { recursive: true });
  const keyPath = path.join(vaultDir, 'master.key');
  if (existsSync(keyPath)) {
    MASTER_KEY = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'hex');
  } else {
    const key = randomBytes(32);
    writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
    MASTER_KEY = key;
  }

  // New connections schema stores all sensitive fields as an encrypted JSON blob.
  // IF NOT EXISTS is a no-op when the old schema already exists; migration handles that.
  appDb.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'disconnected',
      created_at TEXT DEFAULT (datetime('now')),
      data TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS query_history (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      connection_name TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      execution_time INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT
    );
    CREATE TABLE IF NOT EXISTS api_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      headers TEXT NOT NULL DEFAULT '[]',
      body TEXT NOT NULL DEFAULT '',
      saved_at TEXT NOT NULL
    );
  `);

  // Migrate old schema (plaintext host/port/username/etc.) to encrypted blob.
  const cols = appDb.prepare('PRAGMA table_info(connections)').all() as any[];
  if (cols.some((c: any) => c.name === 'host')) {
    migrateConnectionsToEncrypted();
  }
}

// encrypt()/decrypt() (AES-256-GCM, keyed by MASTER_KEY below) now live in
// shared/db-core/crypto.ts, imported at the top of this file.

// One-time migration: encrypt all plaintext connection columns into a JSON blob.
function migrateConnectionsToEncrypted(): void {
  const cols = appDb.prepare('PRAGMA table_info(connections)').all() as any[];
  if (!cols.some((c: any) => c.name === 'data')) {
    appDb.exec("ALTER TABLE connections ADD COLUMN data TEXT NOT NULL DEFAULT ''");
  }
  const rows = appDb.prepare("SELECT * FROM connections WHERE data = '' OR data IS NULL").all() as any[];
  const stmt = appDb.prepare('UPDATE connections SET data = ? WHERE id = ?');
  for (const row of rows) {
    const payload = JSON.stringify({
      host: row.host ?? 'localhost',
      port: row.port ?? 0,
      database: row.database_name ?? '',
      user: row.username ?? '',
      password: row.password ? decrypt(row.password, MASTER_KEY) : '',
      filename: row.filename ?? '',
      ssl: row.ssl === 1,
    });
    stmt.run(encrypt(payload, MASTER_KEY), row.id);
  }
  // Recreate table without the old plaintext columns.
  appDb.exec(`
    CREATE TABLE connections_v2 (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'disconnected',
      created_at TEXT DEFAULT (datetime('now')),
      data TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO connections_v2 (id, name, type, status, created_at, data)
      SELECT id, name, type, status, created_at, data FROM connections;
    DROP TABLE connections;
    ALTER TABLE connections_v2 RENAME TO connections;
  `);
}

// ── App-State Request Router ────────────────────────────────────────────
// Handles all /api/app/* calls that the renderer routes through IPC in
// Electron mode (instead of HTTP fetch).

function handleAppRequest(method: string, reqPath: string, body: any): unknown {
  // GET /api/app/connections
  if (method === 'GET' && reqPath === '/api/app/connections') {
    const rows = appDb.prepare('SELECT id, name, type, status, created_at, data FROM connections ORDER BY created_at').all() as any[];
    const connections = rows.map((r) => {
      let payload: any = {};
      try { payload = JSON.parse(decrypt(r.data, MASTER_KEY)); } catch {}
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        host: payload.host ?? 'localhost',
        port: payload.port ?? 0,
        database: payload.database ?? '',
        user: payload.user ?? '',
        password: '',  // never return password — resolved server-side via connectionId
        filename: payload.filename || undefined,
        ssl: payload.ssl === true,
        sslRejectUnauthorized: payload.sslRejectUnauthorized !== false,
        status: (r.status ?? 'disconnected') as 'connected' | 'disconnected',
      };
    });
    return { ok: true, connections };
  }

  // POST /api/app/connections
  if (method === 'POST' && reqPath === '/api/app/connections') {
    const conn = body as any;
    if (!conn.id) conn.id = `conn-${Date.now()}`;
    const payload = JSON.stringify({
      host: conn.host ?? '',
      port: conn.port ?? 0,
      database: conn.database ?? '',
      user: conn.user ?? '',
      password: conn.password ?? '',
      filename: conn.filename ?? '',
      ssl: conn.ssl === true,
      sslRejectUnauthorized: conn.sslRejectUnauthorized !== false,
    });
    appDb.prepare(
      `INSERT OR REPLACE INTO connections (id, name, type, status, data) VALUES (?, ?, ?, 'disconnected', ?)`
    ).run(conn.id, conn.name, conn.type, encrypt(payload, MASTER_KEY));
    return { ok: true, id: conn.id };
  }

  // PUT /api/app/connections/:id
  if (method === 'PUT' && reqPath.startsWith('/api/app/connections/')) {
    const id = reqPath.slice('/api/app/connections/'.length);
    if (!id) return { ok: false, error: 'ID required' };
    const conn = body as any;
    let existingPassword = '';
    const existingRow = appDb.prepare('SELECT data FROM connections WHERE id = ?').get(id) as any;
    if (existingRow?.data) {
      try { existingPassword = JSON.parse(decrypt(existingRow.data, MASTER_KEY)).password ?? ''; } catch {}
    }
    const payload = JSON.stringify({
      host: conn.host ?? '',
      port: conn.port ?? 0,
      database: conn.database ?? '',
      user: conn.user ?? '',
      password: conn.password || existingPassword,
      filename: conn.filename ?? '',
      ssl: conn.ssl === true,
      sslRejectUnauthorized: conn.sslRejectUnauthorized !== false,
    });
    appDb.prepare('UPDATE connections SET name=?, type=?, data=? WHERE id=?').run(conn.name, conn.type, encrypt(payload, MASTER_KEY), id);
    return { ok: true };
  }

  // DELETE /api/app/connections/:id
  if (method === 'DELETE' && reqPath.startsWith('/api/app/connections/')) {
    const id = reqPath.slice('/api/app/connections/'.length);
    appDb.prepare('DELETE FROM connections WHERE id = ?').run(id);
    return { ok: true };
  }

  // GET /api/app/settings
  if (method === 'GET' && reqPath === '/api/app/settings') {
    const rows = appDb.prepare('SELECT key, value FROM app_settings').all() as any[];
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
    }
    return { ok: true, settings };
  }

  // PUT /api/app/settings
  if (method === 'PUT' && reqPath === '/api/app/settings') {
    const stmt = appDb.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(body as Record<string, any>)) {
      stmt.run(key, JSON.stringify(value));
    }
    return { ok: true };
  }

  // GET /api/app/history
  if (method === 'GET' && reqPath === '/api/app/history') {
    const rows = appDb.prepare(
      'SELECT * FROM query_history ORDER BY executed_at DESC LIMIT 200'
    ).all() as any[];
    const history = rows.map((r) => ({
      id: r.id,
      query: r.query,
      connectionId: r.connection_id,
      connectionName: r.connection_name,
      executedAt: r.executed_at,
      executionTime: r.execution_time,
      rowCount: r.row_count,
      status: r.status,
      errorMessage: r.error_message ?? undefined,
    }));
    return { ok: true, history };
  }

  // POST /api/app/history
  if (method === 'POST' && reqPath === '/api/app/history') {
    const entry = body as any;
    appDb.prepare(
      `INSERT OR REPLACE INTO query_history
         (id, query, connection_id, connection_name, executed_at, execution_time, row_count, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(entry.id, entry.query, entry.connectionId, entry.connectionName,
      entry.executedAt, entry.executionTime, entry.rowCount, entry.status,
      entry.errorMessage ?? null);
    return { ok: true };
  }

  // DELETE /api/app/history (clear all) or /api/app/history/:id
  if (method === 'DELETE' && reqPath.startsWith('/api/app/history')) {
    if (reqPath === '/api/app/history') {
      appDb.prepare('DELETE FROM query_history').run();
    } else {
      const id = reqPath.slice('/api/app/history/'.length);
      appDb.prepare('DELETE FROM query_history WHERE id = ?').run(id);
    }
    return { ok: true };
  }

  // GET /api/app/api-requests
  if (method === 'GET' && reqPath === '/api/app/api-requests') {
    const rows = appDb.prepare('SELECT * FROM api_requests ORDER BY saved_at DESC').all() as any[];
    const requests = rows.map((r) => ({
      id: r.id,
      name: r.name,
      method: r.method,
      url: r.url,
      headers: JSON.parse(r.headers ?? '[]'),
      body: r.body ?? '',
      savedAt: r.saved_at,
    }));
    return { ok: true, requests };
  }

  // POST /api/app/api-requests
  if (method === 'POST' && reqPath === '/api/app/api-requests') {
    const entry = body as any;
    if (!entry.id) entry.id = `req-${Date.now()}`;
    appDb.prepare(
      `INSERT OR REPLACE INTO api_requests (id, name, method, url, headers, body, saved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(entry.id, entry.name ?? 'Untitled', entry.method ?? 'GET',
      entry.url ?? '', JSON.stringify(entry.headers ?? []),
      entry.body ?? '', entry.savedAt ?? new Date().toISOString());
    return { ok: true, id: entry.id };
  }

  // DELETE /api/app/api-requests/:id
  if (method === 'DELETE' && reqPath.startsWith('/api/app/api-requests/')) {
    const id = reqPath.slice('/api/app/api-requests/'.length);
    appDb.prepare('DELETE FROM api_requests WHERE id = ?').run(id);
    return { ok: true };
  }

  throw new Error(`Unhandled app request: ${method} ${reqPath}`);
}

// resolveConnection: full ConnectionPayload from either an inline connection
// object or a stored connection ID (looked up and decrypted from the per-user
// SQLite). DDL identifier validation and per-DBType adapter logic now live in
// shared/db-core/ (imported at the top of this file).
function resolveConnection(payload: { connectionId?: string; connection?: ConnectionPayload }): ConnectionPayload {
  if (payload.connectionId) {
    const row = appDb.prepare('SELECT type, data FROM connections WHERE id = ?').get(payload.connectionId) as any;
    if (!row) throw new Error(`Connection '${payload.connectionId}' not found`);
    let data: any = {};
    try { data = JSON.parse(decrypt(row.data, MASTER_KEY)); } catch {}
    return {
      type: row.type as DBType,
      host: data.host ?? 'localhost',
      port: data.port ?? undefined,
      database: data.database ?? '',
      user: data.user || undefined,
      password: data.password || undefined,
      filename: data.filename || undefined,
      ssl: data.ssl === true,
      sslRejectUnauthorized: data.sslRejectUnauthorized !== false,
    };
  }
  if (payload.connection) return payload.connection;
  throw new Error('Either connectionId or connection is required');
}


// ── Git helpers ────────────────────────────────────────────────────────
// spawnSync with explicit arg arrays prevents shell injection — never build shell strings.

function gitCwd(): string {
  return os.homedir();
}

function git(args: string[], cwd?: string): string {
  const result = spawnSync('git', args, {
    cwd: cwd ?? gitCwd(),
    encoding: 'utf-8',
    timeout: 15000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr as string | null)?.trim() ?? 'git command failed');
  }
  return (result.stdout as string).trim();
}

function isGitRepo(cwd?: string): boolean {
  try {
    git(['rev-parse', '--is-inside-work-tree'], cwd);
    return true;
  } catch {
    return false;
  }
}

function resolveDockerExecutable(): string | null {
  const configured = process.env.DOCKER_PATH?.trim();
  const candidates = [
    configured,
    '/opt/homebrew/bin/docker',
    '/usr/local/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
    '/usr/bin/docker',
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function dockerEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/Applications/Docker.app/Contents/Resources/bin',
    '/usr/bin',
    'C:\\Program Files\\Docker\\Docker\\resources\\bin',
  ];

  return {
    ...process.env,
    PATH: [...extraPaths, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter),
  };
}

// ── IPC registration ───────────────────────────────────────────────────

export function registerDbIPC() {
  // Initialise the per-user SQLite for app state (connections, settings, history)
  initAppDb();

  // ── App-state proxy (all /api/app/* calls) ──────────────────────────
  ipcMain.handle('app:request', async (_, { method, path: reqPath, body }: { method: string; path: string; body: unknown }) => {
    try {
      return handleAppRequest(method, reqPath, body);
    } catch (err: any) {
      return { ok: false, error: err.message ?? String(err) };
    }
  });

  // ── DB operations ────────────────────────────────────────────────────
  // provision
  ipcMain.handle('db:provision', async (_, payload: {
    type: DBType;
    containerName?: string;
    port?: number;
    database: string;
    user?: string;
    password?: string;
    filename?: string;
  }) => {
    if (payload.type === 'sqlite') {
      const filePath = payload.filename ?? payload.database;
      if (!filePath?.trim()) return { ok: false, error: 'File path required' };
      try {
        mkdirSync(path.dirname(filePath), { recursive: true });
        const sqliteDb = new Database(filePath);
        sqliteDb.close();
        return {
          ok: true,
          connection: {
            type: 'sqlite' as const,
            host: 'localhost',
            port: 0,
            database: filePath,
            user: '',
            password: '',
            filename: filePath,
          },
        };
      } catch (err: any) {
        return { ok: false, error: err.message ?? String(err) };
      }
    }

    const { containerName, port, database, user, password } = payload;
    if (!containerName?.trim()) return { ok: false, error: 'Container name required' };
    if (!database?.trim()) return { ok: false, error: 'Database name required' };
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerName)) {
      return { ok: false, error: 'Invalid container name. Use only letters, digits, hyphens, underscores and dots.' };
    }

    const dockerImages: Partial<Record<DBType, string>> = {
      pg: 'postgres:16',
      mysql: 'mysql:8',
      mssql: 'mcr.microsoft.com/mssql/server:2022-latest',
      cassandra: 'cassandra:5',
    };
    const image = dockerImages[payload.type];
    if (!image) return { ok: false, error: `Unsupported type: ${payload.type}` };

    const defaultPorts: Partial<Record<DBType, number>> = { pg: 5432, mysql: 3306, mssql: 1433, cassandra: 9042 };
    const hostPort = port ?? defaultPorts[payload.type] ?? 0;
    const containerPort = defaultPorts[payload.type] ?? 0;

    try {
      const portMapping = `${hostPort}:${containerPort}`;
      const dockerArgs = payload.type === 'pg'
        ? [
            'run', '-d', '--name', containerName,
            '-e', `POSTGRES_DB=${database}`,
            '-e', `POSTGRES_USER=${user ?? 'postgres'}`,
            '-e', `POSTGRES_PASSWORD=${password ?? ''}`,
            '-p', portMapping, image,
          ]
        : payload.type === 'mysql'
          ? [
              'run', '-d', '--name', containerName,
              '-e', `MYSQL_DATABASE=${database}`,
              '-e', `MYSQL_ROOT_PASSWORD=${password ?? ''}`,
              '-p', portMapping, image,
            ]
          : payload.type === 'cassandra'
            ? ['run', '-d', '--name', containerName, '-p', portMapping, image]
            : [
                'run', '-d', '--name', containerName,
                '-e', 'ACCEPT_EULA=Y',
                '-e', `MSSQL_SA_PASSWORD=${password ?? ''}`,
                '-p', portMapping, image,
              ];

      const dockerExecutable = resolveDockerExecutable() ?? 'docker';
      const dockerResult = spawnSync(dockerExecutable, dockerArgs, {
        encoding: 'utf-8',
        timeout: 60000,
        env: dockerEnv(),
      });
      if (dockerResult.error) throw dockerResult.error;
      if (dockerResult.status !== 0) {
        throw new Error((dockerResult.stderr as string | null)?.trim() ?? 'docker command failed');
      }
      const containerId = (dockerResult.stdout as string).trim();
      // Cassandra's JVM takes 30-90s to accept connections and starts with no
      // user keyspaces — unlike pg/mysql/mssql it can't self-create `database`
      // via an env var, so the caller needs to wait and create it explicitly
      // (db:create-database) once the container is actually ready.
      return {
        ok: true,
        containerId,
        connection: {
          type: payload.type,
          host: 'localhost',
          port: hostPort,
          database: payload.type === 'cassandra' ? '' : database,
          user: user ?? (payload.type === 'mysql' ? 'root' : payload.type === 'pg' ? 'postgres' : 'sa'),
          password: password ?? '',
        },
      };
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return { ok: false, error: 'Docker CLI was not found. Install Docker Desktop and make sure the docker binary is available to the app.' };
      }
      const message = err.stderr?.trim() ?? err.message ?? String(err);
      return { ok: false, error: message };
    }
  });

  // test-connection
  ipcMain.handle('db:test-connection', async (_, payload: { connectionId?: string; connection?: ConnectionPayload }) => {
    const connection = resolveConnection(payload);
    const result = await adapterFor(connection.type).testConnection(connection);
    if (payload.connectionId) {
      appDb.prepare("UPDATE connections SET status = ? WHERE id = ?").run(result.ok ? 'connected' : 'disconnected', payload.connectionId);
    }
    return result;
  });

  // disconnect
  ipcMain.handle('db:disconnect', async (_, payload: { connectionId?: string; connection?: ConnectionPayload }) => {
    const connection = resolveConnection(payload);
    await adapterFor(connection.type).disconnect(connection);
    if (payload.connectionId) {
      appDb.prepare("UPDATE connections SET status = 'disconnected' WHERE id = ?").run(payload.connectionId);
    }
    return { ok: true };
  });

  // execute
  ipcMain.handle('db:execute', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; query: string }) => {
    if (!payload.query?.trim()) {
      return { status: 'error', message: 'Empty query', columns: [], rows: [], rowCount: 0, executionTime: 0 };
    }
    const connection = resolveConnection(payload);
    const start = performance.now();
    const normalized = await adapterFor(connection.type).execute(connection, payload.query);
    const elapsed = Math.round(performance.now() - start);
    return { ...normalized, executionTime: elapsed };
  });

  // databases
  ipcMain.handle('db:databases', async (_, payload: { connectionId?: string; connection?: ConnectionPayload }) => {
    const connection = resolveConnection(payload);
    const databases = await adapterFor(connection.type).listDatabases(connection);
    return { databases };
  });

  // schemas
  ipcMain.handle('db:schemas', async (_, payload: { connectionId?: string; connection?: ConnectionPayload }) => {
    const connection = resolveConnection(payload);
    const schemas = await adapterFor(connection.type).listSchemas(connection);
    return { schemas };
  });

  // tables
  ipcMain.handle('db:tables', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; schema?: string }) => {
    const connection = resolveConnection(payload);
    const tables = await adapterFor(connection.type).listTables(connection, payload.schema);
    return { tables };
  });

  // columns
  ipcMain.handle('db:columns', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string }) => {
    const connection = resolveConnection(payload);
    const columns = await adapterFor(connection.type).listColumns(connection, payload.table, payload.schema);
    return { columns };
  });

  // row-count
  ipcMain.handle('db:row-count', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string }) => {
    const connection = resolveConnection(payload);
    const count = await adapterFor(connection.type).getRowCount(connection, payload.table, payload.schema);
    return { count };
  });

  // schema-indexes
  ipcMain.handle('db:schema-indexes', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; schema?: string }) => {
    const connection = resolveConnection(payload);
    const indexes = await adapterFor(connection.type).listSchemaIndexes(connection, payload.schema);
    return { indexes };
  });

  // indexes (per-table)
  ipcMain.handle('db:indexes', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string }) => {
    const connection = resolveConnection(payload);
    const indexes = await adapterFor(connection.type).listIndexes(connection, payload.table, payload.schema);
    return { indexes };
  });

  // functions
  ipcMain.handle('db:functions', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; schema?: string }) => {
    const connection = resolveConnection(payload);
    const functions = await adapterFor(connection.type).listFunctions(connection, payload.schema);
    return { functions };
  });

  // triggers
  ipcMain.handle('db:triggers', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; schema?: string }) => {
    const connection = resolveConnection(payload);
    const triggers = await adapterFor(connection.type).listTriggers(connection, payload.schema);
    return { triggers };
  });

  // sequences
  ipcMain.handle('db:sequences', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; schema?: string }) => {
    const connection = resolveConnection(payload);
    const sequences = await adapterFor(connection.type).listSequences(connection, payload.schema);
    return { sequences };
  });

  // create-database
  ipcMain.handle('db:create-database', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; name: string }) => {
    if (!payload.name?.trim()) return { ok: false, error: 'Database name required' };
    const connection = resolveConnection(payload);
    return adapterFor(connection.type).createDatabase(connection, payload.name);
  });

  // drop-database
  ipcMain.handle('db:drop-database', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; name: string }) => {
    if (!payload.name?.trim()) return { ok: false, error: 'Database name required' };
    const connection = resolveConnection(payload);
    return adapterFor(connection.type).dropDatabase(connection, payload.name);
  });

  // drop-table
  ipcMain.handle('db:drop-table', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string }) => {
    const connection = resolveConnection(payload);
    await adapterFor(connection.type).dropTable(connection, payload.table, payload.schema);
    return { ok: true };
  });

  // truncate-table
  ipcMain.handle('db:truncate-table', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string }) => {
    const connection = resolveConnection(payload);
    await adapterFor(connection.type).truncateTable(connection, payload.table, payload.schema);
    return { ok: true };
  });

  // create-schema
  ipcMain.handle('db:create-schema', async (_, payload: { connectionId?: string; connection?: ConnectionPayload; name: string }) => {
    const connection = resolveConnection(payload);
    return adapterFor(connection.type).createSchema(connection, payload.name);
  });

  // schema-diff
  ipcMain.handle('db:schema-diff', async (_, payload: {
    sourceConnectionId?: string; source?: ConnectionPayload;
    targetConnectionId?: string; target?: ConnectionPayload;
    sourceSchema?: string; targetSchema?: string;
  }) => {
    const sourceConn = resolveConnection({ connectionId: payload.sourceConnectionId, connection: payload.source });
    const targetConn = resolveConnection({ connectionId: payload.targetConnectionId, connection: payload.target });
    const [srcSnap, tgtSnap] = await Promise.all([
      adapterFor(sourceConn.type).snapshotSchema(sourceConn, payload.sourceSchema),
      adapterFor(targetConn.type).snapshotSchema(targetConn, payload.targetSchema),
    ]);
    const diffs = diffSnapshots(srcSnap, tgtSnap);
    const migrationUp = diffs.map((d) => d.migrationUp).filter(Boolean).join('\n\n');
    const migrationDown = diffs.map((d) => d.migrationDown).filter(Boolean).join('\n\n');
    const srcLabel = payload.sourceSchema ? `${srcSnap.database}.${payload.sourceSchema}` : srcSnap.database;
    const tgtLabel = payload.targetSchema ? `${tgtSnap.database}.${payload.targetSchema}` : tgtSnap.database;
    return { ok: true, diffs, migrationUp, migrationDown, source: srcLabel, target: tgtLabel };
  });

  // ── Git IPC handlers ─────────────────────────────────────────────────

  ipcMain.handle('git:status', async () => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const statusRaw = git(['status', '--porcelain']);
    const files = statusRaw
      ? statusRaw.split('\n').map((line) => ({ status: line.substring(0, 2).trim(), path: line.substring(3) }))
      : [];
    let ahead = 0, behind = 0;
    try {
      const ab = git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
      const parts = ab.split(/\s+/);
      ahead = parseInt(parts[0]) || 0;
      behind = parseInt(parts[1]) || 0;
    } catch {}
    return { ok: true, branch, files, ahead, behind };
  });

  ipcMain.handle('git:branches', async () => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    const raw = git(['branch', '-a', '--no-color']);
    const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const branches = raw.split('\n').map((b) => b.replace(/^\*?\s+/, '').trim()).filter(Boolean);
    return { ok: true, branches, current };
  });

  ipcMain.handle('git:diff', async (_, { file }: { file?: string }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    const diff = file ? git(['diff', '--', file]) : git(['diff']);
    const stagedDiff = file ? git(['diff', '--cached', '--', file]) : git(['diff', '--cached']);
    return { ok: true, diff, stagedDiff };
  });

  ipcMain.handle('git:stage', async (_, { files }: { files: string[] }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    for (const f of files) git(['add', '--', f]);
    return { ok: true };
  });

  ipcMain.handle('git:unstage', async (_, { files }: { files: string[] }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    for (const f of files) git(['restore', '--staged', '--', f]);
    return { ok: true };
  });

  ipcMain.handle('git:commit', async (_, { message }: { message: string }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    if (!message?.trim()) return { ok: false, error: 'Commit message required' };
    const result = git(['commit', '-m', message]);
    return { ok: true, result };
  });

  ipcMain.handle('git:push', async (_, { branch, setUpstream }: { branch?: string; setUpstream?: boolean }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const b = branch ?? current;
    const args = setUpstream ? ['push', '-u', 'origin', b] : ['push', 'origin', b];
    const result = git(args);
    return { ok: true, result };
  });

  ipcMain.handle('git:checkout', async (_, { branch, create }: { branch: string; create?: boolean }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    if (!branch?.trim()) return { ok: false, error: 'Branch name required' };
    if (!/^[a-zA-Z0-9._\-\/]+$/.test(branch)) return { ok: false, error: 'Invalid branch name' };
    const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
    const result = git(args);
    return { ok: true, result };
  });

  ipcMain.handle('git:log', async (_, { limit }: { limit?: number }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    const n = Math.min(limit ?? 20, 100);
    const raw = git(['log', '--oneline', `-${n}`, '--format=%h|||%s|||%an|||%ar']);
    const commits = raw
      ? raw.split('\n').map((line) => {
          const [hash, message, author, date] = line.split('|||');
          return { hash, message, author, date };
        })
      : [];
    return { ok: true, commits };
  });

  // ── AI chat proxy (Electron can't use fetch to external origins in renderer) ──
  ipcMain.handle('ai:chat', async (_, { messages }: { messages: { role: string; content: string }[] }) => {
    const agentUrl = 'https://ww7qywyrdk5e4ofyic2gn3xm.agents.do-ai.run';
    const bearerToken = process.env.DO_AI_TOKEN;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    try {
      const res = await fetch(agentUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: 'n/a', messages, stream: false }),
      });
      if (!res.ok) {
        const errText = await res.text();
        const clean = errText.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
        return { ok: false, error: `Agent error ${res.status}: ${clean}` };
      }
      const data = await res.json() as any;
      const content: string = data.choices?.[0]?.message?.content ?? 'No response from AI agent.';
      return { ok: true, content };
    } catch (err: any) {
      return { ok: false, error: err.message ?? String(err) };
    }
  });

  ipcMain.handle('git:create-pr', async (_, { title, body, base }: { title: string; body?: string; base?: string }) => {
    if (!isGitRepo()) return { ok: false, error: 'Not a git repository' };
    let remoteUrl = '';
    try { remoteUrl = git(['remote', 'get-url', 'origin']); } catch {}
    if (!remoteUrl) return { ok: false, error: "No remote 'origin' found" };
    const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const webUrl = remoteUrl
      .replace(/\.git$/, '')
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/');
    let prUrl: string;
    if (webUrl.includes('github.com')) {
      const baseBranch = base ?? 'main';
      prUrl = `${webUrl}/compare/${baseBranch}...${current}?expand=1&title=${encodeURIComponent(title)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
    } else if (webUrl.includes('gitlab')) {
      prUrl = `${webUrl}/-/merge_requests/new?merge_request[source_branch]=${current}&merge_request[target_branch]=${base ?? 'main'}&merge_request[title]=${encodeURIComponent(title)}`;
    } else {
      prUrl = webUrl;
    }
    return { ok: true, prUrl, branch: current };
  });
}
