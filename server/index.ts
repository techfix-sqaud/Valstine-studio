import knex, { Knex } from "knex";

const PORT = 3001;

// Pool of knex instances keyed by a connection fingerprint
const pool = new Map<string, Knex>();

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

interface ExecutePayload {
  connection: ConnectionPayload;
  query: string;
}

function connectionKey(c: ConnectionPayload): string {
  if (c.type === "sqlite") return `sqlite:${c.filename ?? c.database}`;
  return `${c.type}://${c.user ?? ""}@${c.host}:${c.port}/${c.database}`;
}

function getKnex(c: ConnectionPayload): Knex {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;

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
          ssl: c.ssl ? { rejectUnauthorized: false } : false,
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
          ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
        },
        pool: { min: 0, max: 5 },
      };
      break;
    case "sqlite":
      config = {
        client: "better-sqlite3",
        connection: { filename: c.filename ?? c.database },
        useNullAsDefault: true,
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

  const instance = knex(config);
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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

// ───── Server ─────

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors();

    try {
      // POST /api/test-connection
      if (req.method === "POST" && url.pathname === "/api/test-connection") {
        const { connection } = (await req.json()) as { connection: ConnectionPayload };
        try {
          const db = getKnex(connection);
          await db.raw("SELECT 1");
          return json({ ok: true });
        } catch (connErr: any) {
          // Destroy the cached broken connection so next attempt starts fresh
          destroyKnex(connection);
          return json({ ok: false, error: connErr.message ?? String(connErr) });
        }
      }

      // POST /api/disconnect
      if (req.method === "POST" && url.pathname === "/api/disconnect") {
        const { connection } = (await req.json()) as { connection: ConnectionPayload };
        destroyKnex(connection);
        return json({ ok: true });
      }

      // POST /api/execute
      if (req.method === "POST" && url.pathname === "/api/execute") {
        const body = (await req.json()) as ExecutePayload;
        if (!body.query?.trim()) return json({ status: "error", message: "Empty query", columns: [], rows: [], rowCount: 0, executionTime: 0 });
        if (!body.connection?.type) return json({ status: "error", message: "Missing connection type", columns: [], rows: [], rowCount: 0, executionTime: 0 });

        const db = getKnex(body.connection);
        const start = performance.now();
        const result = await db.raw(body.query);
        const elapsed = Math.round(performance.now() - start);
        const normalized = normalizeResult(body.connection.type, result);
        return json({ ...normalized, executionTime: elapsed });
      }

      // POST /api/databases
      if (req.method === "POST" && url.pathname === "/api/databases") {
        const { connection } = (await req.json()) as { connection: ConnectionPayload };
        const databases = await listDatabases(connection);
        return json({ databases });
      }

      // POST /api/schemas
      if (req.method === "POST" && url.pathname === "/api/schemas") {
        const { connection } = (await req.json()) as { connection: ConnectionPayload };
        const schemas = await listSchemas(connection);
        return json({ schemas });
      }

      // POST /api/tables
      if (req.method === "POST" && url.pathname === "/api/tables") {
        const { connection, schema } = (await req.json()) as { connection: ConnectionPayload; schema?: string };
        const tables = await listTables(connection, schema);
        return json({ tables });
      }

      // POST /api/columns
      if (req.method === "POST" && url.pathname === "/api/columns") {
        const { connection, table, schema } = (await req.json()) as { connection: ConnectionPayload; table: string; schema?: string };
        const columns = await listColumns(connection, table, schema);
        return json({ columns });
      }

      // POST /api/row-count
      if (req.method === "POST" && url.pathname === "/api/row-count") {
        const { connection, table, schema } = (await req.json()) as { connection: ConnectionPayload; table: string; schema?: string };
        const count = await getRowCount(connection, table, schema);
        return json({ count });
      }

      // POST /api/create-database
      if (req.method === "POST" && url.pathname === "/api/create-database") {
        const { connection, name } = (await req.json()) as { connection: ConnectionPayload; name: string };
        if (!name?.trim()) return json({ ok: false, error: "Database name required" });
        const db = getKnex(connection);
        if (connection.type === "pg") await db.raw(`CREATE DATABASE "${name}"`);
        else if (connection.type === "mysql") await db.raw(`CREATE DATABASE \`${name}\``);
        else if (connection.type === "mssql") await db.raw(`CREATE DATABASE [${name}]`);
        else return json({ ok: false, error: "SQLite does not support CREATE DATABASE" });
        return json({ ok: true });
      }

      // POST /api/drop-database
      if (req.method === "POST" && url.pathname === "/api/drop-database") {
        const { connection, name } = (await req.json()) as { connection: ConnectionPayload; name: string };
        if (!name?.trim()) return json({ ok: false, error: "Database name required" });
        const db = getKnex(connection);
        if (connection.type === "pg") await db.raw(`DROP DATABASE "${name}"`);
        else if (connection.type === "mysql") await db.raw(`DROP DATABASE \`${name}\``);
        else if (connection.type === "mssql") await db.raw(`DROP DATABASE [${name}]`);
        else return json({ ok: false, error: "SQLite does not support DROP DATABASE" });
        return json({ ok: true });
      }

      // POST /api/drop-table
      if (req.method === "POST" && url.pathname === "/api/drop-table") {
        const { connection, table, schema } = (await req.json()) as { connection: ConnectionPayload; table: string; schema?: string };
        const db = getKnex(connection);
        const qualified = connection.type === "sqlite" ? `"${table}"` : `"${schema ?? "public"}"."${table}"`;
        await db.raw(`DROP TABLE ${qualified}`);
        return json({ ok: true });
      }

      // POST /api/truncate-table
      if (req.method === "POST" && url.pathname === "/api/truncate-table") {
        const { connection, table, schema } = (await req.json()) as { connection: ConnectionPayload; table: string; schema?: string };
        const db = getKnex(connection);
        const qualified = connection.type === "sqlite" ? `"${table}"` : `"${schema ?? "public"}"."${table}"`;
        if (connection.type === "sqlite") await db.raw(`DELETE FROM ${qualified}`);
        else await db.raw(`TRUNCATE TABLE ${qualified}`);
        return json({ ok: true });
      }

      // POST /api/create-schema
      if (req.method === "POST" && url.pathname === "/api/create-schema") {
        const { connection, name } = (await req.json()) as { connection: ConnectionPayload; name: string };
        const db = getKnex(connection);
        if (connection.type === "pg") await db.raw(`CREATE SCHEMA "${name}"`);
        else if (connection.type === "mssql") await db.raw(`CREATE SCHEMA [${name}]`);
        else return json({ ok: false, error: "Not supported for this database type" });
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (err: any) {
      return json({ ok: false, status: "error", message: err.message ?? String(err), columns: [], rows: [], rowCount: 0, executionTime: 0 });
    }
  },
});

console.log(`⚡ Valstine Studio query server running on http://localhost:${PORT}`);
