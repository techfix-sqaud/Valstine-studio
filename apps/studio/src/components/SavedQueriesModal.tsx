import { useState, useEffect, useRef } from "react";
import { X, BookOpen, Search, Trash2, Play, ChevronDown } from "lucide-react";
import { cn } from "@valstine/ui/lib/utils";
import * as api from "@valstine/core/lib/api";
import { useAppStore } from "@valstine/core/store/app-store";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SavedQueriesModal({ open, onClose }: Props) {
  const [queries, setQueries] = useState<api.SavedQuery[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { addTab, activeConnectionId, connections } = useAppStore();
  const conn = connections.find((c) => c.id === activeConnectionId);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.appGetSavedQueries()
      .then(setQueries)
      .catch(() => setQueries([]))
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  const norm = filter.trim().toLowerCase();
  const visible = norm
    ? queries.filter((q) =>
        q.name.toLowerCase().includes(norm) ||
        q.description.toLowerCase().includes(norm) ||
        q.sql.toLowerCase().includes(norm) ||
        q.tags.some((t) => t.toLowerCase().includes(norm)),
      )
    : queries;

  function openQuery(sq: api.SavedQuery) {
    addTab({
      id: `tab-${Date.now()}`,
      title: `${sq.name}.sql`,
      content: sq.sql,
      connectionId: activeConnectionId || conn?.id || "",
      isDirty: false,
    });
    onClose();
  }

  async function deleteQuery(id: string) {
    await api.appDeleteSavedQuery(id).catch(() => {});
    setQueries((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50">
      <div className="w-full max-w-2xl max-h-[75vh] flex flex-col rounded-lg border border-panel-border bg-panel-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <BookOpen className="w-4 h-4 text-primary" />
            Saved Queries
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded ml-1">
              {queries.length}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-panel-border shrink-0">
          <div className="flex items-center gap-2 bg-secondary rounded px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, description, SQL…"
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">Loading…</div>
          )}
          {!loading && visible.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-xs gap-2">
              <BookOpen className="w-8 h-8 opacity-30" />
              {queries.length === 0 ? (
                <>
                  <p>No saved queries yet.</p>
                  <p className="text-[10px] opacity-70">Use the Save button in the toolbar to save any query.</p>
                </>
              ) : (
                <p>No queries match "{filter}"</p>
              )}
            </div>
          )}

          {!loading && visible.map((sq) => (
            <div
              key={sq.id}
              className="group flex items-start gap-3 px-4 py-3 border-b border-panel-border/50 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openQuery(sq)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-foreground">{sq.name}</span>
                  {sq.connectionType && (
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                      {sq.connectionType}
                    </span>
                  )}
                  {sq.tags.filter(Boolean).map((t) => (
                    <span key={t} className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
                {sq.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sq.description}</p>
                )}
                <pre className="text-[10px] text-muted-foreground font-mono mt-1 truncate">{sq.sql.slice(0, 120)}</pre>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => openQuery(sq)}
                  className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Open in editor"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteQuery(sq.id)}
                  className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
