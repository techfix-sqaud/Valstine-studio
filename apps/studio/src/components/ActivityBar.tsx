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
  CircleUserRound,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { useAppStore } from "@valstine/core/store/app-store";
import { cn } from "@valstine/ui/lib/utils";
import { THEME_OPTIONS, isDarkTheme } from "@valstine/core/lib/themes";
import { ThemeMenu } from "@valstine/ui/components/theme-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@valstine/ui/components/ui/dropdown-menu";

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

const ACCOUNT_LABELS = [
  { id: "microsoft" as const, label: "Microsoft" },
  { id: "github" as const, label: "GitHub" },
  { id: "google" as const, label: "Google" },
  { id: "email" as const, label: "Email" },
];

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
    settings,
    openSettingsPanel,
    toggleCommandPalette,
    theme,
    setTheme,
  } = useAppStore();

  const connectedAccounts = ACCOUNT_LABELS.filter(
    ({ id }) => settings.accounts[id].status === "authorized",
  );

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
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
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
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50"
      >
        <Share2 className="w-5 h-5" />
      </button>

      {/* .NET Generator — opens as an editor tab */}
      <button
        onClick={openApiGeneratorTab}
        title=".NET API Generator"
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50"
      >
        <Braces className="w-5 h-5" />
      </button>

      {/* API Tester — opens as an editor tab */}
      <button
        onClick={openApiTesterTab}
        title="API Tester"
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50"
      >
        <Send className="w-5 h-5" />
      </button>

      {/* Recycle Bin — shows destructive operations logged by the SQL Optimizer */}
      <button
        onClick={() => setRecycleBinOpen(true)}
        title={`Recycle Bin${recycleBin.length > 0 ? ` (${recycleBin.length})` : ''}`}
        className="w-10 h-10 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 relative"
      >
        <Trash2 className="w-5 h-5" />
        {recycleBin.length > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white">
            {recycleBin.length > 9 ? '9+' : recycleBin.length}
          </span>
        )}
      </button>

      <div className="mt-auto flex flex-col items-center gap-0.5">
        {/* Color theme */}
        <ThemeMenu
          value={theme}
          options={THEME_OPTIONS}
          onChange={(id) => setTheme(id as any)}
          align="end"
          triggerClassName="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          trigger={
            isDarkTheme(theme) ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )
          }
        />

        {/* Accounts */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Accounts"
              className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <CircleUserRound className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Accounts
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {connectedAccounts.length > 0 ? (
              connectedAccounts.map(({ id, label }) => (
                <DropdownMenuItem key={id} disabled className="text-xs">
                  {label}: {settings.accounts[id].identifier || "Connected"}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled className="text-xs">
                No accounts connected
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs cursor-pointer"
              onClick={() => openSettingsPanel("profile")}
            >
              Manage Accounts…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Settings"
              className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-52">
            <DropdownMenuItem
              className="text-xs cursor-pointer"
              onClick={() => openSettingsPanel("general")}
            >
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs cursor-pointer"
              onClick={toggleCommandPalette}
            >
              Command Palette
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs cursor-pointer"
              onClick={() => openSettingsPanel("about")}
            >
              About
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
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
