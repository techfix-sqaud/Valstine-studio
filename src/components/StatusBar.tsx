import { useEffect, useState } from "react";
import { GitBranch, Database, Wifi } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { DB_TYPE_META, gitStatus } from "@/lib/api";

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
          <span>{branchName ?? "No repo"}</span>
        </div>
      </div>
    </div>
  );
}
