import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@valstine/ui/lib/utils";

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

let globalShow:
  | ((x: number, y: number, items: ContextMenuItem[]) => void)
  | null = null;

export function showContextMenu(e: React.MouseEvent, items: ContextMenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  globalShow?.(e.clientX, e.clientY, items);
}

export function ContextMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    globalShow = (x, y, items) => {
      // Adjust position so menu doesn't overflow viewport
      const menuWidth = 220;
      const menuHeight = items.length * 30;
      const adjX =
        x + menuWidth > window.innerWidth
          ? window.innerWidth - menuWidth - 8
          : x;
      const adjY =
        y + menuHeight > window.innerHeight
          ? window.innerHeight - menuHeight - 8
          : y;
      setMenu({ x: Math.max(4, adjX), y: Math.max(4, adjY), items });
    };
    return () => {
      globalShow = null;
    };
  }, []);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [menu, close]);

  return (
    <>
      {children}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[200] min-w-[200px] bg-popover border border-border rounded-md shadow-2xl py-1 animate-in fade-in-0 zoom-in-95"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.items.map((item, i) =>
            item.separator ? (
              <div key={i} className="h-px bg-border mx-2 my-1" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  item.action?.();
                  close();
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors",
                  item.disabled
                    ? "text-muted-foreground/50 cursor-default"
                    : item.danger
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-accent",
                )}
              >
                {item.icon && (
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {item.icon}
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-[10px] text-muted-foreground ml-4">
                    {item.shortcut}
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
