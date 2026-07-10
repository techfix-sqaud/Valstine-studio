import type { SchemaCache } from '@/lib/sql-completion';
import { DBConnection } from '@valstine/core/lib/mock-data';
import { QueryHistoryEntry } from '@valstine/core/store/app-store';

const MAX_TABLES = 30;
const MAX_COLS_PER_TABLE = 20;

// Produces a compact, token-efficient schema map from the live cache.
// Format: `• schema.table(col:type[PK][!], ...)` — one table per line.
export function buildSchemaContextBlock(
  cache: SchemaCache,
  conn: DBConnection | undefined,
): string {
  if (!conn || cache.tables.length === 0) return '';

  const lines: string[] = [
    `## Database`,
    `Connection: ${conn.name}  Engine: ${conn.type.toUpperCase()}  Database: ${conn.database}`,
  ];

  if (cache.schemas.length > 0)
    lines.push(`Schemas: ${cache.schemas.join(', ')}`);

  lines.push('');
  lines.push(`## Schema (${Math.min(cache.tables.length, MAX_TABLES)} / ${cache.tables.length} tables)`);

  let count = 0;
  for (const table of cache.tables) {
    if (count >= MAX_TABLES) break;
    const cols = cache.columnsByTable.get(table.fullName);
    if (cols && cols.length > 0) {
      const colStr = cols
        .slice(0, MAX_COLS_PER_TABLE)
        .map(c => `${c.name}:${c.type}${c.primaryKey ? '[PK]' : ''}${!c.nullable ? '!' : ''}`)
        .join(', ');
      lines.push(`• ${table.fullName}(${colStr})`);
    } else {
      lines.push(`• ${table.fullName}`);
    }
    count++;
  }

  return lines.join('\n');
}

// Builds the full context prefix injected before the user's message.
// The DO agent doesn't support a system role, so context is prepended
// to the first user message of each turn — matching the existing pattern
// in app-store.ts but now enriched with live schema data.
export function buildAIContextPrefix(
  cache: SchemaCache,
  conn: DBConnection | undefined,
  activeSQL: string,
  recentHistory: QueryHistoryEntry[],
): string {
  const sections: string[] = [];

  const schemaBlock = buildSchemaContextBlock(cache, conn);
  if (schemaBlock) sections.push(schemaBlock);

  if (activeSQL.trim()) {
    sections.push(
      `## Active Query in Editor\n\`\`\`sql\n${activeSQL.trim().slice(0, 800)}\n\`\`\``,
    );
  }

  if (recentHistory.length > 0) {
    const recent = recentHistory.slice(0, 5);
    const lines = recent.map(
      h => `- ${h.query.trim().slice(0, 120)}${h.query.length > 120 ? '…' : ''}`,
    );
    sections.push(`## Recently Executed Queries\n${lines.join('\n')}`);
  }

  sections.push(
    `## Instructions\nYou are a senior database engineer embedded in Valstine Studio. ` +
    `Always reference exact table and column names from the schema above. ` +
    `When generating SQL, match the ${conn?.type ?? 'SQL'} dialect. ` +
    `If asked about a table or column that is not in the schema, say so clearly. ` +
    `Be concise — lead with the SQL or answer, then explain briefly.`,
  );

  return sections.join('\n\n');
}
