import { sendAiChat } from './ai-client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SqlOptimizerResult {
  original_query: string;
  detected_engine: string;
  is_destructive: boolean;
  requires_user_confirmation: boolean;
  execution_query: string;
  error_warnings: string[];
  recycle_bin_action: {
    action_type: 'DROP_COLUMN' | 'DROP_TABLE' | 'DELETE_ROWS' | 'NONE';
    target_table: string;
    target_column: string;
    undo_sql: string;
  };
}

export interface RecycleBinEntry {
  id: string;
  timestamp: string;
  action_type: 'DROP_COLUMN' | 'DROP_TABLE' | 'DELETE_ROWS';
  target_table: string;
  target_column: string;
  original_query: string;
  execution_query: string;
  undo_sql: string;
  engine: string;
}

// ── Cheap pre-check ──────────────────────────────────────────────────────────
// Skip the AI call for read-only queries to avoid token waste and latency.

const MUTATION_RE = /\b(DROP|DELETE|TRUNCATE|ALTER\s+TABLE|UPDATE)\b/i;

export function isLikelyDestructive(sql: string): boolean {
  return MUTATION_RE.test(sql);
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildOptimizerPrompt(dbType: string, schemaContext: string): string {
  return `You are the core intelligence backend for a smart, multi-engine SQL Query Editor. \
Your job is to intercept a raw user-submitted SQL query, analyze it against the specific \
database engine rules and provided schema, and optimize it for safety and syntax \
compatibility before execution.

### ACTIVE ENGINE ENVIRONMENT
Database Type: ${dbType.toUpperCase()}

### CURRENT DATABASE SCHEMA REFERENCE
Use this schema to validate table names, column names, and casing:
${schemaContext || '(No schema available — use best judgment for the detected engine)'}

### YOUR MANDATORY TASKS:

1. AUTO-CORRECT IDENTIFIER CASING & QUOTING (Engine-Specific Rules)
Analyze the table and column names and compare them against the schema. Fix casing typos \
and apply the correct delimiter rules:
- PostgreSQL: double quotes for mixed-case/uppercase identifiers.
- MySQL: backticks when identifiers conflict with reserved words.
- SQL Server (mssql): square brackets [identifier].
- Oracle: double quotes for explicitly mixed-case names, otherwise uppercase.

2. AUTO-WRAP DESTRUCTIVE COMMANDS & TRANSACTION CHECK
- Detect: DROP, ALTER, DELETE, UPDATE, TRUNCATE.
- If destructive AND no explicit transaction block is present:
  * PostgreSQL / SQL Server: wrap in BEGIN; [Query]; — set requires_user_confirmation to true.
  * MySQL / Oracle: do NOT wrap (DDL commits implicitly). Copy original to execution_query, \
set requires_user_confirmation to true, add an error_warning about the implicit commit.

3. RECYCLE BIN METADATA GENERATION
- If dropping a column, dropping a table, or deleting rows, populate recycle_bin_action.
- undo_sql: Generate the COMPLETE SQL that restores the dropped/deleted object from schema \
context — column names, types, constraints, defaults, foreign keys. Make it fully executable.

### OUTPUT FORMAT
Respond ONLY with a valid JSON object. No markdown fences, no prose outside the JSON.

{
  "original_query": "string",
  "detected_engine": "string",
  "is_destructive": true,
  "requires_user_confirmation": true,
  "execution_query": "string",
  "error_warnings": ["string"],
  "recycle_bin_action": {
    "action_type": "DROP_COLUMN|DROP_TABLE|DELETE_ROWS|NONE",
    "target_table": "string",
    "target_column": "string (empty if not applicable)",
    "undo_sql": "string (full restoration SQL, or empty string if NONE)"
  }
}`;
}

// ── AI call ───────────────────────────────────────────────────────────────────

export async function callSqlOptimizer(
  sql: string,
  dbType: string,
  schemaContext: string,
): Promise<SqlOptimizerResult | null> {
  const systemPrompt = buildOptimizerPrompt(dbType, schemaContext);
  const messages = [
    {
      role: 'user' as const,
      content: `${systemPrompt}\n\n---\nAnalyze and optimize this SQL query:\n\`\`\`sql\n${sql}\n\`\`\``,
    },
  ];

  try {
    const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
    let data: { ok: boolean; content?: string; error?: string };

    if (electronAPI?.aiChat) {
      data = await electronAPI.aiChat(messages);
    } else {
      data = await sendAiChat(messages);
    }

    if (!data.ok || !data.content) return null;

    // Strip accidental markdown fences
    const raw = data.content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(raw) as SqlOptimizerResult;
  } catch {
    return null;
  }
}
