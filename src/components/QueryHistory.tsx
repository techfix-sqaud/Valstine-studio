import { useState } from "react";
import { Clock, Trash2, Play, Copy, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, QueryHistoryEntry } from "@/store/app-store";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function truncateQuery(query: string, maxLen = 80) {
  const oneline = query.replace(/\s+/g, " ").trim();
  return oneline.length > maxLen ? oneline.slice(0, maxLen) + "..." : oneline;
}

function HistoryItem({ entry }: { entry: QueryHistoryEntry }) {
  const { loadHistoryQuery, deleteHistoryEntry } = useAppStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group px-3 py-2 hover:bg-secondary/50 transition-colors border-b border-panel-border/50 last:border-0">
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 w-1.5 h-1.5 rounded-full shrink-0",
            entry.status === "success" ? "bg-success" : "bg-destructive",
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-foreground leading-relaxed break-all line-clamp-2">
            {truncateQuery(entry.query, 120)}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span>{formatTime(entry.executedAt)}</span>
            <span className="w-px h-2.5 bg-border" />
            <span>{entry.executionTime}ms</span>
            <span className="w-px h-2.5 bg-border" />
            <span>{entry.rowCount} rows</span>
            <span className="w-px h-2.5 bg-border" />
            <span className="truncate">{entry.connectionName}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => loadHistoryQuery(entry.query)}
            title="Open in new tab"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Play className="w-3 h-3" />
          </button>
          <button
            onClick={handleCopy}
            title="Copy query"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="w-3 h-3 text-success" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={() => deleteHistoryEntry(entry.id)}
            title="Delete"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function QueryHistory() {
  const { queryHistory, clearHistory } = useAppStore();
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? queryHistory.filter(
        (h) =>
          h.query.toLowerCase().includes(filter.toLowerCase()) ||
          h.connectionName.toLowerCase().includes(filter.toLowerCase()),
      )
    : queryHistory;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>Query History</span>
        {queryHistory.length > 0 && (
          <button
            onClick={clearHistory}
            title="Clear all history"
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {queryHistory.length > 3 && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 bg-secondary rounded px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter history..."
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">
              {queryHistory.length === 0
                ? "No queries executed yet"
                : "No matching queries"}
            </p>
          </div>
        ) : (
          filtered.map((entry) => <HistoryItem key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
