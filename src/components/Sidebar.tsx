import { useAppStore } from "@/store/app-store";
import { AIChatSidebar } from "./AIChatSidebar";
import { DatabaseExplorer } from "./DatabaseExplorer";
import { ConnectionsList } from "./ConnectionsList";
import SchemaCompare from "./SchemaCompare";
import GitPanel from "./GitPanel";
import {
  Search,
  FolderTree,
  Database,
  Sparkles,
  ArrowRightLeft,
  GitBranch,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const sidebarItems = [
  { id: "explorer" as const, icon: FolderTree, label: "Explorer" },
  { id: "connections" as const, icon: Database, label: "Connections" },
  { id: "search" as const, icon: Search, label: "Search" },
  { id: "ai" as const, icon: Sparkles, label: "AI Agent" },
  {
    id: "schema-compare" as const,
    icon: ArrowRightLeft,
    label: "Schema Compare",
  },
  { id: "git" as const, icon: GitBranch, label: "Source Control" },
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

function SidebarContent() {
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);
  return (
    <>
      {activeSidebarTab === "explorer" && <DatabaseExplorer />}
      {activeSidebarTab === "connections" && <ConnectionsList />}
      {activeSidebarTab === "search" && <SearchPanel />}
      {activeSidebarTab === "ai" && <AIChatSidebar />}
      {activeSidebarTab === "schema-compare" && <SchemaCompare />}
      {activeSidebarTab === "git" && <GitPanel />}
    </>
  );
}

export function AppSidebar() {
  const { activeSidebarTab, setActiveSidebarTab, sidebarOpen, toggleSidebar } =
    useAppStore();
  const isMobile = useIsMobile();

  // Desktop: just fill the Panel container
  if (!isMobile) {
    return (
      <div className="h-full w-full bg-panel-bg overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <SidebarContent />
        </div>
      </div>
    );
  }

  // Mobile: slide-over drawer
  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={toggleSidebar}
        />
      )}
      <div
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 w-72 bg-panel-bg border-r border-panel-border flex flex-col",
          "transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Mobile tab nav */}
        <div className="flex items-center justify-between px-2 py-2 border-b border-panel-border shrink-0">
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSidebarTab(item.id)}
                title={item.label}
                className={cn(
                  "p-2 rounded transition-colors shrink-0",
                  activeSidebarTab === item.id
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground",
                )}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded hover:bg-secondary text-muted-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}
