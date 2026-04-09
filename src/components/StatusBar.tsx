import { GitBranch, Database, Wifi } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { DB_TYPE_META } from "@/lib/api";

export function StatusBar() {
  const { activeConnectionId, tabs, activeTabId, connections } = useAppStore();
  const conn = connections.find((c) => c.id === activeConnectionId);
  const dbLabel = conn ? (DB_TYPE_META[conn.type]?.label ?? conn.type) : null;

  return (
    <div className="h-6 bg-statusbar flex items-center justify-between px-2 text-statusbar-foreground text-[11px] shrink-0 select-none overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <Database className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[100px] sm:max-w-none">
            {conn?.name ?? "No connection"}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <Wifi className="w-3 h-3" />
          <span>{conn?.status === "connected" ? dbLabel : "Disconnected"}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="hidden sm:inline">UTF-8</span>
        <span>SQL</span>
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          <span>main</span>
        </div>
      </div>
    </div>
  );
}
