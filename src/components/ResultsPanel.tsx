import { useState, useRef, useCallback } from "react";
import {
  Table,
  AlertTriangle,
  Download,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Clock,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { QueryHistory } from "./QueryHistory";
import { showContextMenu } from "./ContextMenu";
import TerminalComponent from "./Terminal";

function ResultsTable() {
  const queryResult = useAppStore((s) => s.queryResult);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const [copied, setCopied] = useState(false);

  // Resizable columns
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{
    col: string;
    startX: number;
    startW: number;
  } | null>(null);

  const startResize = useCallback((e: React.MouseEvent, col: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest(
      "th",
    ) as HTMLTableCellElement;
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
          <span className="text-[11px] text-muted-foreground">
            Failed after {queryResult.executionTime}ms
          </span>
        )}
      </div>
    );
  }

  const handleCopy = () => {
    const csv = [
      queryResult.columns.join("\t"),
      ...queryResult.rows.map((r) =>
        queryResult.columns.map((c) => String(r[c] ?? "")).join("\t"),
      ),
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
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          };
          const csv = [
            queryResult.columns.map(escapeCsv).join(","),
            ...queryResult.rows.map((r) =>
              queryResult.columns.map((c) => escapeCsv(r[c])).join(","),
            ),
          ].join("\r\n");
          downloadFile(csv, `results_${ts}.csv`, "text/csv");
        },
      },
      {
        label: "Export as JSON",
        action: () => {
          const json = JSON.stringify(queryResult.rows, null, 2);
          downloadFile(json, `results_${ts}.json`, "application/json");
        },
      },
      {
        label: "Export as TSV",
        action: () => {
          const tsv = [
            queryResult.columns.join("\t"),
            ...queryResult.rows.map((r) =>
              queryResult.columns.map((c) => String(r[c] ?? "")).join("\t"),
            ),
          ].join("\r\n");
          downloadFile(tsv, `results_${ts}.tsv`, "text/tab-separated-values");
        },
      },
    ]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-panel-border bg-panel-bg/50 shrink-0">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="text-success">{queryResult.rowCount} rows</span>
          <span>{queryResult.executionTime}ms</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Copy as TSV"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={handleDownload}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Export results (CSV, JSON, TSV)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable table — both axes */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="text-xs font-mono min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-panel-bg">
            <tr>
              {/* Row-number column — not resizable */}
              <th className="px-3 py-1.5 text-left text-muted-foreground font-medium border-b border-r border-panel-border/70 w-10 min-w-[2.5rem]">
                #
              </th>
              {queryResult.columns.map((col) => (
                <th
                  key={col}
                  style={
                    colWidths[col]
                      ? { width: colWidths[col], minWidth: colWidths[col] }
                      : { minWidth: 80 }
                  }
                  className="relative px-3 py-1.5 text-left text-muted-foreground font-medium border-b border-r border-panel-border/70 last:border-r-0 whitespace-nowrap select-none"
                >
                  <span className="block truncate pr-2">{col}</span>
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize hover:bg-primary/40 transition-colors z-20"
                    onMouseDown={(e) => startResize(e, col)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queryResult.rows.map((row, i) => (
              <tr
                key={i}
                className="hover:bg-secondary/30 transition-colors"
                onContextMenu={(e) => {
                  const rowCsv = queryResult.columns
                    .map((c) => String(row[c] ?? ""))
                    .join("\t");
                  showContextMenu(e, [
                    {
                      label: "Copy Row",
                      action: () => navigator.clipboard.writeText(rowCsv),
                    },
                    {
                      label: "Copy Row as JSON",
                      action: () => {
                        const obj: Record<string, unknown> = {};
                        queryResult.columns.forEach((c) => {
                          obj[c] = row[c];
                        });
                        navigator.clipboard.writeText(
                          JSON.stringify(obj, null, 2),
                        );
                      },
                    },
                    {
                      label: "Copy Cell",
                      action: () => {
                        const target = e.target as HTMLElement;
                        const cell = target.closest("td");
                        if (cell)
                          navigator.clipboard.writeText(cell.textContent ?? "");
                      },
                    },
                    { separator: true, label: "sep" },
                    {
                      label: "Copy All Rows as CSV",
                      action: () => {
                        const csv = [
                          queryResult.columns.join("\t"),
                          ...queryResult.rows.map((r) =>
                            queryResult.columns
                              .map((c) => String(r[c] ?? ""))
                              .join("\t"),
                          ),
                        ].join("\n");
                        navigator.clipboard.writeText(csv);
                      },
                    },
                    {
                      label: "Copy All as JSON",
                      action: () =>
                        navigator.clipboard.writeText(
                          JSON.stringify(queryResult.rows, null, 2),
                        ),
                    },
                    { separator: true, label: "sep2" },
                    {
                      label: "Export All as CSV",
                      action: () => {
                        const ts = new Date()
                          .toISOString()
                          .slice(0, 19)
                          .replace(/[:.]/g, "-");
                        const escapeCsv = (v: unknown) => {
                          const s = String(v ?? "");
                          return s.includes(",") ||
                            s.includes('"') ||
                            s.includes("\n")
                            ? `"${s.replace(/"/g, '""')}"`
                            : s;
                        };
                        const csv = [
                          queryResult.columns.map(escapeCsv).join(","),
                          ...queryResult.rows.map((r) =>
                            queryResult.columns
                              .map((c) => escapeCsv(r[c]))
                              .join(","),
                          ),
                        ].join("\r\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `results_${ts}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      },
                    },
                    {
                      label: "Export All as JSON",
                      action: () => {
                        const ts = new Date()
                          .toISOString()
                          .slice(0, 19)
                          .replace(/[:.]/g, "-");
                        const blob = new Blob(
                          [JSON.stringify(queryResult.rows, null, 2)],
                          { type: "application/json" },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `results_${ts}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      },
                    },
                  ]);
                }}
              >
                <td className="px-3 py-1 text-muted-foreground border-b border-r border-panel-border/60 whitespace-nowrap">
                  {i + 1}
                </td>
                {queryResult.columns.map((col) => (
                  <td
                    key={col}
                    style={
                      colWidths[col]
                        ? { width: colWidths[col], maxWidth: colWidths[col] }
                        : {}
                    }
                    className="px-3 py-1 text-foreground border-b border-r border-panel-border/60 last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis"
                  >
                    {row[col] === null ? (
                      <span className="text-muted-foreground italic">NULL</span>
                    ) : typeof row[col] === "boolean" ? (
                      <span
                        className={cn(
                          row[col] ? "text-success" : "text-destructive",
                        )}
                      >
                        {String(row[col])}
                      </span>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TerminalPanel() {
  return <TerminalComponent />;
}

export function ResultsPanel() {
  const {
    activeBottomTab,
    setActiveBottomTab,
    bottomPanelVisible,
    setBottomPanelVisible,
  } = useAppStore();

  const tabs = [
    { id: "results" as const, label: "Results", icon: Table },
    { id: "terminal" as const, label: "Terminal", icon: Terminal },
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
              onClick={() => setActiveBottomTab(tab.id)}
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
            {bottomPanelVisible ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Panel content — flex-col so ResultsTable's flex-1 works */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeBottomTab === "results" && <ResultsTable />}
        {activeBottomTab === "terminal" && <TerminalPanel />}
        {activeBottomTab === "problems" && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
            No problems detected
          </div>
        )}
        {activeBottomTab === "history" && <QueryHistory />}
      </div>
    </div>
  );
}
