import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
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

function useMenus(): MenuDef[] {
  const {
    toggleTheme,
    toggleSidebar,
    toggleCommandPalette,
    executeQuery,
    setBottomPanelVisible,
    bottomPanelVisible,
    sidebarOpen,
    addTab,
    tabs,
    openDashboardTab,
    openSchemaTab,
    setActiveBottomTab,
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
        { label: "Preferences", shortcut: "⌘,", disabled: true },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "⌘Z", disabled: true },
        { label: "Redo", shortcut: "⇧⌘Z", disabled: true },
        { label: "separator", separator: true },
        { label: "Cut", shortcut: "⌘X", disabled: true },
        { label: "Copy", shortcut: "⌘C", disabled: true },
        { label: "Paste", shortcut: "⌘V", disabled: true },
        { label: "separator", separator: true },
        { label: "Find", shortcut: "⌘F", disabled: true },
        { label: "Replace", shortcut: "⌥⌘F", disabled: true },
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
          action: () =>
            useAppStore.getState().setActiveSidebarTab("connections"),
        },
      ],
    },
    {
      label: "Run",
      items: [
        { label: "Execute Query", shortcut: "⌘↵", action: executeQuery },
        { label: "Execute Selection", shortcut: "⇧⌘↵", disabled: true },
        { label: "separator", separator: true },
        { label: "Explain Query", disabled: true },
        { label: "Explain Analyze", disabled: true },
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
        { label: "Welcome", disabled: true },
        { label: "Documentation", disabled: true },
        { label: "separator", separator: true },
        { label: "About Valstine Studio", disabled: true },
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
