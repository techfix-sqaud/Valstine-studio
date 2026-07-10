import { useState, useMemo } from "react";
import { X, Zap, ChevronRight, ChevronDown, Lightbulb, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ── PostgreSQL node tree ─────────────────────────────────────────────────────

function costBar(actual: number, maxActual: number) {
  const pct = maxActual > 0 ? Math.min(100, (actual / maxActual) * 100) : 0;
  const color =
    pct > 75 ? "bg-red-500" : pct > 40 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden shrink-0">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function maxActualTime(node: any): number {
  let m = node["Actual Total Time"] ?? 0;
  for (const child of node.Plans ?? []) {
    m = Math.max(m, maxActualTime(child));
  }
  return m;
}

function PgNode({ node, depth, maxTime }: { node: any; depth: number; maxTime: number }) {
  const [open, setOpen] = useState(depth < 3);
  const children: any[] = node.Plans ?? [];
  const hasChildren = children.length > 0;
  const actualTime: number = node["Actual Total Time"] ?? 0;
  const totalCost: number = node["Total Cost"] ?? 0;
  const rows: number = node["Actual Rows"] ?? node["Plan Rows"] ?? 0;
  const loops: number = node["Actual Loops"] ?? 1;
  const nodeType: string = node["Node Type"] ?? "?";
  const relation: string = node["Relation Name"] ? ` on ${node["Schema"] ? node["Schema"] + "." : ""}${node["Relation Name"]}` : "";
  const alias: string = node["Alias"] && node["Alias"] !== node["Relation Name"] ? ` (${node["Alias"]})` : "";

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-secondary/60 transition-colors cursor-pointer",
          depth === 0 && "font-medium",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}
        <span className="text-primary font-mono shrink-0">{nodeType}</span>
        <span className="text-foreground truncate">{relation}{alias}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {actualTime > 0 && costBar(actualTime * loops, maxTime)}
          <span className="text-[10px] text-muted-foreground w-14 text-right">
            {actualTime > 0 ? `${(actualTime * loops).toFixed(2)}ms` : `~${totalCost.toFixed(0)}`}
          </span>
          <span className="text-[10px] text-muted-foreground w-14 text-right">
            {rows.toLocaleString()} rows
          </span>
          <span className="text-[10px] text-muted-foreground w-8 text-right">
            ×{loops}
          </span>
        </div>
      </div>
      {open && hasChildren && (
        <div>
          {children.map((child: any, i: number) => (
            <PgNode key={i} node={child} depth={depth + 1} maxTime={maxTime} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── MySQL node tree ──────────────────────────────────────────────────────────

function MySqlNode({ node }: { node: any }) {
  return (
    <div className="text-[11px] font-mono">
      <pre className="whitespace-pre-wrap break-words text-foreground text-[10px] p-2 rounded bg-secondary/40 overflow-auto max-h-64">
        {JSON.stringify(node, null, 2)}
      </pre>
    </div>
  );
}

// ── SQLite query plan ────────────────────────────────────────────────────────

function SqliteNode({ node }: { node: any }) {
  return (
    <div className="flex items-start gap-3 px-2 py-1 text-[11px]" style={{ paddingLeft: `${8 + (node.parent ?? 0) * 20}px` }}>
      <span className="text-muted-foreground w-6 text-right shrink-0">{node.id}</span>
      <span className="text-foreground">{node.detail}</span>
    </div>
  );
}

// ── Insights engine (PostgreSQL only) ────────────────────────────────────────

interface Insight {
  level: 'error' | 'warn' | 'info';
  title: string;
  detail: string;
}

function collectNodes(node: any, out: any[] = []): any[] {
  out.push(node);
  for (const child of node.Plans ?? []) collectNodes(child, out);
  return out;
}

function buildInsights(plan: any): Insight[] {
  if (!plan) return [];
  const root = plan?.Plan ?? plan;
  const nodes = collectNodes(root);
  const insights: Insight[] = [];

  for (const n of nodes) {
    const type: string = n["Node Type"] ?? "";
    const table: string = n["Relation Name"] ?? "";
    const planRows: number = n["Plan Rows"] ?? 0;
    const actualRows: number = n["Actual Rows"] ?? planRows;
    const loops: number = n["Actual Loops"] ?? 1;
    const totalRows = actualRows * loops;
    const actualTime: number = (n["Actual Total Time"] ?? 0) * loops;

    // Seq Scan on large table
    if (type === "Seq Scan" && table && totalRows > 5000) {
      insights.push({
        level: 'warn',
        title: `Sequential scan on "${table}"`,
        detail: `Scanned ${totalRows.toLocaleString()} rows without an index. Consider adding an index on the columns in the WHERE clause.`,
      });
    }

    // Seq Scan — even small, worth noting
    if (type === "Seq Scan" && table && totalRows > 0 && totalRows <= 5000) {
      insights.push({
        level: 'info',
        title: `Seq scan on "${table}" (${totalRows.toLocaleString()} rows)`,
        detail: 'Table is small enough that a sequential scan may be acceptable, but an index could still help if this query runs frequently.',
      });
    }

    // Nested loop with high iteration count
    if (type === "Nested Loop" && loops > 100) {
      insights.push({
        level: 'warn',
        title: `Nested Loop ×${loops.toLocaleString()} iterations`,
        detail: 'High loop count may indicate an N+1 pattern or a missing join index. Check if an index on the inner table\'s join column exists.',
      });
    }

    // Row estimate mismatch (stale statistics)
    if (planRows > 0 && actualRows > 0) {
      const ratio = actualRows / planRows;
      if (ratio > 10 || ratio < 0.1) {
        insights.push({
          level: 'warn',
          title: `Row estimate mismatch on "${table || type}"`,
          detail: `Planner expected ${planRows.toLocaleString()} rows but got ${actualRows.toLocaleString()}. Run ANALYZE to refresh table statistics.`,
        });
      }
    }

    // Sort without index
    if (type === "Sort" && actualTime > 50) {
      insights.push({
        level: 'info',
        title: 'Expensive in-memory sort',
        detail: `Sorting took ${actualTime.toFixed(2)}ms. Adding an index on the ORDER BY column(s) may eliminate this node.`,
      });
    }

    // Hash join — informational
    if (type === "Hash Join" && totalRows > 50000) {
      insights.push({
        level: 'info',
        title: 'Large Hash Join',
        detail: `Hash join processed ${totalRows.toLocaleString()} rows. Ensure both sides have appropriate indexes and statistics are up to date.`,
      });
    }

    // Bitmap Heap Scan with many rows — index exists but may not be selective
    if (type === "Bitmap Heap Scan" && totalRows > 20000) {
      insights.push({
        level: 'info',
        title: `Low-selectivity index scan on "${table}"`,
        detail: 'The index exists but returns a large proportion of rows. A partial index or composite index with higher selectivity might help.',
      });
    }
  }

  // De-duplicate by title
  const seen = new Set<string>();
  return insights.filter(i => {
    if (seen.has(i.title)) return false;
    seen.add(i.title);
    return true;
  });
}

// ── Insights panel ───────────────────────────────────────────────────────────

function InsightsPanel({ plan }: { plan: any }) {
  const insights = useMemo(() => buildInsights(plan), [plan]);

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <Lightbulb className="w-5 h-5 text-success" />
        <p className="text-xs">No issues detected — plan looks healthy.</p>
      </div>
    );
  }

  const icon = (level: Insight['level']) => {
    if (level === 'error') return <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />;
    if (level === 'warn') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />;
    return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />;
  };

  const bg = (level: Insight['level']) => {
    if (level === 'error') return 'border-destructive/30 bg-destructive/5';
    if (level === 'warn') return 'border-yellow-400/30 bg-yellow-400/5';
    return 'border-blue-400/30 bg-blue-400/5';
  };

  return (
    <div className="p-3 space-y-2">
      {insights.map((ins, i) => (
        <div key={i} className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5", bg(ins.level))}>
          {icon(ins.level)}
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-foreground">{ins.title}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{ins.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  plan: any;
  dbType: string;
  query: string;
  onClose: () => void;
}

export function ExplainModal({ open, plan, dbType, query, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'plan' | 'insights'>('plan');

  if (!open || !plan) return null;

  const maxTime = dbType === "pg" ? maxActualTime(plan?.Plan ?? plan) : 0;
  const canShowInsights = dbType === "pg";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50">
      <div className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-lg border border-panel-border bg-panel-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Zap className="w-4 h-4 text-yellow-400" />
            EXPLAIN Plan
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-secondary rounded font-normal ml-1">
              {dbType.toUpperCase()}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Query preview */}
        <div className="px-4 py-2 border-b border-panel-border/50 shrink-0">
          <pre className="text-[10px] text-muted-foreground font-mono truncate">{query}</pre>
        </div>

        {/* Tabs (plan / insights) */}
        {canShowInsights && (
          <div className="flex items-center gap-0 border-b border-panel-border/50 shrink-0">
            {(['plan', 'insights'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-4 py-1.5 text-[11px] border-b-2 transition-colors capitalize",
                  activeTab === t
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t === 'insights' ? <span className="flex items-center gap-1"><Lightbulb className="w-3 h-3" />Insights</span> : 'Plan'}
              </button>
            ))}
          </div>
        )}

        {/* Column headers (PG plan tab only) */}
        {dbType === "pg" && activeTab === 'plan' && (
          <div className="flex items-center gap-2 px-2 py-1 border-b border-panel-border/50 text-[10px] text-muted-foreground shrink-0">
            <span className="flex-1 pl-4">Node type / Relation</span>
            <span className="w-16 text-right">Cost bar</span>
            <span className="w-14 text-right">Time</span>
            <span className="w-14 text-right">Rows</span>
            <span className="w-8 text-right">Loops</span>
          </div>
        )}

        {/* Plan tree / Insights */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'plan' || !canShowInsights ? (
            <>
              {dbType === "pg" && (plan?.Plan ?? plan) && (
                <PgNode node={plan?.Plan ?? plan} depth={0} maxTime={maxTime} />
              )}
              {dbType === "mysql" && <MySqlNode node={plan} />}
              {dbType === "sqlite" && plan.type === "sqlite-qp" && (
                <div className="py-1">
                  {plan.nodes?.map((n: any, i: number) => (
                    <SqliteNode key={i} node={n} />
                  ))}
                </div>
              )}
              {dbType === "mssql" && plan.type === "mssql-showplan" && (
                <div className="p-3">
                  <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap">
                    {JSON.stringify(plan.rows, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <InsightsPanel plan={plan} />
          )}
        </div>

        {/* PG summary stats */}
        {dbType === "pg" && plan?.["Planning Time"] != null && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-panel-border/50 text-[11px] text-muted-foreground shrink-0">
            <span>Planning: <strong className="text-foreground">{plan["Planning Time"]?.toFixed(2)}ms</strong></span>
            <span>Execution: <strong className="text-foreground">{plan["Execution Time"]?.toFixed(2)}ms</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
