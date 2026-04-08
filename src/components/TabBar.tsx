import { X, FileCode2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useAppStore();

  const handleNewTab = () => {
    const id = `tab-${Date.now()}`;
    addTab({
      id,
      title: `query_${tabs.length + 1}.sql`,
      content: '-- New query\nSELECT 1;',
      connectionId: 'conn-1',
      isDirty: false,
    });
  };

  return (
    <div className="h-9 bg-tab-inactive flex items-end overflow-x-auto shrink-0 border-b border-panel-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            'group flex items-center gap-1.5 px-3 h-[34px] text-xs border-r border-panel-border transition-colors min-w-0 shrink-0',
            activeTabId === tab.id
              ? 'bg-background text-foreground border-t-2 border-t-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-t-2 border-t-transparent'
          )}
        >
          <FileCode2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[120px]">{tab.title}</span>
          {tab.isDirty && <span className="w-2 h-2 rounded-full bg-foreground/40 shrink-0" />}
          <span
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            className="ml-1 p-0.5 rounded hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <X className="w-3 h-3" />
          </span>
        </button>
      ))}
      <button
        onClick={handleNewTab}
        className="flex items-center justify-center w-9 h-[34px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
