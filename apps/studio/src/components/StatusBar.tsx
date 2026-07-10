import { useEffect, useState } from "react";
import { GitBranch, Database, Wifi } from "lucide-react";
import { useAppStore } from "@valstine/core/store/app-store";
import { DB_TYPE_META, gitStatus } from "@valstine/core/lib/api";

export function StatusBar() {
  const { activeConnectionId, connections } = useAppStore();
  const [branchName, setBranchName] = useState<string | null>(null);
  const conn = connections.find((c) => c.id === activeConnectionId);
  const dbLabel = conn ? (DB_TYPE_META[conn.type]?.label ?? conn.type) : null;

  useEffect(() => {
    let cancelled = false;

    const refreshBranch = async () => {
      try {
        const result = await gitStatus();
        if (cancelled) return;
        setBranchName(result.ok ? result.branch : null);
      } catch {
        if (!cancelled) setBranchName(null);
      }
    };

    refreshBranch();
    window.addEventListener("focus", refreshBranch);
    document.addEventListener("visibilitychange", refreshBranch);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshBranch);
      document.removeEventListener("visibilitychange", refreshBranch);
    };
  }, []);

  return (
    <div
      className="h-6 bg-statusbar flex items-center justify-between px-2 text-statusbar-foreground text-[11px] shrink-0 select-none overflow-hidden"
      style={conn?.color ? { borderTop: `2px solid ${conn.color}` } : undefined}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {conn?.color ? (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: conn.color }}
            />
          ) : (
            <Database className="w-3 h-3 shrink-0" />
          )}
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
          <span>{branchName ?? "No repo"}</span>
        </div>
      </div>
    </div>
  );
}
