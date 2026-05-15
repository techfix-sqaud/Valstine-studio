import { ipcMain, app } from 'electron';
import knex from 'knex';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
// ── App-State SQLite (per-OS-user, stored in Electron userData) ──────────
// This provides the same persistence as server/index.ts but scoped to the
// current OS user account — each user has a completely isolated database.
let appDb;
let MASTER_KEY;
function initAppDb() {
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
    }
    else {
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
    const cols = appDb.prepare('PRAGMA table_info(connections)').all();
    if (cols.some((c) => c.name === 'host')) {
        migrateConnectionsToEncrypted();
    }
}
// Encrypt any string with AES-256-GCM using the per-user master key.
function encrypt(plaintext) {
    if (!plaintext)
        return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', MASTER_KEY, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}
// Decrypt a value produced by encrypt(). Returns '' on failure or empty input.
function decrypt(stored) {
    if (!stored)
        return '';
    if (!stored.startsWith('enc:'))
        return stored; // legacy plaintext passthrough
    const parts = stored.split(':');
    if (parts.length !== 4)
        return '';
    const [, ivHex, tagHex, ctHex] = parts;
    try {
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const ct = Buffer.from(ctHex, 'hex');
        const decipher = createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
        decipher.setAuthTag(tag);
        return decipher.update(ct).toString('utf8') + decipher.final('utf8');
    }
    catch {
        return '';
    }
}
// One-time migration: encrypt all plaintext connection columns into a JSON blob.
function migrateConnectionsToEncrypted() {
    const cols = appDb.prepare('PRAGMA table_info(connections)').all();
    if (!cols.some((c) => c.name === 'data')) {
        appDb.exec("ALTER TABLE connections ADD COLUMN data TEXT NOT NULL DEFAULT ''");
    }
    const rows = appDb.prepare("SELECT * FROM connections WHERE data = '' OR data IS NULL").all();
    const stmt = appDb.prepare('UPDATE connections SET data = ? WHERE id = ?');
    for (const row of rows) {
        const payload = JSON.stringify({
            host: row.host ?? 'localhost',
            port: row.port ?? 0,
            database: row.database_name ?? '',
            user: row.username ?? '',
            password: row.password ? decrypt(row.password) : '',
            filename: row.filename ?? '',
            ssl: row.ssl === 1,
        });
        stmt.run(encrypt(payload), row.id);
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
function handleAppRequest(method, reqPath, body) {
    // GET /api/app/connections
    if (method === 'GET' && reqPath === '/api/app/connections') {
        const rows = appDb.prepare('SELECT id, name, type, status, created_at, data FROM connections ORDER BY created_at').all();
        const connections = rows.map((r) => {
            let payload = {};
            try {
                payload = JSON.parse(decrypt(r.data));
            }
            catch { }
            return {
                id: r.id,
                name: r.name,
                type: r.type,
                host: payload.host ?? 'localhost',
                port: payload.port ?? 0,
                database: payload.database ?? '',
                user: payload.user ?? '',
                password: '', // never return password — resolved server-side via connectionId
                filename: payload.filename || undefined,
                ssl: payload.ssl === true,
                sslRejectUnauthorized: payload.sslRejectUnauthorized !== false,
                status: (r.status ?? 'disconnected'),
            };
        });
        return { ok: true, connections };
    }
    // POST /api/app/connections
    if (method === 'POST' && reqPath === '/api/app/connections') {
        const conn = body;
        if (!conn.id)
            conn.id = `conn-${Date.now()}`;
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
        appDb.prepare(`INSERT OR REPLACE INTO connections (id, name, type, status, data) VALUES (?, ?, ?, 'disconnected', ?)`).run(conn.id, conn.name, conn.type, encrypt(payload));
        return { ok: true, id: conn.id };
    }
    // PUT /api/app/connections/:id
    if (method === 'PUT' && reqPath.startsWith('/api/app/connections/')) {
        const id = reqPath.slice('/api/app/connections/'.length);
        if (!id)
            return { ok: false, error: 'ID required' };
        const conn = body;
        let existingPassword = '';
        const existingRow = appDb.prepare('SELECT data FROM connections WHERE id = ?').get(id);
        if (existingRow?.data) {
            try {
                existingPassword = JSON.parse(decrypt(existingRow.data)).password ?? '';
            }
            catch { }
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
        appDb.prepare('UPDATE connections SET name=?, type=?, data=? WHERE id=?').run(conn.name, conn.type, encrypt(payload), id);
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
        const rows = appDb.prepare('SELECT key, value FROM app_settings').all();
        const settings = {};
        for (const row of rows) {
            try {
                settings[row.key] = JSON.parse(row.value);
            }
            catch {
                settings[row.key] = row.value;
            }
        }
        return { ok: true, settings };
    }
    // PUT /api/app/settings
    if (method === 'PUT' && reqPath === '/api/app/settings') {
        const stmt = appDb.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(body)) {
            stmt.run(key, JSON.stringify(value));
        }
        return { ok: true };
    }
    // GET /api/app/history
    if (method === 'GET' && reqPath === '/api/app/history') {
        const rows = appDb.prepare('SELECT * FROM query_history ORDER BY executed_at DESC LIMIT 200').all();
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
        const entry = body;
        appDb.prepare(`INSERT OR REPLACE INTO query_history
         (id, query, connection_id, connection_name, executed_at, execution_time, row_count, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(entry.id, entry.query, entry.connectionId, entry.connectionName, entry.executedAt, entry.executionTime, entry.rowCount, entry.status, entry.errorMessage ?? null);
        return { ok: true };
    }
    // DELETE /api/app/history (clear all) or /api/app/history/:id
    if (method === 'DELETE' && reqPath.startsWith('/api/app/history')) {
        if (reqPath === '/api/app/history') {
            appDb.prepare('DELETE FROM query_history').run();
        }
        else {
            const id = reqPath.slice('/api/app/history/'.length);
            appDb.prepare('DELETE FROM query_history WHERE id = ?').run(id);
        }
        return { ok: true };
    }
    // GET /api/app/api-requests
    if (method === 'GET' && reqPath === '/api/app/api-requests') {
        const rows = appDb.prepare('SELECT * FROM api_requests ORDER BY saved_at DESC').all();
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
        const entry = body;
        if (!entry.id)
            entry.id = `req-${Date.now()}`;
        appDb.prepare(`INSERT OR REPLACE INTO api_requests (id, name, method, url, headers, body, saved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(entry.id, entry.name ?? 'Untitled', entry.method ?? 'GET', entry.url ?? '', JSON.stringify(entry.headers ?? []), entry.body ?? '', entry.savedAt ?? new Date().toISOString());
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
// Only allow SQL-safe identifiers in DDL statements (table/schema/db names).
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
function validateIdentifier(name, label = 'identifier') {
    if (!name || !IDENT_RE.test(name)) {
        throw new Error(`Invalid ${label} "${name}". Only letters, digits, underscores and dollar signs are allowed.`);
    }
}
const pool = new Map();
function connectionKey(c) {
    if (c.type === 'sqlite')
        return `sqlite:${c.filename ?? c.database}`;
    const sslMode = c.ssl ? (c.sslRejectUnauthorized === false ? 'ssl-noverify' : 'ssl') : 'nossl';
    return `${c.type}://${c.user ?? ''}@${c.host}:${c.port}/${c.database}?${sslMode}`;
}
function getKnex(c) {
    const key = connectionKey(c);
    const existing = pool.get(key);
    if (existing)
        return existing;
    let config;
    switch (c.type) {
        case 'pg':
            config = {
                client: 'pg',
                connection: {
                    host: c.host ?? 'localhost',
                    port: c.port ?? 5432,
                    database: c.database,
                    user: c.user ?? '',
                    password: c.password ?? '',
                    ssl: c.ssl ? { rejectUnauthorized: c.sslRejectUnauthorized ?? true } : false,
                },
                pool: { min: 0, max: 5 },
            };
            break;
        case 'mysql':
            config = {
                client: 'mysql2',
                connection: {
                    host: c.host ?? 'localhost',
                    port: c.port ?? 3306,
                    database: c.database,
                    user: c.user ?? '',
                    password: c.password ?? '',
                    ssl: c.ssl ? { rejectUnauthorized: c.sslRejectUnauthorized ?? true } : undefined,
                },
                pool: { min: 0, max: 5 },
            };
            break;
        case 'sqlite':
            config = {
                client: 'better-sqlite3',
                connection: { filename: c.filename ?? c.database },
                useNullAsDefault: true,
            };
            break;
        case 'mssql':
            config = {
                client: 'mssql',
                connection: {
                    server: c.host,
                    port: c.port ?? 1433,
                    database: c.database,
                    userName: c.user,
                    password: c.password,
                    options: { encrypt: c.ssl ?? false, trustServerCertificate: true },
                },
                pool: { min: 0, max: 5 },
            };
            break;
        default:
            throw new Error(`Unsupported database type: ${c.type}`);
    }
    const instance = knex(config);
    pool.set(key, instance);
    return instance;
}
// Resolve a full ConnectionPayload from either an inline connection object or
// a stored connection ID (looked up and decrypted from the per-user SQLite).
function resolveConnection(payload) {
    if (payload.connectionId) {
        const row = appDb.prepare('SELECT type, data FROM connections WHERE id = ?').get(payload.connectionId);
        if (!row)
            throw new Error(`Connection '${payload.connectionId}' not found`);
        let data = {};
        try {
            data = JSON.parse(decrypt(row.data));
        }
        catch { }
        return {
            type: row.type,
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
    if (payload.connection)
        return payload.connection;
    throw new Error('Either connectionId or connection is required');
}
function destroyKnex(c) {
    const key = connectionKey(c);
    const existing = pool.get(key);
    if (existing) {
        existing.destroy();
        pool.delete(key);
    }
}
// ── Result normalizer ──────────────────────────────────────────────────
function normalizeResult(type, result) {
    let rows;
    let columns;
    if (type === 'pg') {
        const pgResult = Array.isArray(result) ? result[0] : result;
        rows = pgResult.rows ?? [];
        columns = pgResult.fields?.map((f) => f.name) ?? [];
        if (rows.length === 0 && pgResult.command) {
            return {
                columns: ['result'],
                rows: [{ result: `${pgResult.command} — ${pgResult.rowCount ?? 0} row(s) affected` }],
                rowCount: 1,
                status: 'success',
                message: `${pgResult.command} completed successfully`,
            };
        }
    }
    else if (type === 'mysql') {
        const [data, fields] = Array.isArray(result) ? result : [result, []];
        if (Array.isArray(data)) {
            rows = data;
            columns = Array.isArray(fields) ? fields.map((f) => f.name) : [];
        }
        else {
            return {
                columns: ['result'],
                rows: [{ result: `${data.affectedRows ?? 0} row(s) affected` }],
                rowCount: 1,
                status: 'success',
                message: `${data.affectedRows ?? 0} row(s) affected`,
            };
        }
    }
    else if (type === 'sqlite') {
        if (Array.isArray(result)) {
            rows = result;
            columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        }
        else {
            return {
                columns: ['result'],
                rows: [{ result: 'Statement executed successfully' }],
                rowCount: 1,
                status: 'success',
            };
        }
    }
    else {
        const data = Array.isArray(result) ? result : result?.rows ?? [];
        rows = Array.isArray(data) ? data : [];
        columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    }
    return { columns, rows, rowCount: rows.length, status: 'success' };
}
// ── Schema introspection ───────────────────────────────────────────────
async function listDatabases(c) {
    const db = getKnex(c);
    switch (c.type) {
        case 'pg': {
            const r = await db.raw('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname');
            return (r.rows ?? []).map((row) => row.datname);
        }
        case 'mysql': {
            const [rows] = await db.raw('SHOW DATABASES');
            return rows.map((r) => r.Database);
        }
        case 'mssql': {
            const r = await db.raw('SELECT name FROM sys.databases ORDER BY name');
            return (Array.isArray(r) ? r : []).map((row) => row.name);
        }
        case 'sqlite':
            return [c.filename ?? c.database];
        default:
            return [];
    }
}
async function listSchemas(c) {
    const db = getKnex(c);
    switch (c.type) {
        case 'pg': {
            const r = await db.raw("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name");
            return (r.rows ?? []).map((row) => row.schema_name);
        }
        case 'mysql':
            return ['default'];
        case 'mssql': {
            const r = await db.raw("SELECT name FROM sys.schemas WHERE name NOT IN ('guest','INFORMATION_SCHEMA','sys') ORDER BY name");
            return (Array.isArray(r) ? r : []).map((row) => row.name);
        }
        case 'sqlite':
            return ['main'];
        default:
            return [];
    }
}
async function listTables(c, schema) {
    const db = getKnex(c);
    switch (c.type) {
        case 'pg': {
            const s = schema || 'public';
            const r = await db.raw(`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`, [s]);
            return (r.rows ?? []).map((row) => ({
                name: row.table_name,
                schema: s,
                type: row.table_type === 'VIEW' ? 'view' : 'table',
            }));
        }
        case 'mysql': {
            const [rows] = await db.raw('SHOW FULL TABLES');
            return rows.map((row) => {
                const name = Object.values(row)[0];
                const type = Object.values(row)[1] === 'VIEW' ? 'view' : 'table';
                return { name, schema: 'default', type };
            });
        }
        case 'sqlite': {
            const rows = await db.raw("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
            return (Array.isArray(rows) ? rows : []).map((row) => ({
                name: row.name,
                schema: 'main',
                type: row.type === 'view' ? 'view' : 'table',
            }));
        }
        case 'mssql': {
            const s = schema || 'dbo';
            const r = await db.raw(`SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [s]);
            return (Array.isArray(r) ? r : []).map((row) => ({
                name: row.TABLE_NAME,
                schema: s,
                type: row.TABLE_TYPE === 'VIEW' ? 'view' : 'table',
            }));
        }
        default:
            return [];
    }
}
async function listColumns(c, tableName, schema) {
    const db = getKnex(c);
    switch (c.type) {
        case 'pg': {
            const s = schema || 'public';
            const r = await db.raw(`SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT ku.column_name FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = ? AND tc.table_schema = ?
         ) pk ON c.column_name = pk.column_name
         WHERE c.table_name = ? AND c.table_schema = ?
         ORDER BY c.ordinal_position`, [tableName, s, tableName, s]);
            return (r.rows ?? []).map((row) => ({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable === 'YES',
                primaryKey: row.is_pk === true,
                defaultValue: row.column_default ?? null,
            }));
        }
        case 'mysql': {
            const [rows] = await db.raw('DESCRIBE ??', [tableName]);
            return rows.map((row) => ({
                name: row.Field,
                type: row.Type,
                nullable: row.Null === 'YES',
                primaryKey: row.Key === 'PRI',
                defaultValue: row.Default ?? null,
            }));
        }
        case 'sqlite': {
            validateIdentifier(tableName, 'table name');
            const rows = await db.raw(`PRAGMA table_info("${tableName}")`);
            return (Array.isArray(rows) ? rows : []).map((row) => ({
                name: row.name,
                type: row.type,
                nullable: row.notnull === 0,
                primaryKey: row.pk === 1,
                defaultValue: row.dflt_value ?? null,
            }));
        }
        case 'mssql': {
            const s = schema || 'dbo';
            const r = await db.raw(`SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK
         FROM INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
           WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = ? AND tc.TABLE_SCHEMA = ?
         ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
         WHERE c.TABLE_NAME = ? AND c.TABLE_SCHEMA = ?
         ORDER BY c.ORDINAL_POSITION`, [tableName, s, tableName, s]);
            return (Array.isArray(r) ? r : []).map((row) => ({
                name: row.COLUMN_NAME,
                type: row.DATA_TYPE,
                nullable: row.IS_NULLABLE === 'YES',
                primaryKey: row.IS_PK === 1,
                defaultValue: row.COLUMN_DEFAULT ?? null,
            }));
        }
        default:
            return [];
    }
}
async function getRowCount(c, tableName, schema) {
    const db = getKnex(c);
    try {
        validateIdentifier(tableName, 'table name');
        if (schema)
            validateIdentifier(schema, 'schema name');
        const qualified = c.type === 'sqlite' ? `"${tableName}"` : `"${schema ?? 'public'}"."${tableName}"`;
        const r = await db.raw(`SELECT COUNT(*) AS cnt FROM ${qualified}`);
        if (c.type === 'pg')
            return parseInt(r.rows?.[0]?.cnt ?? '0', 10);
        if (c.type === 'mysql')
            return parseInt(r[0]?.[0]?.cnt ?? '0', 10);
        if (c.type === 'sqlite')
            return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
        return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
    }
    catch {
        return -1;
    }
}
async function listIndexes(c, tableName, schema) {
    const db = getKnex(c);
    try {
        switch (c.type) {
            case 'pg': {
                const s = schema || 'public';
                const r = await db.raw(`SELECT i.relname AS name, ix.indisunique AS is_unique,
            string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns
           FROM pg_index ix
           JOIN pg_class t ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
           WHERE t.relname = ? AND n.nspname = ? AND t.relkind = 'r'
           GROUP BY i.relname, ix.indisunique
           ORDER BY i.relname`, [tableName, s]);
                return (r.rows ?? []).map((row) => ({ name: row.name, unique: row.is_unique === true, columns: row.columns ?? '' }));
            }
            case 'mysql': {
                const [rows] = await db.raw('SHOW INDEX FROM ??', [tableName]);
                const byName = new Map();
                for (const row of rows) {
                    const e = byName.get(row.Key_name) ?? { unique: row.Non_unique === 0, cols: [] };
                    e.cols.push(row.Column_name);
                    byName.set(row.Key_name, e);
                }
                return Array.from(byName.entries()).map(([name, e]) => ({ name, unique: e.unique, columns: e.cols.join(', ') }));
            }
            case 'sqlite': {
                validateIdentifier(tableName, 'table name');
                const idxList = await db.raw(`PRAGMA index_list("${tableName}")`);
                const result = [];
                for (const idx of (Array.isArray(idxList) ? idxList : [])) {
                    const cols = await db.raw(`PRAGMA index_info("${idx.name}")`);
                    result.push({ name: idx.name, unique: idx.unique === 1, columns: (Array.isArray(cols) ? cols : []).map((c) => c.name).join(', ') });
                }
                return result;
            }
            case 'mssql': {
                const s = schema || 'dbo';
                const r = await db.raw(`SELECT i.name, i.is_unique,
            STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
           FROM sys.indexes i
           JOIN sys.tables t ON t.object_id = i.object_id
           JOIN sys.schemas sc ON sc.schema_id = t.schema_id
           JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
           JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
           WHERE t.name = ? AND sc.name = ? AND i.type > 0
           GROUP BY i.name, i.is_unique
           ORDER BY i.name`, [tableName, s]);
                return (Array.isArray(r) ? r : []).map((row) => ({ name: row.name, unique: row.is_unique === 1, columns: row.columns ?? '' }));
            }
            default: return [];
        }
    }
    catch {
        return [];
    }
}
async function listSchemaIndexes(c, schema) {
    const db = getKnex(c);
    try {
        switch (c.type) {
            case 'pg': {
                const s = schema || 'public';
                const r = await db.raw(`SELECT i.relname AS name, ix.indisunique AS is_unique, t.relname AS table_name,
            string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns
           FROM pg_index ix
           JOIN pg_class t ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
           WHERE n.nspname = ? AND t.relkind = 'r'
           GROUP BY i.relname, ix.indisunique, t.relname
           ORDER BY t.relname, i.relname`, [s]);
                return (r.rows ?? []).map((row) => ({ name: row.name, tableName: row.table_name, unique: row.is_unique === true, columns: row.columns ?? '' }));
            }
            case 'mysql': {
                const [rows] = await db.raw(`SELECT TABLE_NAME AS table_name, INDEX_NAME AS name,
            IF(NON_UNIQUE=0,1,0) AS is_unique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columns
           FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
           GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME`);
                return rows.map((row) => ({ name: row.name, tableName: row.table_name, unique: row.is_unique === 1, columns: row.columns ?? '' }));
            }
            case 'sqlite': {
                const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
                const result = [];
                for (const t of (Array.isArray(tables) ? tables : [])) {
                    validateIdentifier(t.name, 'table name');
                    const idxList = await db.raw(`PRAGMA index_list("${t.name}")`);
                    for (const idx of (Array.isArray(idxList) ? idxList : [])) {
                        const cols = await db.raw(`PRAGMA index_info("${idx.name}")`);
                        result.push({ name: idx.name, tableName: t.name, unique: idx.unique === 1, columns: (Array.isArray(cols) ? cols : []).map((c) => c.name).join(', ') });
                    }
                }
                return result;
            }
            case 'mssql': {
                const s = schema || 'dbo';
                const r = await db.raw(`SELECT t.name AS table_name, i.name, i.is_unique,
            STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
           FROM sys.indexes i
           JOIN sys.tables t ON t.object_id = i.object_id
           JOIN sys.schemas sc ON sc.schema_id = t.schema_id
           JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
           JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
           WHERE sc.name = ? AND i.type > 0
           GROUP BY t.name, i.name, i.is_unique ORDER BY t.name, i.name`, [s]);
                return (Array.isArray(r) ? r : []).map((row) => ({ name: row.name, tableName: row.table_name, unique: row.is_unique === 1, columns: row.columns ?? '' }));
            }
            default: return [];
        }
    }
    catch {
        return [];
    }
}
async function listFunctions(c, schema) {
    const db = getKnex(c);
    try {
        switch (c.type) {
            case 'pg': {
                const s = schema || 'public';
                const r = await db.raw(`SELECT p.proname AS name,
            CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind,
            COALESCE(pg_catalog.pg_get_function_result(p.oid), 'void') AS return_type,
            l.lanname AS language
           FROM pg_catalog.pg_proc p
           JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_catalog.pg_language l ON l.oid = p.prolang
           WHERE n.nspname = ? AND p.prokind NOT IN ('a', 'w')
           ORDER BY p.prokind, p.proname`, [s]);
                return (r.rows ?? []).map((row) => ({ name: row.name, kind: row.kind, returnType: row.return_type, language: row.language }));
            }
            case 'mysql': {
                const [rows] = await db.raw(`SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS kind,
            COALESCE(DTD_IDENTIFIER,'void') AS return_type, 'sql' AS language
           FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()
           ORDER BY ROUTINE_TYPE, ROUTINE_NAME`);
                return rows.map((row) => ({ name: row.name, kind: row.kind, returnType: row.return_type, language: 'sql' }));
            }
            case 'mssql': {
                const s = schema || 'dbo';
                const r = await db.raw(`SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS kind,
            COALESCE(DATA_TYPE,'void') AS return_type, 'T-SQL' AS language
           FROM INFORMATION_SCHEMA.ROUTINES
           WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE IN ('FUNCTION','PROCEDURE')
           ORDER BY ROUTINE_TYPE, ROUTINE_NAME`, [s]);
                return (Array.isArray(r) ? r : []).map((row) => ({ name: row.name, kind: row.kind, returnType: row.return_type, language: 'T-SQL' }));
            }
            default: return [];
        }
    }
    catch {
        return [];
    }
}
async function listTriggers(c, schema) {
    const db = getKnex(c);
    try {
        switch (c.type) {
            case 'pg': {
                const s = schema || 'public';
                const r = await db.raw(`SELECT trigger_name AS name, event_object_table AS table_name,
            string_agg(event_manipulation, '/' ORDER BY event_manipulation) AS event,
            action_timing AS timing
           FROM information_schema.triggers WHERE trigger_schema = ?
           GROUP BY trigger_name, event_object_table, action_timing
           ORDER BY event_object_table, trigger_name`, [s]);
                return (r.rows ?? []).map((row) => ({ name: row.name, tableName: row.table_name, event: row.event ?? '', timing: row.timing ?? '' }));
            }
            case 'mysql': {
                const [rows] = await db.raw(`SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS table_name,
            EVENT_MANIPULATION AS event, ACTION_TIMING AS timing
           FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
           ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`);
                return rows.map((row) => ({ name: row.name, tableName: row.table_name, event: row.event, timing: row.timing }));
            }
            case 'sqlite': {
                const rows = await db.raw(`SELECT name, tbl_name AS table_name FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name`);
                return (Array.isArray(rows) ? rows : []).map((row) => ({ name: row.name, tableName: row.table_name, event: '', timing: '' }));
            }
            case 'mssql': {
                const s = schema || 'dbo';
                const r = await db.raw(`SELECT t.name, OBJECT_NAME(t.parent_id) AS table_name, '' AS event, '' AS timing
           FROM sys.triggers t
           JOIN sys.tables tab ON tab.object_id = t.parent_id
           JOIN sys.schemas sc ON sc.schema_id = tab.schema_id
           WHERE sc.name = ? AND t.is_disabled = 0
           ORDER BY table_name, t.name`, [s]);
                return (Array.isArray(r) ? r : []).map((row) => ({ name: row.name, tableName: row.table_name, event: '', timing: '' }));
            }
            default: return [];
        }
    }
    catch {
        return [];
    }
}
async function listSequences(c, schema) {
    if (c.type !== 'pg')
        return [];
    try {
        const db = getKnex(c);
        const s = schema || 'public';
        const r = await db.raw(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = ? ORDER BY sequence_name`, [s]);
        return (r.rows ?? []).map((row) => row.sequence_name);
    }
    catch {
        return [];
    }
}
async function snapshotSchema(c, onlySchema) {
    const schemas = onlySchema ? [onlySchema] : await listSchemas(c);
    const tables = [];
    for (const schema of schemas) {
        const tbls = await listTables(c, schema);
        for (const t of tbls) {
            if (t.type !== 'table')
                continue;
            const cols = await listColumns(c, t.name, schema);
            tables.push({ schema, name: t.name, columns: cols });
        }
    }
    return { database: c.database, tables };
}
function diffSnapshots(source, target) {
    const diffs = [];
    const srcMap = new Map(source.tables.map((t) => [`${t.schema}.${t.name}`, t]));
    const tgtMap = new Map(target.tables.map((t) => [`${t.schema}.${t.name}`, t]));
    for (const [key, t] of tgtMap) {
        if (!srcMap.has(key)) {
            const colDefs = t.columns
                .map((c) => `  "${c.name}" ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.nullable ? '' : ' NOT NULL'}`)
                .join(',\n');
            diffs.push({
                type: 'table_added',
                schema: t.schema,
                table: t.name,
                migrationUp: `CREATE TABLE "${t.schema}"."${t.name}" (\n${colDefs}\n);`,
                migrationDown: `DROP TABLE IF EXISTS "${t.schema}"."${t.name}";`,
            });
        }
    }
    for (const [key, t] of srcMap) {
        if (!tgtMap.has(key)) {
            const colDefs = t.columns
                .map((c) => `  "${c.name}" ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.nullable ? '' : ' NOT NULL'}`)
                .join(',\n');
            diffs.push({
                type: 'table_removed',
                schema: t.schema,
                table: t.name,
                migrationUp: `DROP TABLE IF EXISTS "${t.schema}"."${t.name}";`,
                migrationDown: `CREATE TABLE "${t.schema}"."${t.name}" (\n${colDefs}\n);`,
            });
        }
    }
    for (const [key, srcTable] of srcMap) {
        const tgtTable = tgtMap.get(key);
        if (!tgtTable)
            continue;
        const srcCols = new Map(srcTable.columns.map((c) => [c.name, c]));
        const tgtCols = new Map(tgtTable.columns.map((c) => [c.name, c]));
        const qualified = `"${srcTable.schema}"."${srcTable.name}"`;
        for (const [colName, col] of tgtCols) {
            if (!srcCols.has(colName)) {
                diffs.push({
                    type: 'column_added',
                    schema: srcTable.schema,
                    table: srcTable.name,
                    column: colName,
                    details: `${col.type}${col.nullable ? ' NULL' : ' NOT NULL'}`,
                    migrationUp: `ALTER TABLE ${qualified} ADD COLUMN "${colName}" ${col.type}${col.nullable ? '' : ' NOT NULL'};`,
                    migrationDown: `ALTER TABLE ${qualified} DROP COLUMN "${colName}";`,
                });
            }
        }
        for (const [colName, col] of srcCols) {
            if (!tgtCols.has(colName)) {
                diffs.push({
                    type: 'column_removed',
                    schema: srcTable.schema,
                    table: srcTable.name,
                    column: colName,
                    details: col.type,
                    migrationUp: `ALTER TABLE ${qualified} DROP COLUMN "${colName}";`,
                    migrationDown: `ALTER TABLE ${qualified} ADD COLUMN "${colName}" ${col.type}${col.nullable ? '' : ' NOT NULL'};`,
                });
            }
        }
        for (const [colName, srcCol] of srcCols) {
            const tgtCol = tgtCols.get(colName);
            if (!tgtCol)
                continue;
            const changes = [];
            if (srcCol.type !== tgtCol.type)
                changes.push(`type: ${srcCol.type} → ${tgtCol.type}`);
            if (srcCol.nullable !== tgtCol.nullable)
                changes.push(`nullable: ${srcCol.nullable} → ${tgtCol.nullable}`);
            if (changes.length > 0) {
                diffs.push({
                    type: 'column_changed',
                    schema: srcTable.schema,
                    table: srcTable.name,
                    column: colName,
                    details: changes.join(', '),
                    migrationUp: `ALTER TABLE ${qualified} ALTER COLUMN "${colName}" TYPE ${tgtCol.type}${tgtCol.nullable ? '' : `, ALTER COLUMN "${colName}" SET NOT NULL`};`,
                    migrationDown: `ALTER TABLE ${qualified} ALTER COLUMN "${colName}" TYPE ${srcCol.type}${srcCol.nullable ? '' : `, ALTER COLUMN "${colName}" SET NOT NULL`};`,
                });
            }
        }
    }
    return diffs;
}
// ── Git helpers ────────────────────────────────────────────────────────
// spawnSync with explicit arg arrays prevents shell injection — never build shell strings.
function gitCwd() {
    return os.homedir();
}
function git(args, cwd) {
    const result = spawnSync('git', args, {
        cwd: cwd ?? gitCwd(),
        encoding: 'utf-8',
        timeout: 15000,
    });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() ?? 'git command failed');
    }
    return result.stdout.trim();
}
function isGitRepo(cwd) {
    try {
        git(['rev-parse', '--is-inside-work-tree'], cwd);
        return true;
    }
    catch {
        return false;
    }
}
function resolveDockerExecutable() {
    const configured = process.env.DOCKER_PATH?.trim();
    const candidates = [
        configured,
        '/opt/homebrew/bin/docker',
        '/usr/local/bin/docker',
        '/Applications/Docker.app/Contents/Resources/bin/docker',
        '/usr/bin/docker',
        'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return null;
}
function dockerEnv() {
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
    ipcMain.handle('app:request', async (_, { method, path: reqPath, body }) => {
        try {
            return handleAppRequest(method, reqPath, body);
        }
        catch (err) {
            return { ok: false, error: err.message ?? String(err) };
        }
    });
    // ── DB operations ────────────────────────────────────────────────────
    // provision
    ipcMain.handle('db:provision', async (_, payload) => {
        if (payload.type === 'sqlite') {
            const filePath = payload.filename ?? payload.database;
            if (!filePath?.trim())
                return { ok: false, error: 'File path required' };
            try {
                mkdirSync(path.dirname(filePath), { recursive: true });
                const sqliteDb = new Database(filePath);
                sqliteDb.close();
                return {
                    ok: true,
                    connection: {
                        type: 'sqlite',
                        host: 'localhost',
                        port: 0,
                        database: filePath,
                        user: '',
                        password: '',
                        filename: filePath,
                    },
                };
            }
            catch (err) {
                return { ok: false, error: err.message ?? String(err) };
            }
        }
        const { containerName, port, database, user, password } = payload;
        if (!containerName?.trim())
            return { ok: false, error: 'Container name required' };
        if (!database?.trim())
            return { ok: false, error: 'Database name required' };
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerName)) {
            return { ok: false, error: 'Invalid container name. Use only letters, digits, hyphens, underscores and dots.' };
        }
        const dockerImages = {
            pg: 'postgres:16',
            mysql: 'mysql:8',
            mssql: 'mcr.microsoft.com/mssql/server:2022-latest',
        };
        const image = dockerImages[payload.type];
        if (!image)
            return { ok: false, error: `Unsupported type: ${payload.type}` };
        const defaultPorts = { pg: 5432, mysql: 3306, mssql: 1433 };
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
            if (dockerResult.error)
                throw dockerResult.error;
            if (dockerResult.status !== 0) {
                throw new Error(dockerResult.stderr?.trim() ?? 'docker command failed');
            }
            const containerId = dockerResult.stdout.trim();
            return {
                ok: true,
                containerId,
                connection: {
                    type: payload.type,
                    host: 'localhost',
                    port: hostPort,
                    database,
                    user: user ?? (payload.type === 'mysql' ? 'root' : payload.type === 'pg' ? 'postgres' : 'sa'),
                    password: password ?? '',
                },
            };
        }
        catch (err) {
            if (err?.code === 'ENOENT') {
                return { ok: false, error: 'Docker CLI was not found. Install Docker Desktop and make sure the docker binary is available to the app.' };
            }
            const message = err.stderr?.trim() ?? err.message ?? String(err);
            return { ok: false, error: message };
        }
    });
    // test-connection
    ipcMain.handle('db:test-connection', async (_, payload) => {
        const connection = resolveConnection(payload);
        try {
            const db = getKnex(connection);
            await db.raw('SELECT 1');
            // Mark as connected in the app DB if we have a persisted ID
            if (payload.connectionId) {
                appDb.prepare("UPDATE connections SET status = 'connected' WHERE id = ?").run(payload.connectionId);
            }
            return { ok: true };
        }
        catch (err) {
            destroyKnex(connection);
            if (payload.connectionId) {
                appDb.prepare("UPDATE connections SET status = 'disconnected' WHERE id = ?").run(payload.connectionId);
            }
            return { ok: false, error: err.message ?? String(err) };
        }
    });
    // disconnect
    ipcMain.handle('db:disconnect', async (_, payload) => {
        const connection = resolveConnection(payload);
        destroyKnex(connection);
        if (payload.connectionId) {
            appDb.prepare("UPDATE connections SET status = 'disconnected' WHERE id = ?").run(payload.connectionId);
        }
        return { ok: true };
    });
    // execute
    ipcMain.handle('db:execute', async (_, payload) => {
        if (!payload.query?.trim()) {
            return { status: 'error', message: 'Empty query', columns: [], rows: [], rowCount: 0, executionTime: 0 };
        }
        const connection = resolveConnection(payload);
        const db = getKnex(connection);
        const start = performance.now();
        const result = await db.raw(payload.query);
        const elapsed = Math.round(performance.now() - start);
        const normalized = normalizeResult(connection.type, result);
        return { ...normalized, executionTime: elapsed };
    });
    // databases
    ipcMain.handle('db:databases', async (_, payload) => {
        const connection = resolveConnection(payload);
        const databases = await listDatabases(connection);
        return { databases };
    });
    // schemas
    ipcMain.handle('db:schemas', async (_, payload) => {
        const connection = resolveConnection(payload);
        const schemas = await listSchemas(connection);
        return { schemas };
    });
    // tables
    ipcMain.handle('db:tables', async (_, payload) => {
        const connection = resolveConnection(payload);
        const tables = await listTables(connection, payload.schema);
        return { tables };
    });
    // columns
    ipcMain.handle('db:columns', async (_, payload) => {
        const connection = resolveConnection(payload);
        const columns = await listColumns(connection, payload.table, payload.schema);
        return { columns };
    });
    // row-count
    ipcMain.handle('db:row-count', async (_, payload) => {
        const connection = resolveConnection(payload);
        const count = await getRowCount(connection, payload.table, payload.schema);
        return { count };
    });
    // indexes
    // schema-indexes
    ipcMain.handle('db:schema-indexes', async (_, payload) => {
        const connection = resolveConnection(payload);
        const indexes = await listSchemaIndexes(connection, payload.schema);
        return { indexes };
    });
    // indexes (per-table)
    ipcMain.handle('db:indexes', async (_, payload) => {
        const connection = resolveConnection(payload);
        const indexes = await listIndexes(connection, payload.table, payload.schema);
        return { indexes };
    });
    // functions
    ipcMain.handle('db:functions', async (_, payload) => {
        const connection = resolveConnection(payload);
        const functions = await listFunctions(connection, payload.schema);
        return { functions };
    });
    // triggers
    ipcMain.handle('db:triggers', async (_, payload) => {
        const connection = resolveConnection(payload);
        const triggers = await listTriggers(connection, payload.schema);
        return { triggers };
    });
    // sequences
    ipcMain.handle('db:sequences', async (_, payload) => {
        const connection = resolveConnection(payload);
        const sequences = await listSequences(connection, payload.schema);
        return { sequences };
    });
    // create-database
    ipcMain.handle('db:create-database', async (_, payload) => {
        if (!payload.name?.trim())
            return { ok: false, error: 'Database name required' };
        validateIdentifier(payload.name, 'database name');
        const connection = resolveConnection(payload);
        const db = getKnex(connection);
        if (connection.type === 'pg')
            await db.raw(`CREATE DATABASE "${payload.name}"`);
        else if (connection.type === 'mysql')
            await db.raw(`CREATE DATABASE \`${payload.name}\``);
        else if (connection.type === 'mssql')
            await db.raw(`CREATE DATABASE [${payload.name}]`);
        else
            return { ok: false, error: 'SQLite does not support CREATE DATABASE' };
        return { ok: true };
    });
    // drop-database
    ipcMain.handle('db:drop-database', async (_, payload) => {
        if (!payload.name?.trim())
            return { ok: false, error: 'Database name required' };
        validateIdentifier(payload.name, 'database name');
        const connection = resolveConnection(payload);
        const db = getKnex(connection);
        if (connection.type === 'pg')
            await db.raw(`DROP DATABASE "${payload.name}"`);
        else if (connection.type === 'mysql')
            await db.raw(`DROP DATABASE \`${payload.name}\``);
        else if (connection.type === 'mssql')
            await db.raw(`DROP DATABASE [${payload.name}]`);
        else
            return { ok: false, error: 'SQLite does not support DROP DATABASE' };
        return { ok: true };
    });
    // drop-table
    ipcMain.handle('db:drop-table', async (_, payload) => {
        validateIdentifier(payload.table, 'table name');
        if (payload.schema)
            validateIdentifier(payload.schema, 'schema name');
        const connection = resolveConnection(payload);
        const db = getKnex(connection);
        const qualified = connection.type === 'sqlite' ? `"${payload.table}"` : `"${payload.schema ?? 'public'}"."${payload.table}"`;
        await db.raw(`DROP TABLE ${qualified}`);
        return { ok: true };
    });
    // truncate-table
    ipcMain.handle('db:truncate-table', async (_, payload) => {
        validateIdentifier(payload.table, 'table name');
        if (payload.schema)
            validateIdentifier(payload.schema, 'schema name');
        const connection = resolveConnection(payload);
        const db = getKnex(connection);
        const qualified = connection.type === 'sqlite' ? `"${payload.table}"` : `"${payload.schema ?? 'public'}"."${payload.table}"`;
        if (connection.type === 'sqlite')
            await db.raw(`DELETE FROM ${qualified}`);
        else
            await db.raw(`TRUNCATE TABLE ${qualified}`);
        return { ok: true };
    });
    // create-schema
    ipcMain.handle('db:create-schema', async (_, payload) => {
        validateIdentifier(payload.name, 'schema name');
        const connection = resolveConnection(payload);
        const db = getKnex(connection);
        if (connection.type === 'pg')
            await db.raw(`CREATE SCHEMA "${payload.name}"`);
        else if (connection.type === 'mssql')
            await db.raw(`CREATE SCHEMA [${payload.name}]`);
        else
            return { ok: false, error: 'Not supported for this database type' };
        return { ok: true };
    });
    // schema-diff
    ipcMain.handle('db:schema-diff', async (_, payload) => {
        const sourceConn = resolveConnection({ connectionId: payload.sourceConnectionId, connection: payload.source });
        const targetConn = resolveConnection({ connectionId: payload.targetConnectionId, connection: payload.target });
        const [srcSnap, tgtSnap] = await Promise.all([
            snapshotSchema(sourceConn, payload.sourceSchema),
            snapshotSchema(targetConn, payload.targetSchema),
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
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
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
        }
        catch { }
        return { ok: true, branch, files, ahead, behind };
    });
    ipcMain.handle('git:branches', async () => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        const raw = git(['branch', '-a', '--no-color']);
        const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
        const branches = raw.split('\n').map((b) => b.replace(/^\*?\s+/, '').trim()).filter(Boolean);
        return { ok: true, branches, current };
    });
    ipcMain.handle('git:diff', async (_, { file }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        const diff = file ? git(['diff', '--', file]) : git(['diff']);
        const stagedDiff = file ? git(['diff', '--cached', '--', file]) : git(['diff', '--cached']);
        return { ok: true, diff, stagedDiff };
    });
    ipcMain.handle('git:stage', async (_, { files }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        for (const f of files)
            git(['add', '--', f]);
        return { ok: true };
    });
    ipcMain.handle('git:unstage', async (_, { files }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        for (const f of files)
            git(['restore', '--staged', '--', f]);
        return { ok: true };
    });
    ipcMain.handle('git:commit', async (_, { message }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        if (!message?.trim())
            return { ok: false, error: 'Commit message required' };
        const result = git(['commit', '-m', message]);
        return { ok: true, result };
    });
    ipcMain.handle('git:push', async (_, { branch, setUpstream }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
        const b = branch ?? current;
        const args = setUpstream ? ['push', '-u', 'origin', b] : ['push', 'origin', b];
        const result = git(args);
        return { ok: true, result };
    });
    ipcMain.handle('git:checkout', async (_, { branch, create }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        if (!branch?.trim())
            return { ok: false, error: 'Branch name required' };
        if (!/^[a-zA-Z0-9._\-\/]+$/.test(branch))
            return { ok: false, error: 'Invalid branch name' };
        const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
        const result = git(args);
        return { ok: true, result };
    });
    ipcMain.handle('git:log', async (_, { limit }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
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
    ipcMain.handle('ai:chat', async (_, { messages }) => {
        const agentUrl = 'https://a3wb4h5l3ao4rvv6yle57zjj.agents.do-ai.run/api/v1/chat/completions';
        const bearerToken = process.env.DO_AI_TOKEN;
        const headers = { 'Content-Type': 'application/json' };
        if (bearerToken)
            headers['Authorization'] = `Bearer ${bearerToken}`;
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
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content ?? 'No response from AI agent.';
            return { ok: true, content };
        }
        catch (err) {
            return { ok: false, error: err.message ?? String(err) };
        }
    });
    ipcMain.handle('git:create-pr', async (_, { title, body, base }) => {
        if (!isGitRepo())
            return { ok: false, error: 'Not a git repository' };
        let remoteUrl = '';
        try {
            remoteUrl = git(['remote', 'get-url', 'origin']);
        }
        catch { }
        if (!remoteUrl)
            return { ok: false, error: "No remote 'origin' found" };
        const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
        const webUrl = remoteUrl
            .replace(/\.git$/, '')
            .replace(/^git@([^:]+):/, 'https://$1/')
            .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/');
        let prUrl;
        if (webUrl.includes('github.com')) {
            const baseBranch = base ?? 'main';
            prUrl = `${webUrl}/compare/${baseBranch}...${current}?expand=1&title=${encodeURIComponent(title)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
        }
        else if (webUrl.includes('gitlab')) {
            prUrl = `${webUrl}/-/merge_requests/new?merge_request[source_branch]=${current}&merge_request[target_branch]=${base ?? 'main'}&merge_request[title]=${encodeURIComponent(title)}`;
        }
        else {
            prUrl = webUrl;
        }
        return { ok: true, prUrl, branch: current };
    });
}
