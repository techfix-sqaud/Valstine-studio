import type { DBType } from './mock-data';

// SQL keywords that should start on their own line (order matters — longer patterns first)
const CLAUSE_BREAKS = [
  'INSERT INTO', 'DELETE FROM', 'CREATE TABLE', 'CREATE INDEX', 'CREATE VIEW',
  'ALTER TABLE', 'DROP TABLE', 'DROP INDEX', 'DROP VIEW',
  'UNION ALL', 'UNION', 'EXCEPT ALL', 'EXCEPT', 'INTERSECT ALL', 'INTERSECT',
  'INNER JOIN', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
  'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING',
  'LIMIT', 'OFFSET', 'FETCH NEXT', 'WITH',
  'UPDATE', 'SET', 'VALUES', 'RETURNING', 'ON CONFLICT',
  'ON', 'JOIN',
];

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE',
  'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AS', 'DISTINCT',
  'ALL', 'TOP', 'LIMIT', 'OFFSET', 'ORDER', 'BY', 'GROUP', 'HAVING', 'UNION',
  'EXCEPT', 'INTERSECT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'TRUNCATE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX',
  'DATABASE', 'SCHEMA', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE',
  'NOT NULL', 'DEFAULT', 'CONSTRAINT', 'CHECK', 'CASCADE', 'RESTRICT',
  'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'JOIN', 'ON',
  'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK',
  'DENSE_RANK', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
  'CAST', 'CONVERT', 'RETURNING', 'IF', 'BEGIN', 'END', 'WHILE', 'DECLARE',
  'EXEC', 'EXECUTE', 'RETURN', 'TRANSACTION', 'COMMIT', 'ROLLBACK',
  'SAVEPOINT', 'GRANT', 'REVOKE', 'ILIKE', 'SIMILAR', 'ISNULL',
]);

// Tokenizer: produces a flat list of tokens preserving string literals, comments, identifiers
interface Token {
  type: 'word' | 'string' | 'comment-line' | 'comment-block' | 'punct' | 'whitespace' | 'newline';
  value: string;
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    // Single-line comment
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const comment = end === -1 ? sql.slice(i) : sql.slice(i, end + 1);
      tokens.push({ type: 'comment-line', value: comment });
      i += comment.length;
      continue;
    }

    // Block comment
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const comment = end === -1 ? sql.slice(i) : sql.slice(i, end + 2);
      tokens.push({ type: 'comment-block', value: comment });
      i += comment.length;
      continue;
    }

    // String literals (single, double, backtick)
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < len) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; } // escaped quote
          break;
        }
        if (sql[j] === '\\') j++; // backslash escape
        j++;
      }
      tokens.push({ type: 'string', value: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Whitespace
    if (ch === '\n') {
      tokens.push({ type: 'newline', value: '\n' });
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < len && sql[j] !== '\n' && /\s/.test(sql[j])) j++;
      tokens.push({ type: 'whitespace', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    // Word / identifier
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_$]/.test(sql[j])) j++;
      tokens.push({ type: 'word', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[0-9._e+\-]/.test(sql[j])) j++;
      tokens.push({ type: 'word', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    // Punctuation
    tokens.push({ type: 'punct', value: ch });
    i++;
  }

  return tokens;
}

// Reconstruct word tokens, uppercasing keywords
function processTokens(tokens: Token[]): Token[] {
  return tokens.map(tok => {
    if (tok.type !== 'word') return tok;
    const up = tok.value.toUpperCase();
    if (SQL_KEYWORDS.has(up)) return { ...tok, value: up };
    return tok;
  });
}

export function formatSQL(sql: string): string {
  if (!sql.trim()) return sql;

  // Split by semicolon at the top level (outside parens/strings)
  const statements = splitStatements(sql);
  return statements.map(s => formatStatement(s.trim())).filter(Boolean).join('\n\n');
}

function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      if (ch === inStr && sql[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (ch === ';' && depth === 0) {
      const stmt = sql.slice(start, i).trim();
      if (stmt) stmts.push(stmt + ';');
      start = i + 1;
    }
  }
  const last = sql.slice(start).trim();
  if (last) stmts.push(last);
  return stmts;
}

function formatStatement(sql: string): string {
  if (!sql) return '';

  const tokens = processTokens(tokenize(sql));
  // Flatten tokens — skip original whitespace/newlines (we reformat those)
  const words: Token[] = tokens.filter(t => t.type !== 'whitespace' && t.type !== 'newline');

  // Rebuild with proper spacing
  const output: string[] = [];
  let depth = 0; // paren depth (for indentation)
  let lineStart = true;

  function push(text: string) {
    if (lineStart && text.trim()) {
      const indent = '  '.repeat(Math.max(0, depth));
      output.push(indent + text);
      lineStart = false;
    } else if (!lineStart) {
      output.push(text);
    }
  }

  function pushBreak(text: string) {
    output.push('\n');
    lineStart = true;
    push(text);
  }

  for (let i = 0; i < words.length; i++) {
    const tok = words[i];
    const next = words[i + 1];

    if (tok.type === 'comment-line' || tok.type === 'comment-block') {
      pushBreak(tok.value.trimEnd());
      output.push('\n');
      lineStart = true;
      continue;
    }

    if (tok.type === 'punct') {
      if (tok.value === '(') {
        push('(');
        depth++;
        continue;
      }
      if (tok.value === ')') {
        depth = Math.max(0, depth - 1);
        push(')');
        continue;
      }
      if (tok.value === ',') {
        if (depth === 0) {
          // Top-level commas: column list — put on new line
          push(',');
          output.push('\n');
          lineStart = true;
        } else {
          push(', ');
        }
        continue;
      }
      if (tok.value === ';') {
        push(';');
        continue;
      }
      // Operators: = <> != < > <= >= + - * / %
      if (/[=<>!+\-*/%|&^~]/.test(tok.value)) {
        push(` ${tok.value} `);
        continue;
      }
      push(tok.value);
      continue;
    }

    if (tok.type === 'word') {
      const up = tok.value;

      // Check multi-word clause breaks (longest match first)
      let matched = false;
      for (const clause of CLAUSE_BREAKS) {
        const clauseWords = clause.split(' ');
        if (clauseWords.length > 1) {
          const futureWords = words.slice(i, i + clauseWords.length).map(t => t.value.toUpperCase());
          if (futureWords.join(' ') === clause) {
            if (!lineStart) {
              output.push('\n');
              lineStart = true;
            }
            push(clause);
            output.push(' ');
            lineStart = false;
            i += clauseWords.length - 1;
            matched = true;
            break;
          }
        }
      }
      if (matched) continue;

      // Single-word clause break
      if (CLAUSE_BREAKS.includes(up) && depth === 0) {
        if (!lineStart) {
          output.push('\n');
          lineStart = true;
        }
        push(up);
        // Add space before next token (not newline)
        if (next && next.type !== 'punct') output.push(' ');
        lineStart = false;
        continue;
      }

      // AND / OR at depth 0: break before them
      if ((up === 'AND' || up === 'OR') && depth === 0) {
        if (!lineStart) {
          output.push('\n');
          lineStart = true;
        }
        push(up + ' ');
        lineStart = false;
        continue;
      }

      // Normal word
      if (!lineStart) output.push(' ');
      push(up);
      lineStart = false;
      continue;
    }

    // String literals etc.
    if (!lineStart) output.push(' ');
    push(tok.value);
    lineStart = false;
  }

  return output.join('').trimEnd();
}

// ── SQL Dialect Translation ──────────────────────────────────────────────────

export interface TranslationResult {
  sql: string;
  changes: string[];
}

interface Rule {
  label: string;
  pattern: RegExp;
  replacement: string | ((...args: string[]) => string);
}

/** Apply regex replacement only outside string literals and comments */
function applyOutsideStrings(sql: string, pattern: RegExp, replacement: string | ((...args: string[]) => string)): string {
  const parts: string[] = [];
  let last = 0;
  // Split into safe (outside strings) and string-literal regions
  const strRe = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|--[^\n]*|\/\*[\s\S]*?\*\/)/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(sql)) !== null) {
    // process the non-string segment before this match
    const before = sql.slice(last, m.index);
    parts.push(typeof replacement === 'function'
      ? before.replace(pattern, replacement as any)
      : before.replace(pattern, replacement));
    parts.push(m[0]); // preserve string/comment verbatim
    last = m.index + m[0].length;
  }
  const tail = sql.slice(last);
  parts.push(typeof replacement === 'function'
    ? tail.replace(pattern, replacement as any)
    : tail.replace(pattern, replacement));
  return parts.join('');
}

function applyRules(sql: string, rules: Rule[]): { sql: string; changes: string[] } {
  const changes: string[] = [];
  let out = sql;
  for (const rule of rules) {
    const next = applyOutsideStrings(out, rule.pattern, rule.replacement as any);
    if (next !== out) changes.push(rule.label);
    out = next;
  }
  return { sql: out, changes };
}

// ── Handle LIMIT n → SELECT TOP n (pg/mysql/sqlite → mssql) ─────────────────
function limitToTop(sql: string): { sql: string; changed: boolean } {
  // Match LIMIT n [OFFSET m] at end of statement (outside parens)
  const limitRe = /\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?\s*;?\s*$/i;
  const m = limitRe.exec(sql);
  if (!m) return { sql, changed: false };
  const n = m[1];
  const offset = m[2];
  // Remove LIMIT/OFFSET clause
  let out = sql.slice(0, m.index).trimEnd();
  // Inject TOP n after SELECT (first occurrence, outside strings — simple heuristic)
  const selRe = /\bSELECT\b/i;
  out = out.replace(selRe, `SELECT TOP ${n}`);
  if (offset) out += `\n-- OFFSET ${offset}: use OFFSET ${offset} ROWS FETCH NEXT ${n} ROWS ONLY syntax in SQL Server 2012+`;
  return { sql: out, changed: true };
}

// ── Handle SELECT TOP n → LIMIT n (mssql → pg/mysql/sqlite) ─────────────────
function topToLimit(sql: string): { sql: string; changed: boolean } {
  const topRe = /\bSELECT\s+TOP\s+(\d+)\b/i;
  const m = topRe.exec(sql);
  if (!m) return { sql, changed: false };
  const n = m[1];
  const out = sql.replace(topRe, 'SELECT') + `\nLIMIT ${n}`;
  return { sql: out, changed: true };
}

// ── Rule sets per translation pair ──────────────────────────────────────────

const PG_TO_MSSQL: Rule[] = [
  { label: 'SERIAL → INT IDENTITY(1,1)', pattern: /\bSERIAL\b/gi, replacement: 'INT IDENTITY(1,1)' },
  { label: 'BIGSERIAL → BIGINT IDENTITY(1,1)', pattern: /\bBIGSERIAL\b/gi, replacement: 'BIGINT IDENTITY(1,1)' },
  { label: 'SMALLSERIAL → SMALLINT IDENTITY(1,1)', pattern: /\bSMALLSERIAL\b/gi, replacement: 'SMALLINT IDENTITY(1,1)' },
  { label: 'BOOLEAN → BIT', pattern: /\bBOOLEAN\b/gi, replacement: 'BIT' },
  { label: 'TEXT → NVARCHAR(MAX)', pattern: /\bTEXT\b/gi, replacement: 'NVARCHAR(MAX)' },
  { label: 'NOW() → GETDATE()', pattern: /\bNOW\s*\(\)/gi, replacement: 'GETDATE()' },
  { label: 'CURRENT_DATE → CAST(GETDATE() AS DATE)', pattern: /\bCURRENT_DATE\b/gi, replacement: 'CAST(GETDATE() AS DATE)' },
  { label: 'CURRENT_TIMESTAMP → GETDATE()', pattern: /\bCURRENT_TIMESTAMP\b/gi, replacement: 'GETDATE()' },
  { label: 'ILIKE → LIKE', pattern: /\bILIKE\b/gi, replacement: 'LIKE' },
  { label: 'TRUE → 1', pattern: /\bTRUE\b/g, replacement: '1' },
  { label: 'FALSE → 0', pattern: /\bFALSE\b/g, replacement: '0' },
  { label: 'LENGTH() → LEN()', pattern: /\bLENGTH\s*\(/gi, replacement: 'LEN(' },
  { label: '|| (concat) → +', pattern: /\s*\|\|\s*/g, replacement: ' + ' },
  { label: 'RETURNING → OUTPUT INSERTED.*', pattern: /\bRETURNING\b\s+\*/gi, replacement: 'OUTPUT INSERTED.*' },
  { label: 'RETURNING (clause) → comment', pattern: /\bRETURNING\b([^\n;]*)/gi, replacement: '-- RETURNING$1 [translate manually to OUTPUT INSERTED.*]' },
  { label: '"identifier" → [identifier]', pattern: /"([a-zA-Z_][a-zA-Z0-9_ ]*?)"/g, replacement: '[$1]' },
];

const MSSQL_TO_PG: Rule[] = [
  { label: 'GETDATE() → NOW()', pattern: /\bGETDATE\s*\(\)/gi, replacement: 'NOW()' },
  { label: 'GETUTCDATE() → NOW() AT TIME ZONE UTC', pattern: /\bGETUTCDATE\s*\(\)/gi, replacement: "(NOW() AT TIME ZONE 'UTC')" },
  { label: 'ISNULL(a,b) → COALESCE(a,b)', pattern: /\bISNULL\s*\(/gi, replacement: 'COALESCE(' },
  { label: 'LEN() → LENGTH()', pattern: /\bLEN\s*\(/gi, replacement: 'LENGTH(' },
  { label: 'NVARCHAR(MAX) → TEXT', pattern: /\bNVARCHAR\s*\(\s*MAX\s*\)/gi, replacement: 'TEXT' },
  { label: 'NVARCHAR(n) → VARCHAR(n)', pattern: /\bNVARCHAR\s*\((\d+)\)/gi, replacement: 'VARCHAR($1)' },
  { label: 'NCHAR(n) → CHAR(n)', pattern: /\bNCHAR\s*\((\d+)\)/gi, replacement: 'CHAR($1)' },
  { label: 'BIT → BOOLEAN', pattern: /\bBIT\b/gi, replacement: 'BOOLEAN' },
  { label: '[identifier] → "identifier"', pattern: /\[([a-zA-Z_][a-zA-Z0-9_ ]*?)\]/g, replacement: '"$1"' },
  { label: 'IDENTITY(1,1) → SERIAL', pattern: /\bINT\s+IDENTITY\s*\(\s*1\s*,\s*1\s*\)/gi, replacement: 'SERIAL' },
  { label: 'BIGINT IDENTITY(1,1) → BIGSERIAL', pattern: /\bBIGINT\s+IDENTITY\s*\(\s*1\s*,\s*1\s*\)/gi, replacement: 'BIGSERIAL' },
  { label: 'CONVERT(type, val) → CAST(val AS type)', pattern: /\bCONVERT\s*\(\s*(\w+(?:\([^)]*\))?)\s*,\s*([^)]+)\)/gi, replacement: 'CAST($2 AS $1)' },
  { label: 'OUTPUT INSERTED.* → RETURNING *', pattern: /\bOUTPUT\s+INSERTED\.\*/gi, replacement: 'RETURNING *' },
];

const PG_TO_MYSQL: Rule[] = [
  { label: 'SERIAL → INT AUTO_INCREMENT', pattern: /\bSERIAL\b/gi, replacement: 'INT AUTO_INCREMENT' },
  { label: 'BIGSERIAL → BIGINT AUTO_INCREMENT', pattern: /\bBIGSERIAL\b/gi, replacement: 'BIGINT AUTO_INCREMENT' },
  { label: 'SMALLSERIAL → SMALLINT AUTO_INCREMENT', pattern: /\bSMALLSERIAL\b/gi, replacement: 'SMALLINT AUTO_INCREMENT' },
  { label: 'TEXT → LONGTEXT', pattern: /\bTEXT\b/gi, replacement: 'LONGTEXT' },
  { label: 'ILIKE → LIKE', pattern: /\bILIKE\b/gi, replacement: 'LIKE' },
  { label: 'TRUE → 1', pattern: /\bTRUE\b/g, replacement: '1' },
  { label: 'FALSE → 0', pattern: /\bFALSE\b/g, replacement: '0' },
  { label: '|| (concat) → CONCAT(a, b)', pattern: /(.+?)\s*\|\|\s*(.+)/g, replacement: 'CONCAT($1, $2)' },
  { label: 'RETURNING → comment (not supported)', pattern: /\bRETURNING\b([^\n;]*)/gi, replacement: '-- RETURNING$1 [not supported in MySQL]' },
  { label: '"identifier" → `identifier`', pattern: /"([a-zA-Z_][a-zA-Z0-9_]*?)"/g, replacement: '`$1`' },
];

const MYSQL_TO_PG: Rule[] = [
  { label: 'AUTO_INCREMENT → (use SERIAL type)', pattern: /\bINT\s+AUTO_INCREMENT\b/gi, replacement: 'SERIAL' },
  { label: 'BIGINT AUTO_INCREMENT → BIGSERIAL', pattern: /\bBIGINT\s+AUTO_INCREMENT\b/gi, replacement: 'BIGSERIAL' },
  { label: 'AUTO_INCREMENT → (removed)', pattern: /\s+AUTO_INCREMENT\b/gi, replacement: '' },
  { label: 'LONGTEXT → TEXT', pattern: /\bLONGTEXT\b/gi, replacement: 'TEXT' },
  { label: 'TINYINT(1) → BOOLEAN', pattern: /\bTINYINT\s*\(\s*1\s*\)/gi, replacement: 'BOOLEAN' },
  { label: 'IFNULL(a,b) → COALESCE(a,b)', pattern: /\bIFNULL\s*\(/gi, replacement: 'COALESCE(' },
  { label: 'IF(c,t,f) → CASE WHEN c THEN t ELSE f END', pattern: /\bIF\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi, replacement: 'CASE WHEN $1 THEN $2 ELSE $3 END' },
  { label: 'GROUP_CONCAT → STRING_AGG', pattern: /\bGROUP_CONCAT\s*\(([^)]+?)\s+SEPARATOR\s+'([^']+)'\)/gi, replacement: "STRING_AGG($1, '$2')" },
  { label: '`identifier` → "identifier"', pattern: /`([a-zA-Z_][a-zA-Z0-9_]*?)`/g, replacement: '"$1"' },
  { label: 'UNIX_TIMESTAMP() → EXTRACT(EPOCH FROM ...)', pattern: /\bUNIX_TIMESTAMP\s*\(([^)]+)\)/gi, replacement: 'EXTRACT(EPOCH FROM $1)' },
];

const PG_TO_SQLITE: Rule[] = [
  { label: 'SERIAL → INTEGER', pattern: /\bSERIAL\b/gi, replacement: 'INTEGER' },
  { label: 'BIGSERIAL → INTEGER', pattern: /\bBIGSERIAL\b/gi, replacement: 'INTEGER' },
  { label: 'NOW() → datetime(\'now\')', pattern: /\bNOW\s*\(\)/gi, replacement: "datetime('now')" },
  { label: 'CURRENT_DATE → date(\'now\')', pattern: /\bCURRENT_DATE\b/gi, replacement: "date('now')" },
  { label: 'ILIKE → LIKE', pattern: /\bILIKE\b/gi, replacement: 'LIKE' },
  { label: 'TRUE → 1', pattern: /\bTRUE\b/g, replacement: '1' },
  { label: 'FALSE → 0', pattern: /\bFALSE\b/g, replacement: '0' },
  { label: 'BOOLEAN → INTEGER', pattern: /\bBOOLEAN\b/gi, replacement: 'INTEGER' },
  { label: 'RETURNING → comment (limited support)', pattern: /\bRETURNING\b([^\n;]*)/gi, replacement: 'RETURNING$1 -- SQLite 3.35+ only' },
];

const SQLITE_TO_PG: Rule[] = [
  { label: 'datetime(\'now\') → NOW()', pattern: /\bdatetime\s*\(\s*'now'\s*\)/gi, replacement: 'NOW()' },
  { label: 'date(\'now\') → CURRENT_DATE', pattern: /\bdate\s*\(\s*'now'\s*\)/gi, replacement: 'CURRENT_DATE' },
  { label: 'INTEGER (auto PK) → SERIAL', pattern: /\bINTEGER\s+PRIMARY\s+KEY\b/gi, replacement: 'SERIAL PRIMARY KEY' },
];

const RULES: Partial<Record<`${DBType}-${DBType}`, Rule[]>> = {
  'pg-mssql': PG_TO_MSSQL,
  'mssql-pg': MSSQL_TO_PG,
  'pg-mysql': PG_TO_MYSQL,
  'mysql-pg': MYSQL_TO_PG,
  'pg-sqlite': PG_TO_SQLITE,
  'sqlite-pg': SQLITE_TO_PG,
  // Indirect: go via pg
};

/**
 * Translate SQL from one dialect to another.
 * Returns the translated SQL and a list of change descriptions.
 */
export function translateSqlDialect(sql: string, from: DBType, to: DBType): TranslationResult {
  if (from === to) return { sql, changes: [] };

  const directKey = `${from}-${to}` as `${DBType}-${DBType}`;
  const directRules = RULES[directKey];

  let workingSql = sql;
  let allChanges: string[] = [];

  if (directRules) {
    const { sql: translated, changes } = applyRules(workingSql, directRules);
    workingSql = translated;
    allChanges = changes;
  } else {
    // Fall back: translate via pg as an intermediate (e.g. mysql→sqlite goes mysql→pg→sqlite)
    const viaPgFrom = RULES[`${from}-pg` as `${DBType}-${DBType}`];
    const viaPgTo = RULES[`pg-${to}` as `${DBType}-${DBType}`];
    if (viaPgFrom) {
      const r = applyRules(workingSql, viaPgFrom);
      workingSql = r.sql;
      allChanges.push(...r.changes);
    }
    if (viaPgTo) {
      const r = applyRules(workingSql, viaPgTo);
      workingSql = r.sql;
      allChanges.push(...r.changes);
    }
  }

  // Handle LIMIT ↔ TOP separately (structural change)
  if (to === 'mssql') {
    const { sql: s, changed } = limitToTop(workingSql);
    if (changed) { workingSql = s; allChanges.unshift('LIMIT n → SELECT TOP n'); }
  }
  if (from === 'mssql' && to !== 'mssql') {
    const { sql: s, changed } = topToLimit(workingSql);
    if (changed) { workingSql = s; allChanges.unshift('SELECT TOP n → LIMIT n'); }
  }

  return { sql: workingSql, changes: [...new Set(allChanges)] };
}
