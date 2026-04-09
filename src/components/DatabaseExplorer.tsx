import { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Table2,
  Columns3,
  Key,
  Database,
  FolderOpen,
  Folder,
  Eye,
  RefreshCw,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { showContextMenu } from "./ContextMenu";
import * as api from "@/lib/api";
import { DB_TYPE_META } from "@/lib/api";

// ── Column node ──
function ColumnItem({
  col,
  tableName,
}: {
  col: api.RemoteColumnInfo;
  tableName: string;
}) {
  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      {
        label: "Copy Column Name",
        action: () => navigator.clipboard.writeText(col.name),
      },
      {
        label: `SELECT ${col.name}`,
        action: () => {
          const store = useAppStore.getState();
          store.addTab({
            id: `tab-${Date.now()}`,
            title: `select_${col.name}.sql`,
            content: `SELECT ${col.name}\nFROM ${tableName}\nLIMIT 100;`,
            connectionId: store.activeConnectionId,
            isDirty: false,
          });
        },
      },
      { separator: true, label: "sep" },
      { label: `Type: ${col.type}`, disabled: true },
      {
        label: col.nullable ? "Nullable: Yes" : "Nullable: No",
        disabled: true,
      },
      {
        label: col.primaryKey ? "Primary Key: Yes" : "Primary Key: No",
        disabled: true,
      },
    ]);
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-14 text-xs cursor-default"
    >
      {col.primaryKey ? (
        <Key className="w-3 h-3 text-warning shrink-0" />
      ) : (
        <Columns3 className="w-3 h-3 text-muted-foreground shrink-0" />
      )}
      <span className="text-foreground truncate">{col.name}</span>
      <span className="text-muted-foreground ml-auto text-[10px] truncate">
        {col.type}
      </span>
    </div>
  );
}

// ── Table node ──
function TableItem({
  table,
  schema,
}: {
  table: api.RemoteTableInfo;
  schema: string;
}) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<api.RemoteColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const conn = useAppStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId),
  );
  const addTab = useAppStore((s) => s.addTab);

  const loadColumns = useCallback(async () => {
    if (!conn || columns.length > 0) return;
    setLoading(true);
    try {
      const cols = await api.fetchColumns(conn, table.name, schema);
      setColumns(cols);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [conn, table.name, schema, columns.length]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadColumns();
  };

  const qualified = `${schema}.${table.name}`;

  const handleContextMenu = (e: React.MouseEvent) => {
    const connId = useAppStore.getState().activeConnectionId;
    showContextMenu(e, [
      {
        label: "SELECT TOP 100",
        action: () =>
          addTab({
            id: `tab-${Date.now()}`,
            title: `${table.name}.sql`,
            content: `SELECT *\nFROM ${qualified}\nLIMIT 100;`,
            connectionId: connId,
            isDirty: false,
          }),
      },
      {
        label: "SELECT COUNT(*)",
        action: () =>
          addTab({
            id: `tab-${Date.now()}`,
            title: `count_${table.name}.sql`,
            content: `SELECT COUNT(*)\nFROM ${qualified};`,
            connectionId: connId,
            isDirty: false,
          }),
      },
      { separator: true, label: "sep" },
      {
        label: "Generate INSERT",
        action: async () => {
          if (!conn) return;
          const cols =
            columns.length > 0
              ? columns
              : await api.fetchColumns(conn, table.name, schema);
          const colNames = cols.map((c) => c.name).join(", ");
          addTab({
            id: `tab-${Date.now()}`,
            title: `insert_${table.name}.sql`,
            content: `INSERT INTO ${qualified} (${colNames})\nVALUES ();`,
            connectionId: connId,
            isDirty: false,
          });
        },
      },
      {
        label: "Generate CREATE TABLE",
        action: async () => {
          if (!conn) return;
          const cols =
            columns.length > 0
              ? columns
              : await api.fetchColumns(conn, table.name, schema);
          const colDefs = cols
            .map(
              (c) =>
                `  ${c.name} ${c.type}${c.primaryKey ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}`,
            )
            .join(",\n");
          addTab({
            id: `tab-${Date.now()}`,
            title: `create_${table.name}.sql`,
            content: `CREATE TABLE ${qualified} (\n${colDefs}\n);`,
            connectionId: connId,
            isDirty: false,
          });
        },
      },
      { separator: true, label: "sep2" },
      {
        label: "Copy Table Name",
        action: () => navigator.clipboard.writeText(qualified),
      },
      {
        label: "Refresh Columns",
        action: async () => {
          if (!conn) return;
          setColumns([]);
          const cols = await api.fetchColumns(conn, table.name, schema);
          setColumns(cols);
        },
      },
      { separator: true, label: "sep3" },
      {
        label: "Truncate Table",
        danger: true,
        action: async () => {
          if (
            !conn ||
            !confirm(`Are you sure you want to truncate ${qualified}?`)
          )
            return;
          const r = await api.truncateTable(conn, table.name, schema);
          if (!r.ok) alert(r.error ?? "Failed to truncate table");
        },
      },
      {
        label: "Drop Table",
        danger: true,
        action: async () => {
          if (!conn || !confirm(`Are you sure you want to DROP ${qualified}?`))
            return;
          const r = await api.dropTable(conn, table.name, schema);
          if (!r.ok) alert(r.error ?? "Failed to drop table");
        },
      },
    ]);
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
        className="tree-item flex items-center gap-1.5 py-1 px-2 pl-10 w-full text-left text-xs rounded-sm"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        {table.type === "view" ? (
          <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        ) : (
          <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />
        )}
        <span className="text-foreground truncate">{table.name}</span>
        {loading && (
          <Loader2 className="w-3 h-3 text-muted-foreground ml-auto animate-spin shrink-0" />
        )}
      </button>
      {open &&
        columns.map((col) => (
          <ColumnItem key={col.name} col={col} tableName={qualified} />
        ))}
    </div>
  );
}

// ── Schema node ──
function SchemaGroup({
  schema,
  defaultOpen,
}: {
  schema: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tables, setTables] = useState<api.RemoteTableInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const conn = useAppStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId),
  );

  const load = useCallback(async () => {
    if (!conn || loaded) return;
    setLoading(true);
    try {
      const t = await api.fetchTables(conn, schema);
      setTables(t);
      setLoaded(true);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [conn, schema, loaded]);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      {
        label: "Refresh",
        action: () => {
          setLoaded(false);
          setTables([]);
          load();
        },
      },
      {
        label: "New Query",
        action: () => {
          const store = useAppStore.getState();
          store.addTab({
            id: `tab-${Date.now()}`,
            title: `query_${schema}.sql`,
            content: `-- Schema: ${schema}\nSELECT 1;`,
            connectionId: store.activeConnectionId,
            isDirty: false,
          });
        },
      },
      { separator: true, label: "sep" },
      {
        label: "Create Table...",
        action: () => {
          const store = useAppStore.getState();
          store.addTab({
            id: `tab-${Date.now()}`,
            title: `new_table.sql`,
            content: `CREATE TABLE ${schema}.new_table (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);`,
            connectionId: store.activeConnectionId,
            isDirty: false,
          });
        },
      },
    ]);
  };

  const tableCount = tables.filter((t) => t.type === "table").length;
  const viewCount = tables.filter((t) => t.type === "view").length;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        onContextMenu={handleContextMenu}
        className="tree-item flex items-center gap-1.5 py-1 px-2 pl-6 w-full text-left text-xs rounded-sm"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        {open ? (
          <FolderOpen className="w-3.5 h-3.5 text-warning shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-warning shrink-0" />
        )}
        <span className="text-foreground">{schema}</span>
        <span className="text-muted-foreground ml-auto text-[10px]">
          {loaded ? `${tableCount}T${viewCount ? ` ${viewCount}V` : ""}` : ""}
        </span>
        {loading && (
          <Loader2 className="w-3 h-3 text-muted-foreground animate-spin shrink-0" />
        )}
      </button>
      {open && (
        <>
          {tables.length === 0 && !loading && loaded && (
            <div className="pl-14 py-1 text-[10px] text-muted-foreground italic">
              No tables
            </div>
          )}
          {tables.map((t) => (
            <TableItem key={t.name} table={t} schema={schema} />
          ))}
        </>
      )}
    </div>
  );
}

// ── Main Explorer ──
export function DatabaseExplorer() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const conn = useAppStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId),
  );
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSchemas = useCallback(async () => {
    if (!conn || conn.status !== "connected") {
      setSchemas([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await api.fetchSchemas(conn);
      setSchemas(s);
    } catch (e: any) {
      setError(e.message ?? "Failed to load schemas");
    }
    setLoading(false);
  }, [conn]);

  useEffect(() => {
    refreshSchemas();
  }, [activeConnectionId, conn?.status, refreshSchemas]);

  const handleTitleContextMenu = (e: React.MouseEvent) => {
    if (!conn) return;
    showContextMenu(e, [
      {
        label: "Refresh",
        action: refreshSchemas,
      },
      { separator: true, label: "sep" },
      {
        label: "Create Database...",
        action: async () => {
          const name = prompt("Enter new database name:");
          if (!name?.trim() || !conn) return;
          const r = await api.createDatabase(conn, name.trim());
          if (!r.ok) alert(r.error ?? "Failed to create database");
        },
      },
      {
        label: "Create Schema...",
        action: async () => {
          const name = prompt("Enter new schema name:");
          if (!name?.trim() || !conn) return;
          const r = await api.createSchema(conn, name.trim());
          if (r.ok) refreshSchemas();
          else alert(r.error ?? "Failed to create schema");
        },
      },
      { separator: true, label: "sep2" },
      {
        label: "New Query",
        action: () => {
          useAppStore.getState().addTab({
            id: `tab-${Date.now()}`,
            title: `query_${conn.name}.sql`,
            content: `-- Connected to ${conn.name}\nSELECT 1;`,
            connectionId: conn.id,
            isDirty: false,
          });
        },
      },
    ]);
  };

  if (!conn) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground text-xs text-center">
          <Database className="w-8 h-8 opacity-30" />
          <span>No connection selected</span>
          <button
            onClick={() =>
              useAppStore.getState().setActiveSidebarTab("connections")
            }
            className="text-primary hover:underline text-[11px]"
          >
            Go to Connections
          </button>
        </div>
      </div>
    );
  }

  const dbMeta = DB_TYPE_META[conn.type];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>Explorer</span>
        <button
          onClick={refreshSchemas}
          className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
        </button>
      </div>

      {/* Active connection */}
      <div
        className="px-3 py-1.5 flex items-center gap-2 border-b border-panel-border cursor-context-menu"
        onContextMenu={handleTitleContextMenu}
      >
        <Database
          className={cn(
            "w-3.5 h-3.5",
            conn.status === "connected"
              ? "text-success"
              : "text-muted-foreground",
          )}
        />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {conn.name}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {dbMeta.label} — {conn.database}
          </span>
        </div>
      </div>

      {conn.status !== "connected" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground text-xs text-center">
          <span>Connection is disconnected</span>
          <button
            onClick={() => useAppStore.getState().connectConnection(conn.id)}
            className="px-3 py-1 rounded bg-primary/15 text-primary text-[11px] hover:bg-primary/25 transition-colors"
          >
            Connect
          </button>
        </div>
      )}

      {conn.status === "connected" && error && (
        <div className="p-3 text-xs text-destructive">{error}</div>
      )}

      {/* Tree */}
      {conn.status === "connected" && (
        <div className="flex-1 overflow-y-auto py-1">
          {loading && schemas.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading...
            </div>
          )}
          {schemas.map((schema, i) => (
            <SchemaGroup key={schema} schema={schema} defaultOpen={i === 0} />
          ))}
          {!loading && schemas.length === 0 && !error && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No schemas found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
