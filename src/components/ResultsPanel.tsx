import { useState } from "react";
import {
  Table,
  Terminal,
  AlertTriangle,
  Download,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { QueryHistory } from "./QueryHistory";
import { showContextMenu } from "./ContextMenu";

function ResultsTable() {
  const queryResult = useAppStore((s) => s.queryResult);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-panel-border bg-panel-bg/50">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="text-success">{queryResult.rowCount} rows</span>
          <span>{queryResult.executionTime}ms</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-panel-bg z-10">
            <tr>
              <th className="px-3 py-1.5 text-left text-muted-foreground font-medium border-b border-panel-border w-10">
                #
              </th>
              {queryResult.columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-1.5 text-left text-muted-foreground font-medium border-b border-panel-border whitespace-nowrap"
                >
                  {col}
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
                  const rowData = queryResult.columns
                    .map((c) => `${c}: ${row[c] ?? "NULL"}`)
                    .join("\n");
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
                        /* uses the target cell */
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
                    { label: "Export as CSV", disabled: true },
                    { label: "Export as JSON", disabled: true },
                  ]);
                }}
              >
                <td className="px-3 py-1 text-muted-foreground border-b border-panel-border/50">
                  {i + 1}
                </td>
                {queryResult.columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-1 text-foreground border-b border-panel-border/50 whitespace-nowrap"
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
  return (
    <div className="flex-1 p-3 font-mono text-xs">
      <div className="text-muted-foreground">
        <span className="text-success">dbstudio</span>
        <span className="text-muted-foreground">@</span>
        <span className="text-primary">production</span>
        <span className="text-muted-foreground"> $ </span>
        <span className="animate-pulse">▊</span>
      </div>
    </div>
  );
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
      <div className="flex-1 min-h-0">
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
