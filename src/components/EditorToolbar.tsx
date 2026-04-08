import { Play, Sparkles, StopCircle, Database } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { mockConnections } from '@/lib/mock-data';

export function EditorToolbar() {
  const { executeQuery, isExecuting, activeConnectionId } = useAppStore();
  const conn = mockConnections.find((c) => c.id === activeConnectionId);

  return (
    <div className="h-8 bg-panel-bg border-b border-panel-border flex items-center px-2 gap-1 shrink-0">
      <button
        onClick={executeQuery}
        disabled={isExecuting}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
      >
        {isExecuting ? (
          <>
            <StopCircle className="w-3.5 h-3.5 animate-pulse" />
            Running...
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" />
            Run Query
          </>
        )}
      </button>

      <div className="h-4 w-px bg-border mx-1" />

      <button className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        AI Assist
      </button>

      <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <Database className="w-3 h-3 text-success" />
        <span>{conn?.name}</span>
      </div>
    </div>
  );
}
