import { useState } from 'react';
import {
  Wand2,
  X,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Zap,
  ShieldAlert,
} from 'lucide-react';
import type { SqlOptimizerResult } from '@valstine/core/lib/sql-optimizer';
import { cn } from '@valstine/ui/lib/utils';

interface Props {
  result: SqlOptimizerResult;
  onProceed: () => void;
  onCancel: () => void;
}

export function SqlOptimizerModal({ result, onProceed, onCancel }: Props) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [copiedExec, setCopiedExec] = useState(false);
  const [copiedUndo, setCopiedUndo] = useState(false);

  const hasWarnings = result.error_warnings.length > 0;
  const hasRecycleBin = result.recycle_bin_action.action_type !== 'NONE';
  const queryChanged = result.execution_query.trim() !== result.original_query.trim();

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const actionTypeLabel: Record<string, string> = {
    DROP_TABLE: 'Table dropped',
    DROP_COLUMN: 'Column dropped',
    DELETE_ROWS: 'Rows deleted',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex w-full max-w-2xl max-h-[88vh] flex-col rounded-xl border border-panel-border bg-panel-bg shadow-2xl">

        {/* Header */}
        <div className="flex items-start gap-3 rounded-t-xl border-b border-panel-border bg-primary/8 p-4">
          <div className="mt-0.5 shrink-0 rounded-lg border border-primary/30 bg-primary/10 p-1.5">
            <Wand2 className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                SQL Optimizer
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Pre-Execution Analysis
              </span>
              <span className="ml-auto rounded border border-panel-border bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {result.detected_engine.toUpperCase()}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-foreground/80 leading-snug">
              {result.is_destructive
                ? 'Destructive operation detected. Review the analysis below before executing.'
                : 'Query analyzed and optimized for your database engine.'}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-auto p-4">

          {/* Warnings */}
          {hasWarnings && (
            <div className="space-y-1.5">
              {result.error_warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/8 px-2.5 py-1.5 text-xs"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-yellow-400" />
                  <span className="text-foreground/80">{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Execution query */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Zap className="h-3 w-3 text-primary" />
                Will Execute
                {queryChanged && (
                  <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                    Auto-corrected
                  </span>
                )}
              </span>
              <button
                onClick={() => copy(result.execution_query, setCopiedExec)}
                className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copiedExec ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                {copiedExec ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="max-h-36 overflow-auto rounded-md border border-panel-border bg-background/60 p-2.5 font-mono text-[11px] text-foreground/90 whitespace-pre-wrap break-all">
              {result.execution_query}
            </pre>
          </div>

          {/* Original query (collapsible if different) */}
          {queryChanged && (
            <div>
              <button
                onClick={() => setShowOriginal(v => !v)}
                className="mb-1.5 flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {showOriginal ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                View original query
              </button>
              {showOriginal && (
                <pre className="max-h-28 overflow-auto rounded-md border border-panel-border bg-background/40 p-2.5 font-mono text-[11px] text-muted-foreground/70 whitespace-pre-wrap break-all line-through decoration-muted-foreground/40">
                  {result.original_query}
                </pre>
              )}
            </div>
          )}

          {/* Recycle bin action */}
          {hasRecycleBin && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/8 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/15">
                  <Trash2 className="h-3.5 w-3.5 text-orange-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-orange-300">
                    {actionTypeLabel[result.recycle_bin_action.action_type] ?? result.recycle_bin_action.action_type}
                    {' — '}
                    <span className="font-mono">{result.recycle_bin_action.target_table}</span>
                    {result.recycle_bin_action.target_column && (
                      <> &rsaquo; <span className="font-mono">{result.recycle_bin_action.target_column}</span></>
                    )}
                  </div>
                  <div className="text-[10px] text-orange-400/70 mt-0.5">
                    This operation will be logged to your Recycle Bin for recovery reference.
                  </div>
                </div>
              </div>

              {result.recycle_bin_action.undo_sql && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-orange-400/80">
                      Undo SQL
                    </span>
                    <button
                      onClick={() => copy(result.recycle_bin_action.undo_sql, setCopiedUndo)}
                      className="flex items-center gap-1 rounded bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-400 hover:bg-orange-500/25"
                    >
                      {copiedUndo ? <Check className="h-2.5 w-2.5 text-green-400" /> : <Copy className="h-2.5 w-2.5" />}
                      {copiedUndo ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="max-h-28 overflow-auto rounded border border-orange-500/20 bg-black/20 p-2 font-mono text-[10px] text-orange-300/80 whitespace-pre-wrap break-all">
                    {result.recycle_bin_action.undo_sql}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* No-op info for safe queries */}
          {!hasWarnings && !hasRecycleBin && !queryChanged && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/8 px-2.5 py-2 text-xs text-muted-foreground">
              <Check className="h-3 w-3 shrink-0 text-green-500" />
              Query looks safe. No corrections needed.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 rounded-b-xl border-t border-panel-border p-4">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {hasRecycleBin && (
              <>
                <Trash2 className="h-3 w-3 text-orange-400" />
                Will be logged to Recycle Bin
              </>
            )}
            {result.is_destructive && !hasRecycleBin && (
              <>
                <ShieldAlert className="h-3 w-3 text-yellow-400" />
                Destructive — review before proceeding
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onCancel}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={onProceed}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                result.is_destructive
                  ? 'bg-orange-500 text-white hover:bg-orange-400'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {result.is_destructive ? 'Execute (Confirmed)' : 'Execute'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
