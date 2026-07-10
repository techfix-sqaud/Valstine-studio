import { ShieldAlert, AlertTriangle, Loader2, X } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { SEVERITY_LABELS } from "@/lib/query-safety";

export function DestructiveQueryGuard() {
  const {
    safetyGuardOpen,
    safetyGuardInfo,
    safetyGuardPending,
    safetyGuardRowCount,
    safetyGuardCountLoading,
    closeSafetyGuard,
    proceedWithDangerousQuery,
    connections,
    activeConnectionId,
  } = useAppStore();

  if (!safetyGuardOpen || !safetyGuardInfo) return null;

  const conn = connections.find(c => c.id === activeConnectionId);
  const severity = SEVERITY_LABELS[safetyGuardInfo.severity];
  const isCritical = safetyGuardInfo.severity === 'critical';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg mx-4 rounded-xl border border-destructive/40 bg-panel-bg shadow-2xl overflow-hidden">

        {/* Header */}
        <div className={`flex items-center gap-3 px-5 py-4 ${isCritical ? "bg-destructive/10 border-b border-destructive/30" : "bg-yellow-500/10 border-b border-yellow-500/30"}`}>
          <ShieldAlert className={`w-5 h-5 shrink-0 ${isCritical ? "text-destructive" : "text-yellow-500"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Production Safety Guard</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isCritical ? "bg-destructive/20 text-destructive" : "bg-yellow-500/20 text-yellow-500"}`}>
                {severity.label}
              </span>
            </div>
            {conn && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Connection: <strong className="text-foreground">{conn.name}</strong>
              </p>
            )}
          </div>
          <button onClick={closeSafetyGuard} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Operation description */}
          <div className="flex items-start gap-2.5">
            <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${isCritical ? "text-destructive" : "text-yellow-500"}`} />
            <p className="text-sm text-foreground">{safetyGuardInfo.description}</p>
          </div>

          {/* Row count estimate */}
          {safetyGuardInfo.countQuery && (
            <div className="rounded-lg bg-secondary/60 border border-panel-border px-4 py-3 flex items-center gap-3">
              {safetyGuardCountLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">Estimating affected rows…</span>
                </>
              ) : safetyGuardRowCount !== null ? (
                <>
                  <span className={`text-2xl font-bold tabular-nums ${safetyGuardRowCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {safetyGuardRowCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {safetyGuardRowCount === 1 ? "row" : "rows"} will be affected
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Could not estimate affected rows</span>
              )}
            </div>
          )}

          {/* Query preview */}
          <div>
            <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wide">Query</p>
            <pre className="text-[11px] font-mono text-foreground bg-secondary/40 border border-panel-border rounded-md px-3 py-2 whitespace-pre-wrap break-all max-h-28 overflow-auto">
              {safetyGuardPending.trim().slice(0, 500)}{safetyGuardPending.trim().length > 500 ? '…' : ''}
            </pre>
          </div>

          {isCritical && (
            <p className="text-[11px] text-destructive/80 bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
              This operation <strong>cannot be undone</strong>. Make sure you have a backup before proceeding.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-panel-border bg-secondary/20">
          <button
            onClick={closeSafetyGuard}
            className="px-4 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={proceedWithDangerousQuery}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isCritical
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-yellow-500 text-black hover:bg-yellow-400"
            }`}
          >
            {isCritical ? "Yes, Proceed Anyway" : "Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
}
