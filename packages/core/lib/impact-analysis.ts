import { QueryHistoryEntry } from "../store/app-store";

export type DDLRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DDLOperation {
  kind:
    | 'DROP_TABLE'
    | 'DROP_COLUMN'
    | 'RENAME_COLUMN'
    | 'ALTER_COLUMN_TYPE'
    | 'TRUNCATE'
    | 'RENAME_TABLE';
  table: string;
  schema?: string;
  column?: string;
  newName?: string;
  newType?: string;
}

export interface ImpactedQuery {
  id: string;
  query: string;
  executedAt: string;
  connectionName: string;
  matchReason: string;
}

export interface ImpactReport {
  operation: DDLOperation;
  risk: DDLRisk;
  riskScore: number; // 0–100
  summary: string;
  impactedQueries: ImpactedQuery[];
  suggestedMigration?: string;
  warnings: string[];
  /** Properly double-quoted SQL to execute — avoids PostgreSQL case-folding of mixed-case identifiers. */
  quotedSQL: string;
}

// ── Quoted DDL builder ────────────────────────────────────────────────────────
// Reconstructs DDL from the parsed operation with every identifier double-quoted,
// guaranteeing PostgreSQL preserves the exact case of mixed-case table/column names.

function qi(name: string | undefined): string {
  if (!name) return '""';
  return `"${name.replace(/"/g, '""')}"`;
}

export function buildQuotedSQL(op: DDLOperation): string {
  const tbl = op.schema ? `${qi(op.schema)}.${qi(op.table)}` : qi(op.table);
  switch (op.kind) {
    case 'DROP_TABLE':
      return `DROP TABLE ${tbl};`;
    case 'TRUNCATE':
      return `TRUNCATE TABLE ${tbl};`;
    case 'DROP_COLUMN':
      return `ALTER TABLE ${tbl} DROP COLUMN ${qi(op.column!)};`;
    case 'RENAME_COLUMN':
      return `ALTER TABLE ${tbl} RENAME COLUMN ${qi(op.column!)} TO ${qi(op.newName!)};`;
    case 'RENAME_TABLE':
      return `ALTER TABLE ${tbl} RENAME TO ${qi(op.newName!)};`;
    case 'ALTER_COLUMN_TYPE':
      return `ALTER TABLE ${tbl} ALTER COLUMN ${qi(op.column!)} TYPE ${op.newType!};`;
  }
}

// ── Lightweight regex-based DDL detector ──────────────────────────────────
// No heavy AST parser — order matters: more-specific patterns must come first.

// Each identifier slot uses "?(\w+)"? to match both plain and double-quoted identifiers
// (e.g. both oldVehiclesTable and "oldVehiclesTable"), stripping the quotes in the capture.
const DDL_PATTERNS: Array<{
  re: RegExp;
  extract: (m: RegExpMatchArray) => DDLOperation;
}> = [
  {
    // ALTER TABLE ["schema".]"table" DROP COLUMN [IF EXISTS] "col"
    re: /^\s*ALTER\s+TABLE\s+(?:"?(\w+)"?\.)?(?:"?(\w+)"?)\s+DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(?:"?(\w+)"?)/i,
    extract: m => ({ kind: 'DROP_COLUMN', schema: m[1], table: m[2], column: m[3] }),
  },
  {
    // ALTER TABLE ["schema".]"table" RENAME COLUMN "old" TO "new"
    re: /^\s*ALTER\s+TABLE\s+(?:"?(\w+)"?\.)?(?:"?(\w+)"?)\s+RENAME\s+(?:COLUMN\s+)?(?:"?(\w+)"?)\s+TO\s+(?:"?(\w+)"?)/i,
    extract: m => ({ kind: 'RENAME_COLUMN', schema: m[1], table: m[2], column: m[3], newName: m[4] }),
  },
  {
    // ALTER TABLE ["schema".]"table" RENAME TO "new_name"
    re: /^\s*ALTER\s+TABLE\s+(?:"?(\w+)"?\.)?(?:"?(\w+)"?)\s+RENAME\s+TO\s+(?:"?(\w+)"?)/i,
    extract: m => ({ kind: 'RENAME_TABLE', schema: m[1], table: m[2], newName: m[3] }),
  },
  {
    // ALTER TABLE ["schema".]"table" ALTER COLUMN "col" [SET DATA] TYPE new_type (PG)
    re: /^\s*ALTER\s+TABLE\s+(?:"?(\w+)"?\.)?(?:"?(\w+)"?)\s+ALTER\s+(?:COLUMN\s+)?(?:"?(\w+)"?)\s+(?:SET\s+DATA\s+)?TYPE\s+([\w\s(,)]+)/i,
    extract: m => ({ kind: 'ALTER_COLUMN_TYPE', schema: m[1], table: m[2], column: m[3], newType: m[4].trim() }),
  },
  {
    // ALTER TABLE ["schema".]"table" MODIFY [COLUMN] "col" type (MySQL)
    re: /^\s*ALTER\s+TABLE\s+(?:"?(\w+)"?\.)?(?:"?(\w+)"?)\s+MODIFY\s+(?:COLUMN\s+)?(?:"?(\w+)"?)\s+([\w]+)/i,
    extract: m => ({ kind: 'ALTER_COLUMN_TYPE', schema: m[1], table: m[2], column: m[3], newType: m[4].trim() }),
  },
  {
    // DROP TABLE [IF EXISTS] ["schema".]"table"
    re: /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?(\w+)"?\.)?(?:"?(\w+)"?)/i,
    extract: m => ({ kind: 'DROP_TABLE', schema: m[1], table: m[2] }),
  },
  {
    // TRUNCATE [TABLE] ["schema".]"table"
    re: /^\s*TRUNCATE\s+(?:TABLE\s+)?(?:"?(\w+)"?\.)?(?:"?(\w+)"?)/i,
    extract: m => ({ kind: 'TRUNCATE', schema: m[1], table: m[2] }),
  },
];

export function detectDDLOperation(sql: string): DDLOperation | null {
  const trimmed = sql.trim();
  for (const { re, extract } of DDL_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return extract(m);
  }
  return null;
}

// ── History mining ────────────────────────────────────────────────────────

function queriesReferencingTable(table: string, history: QueryHistoryEntry[]): QueryHistoryEntry[] {
  const re = new RegExp(`\\b${table}\\b`, 'i');
  return history.filter(h => re.test(h.query));
}

function queriesReferencingColumn(
  table: string,
  column: string,
  history: QueryHistoryEntry[],
): QueryHistoryEntry[] {
  const tableRe = new RegExp(`\\b${table}\\b`, 'i');
  const colRe = new RegExp(`\\b${column}\\b`, 'i');
  return history.filter(h => tableRe.test(h.query) && colRe.test(h.query));
}

// ── Risk scoring ──────────────────────────────────────────────────────────

const BASE_RISK: Record<DDLOperation['kind'], number> = {
  DROP_TABLE: 80,
  TRUNCATE: 70,
  DROP_COLUMN: 60,
  RENAME_TABLE: 50,
  RENAME_COLUMN: 40,
  ALTER_COLUMN_TYPE: 30,
};

const OP_SUMMARIES: Record<DDLOperation['kind'], (op: DDLOperation) => string> = {
  DROP_TABLE: op =>
    `Permanently deletes table "${op.table}" and all its data. This cannot be undone.`,
  TRUNCATE: op =>
    `Removes every row from "${op.table}" without row-level logging. Faster than DELETE but unrecoverable without a backup.`,
  DROP_COLUMN: op =>
    `Removes column "${op.column}" from "${op.table}". All stored values in that column will be permanently lost.`,
  RENAME_TABLE: op =>
    `Renames "${op.table}" to "${op.newName}". Every query, view, stored procedure, or ORM model that uses the old name will break immediately.`,
  RENAME_COLUMN: op =>
    `Renames column "${op.column}" to "${op.newName}" in "${op.table}". Any query that references the old column name will fail.`,
  ALTER_COLUMN_TYPE: op =>
    `Changes the type of "${op.column}" in "${op.table}" to ${op.newType}. Existing data that cannot be cast will cause the migration to fail or be silently truncated.`,
};

const MIGRATION_HINTS: Partial<Record<DDLOperation['kind'], (op: DDLOperation) => string>> = {
  DROP_TABLE: op => [
    `-- Safe approach: backup before dropping`,
    `CREATE TABLE "${op.table}_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}"`,
    `  AS SELECT * FROM "${op.table}";`,
    ``,
    `-- Verify backup is complete, then drop:`,
    `DROP TABLE "${op.table}";`,
  ].join('\n'),

  DROP_COLUMN: op => [
    `-- 1. Preserve data in a backup column first`,
    `ALTER TABLE "${op.table}" ADD COLUMN "${op.column}_removed_backup" TEXT;`,
    `UPDATE "${op.table}" SET "${op.column}_removed_backup" = "${op.column}"::TEXT;`,
    ``,
    `-- 2. Drop the original column after verifying the backup`,
    `ALTER TABLE "${op.table}" DROP COLUMN "${op.column}";`,
  ].join('\n'),

  RENAME_COLUMN: op => [
    `-- Zero-downtime approach: add alias, dual-write, then remove old`,
    `-- Step 1: add the new column`,
    `ALTER TABLE "${op.table}" ADD COLUMN "${op.newName}" <same_type_as_${op.column}>;`,
    `UPDATE "${op.table}" SET "${op.newName}" = "${op.column}";`,
    ``,
    `-- Step 2: after all app code is deployed using the new name:`,
    `ALTER TABLE "${op.table}" DROP COLUMN "${op.column}";`,
  ].join('\n'),

  RENAME_TABLE: op => [
    `-- Keep the old name as a view so existing queries don't break immediately`,
    `ALTER TABLE "${op.table}" RENAME TO "${op.newName}";`,
    `CREATE VIEW "${op.table}" AS SELECT * FROM "${op.newName}";`,
    ``,
    `-- After all callers are updated, drop the compatibility view:`,
    `DROP VIEW "${op.table}";`,
  ].join('\n'),
};

// ── Main export ───────────────────────────────────────────────────────────

export function analyzeImpact(
  sql: string,
  history: QueryHistoryEntry[],
): ImpactReport | null {
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    const op = detectDDLOperation(stmt);
    if (!op) continue;

    // Mine history for affected queries
    const raw = op.column
      ? queriesReferencingColumn(op.table, op.column, history)
      : queriesReferencingTable(op.table, history);

    // Deduplicate by first 200 chars of query body
    const seen = new Set<string>();
    const deduped = raw.filter(h => {
      const key = h.query.trim().slice(0, 200);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 15);

    const impactedQueries: ImpactedQuery[] = deduped.map(h => ({
      id: h.id,
      query: h.query,
      executedAt: h.executedAt,
      connectionName: h.connectionName,
      matchReason: op.column
        ? `References column "${op.column}" on table "${op.table}"`
        : `References table "${op.table}"`,
    }));

    // Score: base risk + up to 20 bonus points from history hits
    const riskScore = Math.min(BASE_RISK[op.kind] + Math.min(deduped.length * 4, 20), 100);
    const risk: DDLRisk =
      riskScore >= 80 ? 'CRITICAL' :
      riskScore >= 60 ? 'HIGH' :
      riskScore >= 40 ? 'MEDIUM' : 'LOW';

    const warnings: string[] = [];
    if (deduped.length > 0)
      warnings.push(`${deduped.length} historical quer${deduped.length === 1 ? 'y references' : 'ies reference'} this ${op.column ? 'column' : 'table'}.`);
    if (op.kind === 'DROP_TABLE' || op.kind === 'DROP_COLUMN')
      warnings.push('This operation is irreversible without a prior backup.');
    if (op.kind === 'ALTER_COLUMN_TYPE')
      warnings.push('Type changes may fail or truncate existing data if an implicit cast is not available.');
    if (op.kind === 'TRUNCATE')
      warnings.push('TRUNCATE bypasses row-level triggers and cannot be rolled back in some databases.');

    return {
      operation: op,
      risk,
      riskScore,
      summary: OP_SUMMARIES[op.kind](op),
      impactedQueries,
      suggestedMigration: MIGRATION_HINTS[op.kind]?.(op),
      warnings,
      quotedSQL: (() => { try { return buildQuotedSQL(op); } catch { return stmt; } })(),
    };
  }

  return null;
}
