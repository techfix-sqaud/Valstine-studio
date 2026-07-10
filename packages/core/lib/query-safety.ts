export type DestructiveOpType = 'delete' | 'update' | 'truncate' | 'drop-table' | 'drop-database' | 'drop-schema' | 'drop-column' | 'drop-view' | 'drop-index';

export interface DestructiveOp {
  type: DestructiveOpType;
  /** Primary object (table / database / schema) affected */
  target: string;
  /** Whether the operation lacks a WHERE clause, making it unbounded */
  isUnbounded: boolean;
  /** Human-readable description */
  description: string;
  /** A SELECT COUNT(*) query to estimate affected rows, or null when not applicable */
  countQuery: string | null;
  severity: 'critical' | 'warning';
}

// Strip leading/trailing whitespace and collapse internal runs
function normalise(sql: string) {
  return sql.trim().replace(/\s+/g, ' ');
}

/**
 * Inspect a single SQL statement for destructive patterns.
 * Returns `null` when the statement is safe.
 */
export function detectDestructiveOperation(sql: string): DestructiveOp | null {
  // Work only on the first statement (up to the first semicolon)
  const first = normalise(sql.split(';')[0]);

  // ─── DELETE ────────────────────────────────────────────────────────────────
  const delMatch = first.match(/^DELETE\s+FROM\s+([\w."[\]`]+)(.*)/i);
  if (delMatch) {
    const target = delMatch[1];
    const rest = delMatch[2].trim();
    const hasWhere = /\bWHERE\b/i.test(rest);
    return {
      type: 'delete',
      target,
      isUnbounded: !hasWhere,
      description: hasWhere
        ? `DELETE rows from ${target}`
        : `DELETE ALL rows from ${target} — no WHERE clause`,
      countQuery: hasWhere
        ? `SELECT COUNT(*) AS affected_rows FROM ${target} ${rest}`
        : `SELECT COUNT(*) AS affected_rows FROM ${target}`,
      severity: hasWhere ? 'warning' : 'critical',
    };
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  const updMatch = first.match(/^UPDATE\s+([\w."[\]`]+)\s+SET\s+(.*)/i);
  if (updMatch) {
    const target = updMatch[1];
    const rest = updMatch[2];
    const whereIdx = rest.search(/\bWHERE\b/i);
    const hasWhere = whereIdx !== -1;
    const whereClause = hasWhere ? rest.slice(whereIdx) : '';
    return {
      type: 'update',
      target,
      isUnbounded: !hasWhere,
      description: hasWhere
        ? `UPDATE rows in ${target}`
        : `UPDATE ALL rows in ${target} — no WHERE clause`,
      countQuery: hasWhere
        ? `SELECT COUNT(*) AS affected_rows FROM ${target} ${whereClause}`
        : `SELECT COUNT(*) AS affected_rows FROM ${target}`,
      severity: hasWhere ? 'warning' : 'critical',
    };
  }

  // ─── TRUNCATE ──────────────────────────────────────────────────────────────
  const truncMatch = first.match(/^TRUNCATE\s+(?:TABLE\s+)?([\w."[\]`]+)/i);
  if (truncMatch) {
    const target = truncMatch[1];
    return {
      type: 'truncate',
      target,
      isUnbounded: true,
      description: `TRUNCATE ${target} — removes ALL rows instantly, cannot be rolled back on some engines`,
      countQuery: `SELECT COUNT(*) AS affected_rows FROM ${target}`,
      severity: 'critical',
    };
  }

  // ─── DROP TABLE ────────────────────────────────────────────────────────────
  const dropTableMatch = first.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w."[\]`]+)/i);
  if (dropTableMatch) {
    const target = dropTableMatch[1];
    return {
      type: 'drop-table',
      target,
      isUnbounded: true,
      description: `DROP TABLE ${target} — permanently destroys the table and all its data`,
      countQuery: `SELECT COUNT(*) AS row_count FROM ${target}`,
      severity: 'critical',
    };
  }

  // ─── DROP DATABASE ─────────────────────────────────────────────────────────
  const dropDbMatch = first.match(/^DROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (dropDbMatch) {
    return {
      type: 'drop-database',
      target: dropDbMatch[1],
      isUnbounded: true,
      description: `DROP DATABASE ${dropDbMatch[1]} — permanently destroys the entire database`,
      countQuery: null,
      severity: 'critical',
    };
  }

  // ─── DROP SCHEMA ───────────────────────────────────────────────────────────
  const dropSchemaMatch = first.match(/^DROP\s+SCHEMA\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (dropSchemaMatch) {
    return {
      type: 'drop-schema',
      target: dropSchemaMatch[1],
      isUnbounded: true,
      description: `DROP SCHEMA ${dropSchemaMatch[1]} — permanently destroys the schema and all its objects`,
      countQuery: null,
      severity: 'critical',
    };
  }

  // ─── ALTER TABLE … DROP COLUMN ─────────────────────────────────────────────
  const dropColMatch = first.match(/^ALTER\s+TABLE\s+([\w."[\]`]+)\s+DROP\s+(?:COLUMN\s+)?(\w+)/i);
  if (dropColMatch) {
    return {
      type: 'drop-column',
      target: dropColMatch[1],
      isUnbounded: false,
      description: `DROP COLUMN ${dropColMatch[2]} from ${dropColMatch[1]}`,
      countQuery: null,
      severity: 'warning',
    };
  }

  // ─── DROP VIEW ─────────────────────────────────────────────────────────────
  const dropViewMatch = first.match(/^DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?([\w."[\]`]+)/i);
  if (dropViewMatch) {
    return {
      type: 'drop-view',
      target: dropViewMatch[1],
      isUnbounded: false,
      description: `DROP VIEW ${dropViewMatch[1]}`,
      countQuery: null,
      severity: 'warning',
    };
  }

  // ─── DROP INDEX ────────────────────────────────────────────────────────────
  const dropIdxMatch = first.match(/^DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?([\w."[\]`]+)/i);
  if (dropIdxMatch) {
    return {
      type: 'drop-index',
      target: dropIdxMatch[1],
      isUnbounded: false,
      description: `DROP INDEX ${dropIdxMatch[1]}`,
      countQuery: null,
      severity: 'warning',
    };
  }

  return null;
}

/** Labels shown in the safety guard modal */
export const SEVERITY_LABELS: Record<DestructiveOp['severity'], { label: string; color: string }> = {
  critical: { label: 'CRITICAL', color: 'text-destructive' },
  warning: { label: 'WARNING', color: 'text-yellow-500' },
};
