import { Play, Sparkles, StopCircle, Database } from "lucide-react";
import { useAppStore } from "@/store/app-store";

export function EditorToolbar() {
  const {
    executeQuery,
    isExecuting,
    activeConnectionId,
    openAiSidebar,
    connections,
  } = useAppStore();
  const conn = connections.find((c) => c.id === activeConnectionId);

  return (
    <div className="h-8 bg-panel-bg border-b border-panel-border flex items-center px-1.5 sm:px-2 gap-1 shrink-0 overflow-x-auto">
      <button
        onClick={executeQuery}
        disabled={isExecuting}
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50 shrink-0"
      >
        {isExecuting ? (
          <>
            <StopCircle className="w-3.5 h-3.5 animate-pulse" />
            <span className="hidden xs:inline">Running...</span>
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Run Query</span>
          </>
        )}
      </button>

      <div className="h-4 w-px bg-border mx-0.5 sm:mx-1 shrink-0" />

      <button
        onClick={openAiSidebar}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
      >
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="hidden sm:inline">AI Assist</span>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground shrink-0">
        <Database className="w-3 h-3 text-success" />
        <span className="hidden sm:inline truncate max-w-[120px]">
          {conn?.name}
        </span>
      </div>
    </div>
  );
}
