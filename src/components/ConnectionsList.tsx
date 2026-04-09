import { Database, Plug, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";
import { mockConnections } from "@/lib/mock-data";
import { useAppStore } from "@/store/app-store";
import { showContextMenu } from "./ContextMenu";

export function ConnectionsList() {
  const { activeConnectionId, setActiveConnection } = useAppStore();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Connections
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {mockConnections.map((conn) => (
          <button
            key={conn.id}
            onClick={() => setActiveConnection(conn.id)}
            onContextMenu={(e) => {
              showContextMenu(e, [
                {
                  label: conn.status === "connected" ? "Disconnect" : "Connect",
                  disabled: true,
                },
                {
                  label: "Set as Active",
                  action: () => setActiveConnection(conn.id),
                },
                { separator: true, label: "sep" },
                { label: "Properties", disabled: true },
                {
                  label: "Copy Connection String",
                  action: () =>
                    navigator.clipboard.writeText(
                      `postgresql://${conn.host}:${conn.port}/${conn.database}`,
                    ),
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
                { label: "Delete Connection", danger: true, disabled: true },
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
              <span className="text-foreground font-medium truncate">
                {conn.name}
              </span>
              <span className="text-muted-foreground text-[10px] truncate">
                {conn.host}:{conn.port}/{conn.database}
              </span>
            </div>
            {conn.status === "connected" ? (
              <PlugZap className="w-3 h-3 text-success ml-auto shrink-0" />
            ) : (
              <Plug className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
