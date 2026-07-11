import { Database, Search, Menu } from "lucide-react";
import { useAppStore } from "@valstine/core/store/app-store";
import { MenuBar } from "./MenuBar";

export function TitleBar() {
  const { toggleCommandPalette, toggleSidebar, connections, activeConnectionId } = useAppStore();
  const isMacElectron =
    typeof window !== "undefined" &&
    (window as any).electronAPI?.platform === "darwin";
  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const activeDatabase = activeConn?.database;

  return (
    <div
      className="h-9 bg-titlebar grid grid-cols-[1fr_minmax(200px,28rem)_1fr] items-center px-2 sm:px-3 select-none shrink-0 border-b border-panel-border"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 justify-self-start">
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
        className="hidden sm:flex items-center gap-2 justify-self-center w-full max-w-md bg-secondary/50 hover:bg-secondary rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Search className="w-3.5 h-3.5 shrink-0" />
        {activeDatabase && (
          <>
            <span className="text-foreground font-medium truncate shrink-0 max-w-[140px]">
              {activeDatabase}
            </span>
            <span className="text-muted-foreground/40 shrink-0">—</span>
          </>
        )}
        <span className="truncate">Search or run command</span>
        <kbd className="ml-auto text-[10px] opacity-60 shrink-0">⌘K</kbd>
      </button>
      <div />
    </div>
  );
}
