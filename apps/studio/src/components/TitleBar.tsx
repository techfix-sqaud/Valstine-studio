import { Database, Search, Settings, Moon, Sun, Menu } from "lucide-react";
import { useAppStore } from "@valstine/core/store/app-store";
import { MenuBar } from "./MenuBar";

export function TitleBar() {
  const {
    toggleCommandPalette,
    toggleTheme,
    theme,
    toggleSidebar,
    openSettingsPanel,
  } = useAppStore();
  const isMacElectron =
    typeof window !== "undefined" &&
    (window as any).electronAPI?.platform === "darwin";

  return (
    <div
      className="h-9 bg-titlebar flex items-center justify-between px-2 sm:px-3 select-none shrink-0 border-b border-panel-border"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <button
          onClick={toggleSidebar}
          className="md:hidden p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground shrink-0"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Menu className="w-4 h-4" />
        </button>
        {!isMacElectron && (
          <>
            <Database className="w-4 h-4 text-primary shrink-0" />
            <span className="text-titlebar-foreground text-xs font-medium tracking-wide shrink-0 mr-1">
              Valstine Studio
            </span>
          </>
        )}
        <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <MenuBar />
        </div>
      </div>
      <button
        onClick={toggleCommandPalette}
        className="hidden sm:flex items-center gap-2 bg-secondary/50 hover:bg-secondary rounded px-2 lg:px-3 py-1 text-xs text-muted-foreground transition-colors max-w-[260px]"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Search className="w-3 h-3 shrink-0" />
        <span className="truncate">Search or run command</span>
        <kbd className="ml-2 lg:ml-4 text-[10px] opacity-60 shrink-0">⌘K</kbd>
      </button>
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <button
          onClick={toggleTheme}
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? (
            <Sun className="w-3.5 h-3.5" />
          ) : (
            <Moon className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={() => openSettingsPanel()}
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
