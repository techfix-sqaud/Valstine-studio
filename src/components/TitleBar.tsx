import { Database, Search, Settings, Moon, Sun, Menu } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function TitleBar() {
  const { toggleCommandPalette, toggleTheme, theme, toggleSidebar } = useAppStore();

  return (
    <div className="h-9 bg-titlebar flex items-center justify-between px-3 select-none shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="md:hidden p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Menu className="w-4 h-4" />
        </button>
        <Database className="w-4 h-4 text-primary" />
        <span className="text-titlebar-foreground text-xs font-medium tracking-wide">DB Studio</span>
      </div>
      <button
        onClick={toggleCommandPalette}
        className="hidden sm:flex items-center gap-2 bg-secondary/50 hover:bg-secondary rounded px-3 py-1 text-xs text-muted-foreground transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Search className="w-3 h-3" />
        <span>Search or run command</span>
        <kbd className="ml-4 text-[10px] opacity-60">⌘K</kbd>
      </button>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
        <button className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
