import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { getActiveEditor } from "@/lib/editor-ref";
import { cn } from "@/lib/utils";

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

// Helper: fire a Monaco editor command, no-op if editor is not focused
function editorCmd(cmd: string) {
  const ed = getActiveEditor();
  if (!ed) return;
  ed.focus();
  ed.trigger("menu", cmd, null);
}

function editorAction(actionId: string) {
  const ed = getActiveEditor();
  if (!ed) return;
  ed.focus();
  ed.getAction(actionId)?.run();
}

function useMenus(): MenuDef[] {
  const {
    toggleTheme,
    toggleSidebar,
    toggleCommandPalette,
    executeQuery,
    runQuery,
    runAllStatements,
    setBottomPanelVisible,
    bottomPanelVisible,
    sidebarOpen,
    addTab,
    tabs,
    openDashboardTab,
    openSchemaTab,
    setActiveBottomTab,
    openSettingsPanel,
    openConnectionDialog,
  } = useAppStore();

  return [
    {
      label: "File",
      items: [
        {
          label: "New Query Tab",
          shortcut: "⌘N",
          action: () =>
            addTab({
              id: `tab-${Date.now()}`,
              title: `query_${tabs.length + 1}.sql`,
              content: "-- New query\nSELECT 1;",
              connectionId: "conn-1",
              isDirty: false,
            }),
        },
        { label: "separator", separator: true },
        { label: "Open Schema Diagram", action: openSchemaTab },
        { label: "separator", separator: true },
        {
          label: "New Connection...",
          action: () => openConnectionDialog(),
        },
        { label: "separator", separator: true },
        {
          label: "Preferences",
          shortcut: "⌘,",
          action: () => openSettingsPanel("general"),
        },
      ],
    },
    {
      label: "Edit",
      items: [
        {
          label: "Undo",
          shortcut: "⌘Z",
          action: () => editorCmd("undo"),
        },
        {
          label: "Redo",
          shortcut: "⇧⌘Z",
          action: () => editorCmd("redo"),
        },
        { label: "separator", separator: true },
        {
          label: "Cut",
          shortcut: "⌘X",
          action: () => editorCmd("editor.action.clipboardCutAction"),
        },
        {
          label: "Copy",
          shortcut: "⌘C",
          action: () => editorCmd("editor.action.clipboardCopyAction"),
        },
        {
          label: "Paste",
          shortcut: "⌘V",
          action: () => editorCmd("editor.action.clipboardPasteAction"),
        },
        { label: "separator", separator: true },
        {
          label: "Find",
          shortcut: "⌘F",
          action: () => editorAction("actions.find"),
        },
        {
          label: "Replace",
          shortcut: "⌥⌘F",
          action: () => editorAction("editor.action.startFindReplaceAction"),
        },
        { label: "separator", separator: true },
        {
          label: "Format Document",
          shortcut: "⇧⌥F",
          action: () => editorAction("editor.action.formatDocument"),
        },
        {
          label: "Select All",
          shortcut: "⌘A",
          action: () => editorCmd("selectAll"),
        },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: "Command Palette...",
          shortcut: "⇧⌘P",
          action: toggleCommandPalette,
        },
        {
          label: "View Dashboard",
          action: openDashboardTab,
        },
        { label: "separator", separator: true },
        {
          label: sidebarOpen ? "Hide Sidebar" : "Show Sidebar",
          shortcut: "⌘B",
          action: toggleSidebar,
        },
        {
          label: bottomPanelVisible ? "Hide Panel" : "Show Panel",
          shortcut: "⌘J",
          action: () => setBottomPanelVisible(!bottomPanelVisible),
        },
        { label: "separator", separator: true },
        {
          label: "Results",
          action: () => { setActiveBottomTab("results"); setBottomPanelVisible(true); },
        },
        {
          label: "Query History",
          action: () => { setActiveBottomTab("history"); setBottomPanelVisible(true); },
        },
        {
          label: "Chart",
          action: () => { setActiveBottomTab("chart"); setBottomPanelVisible(true); },
        },
        { label: "separator", separator: true },
        { label: "Toggle Theme", action: toggleTheme },
      ],
    },
    {
      label: "Go",
      items: [
        {
          label: "Go to File...",
          shortcut: "⌘P",
          action: toggleCommandPalette,
        },
        { label: "separator", separator: true },
        {
          label: "Explorer",
          shortcut: "⇧⌘E",
          action: () => useAppStore.getState().setActiveSidebarTab("explorer"),
        },
        {
          label: "Search",
          shortcut: "⇧⌘F",
          action: () => useAppStore.getState().setActiveSidebarTab("search"),
        },
        {
          label: "Connections",
          action: () => useAppStore.getState().setActiveSidebarTab("connections"),
        },
        {
          label: "AI Chat",
          action: () => useAppStore.getState().setActiveSidebarTab("ai"),
        },
        {
          label: "Git",
          action: () => useAppStore.getState().setActiveSidebarTab("git"),
        },
      ],
    },
    {
      label: "Run",
      items: [
        {
          label: "Execute Query",
          shortcut: "⌘↵",
          action: executeQuery,
        },
        {
          label: "Execute Selection",
          shortcut: "⇧⌘↵",
          action: () => {
            const ed = getActiveEditor();
            const sel = ed?.getSelection();
            const model = ed?.getModel();
            if (sel && model && !sel.isEmpty()) {
              const text = model.getValueInRange(sel).trim();
              if (text) { runQuery(text); return; }
            }
            executeQuery();
          },
        },
        {
          label: "Run All Statements",
          action: runAllStatements,
        },
        { label: "separator", separator: true },
        {
          label: "Explain Query",
          shortcut: "⇧⌘E",
          action: () => {
            const ed = getActiveEditor();
            const model = ed?.getModel();
            const sql = model?.getValue()?.trim();
            if (!sql) return;
            // Trigger the EditorToolbar explain by dispatching a custom event
            window.dispatchEvent(new CustomEvent("valstine:explain", { detail: { sql } }));
          },
        },
        {
          label: "Dry Run (no commit)",
          action: () => useAppStore.getState().toggleDryRun(),
        },
      ],
    },
    {
      label: "Schema",
      items: [
        {
          label: "Open Schema Diagram",
          action: openSchemaTab,
        },
        { label: "separator", separator: true },
        {
          label: "Refresh Schema",
          action: () => (useAppStore.getState() as any).refreshSchema?.(),
        },
      ],
    },
    {
      label: "Terminal",
      items: [
        {
          label: "New Terminal",
          action: () => {
            setActiveBottomTab("terminal");
            setBottomPanelVisible(true);
          },
        },
        { label: "separator", separator: true },
        {
          label: "Show Results",
          action: () => {
            setActiveBottomTab("results");
            setBottomPanelVisible(true);
          },
        },
        {
          label: "Show Problems",
          action: () => {
            setActiveBottomTab("problems");
            setBottomPanelVisible(true);
          },
        },
        {
          label: "Show History",
          action: () => {
            setActiveBottomTab("history");
            setBottomPanelVisible(true);
          },
        },
      ],
    },
    {
      label: "Help",
      items: [
        {
          label: "Documentation",
          action: () => window.open("https://docs.valstinestudio.com", "_blank"),
        },
        {
          label: "Keyboard Shortcuts",
          action: () => openSettingsPanel("shortcuts" as any),
        },
        { label: "separator", separator: true },
        {
          label: "About Valstine Studio",
          action: () => openSettingsPanel("about"),
        },
      ],
    },
  ];
}

function DropdownMenu({
  menu,
  onClose,
}: {
  menu: MenuDef;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-0.5 min-w-[220px] bg-popover border border-border rounded-md shadow-xl py-1 z-[100]">
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} className="h-px bg-border mx-2 my-1" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              item.action?.();
              onClose();
            }}
            className={cn(
              "w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors",
              item.disabled
                ? "text-muted-foreground/50 cursor-default"
                : "text-foreground hover:bg-accent",
            )}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-8 text-[10px] text-muted-foreground">
                {item.shortcut}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const menus = useMenus();

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        menuBarRef.current &&
        !menuBarRef.current.contains(e.target as Node)
      ) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // On macOS Electron the native menu bar handles these menus
  const isElectronMac =
    typeof window !== "undefined" &&
    (window as any).electronAPI?.isElectron &&
    (window as any).electronAPI?.platform === "darwin";

  if (isElectronMac) return null;

  return (
    <div
      ref={menuBarRef}
      className="flex items-center gap-0 shrink-0 max-md:hidden"
    >
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            onMouseDown={() =>
              setOpenMenu(openMenu === menu.label ? null : menu.label)
            }
            onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-sm transition-colors",
              openMenu === menu.label
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <DropdownMenu menu={menu} onClose={() => setOpenMenu(null)} />
          )}
        </div>
      ))}
    </div>
  );
}
