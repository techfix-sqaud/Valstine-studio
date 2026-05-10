import {
  Activity,
  Bot,
  Database,
  LayoutDashboard,
  NotebookTabs,
  PlayCircle,
  Sparkles,
  Waypoints,
} from "lucide-react";
import type { DBConnection } from "@/lib/mock-data";
import { platformBadges } from "./analyst-os-data";

type DashboardProps = {
  activityMessage: string;
  aiStatusLabel: string;
  connectedLabel: string;
  connections: DBConnection[];
  logEntries: string[];
  onConnectDatabase: () => void;
  onCreateNotebook: () => void;
  onCreateQuery: () => void;
  queryRuntimeMs: number;
  workspaceCount: number;
};

const workflowLanes = [
  {
    label: "Interactive SQL",
    detail: "Ad hoc diagnostics, explain plans, and tuning work",
    value: 78,
  },
  {
    label: "Notebook analysis",
    detail: "Reusable investigation flows across markdown and SQL cells",
    value: 64,
  },
  {
    label: "Visualization prep",
    detail: "Result shaping for executive and analyst-ready views",
    value: 57,
  },
  {
    label: "Migration runway",
    detail: "CSV staging, type inference, and promotion readiness",
    value: 43,
  },
];

export function ValstineUsageDashboard({
  activityMessage,
  aiStatusLabel,
  connectedLabel,
  connections,
  logEntries,
  onConnectDatabase,
  onCreateNotebook,
  onCreateQuery,
  queryRuntimeMs,
  workspaceCount,
}: DashboardProps) {
  const avgRuntime = queryRuntimeMs > 0 ? queryRuntimeMs : 44;
  const recentLogs = logEntries.slice(-5).reverse();
  const connectedEngines = connections.filter(
    (connection) => connection.status === "connected",
  );
  const connectionCards = connections.length
    ? connections
    : [
        {
          id: "warehouse-template",
          name: "Warehouse template",
          type: "pg" as const,
          host: "localhost",
          port: 5432,
          database: "analytics",
          status: "disconnected" as const,
        },
      ];

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(34,91,179,0.18),transparent_30%),radial-gradient(circle_at_85%_0%,rgba(125,163,231,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_52%)] p-4 sm:p-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="overflow-hidden rounded-3xl border border-[color:var(--analyst-border)] bg-[linear-gradient(135deg,#173e7c,#245db7_56%,#5f8fe3)] px-5 py-5 text-white shadow-[0_24px_60px_rgba(22,63,128,0.34)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-50/95">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Studio OS Usage
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Analyst command center for execution, notebooks, and migrations
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Open the operating system on a real work queue: connection
                posture, workflow mix, active runtime health, and the next
                launches your team actually needs.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                {platformBadges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid min-w-[280px] gap-3 rounded-2xl border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] p-4 backdrop-blur sm:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Active posture
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {connectedLabel}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  AI lane
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {aiStatusLabel}
                </div>
              </div>
              <button
                onClick={onCreateQuery}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--analyst-accent)] px-3 py-2 text-sm font-medium text-slate-950 transition hover:brightness-110"
              >
                <PlayCircle className="h-4 w-4" />
                Launch Query
              </button>
              <button
                onClick={onCreateNotebook}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
              >
                <NotebookTabs className="h-4 w-4" />
                Launch Notebook
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Connected engines",
              value: `${connectedEngines.length}/${Math.max(connectionCards.length, 1)}`,
              detail: "ready for execution",
              icon: Database,
            },
            {
              label: "Open workspaces",
              value: String(workspaceCount),
              detail: "tabs and notebooks under management",
              icon: Activity,
            },
            {
              label: "Average live runtime",
              value: `${avgRuntime} ms`,
              detail: "current interactive baseline",
              icon: PlayCircle,
            },
            {
              label: "Migration readiness",
              value: "83%",
              detail: "CSV staging and schema checks green",
              icon: Waypoints,
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-panel)] p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
            >
              <div className="flex items-center justify-between text-[color:var(--analyst-muted)]">
                <span className="text-[11px] uppercase tracking-[0.18em]">
                  {metric.label}
                </span>
                <metric.icon className="h-4 w-4 text-[color:var(--analyst-accent)]" />
              </div>
              <div className="mt-3 text-2xl font-semibold text-[color:var(--analyst-text)]">
                {metric.value}
              </div>
              <div className="mt-1 text-sm text-[color:var(--analyst-muted)]">
                {metric.detail}
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <article className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-panel)] p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--analyst-muted)]">
                  Workflow Mix
                </div>
                <h3 className="mt-1 text-base font-semibold text-[color:var(--analyst-text)]">
                  Where operators are spending time inside Studio OS
                </h3>
              </div>
              <Sparkles className="h-4 w-4 text-[color:var(--analyst-accent)]" />
            </div>

            <div className="mt-4 space-y-4">
              {workflowLanes.map((lane) => (
                <div
                  key={lane.label}
                  className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-editor)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--analyst-text)]">
                        {lane.label}
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--analyst-muted)]">
                        {lane.detail}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-[color:var(--analyst-text)]">
                      {lane.value}%
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--analyst-subtle)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--analyst-accent),#4ade80)]"
                      style={{ width: `${lane.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-panel)] p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--analyst-muted)]">
                  Runtime Signal
                </div>
                <h3 className="mt-1 text-base font-semibold text-[color:var(--analyst-text)]">
                  Current operator guidance
                </h3>
              </div>
              <Bot className="h-4 w-4 text-[color:var(--analyst-accent)]" />
            </div>

            <div className="mt-4 rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-editor)] px-4 py-4">
              <div className="text-sm font-medium text-[color:var(--analyst-text)]">
                {activityMessage}
              </div>
              <div className="mt-3 text-sm text-[color:var(--analyst-muted)]">
                AI lane: {aiStatusLabel}
              </div>
              <button
                onClick={onConnectDatabase}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[color:var(--analyst-accent-border)] bg-[color:var(--analyst-accent-soft)] px-3 py-2 text-sm font-medium text-[color:var(--analyst-accent)] transition hover:brightness-95"
              >
                <Database className="h-4 w-4" />
                Connect Database
              </button>
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-panel)] p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)] xl:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--analyst-muted)]">
                  Engine Readiness
                </div>
                <h3 className="mt-1 text-base font-semibold text-[color:var(--analyst-text)]">
                  Saved connections and launch posture
                </h3>
              </div>
              <Activity className="h-4 w-4 text-[color:var(--analyst-accent)]" />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {connectionCards.map((connection, index) => {
                const health =
                  connection.status === "connected" ? 78 - index * 6 : 34;
                return (
                  <div
                    key={connection.id}
                    className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-editor)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[color:var(--analyst-text)]">
                          {connection.name}
                        </div>
                        <div className="mt-1 text-sm text-[color:var(--analyst-muted)]">
                          {connection.type.toUpperCase()} ·{" "}
                          {connection.database}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          connection.status === "connected"
                            ? "bg-emerald-500/12 text-emerald-500"
                            : "bg-amber-500/12 text-amber-500"
                        }`}
                      >
                        {connection.status}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--analyst-subtle)]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--analyst-accent),#34d399)]"
                        style={{ width: `${health}%` }}
                      />
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--analyst-muted)]">
                      workload readiness {health}%
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-panel)] p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--analyst-muted)]">
                  Ops Feed
                </div>
                <h3 className="mt-1 text-base font-semibold text-[color:var(--analyst-text)]">
                  Latest workbench events
                </h3>
              </div>
              <Sparkles className="h-4 w-4 text-[color:var(--analyst-accent)]" />
            </div>

            <div className="mt-4 space-y-3">
              {recentLogs.map((entry) => (
                <div
                  key={entry}
                  className="rounded-2xl border border-[color:var(--analyst-border)] bg-[color:var(--analyst-editor)] px-4 py-3 text-sm text-[color:var(--analyst-muted)]"
                >
                  {entry}
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
