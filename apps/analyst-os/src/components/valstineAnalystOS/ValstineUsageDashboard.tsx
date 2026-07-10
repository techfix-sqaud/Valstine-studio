import { useMemo, useState, type CSSProperties } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CheckCircle2,
  ChartColumnBig,
  Database,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  NotebookTabs,
  PlayCircle,
  Plus,
  Sparkles,
  TableProperties,
  Zap,
} from "lucide-react";
import type { DBConnection, QueryResult } from "@valstine/core/lib/mock-data";
import {
  excelTemplateLibrary,
  type AnalystActivityId,
} from "./analyst-os-data";

const retentionData = [
  { month: "Nov", retention: 100, learners: 782 },
  { month: "Dec", retention: 74.8, learners: 585 },
  { month: "Jan", retention: 63.4, learners: 496 },
  { month: "Feb", retention: 58.1, learners: 454 },
  { month: "Mar", retention: 54.7, learners: 428 },
];

const revenueData = [
  { region: "North", current: 413, prev: 388 },
  { region: "West", current: 396, prev: 371 },
  { region: "Central", current: 341, prev: 320 },
  { region: "South", current: 299, prev: 285 },
];

const runtimeTrend = [
  { q: "Q1", ms: 118 },
  { q: "Q2", ms: 89 },
  { q: "Q3", ms: 72 },
  { q: "Q4", ms: 58 },
  { q: "Q5", ms: 42 },
  { q: "Q6", ms: 31 },
];

const CHART_TYPES = [
  { id: "area", label: "Area" },
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "heatmap", label: "Heatmap" },
  { id: "kpi", label: "KPI Board" },
  { id: "map", label: "Geo Map" },
] as const;

type ChartTypeId = (typeof CHART_TYPES)[number]["id"];

const VIZ_ITEMS: { id: ChartTypeId; title: string; detail: string }[] = [
  {
    id: "area",
    title: "Area / Trend",
    detail: "Retention curves, usage over time, rolling averages",
  },
  {
    id: "bar",
    title: "Bar / Grouped",
    detail: "Regional revenue, ranked metrics, grouped comparisons",
  },
  {
    id: "line",
    title: "Line / Forecast",
    detail: "Query runtime, forecast bands, sparklines",
  },
  {
    id: "heatmap",
    title: "Heatmap",
    detail: "Cohort density, anomaly frequency, engagement grids",
  },
  {
    id: "map",
    title: "Geo Map",
    detail: "Territory overlays with metric shading and drill targets",
  },
  {
    id: "kpi",
    title: "KPI Board",
    detail: "Scoreboards with thresholds, deltas, status color rules",
  },
];

const LIVE_TABS = [
  { id: "retention" as const, label: "Retention" },
  { id: "revenue" as const, label: "Revenue" },
  { id: "runtime" as const, label: "Runtime" },
];

type LiveTabId = "retention" | "revenue" | "runtime";

const TOOLTIP_STYLE: CSSProperties = {
  background: "var(--analyst-tooltip)",
  border: "1px solid var(--analyst-border)",
  borderRadius: 10,
  fontSize: 12,
};

const HMAP_ROWS = 4;
const HMAP_COLS = 8;
const heatValues = Array.from({ length: HMAP_ROWS }, (_, rowIndex) =>
  Array.from({ length: HMAP_COLS }, (_, colIndex) =>
    Math.max(
      0.08,
      1 -
        (rowIndex + colIndex) * 0.075 +
        Math.sin(rowIndex * 1.3 + colIndex) * 0.18,
    ),
  ),
);

function MiniHeatmap() {
  return (
    <svg
      viewBox={`0 0 ${HMAP_COLS * 22} ${HMAP_ROWS * 22}`}
      className="w-full"
      style={{ maxHeight: 96 }}
    >
      {heatValues.map((row, rowIndex) =>
        row.map((value, colIndex) => (
          <rect
            key={`${rowIndex}-${colIndex}`}
            x={colIndex * 22 + 1}
            y={rowIndex * 22 + 1}
            width={20}
            height={20}
            rx={4}
            fill={`rgba(129,168,255,${value.toFixed(2)})`}
          />
        )),
      )}
    </svg>
  );
}

function MiniKpiBoard({
  runtime,
  workspaceCount,
  connections,
}: {
  runtime: number;
  workspaceCount: number;
  connections: DBConnection[];
}) {
  const liveConnections = connections.filter(
    (connection) => connection.status === "connected",
  ).length;
  const items = [
    { label: "Live engines", value: String(liveConnections) },
    { label: "Workspaces", value: String(workspaceCount) },
    { label: "Last runtime", value: `${runtime || 44}ms` },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 pt-1">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border p-3 text-center"
          style={{
            borderColor: "var(--analyst-border)",
            background: "var(--analyst-editor)",
          }}
        >
          <div
            className="text-lg font-semibold"
            style={{ color: "var(--analyst-text)" }}
          >
            {item.value}
          </div>
          <div
            className="mt-0.5 text-[10px] uppercase tracking-[0.14em]"
            style={{ color: "var(--analyst-muted)" }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

type DashboardProps = {
  activeActivity: AnalystActivityId;
  activityMessage: string;
  aiStatusLabel: string;
  connectedLabel: string;
  connections: DBConnection[];
  logEntries: string[];
  onConnectDatabase: () => void;
  onConnectToEngine: (id: string) => void;
  onCreateNotebook: () => void;
  onCreateQuery: () => void;
  onOpenBiStudio: () => void;
  onOpenTemplateLibrary: () => void;
  queryResult: QueryResult | null;
  queryRuntimeMs: number;
  workspaceCount: number;
};

type ChartPoint = Record<string, string | number>;

export function ValstineUsageDashboard({
  activeActivity,
  activityMessage,
  aiStatusLabel,
  connectedLabel,
  connections,
  logEntries,
  onConnectDatabase,
  onConnectToEngine,
  onCreateNotebook,
  onCreateQuery,
  onOpenBiStudio,
  onOpenTemplateLibrary,
  queryResult,
  queryRuntimeMs,
  workspaceCount,
}: DashboardProps) {
  const [liveTab, setLiveTab] = useState<LiveTabId>("retention");
  const [builderChartType, setBuilderChartType] = useState<ChartTypeId>("bar");
  const [builderAxis, setBuilderAxis] = useState({ x: "", y: "" });
  const [selectedViz, setSelectedViz] = useState<ChartTypeId>("area");

  const recentLogs = logEntries.slice(-4).reverse();
  const connectedEngines = connections.filter(
    (connection) => connection.status === "connected",
  );

  const availableColumns = useMemo(() => {
    if (
      queryResult &&
      queryResult.status === "success" &&
      queryResult.columns.length
    ) {
      return queryResult.columns;
    }
    return ["month", "retention_pct", "active_learners", "cohort_size"];
  }, [queryResult]);

  const liveResultData = useMemo<ChartPoint[] | null>(() => {
    if (
      !queryResult ||
      queryResult.status !== "success" ||
      !queryResult.rows.length
    ) {
      return null;
    }

    return queryResult.rows.slice(0, 8).map((row) => {
      const output: ChartPoint = {};

      for (const column of queryResult.columns) {
        const rawValue = row[column];
        const cleanedValue = String(rawValue ?? "").replace(/[$,%\s]/g, "");
        const numericValue = Number(cleanedValue);
        output[column] =
          Number.isFinite(numericValue) && cleanedValue !== ""
            ? numericValue
            : String(rawValue ?? "");
      }

      return output;
    });
  }, [queryResult]);

  const liveNumCol = useMemo(() => {
    if (!queryResult || queryResult.status !== "success") {
      return null;
    }

    return (
      queryResult.columns.find((column) =>
        queryResult.rows.some((row) => {
          const value = row[column];
          return Number.isFinite(
            Number(String(value ?? "").replace(/[$,%\s]/g, "")),
          );
        }),
      ) ?? null
    );
  }, [queryResult]);

  const liveLabelCol = useMemo(() => {
    if (!liveNumCol || !queryResult) {
      return null;
    }
    return queryResult.columns.find((column) => column !== liveNumCol) ?? null;
  }, [liveNumCol, queryResult]);

  const activityLabel = useMemo(() => {
    if (activeActivity === "viz") {
      return "BI studio focus";
    }
    if (activeActivity === "templates") {
      return "Excel kit focus";
    }
    if (activeActivity === "sql") {
      return "SQL workbench focus";
    }
    return "Analyst workspace";
  }, [activeActivity]);

  const renderLiveChart = () => {
    if (liveTab === "retention") {
      const data = liveResultData ?? retentionData;
      const xKey = liveResultData ? (liveLabelCol ?? "month") : "month";
      const yKey = liveResultData ? (liveNumCol ?? "retention") : "retention";

      return (
        <AreaChart data={data}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--analyst-accent)"
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor="var(--analyst-accent)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--analyst-border)" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "var(--analyst-muted)", fontSize: 11 }}
          />
          <YAxis tick={{ fill: "var(--analyst-muted)", fontSize: 11 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke="var(--analyst-accent)"
            fill="url(#areaGrad)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--analyst-accent)" }}
          />
        </AreaChart>
      );
    }

    if (liveTab === "revenue") {
      return (
        <BarChart data={revenueData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--analyst-border)" />
          <XAxis
            dataKey="region"
            tick={{ fill: "var(--analyst-muted)", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "var(--analyst-muted)", fontSize: 11 }}
            tickFormatter={(value) => `$${value}k`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [`$${value}k`, ""]}
          />
          <Bar
            dataKey="current"
            name="Apr"
            fill="var(--analyst-accent)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="prev"
            name="Mar"
            fill="rgba(129,168,255,0.38)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      );
    }

    return (
      <LineChart data={runtimeTrend}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--analyst-border)" />
        <XAxis
          dataKey="q"
          tick={{ fill: "var(--analyst-muted)", fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: "var(--analyst-muted)", fontSize: 11 }}
          unit="ms"
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number) => [`${value}ms`, "Runtime"]}
        />
        <Line
          type="monotone"
          dataKey="ms"
          stroke="#4ade80"
          strokeWidth={2}
          dot={{ r: 4, fill: "#4ade80" }}
        />
      </LineChart>
    );
  };

  const renderBuilderPreview = () => {
    if (builderChartType === "heatmap") {
      return (
        <div
          className="rounded-xl border p-3"
          style={{
            borderColor: "var(--analyst-accent-border)",
            background: "var(--analyst-editor)",
          }}
        >
          <div
            className="mb-2 text-[10px] uppercase tracking-[0.16em]"
            style={{ color: "var(--analyst-accent)" }}
          >
            Heatmap · density preview
          </div>
          <MiniHeatmap />
        </div>
      );
    }

    if (builderChartType === "kpi") {
      return (
        <div
          className="rounded-xl border p-3"
          style={{
            borderColor: "var(--analyst-accent-border)",
            background: "var(--analyst-editor)",
          }}
        >
          <div
            className="mb-2 text-[10px] uppercase tracking-[0.16em]"
            style={{ color: "var(--analyst-accent)" }}
          >
            KPI board · live snapshot
          </div>
          <MiniKpiBoard
            runtime={queryRuntimeMs}
            workspaceCount={workspaceCount}
            connections={connections}
          />
        </div>
      );
    }

    if (builderChartType === "map") {
      return (
        <div
          className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-sm"
          style={{
            borderColor: "var(--analyst-border)",
            color: "var(--analyst-muted)",
          }}
        >
          Assign a geographic dimension to render territory overlays
        </div>
      );
    }

    if (!builderAxis.x || !builderAxis.y) {
      return (
        <div
          className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-sm"
          style={{
            borderColor: "var(--analyst-border)",
            color: "var(--analyst-muted)",
          }}
        >
          Assign X and Y fields above to preview the chart
        </div>
      );
    }

    const previewData =
      builderChartType === "line"
        ? runtimeTrend
        : builderChartType === "area"
          ? retentionData
          : revenueData;
    const xKey =
      builderChartType === "line"
        ? "q"
        : builderChartType === "area"
          ? "month"
          : "region";
    const yKey =
      builderChartType === "line"
        ? "ms"
        : builderChartType === "area"
          ? "retention"
          : "current";

    return (
      <div
        className="h-36 rounded-xl border p-2"
        style={{
          borderColor: "var(--analyst-accent-border)",
          background: "var(--analyst-editor)",
        }}
      >
        <div
          className="mb-1 text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--analyst-accent)" }}
        >
          {builderChartType} · {builderAxis.x} vs {builderAxis.y}
        </div>
        <ResponsiveContainer width="100%" height="85%">
          {builderChartType === "area" ? (
            <AreaChart data={previewData}>
              <defs>
                <linearGradient id="builderGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--analyst-accent)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--analyst-accent)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey={xKey}
                tick={{ fill: "var(--analyst-muted)", fontSize: 9 }}
              />
              <YAxis tick={{ fill: "var(--analyst-muted)", fontSize: 9 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke="var(--analyst-accent)"
                fill="url(#builderGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          ) : builderChartType === "line" ? (
            <LineChart data={previewData}>
              <XAxis
                dataKey={xKey}
                tick={{ fill: "var(--analyst-muted)", fontSize: 9 }}
              />
              <YAxis tick={{ fill: "var(--analyst-muted)", fontSize: 9 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="var(--analyst-accent)"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          ) : (
            <BarChart data={previewData}>
              <XAxis
                dataKey={xKey}
                tick={{ fill: "var(--analyst-muted)", fontSize: 9 }}
              />
              <YAxis tick={{ fill: "var(--analyst-muted)", fontSize: 9 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar
                dataKey={yKey}
                fill="var(--analyst-accent)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  const renderVizPreview = () => {
    if (selectedViz === "heatmap") {
      return <MiniHeatmap />;
    }

    if (selectedViz === "kpi") {
      return (
        <MiniKpiBoard
          runtime={queryRuntimeMs}
          workspaceCount={workspaceCount}
          connections={connections}
        />
      );
    }

    if (selectedViz === "map") {
      return (
        <div
          className="flex h-28 items-center justify-center rounded-xl border-2 border-dashed text-sm"
          style={{
            borderColor: "var(--analyst-border)",
            color: "var(--analyst-muted)",
          }}
        >
          Geo Map — connect a GeoJSON source to render territory overlays
        </div>
      );
    }

    const previewData =
      selectedViz === "line"
        ? runtimeTrend
        : selectedViz === "bar"
          ? revenueData
          : retentionData;
    const xKey =
      selectedViz === "line" ? "q" : selectedViz === "bar" ? "region" : "month";
    const yKey =
      selectedViz === "line"
        ? "ms"
        : selectedViz === "bar"
          ? "current"
          : "retention";

    return (
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          {selectedViz === "area" ? (
            <AreaChart data={previewData}>
              <defs>
                <linearGradient id="vizGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--analyst-accent)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--analyst-accent)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey={xKey}
                tick={{ fill: "var(--analyst-muted)", fontSize: 9 }}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke="var(--analyst-accent)"
                fill="url(#vizGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          ) : selectedViz === "line" ? (
            <LineChart data={previewData}>
              <XAxis
                dataKey={xKey}
                tick={{ fill: "var(--analyst-muted)", fontSize: 9 }}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="var(--analyst-accent)"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          ) : (
            <BarChart data={previewData}>
              <XAxis
                dataKey={xKey}
                tick={{ fill: "var(--analyst-muted)", fontSize: 9 }}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar
                dataKey={yKey}
                fill="var(--analyst-accent)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div
      className="h-full overflow-auto p-4 sm:p-5"
      style={{ background: "var(--analyst-bg)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section
          className="overflow-hidden rounded-3xl px-6 py-5 text-white shadow-[0_24px_60px_rgba(22,63,128,0.34)]"
          style={{
            background: "linear-gradient(135deg,#173e7c,#245db7 56%,#5f8fe3)",
          }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-sky-100/90">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Analyst OS · Data Engineer Hub
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                Databases · BI Boards · Notebooks · Excel Packs
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {connectedEngines.length
                  ? `${connectedEngines.length} engine${connectedEngines.length > 1 ? "s" : ""} live · ${connectedLabel}`
                  : "Connect a database engine to begin building"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-sky-100/85">
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                  {activityLabel}
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                  AI · {aiStatusLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onCreateQuery}
                className="inline-flex items-center gap-2 rounded-xl bg-white/18 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25"
              >
                <PlayCircle className="h-4 w-4" /> New Query
              </button>
              <button
                onClick={onCreateNotebook}
                className="inline-flex items-center gap-2 rounded-xl bg-white/18 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25"
              >
                <NotebookTabs className="h-4 w-4" /> New Notebook
              </button>
              <button
                onClick={onOpenBiStudio}
                className="inline-flex items-center gap-2 rounded-xl bg-white/18 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25"
              >
                <ChartColumnBig className="h-4 w-4" /> BI Studio
              </button>
              <button
                onClick={onConnectDatabase}
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/18"
              >
                <Database className="h-4 w-4" />
                {connections.length ? "Manage Connections" : "Connect Database"}
              </button>
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-200/90">
            {activityMessage}
          </div>
        </section>

        <section
          className="rounded-2xl border p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
          style={{
            borderColor: "var(--analyst-border)",
            background: "var(--analyst-panel)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div
                className="text-[11px] uppercase tracking-[0.18em]"
                style={{ color: "var(--analyst-muted)" }}
              >
                Live Analysis · Real-time data visualization
              </div>
              <h3
                className="mt-1 text-base font-semibold"
                style={{ color: "var(--analyst-text)" }}
              >
                {liveResultData && liveTab === "retention"
                  ? "Live query result"
                  : "Seeded demo — run a query to see live data"}
              </h3>
            </div>
            <div
              className="flex items-center gap-1 rounded-xl border p-1"
              style={{
                borderColor: "var(--analyst-border)",
                background: "var(--analyst-editor)",
              }}
            >
              {LIVE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setLiveTab(tab.id)}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium capitalize transition"
                  style={{
                    background:
                      liveTab === tab.id
                        ? "var(--analyst-accent-soft)"
                        : "transparent",
                    color:
                      liveTab === tab.id
                        ? "var(--analyst-accent)"
                        : "var(--analyst-muted)",
                    border:
                      liveTab === tab.id
                        ? "1px solid var(--analyst-accent-border)"
                        : "1px solid transparent",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              {renderLiveChart()}
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
          <article
            className="rounded-2xl border p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
            style={{
              borderColor: "var(--analyst-border)",
              background: "var(--analyst-panel)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: "var(--analyst-muted)" }}
                >
                  Data Fabric
                </div>
                <h3
                  className="mt-1 text-base font-semibold"
                  style={{ color: "var(--analyst-text)" }}
                >
                  Databases, warehouses, and spreadsheet feeds
                </h3>
              </div>
              <Database
                className="h-4 w-4"
                style={{ color: "var(--analyst-accent)" }}
              />
            </div>

            {connections.length === 0 ? (
              <div
                className="mt-4 rounded-2xl border-2 border-dashed p-6 text-center"
                style={{ borderColor: "var(--analyst-accent-border)" }}
              >
                <Database
                  className="mx-auto mb-3 h-8 w-8"
                  style={{ color: "var(--analyst-muted)" }}
                />
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--analyst-text)" }}
                >
                  No engines connected
                </div>
                <div
                  className="mt-1 text-sm"
                  style={{ color: "var(--analyst-muted)" }}
                >
                  Connect PostgreSQL, MySQL, SQLite, or a warehouse
                </div>
                <button
                  onClick={onConnectDatabase}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition"
                  style={{
                    borderColor: "var(--analyst-accent-border)",
                    background: "var(--analyst-accent-soft)",
                    color: "var(--analyst-accent)",
                  }}
                >
                  <Plus className="h-4 w-4" /> Add Connection
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {connections.map((connection, index) => {
                  const isLive = connection.status === "connected";
                  const latency = isLive ? [12, 24, 31, 19][index % 4] : null;

                  return (
                    <div
                      key={connection.id}
                      className="flex items-center justify-between rounded-xl border px-4 py-3"
                      style={{
                        borderColor: "var(--analyst-border)",
                        background: "var(--analyst-editor)",
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            isLive ? "bg-emerald-400" : "bg-amber-400"
                          }`}
                        />
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium"
                            style={{ color: "var(--analyst-text)" }}
                          >
                            {connection.name}
                          </div>
                          <div
                            className="text-[11px] uppercase tracking-[0.12em]"
                            style={{ color: "var(--analyst-muted)" }}
                          >
                            {connection.type.toUpperCase()} ·{" "}
                            {connection.database}
                            {latency ? ` · ${latency}ms` : ""}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => onConnectToEngine(connection.id)}
                        className="ml-3 shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition"
                        style={{
                          borderColor: isLive
                            ? "rgba(74,222,128,0.3)"
                            : "var(--analyst-accent-border)",
                          background: isLive
                            ? "rgba(74,222,128,0.1)"
                            : "var(--analyst-accent-soft)",
                          color: isLive ? "#4ade80" : "var(--analyst-accent)",
                        }}
                      >
                        {isLive ? "Live" : "Connect"}
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={onConnectDatabase}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm transition"
                  style={{
                    borderColor: "var(--analyst-border)",
                    color: "var(--analyst-muted)",
                  }}
                >
                  <Plus className="h-4 w-4" /> Add Engine
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "PostgreSQL", detail: "Warehouse" },
                { label: "MySQL", detail: "OLTP" },
                { label: "Spreadsheets", detail: "CSV · Excel" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border px-3 py-2 text-center"
                  style={{
                    borderColor: "var(--analyst-border)",
                    background: "var(--analyst-subtle)",
                  }}
                >
                  <div
                    className="text-[12px] font-medium"
                    style={{ color: "var(--analyst-text)" }}
                  >
                    {item.label}
                  </div>
                  <div
                    className="mt-0.5 text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: "var(--analyst-muted)" }}
                  >
                    {item.detail}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article
            className="rounded-2xl border p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
            style={{
              borderColor: "var(--analyst-border)",
              background: "var(--analyst-panel)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: "var(--analyst-muted)" }}
                >
                  Query Results
                </div>
                <h3
                  className="mt-1 text-base font-semibold"
                  style={{ color: "var(--analyst-text)" }}
                >
                  {queryResult && queryResult.status === "success"
                    ? `${queryResult.rowCount} rows · ${queryResult.columns.length} cols · ${queryResult.executionTime}ms`
                    : "Run a query to see live results here"}
                </h3>
              </div>
              <Activity
                className="h-4 w-4"
                style={{ color: "var(--analyst-accent)" }}
              />
            </div>

            <div className="mt-4">
              {queryResult &&
              queryResult.status === "success" &&
              queryResult.rows.length > 0 ? (
                <div
                  className="overflow-auto rounded-xl border"
                  style={{ borderColor: "var(--analyst-border)" }}
                >
                  <table className="w-full border-separate border-spacing-0 text-left text-[12px]">
                    <thead>
                      <tr>
                        {queryResult.columns.map((column) => (
                          <th
                            key={column}
                            className="border-b px-3 py-2 font-medium"
                            style={{
                              borderColor: "var(--analyst-border)",
                              color: "var(--analyst-muted)",
                              background: "var(--analyst-editor)",
                            }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.slice(0, 6).map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          style={{
                            background:
                              rowIndex % 2 === 0
                                ? "transparent"
                                : "var(--analyst-subtle)",
                          }}
                        >
                          {queryResult.columns.map((column) => (
                            <td
                              key={column}
                              className="border-b px-3 py-2 font-mono"
                              style={{
                                borderColor: "var(--analyst-border)",
                                color: "var(--analyst-text)",
                              }}
                            >
                              {String(row[column] ?? "NULL")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {queryResult.rowCount > 6 && (
                    <div
                      className="px-4 py-2 text-[11px]"
                      style={{ color: "var(--analyst-muted)" }}
                    >
                      +{queryResult.rowCount - 6} more rows ·{" "}
                      {queryResult.executionTime}ms
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="flex h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center"
                  style={{ borderColor: "var(--analyst-border)" }}
                >
                  <PlayCircle
                    className="mb-2 h-8 w-8"
                    style={{ color: "var(--analyst-muted)" }}
                  />
                  <div
                    className="text-sm"
                    style={{ color: "var(--analyst-muted)" }}
                  >
                    No live results yet
                  </div>
                  <button
                    onClick={onCreateQuery}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition"
                    style={{
                      borderColor: "var(--analyst-accent-border)",
                      background: "var(--analyst-accent-soft)",
                      color: "var(--analyst-accent)",
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Open Query Editor
                  </button>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <article
            className="rounded-2xl border p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
            style={{
              borderColor: "var(--analyst-border)",
              background: "var(--analyst-panel)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: "var(--analyst-muted)" }}
                >
                  Dashboard Builder · No-code
                </div>
                <h3
                  className="mt-1 text-base font-semibold"
                  style={{ color: "var(--analyst-text)" }}
                >
                  Pick a chart type, assign fields, publish a shareable board
                </h3>
              </div>
              <ChartColumnBig
                className="h-4 w-4"
                style={{ color: "var(--analyst-accent)" }}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {CHART_TYPES.map((chartType) => (
                <button
                  key={chartType.id}
                  onClick={() => setBuilderChartType(chartType.id)}
                  className="rounded-lg border px-3 py-2 text-[12px] font-medium transition"
                  style={{
                    borderColor:
                      builderChartType === chartType.id
                        ? "var(--analyst-accent-border)"
                        : "var(--analyst-border)",
                    background:
                      builderChartType === chartType.id
                        ? "var(--analyst-accent-soft)"
                        : "var(--analyst-editor)",
                    color:
                      builderChartType === chartType.id
                        ? "var(--analyst-accent)"
                        : "var(--analyst-muted)",
                  }}
                >
                  {chartType.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["x", "y"] as const).map((axis) => (
                <div
                  key={axis}
                  className="rounded-xl border-2 border-dashed p-3"
                  style={{
                    borderColor: "var(--analyst-accent-border)",
                    background: "var(--analyst-subtle)",
                  }}
                >
                  <div
                    className="mb-2 text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: "var(--analyst-accent)" }}
                  >
                    {axis === "x" ? "X Axis · Dimension" : "Y Axis · Measure"}
                  </div>
                  {builderAxis[axis] ? (
                    <div
                      className="flex items-center justify-between rounded-lg border px-2 py-1.5 text-[12px]"
                      style={{
                        borderColor: "var(--analyst-accent-border)",
                        background: "var(--analyst-accent-soft)",
                        color: "var(--analyst-accent)",
                      }}
                    >
                      {builderAxis[axis]}
                      <button
                        onClick={() =>
                          setBuilderAxis((currentAxis) => ({
                            ...currentAxis,
                            [axis]: "",
                          }))
                        }
                        className="ml-2 opacity-60 hover:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      className="py-1 text-center text-[12px]"
                      style={{ color: "var(--analyst-muted)" }}
                    >
                      Click a field below →
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3">
              <div
                className="mb-2 text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--analyst-muted)" }}
              >
                Available fields
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableColumns.map((column) => (
                  <button
                    key={column}
                    onClick={() =>
                      setBuilderAxis((currentAxis) =>
                        !currentAxis.x
                          ? { ...currentAxis, x: column }
                          : !currentAxis.y
                            ? { ...currentAxis, y: column }
                            : { x: column, y: currentAxis.y },
                      )
                    }
                    className="rounded-lg border px-2.5 py-1.5 text-[12px] transition hover:border-[color:var(--analyst-accent-border)]"
                    style={{
                      borderColor: "var(--analyst-border)",
                      background: "var(--analyst-editor)",
                      color: "var(--analyst-text)",
                    }}
                  >
                    {column}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">{renderBuilderPreview()}</div>

            <button
              onClick={onOpenBiStudio}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition"
              style={{
                borderColor: "var(--analyst-accent-border)",
                background: "var(--analyst-accent-soft)",
                color: "var(--analyst-accent)",
              }}
            >
              <ChartColumnBig className="h-4 w-4" /> Open Full Builder
            </button>
          </article>

          <article
            className="rounded-2xl border p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
            style={{
              borderColor: "var(--analyst-border)",
              background: "var(--analyst-panel)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: "var(--analyst-muted)" }}
                >
                  Visualization Library
                </div>
                <h3
                  className="mt-1 text-base font-semibold"
                  style={{ color: "var(--analyst-text)" }}
                >
                  Maps, heatmaps, trend lines, KPI boards
                </h3>
              </div>
              <Sparkles
                className="h-4 w-4"
                style={{ color: "var(--analyst-accent)" }}
              />
            </div>

            <div className="mt-4 space-y-1.5">
              {VIZ_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedViz(item.id);
                    setBuilderChartType(item.id);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition"
                  style={{
                    borderColor:
                      selectedViz === item.id
                        ? "var(--analyst-accent-border)"
                        : "var(--analyst-border)",
                    background:
                      selectedViz === item.id
                        ? "var(--analyst-accent-soft)"
                        : "var(--analyst-editor)",
                  }}
                >
                  {selectedViz === item.id ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: "var(--analyst-accent)" }}
                    />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <div
                      className="text-sm font-medium"
                      style={{ color: "var(--analyst-text)" }}
                    >
                      {item.title}
                    </div>
                    <div
                      className="mt-0.5 text-[12px]"
                      style={{ color: "var(--analyst-muted)" }}
                    >
                      {item.detail}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div
              className="mt-4 rounded-2xl border p-3"
              style={{
                borderColor: "var(--analyst-accent-border)",
                background: "var(--analyst-editor)",
              }}
            >
              <div
                className="mb-2 text-[10px] uppercase tracking-[0.14em]"
                style={{ color: "var(--analyst-accent)" }}
              >
                Preview ·{" "}
                {VIZ_ITEMS.find((item) => item.id === selectedViz)?.title}
              </div>
              {renderVizPreview()}
            </div>
          </article>
        </section>

        <section
          className="rounded-2xl border p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
          style={{
            borderColor: "var(--analyst-border)",
            background: "var(--analyst-panel)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                className="text-[11px] uppercase tracking-[0.18em]"
                style={{ color: "var(--analyst-muted)" }}
              >
                Excel Template Library
              </div>
              <h3
                className="mt-1 text-base font-semibold"
                style={{ color: "var(--analyst-text)" }}
              >
                Governed workbook packs — wire results, export, hand off
              </h3>
            </div>
            <button
              onClick={onOpenTemplateLibrary}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition"
              style={{
                borderColor: "var(--analyst-accent-border)",
                background: "var(--analyst-accent-soft)",
                color: "var(--analyst-accent)",
              }}
            >
              <TableProperties className="h-4 w-4" /> Browse All
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {excelTemplateLibrary.map((template) => (
              <div
                key={template.title}
                className="rounded-2xl border p-4"
                style={{
                  borderColor: "var(--analyst-border)",
                  background: "var(--analyst-editor)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: "var(--analyst-accent-soft)",
                      color: "var(--analyst-accent)",
                    }}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-sm font-medium"
                      style={{ color: "var(--analyst-text)" }}
                    >
                      {template.title}
                    </div>
                    <div
                      className="mt-0.5 text-[11px] uppercase tracking-[0.14em]"
                      style={{ color: "var(--analyst-muted)" }}
                    >
                      {template.format}
                    </div>
                  </div>
                </div>
                <div
                  className="mt-3 text-sm"
                  style={{ color: "var(--analyst-muted)" }}
                >
                  {template.detail}
                </div>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition hover:brightness-95"
                  style={{
                    borderColor: "var(--analyst-border)",
                    background: "var(--analyst-subtle)",
                    color: "var(--analyst-text)",
                  }}
                >
                  <Download className="h-4 w-4" /> Use Template
                </button>
              </div>
            ))}
          </div>
        </section>

        {recentLogs.length > 0 && (
          <section
            className="rounded-2xl border p-4 shadow-[0_12px_28px_rgba(8,20,39,0.08)]"
            style={{
              borderColor: "var(--analyst-border)",
              background: "var(--analyst-panel)",
            }}
          >
            <div className="flex items-center justify-between">
              <div
                className="text-[11px] uppercase tracking-[0.18em]"
                style={{ color: "var(--analyst-muted)" }}
              >
                Ops Feed · Latest workbench events
              </div>
              <Zap
                className="h-4 w-4"
                style={{ color: "var(--analyst-accent)" }}
              />
            </div>
            <div className="mt-3 space-y-2">
              {recentLogs.map((entry, index) => (
                <div
                  key={`log-${index}`}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                  style={{
                    background: "var(--analyst-editor)",
                    borderLeft: "2px solid var(--analyst-accent)",
                  }}
                >
                  <span
                    className="font-mono text-[12px]"
                    style={{ color: "var(--analyst-muted)" }}
                  >
                    {entry}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
