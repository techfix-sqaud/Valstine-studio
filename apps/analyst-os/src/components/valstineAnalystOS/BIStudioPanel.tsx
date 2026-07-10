import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Trash2, Zap } from "lucide-react";
import type { QueryResult } from "@valstine/core/lib/mock-data";

type ChartType = "bar" | "line" | "area" | "scatter" | "pie" | "heatmap" | "kpi";

interface ChartTile {
  id: string;
  title: string;
  type: ChartType;
  xField: string;
  yField: string;
  data: ChartPoint[];
}

type ChartPoint = Record<string, string | number>;

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "scatter", label: "Scatter" },
  { id: "pie", label: "Pie" },
  { id: "heatmap", label: "Heatmap" },
  { id: "kpi", label: "KPI Board" },
];

const PIE_COLORS = [
  "#81a8ff", "#4ade80", "#fb923c", "#f472b6",
  "#a78bfa", "#22d3ee", "#fbbf24", "#34d399",
];

const getNumVal = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const c = v.replace(/[$,% ]/g, "");
    const n = Number(c);
    return Number.isFinite(n) && c !== "" ? n : null;
  }
  return null;
};

export function BIStudioPanel({
  queryResult,
  isDark,
}: {
  queryResult: QueryResult | null;
  isDark: boolean;
}) {
  const [tiles, setTiles] = useState<ChartTile[]>([]);
  const [activeType, setActiveType] = useState<ChartType>("bar");
  const [xField, setXField] = useState("");
  const [yField, setYField] = useState("");
  const [chartTitle, setChartTitle] = useState("");

  const columns = queryResult?.columns ?? [];

  const numericCols = useMemo(
    () =>
      columns.filter((col) =>
        queryResult?.rows.some((row) => getNumVal(row[col]) !== null),
      ),
    [columns, queryResult],
  );

  useEffect(() => {
    if (!queryResult?.columns.length) return;
    const firstLabel =
      columns.find((c) => !numericCols.includes(c)) ?? columns[0] ?? "";
    const firstNum = numericCols[0] ?? columns[1] ?? "";
    setXField((prev) => prev || firstLabel);
    setYField((prev) => prev || firstNum);
    if (!chartTitle && firstLabel && firstNum) {
      setChartTitle(`${firstNum} by ${firstLabel}`);
    }
  }, [queryResult]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!queryResult || !xField || !yField) return [];
    return queryResult.rows.slice(0, 50).map((row) => ({
      [xField]: String(row[xField] ?? ""),
      [yField]: getNumVal(row[yField]) ?? 0,
    }));
  }, [queryResult, xField, yField]);

  const noData = !queryResult || queryResult.rows.length === 0;

  const accent = isDark ? "#81a8ff" : "#225bb3";
  const bd = isDark ? "rgba(129,168,255,0.18)" : "rgba(39,84,158,0.22)";
  const bg = isDark ? "#06101f" : "#d8e7ff";
  const bgEditor = isDark ? "#091527" : "#ffffff";
  const bgSubtle = isDark ? "rgba(129,168,255,0.08)" : "rgba(46,104,199,0.10)";
  const bgAccentSoft = isDark
    ? "rgba(129,168,255,0.14)"
    : "rgba(34,91,179,0.12)";
  const bdAccent = isDark
    ? "rgba(129,168,255,0.34)"
    : "rgba(34,91,179,0.30)";
  const text = isDark ? "#edf4ff" : "#0f2f5c";
  const muted = isDark ? "#a5bbd9" : "#3a6298";
  const tooltipStyle = {
    background: isDark ? "#10213b" : "#fff",
    border: `1px solid ${isDark ? "rgba(129,168,255,0.2)" : "rgba(34,91,179,0.2)"}`,
    borderRadius: 8,
    fontSize: 12,
  };
  const gridStroke = isDark
    ? "rgba(129,168,255,0.1)"
    : "rgba(34,91,179,0.1)";
  const tickStyle = { fill: muted, fontSize: 11 };

  const renderBuilderChart = (
    data: ChartPoint[],
    type: ChartType,
    xKey: string,
    yKey: string,
  ) => {
    if (type === "pie") {
      const pieData = data.map((d) => ({
        name: String(d[xKey]),
        value: Number(d[yKey]) || 0,
      }));
      return (
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="75%"
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      );
    }

    if (type === "scatter") {
      const scatterData = data.map((d) => ({
        x: getNumVal(d[xKey]) ?? 0,
        y: getNumVal(d[yKey]) ?? 0,
      }));
      return (
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis
            type="number"
            dataKey="x"
            name={xKey}
            tick={tickStyle}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yKey}
            tick={tickStyle}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Scatter data={scatterData} fill={accent} />
        </ScatterChart>
      );
    }

    if (type === "area") {
      return (
        <AreaChart data={data}>
          <defs>
            <linearGradient id="bi-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={accent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={xKey} tick={tickStyle} />
          <YAxis tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={accent}
            fill="url(#bi-area-grad)"
            strokeWidth={2}
            dot={{ r: 3, fill: accent }}
          />
        </AreaChart>
      );
    }

    if (type === "line") {
      return (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey={xKey} tick={tickStyle} />
          <YAxis tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={accent}
            strokeWidth={2}
            dot={{ r: 3, fill: accent }}
          />
        </LineChart>
      );
    }

    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey={xKey} tick={tickStyle} />
        <YAxis tick={tickStyle} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey={yKey} fill={accent} radius={[4, 4, 0, 0]} />
      </BarChart>
    );
  };

  const renderHeatmap = (
    data: ChartPoint[],
    xKey: string,
    yKey: string,
  ) => {
    const max = Math.max(...data.map((d) => Number(d[yKey]) || 0), 1);
    const cols = Math.min(data.length, 8);
    return (
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {data.slice(0, 32).map((d, i) => (
          <div
            key={i}
            className="flex aspect-square flex-col items-center justify-center rounded-md p-1"
            title={`${d[xKey]}: ${d[yKey]}`}
            style={{
              background: `rgba(129,168,255,${(0.08 + (Number(d[yKey]) / max) * 0.75).toFixed(2)})`,
            }}
          >
            <span
              className="truncate text-[9px]"
              style={{ color: text }}
            >
              {String(d[xKey]).slice(0, 4)}
            </span>
            <span
              className="text-[10px] font-semibold"
              style={{ color: accent }}
            >
              {Number(d[yKey]).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderKPI = (data: ChartPoint[], yKey: string) => {
    const values = data.map((d) => Number(d[yKey]) || 0);
    const total = values.reduce((a, b) => a + b, 0);
    const avg = values.length ? total / values.length : 0;
    const max = Math.max(...values, 0);
    const stats = [
      { label: "Total", value: total.toLocaleString() },
      { label: "Average", value: avg.toFixed(1) },
      { label: "Maximum", value: max.toLocaleString() },
      { label: "Records", value: String(values.length) },
    ];
    return (
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border p-4 text-center"
            style={{ borderColor: bdAccent, background: bgAccentSoft }}
          >
            <div
              className="text-2xl font-bold"
              style={{ color: text }}
            >
              {stat.value}
            </div>
            <div
              className="mt-1 text-[10px] uppercase tracking-[0.16em]"
              style={{ color: muted }}
            >
              {stat.label} · {yKey}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderChartSurface = (
    type: ChartType,
    data: ChartPoint[],
    xKey: string,
    yKey: string,
    tileMode = false,
  ) => {
    if (type === "heatmap") return renderHeatmap(data, xKey, yKey);
    if (type === "kpi") return renderKPI(data, yKey);
    return (
      <ResponsiveContainer width="100%" height={tileMode ? 130 : "100%"}>
        {renderBuilderChart(data, type, xKey, yKey)}
      </ResponsiveContainer>
    );
  };

  const addTile = () => {
    if (!xField || !yField || !chartData.length) return;
    setTiles((prev) => [
      ...prev,
      {
        id: `tile-${Date.now()}`,
        title: chartTitle || `${yField} by ${xField}`,
        type: activeType,
        xField,
        yField,
        data: chartData,
      },
    ]);
  };

  const assignField = (role: "x" | "y", field: string) => {
    if (role === "x") {
      setXField(field);
      setChartTitle(`${yField || "value"} by ${field}`);
    } else {
      setYField(field);
      setChartTitle(`${field} by ${xField || "label"}`);
    }
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: bg }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
        style={{ borderColor: bd, background: bgEditor }}
      >
        <div className="flex flex-wrap gap-1">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setActiveType(ct.id)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
              style={{
                background:
                  activeType === ct.id ? bgAccentSoft : "transparent",
                border: `1px solid ${activeType === ct.id ? bdAccent : "transparent"}`,
                color: activeType === ct.id ? accent : muted,
              }}
            >
              {ct.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[11px]" style={{ color: muted }}>
            {queryResult?.status === "success"
              ? `${queryResult.rowCount} rows · ${queryResult.columns.length} cols`
              : "Run a query to load data"}
          </span>
          <button
            onClick={addTile}
            disabled={!xField || !yField || noData}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderColor: bdAccent,
              background: bgAccentSoft,
              color: accent,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Pin to Board
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Field shelf */}
        <div
          className="flex w-44 shrink-0 flex-col overflow-hidden border-r"
          style={{ borderColor: bd, background: bgEditor }}
        >
          <div
            className="border-b px-3 py-2.5"
            style={{ borderColor: bd }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.2em]"
              style={{ color: muted }}
            >
              Field Shelf
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
            {noData ? (
              <div
                className="py-6 text-center text-[12px]"
                style={{ color: muted }}
              >
                Run a query to populate fields
              </div>
            ) : (
              columns.map((col) => {
                const isNum = numericCols.includes(col);
                const isX = xField === col;
                const isY = yField === col;
                return (
                  <div
                    key={col}
                    className="cursor-pointer rounded-lg border px-2.5 py-2 transition hover:opacity-80"
                    style={{
                      borderColor: isX
                        ? bdAccent
                        : isY
                          ? "rgba(74,222,128,0.4)"
                          : bd,
                      background: isX
                        ? bgAccentSoft
                        : isY
                          ? "rgba(74,222,128,0.12)"
                          : bgSubtle,
                    }}
                    onClick={() => {
                      if (!xField || isX) assignField("x", col);
                      else if (!yField || isY) assignField("y", col);
                      else if (isNum) assignField("y", col);
                      else assignField("x", col);
                    }}
                  >
                    <div
                      className="truncate text-[11px] font-medium"
                      style={{ color: text }}
                    >
                      {col}
                    </div>
                    <div
                      className="text-[10px] uppercase tracking-[0.12em]"
                      style={{
                        color: isX ? accent : isY ? "#4ade80" : muted,
                      }}
                    >
                      {isX
                        ? "X axis"
                        : isY
                          ? "Y axis"
                          : isNum
                            ? "measure"
                            : "dimension"}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Axis assignment wells */}
          <div
            className="space-y-2 border-t p-2.5"
            style={{ borderColor: bd }}
          >
            {(["x", "y"] as const).map((axis) => {
              const field = axis === "x" ? xField : yField;
              const axisColor = axis === "x" ? accent : "#4ade80";
              const axisBd =
                axis === "x" ? bdAccent : "rgba(74,222,128,0.4)";
              const axisBg =
                axis === "x" ? bgAccentSoft : "rgba(74,222,128,0.1)";
              return (
                <div
                  key={axis}
                  className="rounded-lg border px-2.5 py-2"
                  style={{
                    borderColor: field ? axisBd : bd,
                    background: field ? axisBg : bgSubtle,
                  }}
                >
                  <div
                    className="mb-1 text-[9px] uppercase tracking-[0.2em]"
                    style={{ color: axisColor }}
                  >
                    {axis.toUpperCase()} ·{" "}
                    {axis === "x" ? "Dimension" : "Measure"}
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="truncate text-[11px]"
                      style={{ color: text }}
                    >
                      {field || "Unassigned"}
                    </span>
                    {field && (
                      <button
                        onClick={() =>
                          axis === "x" ? setXField("") : setYField("")
                        }
                        className="ml-1 text-[13px] opacity-50 hover:opacity-100"
                        style={{ color: muted }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart canvas */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
          {noData ? (
            <div
              className="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed"
              style={{ borderColor: bd }}
            >
              <Zap
                className="mb-3 h-10 w-10"
                style={{ color: muted }}
              />
              <div
                className="text-base font-medium"
                style={{ color: text }}
              >
                No query data loaded
              </div>
              <div
                className="mt-1 text-sm"
                style={{ color: muted }}
              >
                Run a SQL query from the editor to populate the chart
                builder
              </div>
            </div>
          ) : !xField || !yField ? (
            <div
              className="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed"
              style={{ borderColor: bd }}
            >
              <div className="text-sm" style={{ color: muted }}>
                Click fields in the shelf on the left to assign X and Y
                axes
              </div>
            </div>
          ) : (
            <div
              className="flex h-full flex-col overflow-hidden rounded-2xl border"
              style={{ borderColor: bd, background: bgEditor }}
            >
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{ borderColor: bd }}
              >
                <input
                  value={chartTitle}
                  onChange={(e) => setChartTitle(e.target.value)}
                  className="bg-transparent text-sm font-medium outline-none"
                  style={{ color: text }}
                  placeholder="Chart title"
                />
                <span
                  className="shrink-0 text-[11px]"
                  style={{ color: muted }}
                >
                  {activeType} · {chartData.length} pts · {xField} ×{" "}
                  {yField}
                </span>
              </div>
              <div className="min-h-0 flex-1 p-4">
                {renderChartSurface(activeType, chartData, xField, yField)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard board */}
      {tiles.length > 0 && (
        <div
          className="overflow-auto border-t"
          style={{ borderColor: bd, maxHeight: "42%" }}
        >
          <div className="p-4">
            <div
              className="mb-3 text-[11px] uppercase tracking-[0.2em]"
              style={{ color: muted }}
            >
              Dashboard Board · {tiles.length} tile
              {tiles.length !== 1 ? "s" : ""}
            </div>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.min(tiles.length, 3)}, minmax(0, 1fr))`,
              }}
            >
              {tiles.map((tile) => (
                <div
                  key={tile.id}
                  className="rounded-xl border p-3"
                  style={{ borderColor: bd, background: bgEditor }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className="truncate text-[12px] font-medium"
                      style={{ color: text }}
                    >
                      {tile.title}
                    </span>
                    <button
                      onClick={() =>
                        setTiles((prev) =>
                          prev.filter((t) => t.id !== tile.id),
                        )
                      }
                      className="shrink-0 opacity-50 transition hover:opacity-100"
                      style={{ color: muted }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {renderChartSurface(
                    tile.type,
                    tile.data,
                    tile.xField,
                    tile.yField,
                    true,
                  )}
                  <div
                    className="mt-2 text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: muted }}
                  >
                    {tile.type} · {tile.xField} × {tile.yField}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
