import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import {
  Database,
  Play,
  Plus,
  FileCode2,
  Settings,
  Search,
  Table2,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

const commands = [
  {
    id: "run-query",
    label: "Run Query",
    icon: Play,
    group: "Query",
    shortcut: "⌘⏎",
  },
  {
    id: "new-tab",
    label: "New Query Tab",
    icon: Plus,
    group: "Query",
    shortcut: "⌘T",
  },
  { id: "ai-assist", label: "AI: Explain Query", icon: Sparkles, group: "AI" },
  {
    id: "ai-optimize",
    label: "AI: Optimize Query",
    icon: Sparkles,
    group: "AI",
  },
  {
    id: "ai-generate",
    label: "AI: Generate SQL from Text",
    icon: Sparkles,
    group: "AI",
  },
  {
    id: "view-tables",
    label: "View All Tables",
    icon: Table2,
    group: "Explorer",
  },
  {
    id: "new-connection",
    label: "New Connection",
    icon: Database,
    group: "Connections",
  },
  { id: "settings", label: "Settings", icon: Settings, group: "General" },
];

export function CommandPalette() {
  const {
    commandPaletteOpen,
    toggleCommandPalette,
    executeQuery,
    addTab,
    tabs,
    sendAiMessage,
    openAiSidebar,
  } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [toggleCommandPalette]);

  if (!commandPaletteOpen) return null;

  const handleSelect = (id: string) => {
    switch (id) {
      case "run-query":
        executeQuery();
        break;
      case "new-tab":
        addTab({
          id: `tab-${Date.now()}`,
          title: `query_${tabs.length + 1}.sql`,
          content: "-- New query\n",
          connectionId: "conn-1",
          isDirty: false,
        });
        break;
      case "ai-assist":
        openAiSidebar();
        sendAiMessage("Explain the active query");
        break;
      case "ai-optimize":
        openAiSidebar();
        sendAiMessage("Optimize the active query");
        break;
      case "ai-generate":
        openAiSidebar();
        sendAiMessage("Generate SQL from a plain English request");
        break;
    }
    toggleCommandPalette();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4"
      onClick={toggleCommandPalette}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[520px] animate-slide-down"
      >
        <Command className="bg-popover border border-border rounded-lg shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              ref={inputRef}
              autoFocus
              placeholder="Type a command or search..."
              className="w-full py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found
            </Command.Empty>
            {["Query", "AI", "Explorer", "Connections", "General"].map(
              (group) => {
                const items = commands.filter((c) => c.group === group);
                if (!items.length) return null;
                return (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {items.map((cmd) => (
                      <Command.Item
                        key={cmd.id}
                        value={cmd.label}
                        onSelect={() => handleSelect(cmd.id)}
                        className="flex items-center gap-2 px-2 py-2 text-sm text-foreground rounded cursor-pointer aria-selected:bg-accent transition-colors"
                      >
                        <cmd.icon className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1">{cmd.label}</span>
                        {cmd.shortcut && (
                          <kbd className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              },
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
