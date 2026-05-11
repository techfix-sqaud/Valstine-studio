import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { AIChatSidebar } from "./AIChatSidebar";
import { DatabaseExplorer } from "./DatabaseExplorer";
import { ConnectionsList } from "./ConnectionsList";
import SchemaCompare from "./SchemaCompare";
import GitPanel from "./GitPanel";
import { useSchemaCache } from "@/hooks/use-schema-cache";
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

function SearchPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const { cache, fetchColumnsForTable } = useSchemaCache();
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);
  const activeConnection = useAppStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId),
  );
  const addTab = useAppStore((s) => s.addTab);

  const normalizedQuery = query.trim().toLowerCase();
  const hasConnectedDatabase = activeConnection?.status === "connected";

  useEffect(() => {
    if (activeSidebarTab === "search") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [activeSidebarTab]);

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
    if (!normalizedQuery) return;

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

    return () => {
      cancelled = true;
    };
  }, [
    cache.columnsByTable,
    fetchColumnsForTable,
    matchingTables,
    normalizedQuery,
  ]);

  const matchingColumns = useMemo(() => {
    if (!normalizedQuery) return [];

    const results: Array<{
      fullName: string;
      schema: string;
      table: string;
      column: string;
      type: string;
    }> = [];

    for (const table of matchingTables) {
      const columns = cache.columnsByTable.get(table.fullName) ?? [];
      for (const column of columns) {
        if (
          column.name.toLowerCase().includes(normalizedQuery) ||
          column.type.toLowerCase().includes(normalizedQuery)
        ) {
          results.push({
            fullName: table.fullName,
            schema: table.schema,
            table: table.name,
            column: column.name,
            type: column.type,
          });
        }
      }
    }

    return results.slice(0, 30);
  }, [cache.columnsByTable, matchingTables, normalizedQuery]);

  const openTableQuery = (schema: string, table: string, column?: string) => {
    addTab({
      id: `tab-${Date.now()}`,
      title: `${table}.sql`,
      content: column
        ? `SELECT ${column}\nFROM ${schema}.${table}\nLIMIT 100;`
        : `SELECT *\nFROM ${schema}.${table}\nLIMIT 100;`,
      connectionId: activeConnection?.id ?? "",
      isDirty: false,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Search
      </div>
      <div className="px-3">
        <div className="flex items-center gap-2 bg-secondary rounded px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search schemas, tables, columns..."
            className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {!hasConnectedDatabase ? (
          <div className="rounded border border-panel-border bg-secondary/20 p-3 text-[11px] text-muted-foreground">
            Connect to a database to search schemas, tables, and columns.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Schemas
              </div>
              {matchingSchemas.length > 0 ? (
                <div className="space-y-1">
                  {matchingSchemas.map((schema) => (
                    <div
                      key={schema}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground"
                    >
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{schema}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  No schema matches.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tables
              </div>
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
                <div className="text-[11px] text-muted-foreground">
                  No table matches.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Columns
              </div>
              {matchingColumns.length > 0 ? (
                <div className="space-y-1">
                  {matchingColumns.map((column) => (
                    <button
                      key={`${column.fullName}.${column.column}`}
                      onClick={() =>
                        openTableQuery(
                          column.schema,
                          column.table,
                          column.column,
                        )
                      }
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
                <div className="text-[11px] text-muted-foreground">
                  No column matches yet.
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Type to search column names and data types.
                </div>
              )}
            </div>
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
