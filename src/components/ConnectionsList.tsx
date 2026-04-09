import { Database, Plug, PlugZap, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { showContextMenu } from "./ContextMenu";
import { DB_TYPE_META } from "@/lib/api";

export function ConnectionsList() {
  const {
    connections,
    activeConnectionId,
    setActiveConnection,
    connectConnection,
    disconnectConnection,
    removeConnection,
    openConnectionDialog,
  } = useAppStore();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>Connections</span>
        <button
          onClick={() => openConnectionDialog()}
          className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="New Connection"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {connections.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <Database className="w-8 h-8 text-muted-foreground/30" />
          <div className="text-xs text-muted-foreground">
            No connections yet
          </div>
          <button
            onClick={() => openConnectionDialog()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Connection
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {connections.map((conn) => {
          const meta = DB_TYPE_META[conn.type];
          return (
            <button
              key={conn.id}
              onClick={() => setActiveConnection(conn.id)}
              onContextMenu={(e) => {
                showContextMenu(e, [
                  {
                    label:
                      conn.status === "connected" ? "Disconnect" : "Connect",
                    action: async () => {
                      if (conn.status === "connected") {
                        await disconnectConnection(conn.id);
                      } else {
                        const r = await connectConnection(conn.id);
                        if (!r.ok) alert(r.error ?? "Failed to connect");
                      }
                    },
                  },
                  {
                    label: "Set as Active",
                    action: () => setActiveConnection(conn.id),
                  },
                  { separator: true, label: "sep" },
                  {
                    label: "Edit Connection",
                    action: () => openConnectionDialog(conn),
                  },
                  {
                    label: "Copy Connection String",
                    action: () => {
                      const scheme =
                        conn.type === "mysql"
                          ? "mysql"
                          : conn.type === "mssql"
                            ? "mssql"
                            : "postgresql";
                      navigator.clipboard.writeText(
                        conn.type === "sqlite"
                          ? (conn.filename ?? conn.database)
                          : `${scheme}://${conn.user ? conn.user + "@" : ""}${conn.host}:${conn.port}/${conn.database}`,
                      );
                    },
                  },
                  { separator: true, label: "sep2" },
                  {
                    label: "New Query",
                    action: () => {
                      const store = useAppStore.getState();
                      store.addTab({
                        id: `tab-${Date.now()}`,
                        title: `query_on_${conn.name}.sql`,
                        content: `-- Connected to ${conn.name}\nSELECT 1;`,
                        connectionId: conn.id,
                        isDirty: false,
                      });
                    },
                  },
                  { separator: true, label: "sep3" },
                  {
                    label: "Delete Connection",
                    danger: true,
                    action: () => {
                      if (confirm(`Delete connection "${conn.name}"?`))
                        removeConnection(conn.id);
                    },
                  },
                ]);
              }}
              className={cn(
                "tree-item flex items-center gap-2 py-2 px-3 w-full text-left text-xs rounded-sm",
                activeConnectionId === conn.id && "bg-accent",
              )}
            >
              <Database
                className={cn(
                  "w-4 h-4 shrink-0",
                  conn.status === "connected"
                    ? "text-success"
                    : "text-muted-foreground",
                )}
              />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground font-medium truncate">
                    {conn.name}
                  </span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                    {meta.label}
                  </span>
                </div>
                <span className="text-muted-foreground text-[10px] truncate">
                  {conn.type === "sqlite"
                    ? (conn.filename ?? conn.database)
                    : `${conn.host}:${conn.port}/${conn.database}`}
                </span>
              </div>
              {conn.status === "connected" ? (
                <PlugZap className="w-3 h-3 text-success ml-auto shrink-0" />
              ) : (
                <Plug className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
