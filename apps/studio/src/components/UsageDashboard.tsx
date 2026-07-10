import { useMemo } from "react";
import {
  Activity,
  Bot,
  Clock3,
  Database,
  HardDrive,
  LayoutDashboard,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  TableProperties,
  TrendingUp,
} from "lucide-react";
import type { QueryHistoryEntry } from "@valstine/core/store/app-store";
import { DBConnection, mockTables } from "@valstine/core/lib/mock-data";
import { cn } from "@valstine/ui/lib/utils";
import { useAppStore } from "@valstine/core/store/app-store";

type LoadPoint = {
  label: string;
  value: number;
  latency: number;
};

type DashboardActivity = {
  title: string;
  detail: string;
  time: string;
  status: "healthy" | "attention" | "review";
};

const fallbackLoadSeries: LoadPoint[] = [
  { label: "06:00", value: 18, latency: 44 },
  { label: "08:00", value: 26, latency: 52 },
  { label: "10:00", value: 41, latency: 58 },
  { label: "12:00", value: 48, latency: 63 },
  { label: "14:00", value: 56, latency: 71 },
  { label: "16:00", value: 47, latency: 66 },
  { label: "18:00", value: 35, latency: 54 },
  { label: "20:00", value: 22, latency: 46 },
];

const fallbackActivity: DashboardActivity[] = [
  {
    title: "Retention workload stabilized",
    detail:
      "Cohort reporting stayed below the 80 ms target after the last index refresh.",
    time: "6 min ago",
    status: "healthy",
  },
  {
    title: "Revenue mirror needs review",
    detail:
      "MySQL mirror is still serving successfully, but monthly finance scans are trending 11% slower.",
    time: "18 min ago",
    status: "attention",
  },
  {
    title: "Schema drift queued",
    detail:
      "One replica picked up an extra nullable flag on auth.sessions and should be diffed before release.",
    time: "43 min ago",
    status: "review",
  },
];

const engineLabels = {
  pg: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  mssql: "SQL Server",
} as const;

const operationalQueries = {
  performance: `WITH recent_runs AS (
  SELECT
    query_name,
    AVG(duration_ms) AS avg_duration_ms,
    MAX(duration_ms) AS worst_duration_ms,
    COUNT(*) AS executions
  FROM observability.query_runs
  WHERE executed_at >= NOW() - INTERVAL '24 hours'
  GROUP BY 1
)
SELECT
  query_name,
  avg_duration_ms,
  worst_duration_ms,
  executions
FROM recent_runs
ORDER BY worst_duration_ms DESC
LIMIT 20;`,
  capacity: `SELECT
  table_schema,
  table_name,
  row_estimate,
  storage_mb,
  bloat_pct
FROM observability.table_capacity
WHERE storage_mb > 256
ORDER BY storage_mb DESC, bloat_pct DESC
LIMIT 25;`,
};

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatRuntime(value: number) {
  return `${Math.round(value)} ms`;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );

  return sorted[index];
}

function formatTimeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "recent";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deriveLoadSeries(history: QueryHistoryEntry[]) {
  if (history.length === 0) {
    return fallbackLoadSeries;
  }

  const recent = history.slice(0, 8).reverse();
  return recent.map((entry) => ({
    label: formatTimeLabel(entry.executedAt),
    value: Math.max(
      8,
      Math.min(64, entry.rowCount > 0 ? Math.round(entry.rowCount / 8) : 12),
    ),
    latency: entry.executionTime,
  }));
}

function deriveActivity(
  history: QueryHistoryEntry[],
  connections: DBConnection[],
) {
  if (history.length >= 3) {
    return history.slice(0, 3).map((entry) => ({
      title:
        entry.status === "error"
          ? `Execution issue on ${entry.connectionName}`
          : `${entry.connectionName} handled ${entry.rowCount} rows`,
      detail:
        entry.status === "error"
          ? entry.errorMessage ||
            "The last execution failed and should be reviewed before release."
          : `${entry.query.slice(0, 96)}${entry.query.length > 96 ? "..." : ""}`,
      time: formatTimeLabel(entry.executedAt),
      status:
        entry.status === "error"
          ? "attention"
          : entry.executionTime > 120
            ? "review"
            : "healthy",
    }));
  }

  if (connections.length > 0) {
    return fallbackActivity;
  }

  return [
    {
      title: "No engines connected yet",
      detail:
        "Add a database connection to start collecting execution telemetry and usage trends.",
      time: "now",
      status: "review",
    },
  ];
}

export function UsageDashboard() {
  const {
    activeConnectionId,
    addTab,
    connections,
    openAiSidebar,
    openSchemaTab,
    queryHistory,
    setActiveConnection,
  } = useAppStore();

  const activeConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === activeConnectionId) ??
      connections[0] ??
      null,
    [activeConnectionId, connections],
  );

  const selectedTables = useMemo(() => {
    if (activeConnection && mockTables[activeConnection.id]?.length) {
      return mockTables[activeConnection.id];
    }

    return Object.values(mockTables).flat().slice(0, 6);
  }, [activeConnection]);

  const loadSeries = useMemo(
    () => deriveLoadSeries(queryHistory),
    [queryHistory],
  );
  const activityFeed = useMemo(
    () => deriveActivity(queryHistory, connections),
    [connections, queryHistory],
  );

  const totalRowsTracked = selectedTables.reduce(
    (sum, table) => sum + table.rowCount,
    0,
  );
  const successfulRuns = queryHistory.filter(
    (entry) => entry.status === "success",
  );
  const successRate =
    queryHistory.length > 0
      ? Math.round((successfulRuns.length / queryHistory.length) * 1000) / 10
      : 99.2;
  const p95Latency =
    queryHistory.length > 0
      ? percentile(
          queryHistory.map((entry) => entry.executionTime),
          0.95,
        )
      : 84;
  const queriesToday = queryHistory.length > 0 ? queryHistory.length : 128;
  const storageFootprintGb = Math.max(0.6, totalRowsTracked * 0.000014).toFixed(
    1,
  );
  const maxLoad = Math.max(...loadSeries.map((point) => point.value), 1);
  const hottestTables = [...selectedTables]
    .sort((left, right) => right.rowCount - left.rowCount)
    .slice(0, 5);
  const maxRows = Math.max(...hottestTables.map((table) => table.rowCount), 1);

  const engineCards = connections.length
    ? connections.map((connection) => {
        const connectionRuns = queryHistory.filter(
          (entry) => entry.connectionId === connection.id,
        );
        const workloadScore = connectionRuns.length
          ? Math.min(
              92,
              Math.max(
                28,
                Math.round(
                  connectionRuns.reduce(
                    (sum, entry) => sum + Math.min(entry.executionTime, 180),
                    0,
                  ) / connectionRuns.length,
                ),
              ),
            )
          : connection.status === "connected"
            ? 62
            : 24;

        return {
          ...connection,
          label: engineLabels[connection.type],
          workloadScore,
          recentRuns: connectionRuns.length,
        };
      })
    : [
        {
          id: "local-shadow",
          name: "Shadow Cluster",
          type: "pg" as const,
          host: "localhost",
          port: 5432,
          database: "observability",
          status: "disconnected" as const,
          label: "PostgreSQL",
          workloadScore: 0,
          recentRuns: 0,
        },
      ];

  const openOperationalTab = (title: string, content: string) => {
    const connectionId = activeConnection?.id ?? connections[0]?.id ?? "conn-1";
    if (connectionId && connectionId !== activeConnectionId) {
      setActiveConnection(connectionId);
    }

    addTab({
      id: `tab-${Date.now()}`,
      title,
      content,
      connectionId,
      isDirty: false,
      type: "query",
    });
  };

  const currentTimestamp = new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.04),transparent_48%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-panel-border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-slate-50 shadow-[0_20px_60px_rgba(15,23,42,0.28)] sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-100/90">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Usage Dashboard
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Database fleet telemetry and workload posture
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Start the studio on operational signal instead of placeholder
                  SQL. This view rolls up engine health, execution latency,
                  table pressure, and the next actions an operator would
                  actually take.
                </p>
              </div>
            </div>

            <div className="grid min-w-[280px] gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Active target
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {activeConnection
                    ? `${activeConnection.name} · ${engineLabels[activeConnection.type]}`
                    : "No live engine selected"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Snapshot refreshed
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {currentTimestamp}
                </div>
              </div>
              <button
                onClick={() =>
                  openOperationalTab(
                    "performance_review.sql",
                    operationalQueries.performance,
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300"
              >
                <PlayCircle className="h-4 w-4" />
                Open Performance Review
              </button>
              <button
                onClick={openAiSidebar}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <Sparkles className="h-4 w-4" />
                Ask AI For Tuning
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Engines online",
              value: `${connections.filter((connection) => connection.status === "connected").length}/${Math.max(connections.length, 1)}`,
              detail: connections.length
                ? "connected profiles"
                : "add your first profile",
              icon: Database,
            },
            {
              label: "Queries today",
              value: formatCompact(queriesToday),
              detail: `${successRate}% success rate`,
              icon: Activity,
            },
            {
              label: "p95 latency",
              value: formatRuntime(p95Latency),
              detail: "across recent interactive runs",
              icon: Clock3,
            },
            {
              label: "Tracked storage",
              value: `${storageFootprintGb} GB`,
              detail: `${formatCompact(totalRowsTracked)} rows in focus`,
              icon: HardDrive,
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded-2xl border border-panel-border bg-card/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] uppercase tracking-[0.18em]">
                  {metric.label}
                </span>
                <metric.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 text-2xl font-semibold text-foreground">
                {metric.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {metric.detail}
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <article className="rounded-2xl border border-panel-border bg-card/80 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Query Load Window
                </div>
                <h2 className="mt-1 text-base font-semibold text-foreground">
                  Throughput and latency over the active reporting window
                </h2>
              </div>
              <button
                onClick={() =>
                  openOperationalTab(
                    "capacity_hotspots.sql",
                    operationalQueries.capacity,
                  )
                }
                className="inline-flex items-center gap-2 rounded-xl border border-panel-border bg-background px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                <TrendingUp className="h-4 w-4 text-primary" />
                Inspect Capacity
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-8">
              {loadSeries.map((point) => (
                <div key={point.label} className="flex flex-col gap-2">
                  <div className="flex h-36 items-end justify-center rounded-2xl bg-muted/40 px-3 py-3">
                    <div
                      className="w-full rounded-xl bg-gradient-to-t from-sky-600 via-cyan-500 to-emerald-400 shadow-[0_10px_20px_rgba(14,165,233,0.28)]"
                      style={{
                        height: `${Math.max(18, (point.value / maxLoad) * 100)}%`,
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {point.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {point.value} runs · {formatRuntime(point.latency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-panel-border bg-card/80 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Engine Roster
            </div>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              Live connection posture by engine
            </h2>

            <div className="mt-4 space-y-3">
              {engineCards.map((connection) => (
                <button
                  key={connection.id}
                  onClick={() => setActiveConnection(connection.id)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    activeConnection?.id === connection.id
                      ? "border-primary/50 bg-primary/8"
                      : "border-panel-border bg-background hover:border-primary/35",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {connection.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {connection.label} · {connection.database}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium",
                        connection.status === "connected"
                          ? "bg-emerald-500/12 text-emerald-600"
                          : "bg-amber-500/12 text-amber-600",
                      )}
                    >
                      {connection.status}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Operator load</span>
                      <span>{connection.workloadScore}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
                        style={{ width: `${connection.workloadScore}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {connection.recentRuns} recent executions tracked
                  </div>
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-panel-border bg-card/80 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Hottest Relations
                </div>
                <h2 className="mt-1 text-base font-semibold text-foreground">
                  Tables consuming the most attention
                </h2>
              </div>
              <TableProperties className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-4 space-y-3">
              {hottestTables.map((table) => (
                <div
                  key={`${table.schema}.${table.name}`}
                  className="rounded-2xl border border-panel-border bg-background px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {table.schema}.{table.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {table.columns.length} columns tracked
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {formatCompact(table.rowCount)} rows
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600"
                      style={{
                        width: `${Math.max(14, (table.rowCount / maxRows) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-panel-border bg-card/80 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Recent Activity
                </div>
                <h2 className="mt-1 text-base font-semibold text-foreground">
                  Operational events worth checking
                </h2>
              </div>
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-4 space-y-3">
              {activityFeed.map((item) => (
                <div
                  key={`${item.title}-${item.time}`}
                  className="rounded-2xl border border-panel-border bg-background px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {item.title}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
                        item.status === "healthy"
                          ? "bg-emerald-500"
                          : item.status === "attention"
                            ? "bg-amber-500"
                            : "bg-sky-500",
                      )}
                    />
                  </div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {item.time}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-panel-border bg-card/80 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Action Queue
                </div>
                <h2 className="mt-1 text-base font-semibold text-foreground">
                  What an operator should do next
                </h2>
              </div>
              <Bot className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-4 space-y-3">
              <button
                onClick={() =>
                  openOperationalTab(
                    "performance_review.sql",
                    operationalQueries.performance,
                  )
                }
                className="w-full rounded-2xl border border-panel-border bg-background px-4 py-3 text-left transition hover:border-primary/35"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <PlayCircle className="h-4 w-4 text-primary" />
                  Run performance review
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Open a real workload review query against the active
                  connection.
                </div>
              </button>

              <button
                onClick={openSchemaTab}
                className="w-full rounded-2xl border border-panel-border bg-background px-4 py-3 text-left transition hover:border-primary/35"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Database className="h-4 w-4 text-primary" />
                  Inspect schema pressure
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Move from fleet telemetry into the schema explorer for the
                  active engine.
                </div>
              </button>

              <button
                onClick={openAiSidebar}
                className="w-full rounded-2xl border border-panel-border bg-background px-4 py-3 text-left transition hover:border-primary/35"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Ask for a tuning plan
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Use the AI sidebar with the current fleet context and active
                  target already in focus.
                </div>
              </button>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
