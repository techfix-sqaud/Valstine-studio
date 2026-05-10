import { ipcMain } from 'electron';
import knex, { Knex } from 'knex';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

// Only allow SQL-safe identifiers in DDL statements (table/schema/db names).
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
function validateIdentifier(name: string, label = 'identifier'): void {
  if (!name || !IDENT_RE.test(name)) {
    throw new Error(
      `Invalid ${label} "${name}". Only letters, digits, underscores and dollar signs are allowed.`
    );
  }
}

// ── Connection pool ────────────────────────────────────────────────────

type DBType = 'pg' | 'mysql' | 'sqlite' | 'mssql';

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

const pool = new Map<string, Knex>();

function connectionKey(c: ConnectionPayload): string {
  if (c.type === 'sqlite') return `sqlite:${c.filename ?? c.database}`;
  return `${c.type}://${c.user ?? ''}@${c.host}:${c.port}/${c.database}`;
}

function getKnex(c: ConnectionPayload): Knex {
  const key = connectionKey(c);
  const existing = pool.get(key);
  if (existing) return existing;

  let config: Knex.Config;

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
          ssl: c.ssl ? { rejectUnauthorized: false } : false,
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
          ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
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
        client: 'tedious',
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

// ── Result normalizer ──────────────────────────────────────────────────

function normalizeResult(type: DBType, result: any) {
  let rows: Record<string, unknown>[];
  let columns: string[];

  if (type === 'pg') {
    const pgResult = Array.isArray(result) ? result[0] : result;
    rows = pgResult.rows ?? [];
    columns = pgResult.fields?.map((f: any) => f.name) ?? [];
    if (rows.length === 0 && pgResult.command) {
      return {
        columns: ['result'],
        rows: [{ result: `${pgResult.command} — ${pgResult.rowCount ?? 0} row(s) affected` }],
        rowCount: 1,
        status: 'success' as const,
        message: `${pgResult.command} completed successfully`,
      };
    }
  } else if (type === 'mysql') {
    const [data, fields] = Array.isArray(result) ? result : [result, []];
    if (Array.isArray(data)) {
      rows = data;
      columns = Array.isArray(fields) ? fields.map((f: any) => f.name) : [];
    } else {
      return {
        columns: ['result'],
        rows: [{ result: `${data.affectedRows ?? 0} row(s) affected` }],
        rowCount: 1,
        status: 'success' as const,
        message: `${data.affectedRows ?? 0} row(s) affected`,
      };
    }
  } else if (type === 'sqlite') {
    if (Array.isArray(result)) {
      rows = result;
      columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } else {
      return {
        columns: ['result'],
        rows: [{ result: 'Statement executed successfully' }],
        rowCount: 1,
        status: 'success' as const,
      };
    }
  } else {
    const data = Array.isArray(result) ? result : result?.rows ?? [];
    rows = Array.isArray(data) ? data : [];
    columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  }

  return { columns, rows, rowCount: rows.length, status: 'success' as const };
}

// ── Schema introspection ───────────────────────────────────────────────

async function listDatabases(c: ConnectionPayload): Promise<string[]> {
  const db = getKnex(c);
  switch (c.type) {
    case 'pg': {
      const r = await db.raw('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname');
      return (r.rows ?? []).map((row: any) => row.datname);
    }
    case 'mysql': {
      const [rows] = await db.raw('SHOW DATABASES');
      return rows.map((r: any) => r.Database);
    }
    case 'mssql': {
      const r = await db.raw('SELECT name FROM sys.databases ORDER BY name');
      return (Array.isArray(r) ? r : []).map((row: any) => row.name);
    }
    case 'sqlite':
      return [c.filename ?? c.database];
    default:
      return [];
  }
}

async function listSchemas(c: ConnectionPayload): Promise<string[]> {
  const db = getKnex(c);
  switch (c.type) {
    case 'pg': {
      const r = await db.raw(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name",
      );
      return (r.rows ?? []).map((row: any) => row.schema_name);
    }
    case 'mysql':
      return ['default'];
    case 'mssql': {
      const r = await db.raw(
        "SELECT name FROM sys.schemas WHERE name NOT IN ('guest','INFORMATION_SCHEMA','sys') ORDER BY name",
      );
      return (Array.isArray(r) ? r : []).map((row: any) => row.name);
    }
    case 'sqlite':
      return ['main'];
    default:
      return [];
  }
}

interface TableInfo {
  name: string;
  schema: string;
  type: 'table' | 'view';
}

async function listTables(c: ConnectionPayload, schema?: string): Promise<TableInfo[]> {
  const db = getKnex(c);
  switch (c.type) {
    case 'pg': {
      const s = schema || 'public';
      const r = await db.raw(
        `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
        [s],
      );
      return (r.rows ?? []).map((row: any) => ({
        name: row.table_name,
        schema: s,
        type: row.table_type === 'VIEW' ? ('view' as const) : ('table' as const),
      }));
    }
    case 'mysql': {
      const [rows] = await db.raw('SHOW FULL TABLES');
      return rows.map((row: any) => {
        const name = Object.values(row)[0] as string;
        const type = (Object.values(row)[1] as string) === 'VIEW' ? ('view' as const) : ('table' as const);
        return { name, schema: 'default', type };
      });
    }
    case 'sqlite': {
      const rows = await db.raw(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        name: row.name,
        schema: 'main',
        type: row.type === 'view' ? ('view' as const) : ('table' as const),
      }));
    }
    case 'mssql': {
      const s = schema || 'dbo';
      const r = await db.raw(
        `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
        [s],
      );
      return (Array.isArray(r) ? r : []).map((row: any) => ({
        name: row.TABLE_NAME,
        schema: s,
        type: row.TABLE_TYPE === 'VIEW' ? ('view' as const) : ('table' as const),
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
    case 'pg': {
      const s = schema || 'public';
      const r = await db.raw(
        `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT ku.column_name FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = ? AND tc.table_schema = ?
         ) pk ON c.column_name = pk.column_name
         WHERE c.table_name = ? AND c.table_schema = ?
         ORDER BY c.ordinal_position`,
        [tableName, s, tableName, s],
      );
      return (r.rows ?? []).map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        primaryKey: row.is_pk === true,
        defaultValue: row.column_default ?? null,
      }));
    }
    case 'mysql': {
      const [rows] = await db.raw('DESCRIBE ??', [tableName]);
      return rows.map((row: any) => ({
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
      return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        name: row.name,
        type: row.type,
        nullable: row.notnull === 0,
        primaryKey: row.pk === 1,
        defaultValue: row.dflt_value ?? null,
      }));
    }
    case 'mssql': {
      const s = schema || 'dbo';
      const r = await db.raw(
        `SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK
         FROM INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
           WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = ? AND tc.TABLE_SCHEMA = ?
         ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
         WHERE c.TABLE_NAME = ? AND c.TABLE_SCHEMA = ?
         ORDER BY c.ORDINAL_POSITION`,
        [tableName, s, tableName, s],
      );
      return (Array.isArray(r) ? r : []).map((row: any) => ({
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

async function getRowCount(c: ConnectionPayload, tableName: string, schema?: string): Promise<number> {
  const db = getKnex(c);
  try {
    validateIdentifier(tableName, 'table name');
    if (schema) validateIdentifier(schema, 'schema name');
    const qualified =
      c.type === 'sqlite' ? `"${tableName}"` : `"${schema ?? 'public'}"."${tableName}"`;
    const r = await db.raw(`SELECT COUNT(*) AS cnt FROM ${qualified}`);
    if (c.type === 'pg') return parseInt(r.rows?.[0]?.cnt ?? '0', 10);
    if (c.type === 'mysql') return parseInt(r[0]?.[0]?.cnt ?? '0', 10);
    if (c.type === 'sqlite') return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
    return Array.isArray(r) ? (r[0]?.cnt ?? 0) : 0;
  } catch {
    return -1;
  }
}

// ── Schema diff ────────────────────────────────────────────────────────

interface SchemaSnapshot {
  database: string;
  tables: {
    schema: string;
    name: string;
    columns: ColumnInfo[];
  }[];
}

async function snapshotSchema(c: ConnectionPayload, onlySchema?: string): Promise<SchemaSnapshot> {
  const schemas = onlySchema ? [onlySchema] : await listSchemas(c);
  const tables: SchemaSnapshot['tables'] = [];
  for (const schema of schemas) {
    const tbls = await listTables(c, schema);
    for (const t of tbls) {
      if (t.type !== 'table') continue;
      const cols = await listColumns(c, t.name, schema);
      tables.push({ schema, name: t.name, columns: cols });
    }
  }
  return { database: c.database, tables };
}

interface SchemaDiffEntry {
  type: 'table_added' | 'table_removed' | 'column_added' | 'column_removed' | 'column_changed';
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
    if (!tgtTable) continue;
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
      if (!tgtCol) continue;
      const changes: string[] = [];
      if (srcCol.type !== tgtCol.type) changes.push(`type: ${srcCol.type} → ${tgtCol.type}`);
      if (srcCol.nullable !== tgtCol.nullable) changes.push(`nullable: ${srcCol.nullable} → ${tgtCol.nullable}`);
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

// ── IPC registration ───────────────────────────────────────────────────

export function registerDbIPC() {
  // test-connection
  ipcMain.handle('db:test-connection', async (_, { connection }: { connection: ConnectionPayload }) => {
    try {
      const db = getKnex(connection);
      await db.raw('SELECT 1');
      return { ok: true };
    } catch (err: any) {
      destroyKnex(connection);
      return { ok: false, error: err.message ?? String(err) };
    }
  });

  // disconnect
  ipcMain.handle('db:disconnect', async (_, { connection }: { connection: ConnectionPayload }) => {
    destroyKnex(connection);
    return { ok: true };
  });

  // execute
  ipcMain.handle('db:execute', async (_, { connection, query }: { connection: ConnectionPayload; query: string }) => {
    if (!query?.trim()) {
      return { status: 'error', message: 'Empty query', columns: [], rows: [], rowCount: 0, executionTime: 0 };
    }
    const db = getKnex(connection);
    const start = performance.now();
    const result = await db.raw(query);
    const elapsed = Math.round(performance.now() - start);
    const normalized = normalizeResult(connection.type, result);
    return { ...normalized, executionTime: elapsed };
  });

  // databases
  ipcMain.handle('db:databases', async (_, { connection }: { connection: ConnectionPayload }) => {
    const databases = await listDatabases(connection);
    return { databases };
  });

  // schemas
  ipcMain.handle('db:schemas', async (_, { connection }: { connection: ConnectionPayload }) => {
    const schemas = await listSchemas(connection);
    return { schemas };
  });

  // tables
  ipcMain.handle('db:tables', async (_, { connection, schema }: { connection: ConnectionPayload; schema?: string }) => {
    const tables = await listTables(connection, schema);
    return { tables };
  });

  // columns
  ipcMain.handle('db:columns', async (_, { connection, table, schema }: { connection: ConnectionPayload; table: string; schema?: string }) => {
    const columns = await listColumns(connection, table, schema);
    return { columns };
  });

  // row-count
  ipcMain.handle('db:row-count', async (_, { connection, table, schema }: { connection: ConnectionPayload; table: string; schema?: string }) => {
    const count = await getRowCount(connection, table, schema);
    return { count };
  });

  // create-database
  ipcMain.handle('db:create-database', async (_, { connection, name }: { connection: ConnectionPayload; name: string }) => {
    if (!name?.trim()) return { ok: false, error: 'Database name required' };
    validateIdentifier(name, 'database name');
    const db = getKnex(connection);
    if (connection.type === 'pg') await db.raw(`CREATE DATABASE "${name}"`);
    else if (connection.type === 'mysql') await db.raw(`CREATE DATABASE \`${name}\``);
    else if (connection.type === 'mssql') await db.raw(`CREATE DATABASE [${name}]`);
    else return { ok: false, error: 'SQLite does not support CREATE DATABASE' };
    return { ok: true };
  });

  // drop-database
  ipcMain.handle('db:drop-database', async (_, { connection, name }: { connection: ConnectionPayload; name: string }) => {
    if (!name?.trim()) return { ok: false, error: 'Database name required' };
    validateIdentifier(name, 'database name');
    const db = getKnex(connection);
    if (connection.type === 'pg') await db.raw(`DROP DATABASE "${name}"`);
    else if (connection.type === 'mysql') await db.raw(`DROP DATABASE \`${name}\``);
    else if (connection.type === 'mssql') await db.raw(`DROP DATABASE [${name}]`);
    else return { ok: false, error: 'SQLite does not support DROP DATABASE' };
    return { ok: true };
  });

  // drop-table
  ipcMain.handle('db:drop-table', async (_, { connection, table, schema }: { connection: ConnectionPayload; table: string; schema?: string }) => {
    validateIdentifier(table, 'table name');
    if (schema) validateIdentifier(schema, 'schema name');
    const db = getKnex(connection);
    const qualified = connection.type === 'sqlite' ? `"${table}"` : `"${schema ?? 'public'}"."${table}"`;
    await db.raw(`DROP TABLE ${qualified}`);
    return { ok: true };
  });

  // truncate-table
  ipcMain.handle('db:truncate-table', async (_, { connection, table, schema }: { connection: ConnectionPayload; table: string; schema?: string }) => {
    validateIdentifier(table, 'table name');
    if (schema) validateIdentifier(schema, 'schema name');
    const db = getKnex(connection);
    const qualified = connection.type === 'sqlite' ? `"${table}"` : `"${schema ?? 'public'}"."${table}"`;
    if (connection.type === 'sqlite') await db.raw(`DELETE FROM ${qualified}`);
    else await db.raw(`TRUNCATE TABLE ${qualified}`);
    return { ok: true };
  });

  // create-schema
  ipcMain.handle('db:create-schema', async (_, { connection, name }: { connection: ConnectionPayload; name: string }) => {
    validateIdentifier(name, 'schema name');
    const db = getKnex(connection);
    if (connection.type === 'pg') await db.raw(`CREATE SCHEMA "${name}"`);
    else if (connection.type === 'mssql') await db.raw(`CREATE SCHEMA [${name}]`);
    else return { ok: false, error: 'Not supported for this database type' };
    return { ok: true };
  });

  // schema-diff
  ipcMain.handle('db:schema-diff', async (_, { source, target, sourceSchema, targetSchema }: { source: ConnectionPayload; target: ConnectionPayload; sourceSchema?: string; targetSchema?: string }) => {
    const [srcSnap, tgtSnap] = await Promise.all([
      snapshotSchema(source, sourceSchema),
      snapshotSchema(target, targetSchema),
    ]);
    const diffs = diffSnapshots(srcSnap, tgtSnap);
    const migrationUp = diffs.map((d) => d.migrationUp).filter(Boolean).join('\n\n');
    const migrationDown = diffs.map((d) => d.migrationDown).filter(Boolean).join('\n\n');
    const srcLabel = sourceSchema ? `${srcSnap.database}.${sourceSchema}` : srcSnap.database;
    const tgtLabel = targetSchema ? `${tgtSnap.database}.${targetSchema}` : tgtSnap.database;
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
