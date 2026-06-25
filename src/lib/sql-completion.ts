import type * as Monaco from "monaco-editor";

// ── Schema cache types ────────────────────────────────────────────────

export interface ColumnMeta {
  name: string;
  type: string;
  primaryKey: boolean;
  nullable: boolean;
}

export interface TableMeta {
  name: string;
  schema: string;
  /** "schema.name" for qualified references */
  fullName: string;
  columns: ColumnMeta[] | null; // null = not yet fetched
}

export interface SchemaCache {
  connectionId: string;
  databases: string[];
  schemas: string[];
  tables: TableMeta[];
  /** Lookup: key = "schema.table" */
  columnsByTable: Map<string, ColumnMeta[]>;
  /** Tables currently being fetched so we don't double-fetch */
  fetchingColumns: Set<string>;
}

export function emptyCache(connectionId = ""): SchemaCache {
  return {
    connectionId,
    databases: [],
    schemas: [],
    tables: [],
    columnsByTable: new Map(),
    fetchingColumns: new Set(),
  };
}

// ── SQL keywords ──────────────────────────────────────────────────────

const KEYWORDS = [
  "SELECT","FROM","WHERE","AND","OR","NOT","IN","IS","NULL","LIKE","BETWEEN",
  "EXISTS","CASE","WHEN","THEN","ELSE","END","AS","DISTINCT","ALL","TOP","LIMIT",
  "OFFSET","ORDER","BY","GROUP","HAVING","UNION","EXCEPT","INTERSECT",
  "INSERT","INTO","VALUES","UPDATE","SET","DELETE","TRUNCATE","MERGE",
  "CREATE","ALTER","DROP","TABLE","VIEW","INDEX","DATABASE","SCHEMA",
  "PRIMARY","KEY","FOREIGN","REFERENCES","UNIQUE","NOT NULL","DEFAULT",
  "CONSTRAINT","CHECK","CASCADE","RESTRICT","SET NULL",
  "INNER","LEFT","RIGHT","FULL","CROSS","OUTER","JOIN","ON",
  "WITH","CTE","RECURSIVE","OVER","PARTITION","ROW_NUMBER","RANK",
  "DENSE_RANK","LAG","LEAD","FIRST_VALUE","LAST_VALUE","NTILE",
  "COUNT","SUM","AVG","MIN","MAX","COALESCE","NULLIF","ISNULL",
  "CAST","CONVERT","GETDATE","NOW","CURRENT_TIMESTAMP","DATEADD",
  "DATEDIFF","SUBSTRING","CHARINDEX","LEN","UPPER","LOWER","TRIM",
  "LTRIM","RTRIM","REPLACE","CONCAT","STRING_AGG","STUFF",
  "IF","BEGIN","END","WHILE","DECLARE","EXEC","EXECUTE","RETURN",
  "TRANSACTION","COMMIT","ROLLBACK","SAVEPOINT","GRANT","REVOKE",
  "ASC","DESC","NULLS","FIRST","LAST","BETWEEN","ILIKE","RLIKE",
  "ANY","SOME","EACH","OVERLAPS","SIMILAR","ESCAPE","COLLATE",
  "USE","GO","PRINT","RAISERROR","TRY","CATCH","THROW",
];

// ── Context parsing ───────────────────────────────────────────────────

/**
 * What kind of completion to offer based on text before the cursor.
 */
type CompletionCtx =
  | { type: "table_list" }
  | { type: "column_list"; tables: string[] }
  | { type: "schema_tables"; schema: string }
  | { type: "table_columns"; qualifier: string }
  | { type: "database_list" }
  | { type: "general"; tables: string[] };

/**
 * Given the text from line 1 col 1 up to the cursor, decide what to suggest.
 */
export function parseContext(text: string): CompletionCtx {
  // Normalise whitespace but preserve line breaks for alias tracking
  const t = text.trimEnd();

  // ─ Dot qualifier: schema. → tables OR table/alias. → columns ──────
  const dotMatch = t.match(/(\w+)\.\s*$/);
  if (dotMatch) {
    return { type: "table_columns", qualifier: dotMatch[1] };
  }

  // ─ After FROM / JOIN keywords → table list ────────────────────────
  if (
    /\b(?:FROM|JOIN|INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|UPDATE|INTO)\s+[\w]*$/i.test(t)
  ) {
    return { type: "table_list" };
  }

  // ─ After USE / CREATE|DROP DATABASE ──────────────────────────────
  if (/\b(?:USE|DATABASE)\s+\w*$/i.test(t)) {
    return { type: "database_list" };
  }

  // ─ General context — extract FROM tables for column suggestions ───
  return { type: "general", tables: extractTablesFromSql(t) };
}

/**
 * Extract table names / aliases referenced after FROM and JOIN clauses.
 * Returns aliases when present, otherwise the table name.
 */
function extractTablesFromSql(sql: string): string[] {
  const refs: { table: string; alias?: string }[] = [];
  const re =
    /\b(?:FROM|JOIN)\s+(?:(?:\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    refs.push({ table: m[1], alias: m[2] });
  }
  // Return alias if it exists, otherwise the table name
  return refs.map((r) => r.alias ?? r.table);
}

// ── Completion item builders ──────────────────────────────────────────

function mkRange(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };
}

const CK = {
  Keyword: 17 as Monaco.languages.CompletionItemKind, // Keyword
  Class: 5 as Monaco.languages.CompletionItemKind,    // Class (used for tables)
  Field: 3 as Monaco.languages.CompletionItemKind,    // Field (used for columns)
  Value: 13 as Monaco.languages.CompletionItemKind,   // Value (used for databases)
} as const;

function keywordItems(
  range: Monaco.IRange,
): Monaco.languages.CompletionItem[] {
  return KEYWORDS.map((kw) => ({
    label: kw,
    kind: CK.Keyword,
    insertText: kw,
    range,
    sortText: `z_${kw}`, // push keywords below schema objects
    detail: "SQL keyword",
  }));
}

function tableItems(
  tables: TableMeta[],
  range: Monaco.IRange,
  schemaHint?: string,
): Monaco.languages.CompletionItem[] {
  const filtered = schemaHint
    ? tables.filter((t) => t.schema.toLowerCase() === schemaHint.toLowerCase())
    : tables;

  return filtered.map((t) => ({
    label: { label: t.name, description: t.schema },
    kind: CK.Class,
    insertText: t.name,
    detail: `${t.schema} · table`,
    documentation: t.fullName,
    range,
    sortText: `a_${t.name}`,
  }));
}

function columnItems(
  columns: ColumnMeta[],
  tableName: string,
  range: Monaco.IRange,
): Monaco.languages.CompletionItem[] {
  return columns.map((c) => ({
    label: c.name,
    kind: CK.Field,
    insertText: c.name,
    detail: `${c.type}${c.primaryKey ? " 🔑" : ""}${c.nullable ? "" : " NOT NULL"}`,
    documentation: `${tableName}.${c.name} (${c.type})`,
    range,
    sortText: `a_${c.primaryKey ? "0" : "1"}_${c.name}`,
  }));
}

function databaseItems(
  databases: string[],
  range: Monaco.IRange,
): Monaco.languages.CompletionItem[] {
  return databases.map((db) => ({
    label: db,
    kind: CK.Value,
    insertText: db,
    detail: "database",
    range,
    sortText: `a_${db}`,
  }));
}

// ── Resolve qualifier against cache ──────────────────────────────────

function resolveQualifier(
  qualifier: string,
  cache: SchemaCache,
  textBefore: string,
): { kind: "schema"; name: string } | { kind: "table"; key: string; name: string } | null {
  const q = qualifier.toLowerCase();

  // 1. Direct schema match
  if (cache.schemas.some((s) => s.toLowerCase() === q)) {
    return { kind: "schema", name: qualifier };
  }

  // 2. Direct table match (unqualified)
  const tableMatch = cache.tables.find((t) => t.name.toLowerCase() === q);
  if (tableMatch) {
    return { kind: "table", key: tableMatch.fullName, name: tableMatch.name };
  }

  // 3. Alias resolution — scan the SQL for "FROM/JOIN tableName alias" or "AS alias"
  const aliasRe = /\b(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)\s+(?:AS\s+)?(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = aliasRe.exec(textBefore)) !== null) {
    const alias = m[3];
    const tableName = m[2];
    const schema = m[1];
    if (alias.toLowerCase() === q) {
      const hit = cache.tables.find(
        (t) =>
          t.name.toLowerCase() === tableName.toLowerCase() &&
          (!schema || t.schema.toLowerCase() === schema.toLowerCase()),
      );
      if (hit) {
        return { kind: "table", key: hit.fullName, name: hit.name };
      }
    }
  }

  return null;
}

// ── Main provider registration ────────────────────────────────────────

export type FetchColumnsFn = (
  tableName: string,
  schema: string,
) => Promise<ColumnMeta[]>;

export function registerSQLCompletion(
  monaco: typeof Monaco,
  /** Always returns the latest cache — use a ref in React */
  getCache: () => SchemaCache,
  fetchColumns: FetchColumnsFn,
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " "],

    async provideCompletionItems(
      model,
      position,
    ): Promise<Monaco.languages.CompletionList> {
      // Don't trigger on empty/whitespace-only lines
      const currentLine = model.getLineContent(position.lineNumber);
      const textUpToCursor = currentLine.slice(0, position.column - 1);
      if (!textUpToCursor.trim()) return { suggestions: [] };

      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const cache = getCache();
      const range = mkRange(model, position);
      const ctx = parseContext(textBefore);

      switch (ctx.type) {
        case "database_list":
          return { suggestions: databaseItems(cache.databases, range) };

        case "table_list":
          return {
            suggestions: [
              ...tableItems(cache.tables, range),
              ...keywordItems(range),
            ],
          };

        case "table_columns": {
          const resolved = resolveQualifier(ctx.qualifier, cache, textBefore);

          if (!resolved) {
            // Unknown qualifier — fall back to all tables + keywords
            return {
              suggestions: [
                ...tableItems(cache.tables, range),
                ...keywordItems(range),
              ],
            };
          }

          if (resolved.kind === "schema") {
            // "schema." → show tables in that schema
            return {
              suggestions: [
                ...tableItems(cache.tables, range, resolved.name),
                ...keywordItems(range),
              ],
            };
          }

          // "table/alias." → show columns
          const tableKey = resolved.key;
          let columns = cache.columnsByTable.get(tableKey);

          if (!columns && !cache.fetchingColumns.has(tableKey)) {
            // Lazy-fetch columns
            const [schema, tableName] = tableKey.includes(".")
              ? tableKey.split(".", 2)
              : ["public", tableKey];
            try {
              columns = await fetchColumns(tableName, schema);
              // Caller will update the cache — return what we got
            } catch {
              columns = [];
            }
          }

          if (columns) {
            return {
              suggestions: columnItems(columns, resolved.name, range),
            };
          }

          // Still loading — return empty; Monaco will re-trigger
          return { suggestions: [] };
        }

        case "column_list": {
          // Columns from specific referenced tables
          const allColumns: Monaco.languages.CompletionItem[] = [];
          for (const nameOrAlias of ctx.tables) {
            const resolved = resolveQualifier(nameOrAlias, cache, textBefore);
            if (resolved?.kind === "table") {
              const cols = cache.columnsByTable.get(resolved.key);
              if (cols) {
                allColumns.push(...columnItems(cols, resolved.name, range));
              }
            }
          }
          return {
            suggestions: allColumns.length
              ? [...allColumns, ...keywordItems(range)]
              : [...tableItems(cache.tables, range), ...keywordItems(range)],
          };
        }

        case "general": {
          const allColumns: Monaco.languages.CompletionItem[] = [];
          for (const nameOrAlias of ctx.tables) {
            const resolved = resolveQualifier(nameOrAlias, cache, textBefore);
            if (resolved?.kind === "table") {
              const cols = cache.columnsByTable.get(resolved.key);
              if (cols) {
                allColumns.push(...columnItems(cols, resolved.name, range));
              }
            }
          }
          return {
            suggestions: [
              ...allColumns,
              ...tableItems(cache.tables, range),
              ...keywordItems(range),
            ],
          };
        }
      }
    },
  });
}
