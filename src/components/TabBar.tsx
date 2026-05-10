import { useRef, useEffect } from "react";
import { X, FileCode2, LayoutDashboard, Plus, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { showContextMenu } from "./ContextMenu";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  const handleNewTab = () => {
    const id = `tab-${Date.now()}`;
    addTab({
      id,
      title: `query_${tabs.length + 1}.sql`,
      content: "-- New query\nSELECT 1;",
      connectionId: "conn-1",
      isDirty: false,
    });
  };

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    showContextMenu(e, [
      { label: "Close", action: () => closeTab(tabId) },
      {
        label: "Close Others",
        action: () => {
          tabs.filter((t) => t.id !== tabId).forEach((t) => closeTab(t.id));
        },
      },
      {
        label: "Close All",
        action: () => {
          tabs.forEach((t) => closeTab(t.id));
        },
        danger: true,
      },
      { separator: true, label: "sep" },
      {
        label: "Copy Path",
        action: () => {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) navigator.clipboard.writeText(tab.title);
        },
      },
    ]);
  };

  return (
    <div
      ref={scrollRef}
      className="h-9 bg-tab-inactive flex items-end shrink-0 border-b border-panel-border overflow-x-auto overflow-y-hidden scrollbar-none"
    >
      {tabs.map((tab) => {
        const isSchema = tab.type === "schema";
        const isDashboard = tab.type === "dashboard";
        const TabIcon = isSchema
          ? Share2
          : isDashboard
            ? LayoutDashboard
            : FileCode2;
        return (
          <button
            key={tab.id}
            data-active={activeTabId === tab.id}
            onClick={() => setActiveTab(tab.id)}
            onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
            className={cn(
              "group relative flex items-center gap-1.5 px-3 h-[34px] text-xs border-r border-panel-border transition-colors shrink-0 max-w-[200px]",
              activeTabId === tab.id
                ? "bg-background text-foreground border-t-2 border-t-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-t-2 border-t-transparent",
            )}
          >
            <TabIcon
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                isSchema
                  ? "text-green-500"
                  : isDashboard
                    ? "text-sky-500"
                    : "text-primary",
              )}
            />
            <span className="truncate">{tab.title}</span>
            {tab.isDirty && (
              <span className="w-2 h-2 rounded-full bg-foreground/40 shrink-0" />
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 p-0.5 rounded hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        );
      })}
      <button
        onClick={handleNewTab}
        title="New tab"
        className="flex items-center justify-center w-9 h-[34px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
