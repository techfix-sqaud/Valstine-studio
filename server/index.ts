import knex, { Knex } from "knex";
import { spawnSync } from "child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Database as BunDatabase } from "bun:sqlite";

// Node.js child-process workers that own the PTY (node-pty can't run in Bun's event loop)
const ptyMap = new Map<any, ReturnType<typeof Bun.spawn>>();

// Absolute path to the pty-worker so it can be spawned from anywhere
const PTY_WORKER = path.join(import.meta.dir, "pty-worker.cjs");

// SERVER_PORT takes precedence so dev (which also has PORT set by the platform)
// doesn't collide with Vite. Production uses PORT directly via the `start` script.
const PORT = parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? "3001", 10);
const isProd = process.env.NODE_ENV === "production";
const DIST_DIR = path.join(import.meta.dir, "..", "dist");

// DATA_DIR: override via env var for cloud/container deployments where the
// app directory may be read-only (e.g. DigitalOcean App Platform, Railway).
const DEFAULT_DATA_DIR = isProd
  ? path.join(os.homedir(), ".valstine", "data")
  : path.join(import.meta.dir, "..", "data");
const APP_DATA_DIR_RESOLVED = process.env.DATA_DIR ?? DEFAULT_DATA_DIR;

// Common interface satisfied by both Knex and BunSQLite
interface DbLike {
  raw(sql: string, bindings?: any): Promise<any>;
  destroy(): any;
}

// Thin wrapper around bun:sqlite that exposes a .raw() compatible with the knex call sites
class BunSQLite implements DbLike {
  private db: BunDatabase;

  constructor(filename: string) {
    const dir = path.dirname(path.resolve(filename));
    mkdirSync(dir, { recursive: true });
    this.db = new BunDatabase(filename, { create: true });
  }

  async raw(sql: string, bindings?: any): Promise<any> {
    const upper = sql.trimStart().toUpperCase();
    const stmt = this.db.prepare(sql);
    const params: any[] = Array.isArray(bindings) ? bindings : bindings != null ? [bindings] : [];
    if (
      upper.startsWith("SELECT") ||
      upper.startsWith("PRAGMA") ||
      upper.startsWith("WITH") ||
      upper.startsWith("EXPLAIN")
    ) {
      return stmt.all(...params);
    }
    const info = stmt.run(...params);
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  }

  destroy() {
    this.db.close();
  }
}

// Pool of DbLike instances keyed by a connection fingerprint
const pool = new Map<string, DbLike>();

// ───── App database (connections, settings, history) ─────
const APP_DATA_DIR = APP_DATA_DIR_RESOLVED;
mkdirSync(APP_DATA_DIR, { recursive: true });
const appDb = new BunDatabase(path.join(APP_DATA_DIR, "valstine.db"), { create: true });

appDb.run(`CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  database_name TEXT NOT NULL,
  username TEXT,
  password TEXT,
  filename TEXT,
  ssl INTEGER DEFAULT 0,
  status TEXT DEFAULT 'disconnected',
  created_at TEXT DEFAULT (datetime('now'))
)`);

appDb.run(`CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);

appDb.run(`CREATE TABLE IF NOT EXISTS query_history (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_name TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  execution_time INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT
)`);

appDb.run(`CREATE TABLE IF NOT EXISTS api_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  saved_at TEXT NOT NULL
)`);

// ── Encryption (AES-256-GCM) for passwords at rest ────────────────────────
const KEY_PATH = path.join(APP_DATA_DIR, "master.key");
function getMasterKey(): Buffer {
  if (existsSync(KEY_PATH)) {
    return Buffer.from(readFileSync(KEY_PATH, "utf8").trim(), "hex");
  }
  const key = randomBytes(32);
  writeFileSync(KEY_PATH, key.toString("hex"), { mode: 0o600 });
  return key;
}
const MASTER_KEY = getMasterKey();

function encryptPassword(password: string): string {
  if (!password) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decryptPassword(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith("enc:")) return stored; // legacy plaintext — migrate on next save
  const parts = stored.split(":");
  if (parts.length !== 4) return "";
  const [, ivHex, tagHex, ctHex] = parts;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ct = Buffer.from(ctHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", MASTER_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct).toString("utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
}

// ── Identifier validation ─────────────────────────────────────────────────
// DDL statements cannot use parameterised bindings for identifiers (table/schema/db names).
// Validate strictly: only letters, digits, underscores, dollar signs (all major DB engines allow these).
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
function validateIdentifier(name: string, label = "identifier"): void {
  if (!name || !IDENT_RE.test(name)) {
    throw new Error(
      `Invalid ${label} "${name}". Only letters, digits, underscores and dollar signs are allowed.`
    );
  }
}

type DBType = "pg" | "mysql" | "sqlite" | "mssql";

interface ConnectionPayload {
  type: DBType;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  filename?: string;
  ssl?: boolean;
}

function connectionKey(c: ConnectionPayload): string {
  if (c.type === "sqlite") return `sqlite:${c.filename ?? c.database}`;
  return `${c.type}://${c.user ?? ""}@${c.host}:${c.port}/${c.database}`;
}

function getKnex(c: ConnectionPayload): DbLike {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;

  if (c.type === "sqlite") {
    const instance = new BunSQLite(c.filename ?? c.database);
    pool.set(key, instance);
    return instance;
  }

  let config: Knex.Config;

  switch (c.type) {
    case "pg":
      config = {
        client: "pg",
        connection: {
          host: c.host ?? "localhost",
          port: c.port ?? 5432,
          database: c.database,
          user: c.user ?? "",
          password: c.password ?? "",
          ssl: c.ssl ? { rejectUnauthorized: true } : false,
        },
        pool: { min: 0, max: 5 },
      };
      break;
    case "mysql":
      config = {
        client: "mysql2",
        connection: {
          host: c.host ?? "localhost",
          port: c.port ?? 3306,
          database: c.database,
          user: c.user ?? "",
          password: c.password ?? "",
          ssl: c.ssl ? { rejectUnauthorized: true } : undefined,
        },
        pool: { min: 0, max: 5 },
      };
      break;
    case "mssql":
      config = {
        client: "tedious",
        connection: {
          server: c.host,
          port: c.port ?? 1433,
          database: c.database,
          userName: c.user,
          password: c.password,
          options: { encrypt: c.ssl ?? false, trustServerCertificate: true },
        } as any,
        pool: { min: 0, max: 5 },
      };
      break;
    default:
      throw new Error(`Unsupported database type: ${c.type}`);
  }

  const instance = knex(config) as unknown as DbLike;
  pool.set(key, instance);
  return instance;
}

function destroyKnex(c: ConnectionPayload) {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) {
    existing.destroy();
    pool.delete(key);
  }
}

// Resolve a full connection payload from either an inline connection or a stored connectionId
function resolveConnection(body: { connectionId?: string; connection?: ConnectionPayload }): ConnectionPayload {
  if (body.connectionId) {
    const row = appDb.prepare("SELECT * FROM connections WHERE id = ?").get(body.connectionId) as any;
    if (!row) throw new Error(`Connection '${body.connectionId}' not found`);
    return {
      type: row.type as DBType,
      host: row.host ?? "localhost",
      port: row.port ?? undefined,
      database: row.database_name,
      user: row.username ?? undefined,
      password: row.password ? decryptPassword(row.password) : undefined,
      filename: row.filename ?? undefined,
      ssl: row.ssl === 1,
    };
  }
  if (body.connection) return body.connection;
  throw new Error("Either connectionId or connection is required");
}

// Allowed origins: localhost (dev + Electron), plus any domain set via ALLOWED_ORIGIN env var.
// An empty/null origin (file://, Electron IPC) is always accepted.
const EXTRA_ORIGIN = process.env.ALLOWED_ORIGIN ?? "";
const ALLOWED_ORIGIN_RE = /^https?:\/\/localhost(:\d+)?$/;

// Returns true if the request is coming from localhost — used to gate app-state
// endpoints and prevent cross-user credential leakage when the server is exposed
// to a network (e.g. cloud deployment).
function isLocalhostRequest(req: Request): boolean {
  // When running behind a reverse proxy, respect X-Forwarded-For only if
  // TRUST_PROXY=1 is explicitly set (opt-in, not default).
  if (process.env.TRUST_PROXY === "1") {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0].trim();
      return first === "127.0.0.1" || first === "::1";
    }
  }
  // Bun does not expose the raw socket address on the Request object the same
  // way Node does, so we rely on the Origin / Host header heuristic.  For a
  // truly network-isolated deployment the admin should also configure a firewall.
  const origin = req.headers.get("origin") ?? "";
  const host = req.headers.get("host") ?? "";
  if (origin && !ALLOWED_ORIGIN_RE.test(origin)) return false;
  const hostName = host.split(":")[0];
  return (
    !origin || // no origin = direct / same-origin request (e.g. Electron)
    hostName === "localhost" ||
    hostName === "127.0.0.1" ||
    hostName === "::1"
  );
}

function requireLocalhost(req: Request): Response | null {
  if (isLocalhostRequest(req)) return null; // allow
  return new Response(
    JSON.stringify({ ok: false, error: "This endpoint is only accessible from localhost." }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function corsOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  if (!origin) return "*"; // no origin = Electron / file:// / same-origin — allow
  if (ALLOWED_ORIGIN_RE.test(origin)) return origin;
  if (EXTRA_ORIGIN && (origin === EXTRA_ORIGIN || EXTRA_ORIGIN === "*")) return origin;
  return "null"; // deny unknown cross-origin
}

function cors(req: Request) {
  const origin = corsOrigin(req);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    },
  });
}

// ───── Result normalizer ─────
function normalizeResult(type: DBType, result: any) {
  let rows: Record<string, unknown>[];
  let columns: string[];

  if (type === "pg") {
    const pgResult = Array.isArray(result) ? result[0] : result;
    rows = pgResult.rows ?? [];
    columns = pgResult.fields?.map((f: any) => f.name) ?? [];

    if (rows.length === 0 && pgResult.command) {
      return {
        columns: ["result"],
        rows: [{ result: `${pgResult.command} — ${pgResult.rowCount ?? 0} row(s) affected` }],
        rowCount: 1,
        status: "success" as const,
        message: `${pgResult.command} completed successfully`,
      };
    }
  } else if (type === "mysql") {
    const [data, fields] = Array.isArray(result) ? result : [result, []];
    if (Array.isArray(data)) {
      rows = data;
      columns = Array.isArray(fields) ? fields.map((f: any) => f.name) : [];
    } else {
      return {
        columns: ["result"],
        rows: [{ result: `${data.affectedRows ?? 0} row(s) affected` }],
        rowCount: 1,
        status: "success" as const,
        message: `${data.affectedRows ?? 0} row(s) affected`,
      };
    }
  } else if (type === "sqlite") {
    if (Array.isArray(result)) {
      rows = result;
      columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } else {
      return {
        columns: ["result"],
        rows: [{ result: "Statement executed successfully" }],
        rowCount: 1,
        status: "success" as const,
      };
    }
  } else {
    const data = Array.isArray(result) ? result : result?.rows ?? [];
    rows = Array.isArray(data) ? data : [];
    columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  }

  return { columns, rows, rowCount: rows.length, status: "success" as const };
}

// ───── Introspection helpers ─────
async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  const db = getKnex(c);
  switch (c.type) {
    case "pg": {
      const r = await db.raw("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname");
      return (r.rows ?? []).map((row: any) => row.datname);
    }
    case "mysql": {
      const [rows] = await db.raw("SHOW DATABASES");
      return rows.map((r: any) => r.Database);
    }
    case "mssql": {
      const r = await db.raw("SELECT name FROM sys.databases ORDER BY name");
      return (Array.isArray(r) ? r : []).map((row: any) => row.name);
    }
    case "sqlite":
      return [c.filename ?? c.database];
    default:
      return [];
  }
}

async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  const db = getKnex(c);
  switch (c.type) {
    case "pg": {
      const r = await db.raw("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name");
      return (r.rows ?? []).map((row: any) => row.schema_name);
    }
    case "mysql":
      return ["default"];
    case "mssql": {
      const r = await db.raw("SELECT name FROM sys.schemas WHERE name NOT IN ('guest','INFORMATION_SCHEMA','sys') ORDER BY name");
      return (Array.isArray(r) ? r : []).map((row: any) => row.name);
    }
    case "sqlite":
      return ["main"];
    default:
      return [];
  }
}

interface TableInfo {
  name: string;
  schema: string;
  type: "table" | "view";
}

async function listTables(c: ConnectionPayload, schema?: string): Promise<TableInfo[]> {
  const db = getKnex(c);
  switch (c.type) {
    case "pg": {
      const s = schema || "public";
      const r = await db.raw(`
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = ?
        ORDER BY table_name
      `, [s]);
      return (r.rows ?? []).map((row: any) => ({
        name: row.table_name,
        schema: s,
        type: row.table_type === "VIEW" ? "view" as const : "table" as const,
      }));
    }
    case "mysql": {
      const [rows] = await db.raw("SHOW FULL TABLES");
      return rows.map((row: any) => {
        const name = Object.values(row)[0] as string;
        const type = (Object.values(row)[1] as string) === "VIEW" ? "view" as const : "table" as const;
        return { name, schema: "default", type };
      });
    }
    case "sqlite": {
      const rows = await db.raw("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
      return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        name: row.name,
        schema: "main",
        type: row.type === "view" ? "view" as const : "table" as const,
      }));
    }
    case "mssql": {
      const s = schema || "dbo";
      const r = await db.raw(`
        SELECT TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME
      `, [s]);
      return (Array.isArray(r) ? r : []).map((row: any) => ({
        name: row.TABLE_NAME,
        schema: s,
        type: row.TABLE_TYPE === "VIEW" ? "view" as const : "table" as const,
      }));
    }
    default:
      return [];
  }
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
}

async function listColumns(c: ConnectionPayload, tableName: string, schema?: string): Promise<ColumnInfo[]> {
  const db = getKnex(c);
  switch (c.type) {
    case "pg": {
      const s = schema || "public";
      const r = await db.raw(`
        SELECT
          c.column_name, c.data_type, c.is_nullable, c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = ? AND tc.table_schema = ?
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = ? AND c.table_schema = ?
        ORDER BY c.ordinal_position
      `, [tableName, s, tableName, s]);
      return (r.rows ?? []).map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === "YES",
        primaryKey: row.is_pk === true,
        defaultValue: row.column_default ?? null,
      }));
    }
    case "mysql": {
      const [rows] = await db.raw("DESCRIBE ??", [tableName]);
      return rows.map((row: any) => ({
        name: row.Field,
        type: row.Type,
        nullable: row.Null === "YES",
        primaryKey: row.Key === "PRI",
        defaultValue: row.Default ?? null,
      }));
    }
    case "sqlite": {
      validateIdentifier(tableName, "table name");
      const rows = await db.raw(`PRAGMA table_info("${tableName}")`);
      return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        name: row.name,
        type: row.type,
        nullable: row.notnull === 0,
        primaryKey: row.pk === 1,
        defaultValue: row.dflt_value ?? null,
      }));
    }
    case "mssql": {
      const s = schema || "dbo";
      const r = await db.raw(`
        SELECT
          c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT ku.COLUMN_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = ? AND tc.TABLE_SCHEMA = ?
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_NAME = ? AND c.TABLE_SCHEMA = ?
        ORDER BY c.ORDINAL_POSITION
      `, [tableName, s, tableName, s]);
      return (Array.isArray(r) ? r : []).map((row: any) => ({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
        nullable: row.IS_NULLABLE === "YES",
        primaryKey: row.IS_PK === 1,
        defaultValue: row.COLUMN_DEFAULT ?? null,
      }));
    }
    default:
      return [];
  }
}

async function getRowCount(c: ConnectionPayload, tableName: string, schema?: string): Promise<number> {
  const db = getKnex(c);
  try {
    validateIdentifier(tableName, "table name");
    if (schema) validateIdentifier(schema, "schema name");
    const qualified = c.type === "sqlite" ? `"${tableName}"` : `"${schema ?? "public"}"."${tableName}"`;
    const r = await db.raw(`SELECT COUNT(*) AS cnt FROM ${qualified}`);
    if (c.type === "pg") return parseInt(r.rows?.[0]?.cnt ?? "0", 10);
    if (c.type === "mysql") return parseInt(r[0]?.[0]?.cnt ?? "0", 10);
    if (c.type === "sqlite") return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
    return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
  } catch {
    return -1;
  }
}

// ───── Schema snapshot (for comparison) ─────
interface SchemaSnapshot {
  database: string;
  tables: {
    schema: string;
    name: string;
    columns: { name: string; type: string; nullable: boolean; primaryKey: boolean; defaultValue: string | null }[];
  }[];
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  const schemas = onlySchema ? [onlySchema] : await listSchemas(c);
  const tables: SchemaSnapshot["tables"] = [];
  for (const schema of schemas) {
    const tbls = await listTables(c, schema);
    for (const t of tbls) {
      if (t.type !== "table") continue;
      const cols = await listColumns(c, t.name, schema);
      tables.push({ schema, name: t.name, columns: cols });
    }
  }
  return { database: c.database, tables };
}

interface SchemaDiffEntry {
  type: "table_added" | "table_removed" | "column_added" | "column_removed" | "column_changed";
  schema: string;
  table: string;
  column?: string;
  details?: string;
  migrationUp?: string;
  migrationDown?: string;
}

function diffSnapshots(source: SchemaSnapshot, target: SchemaSnapshot): SchemaDiffEntry[] {
  const diffs: SchemaDiffEntry[] = [];
  const srcMap = new Map(source.tables.map((t) => [`${t.schema}.${t.name}`, t]));
  const tgtMap = new Map(target.tables.map((t) => [`${t.schema}.${t.name}`, t]));

  // Tables in target but not in source → added
  for (const [key, t] of tgtMap) {
    if (!srcMap.has(key)) {
      const colDefs = t.columns.map((c) => `  "${c.name}" ${c.type}${c.primaryKey ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}`).join(",\n");
      diffs.push({
        type: "table_added",
        schema: t.schema,
        table: t.name,
        migrationUp: `CREATE TABLE "${t.schema}"."${t.name}" (\n${colDefs}\n);`,
        migrationDown: `DROP TABLE IF EXISTS "${t.schema}"."${t.name}";`,
      });
    }
  }

  // Tables in source but not in target → removed
  for (const [key, t] of srcMap) {
    if (!tgtMap.has(key)) {
      const colDefs = t.columns.map((c) => `  "${c.name}" ${c.type}${c.primaryKey ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}`).join(",\n");
      diffs.push({
        type: "table_removed",
        schema: t.schema,
        table: t.name,
        migrationUp: `DROP TABLE IF EXISTS "${t.schema}"."${t.name}";`,
        migrationDown: `CREATE TABLE "${t.schema}"."${t.name}" (\n${colDefs}\n);`,
      });
    }
  }

  // Tables in both → compare columns
  for (const [key, srcTable] of srcMap) {
    const tgtTable = tgtMap.get(key);
    if (!tgtTable) continue;

    const srcCols = new Map(srcTable.columns.map((c) => [c.name, c]));
    const tgtCols = new Map(tgtTable.columns.map((c) => [c.name, c]));
    const qualified = `"${srcTable.schema}"."${srcTable.name}"`;

    for (const [colName, col] of tgtCols) {
      if (!srcCols.has(colName)) {
        diffs.push({
          type: "column_added",
          schema: srcTable.schema,
          table: srcTable.name,
          column: colName,
          details: `${col.type}${col.nullable ? " NULL" : " NOT NULL"}`,
          migrationUp: `ALTER TABLE ${qualified} ADD COLUMN "${colName}" ${col.type}${col.nullable ? "" : " NOT NULL"};`,
          migrationDown: `ALTER TABLE ${qualified} DROP COLUMN "${colName}";`,
        });
      }
    }

    for (const [colName, col] of srcCols) {
      if (!tgtCols.has(colName)) {
        diffs.push({
          type: "column_removed",
          schema: srcTable.schema,
          table: srcTable.name,
          column: colName,
          details: `${col.type}`,
          migrationUp: `ALTER TABLE ${qualified} DROP COLUMN "${colName}";`,
          migrationDown: `ALTER TABLE ${qualified} ADD COLUMN "${colName}" ${col.type}${col.nullable ? "" : " NOT NULL"};`,
        });
      }
    }

    for (const [colName, srcCol] of srcCols) {
      const tgtCol = tgtCols.get(colName);
      if (!tgtCol) continue;
      const changes: string[] = [];
      if (srcCol.type !== tgtCol.type) changes.push(`type: ${srcCol.type} → ${tgtCol.type}`);
      if (srcCol.nullable !== tgtCol.nullable) changes.push(`nullable: ${srcCol.nullable} → ${tgtCol.nullable}`);
      if (changes.length > 0) {
        diffs.push({
          type: "column_changed",
          schema: srcTable.schema,
          table: srcTable.name,
          column: colName,
          details: changes.join(", "),
          migrationUp: `ALTER TABLE ${qualified} ALTER COLUMN "${colName}" TYPE ${tgtCol.type}${tgtCol.nullable ? "" : `, ALTER COLUMN "${colName}" SET NOT NULL`};`,
          migrationDown: `ALTER TABLE ${qualified} ALTER COLUMN "${colName}" TYPE ${srcCol.type}${srcCol.nullable ? "" : `, ALTER COLUMN "${colName}" SET NOT NULL`};`,
        });
      }
    }
  }

  return diffs;
}

// ───── Git helpers ─────
// All git invocations use spawnSync with an explicit args array — never a shell string —
// so file paths, branch names and commit messages cannot be used for command injection.

function git(args: string[], cwd?: string): string {
  const result = spawnSync("git", args, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf-8",
    timeout: 15000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr as string | null)?.trim() ?? "git command failed");
  }
  return (result.stdout as string).trim();
}

function isGitRepo(cwd?: string): boolean {
  try {
    git(["rev-parse", "--is-inside-work-tree"], cwd);
    return true;
  } catch {
    return false;
  }
}

// ───── Server ─────

Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for browser terminal
    if (url.pathname === "/terminal") {
      const ok = server.upgrade(req);
      return ok ? undefined : new Response("WebSocket upgrade failed", { status: 500 });
    }

    if (req.method === "OPTIONS") return cors(req);

    try {
      // Per-request json() with the correct CORS origin already baked in
      const allowedOrigin = corsOrigin(req);
      const respond = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Vary": "Origin",
          },
        });
      // GET /api/status — health check
      if (req.method === "GET" && url.pathname === "/api/status") {
        return respond({ ok: true, version: process.env.npm_package_version ?? "unknown" });
      }

      // POST /api/test-connection
      if (req.method === "POST" && url.pathname === "/api/test-connection") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload };
        const connection = resolveConnection(body);
        try {
          const db = getKnex(connection);
          await db.raw("SELECT 1");
          // Persist 'connected' status so reloads remember the connection
          if (body.connectionId) {
            appDb.run("UPDATE connections SET status = 'connected' WHERE id = ?", [body.connectionId]);
          }
          return respond({ ok: true });
        } catch (connErr: any) {
          destroyKnex(connection);
          if (body.connectionId) {
            appDb.run("UPDATE connections SET status = 'disconnected' WHERE id = ?", [body.connectionId]);
          }
          return respond({ ok: false, error: connErr.message ?? String(connErr) });
        }
      }

      // POST /api/disconnect
      if (req.method === "POST" && url.pathname === "/api/disconnect") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload };
        const connection = resolveConnection(body);
        destroyKnex(connection);
        if (body.connectionId) {
          appDb.run("UPDATE connections SET status = 'disconnected' WHERE id = ?", [body.connectionId]);
        }
        return respond({ ok: true });
      }

      // POST /api/execute
      if (req.method === "POST" && url.pathname === "/api/execute") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; query: string };
        if (!body.query?.trim()) return respond({ status: "error", message: "Empty query", columns: [], rows: [], rowCount: 0, executionTime: 0 });
        const connection = resolveConnection(body);

        const db = getKnex(connection);
        const start = performance.now();
        const result = await db.raw(body.query);
        const elapsed = Math.round(performance.now() - start);
        const normalized = normalizeResult(connection.type, result);
        return respond({ ...normalized, executionTime: elapsed });
      }

      // POST /api/databases
      if (req.method === "POST" && url.pathname === "/api/databases") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload };
        const connection = resolveConnection(body);
        const databases = await listDatabases(connection);
        return respond({ databases });
      }

      // POST /api/schemas
      if (req.method === "POST" && url.pathname === "/api/schemas") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload };
        const connection = resolveConnection(body);
        const schemas = await listSchemas(connection);
        return respond({ schemas });
      }

      // POST /api/tables
      if (req.method === "POST" && url.pathname === "/api/tables") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; schema?: string };
        const connection = resolveConnection(body);
        const tables = await listTables(connection, body.schema);
        return respond({ tables });
      }

      // POST /api/columns
      if (req.method === "POST" && url.pathname === "/api/columns") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string };
        const connection = resolveConnection(body);
        const columns = await listColumns(connection, body.table, body.schema);
        return respond({ columns });
      }

      // POST /api/row-count
      if (req.method === "POST" && url.pathname === "/api/row-count") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string };
        const connection = resolveConnection(body);
        const count = await getRowCount(connection, body.table, body.schema);
        return respond({ count });
      }

      // POST /api/create-database
      if (req.method === "POST" && url.pathname === "/api/create-database") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; name: string };
        if (!body.name?.trim()) return respond({ ok: false, error: "Database name required" });
        validateIdentifier(body.name, "database name");
        const connection = resolveConnection(body);
        const db = getKnex(connection);
        if (connection.type === "pg") await db.raw(`CREATE DATABASE "${body.name}"`);
        else if (connection.type === "mysql") await db.raw(`CREATE DATABASE \`${body.name}\``);
        else if (connection.type === "mssql") await db.raw(`CREATE DATABASE [${body.name}]`);
        else return respond({ ok: false, error: "SQLite does not support CREATE DATABASE" });
        return respond({ ok: true });
      }

      // POST /api/drop-database
      if (req.method === "POST" && url.pathname === "/api/drop-database") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; name: string };
        if (!body.name?.trim()) return respond({ ok: false, error: "Database name required" });
        validateIdentifier(body.name, "database name");
        const connection = resolveConnection(body);
        const db = getKnex(connection);
        if (connection.type === "pg") await db.raw(`DROP DATABASE "${body.name}"`);
        else if (connection.type === "mysql") await db.raw(`DROP DATABASE \`${body.name}\``);
        else if (connection.type === "mssql") await db.raw(`DROP DATABASE [${body.name}]`);
        else return respond({ ok: false, error: "SQLite does not support DROP DATABASE" });
        return respond({ ok: true });
      }

      // POST /api/drop-table
      if (req.method === "POST" && url.pathname === "/api/drop-table") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string };
        validateIdentifier(body.table, "table name");
        if (body.schema) validateIdentifier(body.schema, "schema name");
        const connection = resolveConnection(body);
        const db = getKnex(connection);
        const qualified = connection.type === "sqlite" ? `"${body.table}"` : `"${body.schema ?? "public"}"."${body.table}"`;
        await db.raw(`DROP TABLE ${qualified}`);
        return respond({ ok: true });
      }

      // POST /api/truncate-table
      if (req.method === "POST" && url.pathname === "/api/truncate-table") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; table: string; schema?: string };
        validateIdentifier(body.table, "table name");
        if (body.schema) validateIdentifier(body.schema, "schema name");
        const connection = resolveConnection(body);
        const db = getKnex(connection);
        const qualified = connection.type === "sqlite" ? `"${body.table}"` : `"${body.schema ?? "public"}"."${body.table}"`;
        if (connection.type === "sqlite") await db.raw(`DELETE FROM ${qualified}`);
        else await db.raw(`TRUNCATE TABLE ${qualified}`);
        return respond({ ok: true });
      }

      // POST /api/create-schema
      if (req.method === "POST" && url.pathname === "/api/create-schema") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload; name: string };
        validateIdentifier(body.name, "schema name");
        const connection = resolveConnection(body);
        const db = getKnex(connection);
        if (connection.type === "pg") await db.raw(`CREATE SCHEMA "${body.name}"`);
        else if (connection.type === "mssql") await db.raw(`CREATE SCHEMA [${body.name}]`);
        else return respond({ ok: false, error: "Not supported for this database type" });
        return respond({ ok: true });
      }

      // POST /api/schema-snapshot
      if (req.method === "POST" && url.pathname === "/api/schema-snapshot") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload };
        const connection = resolveConnection(body);
        const snapshot = await snapshotSchema(connection);
        return respond({ ok: true, snapshot });
      }

      // POST /api/schema-diff
      if (req.method === "POST" && url.pathname === "/api/schema-diff") {
        const body = (await req.json()) as {
          sourceConnectionId?: string; source?: ConnectionPayload;
          targetConnectionId?: string; target?: ConnectionPayload;
          sourceSchema?: string;
          targetSchema?: string;
        };
        const source = resolveConnection({ connectionId: body.sourceConnectionId, connection: body.source });
        const target = resolveConnection({ connectionId: body.targetConnectionId, connection: body.target });
        const [srcSnap, tgtSnap] = await Promise.all([
          snapshotSchema(source, body.sourceSchema),
          snapshotSchema(target, body.targetSchema),
        ]);
        const diffs = diffSnapshots(srcSnap, tgtSnap);
        const migrationUp = diffs.map((d) => d.migrationUp).filter(Boolean).join("\n\n");
        const migrationDown = diffs.map((d) => d.migrationDown).filter(Boolean).join("\n\n");
        const srcLabel = body.sourceSchema ? `${srcSnap.database}.${body.sourceSchema}` : srcSnap.database;
        const tgtLabel = body.targetSchema ? `${tgtSnap.database}.${body.targetSchema}` : tgtSnap.database;
        return respond({ ok: true, diffs, migrationUp, migrationDown, source: srcLabel, target: tgtLabel });
      }

      // ─── Git endpoints ───

      // GET /api/git/status
      if (req.method === "GET" && url.pathname === "/api/git/status") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
        const statusRaw = git(["status", "--porcelain"]);
        const files = statusRaw
          ? statusRaw.split("\n").map((line) => ({
              status: line.substring(0, 2).trim(),
              path: line.substring(3),
            }))
          : [];
        let ahead = 0, behind = 0;
        try {
          const ab = git(["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
          const parts = ab.split(/\s+/);
          ahead = parseInt(parts[0]) || 0;
          behind = parseInt(parts[1]) || 0;
        } catch {}
        return respond({ ok: true, branch, files, ahead, behind });
      }

      // GET /api/git/branches
      if (req.method === "GET" && url.pathname === "/api/git/branches") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const raw = git(["branch", "-a", "--no-color"]);
        const current = git(["rev-parse", "--abbrev-ref", "HEAD"]);
        const branches = raw.split("\n").map((b) => b.replace(/^\*?\s+/, "").trim()).filter(Boolean);
        return respond({ ok: true, branches, current });
      }

      // POST /api/git/diff
      if (req.method === "POST" && url.pathname === "/api/git/diff") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { file } = (await req.json()) as { file?: string };
        const diff = file ? git(["diff", "--", file]) : git(["diff"]);
        const stagedDiff = file ? git(["diff", "--cached", "--", file]) : git(["diff", "--cached"]);
        return respond({ ok: true, diff, stagedDiff });
      }

      // POST /api/git/stage
      if (req.method === "POST" && url.pathname === "/api/git/stage") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { files } = (await req.json()) as { files: string[] };
        for (const f of files) git(["add", "--", f]);
        return respond({ ok: true });
      }

      // POST /api/git/unstage
      if (req.method === "POST" && url.pathname === "/api/git/unstage") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { files } = (await req.json()) as { files: string[] };
        for (const f of files) git(["restore", "--staged", "--", f]);
        return respond({ ok: true });
      }

      // POST /api/git/commit
      if (req.method === "POST" && url.pathname === "/api/git/commit") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { message } = (await req.json()) as { message: string };
        if (!message?.trim()) return respond({ ok: false, error: "Commit message required" });
        const result = git(["commit", "-m", message]);
        return respond({ ok: true, result });
      }

      // POST /api/git/push
      if (req.method === "POST" && url.pathname === "/api/git/push") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { branch, setUpstream } = (await req.json()) as { branch?: string; setUpstream?: boolean };
        const current = git(["rev-parse", "--abbrev-ref", "HEAD"]);
        const b = branch ?? current;
        const args = setUpstream
          ? ["push", "-u", "origin", b]
          : ["push", "origin", b];
        const result = git(args);
        return respond({ ok: true, result });
      }

      // POST /api/git/checkout
      if (req.method === "POST" && url.pathname === "/api/git/checkout") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { branch, create } = (await req.json()) as { branch: string; create?: boolean };
        if (!branch?.trim()) return respond({ ok: false, error: "Branch name required" });
        // Allow letters, digits, hyphens, underscores, dots, slashes
        if (!/^[a-zA-Z0-9._\-\/]+$/.test(branch)) {
          return respond({ ok: false, error: "Invalid branch name" });
        }
        const args = create ? ["checkout", "-b", branch] : ["checkout", branch];
        const result = git(args);
        return respond({ ok: true, result });
      }

      // POST /api/git/create-pr
      if (req.method === "POST" && url.pathname === "/api/git/create-pr") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { title, body: prBody, base } = (await req.json()) as { title: string; body?: string; base?: string };
        let remoteUrl = "";
        try { remoteUrl = git(["remote", "get-url", "origin"]); } catch {}
        if (!remoteUrl) return respond({ ok: false, error: "No remote 'origin' found" });
        const current = git(["rev-parse", "--abbrev-ref", "HEAD"]);
        let webUrl = remoteUrl
          .replace(/\.git$/, "")
          .replace(/^git@([^:]+):/, "https://$1/")
          .replace(/^ssh:\/\/git@([^/]+)\//, "https://$1/");
        let prUrl: string;
        if (webUrl.includes("github.com")) {
          const baseBranch = base ?? "main";
          prUrl = `${webUrl}/compare/${baseBranch}...${current}?expand=1&title=${encodeURIComponent(title)}${prBody ? `&body=${encodeURIComponent(prBody)}` : ""}`;
        } else if (webUrl.includes("dev.azure.com") || webUrl.includes("visualstudio.com")) {
          const azureMatch = webUrl.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/);
          if (azureMatch) {
            const [, organization, project, repo] = azureMatch;
            const sourceRef = encodeURIComponent(`refs/heads/${current}`);
            const targetRef = encodeURIComponent(`refs/heads/${base ?? "main"}`);
            prUrl = `https://dev.azure.com/${organization}/${project}/_git/${repo}/pullrequestcreate?sourceRef=${sourceRef}&targetRef=${targetRef}`;
          } else {
            prUrl = webUrl;
          }
        } else if (webUrl.includes("gitlab")) {
          prUrl = `${webUrl}/-/merge_requests/new?merge_request[source_branch]=${current}&merge_request[target_branch]=${base ?? "main"}&merge_request[title]=${encodeURIComponent(title)}`;
        } else {
          prUrl = webUrl;
        }
        return respond({ ok: true, prUrl, branch: current });
      }

      // POST /api/git/log
      if (req.method === "POST" && url.pathname === "/api/git/log") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { limit } = (await req.json()) as { limit?: number };
        const n = Math.min(limit ?? 20, 100);
        const raw = git(["log", `-${n}`, "--format=%h|||%s|||%an|||%ar"]);
        const commits = raw
          ? raw.split("\n").map((line) => {
              const [hash, message, author, date] = line.split("|||");
              return { hash, message, author, date };
            })
          : [];
        return respond({ ok: true, commits });
      }

      // POST /api/git/pull
      if (req.method === "POST" && url.pathname === "/api/git/pull") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const result = git(["pull"]);
        return respond({ ok: true, result });
      }

      // POST /api/git/add-remote
      if (req.method === "POST" && url.pathname === "/api/git/add-remote") {
        if (!isGitRepo()) return respond({ ok: false, error: "Not a git repository" });
        const { name, url: remoteUrl } = (await req.json()) as { name: string; url: string };
        if (!remoteUrl?.trim()) return respond({ ok: false, error: "Remote URL required" });
        // Remote name: only safe chars
        const remoteName = (name?.trim() || "origin").replace(/[^a-zA-Z0-9_\-]/g, "");
        if (!remoteName) return respond({ ok: false, error: "Invalid remote name" });
        // Validate URL is http/https or git SSH — reject shell-injectable chars
        const cleanUrl = remoteUrl.trim();
        if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(cleanUrl)) {
          return respond({ ok: false, error: "Invalid remote URL scheme" });
        }
        try { git(["remote", "remove", remoteName]); } catch { /* ignore */ }
        const result = git(["remote", "add", remoteName, cleanUrl]);
        return respond({ ok: true, result });
      }

      // POST /api/git/init
      if (req.method === "POST" && url.pathname === "/api/git/init") {
        const { cwd: initCwd } = (await req.json()) as { cwd?: string };
        const targetCwd = initCwd?.trim() || process.cwd();
        const result = git(["init"], targetCwd);
        return respond({ ok: true, result, cwd: targetCwd });
      }

      // POST /api/github/clone
      if (req.method === "POST" && url.pathname === "/api/github/clone") {
        const { repoUrl, targetDir } = (await req.json()) as { repoUrl: string; targetDir?: string };
        if (!repoUrl?.trim()) return respond({ ok: false, error: "Repository URL required" });
        const cleanUrl = repoUrl.trim();
        if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(cleanUrl)) {
          return respond({ ok: false, error: "Invalid repository URL scheme" });
        }
        const repoName = cleanUrl.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
        const target = targetDir?.trim() || path.join(os.homedir(), "valstine-repos", repoName);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const result = git(["clone", cleanUrl, target]);
        return respond({ ok: true, result, clonedTo: target });
      }

      // POST /api/github/schema-sql — export current connection schema as SQL for pushing to GitHub
      if (req.method === "POST" && url.pathname === "/api/github/schema-sql") {
        const body = (await req.json()) as { connectionId?: string; connection?: ConnectionPayload };
        const connection = resolveConnection(body);
        const snapshot = await snapshotSchema(connection);
        const lines: string[] = [
          `-- Schema export generated by Valstine Studio`,
          `-- Database: ${snapshot.database}`,
          `-- Generated at: ${new Date().toISOString()}`,
          `-- Tables: ${snapshot.tables.length}`,
          "",
        ];
        for (const t of snapshot.tables) {
          const colDefs = t.columns.map((c) =>
            `  "${c.name}" ${c.type}${c.primaryKey ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ""}`,
          );
          lines.push(`-- Table: ${t.schema}.${t.name}`);
          lines.push(`CREATE TABLE IF NOT EXISTS "${t.schema}"."${t.name}" (`);
          lines.push(colDefs.join(",\n"));
          lines.push(");");
          lines.push("");
        }
        return respond({ ok: true, sql: lines.join("\n"), tableCount: snapshot.tables.length });
      }

      // POST /api/upload-sqlite — receive a SQLite file and save it to the data directory
      if (req.method === "POST" && url.pathname === "/api/upload-sqlite") {
        let formData: FormData;
        try {
          formData = await req.formData();
        } catch {
          return respond({ ok: false, error: "Invalid multipart form data" }, 400);
        }
        const file = formData.get("file") as File | null;
        if (!file || typeof file === "string") return respond({ ok: false, error: "No file uploaded" }, 400);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        if (!safeName.match(/\.(db|sqlite|sqlite3|db3)$/i)) {
          return respond({ ok: false, error: "Only .db / .sqlite files are accepted" }, 400);
        }
        const uploadDir = path.join(APP_DATA_DIR, "uploads");
        mkdirSync(uploadDir, { recursive: true });
        const dest = path.join(uploadDir, safeName);
        const buffer = await file.arrayBuffer();
        await fs.writeFile(dest, Buffer.from(buffer));
        return respond({ ok: true, path: dest });
      }

      // ─── App state endpoints (SQLite-backed, replaces localStorage) ───
      // All /api/app/* routes are localhost-only to prevent cross-user data leakage.
      if (url.pathname.startsWith("/api/app/")) {
        const deny = requireLocalhost(req);
        if (deny) return deny;
      }

      // GET /api/app/connections
      if (req.method === "GET" && url.pathname === "/api/app/connections") {
        const rows = appDb.prepare("SELECT * FROM connections ORDER BY created_at").all() as any[];
        const connections = rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          host: r.host ?? "localhost",
          port: r.port ?? 0,
          database: r.database_name,
          user: r.username ?? "",
          password: "",  // never return password to browser — resolved server-side via connectionId
          filename: r.filename ?? undefined,
          ssl: r.ssl === 1,
          status: (r.status ?? "disconnected") as "connected" | "disconnected",
        }));
        return respond({ ok: true, connections });
      }

      // POST /api/app/connections — create or upsert connection
      if (req.method === "POST" && url.pathname === "/api/app/connections") {
        const conn = (await req.json()) as any;
        if (!conn.id) conn.id = `conn-${Date.now()}`;
        const encPw = conn.password ? encryptPassword(conn.password) : null;
        appDb.run(
          `INSERT OR REPLACE INTO connections (id, name, type, host, port, database_name, username, password, filename, ssl, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [conn.id, conn.name, conn.type, conn.host ?? null, conn.port ?? null, conn.database,
           conn.user ?? null, encPw, conn.filename ?? null, conn.ssl ? 1 : 0, "disconnected"],
        );
        return respond({ ok: true, id: conn.id });
      }

      // PUT /api/app/connections/:id — update connection (preserves encrypted password if not supplied)
      if (req.method === "PUT" && url.pathname.startsWith("/api/app/connections/")) {
        const id = url.pathname.slice("/api/app/connections/".length);
        if (!id) return respond({ ok: false, error: "ID required" }, 400);
        const conn = (await req.json()) as any;
        const existing = appDb.prepare("SELECT password FROM connections WHERE id = ?").get(id) as any;
        // If a new password is supplied, encrypt it; otherwise keep the existing encrypted blob
        const encPw = conn.password
          ? encryptPassword(conn.password)
          : (existing?.password ?? null);
        appDb.run(
          `UPDATE connections SET name=?, type=?, host=?, port=?, database_name=?, username=?, password=?, filename=?, ssl=?
           WHERE id=?`,
          [conn.name, conn.type, conn.host ?? null, conn.port ?? null, conn.database,
           conn.user ?? null, encPw, conn.filename ?? null, conn.ssl ? 1 : 0, id],
        );
        return respond({ ok: true });
      }

      // DELETE /api/app/connections/:id
      if (req.method === "DELETE" && url.pathname.startsWith("/api/app/connections/")) {
        const id = url.pathname.slice("/api/app/connections/".length);
        appDb.run("DELETE FROM connections WHERE id = ?", [id]);
        return respond({ ok: true });
      }

      // GET /api/app/settings
      if (req.method === "GET" && url.pathname === "/api/app/settings") {
        const rows = appDb.prepare("SELECT key, value FROM app_settings").all() as any[];
        const settings: Record<string, any> = {};
        for (const row of rows) {
          try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
        }
        return respond({ ok: true, settings });
      }

      // PUT /api/app/settings
      if (req.method === "PUT" && url.pathname === "/api/app/settings") {
        const body = (await req.json()) as Record<string, any>;
        const stmt = appDb.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)");
        for (const [key, value] of Object.entries(body)) {
          stmt.run(key, JSON.stringify(value));
        }
        return respond({ ok: true });
      }

      // GET /api/app/history
      if (req.method === "GET" && url.pathname === "/api/app/history") {
        const rows = appDb.prepare(
          "SELECT * FROM query_history ORDER BY executed_at DESC LIMIT 200"
        ).all() as any[];
        const history = rows.map((r: any) => ({
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
        return respond({ ok: true, history });
      }

      // POST /api/app/history — add entry
      if (req.method === "POST" && url.pathname === "/api/app/history") {
        const entry = (await req.json()) as any;
        appDb.run(
          `INSERT OR REPLACE INTO query_history
           (id, query, connection_id, connection_name, executed_at, execution_time, row_count, status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [entry.id, entry.query, entry.connectionId, entry.connectionName,
           entry.executedAt, entry.executionTime, entry.rowCount, entry.status, entry.errorMessage ?? null],
        );
        return respond({ ok: true });
      }

      // DELETE /api/app/history/:id  or  DELETE /api/app/history (clear all)
      if (req.method === "DELETE" && url.pathname.startsWith("/api/app/history")) {
        if (url.pathname === "/api/app/history") {
          appDb.run("DELETE FROM query_history");
        } else {
          const id = url.pathname.slice("/api/app/history/".length);
          appDb.run("DELETE FROM query_history WHERE id = ?", [id]);
        }
        return respond({ ok: true });
      }

      // ─── API Requests (ApiTester persistence — replaces localStorage) ───

      // GET /api/app/api-requests
      if (req.method === "GET" && url.pathname === "/api/app/api-requests") {
        const rows = appDb.prepare(
          "SELECT * FROM api_requests ORDER BY saved_at DESC"
        ).all() as any[];
        const requests = rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          method: r.method,
          url: r.url,
          headers: JSON.parse(r.headers ?? "[]"),
          body: r.body ?? "",
          savedAt: r.saved_at,
        }));
        return respond({ ok: true, requests });
      }

      // POST /api/app/api-requests — upsert a single request
      if (req.method === "POST" && url.pathname === "/api/app/api-requests") {
        const entry = (await req.json()) as any;
        if (!entry.id) entry.id = `req-${Date.now()}`;
        appDb.run(
          `INSERT OR REPLACE INTO api_requests (id, name, method, url, headers, body, saved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [entry.id, entry.name ?? "Untitled", entry.method ?? "GET",
           entry.url ?? "", JSON.stringify(entry.headers ?? []),
           entry.body ?? "", entry.savedAt ?? new Date().toISOString()],
        );
        return respond({ ok: true, id: entry.id });
      }

      // DELETE /api/app/api-requests/:id
      if (req.method === "DELETE" && url.pathname.startsWith("/api/app/api-requests/")) {
        const id = url.pathname.slice("/api/app/api-requests/".length);
        appDb.run("DELETE FROM api_requests WHERE id = ?", [id]);
        return respond({ ok: true });
      }

      // POST /api/ai-chat — proxy to DigitalOcean AI agent (avoids browser CORS)
      if (req.method === "POST" && url.pathname === "/api/ai-chat") {
          const denyAiChat = requireLocalhost(req);
          if (denyAiChat) return denyAiChat;
        const { messages } = (await req.json()) as {
          messages: { role: string; content: string }[];
        };

        const agentUrl = "https://a3wb4h5l3ao4rvv6yle57zjj.agents.do-ai.run/api/v1/chat/completions";
        const bearerToken = process.env.DO_AI_TOKEN;

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;

        try {
          const upstream = await fetch(agentUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ model: "n/a", messages, stream: false }),
          });

          if (!upstream.ok) {
            const errText = await upstream.text();
            const clean = errText.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
            return respond({ ok: false, error: `Agent error ${upstream.status}: ${clean}` });
          }

          const data = (await upstream.json()) as any;
          const content: string = data.choices?.[0]?.message?.content ?? "No response from AI agent.";
          return respond({ ok: true, content });
        } catch (err: any) {
          return respond({ ok: false, error: err.message ?? String(err) });
        }
      }

      // POST /api/provision — create a new database from scratch (Docker container or SQLite file)
      // localhost-only: provisions infrastructure on the local machine.
      if (req.method === "POST" && url.pathname === "/api/provision") {
        const denyProv = requireLocalhost(req);
        if (denyProv) return denyProv;
        const body = (await req.json()) as {
          type: DBType;
          containerName?: string;
          port?: number;
          database: string;
          user?: string;
          password?: string;
          filename?: string;
        };

        if (body.type === "sqlite") {
          const filePath = body.filename ?? body.database;
          if (!filePath?.trim()) return respond({ ok: false, error: "File path required" });
          // Touch the file to create it (BunSQLite will create it on open)
          const db = new BunDatabase(filePath, { create: true });
          db.close();
          return respond({
            ok: true,
            connection: { type: "sqlite", host: "localhost", port: 0, database: filePath, user: "", password: "", filename: filePath },
          });
        }

        // Docker-based provisioning — use spawnSync with explicit arg array, never shell interpolation
        const { containerName, port, database, user, password } = body;
        if (!containerName?.trim()) return respond({ ok: false, error: "Container name required" });
        if (!database?.trim()) return respond({ ok: false, error: "Database name required" });
        // Container names: letters, digits, hyphens, underscores only
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerName)) {
          return respond({ ok: false, error: "Invalid container name. Use only letters, digits, hyphens, underscores and dots." });
        }

        const dockerImages: Record<string, string> = {
          pg: "postgres:16",
          mysql: "mysql:8",
          mssql: "mcr.microsoft.com/mssql/server:2022-latest",
        };
        const image = dockerImages[body.type];
        if (!image) return respond({ ok: false, error: `Unsupported type: ${body.type}` });

        const defaultPorts: Record<string, number> = { pg: 5432, mysql: 3306, mssql: 1433 };
        const hostPort = port ?? defaultPorts[body.type];
        const containerPort = defaultPorts[body.type];

        try {
          let dockerArgs: string[];
          const portMapping = `${hostPort}:${containerPort}`;
          if (body.type === "pg") {
            dockerArgs = [
              "run", "-d", "--name", containerName,
              "-e", `POSTGRES_DB=${database}`,
              "-e", `POSTGRES_USER=${user ?? "postgres"}`,
              "-e", `POSTGRES_PASSWORD=${password ?? ""}`,
              "-p", portMapping, image,
            ];
          } else if (body.type === "mysql") {
            dockerArgs = [
              "run", "-d", "--name", containerName,
              "-e", `MYSQL_DATABASE=${database}`,
              "-e", `MYSQL_ROOT_PASSWORD=${password ?? ""}`,
              "-p", portMapping, image,
            ];
          } else {
            dockerArgs = [
              "run", "-d", "--name", containerName,
              "-e", "ACCEPT_EULA=Y",
              "-e", `MSSQL_SA_PASSWORD=${password ?? ""}`,
              "-p", portMapping, image,
            ];
          }

          const dockerResult = spawnSync("docker", dockerArgs, { encoding: "utf-8", timeout: 60000 });
          if (dockerResult.error) throw dockerResult.error;
          if (dockerResult.status !== 0) {
            throw new Error((dockerResult.stderr as string | null)?.trim() ?? "docker command failed");
          }
          const containerId = (dockerResult.stdout as string).trim();
          return respond({
            ok: true,
            containerId,
            connection: {
              type: body.type, host: "localhost", port: hostPort, database,
              user: user ?? (body.type === "mysql" ? "root" : body.type === "pg" ? "postgres" : "sa"),
              password: password ?? "",
            },
          });
        } catch (err: any) {
          const msg: string = err.stderr?.trim() ?? err.message ?? String(err);
          return respond({ ok: false, error: msg });
        }
      }

      // POST /api/proxy — server-side HTTP relay for ApiTester (avoids browser CORS)
      // localhost-only: prevents SSRF abuse when server is network-exposed.
      if (req.method === "POST" && url.pathname === "/api/proxy") {
        const denyProxy = requireLocalhost(req);
        if (denyProxy) return denyProxy;
        const { url: targetUrl, method, headers: reqHeaders, body: reqBody, timeout } =
          (await req.json()) as {
            url: string;
            method?: string;
            headers?: Record<string, string>;
            body?: string;
            timeout?: number;
          };

        if (!targetUrl?.trim()) return respond({ ok: false, error: "URL required" });
        if (!/^https?:\/\//i.test(targetUrl.trim())) {
          return respond({ ok: false, error: "Only http:// and https:// URLs are allowed" });
        }

        const controller = new AbortController();
        const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;
        const proxyStart = performance.now();

        try {
          const upstream = await fetch(targetUrl, {
            method: method || "GET",
            headers: reqHeaders ?? {},
            body: reqBody || undefined,
            signal: controller.signal,
          });
          if (timer) clearTimeout(timer);

          const elapsed = Math.round(performance.now() - proxyStart);
          const responseBody = await upstream.text();
          const responseHeaders: Record<string, string> = {};
          upstream.headers.forEach((val, key) => { responseHeaders[key] = val; });

          return respond({
            ok: true,
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
            body: responseBody,
            elapsed,
          });
        } catch (err: any) {
          if (timer) clearTimeout(timer);
          return respond({ ok: false, error: err.message ?? String(err) });
        }
      }

      // ── Production static file serving ──
      // In production, serve the Vite-built dist/ folder and SPA fallback
      if (isProd) {
        const filePath = path.join(DIST_DIR, url.pathname === "/" ? "index.html" : url.pathname);
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file, {
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
        }
        // SPA fallback: serve index.html for any non-API route
        const index = Bun.file(path.join(DIST_DIR, "index.html"));
        if (await index.exists()) {
          return new Response(index, {
            headers: { "Content-Type": "text/html" },
          });
        }
      }

      return respond({ error: "Not found" }, 404);
    } catch (err: any) {
      console.error(`[server] ${req.method} ${url.pathname} —`, err);
      return new Response(
        JSON.stringify({ ok: false, status: "error", message: err.message ?? String(err), columns: [], rows: [], rowCount: 0, executionTime: 0 }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": corsOrigin(req) } },
      );
    }
  },

  websocket: {
    open(ws) {
      const worker = Bun.spawn(["node", PTY_WORKER], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "inherit",
        env: {
          ...process.env,
          PTY_COLS: "80",
          PTY_ROWS: "24",
        },
      });

      ptyMap.set(ws, worker);

      // Stream raw PTY bytes from worker stdout → WebSocket as binary frames
      (async () => {
        const reader = (worker.stdout as unknown as ReadableStream<Uint8Array>).getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            try {
              ws.send(value); // binary frame — browser receives as ArrayBuffer
            } catch {
              break;
            }
          }
        } catch {
          // reader closed
        } finally {
          reader.releaseLock();
          ptyMap.delete(ws);
          try { ws.close(); } catch { /* already closed */ }
        }
      })().catch(() => {});
    },

    message(ws, msg) {
      const worker = ptyMap.get(ws);
      const stdin = worker?.stdin;
      if (!worker || !stdin || typeof stdin === "number") return;
      try {
        const payload = JSON.parse(msg.toString()) as { type: string; data?: string; cols?: number; rows?: number };
        if (payload.type === "input" && payload.data !== undefined) {
          // Browser sends raw string; worker expects base64
          const b64 = Buffer.from(payload.data).toString("base64");
          stdin.write(JSON.stringify({ type: "input", data: b64 }) + "\n");
          stdin.flush();
        } else if (payload.type === "resize" && payload.cols && payload.rows) {
          stdin.write(JSON.stringify({ type: "resize", cols: payload.cols, rows: payload.rows }) + "\n");
          stdin.flush();
        }
      } catch {
        // Non-JSON or unrecognised type: forward raw bytes as terminal input
        const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as string);
        const b64 = buf.toString("base64");
        stdin.write(JSON.stringify({ type: "input", data: b64 }) + "\n");
        stdin.flush();
      }
    },

    close(ws) {
      const worker = ptyMap.get(ws);
      if (worker) {
        const stdin = worker.stdin;
        if (stdin && typeof stdin !== "number") stdin.end();
        worker.kill();
        ptyMap.delete(ws);
      }
    },
  },
});

console.log(`⚡ Valstine Studio running on http://localhost:${PORT}${isProd ? " (production)" : ""}`);
