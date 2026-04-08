import { useAppStore } from '@/store/app-store';
import { DatabaseExplorer } from './DatabaseExplorer';
import { ConnectionsList } from './ConnectionsList';
import { SchemaVisualization } from './SchemaVisualization';
import { Search, FolderTree, Database, Share2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const mobileItems = [
  { id: 'explorer' as const, icon: FolderTree, label: 'Explorer' },
  { id: 'connections' as const, icon: Database, label: 'Connections' },
  { id: 'search' as const, icon: Search, label: 'Search' },
  { id: 'schema' as const, icon: Share2, label: 'Schema' },
] as const;

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
  const { activeSidebarTab, setActiveSidebarTab, sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/60 z-40 md:hidden" onClick={toggleSidebar} />
      )}

      <div className={cn(
        'h-full bg-panel-bg border-r border-panel-border overflow-hidden flex flex-col',
        'max-md:fixed max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:z-50 max-md:w-72 max-md:transition-transform max-md:duration-200',
        !sidebarOpen && 'max-md:-translate-x-full'
      )}>
        {/* Mobile nav header */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-panel-border">
          <div className="flex items-center gap-1">
            {mobileItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSidebarTab(item.id)}
                title={item.label}
                className={cn(
                  'p-2 rounded transition-colors',
                  activeSidebarTab === item.id ? 'text-foreground bg-secondary' : 'text-muted-foreground'
                )}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <button onClick={toggleSidebar} className="p-1 rounded hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {activeSidebarTab === 'explorer' && <DatabaseExplorer />}
          {activeSidebarTab === 'connections' && <ConnectionsList />}
          {activeSidebarTab === 'search' && <SearchPanel />}
          {activeSidebarTab === 'schema' && <SchemaVisualization />}
        </div>
      </div>
    </>
  );
}
