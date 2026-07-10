import {
  Database,
  FolderTree,
  Sparkles,
  Search,
  Share2,
  PanelLeftClose,
  PanelLeft,
  ArrowRightLeft,
  GitBranch,
  Braces,
  Send,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@valstine/core/store/app-store";
import { cn } from "@valstine/ui/lib/utils";

type SidebarTab =
  | "explorer"
  | "connections"
  | "search"
  | "ai"
  | "schema-compare"
  | "git";

const sidebarItems = [
  { id: "explorer" as SidebarTab, icon: FolderTree, label: "Explorer" },
  { id: "connections" as SidebarTab, icon: Database, label: "Connections" },
  { id: "search" as SidebarTab, icon: Search, label: "Search" },
  { id: "ai" as SidebarTab, icon: Sparkles, label: "AI Agent" },
  {
    id: "schema-compare" as SidebarTab,
    icon: ArrowRightLeft,
    label: "Schema Compare",
  },
  { id: "git" as SidebarTab, icon: GitBranch, label: "Source Control" },
] as const;

export function ActivityBar() {
  const {
    activeSidebarTab,
    setActiveSidebarTab,
    sidebarOpen,
    toggleSidebar,
    openSchemaTab,
    openApiGeneratorTab,
    openApiTesterTab,
    setRecycleBinOpen,
    recycleBin,
  } = useAppStore();

  const handleClick = (id: SidebarTab) => {
    if (activeSidebarTab === id && sidebarOpen) {
      toggleSidebar();
    } else {
      setActiveSidebarTab(id);
    }
  };

  return (
    <div className="w-12 bg-titlebar flex flex-col items-center py-2 gap-0.5 shrink-0 border-r border-panel-border max-md:hidden">
      {sidebarItems.map((item) => (
        <button
          key={item.id}
          onClick={() => handleClick(item.id)}
          title={item.label}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-md transition-colors relative",
            activeSidebarTab === item.id && sidebarOpen
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {activeSidebarTab === item.id && sidebarOpen && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />
          )}
          <item.icon className="w-5 h-5" />
        </button>
      ))}

      {/* Schema opens as a tab, not in sidebar */}
      <button
        onClick={openSchemaTab}
        title="Schema Diagram"
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground"
      >
        <Share2 className="w-5 h-5" />
      </button>

      {/* .NET Generator — opens as an editor tab */}
      <button
        onClick={openApiGeneratorTab}
        title=".NET API Generator"
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground"
      >
        <Braces className="w-5 h-5" />
      </button>

      {/* API Tester — opens as an editor tab */}
      <button
        onClick={openApiTesterTab}
        title="API Tester"
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground"
      >
        <Send className="w-5 h-5" />
      </button>

      {/* Recycle Bin — shows destructive operations logged by the SQL Optimizer */}
      <button
        onClick={() => setRecycleBinOpen(true)}
        title={`Recycle Bin${recycleBin.length > 0 ? ` (${recycleBin.length})` : ''}`}
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground relative"
      >
        <Trash2 className="w-5 h-5" />
        {recycleBin.length > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white">
            {recycleBin.length > 9 ? '9+' : recycleBin.length}
          </span>
        )}
      </button>

      <div className="mt-auto">
        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeft className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
