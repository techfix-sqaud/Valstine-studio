import type { ColumnInfo, ConnectionPayload, DbAdapter, SchemaSnapshot, SearchMatch } from './types.js';

// snapshotSchema is identical across every SQL adapter — it only composes
// listSchemas/listTables/listColumns, which each adapter already implements.
export async function snapshotSchemaGeneric(
  c: ConnectionPayload,
  adapter: Pick<DbAdapter, 'listSchemas' | 'listTables' | 'listColumns'>,
  onlySchema?: string,
): Promise<SchemaSnapshot> {
  const schemas = onlySchema ? [onlySchema] : await adapter.listSchemas(c);
  const tables: SchemaSnapshot['tables'] = [];
  for (const schema of schemas) {
    const tbls = await adapter.listTables(c, schema);
    for (const t of tbls) {
      if (t.type !== 'table') continue;
      const cols = await adapter.listColumns(c, t.name, schema);
      tables.push({ schema, name: t.name, columns: cols });
    }
  }
  return { database: c.database, tables };
}

// search shares the same schema/table/column walk across adapters; only the
// dialect-specific WHERE-clause + raw query (runTableSearch) differs per type.
export async function searchGeneric(
  c: ConnectionPayload,
  adapter: Pick<DbAdapter, 'listSchemas' | 'listTables' | 'listColumns'>,
  runTableSearch: (schema: string, table: string, cols: ColumnInfo[], term: string, maxPerTable: number) => Promise<Record<string, unknown>[]>,
  term: string,
  maxPerTable = 5,
): Promise<SearchMatch[]> {
  const limit = Math.min(maxPerTable, 20);
  const schemas = await adapter.listSchemas(c);
  const results: SearchMatch[] = [];
  for (const schema of schemas) {
    const tables = await adapter.listTables(c, schema);
    for (const t of tables) {
      if (t.type !== 'table') continue;
      const cols = await adapter.listColumns(c, t.name, schema);
      if (!cols.length) continue;
      try {
        const rows = await runTableSearch(schema, t.name, cols, term, limit);
        if (rows.length > 0) {
          const matchingCols = cols
            .filter((col) => rows.some((r) => String(r[col.name] ?? '').toLowerCase().includes(term.toLowerCase())))
            .map((col) => col.name);
          results.push({ schema, table: t.name, column: matchingCols.join(', '), rows: rows.slice(0, limit) });
        }
      } catch {
        // skip tables that can't be searched
      }
    }
  }
  return results;
}
