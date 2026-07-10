import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  Table,
  AlertTriangle,
  Download,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Terminal,
  Search,
  X,
  BarChart2,
  Braces,
  Edit3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@valstine/ui/lib/utils";
import { useAppStore } from "@valstine/core/store/app-store";
import { QueryHistory } from "./QueryHistory";
import { showContextMenu } from "./ContextMenu";
import TerminalComponent from "./Terminal";
import { EditableResultGrid } from "./EditableResultGrid";

// ── Column stats helper ────────────────────────────────────────────────────────
function computeColumnStats(rows: Record<string, unknown>[], col: string) {
  const values = rows.map((r) => r[col]);
  const nullCount = values.filter((v) => v === null || v === undefined).length;
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const distinctCount = new Set(nonNull.map((v) => String(v))).size;
  const numbers = nonNull.map((v) => parseFloat(String(v))).filter((n) => !isNaN(n));
  const isNumeric = numbers.length === nonNull.length && nonNull.length > 0;
  return { total: values.length, nullCount, distinctCount, isNumeric, numbers };
}

// ── JSON cell detector ────────────────────────────────────────────────────────
function tryParseJson(val: unknown): object | null {
  if (val === null || val === undefined) return null;
  // Date objects must not be treated as JSON — they come through Electron IPC
  // as real Date instances (structured clone) but web serializes them to strings.
  if (val instanceof Date) return null;
  if (typeof val === "object" && !Array.isArray(val)) return val as object;
  // JSON arrays
  if (typeof val === "string" && val.startsWith("{")) {
    try { return JSON.parse(val); } catch { return null; }
  }
  if (typeof val === "string" && val.startsWith("[")) {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : null; } catch { return null; }
  }
  return null;
}

// ── pgvector / float-array detector ──────────────────────────────────────────
interface VectorInfo { dims: number; preview: string }
function tryParseVector(val: unknown): VectorInfo | null {
  if (val === null || val === undefined) return null;
  // PostgreSQL returns pgvector as a string like "[0.1,0.2,...]" or array
  let arr: number[] | null = null;
  if (typeof val === "string" && (val.startsWith("[") || val.startsWith("{"))) {
    try {
      const parsed = JSON.parse(val.replace(/\{/g, "[").replace(/\}/g, "]"));
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "number") arr = parsed;
    } catch { /* not a vector */ }
  }
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === "number") arr = val as number[];
  if (!arr || arr.length < 2) return null;
  const preview = arr.slice(0, 3).map(n => n.toFixed(4)).join(", ");
  return { dims: arr.length, preview };
}

// ── JSON tree viewer (simple recursive) ──────────────────────────────────────
function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const indent = depth * 12;

  if (data === null) return <span className="text-muted-foreground italic">null</span>;
  if (typeof data === "boolean") return <span className={data ? "text-success" : "text-destructive"}>{String(data)}</span>;
  if (typeof data === "number") return <span className="text-blue-400">{data}</span>;
  if (typeof data === "string") return <span className="text-yellow-300">"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <span>
        <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground text-[10px]">
          {expanded ? "▼" : "▶"} Array[{data.length}]
        </button>
        {expanded && (
          <div style={{ paddingLeft: indent + 12 }}>
            {data.map((item, i) => (
              <div key={i} className="text-[10px]">
                <span className="text-muted-foreground">{i}: </span>
                <JsonTree data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data as object);
    if (keys.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground text-[10px]">
          {expanded ? "▼" : "▶"} Object{"{"}…{"}"}
        </button>
        {expanded && (
          <div style={{ paddingLeft: indent + 12 }}>
            {keys.map(k => (
              <div key={k} className="text-[10px]">
                <span className="text-primary">"{k}"</span>
                <span className="text-muted-foreground">: </span>
                <JsonTree data={(data as any)[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span className="text-foreground">{String(data)}</span>;
}

// ── JSON cell popover ─────────────────────────────────────────────────────────
function JsonCellPopover({ data, onClose }: { data: object; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="rounded-lg border border-panel-border bg-panel-bg shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Braces className="w-3.5 h-3.5 text-primary" /> JSON Viewer
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
              className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-secondary transition-colors"
            >
              Copy
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3 font-mono text-[11px]">
          <JsonTree data={data} depth={0} />
        </div>
      </div>
    </div>
  );
}

// ── Chart tab ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#ec4899"];

function ChartPanel() {
  const queryResult = useAppStore(s => s.queryResult);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const { numericCols, categoricalCols } = useMemo(() => {
    if (!queryResult || queryResult.status !== "success") return { numericCols: [], categoricalCols: [] };
    const numeric: string[] = [];
    const categorical: string[] = [];
    for (const col of queryResult.columns) {
      const stats = computeColumnStats(queryResult.rows, col);
      if (stats.isNumeric) numeric.push(col);
      else categorical.push(col);
    }
    return { numericCols: numeric, categoricalCols: categorical };
  }, [queryResult]);

  const [xCol, setXCol] = useState<string>("");
  const [yCols, setYCols] = useState<string[]>([]);

  // Auto-select defaults when columns change
  useEffect(() => {
    if (categoricalCols.length > 0) setXCol(categoricalCols[0]);
    else if (numericCols.length > 0) setXCol(numericCols[0]);
    setYCols(numericCols.slice(0, 3));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoricalCols.join(","), numericCols.join(",")]);

  if (!queryResult || queryResult.status !== "success" || queryResult.rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        Run a query with numeric columns to see a chart
      </div>
    );
  }

  if (numericCols.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        No numeric columns detected in results
      </div>
    );
  }

  const chartData = queryResult.rows.slice(0, 200).map(row => {
    const point: Record<string, unknown> = { _x: String(row[xCol] ?? "") };
    for (const y of yCols) point[y] = Number(row[y] ?? 0);
    return point;
  });

  const toggleYCol = (col: string) =>
    setYCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);

  const ChartComponent = chartType === "bar" ? BarChart : LineChart;
  const DataComponent = chartType === "bar" ? Bar : Line;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-panel-border bg-panel-bg/50 shrink-0">
        {/* Chart type */}
        <div className="flex items-center gap-1 rounded border border-border overflow-hidden">
          {(["bar", "line"] as const).map(t => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={cn("px-2 py-0.5 text-[10px] capitalize transition-colors", chartType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t}
            </button>
          ))}
        </div>

        {/* X axis picker */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="shrink-0">X:</span>
          <select
            value={xCol}
            onChange={e => setXCol(e.target.value)}
            className="bg-secondary border border-border rounded px-1 py-0.5 text-[10px] text-foreground outline-none"
          >
            {queryResult.columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Y axis column toggles */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground shrink-0">Y:</span>
          {numericCols.map((col, i) => (
            <button
              key={col}
              onClick={() => toggleYCol(col)}
              style={yCols.includes(col) ? { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "33", color: CHART_COLORS[i % CHART_COLORS.length] } : {}}
              className={cn("px-1.5 py-0.5 rounded text-[10px] border transition-colors", yCols.includes(col) ? "border-current" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {col}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 p-2">
        {yCols.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs">Select at least one Y column</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="_x" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--panel-bg))", border: "1px solid hsl(var(--panel-border))", borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {yCols.map((col, i) =>
                chartType === "bar"
                  ? <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
                  : <Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Results table ─────────────────────────────────────────────────────────────
function ResultsTable() {
  const rawQueryResult = useAppStore((s) => s.queryResult);
  const multiQueryResults = useAppStore((s) => s.multiQueryResults);
  const activeMultiResultIndex = useAppStore((s) => s.activeMultiResultIndex);
  // When running all statements, show the active statement's result
  const queryResult = multiQueryResults
    ? (multiQueryResults[activeMultiResultIndex]?.result ?? rawQueryResult)
    : rawQueryResult;
  const isExecuting = useAppStore((s) => s.isExecuting);
  const dryRunExecuted = useAppStore((s) => s.dryRunExecuted);
  const [copied, setCopied] = useState(false);
  const [rowFilter, setRowFilter] = useState("");
  const [jsonPopover, setJsonPopover] = useState<object | null>(null);
  const [editGridMode, setEditGridMode] = useState(false);

  // Resizable columns
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const startResize = useCallback((e: React.MouseEvent, col: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th") as HTMLTableCellElement;
    const startW = th.getBoundingClientRect().width;
    resizingRef.current = { col, startX: e.clientX, startW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newW = Math.max(50, resizingRef.current.startW + delta);
      setColWidths((prev) => ({ ...prev, [resizingRef.current!.col]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const handleColumnContextMenu = useCallback(
    (e: React.MouseEvent, col: string) => {
      if (!queryResult || queryResult.status === "error") return;
      const stats = computeColumnStats(queryResult.rows, col);
      const items: Parameters<typeof showContextMenu>[1] = [
        { label: `Column: ${col}`, disabled: true },
        { separator: true, label: "sep-col" },
        { label: `Rows: ${stats.total}`, disabled: true },
        { label: `Nulls: ${stats.nullCount}  (${((stats.nullCount / stats.total) * 100).toFixed(1)}%)`, disabled: true },
        { label: `Distinct: ${stats.distinctCount}`, disabled: true },
        ...(stats.isNumeric
          ? [
              { separator: true, label: "sep-num" },
              { label: `Min: ${Math.min(...stats.numbers)}`, disabled: true },
              { label: `Max: ${Math.max(...stats.numbers)}`, disabled: true },
              { label: `Avg: ${(stats.numbers.reduce((a, b) => a + b, 0) / stats.numbers.length).toFixed(4)}`, disabled: true },
              { label: `Sum: ${stats.numbers.reduce((a, b) => a + b, 0)}`, disabled: true },
            ]
          : []),
        { separator: true, label: "sep-copy" },
        { label: "Copy Column Name", action: () => navigator.clipboard.writeText(col) },
        { label: "Copy All Values", action: () => navigator.clipboard.writeText(queryResult.rows.map((r) => String(r[col] ?? "")).join("\n")) },
      ];
      showContextMenu(e, items);
    },
    [queryResult],
  );

  const filteredRows = useMemo(() => {
    if (!queryResult || queryResult.status === "error") return [];
    const norm = rowFilter.trim().toLowerCase();
    if (!norm) return queryResult.rows;
    return queryResult.rows.filter((row) =>
      queryResult.columns.some((col) => String(row[col] ?? "").toLowerCase().includes(norm)),
    );
  }, [queryResult, rowFilter]);

  if (isExecuting) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs gap-2">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Executing query...
      </div>
    );
  }

  if (!queryResult) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        Run a query to see results
      </div>
    );
  }

  if (queryResult.status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
        <div className="flex items-center gap-2 text-destructive text-sm font-medium">
          <AlertTriangle className="w-4 h-4" />
          Query Error
        </div>
        <pre className="max-w-[90%] text-xs text-destructive/90 bg-destructive/10 border border-destructive/20 rounded-md p-3 whitespace-pre-wrap break-words font-mono">
          {queryResult.message ?? "Unknown error"}
        </pre>
        {queryResult.executionTime > 0 && (
          <span className="text-[11px] text-muted-foreground">Failed after {queryResult.executionTime}ms</span>
        )}
      </div>
    );
  }

  const handleCopy = () => {
    const csv = [
      queryResult.columns.join("\t"),
      ...queryResult.rows.map((r) => queryResult.columns.map((c) => String(r[c] ?? "")).join("\t")),
    ].join("\n");
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = (e: React.MouseEvent) => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    showContextMenu(e, [
      {
        label: "Export as CSV",
        action: () => {
          const escapeCsv = (v: unknown) => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const csv = [
            queryResult.columns.map(escapeCsv).join(","),
            ...queryResult.rows.map((r) => queryResult.columns.map((c) => escapeCsv(r[c])).join(",")),
          ].join("\r\n");
          downloadFile(csv, `results_${ts}.csv`, "text/csv");
        },
      },
      {
        label: "Export as JSON",
        action: () => downloadFile(JSON.stringify(queryResult.rows, null, 2), `results_${ts}.json`, "application/json"),
      },
      {
        label: "Export as TSV",
        action: () => {
          const tsv = [
            queryResult.columns.join("\t"),
            ...queryResult.rows.map((r) => queryResult.columns.map((c) => String(r[c] ?? "")).join("\t")),
          ].join("\r\n");
          downloadFile(tsv, `results_${ts}.tsv`, "text/tab-separated-values");
        },
      },
      {
        label: "Export as SQL INSERT",
        action: () => {
          const tableName = window.prompt("Table name for INSERT statements:", "table_name");
          if (!tableName) return;
          const cols = queryResult.columns.join(", ");
          const formatVal = (v: unknown): string => {
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "number") return String(v);
            if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
            return `'${String(v).replace(/'/g, "''")}'`;
          };
          const rowsSql = queryResult.rows.map((r) => `  (${queryResult.columns.map((c) => formatVal(r[c])).join(", ")})`).join(",\n");
          const sql = `INSERT INTO ${tableName} (${cols})\nVALUES\n${rowsSql};`;
          downloadFile(sql, `insert_${tableName}_${ts}.sql`, "text/plain");
        },
      },
    ]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Dry-run banner */}
      {dryRunExecuted && queryResult?.status === "success" && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 shrink-0">
          <span className="text-[10px] font-bold text-yellow-400 px-1.5 py-0.5 bg-yellow-500/20 rounded border border-yellow-500/30">DRY RUN</span>
          <span className="text-[11px] text-yellow-400">No changes were committed — query executed inside a rolled-back transaction.</span>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-panel-border bg-panel-bg/50 shrink-0">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
          <span className="text-success">
            {rowFilter ? `${filteredRows.length} / ${queryResult.rowCount}` : queryResult.rowCount} rows
          </span>
          <span>{queryResult.executionTime}ms</span>
        </div>
        <div className="flex-1 flex items-center gap-1.5 bg-secondary rounded px-2 py-0.5 min-w-0">
          <Search className="w-3 h-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={rowFilter}
            onChange={(e) => setRowFilter(e.target.value)}
            placeholder="Filter rows…"
            className="bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          {rowFilter && (
            <button onClick={() => setRowFilter("")} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditGridMode((v) => !v)}
            title={editGridMode ? "Exit edit mode" : "Edit results — double-click a cell to modify"}
            className={cn(
              "p-1 rounded transition-colors",
              editGridMode
                ? "bg-primary/15 text-primary"
                : "hover:bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleCopy} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Copy as TSV">
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleDownload} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Export results">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editable grid — swaps in when edit mode is active */}
      {editGridMode && (
        <EditableResultGrid
          columns={queryResult.columns}
          rows={filteredRows}
          onExitEdit={() => setEditGridMode(false)}
        />
      )}

      {/* Scrollable table — read-only view */}
      {!editGridMode && (<div className="flex-1 overflow-auto min-h-0">
        <table className="text-xs font-mono min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-panel-bg">
            <tr>
              <th className="px-3 py-1.5 text-left text-muted-foreground font-medium border-b border-r border-panel-border/70 w-10 min-w-[2.5rem]">#</th>
              {queryResult.columns.map((col) => (
                <th
                  key={col}
                  style={colWidths[col] ? { width: colWidths[col], minWidth: colWidths[col] } : { minWidth: 80 }}
                  className="relative px-3 py-1.5 text-left text-muted-foreground font-medium border-b border-r border-panel-border/70 last:border-r-0 whitespace-nowrap select-none"
                  onContextMenu={(e) => handleColumnContextMenu(e, col)}
                >
                  <span className="block truncate pr-2">{col}</span>
                  <div className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize hover:bg-primary/40 transition-colors z-20" onMouseDown={(e) => startResize(e, col)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr
                key={i}
                className="hover:bg-secondary/30 transition-colors"
                onContextMenu={(e) => {
                  const rowCsv = queryResult.columns.map((c) => String(row[c] ?? "")).join("\t");
                  showContextMenu(e, [
                    { label: "Copy Row", action: () => navigator.clipboard.writeText(rowCsv) },
                    { label: "Copy Row as JSON", action: () => { const obj: Record<string, unknown> = {}; queryResult.columns.forEach(c => { obj[c] = row[c]; }); navigator.clipboard.writeText(JSON.stringify(obj, null, 2)); } },
                    { label: "Copy Cell", action: () => { const cell = (e.target as HTMLElement).closest("td"); if (cell) navigator.clipboard.writeText(cell.textContent ?? ""); } },
                    { separator: true, label: "sep" },
                    { label: "Copy All Rows as CSV", action: () => { const csv = [queryResult.columns.join("\t"), ...queryResult.rows.map(r => queryResult.columns.map(c => String(r[c] ?? "")).join("\t"))].join("\n"); navigator.clipboard.writeText(csv); } },
                    { label: "Copy All as JSON", action: () => navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2)) },
                  ]);
                }}
              >
                <td className="px-3 py-1 text-muted-foreground border-b border-r border-panel-border/60 whitespace-nowrap">{i + 1}</td>
                {queryResult.columns.map((col) => {
                  const val = row[col];
                  const vector = tryParseVector(val);
                  const parsed = !vector ? tryParseJson(val) : null;
                  return (
                    <td
                      key={col}
                      style={colWidths[col] ? { width: colWidths[col], maxWidth: colWidths[col] } : {}}
                      className="px-3 py-1 text-foreground border-b border-r border-panel-border/60 last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      {val === null ? (
                        <span className="text-muted-foreground italic">NULL</span>
                      ) : vector ? (
                        <span className="flex items-center gap-1 text-[10px]" title={`${vector.dims}-dimensional vector`}>
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono border border-purple-500/30">
                            vec·{vector.dims}d
                          </span>
                          <span className="text-muted-foreground truncate max-w-[100px]">[{vector.preview}…]</span>
                        </span>
                      ) : parsed ? (
                        <button
                          onClick={() => setJsonPopover(parsed)}
                          className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                          title="Click to expand JSON"
                        >
                          <Braces className="w-3 h-3 shrink-0" />
                          <span className="text-muted-foreground text-[10px] truncate max-w-[120px]">
                            {Array.isArray(parsed) ? `Array[${(parsed as unknown[]).length}]` : `Object{${Object.keys(parsed).length}}`}
                          </span>
                        </button>
                      ) : val instanceof Date ? (
                        <span className="text-blue-300">{val.toISOString().replace("T", " ").replace(/\.000Z$/, " UTC")}</span>
                      ) : typeof val === "boolean" ? (
                        <span className={cn(val ? "text-success" : "text-destructive")}>{String(val)}</span>
                      ) : (
                        String(val)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {jsonPopover && !editGridMode && <JsonCellPopover data={jsonPopover} onClose={() => setJsonPopover(null)} />}
    </div>
  );
}

function TerminalPanel() {
  return <TerminalComponent />;
}

// ── Multi-query statement navigator ──────────────────────────────────────────
function MultiQueryNav() {
  const multiQueryResults = useAppStore((s) => s.multiQueryResults);
  const activeMultiResultIndex = useAppStore((s) => s.activeMultiResultIndex);
  const setActiveMultiResult = useAppStore((s) => s.setActiveMultiResult);

  if (!multiQueryResults || multiQueryResults.length <= 1) return null;

  const total = multiQueryResults.length;
  const current = activeMultiResultIndex;
  const active = multiQueryResults[current];

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-panel-border bg-secondary/20 shrink-0">
      <button
        onClick={() => setActiveMultiResult(Math.max(0, current - 1))}
        disabled={current === 0}
        className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors shrink-0"
        title="Previous statement"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
        {multiQueryResults.map((mr, i) => (
          <button
            key={i}
            onClick={() => setActiveMultiResult(i)}
            title={mr.sql}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono shrink-0 transition-colors border",
              i === current
                ? "bg-primary/15 border-primary/50 text-primary"
                : mr.result.status === "error"
                ? "bg-destructive/10 border-destructive/30 text-destructive/70 hover:text-destructive hover:bg-destructive/15"
                : "bg-secondary border-border/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {mr.result.status === "error" ? (
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            ) : (
              <Check className="w-2.5 h-2.5 shrink-0 text-success" />
            )}
            <span>#{i + 1}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => setActiveMultiResult(Math.min(total - 1, current + 1))}
        disabled={current === total - 1}
        className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors shrink-0"
        title="Next statement"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {active && (
        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[240px] ml-1 shrink" title={active.sql}>
          {active.sql}
        </span>
      )}

      <span className="text-[10px] text-muted-foreground shrink-0 ml-auto pl-2">
        {current + 1} / {total}
      </span>
    </div>
  );
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

export function ResultsPanel() {
  const { activeBottomTab, setActiveBottomTab, bottomPanelVisible, setBottomPanelVisible } = useAppStore();

  const tabs = [
    { id: "results" as const, label: "Results", icon: Table },
    { id: "chart" as const, label: "Chart", icon: BarChart2 },
    ...(isElectron ? [{ id: "terminal" as const, label: "Terminal", icon: Terminal }] : []),
    { id: "problems" as const, label: "Problems", icon: AlertTriangle },
    { id: "history" as const, label: "History", icon: Clock },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-panel-bg overflow-hidden">
      <div className="flex items-center border-t border-panel-border shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveBottomTab(tab.id as any)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-b-2",
                activeBottomTab === tab.id
                  ? "text-foreground border-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="ml-auto pr-2">
          <button
            onClick={() => setBottomPanelVisible(!bottomPanelVisible)}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            {bottomPanelVisible ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeBottomTab === "results" && (
          <>
            <MultiQueryNav />
            <ResultsTable />
          </>
        )}
        {(activeBottomTab as string) === "chart" && <ChartPanel />}
        {activeBottomTab === "terminal" && <TerminalPanel />}
        {activeBottomTab === "problems" && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">No problems detected</div>
        )}
        {activeBottomTab === "history" && <QueryHistory />}
      </div>
    </div>
  );
}
