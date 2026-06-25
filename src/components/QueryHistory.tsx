import { useState } from "react";
import { Clock, Trash2, Play, Copy, Check, Search, X, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, QueryHistoryEntry } from "@/store/app-store";

const SLOW_MS = 1000;
const VERY_SLOW_MS = 5000;

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

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function truncateQuery(query: string, maxLen = 80) {
  const oneline = query.replace(/\s+/g, " ").trim();
  return oneline.length > maxLen ? oneline.slice(0, maxLen) + "..." : oneline;
}

function SlowBadge({ ms }: { ms: number }) {
  if (ms < SLOW_MS) return null;
  const isVerySlow = ms >= VERY_SLOW_MS;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded border shrink-0",
        isVerySlow
          ? "bg-destructive/15 text-destructive border-destructive/30"
          : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
      )}
      title={`Query took ${formatMs(ms)}`}
    >
      {isVerySlow ? <AlertTriangle className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
      SLOW
    </span>
  );
}

function HistoryItem({ entry }: { entry: QueryHistoryEntry }) {
  const { loadHistoryQuery, deleteHistoryEntry } = useAppStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isSlow = entry.executionTime >= SLOW_MS;

  return (
    <div className={cn(
      "group px-3 py-2 hover:bg-secondary/50 transition-colors border-b border-panel-border/50 last:border-0",
      isSlow && entry.status === "success" && "border-l-2 border-l-yellow-500/40",
    )}>
      <div className="flex items-start gap-2">
        <div className={cn("mt-0.5 w-1.5 h-1.5 rounded-full shrink-0", entry.status === "success" ? "bg-success" : "bg-destructive")} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-foreground leading-relaxed break-all line-clamp-2">
            {truncateQuery(entry.query, 120)}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span>{formatTime(entry.executedAt)}</span>
            <span className="w-px h-2.5 bg-border" />
            <span className={cn(isSlow && entry.status === "success" && "text-yellow-400 font-medium")}>
              {formatMs(entry.executionTime)}
            </span>
            {entry.status === "success" && <SlowBadge ms={entry.executionTime} />}
            <span className="w-px h-2.5 bg-border" />
            <span>{entry.rowCount} rows</span>
            <span className="w-px h-2.5 bg-border" />
            <span className="truncate max-w-[100px]">{entry.connectionName}</span>
          </div>
          {entry.status === "error" && entry.errorMessage && (
            <p className="text-[10px] text-destructive/80 mt-1 truncate">{entry.errorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => loadHistoryQuery(entry.query)} title="Open in new tab" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Play className="w-3 h-3" />
          </button>
          <button onClick={handleCopy} title="Copy query" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </button>
          <button onClick={() => deleteHistoryEntry(entry.id)} title="Delete" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

type FilterTab = "all" | "slow" | "errors";

export function QueryHistory() {
  const { queryHistory, clearHistory } = useAppStore();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  const slowCount = queryHistory.filter(h => h.executionTime >= SLOW_MS && h.status === "success").length;
  const errorCount = queryHistory.filter(h => h.status === "error").length;

  const tabFiltered = queryHistory.filter(h => {
    if (tab === "slow") return h.executionTime >= SLOW_MS && h.status === "success";
    if (tab === "errors") return h.status === "error";
    return true;
  });

  const filtered = search
    ? tabFiltered.filter(h =>
        h.query.toLowerCase().includes(search.toLowerCase()) ||
        h.connectionName.toLowerCase().includes(search.toLowerCase()),
      )
    : tabFiltered;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between shrink-0">
        <span>Query History</span>
        {queryHistory.length > 0 && (
          <button onClick={clearHistory} title="Clear all history" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center border-b border-panel-border shrink-0">
        {([
          { id: "all" as const, label: "All", count: queryHistory.length },
          { id: "slow" as const, label: "Slow", count: slowCount },
          { id: "errors" as const, label: "Errors", count: errorCount },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 text-[11px] border-b-2 transition-colors",
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "text-[9px] px-1 py-0.5 rounded-full",
                t.id === "slow" ? "bg-yellow-500/20 text-yellow-400" :
                t.id === "errors" ? "bg-destructive/20 text-destructive" :
                "bg-secondary text-muted-foreground",
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      {queryHistory.length > 3 && (
        <div className="px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 bg-secondary rounded px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter history..."
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">
              {queryHistory.length === 0 ? "No queries executed yet" : `No ${tab === "all" ? "matching" : tab} queries`}
            </p>
          </div>
        ) : (
          filtered.map(entry => <HistoryItem key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
