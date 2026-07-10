import { useState } from 'react';
import {
  Trash2,
  X,
  Copy,
  Check,
  RotateCcw,
  Table2,
  Columns,
  Rows,
  ChevronDown,
  ChevronRight,
  Eraser,
} from 'lucide-react';
import type { RecycleBinEntry } from '@valstine/core/lib/sql-optimizer';
import { useAppStore } from '@valstine/core/store/app-store';
import { cn } from '@valstine/ui/lib/utils';

const ACTION_CONFIG = {
  DROP_TABLE: {
    icon: Table2,
    label: 'Table Dropped',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
  DROP_COLUMN: {
    icon: Columns,
    label: 'Column Dropped',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  DELETE_ROWS: {
    icon: Rows,
    label: 'Rows Deleted',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
  },
};

function EntryCard({ entry }: { entry: RecycleBinEntry }) {
  const cfg = ACTION_CONFIG[entry.action_type];
  const Icon = cfg.icon;
  const [expanded, setExpanded] = useState(false);
  const [copiedUndo, setCopiedUndo] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const date = new Date(entry.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className={cn('rounded-lg border p-3 space-y-2', cfg.bg, cfg.border)}>
      {/* Entry header */}
      <div className="flex items-start gap-2">
        <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', cfg.bg, cfg.border)}>
          <Icon className={cn('h-3 w-3', cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', cfg.color)}>
              {cfg.label}
            </span>
            <span className="rounded border border-panel-border bg-background/50 px-1.5 py-0.5 font-mono text-[9px] text-foreground/70">
              {entry.engine.toUpperCase()}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-foreground/90 truncate">
            <span className="text-foreground">{entry.target_table}</span>
            {entry.target_column && (
              <span className="text-muted-foreground"> › {entry.target_column}</span>
            )}
          </div>
          <div className="mt-0.5 text-[9px] text-muted-foreground">
            {dateStr} at {timeStr}
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-panel-border/50 pt-2">
          {/* Undo SQL */}
          {entry.undo_sql && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <RotateCcw className="h-2.5 w-2.5" />
                  Undo SQL
                </span>
                <button
                  onClick={() => copy(entry.undo_sql, setCopiedUndo)}
                  className="flex items-center gap-1 rounded bg-background/60 px-2 py-0.5 text-[9px] text-muted-foreground hover:text-foreground"
                >
                  {copiedUndo ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                  {copiedUndo ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-32 overflow-auto rounded border border-panel-border bg-background/70 p-2 font-mono text-[10px] text-foreground/80 whitespace-pre-wrap break-all">
                {entry.undo_sql}
              </pre>
            </div>
          )}

          {/* Original query */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Original Query
              </span>
              <button
                onClick={() => copy(entry.original_query, setCopiedOriginal)}
                className="flex items-center gap-1 rounded bg-background/60 px-2 py-0.5 text-[9px] text-muted-foreground hover:text-foreground"
              >
                {copiedOriginal ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                {copiedOriginal ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="max-h-24 overflow-auto rounded border border-panel-border bg-background/70 p-2 font-mono text-[10px] text-muted-foreground/70 whitespace-pre-wrap break-all">
              {entry.original_query}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function SqlRecycleBinPanel() {
  const { recycleBin, clearRecycleBin, recycleBinOpen, setRecycleBinOpen } = useAppStore();

  if (!recycleBinOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex w-full max-w-xl max-h-[85vh] flex-col rounded-xl border border-panel-border bg-panel-bg shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-panel-border px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/15 border border-orange-500/30">
            <Trash2 className="h-3.5 w-3.5 text-orange-400" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recycle Bin
            </div>
            <div className="text-xs text-foreground">
              {recycleBin.length === 0
                ? 'No operations logged'
                : `${recycleBin.length} operation${recycleBin.length === 1 ? '' : 's'} logged`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {recycleBin.length > 0 && (
              <button
                onClick={clearRecycleBin}
                title="Clear all entries"
                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <Eraser className="h-3 w-3" />
                Clear all
              </button>
            )}
            <button
              onClick={() => setRecycleBinOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {recycleBin.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <Trash2 className="h-8 w-8 opacity-30" />
              <div className="text-center">
                <div className="text-sm font-medium">Recycle Bin is empty</div>
                <div className="text-xs mt-1 opacity-70">
                  Destructive queries processed by the SQL Optimizer will appear here
                  with their undo SQL for recovery reference.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {recycleBin.map(entry => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
