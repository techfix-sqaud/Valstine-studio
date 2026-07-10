import { useState, useRef, useCallback } from "react";
import { Edit3, Save, X, Check, AlertTriangle } from "lucide-react";
import { useSchemaCache } from "@/hooks/use-schema-cache";
import { useAppStore } from "@valstine/core/store/app-store";
import * as api from "@valstine/core/lib/api";
import { cn } from "@valstine/ui/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the fully-qualified, double-quoted table identifier from a FROM clause.
// Handles: schema.table  "schema"."table"  schema."Table"  "Table"  table
function extractTableName(sql: string): string | null {
  const m = sql.match(/\bFROM\s+("?\w+"?\s*\.\s*"?\w+"?|"?\w+"?)\s*(?:WHERE|LIMIT|ORDER|GROUP|HAVING|JOIN|$|;)/i);
  if (!m) return null;
  const raw = m[1].trim();

  // Split on the first unquoted dot (schema separator)
  const dotIdx = raw.search(/(?<!")\."?(?!")/);
  if (dotIdx !== -1) {
    // schema.table pair
    const schema = raw.slice(0, dotIdx).replace(/"/g, '');
    const table  = raw.slice(dotIdx + 1).replace(/"/g, '');
    return `"${schema}"."${table}"`;
  }

  const plain = raw.replace(/"/g, '');
  return /[A-Z]/.test(plain) ? `"${plain}"` : plain;
}

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function cellKey(row: number, col: string) {
  return `${row}:${col}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  onExitEdit: () => void;
}

export function EditableResultGrid({ columns, rows, onExitEdit }: Props) {
  const { connections, activeConnectionId, tabs, activeTabId } = useAppStore();
  const conn = connections.find((c) => c.id === activeConnectionId);
  const activeSQL = tabs.find((t) => t.id === activeTabId)?.content ?? "";

  const { cache } = useSchemaCache();

  const [dirtyCells, setDirtyCells] = useState<Map<string, string>>(new Map());
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── PK detection from schema cache ─────────────────────────────────────────
  const getPKCols = useCallback((): string[] => {
    const table = extractTableName(activeSQL);
    if (!table) return detectFallbackPKs(columns);

    // Try bare name, then schema-qualified variants from the cache
    const entry =
      cache.columnsByTable.get(table) ??
      cache.columnsByTable.get(`public.${table}`) ??
      [...cache.columnsByTable.entries()].find(([k]) => k.endsWith(`.${table}`))?.[1];

    const fromSchema = entry?.filter((c) => c.primaryKey).map((c) => c.name);
    return fromSchema?.length ? fromSchema : detectFallbackPKs(columns);
  }, [cache, activeSQL, columns]);

  // ── State helpers ──────────────────────────────────────────────────────────

  const getCellDisplay = (rowIdx: number, col: string): unknown => {
    const dirty = dirtyCells.get(cellKey(rowIdx, col));
    return dirty !== undefined ? dirty : rows[rowIdx]?.[col];
  };

  const commitEdit = (rowIdx: number, col: string, value: string) => {
    const original = String(rows[rowIdx]?.[col] ?? "");
    setDirtyCells((prev) => {
      const next = new Map(prev);
      if (value === original) {
        next.delete(cellKey(rowIdx, col));
      } else {
        next.set(cellKey(rowIdx, col), value);
      }
      return next;
    });
    setEditingCell(null);
  };

  const discardAll = () => {
    setDirtyCells(new Map());
    setEditingCell(null);
    setSaveState("idle");
    setSaveError(null);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveAll = async () => {
    if (!conn || dirtyCells.size === 0) return;
    const table = extractTableName(activeSQL);
    if (!table) {
      setSaveError("Cannot determine table name from query.");
      setSaveState("error");
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    const pks = getPKCols();

    // Group dirty cells by row index
    const byRow = new Map<number, Map<string, string>>();
    for (const [key, val] of dirtyCells) {
      const colonIdx = key.indexOf(":");
      const rowIdx = Number(key.slice(0, colonIdx));
      const col = key.slice(colonIdx + 1);
      if (!byRow.has(rowIdx)) byRow.set(rowIdx, new Map());
      byRow.get(rowIdx)!.set(col, val);
    }

    const statements: string[] = [];
    for (const [rowIdx, changes] of byRow) {
      const originalRow = rows[rowIdx];
      const setClauses = [...changes.entries()]
        .map(([col, val]) => `"${col}" = ${sqlLiteral(val)}`)
        .join(", ");
      const whereClauses = pks
        .filter((pk) => pk in originalRow)
        .map((pk) => `"${pk}" = ${sqlLiteral(originalRow[pk])}`)
        .join(" AND ");
      if (!whereClauses) continue;
      // table already includes schema + proper quoting from extractTableName
      statements.push(`UPDATE ${table} SET ${setClauses} WHERE ${whereClauses};`);
    }

    if (statements.length === 0) {
      setSaveError("Could not generate safe UPDATE (no primary key found in result set).");
      setSaveState("error");
      return;
    }

    try {
      for (const stmt of statements) {
        const result = await api.executeQuery(conn, stmt) as any;
        // Server returns { status: 'error', message } without throwing for SQL errors
        if (result?.status === "error") {
          throw new Error(result.message ?? "Query returned an error");
        }
      }
      setSaveState("saved");
      setDirtyCells(new Map());
      setTimeout(() => setSaveState("idle"), 2200);
    } catch (err: any) {
      setSaveState("error");
      setSaveError(err.message ?? "Save failed");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Save / discard bar (always visible in edit mode) */}
      <div className="flex items-center gap-2 px-3 py-1 shrink-0 border-b bg-primary/5 border-primary/25">
        <button
          onClick={() => { discardAll(); onExitEdit(); }}
          title="Exit edit mode"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium border bg-primary/15 text-primary border-primary/30 transition-colors hover:bg-primary/25"
        >
          <Edit3 className="h-3 w-3" />
          Editing
        </button>

        {dirtyCells.size === 0 ? (
          <span className="text-[11px] text-muted-foreground">
            Double-click a cell to edit · click <strong>Editing</strong> to exit
          </span>
        ) : (
          <>
            <span className="text-[11px] text-muted-foreground">
              {dirtyCells.size} unsaved change{dirtyCells.size !== 1 ? "s" : ""}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {saveState === "error" && saveError && (
                <span className="flex items-center gap-1 max-w-[260px] truncate text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {saveError}
                </span>
              )}
              <button
                onClick={discardAll}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-3 w-3" /> Discard
              </button>
              <button
                onClick={saveAll}
                disabled={saveState === "saving"}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {saveState === "saving" ? (
                  <div className="h-3 w-3 rounded-full border border-primary-foreground/60 border-t-transparent animate-spin" />
                ) : saveState === "saved" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="text-xs font-mono min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-panel-bg">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-1.5 text-left text-muted-foreground font-medium border-b border-r border-panel-border/70 last:border-r-0 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-secondary/30 transition-colors">
                {columns.map((col) => {
                  const isDirty = dirtyCells.has(cellKey(rowIdx, col));
                  const isEditing =
                    editingCell?.row === rowIdx && editingCell?.col === col;
                  const displayVal = getCellDisplay(rowIdx, col);

                  return (
                    <td
                      key={col}
                      onDoubleClick={() => setEditingCell({ row: rowIdx, col })}
                      className={cn(
                        "px-3 py-1 border-b border-r border-panel-border/60 last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis max-w-[260px]",
                        !isEditing && "cursor-pointer hover:bg-primary/5",
                        isDirty && "bg-yellow-500/10",
                        isEditing && "p-0 overflow-visible",
                      )}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          autoFocus
                          defaultValue={String(row[col] ?? "")}
                          onBlur={(e) => commitEdit(rowIdx, col, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEdit(rowIdx, col, (e.target as HTMLInputElement).value);
                            }
                            if (e.key === "Escape") setEditingCell(null);
                            if (e.key === "Tab") {
                              e.preventDefault();
                              commitEdit(rowIdx, col, (e.target as HTMLInputElement).value);
                              const nextColIdx = columns.indexOf(col) + 1;
                              if (nextColIdx < columns.length) {
                                setEditingCell({ row: rowIdx, col: columns[nextColIdx] });
                              }
                            }
                          }}
                          className="w-full h-full min-w-[80px] px-3 py-1 bg-primary/10 text-foreground outline outline-1 outline-primary font-mono text-xs"
                        />
                      ) : (
                        <span
                          className={cn(isDirty && "text-yellow-300")}
                          title={displayVal !== null && displayVal !== undefined ? String(displayVal) : undefined}
                        >
                          {displayVal === null || displayVal === undefined ? (
                            <span className="text-muted-foreground/40 italic">NULL</span>
                          ) : displayVal instanceof Date ? (
                            <span className="text-blue-300">
                              {displayVal.toISOString().replace("T", " ").replace(/\.000Z$/, " UTC")}
                            </span>
                          ) : typeof displayVal === "boolean" ? (
                            <span className={displayVal ? "text-green-400" : "text-red-400"}>
                              {String(displayVal)}
                            </span>
                          ) : (
                            String(displayVal)
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Fallback PK detection without schema cache ────────────────────────────────
// Looks for columns commonly used as primary keys when schema metadata is absent.

function detectFallbackPKs(columns: string[]): string[] {
  const candidates = ["id", "uuid", "pk", "key"];
  const found = candidates.filter((c) => columns.includes(c));
  return found.length ? found : columns.slice(0, 1);
}
