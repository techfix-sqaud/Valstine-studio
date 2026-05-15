import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  Database,
  Download,
  Moon,
  PanelsTopLeft,
  Play,
  Search,
  Sparkles,
  SplitSquareVertical,
  Sun,
  TerminalSquare,
  WandSparkles,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import {
  analystActivities,
  analystTabs,
  assistantMessages,
  executionPlan,
  explorerTree,
  migrationChecklist,
  notebookHighlights,
  platformBadges,
  resultColumns,
  resultRows,
  statusCards,
  visualizationCards,
  type AnalystActivityId,
} from "./analyst-os-data";
import { ResizableHandle } from "@/components/ui/resizable";

const sidebarTitles: Record<
  AnalystActivityId,
  { eyebrow: string; heading: string; summary: string }
> = {
  explorer: {
    eyebrow: "Workspace graph",
    heading: "Databases, projects, and notebooks",
    summary:
      "Browse schemas, scripts, and datasets with VS Code-style structure and quick actions.",
  },
  sql: {
    eyebrow: "Editor system",
    heading: "Multi-tab SQL workbench",
    summary:
      "Keep reusable scripts, saved queries, and AI-reviewed drafts in one keyboard-first editor surface.",
  },
  runner: {
    eyebrow: "Execution lane",
    heading: "Runtime, history, and logs",
    summary:
      "Track executions, compare timings, and debug failures without leaving the workspace.",
  },
  tables: {
    eyebrow: "Data browser",
    heading: "Preview rows and metadata",
    summary:
      "Inspect tables, sample records, and column contracts before you write a query.",
  },
  ai: {
    eyebrow: "Database copilot",
    heading: "Actionable AI assistance",
    summary:
      "Generate SQL, explain plans, fix errors, and suggest schema improvements in context.",
  },
  viz: {
    eyebrow: "BI studio",
    heading: "Dashboard and story builder",
    summary:
      "Turn results into Tableau-style boards, dashboards, and guided insights from the same result set.",
  },
  templates: {
    eyebrow: "Excel templates",
    heading: "Workbook packs and exports",
    summary:
      "Use governed Excel-style templates for finance, ops, and executive handoff from the same workspace.",
  },
  migrations: {
    eyebrow: "Import pipeline",
    heading: "CSV and Excel migrations",
    summary:
      "Infer schema, validate records, and ship destination-ready migrations to multiple engines.",
  },
  notebook: {
    eyebrow: "Analysis canvas",
    heading: "Notebook-powered workflows",
    summary:
      "Blend markdown, SQL, and chart outputs for learning, reporting, and experimentation.",
  },
  settings: {
    eyebrow: "Platform settings",
    heading: "Connections and preferences",
    summary:
      "Manage credentials, command palette behavior, editor defaults, and cross-platform runtime settings.",
  },
};

const panelTabs = ["results", "logs", "problems", "insights"] as const;

type PanelTab = (typeof panelTabs)[number];
type AssistantFeedItem = {
  role: "assistant" | "user";
  title: string;
  body: string;
};

type QueryScenario = {
  connection: string;
  runtime: number;
  columns: string[];
  rows: string[][];
  plan: string[];
  insight: string;
  problems: string[];
  aiNote: string;
};

const queryScenarios: Record<string, QueryScenario> = {
  "cohort-retention": {
    connection: "postgres://campus-warehouse",
    runtime: 42,
    columns: resultColumns,
    rows: resultRows,
    plan: executionPlan,
    insight:
      "AI insight: month-two drop clusters around learners with fewer than three weekly interactions.",
    problems: [
      "Warning: cohort_month is text in the CSV preview. Migration assistant recommends casting to date.",
      "Error fix available: missing index on analytics.student_sessions(campus_id, session_started_at).",
    ],
    aiNote:
      "I rewrote the retention query to pre-aggregate by month. Estimated runtime dropped from 118 ms to 42 ms.",
  },
  "revenue-pulse": {
    connection: "mysql://sales-mirror",
    runtime: 58,
    columns: ["invoice_month", "region", "revenue", "avg_invoice_value"],
    rows: [
      ["2026-04", "North", "$412,900", "$1,924"],
      ["2026-04", "West", "$396,240", "$1,871"],
      ["2026-03", "North", "$388,180", "$1,812"],
      ["2026-03", "Central", "$341,040", "$1,705"],
    ],
    plan: [
      "Hash Aggregate on finance.invoices by invoice_month, region",
      "Range Scan on idx_invoices_invoice_date",
      "Runtime: 58 ms | Rows scanned: 14.2k | Temporary tables: 0",
    ],
    insight:
      "AI insight: North region outperformed the trailing 3-month average by 9.4% after invoice bundling.",
    problems: [
      "Suggestion: add composite index on finance.invoices(invoice_date, region) for heavier monthly workloads.",
      "Notice: currency conversion is not applied in this report. Cross-region comparisons assume USD-normalized totals.",
    ],
    aiNote:
      "I optimized the monthly revenue query by eliminating redundant sorting and using the invoice date index.",
  },
  "supply-anomalies": {
    connection: "sqlite://local-notes.db",
    runtime: 31,
    columns: ["warehouse_id", "sku", "anomaly_events", "last_event_at"],
    rows: [
      ["WH-04", "SKU-1192", "7", "2026-05-03 19:14"],
      ["WH-02", "SKU-4401", "6", "2026-05-03 15:42"],
      ["WH-09", "SKU-2208", "5", "2026-05-02 23:08"],
      ["WH-01", "SKU-1144", "4", "2026-05-02 18:37"],
    ],
    plan: [
      "Temp B-Tree for GROUP BY on inventory_anomalies",
      "Full scan narrowed by severity filter",
      "Runtime: 31 ms | Alert candidates: 4 | Severity bands: high, critical",
    ],
    insight:
      "AI insight: WH-04 and WH-02 account for 54% of repeated high-severity anomaly events this week.",
    problems: [
      "Warning: SQLite source lacks a warehouse_timezone column, so last_event_at is rendered in local runtime time.",
      "Suggestion: promote severity to an enum before syncing this model into PostgreSQL.",
    ],
    aiNote:
      "I converted the anomaly scan into a grouped summary that surfaces repeated critical SKUs without reopening the raw event table.",
  },
};

const initialLogEntries = [
  "09:14:03 Connected to postgres://campus-warehouse",
  "09:14:10 AI optimizer suggested bitmap index on session_started_at",
  "09:14:11 Query runtime dropped 64% after pre-aggregation",
  "09:14:13 Visualization builder prepared retention_heatmap.viz",
];

const paletteCommands = [
  "Connect to PostgreSQL warehouse",
  "Generate SQL from natural language",
  "Import CSV into new table",
  "Open revenue_pulse.sql",
  "Show retention heatmap",
];

export function ValstineAnalystOSApp() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useAppStore();
  const [activeActivity, setActiveActivity] =
    useState<AnalystActivityId>("explorer");
  const [activeTabId, setActiveTabId] = useState(analystTabs[0].id);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("results");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedExplorerItem, setSelectedExplorerItem] = useState(
    explorerTree[0].items[0],
  );
  const [connectedLabel, setConnectedLabel] = useState(
    queryScenarios[analystTabs[0].id].connection,
  );
  const [connectedCount, setConnectedCount] = useState("3 engines");
  const [aiStatusLabel, setAiStatusLabel] = useState("Live suggestions");
  const [projectStatusLabel, setProjectStatusLabel] = useState("12 active");
  const [queryRuntimeMs, setQueryRuntimeMs] = useState(
    queryScenarios[analystTabs[0].id].runtime,
  );
  const [activityMessage, setActivityMessage] = useState(
    "Workspace ready. Open a script, run a query, or ask the copilot for help.",
  );
  const [logEntries, setLogEntries] = useState(initialLogEntries);
  const [assistantFeed, setAssistantFeed] = useState<AssistantFeedItem[]>(
    assistantMessages.map((message) => ({
      ...message,
      role: message.role as AssistantFeedItem["role"],
    })),
  );

  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }

      if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const themeVars = useMemo<CSSProperties>(
    () =>
      ({
        "--analyst-bg": isDark ? "#0a0d14" : "#edf3fb",
        "--analyst-chrome": isDark ? "#090d14" : "#e4ebf5",
        "--analyst-toolbar": isDark ? "#0c111b" : "#f7faff",
        "--analyst-panel": isDark ? "#0c111a" : "#f4f7fc",
        "--analyst-editor": isDark ? "#0a0f17" : "#ffffff",
        "--analyst-well": isDark ? "#0d1320" : "#edf2f9",
        "--analyst-active": isDark ? "#0f1522" : "#ffffff",
        "--analyst-gutter": isDark ? "#090e16" : "#e9eef6",
        "--analyst-tooltip": isDark ? "#101522" : "#ffffff",
        "--analyst-modal": isDark ? "#101522" : "#ffffff",
        "--analyst-subtle": isDark
          ? "rgba(255,255,255,0.05)"
          : "rgba(15,23,42,0.045)",
        "--analyst-border": isDark
          ? "rgba(148,163,184,0.16)"
          : "rgba(71,85,105,0.18)",
        "--analyst-text": isDark ? "#e8eef8" : "#0f172a",
        "--analyst-muted": isDark ? "#94a3b8" : "#475569",
        "--analyst-dim": "#64748b",
        "--analyst-line": isDark ? "#475569" : "#94a3b8",
      }) as CSSProperties,
    [isDark],
  );

  const overlayStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: isDark
        ? "radial-gradient(circle at top left, rgba(34,211,238,0.15), transparent 28%), radial-gradient(circle at 85% 20%, rgba(99,102,241,0.18), transparent 25%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)"
        : "radial-gradient(circle at top left, rgba(14,165,233,0.14), transparent 28%), radial-gradient(circle at 85% 20%, rgba(99,102,241,0.14), transparent 24%), linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px)",
    }),
    [isDark],
  );

  const activeTab = useMemo(
    () => analystTabs.find((tab) => tab.id === activeTabId) ?? analystTabs[0],
    [activeTabId],
  );
  const currentScenario = useMemo(
    () => queryScenarios[activeTab.id] ?? queryScenarios[analystTabs[0].id],
    [activeTab.id],
  );

  const sidebarMeta = sidebarTitles[activeActivity];
  const borderClass = "border-[color:var(--analyst-border)]";
  const subtleSurfaceClass = "bg-[var(--analyst-subtle)]";
  const panelSurfaceClass = "bg-[var(--analyst-panel)]";
  const editorSurfaceClass = "bg-[var(--analyst-editor)]";
  const wellSurfaceClass = "bg-[var(--analyst-well)]";
  const activeSurfaceClass = "bg-[var(--analyst-active)]";
  const gutterSurfaceClass = "bg-[var(--analyst-gutter)]";
  const chromeSurfaceClass = "bg-[var(--analyst-chrome)]";
  const toolbarSurfaceClass = "bg-[var(--analyst-toolbar)]";
  const modalSurfaceClass = "bg-[var(--analyst-modal)]";
  const tooltipSurfaceClass = "bg-[var(--analyst-tooltip)]";
  const textStrongClass = "text-[color:var(--analyst-text)]";
  const textMutedClass = "text-[color:var(--analyst-muted)]";
  const textDimClass = "text-[color:var(--analyst-dim)]";
  const textLineClass = "text-[color:var(--analyst-line)]";
  const ghostButtonClass = `rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-xs ${textMutedClass} transition hover:border-cyan-500/40 hover:text-[color:var(--analyst-text)]`;

  const appendLog = (entry: string) => {
    setLogEntries((current) => {
      const nextEntries = [...current, entry];
      return nextEntries.slice(-8);
    });
  };

  const appendAssistantMessage = (message: AssistantFeedItem) => {
    setAssistantFeed((current) => [...current, message].slice(-6));
  };

  const handleRunQuery = () => {
    setBottomPanelOpen(true);
    setActivePanelTab("results");
    setActiveActivity("runner");
    setQueryRuntimeMs(currentScenario.runtime);
    setConnectedLabel(currentScenario.connection);
    setAiStatusLabel("Results refreshed");
    setActivityMessage(
      `Executed ${activeTab.title} against ${currentScenario.connection} in ${currentScenario.runtime} ms.`,
    );
    appendLog(
      `09:15:2${(logEntries.length + 1) % 10} Executed ${activeTab.title} on ${currentScenario.connection} in ${currentScenario.runtime} ms`,
    );
  };

  const handleOptimizeQuery = () => {
    setRightPanelOpen(true);
    setBottomPanelOpen(true);
    setActivePanelTab("insights");
    setActiveActivity("ai");
    setAiStatusLabel("Optimization ready");
    setActivityMessage(`Optimization draft prepared for ${activeTab.title}.`);
    appendLog(
      `09:16:0${(logEntries.length + 1) % 10} Optimizer reviewed ${activeTab.title} and produced a tuned execution path`,
    );
    appendAssistantMessage({
      role: "assistant",
      title: "Optimizer",
      body: currentScenario.aiNote,
    });
  };

  const handleExplainPlan = () => {
    setSplitView(true);
    setBottomPanelOpen(true);
    setActivePanelTab("insights");
    setActiveActivity("runner");
    setQueryRuntimeMs(currentScenario.runtime);
    setActivityMessage(`Execution plan opened for ${activeTab.title}.`);
    appendLog(
      `09:16:3${(logEntries.length + 1) % 10} Opened explain plan for ${activeTab.title}`,
    );
  };

  const handleConnectDatabase = () => {
    setActiveActivity("settings");
    setLeftPanelOpen(true);
    setConnectedCount("4 engines");
    setConnectedLabel("postgres://analytics-hub");
    setProjectStatusLabel("13 active");
    setActivityMessage(
      "Connected postgres://analytics-hub and synced a new workspace profile.",
    );
    appendLog(
      "09:16:48 Connected postgres://analytics-hub and refreshed workspace metadata",
    );
    appendAssistantMessage({
      role: "assistant",
      title: "Connection Manager",
      body: "New PostgreSQL warehouse connected successfully. Connection pooling and schema introspection are ready.",
    });
  };

  const handleExplorerSelection = (section: string, item: string) => {
    setSelectedExplorerItem(item);
    setLeftPanelOpen(true);

    if (section === "Connections") {
      setConnectedLabel(item);
      setActiveActivity("explorer");
      setActivityMessage(`Focused connection ${item}.`);
      appendLog(
        `09:17:0${(logEntries.length + 1) % 10} Switched active connection to ${item}`,
      );
      return;
    }

    if (item.endsWith("revenue_pulse.sql")) {
      setActiveTabId("revenue-pulse");
      setActiveActivity("sql");
      setActivityMessage("Opened revenue_pulse.sql in the SQL editor.");
      return;
    }

    if (item.endsWith("cohorts.ipynb")) {
      setActiveActivity("notebook");
      setActivityMessage("Opened analytics/cohorts.ipynb in notebook mode.");
      return;
    }

    if (item.endsWith("load_students.csv")) {
      setActiveActivity("migrations");
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      setActivityMessage(
        "Opened CSV migration assistant with validation checks.",
      );
      return;
    }

    if (item.endsWith("retention_heatmap.viz")) {
      setActiveActivity("viz");
      setSplitView(true);
      setActivityMessage("Loaded retention heatmap visualization workspace.");
      return;
    }

    setActiveActivity("tables");
    setBottomPanelOpen(true);
    setActivePanelTab("results");
    setActivityMessage(`Opened ${item} in the data browser.`);
  };

  const handleSuggestedAction = (action: string) => {
    if (action === "Generate SQL from plain English") {
      setPaletteOpen(true);
      setActiveActivity("ai");
      setActivityMessage(
        "Command palette opened for natural-language SQL generation.",
      );
      return;
    }

    if (action === "Fix migration type mismatches") {
      setActiveActivity("migrations");
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      setActivityMessage(
        "Migration type review opened with active validation findings.",
      );
      return;
    }

    handleExplainPlan();
  };

  const handlePaletteCommand = (command: string) => {
    setPaletteOpen(false);

    if (command === "Connect to PostgreSQL warehouse") {
      handleConnectDatabase();
      return;
    }

    if (command === "Generate SQL from natural language") {
      setActiveActivity("ai");
      setRightPanelOpen(true);
      setActivityMessage("AI copilot is ready to generate SQL from a prompt.");
      appendAssistantMessage({
        role: "assistant",
        title: "SQL Generator",
        body: "Describe the metric or cohort you want, and I will draft the query with engine-specific syntax.",
      });
      return;
    }

    if (command === "Import CSV into new table") {
      setActiveActivity("migrations");
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      setActivityMessage(
        "CSV import flow opened with schema inference and validation enabled.",
      );
      return;
    }

    if (command === "Open revenue_pulse.sql") {
      setActiveTabId("revenue-pulse");
      setActiveActivity("sql");
      setActivityMessage("Opened revenue_pulse.sql from the command palette.");
      return;
    }

    setActiveActivity("viz");
    setSplitView(true);
    setActivityMessage(
      "Visualization preview focused on the retention heatmap.",
    );
  };

  const renderSidebarBody = () => {
    if (activeActivity === "migrations") {
      return (
        <div className="space-y-3">
          {migrationChecklist.map((item) => (
            <div
              key={item}
              className={`rounded-xl border ${borderClass} ${subtleSurfaceClass} px-3 py-3 text-[12px] ${textStrongClass}`}
            >
              {item}
            </div>
          ))}
        </div>
      );
    }

    if (activeActivity === "viz") {
      return (
        <div className="space-y-3">
          {visualizationCards.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-3"
            >
              <div className={`text-sm font-medium ${textStrongClass}`}>
                {card.title}
              </div>
              <div className={`mt-1 text-[12px] leading-5 ${textMutedClass}`}>
                {card.detail}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeActivity === "notebook") {
      return (
        <div className="space-y-3">
          {notebookHighlights.map((item) => (
            <div
              key={item}
              className={`rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-3 text-[12px] ${textStrongClass}`}
            >
              {item}
            </div>
          ))}
        </div>
      );
    }

    if (activeActivity === "settings") {
      return (
        <div className="space-y-3">
          {platformBadges.map((badge) => (
            <div
              key={badge}
              className={`flex items-center justify-between rounded-xl border ${borderClass} ${subtleSurfaceClass} px-3 py-3`}
            >
              <span className={`text-[12px] ${textStrongClass}`}>{badge}</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                supported
              </span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {explorerTree.map((section) => (
          <div key={section.title}>
            <div
              className={`mb-2 text-[10px] uppercase tracking-[0.22em] ${textDimClass}`}
            >
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <button
                  key={item}
                  onClick={() => handleExplorerSelection(section.title, item)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] ${textStrongClass} transition hover:bg-[var(--analyst-subtle)] hover:text-[color:var(--analyst-text)]`}
                >
                  <ChevronRight className={`h-3.5 w-3.5 ${textDimClass}`} />
                  <span className="truncate">{item}</span>
                  {selectedExplorerItem === item ? (
                    <span className="ml-auto rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                      active
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderBottomPanel = () => {
    if (activePanelTab === "logs") {
      return (
        <div
          className={`space-y-2 p-4 font-mono text-[12px] ${textMutedClass}`}
        >
          {logEntries.map((entry, index) => (
            <div key={`log-${index}-${entry}`}>{entry}</div>
          ))}
        </div>
      );
    }

    if (activePanelTab === "problems") {
      return (
        <div className={`space-y-3 p-4 text-[12px] ${textStrongClass}`}>
          {currentScenario.problems.map((problem, index) => (
            <div
              key={problem}
              className={[
                "rounded-xl px-3 py-3",
                index === 0
                  ? "border border-amber-500/20 bg-amber-500/10"
                  : "border border-rose-500/20 bg-rose-500/10",
              ].join(" ")}
            >
              {problem}
            </div>
          ))}
        </div>
      );
    }

    if (activePanelTab === "insights") {
      return (
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {currentScenario.plan.map((line) => (
            <div
              key={line}
              className={`rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 text-[12px] ${textStrongClass}`}
            >
              {line}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="overflow-auto p-4">
        <table
          className={`min-w-full border-separate border-spacing-0 text-left text-[12px] ${textStrongClass}`}
        >
          <thead>
            <tr>
              {currentScenario.columns.map((column) => (
                <th
                  key={column}
                  className={`border-b ${borderClass} px-3 py-2 font-medium ${textMutedClass}`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentScenario.rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}-${row.join("-")}`}
                className={rowIndex % 2 === 0 ? subtleSurfaceClass : ""}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    className={`border-b ${borderClass} px-3 py-2 font-mono ${textStrongClass}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      className={`relative h-screen overflow-hidden ${textStrongClass}`}
      style={themeVars}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[size:auto,auto,32px_32px,32px_32px] opacity-60"
        style={overlayStyle}
      />
      <div className="relative flex h-full flex-col backdrop-blur-[1px]">
        <header
          className={`flex h-14 items-center justify-between border-b ${borderClass} ${toolbarSurfaceClass} px-4`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
              <Database className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">
                Valstine Analyst OS
              </div>
              <div
                className={`truncate text-sm font-medium ${textStrongClass}`}
              >
                Database operating system for analysis, AI, and migrations
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeftPanelOpen((open) => !open)}
              className={ghostButtonClass}
            >
              {leftPanelOpen ? "Hide Explorer" : "Show Explorer"}
            </button>
            <button
              onClick={() => setRightPanelOpen((open) => !open)}
              className={ghostButtonClass}
            >
              {rightPanelOpen ? "Hide Assistant" : "Show Assistant"}
            </button>
            <button
              onClick={() => setBottomPanelOpen((open) => !open)}
              className={ghostButtonClass}
            >
              {bottomPanelOpen ? "Hide Panel" : "Show Panel"}
            </button>
            <button
              onClick={() => navigate("/welcome")}
              className={ghostButtonClass}
            >
              Product Hub
            </button>
            <button
              onClick={() => navigate("/studio")}
              className={ghostButtonClass}
            >
              Open Studio
            </button>
            <button
              onClick={toggleTheme}
              className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} p-2 ${textMutedClass} transition hover:border-cyan-500/40 hover:text-[color:var(--analyst-text)]`}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={handleConnectDatabase}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
            >
              Connect Database
            </button>
          </div>
        </header>

        <div
          className={`grid grid-cols-3 gap-3 border-b ${borderClass} ${chromeSurfaceClass} px-4 py-3`}
        >
          {statusCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-xl border ${borderClass} ${subtleSurfaceClass} px-3 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.12)]`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] uppercase tracking-[0.22em] ${textDimClass}`}
                >
                  {card.label}
                </span>
                <card.icon className="h-4 w-4 text-cyan-300" />
              </div>
              <div className={`mt-2 text-sm font-medium ${textStrongClass}`}>
                {card.label === "Connected"
                  ? connectedCount
                  : card.label === "AI Assist"
                    ? aiStatusLabel
                    : projectStatusLabel}
              </div>
              <div className={`mt-1 text-[11px] ${textMutedClass}`}>
                {card.label === "Connected"
                  ? connectedLabel
                  : card.label === "AI Assist"
                    ? activityMessage
                    : "Cross-platform workspace state synced"}
              </div>
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--analyst-bg)]">
          <aside
            className={`flex w-[58px] shrink-0 flex-col items-center border-r ${borderClass} ${chromeSurfaceClass} py-3`}
          >
            {analystActivities.map((item) => {
              const active = item.id === activeActivity;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveActivity(item.id);
                    setLeftPanelOpen(true);
                  }}
                  className={[
                    "group relative mb-2 flex h-11 w-11 items-center justify-center rounded-xl border transition",
                    active
                      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.1)]"
                      : `border-transparent bg-transparent ${textDimClass} hover:border-[color:var(--analyst-border)] hover:bg-[var(--analyst-subtle)] hover:text-[color:var(--analyst-text)]`,
                  ].join(" ")}
                  title={item.label}
                  aria-label={item.label}
                >
                  <item.icon className="h-4 w-4" />
                  <span
                    className={`pointer-events-none absolute left-14 top-1/2 hidden -translate-y-1/2 rounded-md border ${borderClass} ${tooltipSurfaceClass} px-2 py-1 text-[11px] ${textStrongClass} shadow-xl group-hover:block`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </aside>

          <Group orientation="horizontal" className="flex min-w-0 flex-1">
            {leftPanelOpen ? (
              <Panel
                id="analyst-left-panel"
                defaultSize="17%"
                minSize="13%"
                maxSize="24%"
              >
                <section
                  className={`flex h-full min-w-0 flex-col overflow-hidden border-r ${borderClass} ${panelSurfaceClass}`}
                >
                  <div className={`border-b ${borderClass} px-4 py-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/70">
                          {sidebarMeta.eyebrow}
                        </div>
                        <div
                          className={`mt-2 text-lg font-semibold ${textStrongClass}`}
                        >
                          {sidebarMeta.heading}
                        </div>
                        <div
                          className={`mt-1 text-[12px] leading-5 ${textMutedClass}`}
                        >
                          {sidebarMeta.summary}
                        </div>
                      </div>
                      <button
                        onClick={() => setLeftPanelOpen(false)}
                        className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} p-2 ${textMutedClass} transition hover:border-cyan-500/40 hover:text-[color:var(--analyst-text)]`}
                        aria-label="Close explorer panel"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>
                    <div
                      onClick={() => setPaletteOpen(true)}
                      className={`mt-4 flex cursor-pointer items-center gap-2 rounded-xl border ${borderClass} ${subtleSurfaceClass} px-3 py-2 ${textMutedClass}`}
                    >
                      <Search className="h-4 w-4" />
                      <span className="text-[12px]">
                        Search tables, columns, commands...
                      </span>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                    {renderSidebarBody()}
                  </div>
                </section>
              </Panel>
            ) : null}

            {leftPanelOpen ? <ResizableHandle withHandle /> : null}

            <Panel defaultSize="53%" minSize="36%">
              <Group orientation="vertical" className="h-full min-w-0">
                <Panel defaultSize="64%" minSize="36%">
                  <section
                    className={`flex h-full min-w-0 flex-col overflow-hidden ${editorSurfaceClass}`}
                  >
                    <div className={`border-b ${borderClass}`}>
                      <div className="flex items-center overflow-auto px-2 pt-2">
                        {analystTabs.map((tab) => {
                          const active = tab.id === activeTabId;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTabId(tab.id)}
                              className={[
                                "mr-1 min-w-[180px] rounded-t-xl border px-3 py-2 text-left transition",
                                active
                                  ? `${borderClass} ${activeSurfaceClass} ${textStrongClass}`
                                  : `border-transparent bg-transparent ${textDimClass} hover:bg-[var(--analyst-subtle)] hover:text-[color:var(--analyst-text)]`,
                              ].join(" ")}
                            >
                              <div className="text-[12px] font-medium">
                                {tab.title}
                              </div>
                              <div
                                className={`mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] ${textDimClass}`}
                              >
                                <span>{tab.dialect}</span>
                                <span>{tab.status}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div
                        className={`flex flex-wrap items-center justify-between gap-3 border-t ${borderClass} px-4 py-3`}
                      >
                        <div
                          className={`flex min-w-0 flex-wrap items-center gap-2 text-[12px] ${textMutedClass}`}
                        >
                          <button
                            onClick={handleRunQuery}
                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-cyan-200 transition hover:bg-cyan-500/20"
                          >
                            <Play className="mr-2 inline h-3.5 w-3.5" />
                            Run Query
                          </button>
                          <button
                            onClick={handleOptimizeQuery}
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 transition hover:border-cyan-500/30 hover:text-[color:var(--analyst-text)]`}
                          >
                            <WandSparkles className="mr-2 inline h-3.5 w-3.5" />
                            Optimize
                          </button>
                          <button
                            onClick={handleExplainPlan}
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 transition hover:border-cyan-500/30 hover:text-[color:var(--analyst-text)]`}
                          >
                            <PanelsTopLeft className="mr-2 inline h-3.5 w-3.5" />
                            Explain Plan
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSplitView((value) => !value)}
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-[12px] ${textStrongClass} transition hover:border-cyan-500/30`}
                          >
                            <SplitSquareVertical className="mr-2 inline h-3.5 w-3.5" />
                            {splitView ? "Single View" : "Split View"}
                          </button>
                          <button
                            onClick={() => setPaletteOpen(true)}
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-[12px] ${textStrongClass} transition hover:border-cyan-500/30`}
                          >
                            <Command className="mr-2 inline h-3.5 w-3.5" />
                            Palette
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      className={[
                        "grid min-h-0 flex-1 gap-4 p-4",
                        splitView
                          ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
                          : "grid-cols-1",
                      ].join(" ")}
                    >
                      <div
                        className={`min-h-0 overflow-auto rounded-2xl border ${borderClass} ${wellSurfaceClass} shadow-[0_20px_40px_rgba(0,0,0,0.12)]`}
                      >
                        <div
                          className={`flex items-center justify-between border-b ${borderClass} px-4 py-3 text-[12px] ${textMutedClass}`}
                        >
                          <span>{activeTab.title}</span>
                          <span>{activeTab.query.length} lines</span>
                        </div>
                        <div className="grid grid-cols-[56px_minmax(0,1fr)] font-mono text-[12px] leading-6">
                          <div
                            className={`border-r ${borderClass} ${gutterSurfaceClass} px-3 py-3 text-right ${textLineClass}`}
                          >
                            {activeTab.query.map((_, index) => (
                              <div key={index}>{index + 1}</div>
                            ))}
                          </div>
                          <div
                            className={`overflow-auto px-4 py-3 ${textStrongClass}`}
                          >
                            {activeTab.query.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {splitView ? (
                        <div className="grid min-h-0 gap-4 lg:grid-rows-[1fr_1fr]">
                          <div className="overflow-auto rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                            <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/80">
                              Execution Plan
                            </div>
                            <div className="mt-3 space-y-3">
                              {currentScenario.plan.map((item) => (
                                <div
                                  key={item}
                                  className={`rounded-xl border ${borderClass} ${editorSurfaceClass} px-3 py-3 text-[12px] ${textStrongClass}`}
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-auto rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.24em] text-indigo-300/80">
                                  Visualization Builder
                                </div>
                                <div
                                  className={`mt-2 text-sm font-medium ${textStrongClass}`}
                                >
                                  Retention Heatmap Preview
                                </div>
                              </div>
                              <Download className={`h-4 w-4 ${textDimClass}`} />
                            </div>
                            <div className="mt-4 grid grid-cols-6 gap-2">
                              {Array.from({ length: 24 }).map((_, index) => (
                                <div
                                  key={index}
                                  className="aspect-square rounded-md"
                                  style={{
                                    backgroundColor: `rgba(34, 211, 238, ${0.12 + ((index % 6) + 1) * 0.1})`,
                                  }}
                                />
                              ))}
                            </div>
                            <div
                              className={`mt-4 text-[12px] leading-5 ${textMutedClass}`}
                            >
                              {currentScenario.insight}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                </Panel>

                {bottomPanelOpen ? <ResizableHandle withHandle /> : null}

                {bottomPanelOpen ? (
                  <Panel
                    id="analyst-bottom-panel"
                    defaultSize="36%"
                    minSize="18%"
                  >
                    <section
                      className={`flex h-full flex-col overflow-hidden border-t ${borderClass} ${chromeSurfaceClass}`}
                    >
                      <div
                        className={`flex items-center justify-between border-b ${borderClass} px-4 py-2.5`}
                      >
                        <div className="flex items-center gap-1">
                          {panelTabs.map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setActivePanelTab(tab)}
                              className={[
                                "rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] transition",
                                activePanelTab === tab
                                  ? "bg-cyan-500/15 text-cyan-200"
                                  : `${textDimClass} hover:bg-[var(--analyst-subtle)] hover:text-[color:var(--analyst-text)]`,
                              ].join(" ")}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        <div
                          className={`flex items-center gap-2 text-[12px] ${textDimClass}`}
                        >
                          <button
                            onClick={() => setBottomPanelOpen(false)}
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} p-2 transition hover:border-cyan-500/40 hover:text-[color:var(--analyst-text)]`}
                            aria-label="Close bottom panel"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <TerminalSquare className="h-4 w-4" />
                          Runtime {queryRuntimeMs} ms
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        {renderBottomPanel()}
                      </div>
                    </section>
                  </Panel>
                ) : null}
              </Group>
            </Panel>

            {rightPanelOpen ? <ResizableHandle withHandle /> : null}

            {rightPanelOpen ? (
              <Panel
                id="analyst-right-panel"
                defaultSize="25%"
                minSize="20%"
                maxSize="32%"
              >
                <section
                  className={`flex h-full min-w-0 flex-col overflow-hidden border-l ${borderClass} ${panelSurfaceClass}`}
                >
                  <div className={`border-b ${borderClass} px-4 py-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/80">
                          AI Assistant
                        </div>
                        <div
                          className={`mt-2 text-lg font-semibold ${textStrongClass}`}
                        >
                          Real database copilot
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-cyan-300" />
                        <button
                          onClick={() => setRightPanelOpen(false)}
                          className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} p-2 ${textMutedClass} transition hover:border-cyan-500/40 hover:text-[color:var(--analyst-text)]`}
                          aria-label="Close assistant panel"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div
                      className={`mt-2 text-[12px] leading-5 ${textMutedClass}`}
                    >
                      Writes SQL, explains plans, fixes migration issues, and
                      recommends performance improvements in place.
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
                    {assistantFeed.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={[
                          "rounded-2xl border px-3 py-3",
                          message.role === "assistant"
                            ? "border-cyan-500/20 bg-cyan-500/5"
                            : `${borderClass} ${subtleSurfaceClass}`,
                        ].join(" ")}
                      >
                        <div
                          className={`text-[10px] uppercase tracking-[0.18em] ${textDimClass}`}
                        >
                          {message.title}
                        </div>
                        <div
                          className={`mt-2 text-[12px] leading-5 ${textStrongClass}`}
                        >
                          {message.body}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={`border-t ${borderClass} px-4 py-4`}>
                    <div
                      className={`rounded-2xl border ${borderClass} ${editorSurfaceClass} p-3`}
                    >
                      <div
                        className={`mb-3 flex items-center gap-2 text-[12px] ${textMutedClass}`}
                      >
                        <Bell className="h-4 w-4 text-cyan-300" />
                        Suggested actions
                      </div>
                      <div className="space-y-2">
                        {[
                          "Generate SQL from plain English",
                          "Fix migration type mismatches",
                          "Explain slow query plan",
                        ].map((action) => (
                          <button
                            key={action}
                            onClick={() => handleSuggestedAction(action)}
                            className={`w-full rounded-xl border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-left text-[12px] ${textStrongClass} transition hover:border-cyan-500/30`}
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </Panel>
            ) : null}
          </Group>
        </div>
      </div>

      {paletteOpen ? (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-20 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl rounded-2xl border ${borderClass} ${modalSurfaceClass} shadow-[0_25px_80px_rgba(0,0,0,0.25)]`}
          >
            <div
              className={`flex items-center gap-3 border-b ${borderClass} px-4 py-4 ${textMutedClass}`}
            >
              <Search className="h-4 w-4" />
              <span className="text-sm">
                Run query, format SQL, connect database, or open a notebook
              </span>
            </div>
            <div className="p-3">
              {paletteCommands.map((command) => (
                <button
                  key={command}
                  onClick={() => handlePaletteCommand(command)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm ${textStrongClass} transition hover:bg-[var(--analyst-subtle)]`}
                >
                  <span>{command}</span>
                  <span
                    className={`text-[10px] uppercase tracking-[0.22em] ${textDimClass}`}
                  >
                    enter
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
