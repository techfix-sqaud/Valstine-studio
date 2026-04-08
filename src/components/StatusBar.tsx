import { GitBranch, Database, Wifi } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { mockConnections } from '@/lib/mock-data';

export function StatusBar() {
  const { activeConnectionId, tabs, activeTabId } = useAppStore();
  const conn = mockConnections.find((c) => c.id === activeConnectionId);

  return (
    <div className="h-6 bg-statusbar flex items-center justify-between px-2 text-statusbar-foreground text-[11px] shrink-0 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          <span>{conn?.name ?? 'No connection'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Wifi className="w-3 h-3" />
          <span>PostgreSQL 16</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span>UTF-8</span>
        <span>SQL</span>
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          <span>main</span>
        </div>
      </div>
    </div>
  );
}
