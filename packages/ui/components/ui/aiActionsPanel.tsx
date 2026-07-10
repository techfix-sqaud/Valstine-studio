import { QUICK_ACTIONS } from "@/Actions/AIActions";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { Zap, ChevronDown } from "lucide-react";
import React, { useState } from "react";

export const QuickActionsPanel = ({
  onAction,
}: {
  onAction: (prompt: string) => void;
}) => {
  const { tabs, activeTabId, activeConnectionId, connections } = useAppStore();
  const [open, setOpen] = useState(true);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const conn = connections.find((c) => c.id === activeConnectionId);
  const sql = activeTab?.content?.trim() ?? "";
  const connName = conn?.name ?? "database";
  const dbType = conn?.type ?? "pg";

  return (
    <div className="border-b border-panel-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <Zap className="w-3 h-3" />
        Quick Actions
        <ChevronDown
          className={cn(
            "w-3 h-3 ml-auto transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="px-2 pb-2 grid grid-cols-2 gap-1">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            const disabled = action.requiresQuery && !sql;
            return (
              <button
                key={action.label}
                disabled={disabled}
                onClick={() => {
                  const prompt = action.buildPrompt(sql, connName, dbType);
                  onAction(prompt);
                }}
                title={
                  disabled ? "No active query in editor" : action.description
                }
                className={cn(
                  "flex items-start gap-1.5 px-2 py-1.5 rounded-md text-left border transition-colors",
                  disabled
                    ? "border-transparent text-muted-foreground/40 cursor-not-allowed"
                    : "border-panel-border hover:border-primary/40 hover:bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3 h-3 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium leading-none truncate">
                    {action.label}
                  </div>
                  <div className="text-[9px] leading-tight text-muted-foreground/70 mt-0.5 truncate">
                    {action.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
