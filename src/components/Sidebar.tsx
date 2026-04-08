import { useAppStore } from '@/store/app-store';
import { DatabaseExplorer } from './DatabaseExplorer';
import { ConnectionsList } from './ConnectionsList';
import { Search } from 'lucide-react';

function SearchPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Search
      </div>
      <div className="px-3">
        <div className="flex items-center gap-2 bg-secondary rounded px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tables, columns..."
            className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);

  return (
    <div className="h-full bg-panel-bg border-r border-panel-border overflow-hidden">
      {activeSidebarTab === 'explorer' && <DatabaseExplorer />}
      {activeSidebarTab === 'connections' && <ConnectionsList />}
      {activeSidebarTab === 'search' && <SearchPanel />}
    </div>
  );
}
