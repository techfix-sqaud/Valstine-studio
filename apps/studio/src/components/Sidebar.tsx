import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { AIChatSidebar } from "./AIChatSidebar";
import { DatabaseExplorer } from "./DatabaseExplorer";
import { ConnectionsList } from "./ConnectionsList";
import SchemaCompare from "./SchemaCompare";
import GitPanel from "./GitPanel";
import { useSchemaCache } from "@/hooks/use-schema-cache";
import * as api from "@/lib/api";
import {
  Search,
  FolderTree,
  Database,
  Sparkles,
  ArrowRightLeft,
  GitBranch,
  X,
  Table2,
  Columns3,
  Loader2,
  AlertTriangle,
  Rows3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const sidebarItems = [
  { id: "explorer" as const, icon: FolderTree, label: "Explorer" },
  { id: "connections" as const, icon: Database, label: "Connections" },
  { id: "search" as const, icon: Search, label: "Search" },
  { id: "ai" as const, icon: Sparkles, label: "AI Agent" },
  {
    id: "schema-compare" as const,
    icon: ArrowRightLeft,
    label: "Schema Compare",
  },
  { id: "git" as const, icon: GitBranch, label: "Source Control" },
] as const;

type SearchMode = "schema" | "data";

function SearchPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("schema");
  const { cache, fetchColumnsForTable } = useSchemaCache();
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);
  const activeConnection = useAppStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId),
  );
  const addTab = useAppStore((s) => s.addTab);

  // Data search state
  const [dataSearching, setDataSearching] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataResults, setDataResults] = useState<api.SearchResult[] | null>(null);
  const [dataSearchedTerm, setDataSearchedTerm] = useState("");
  const dataAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const normalizedQuery = query.trim().toLowerCase();
  const hasConnectedDatabase = activeConnection?.status === "connected";

  useEffect(() => {
    if (activeSidebarTab === "search") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [activeSidebarTab]);

  // Reset data results when switching modes or connection changes
  useEffect(() => {
    setDataResults(null);
    setDataError(null);
    setDataSearchedTerm("");
  }, [mode, activeConnection?.id]);

  // ── Schema mode helpers ──────────────────────────────────────────────────

  const matchingSchemas = useMemo(() => {
    if (!normalizedQuery) return cache.schemas.slice(0, 8);
    return cache.schemas.filter((schema) =>
      schema.toLowerCase().includes(normalizedQuery),
    );
  }, [cache.schemas, normalizedQuery]);

  const matchingTables = useMemo(() => {
    const tables = normalizedQuery
      ? cache.tables.filter(
          (table) =>
            table.fullName.toLowerCase().includes(normalizedQuery) ||
            table.name.toLowerCase().includes(normalizedQuery),
        )
      : cache.tables.slice(0, 12);
    return tables.slice(0, 24);
  }, [cache.tables, normalizedQuery]);

  useEffect(() => {
    if (mode !== "schema" || !normalizedQuery) return;
    const tablesToHydrate = matchingTables
      .filter((table) => !cache.columnsByTable.has(table.fullName))
      .slice(0, 8);
    if (tablesToHydrate.length === 0) return;
    let cancelled = false;
    async function hydrateColumns() {
      for (const table of tablesToHydrate) {
        if (cancelled) return;
        await fetchColumnsForTable(table.name, table.schema);
      }
    }
    hydrateColumns();
    return () => { cancelled = true; };
  }, [cache.columnsByTable, fetchColumnsForTable, matchingTables, normalizedQuery, mode]);

  const matchingColumns = useMemo(() => {
    if (!normalizedQuery || mode !== "schema") return [];
    const results: Array<{ fullName: string; schema: string; table: string; column: string; type: string }> = [];
    for (const table of matchingTables) {
      const columns = cache.columnsByTable.get(table.fullName) ?? [];
      for (const column of columns) {
        if (
          column.name.toLowerCase().includes(normalizedQuery) ||
          column.type.toLowerCase().includes(normalizedQuery)
        ) {
          results.push({ fullName: table.fullName, schema: table.schema, table: table.name, column: column.name, type: column.type });
        }
      }
    }
    return results.slice(0, 30);
  }, [cache.columnsByTable, matchingTables, normalizedQuery, mode]);

  const openTableQuery = (schema: string, table: string, column?: string, where?: string) => {
    const colList = column ? `"${column}"` : "*";
    const whereClause = where ? `\nWHERE "${column}" ILIKE '%${where}%'` : "";
    addTab({
      id: `tab-${Date.now()}`,
      title: `${table}.sql`,
      content: `SELECT ${colList}\nFROM "${schema}"."${table}"${whereClause}\nLIMIT 100;`,
      connectionId: activeConnection?.id ?? "",
      isDirty: false,
    });
  };

  // ── Data search ──────────────────────────────────────────────────────────

  async function runDataSearch() {
    if (!activeConnection || !query.trim()) return;
    dataAbortRef.current.cancelled = true;
    const guard = { cancelled: false };
    dataAbortRef.current = guard;

    setDataSearching(true);
    setDataError(null);
    setDataResults(null);
    setDataSearchedTerm(query.trim());

    try {
      const res = await api.searchDatabase(activeConnection, query.trim(), 5);
      if (guard.cancelled) return;
      if (!res.ok) {
        setDataError(res.error ?? "Search failed");
      } else {
        setDataResults(res.results);
      }
    } catch (e: any) {
      if (!guard.cancelled) setDataError(e.message);
    } finally {
      if (!guard.cancelled) setDataSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && mode === "data") {
      e.preventDefault();
      runDataSearch();
    }
  }

  // Group data results by schema.table
  const groupedResults = useMemo(() => {
    if (!dataResults) return [];
    const map = new Map<string, { schema: string; table: string; columns: string[]; rows: Record<string, unknown>[] }>();
    for (const r of dataResults) {
      const key = `${r.schema}.${r.table}`;
      if (!map.has(key)) {
        map.set(key, { schema: r.schema, table: r.table, columns: [], rows: [] });
      }
      const entry = map.get(key)!;
      if (!entry.columns.includes(r.column)) entry.columns.push(r.column);
      for (const row of r.rows) {
        const already = entry.rows.some((existing) =>
          Object.keys(row).every((k) => existing[k] === row[k])
        );
        if (!already) entry.rows.push(row);
      }
    }
    return Array.from(map.values());
  }, [dataResults]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Search
      </div>

      {/* Mode toggle */}
      <div className="px-3 mb-2">
        <div className="flex rounded border border-border overflow-hidden text-[10px]">
          <button
            onClick={() => setMode("schema")}
            className={cn(
              "flex-1 py-1 px-2 transition-colors",
              mode === "schema" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Schema
          </button>
          <button
            onClick={() => setMode("data")}
            className={cn(
              "flex-1 py-1 px-2 transition-colors",
              mode === "data" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Find in Data
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="px-3">
        <div className="flex items-center gap-2 bg-secondary rounded px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "data" ? "Search for a value… (Enter)" : "Search schemas, tables, columns…"}
            className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          {query && (
            <button onClick={() => { setQuery(""); setDataResults(null); }} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {!hasConnectedDatabase ? (
          <div className="rounded border border-panel-border bg-secondary/20 p-3 text-[11px] text-muted-foreground">
            Connect to a database to search.
          </div>
        ) : mode === "schema" ? (
          <>
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Schemas</div>
              {matchingSchemas.length > 0 ? (
                <div className="space-y-1">
                  {matchingSchemas.map((schema) => (
                    <div key={schema} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{schema}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">No schema matches.</div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tables</div>
              {matchingTables.length > 0 ? (
                <div className="space-y-1">
                  {matchingTables.map((table) => (
                    <button
                      key={table.fullName}
                      onClick={() => openTableQuery(table.schema, table.name)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary/50 transition-colors"
                    >
                      <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{table.fullName}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">No table matches.</div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</div>
              {matchingColumns.length > 0 ? (
                <div className="space-y-1">
                  {matchingColumns.map((column) => (
                    <button
                      key={`${column.fullName}.${column.column}`}
                      onClick={() => openTableQuery(column.schema, column.table, column.column)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary/50 transition-colors"
                    >
                      <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{column.column}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {column.fullName} • {column.type}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : normalizedQuery ? (
                <div className="text-[11px] text-muted-foreground">No column matches yet.</div>
              ) : (
                <div className="text-[11px] text-muted-foreground">Type to search column names and data types.</div>
              )}
            </div>
          </>
        ) : (
          /* ── Data search mode ── */
          <>
            {!dataSearching && !dataResults && !dataError && (
              <div className="text-[11px] text-muted-foreground space-y-2">
                <p>Type a value (email, UUID, name, ID…) and press <span className="font-mono bg-secondary px-1 rounded">Enter</span> to find it across every table in the database.</p>
                <p className="text-[10px] opacity-70">Results are limited to 5 rows per table.</p>
              </div>
            )}

            {dataSearching && (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-[11px]">Scanning all tables…</span>
              </div>
            )}

            {dataError && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 rounded p-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{dataError}</span>
              </div>
            )}

            {dataResults && !dataSearching && (
              <>
                <div className="text-[10px] text-muted-foreground">
                  {groupedResults.length === 0
                    ? `No results for "${dataSearchedTerm}"`
                    : `Found in ${groupedResults.length} table${groupedResults.length === 1 ? "" : "s"} for "${dataSearchedTerm}"`}
                </div>

                {groupedResults.map((group) => (
                  <div key={`${group.schema}.${group.table}`} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Rows3 className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-[11px] font-medium text-foreground truncate">
                          {group.schema}.{group.table}
                        </span>
                      </div>
                      <button
                        onClick={() => openTableQuery(group.schema, group.table, group.columns[0], dataSearchedTerm)}
                        className="text-[10px] text-primary hover:underline shrink-0"
                      >
                        View all
                      </button>
                    </div>

                    <div className="text-[10px] text-muted-foreground">
                      Matched in: {group.columns.join(", ")}
                    </div>

                    {/* Row preview cards */}
                    <div className="space-y-1">
                      {group.rows.slice(0, 3).map((row, i) => {
                        const keys = Object.keys(row).slice(0, 4);
                        return (
                          <div
                            key={i}
                            className="rounded border border-border/50 bg-secondary/30 px-2 py-1.5 text-[10px] space-y-0.5 cursor-pointer hover:bg-secondary/50 transition-colors"
                            onClick={() => openTableQuery(group.schema, group.table, group.columns[0], dataSearchedTerm)}
                          >
                            {keys.map((k) => (
                              <div key={k} className="flex gap-1.5 overflow-hidden">
                                <span className="text-muted-foreground shrink-0 w-16 truncate">{k}</span>
                                <span className="truncate text-foreground">
                                  {row[k] === null ? <em className="text-muted-foreground">NULL</em> : String(row[k])}
                                </span>
                              </div>
                            ))}
                            {Object.keys(row).length > 4 && (
                              <div className="text-muted-foreground">+{Object.keys(row).length - 4} more columns</div>
                            )}
                          </div>
                        );
                      })}
                      {group.rows.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">
                          +{group.rows.length - 3} more rows shown
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SidebarContent() {
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);
  return (
    <>
      {activeSidebarTab === "explorer" && <DatabaseExplorer />}
      {activeSidebarTab === "connections" && <ConnectionsList />}
      {activeSidebarTab === "search" && <SearchPanel />}
      {activeSidebarTab === "ai" && <AIChatSidebar />}
      {activeSidebarTab === "schema-compare" && <SchemaCompare />}
      {activeSidebarTab === "git" && <GitPanel />}
    </>
  );
}

export function AppSidebar() {
  const { activeSidebarTab, setActiveSidebarTab, sidebarOpen, toggleSidebar } =
    useAppStore();
  const isMobile = useIsMobile();

  // Desktop: just fill the Panel container
  if (!isMobile) {
    return (
      <div className="h-full w-full bg-panel-bg overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <SidebarContent />
        </div>
      </div>
    );
  }

  // Mobile: slide-over drawer
  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={toggleSidebar}
        />
      )}
      <div
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 w-72 bg-panel-bg border-r border-panel-border flex flex-col",
          "transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Mobile tab nav */}
        <div className="flex items-center justify-between px-2 py-2 border-b border-panel-border shrink-0">
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSidebarTab(item.id)}
                title={item.label}
                className={cn(
                  "p-2 rounded transition-colors shrink-0",
                  activeSidebarTab === item.id
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground",
                )}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded hover:bg-secondary text-muted-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}
