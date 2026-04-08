import { Database, FolderTree, Search, Share2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

const items = [
  { id: 'explorer' as const, icon: FolderTree, label: 'Explorer' },
  { id: 'connections' as const, icon: Database, label: 'Connections' },
  { id: 'search' as const, icon: Search, label: 'Search' },
  { id: 'schema' as const, icon: Share2, label: 'Schema' },
] as const;

export function ActivityBar() {
  const { activeSidebarTab, setActiveSidebarTab } = useAppStore();

  return (
    <div className="w-12 bg-titlebar flex flex-col items-center py-2 gap-1 shrink-0 border-r border-panel-border max-md:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveSidebarTab(item.id)}
          title={item.label}
          className={cn(
            'w-10 h-10 flex items-center justify-center rounded transition-colors relative',
            activeSidebarTab === item.id
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {activeSidebarTab === item.id && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />
          )}
          <item.icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
}
