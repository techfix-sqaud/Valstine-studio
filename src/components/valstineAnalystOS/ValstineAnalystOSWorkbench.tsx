import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Editor, { type BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
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
  Plus,
  Search,
  Sparkles,
  SplitSquareVertical,
  Sun,
  TerminalSquare,
  WandSparkles,
  X,
} from "lucide-react";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { ResizableHandle } from "@/components/ui/resizable";
import * as api from "@/lib/api";
import type { DBConnection, QueryResult } from "@/lib/mock-data";
import { useAppStore } from "@/store/app-store";
import { ValstineUsageDashboard } from "./ValstineUsageDashboard";
import {
  analystActivities,
  analystTabs,
  assistantMessages,
  migrationChecklist,
  notebookHighlights,
  platformBadges,
  statusCards,
  visualizationCards,
  type AnalystActivityId,
} from "./analyst-os-data";

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
      "Edit real SQL with Monaco, keep multiple query tabs open, and run the active script.",
  },
  runner: {
    eyebrow: "Execution lane",
    heading: "Runtime, history, and logs",
    summary:
      "Track executions, inspect outputs, and review plans from the same workspace.",
  },
  tables: {
    eyebrow: "Data browser",
    heading: "Preview rows and metadata",
    summary:
      "Inspect generated result sets and schema-facing table metadata before shipping a query.",
  },
  ai: {
    eyebrow: "Database copilot",
    heading: "Actionable AI assistance",
    summary:
      "Chat against the active editor state for query generation, explanation, and tuning suggestions.",
  },
  viz: {
    eyebrow: "Insight layer",
    heading: "Visualization builder",
    summary:
      "Turn current results into a visual narrative without leaving the workbench.",
  },
  migrations: {
    eyebrow: "Import pipeline",
    heading: "CSV and Excel migrations",
    summary:
      "Prepare imports with schema inference, warnings, and platform-ready migration steps.",
  },
  notebook: {
    eyebrow: "Analysis canvas",
    heading: "Notebook-powered workflows",
    summary:
      "Create notebooks, add markdown and SQL cells, and run SQL cells into the shared results pane.",
  },
  settings: {
    eyebrow: "Platform settings",
    heading: "Connections and preferences",
    summary:
      "Manage connections, theme, defaults, and the runtime profile for Analyst OS.",
  },
};

const panelTabs = ["results", "logs", "problems", "insights"] as const;
const paletteCommands = [
  "Create SQL query",
  "Create notebook",
  "Connect to PostgreSQL warehouse",
  "Generate SQL from natural language",
  "Import CSV into new table",
  "Show retention heatmap",
] as const;
const explorerConnections = [
  "postgres://campus-warehouse",
  "mysql://sales-mirror",
  "sqlite://local-notes.db",
];
const explorerSchemas = [
  "analytics.fact_sessions",
  "analytics.dim_students",
  "finance.invoices",
  "ops.inventory_anomalies",
];

type PanelTab = (typeof panelTabs)[number];
type PaletteCommand = (typeof paletteCommands)[number];
type ScenarioKey = "cohort-retention" | "revenue-pulse" | "supply-anomalies";

type AssistantFeedItem = {
  role: "assistant" | "user";
  title: string;
  body: string;
};

type NotebookCell = {
  id: string;
  kind: "markdown" | "sql";
  content: string;
  output?: string[];
};

type SqlWorkspaceTab = {
  id: string;
  kind: "sql";
  title: string;
  dialect: string;
  status: string;
  content: string;
};

type NotebookWorkspaceTab = {
  id: string;
  kind: "notebook";
  title: string;
  dialect: "Notebook";
  status: string;
  cells: NotebookCell[];
};

type DashboardWorkspaceTab = {
  id: string;
  kind: "dashboard";
  title: string;
  dialect: "Operations";
  status: string;
  summary: string;
};

type WorkspaceTab =
  | DashboardWorkspaceTab
  | SqlWorkspaceTab
  | NotebookWorkspaceTab;

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

const queryScenarios: Record<ScenarioKey, QueryScenario> = {
  "cohort-retention": {
    connection: "postgres://campus-warehouse",
    runtime: 42,
    columns: [
      "cohort_month",
      "active_month",
      "retention_pct",
      "active_learners",
      "cohort_size",
    ],
    rows: [
      ["2025-11-01", "2025-11-01", "100.0%", "782", "782"],
      ["2025-11-01", "2025-12-01", "74.8%", "585", "782"],
      ["2025-11-01", "2026-01-01", "63.4%", "496", "782"],
      ["2025-12-01", "2025-12-01", "100.0%", "814", "814"],
      ["2025-12-01", "2026-01-01", "71.5%", "582", "814"],
    ],
    plan: [
      "Hash Join on cohort_sizes using cohort_month",
      "GroupAggregate on student_sessions",
      "Bitmap Index Scan on idx_sessions_campus_started_at",
      "Cost: 12.4k | Buffers hit: 91% | Runtime: 42 ms",
    ],
    insight:
      "Month-two drop clusters around learners with fewer than three weekly interactions.",
    problems: [
      "Warning: cohort_month arrives as text from the CSV import and should be cast to a date for stronger comparisons.",
      "Optimization available: add an index on analytics.student_sessions(campus_id, session_started_at).",
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
      "North region outperformed the trailing three-month average by 9.4% after invoice bundling.",
    problems: [
      "Recommendation: add a composite index on finance.invoices(invoice_date, region) for heavier month-over-month workloads.",
      "Notice: this report assumes revenue is already normalized to USD for cross-region comparisons.",
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
      "WH-04 and WH-02 account for 54% of repeated high-severity anomaly events this week.",
    problems: [
      "Warning: SQLite source does not include warehouse_timezone, so timestamps are rendered in local runtime time.",
      "Suggestion: promote severity to an enum before replicating this model into PostgreSQL.",
    ],
    aiNote:
      "I converted the anomaly scan into a grouped summary that surfaces repeated critical SKUs without reopening the raw event table.",
  },
};

const initialWorkspaceTabs: WorkspaceTab[] = [
  {
    id: "usage-dashboard",
    kind: "dashboard",
    title: "studio_usage.vdash",
    dialect: "Operations",
    status: "Live",
    summary:
      "Launch Analyst OS into a real operating dashboard for execution, notebooks, and migrations.",
  },
];

const initialLogEntries = [
  "09:14:03 Connected to postgres://campus-warehouse",
  "09:14:10 AI optimizer suggested bitmap index on session_started_at",
  "09:14:11 Query runtime dropped 64% after pre-aggregation",
  "09:14:13 Visualization builder prepared retention_heatmap.viz",
];

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createNotebookDraft = (sequence: number): NotebookWorkspaceTab => ({
  id: createId("notebook"),
  kind: "notebook",
  title: `analysis_notebook_${sequence}.ipynb`,
  dialect: "Notebook",
  status: "Interactive",
  cells: [
    {
      id: createId("cell"),
      kind: "markdown",
      content:
        "# New analysis notebook\nDescribe the objective, connection, and metric you want to evaluate.",
    },
    {
      id: createId("cell"),
      kind: "sql",
      content:
        "SELECT\n  cohort_month,\n  COUNT(DISTINCT learner_id) AS active_learners\nFROM analytics.student_sessions\nGROUP BY 1\nORDER BY 1;",
    },
  ],
});

const countLines = (content: string) => content.split("\n").length;

const resolveActivityForTab = (tab: WorkspaceTab): AnalystActivityId => {
  if (tab.kind === "notebook") {
    return "notebook";
  }

  if (tab.kind === "dashboard") {
    return "explorer";
  }

  return "sql";
};

const resolveScenarioKey = (content: string): ScenarioKey => {
  const query = content.toLowerCase();

  if (
    query.includes("finance.invoices") ||
    query.includes("invoice") ||
    query.includes("revenue")
  ) {
    return "revenue-pulse";
  }

  if (
    query.includes("inventory_anomalies") ||
    query.includes("warehouse") ||
    query.includes("severity")
  ) {
    return "supply-anomalies";
  }

  return "cohort-retention";
};

const formatSql = (content: string) => {
  const lines = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""));

  return lines
    .join("\n")
    .replace(/\bselect\b/gi, "SELECT")
    .replace(/\bfrom\b/gi, "FROM")
    .replace(/\bwhere\b/gi, "WHERE")
    .replace(/\bgroup by\b/gi, "GROUP BY")
    .replace(/\border by\b/gi, "ORDER BY")
    .replace(/\bhaving\b/gi, "HAVING")
    .replace(/\bjoin\b/gi, "JOIN")
    .replace(/\bon\b/gi, "ON")
    .replace(/\blimit\b/gi, "LIMIT");
};

const buildAiResponse = (
  prompt: string,
  activeSql: string,
  activeTitle: string,
) => {
  const promptLower = prompt.toLowerCase();

  if (promptLower.includes("generate") || promptLower.includes("write sql")) {
    return `I can draft SQL for ${activeTitle}. Tell me the table and metric you need, and I will shape it for the active engine.`;
  }

  if (promptLower.includes("optimize") || promptLower.includes("faster")) {
    return `For ${activeTitle}, start with index coverage on WHERE and JOIN columns, reduce selected columns, and confirm the current ORDER BY can use an index. The active query has ${countLines(activeSql)} lines to review.`;
  }

  if (promptLower.includes("notebook")) {
    return "Create a notebook, add markdown context first, then keep SQL cells narrow and composable so each cell has one analytical job.";
  }

  return `I am reading the active workbench state for ${activeTitle}. Ask for SQL generation, explanation, or a notebook plan and I will respond in-context.`;
};

const formatConnectionLabel = (connection: DBConnection) => {
  const databaseLabel =
    connection.type === "sqlite"
      ? connection.filename || connection.database || "SQLite file"
      : connection.database || "database";

  return `${connection.name} · ${databaseLabel}`;
};

const getCellDisplayValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const getNumericValue = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,% ,]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const buildResultSummaryLines = (
  result: QueryResult,
  connection: DBConnection,
  queryLabel: string,
) => {
  const lines = [
    `Executed ${queryLabel} on ${connection.name}`,
    `Runtime ${result.executionTime} ms`,
    `Returned ${result.rowCount} rows across ${result.columns.length} columns`,
  ];

  if (result.columns.length) {
    lines.push(
      `Columns: ${result.columns.slice(0, 4).join(", ")}${result.columns.length > 4 ? "..." : ""}`,
    );
  }

  return lines;
};

const buildChartModel = (result: QueryResult | null) => {
  if (!result || result.status !== "success" || result.rows.length === 0) {
    return null;
  }

  const numericColumn = result.columns.find((column) =>
    result.rows.some((row) => getNumericValue(row[column]) !== null),
  );
  if (!numericColumn) {
    return null;
  }

  const labelColumn =
    result.columns.find((column) => column !== numericColumn) ?? numericColumn;

  const points = result.rows
    .map((row) => ({
      label: getCellDisplayValue(row[labelColumn]),
      value: getNumericValue(row[numericColumn]) ?? 0,
    }))
    .slice(0, 8);

  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return {
    labelColumn,
    numericColumn,
    maxValue,
    points,
  };
};

const buildExplainQuery = (connection: DBConnection, sql: string) => {
  switch (connection.type) {
    case "pg":
    case "mysql":
      return `EXPLAIN ${sql}`;
    case "sqlite":
      return `EXPLAIN QUERY PLAN ${sql}`;
    default:
      return null;
  }
};

const buildInsightMessage = (result: QueryResult | null) => {
  if (!result || result.status !== "success") {
    return "Run a query to generate a chart from live results.";
  }

  if (!result.rows.length) {
    return "The last query completed successfully but returned no rows.";
  }

  return `Visualization prepared from ${result.rowCount} rows and ${result.columns.length} columns in the last live result set.`;
};

export function ValstineAnalystOSWorkbench() {
  const navigate = useNavigate();
  const {
    theme,
    toggleTheme,
    connections,
    activeConnectionId,
    setActiveConnection,
    connectConnection,
    openConnectionDialog,
  } = useAppStore();
  const [activeActivity, setActiveActivity] =
    useState<AnalystActivityId>("explorer");
  const [workspaceTabs, setWorkspaceTabs] = useState(initialWorkspaceTabs);
  const [activeTabId, setActiveTabId] = useState(initialWorkspaceTabs[0].id);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("results");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedExplorerItem, setSelectedExplorerItem] = useState(
    initialWorkspaceTabs[0].title,
  );
  const [connectedLabel, setConnectedLabel] = useState("No database connected");
  const [connectedCount, setConnectedCount] = useState("0 saved");
  const [aiStatusLabel, setAiStatusLabel] = useState("Live suggestions");
  const [projectStatusLabel, setProjectStatusLabel] = useState(
    `${initialWorkspaceTabs.length} open`,
  );
  const [queryRuntimeMs, setQueryRuntimeMs] = useState(0);
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
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [notebookSequence, setNotebookSequence] = useState(1);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProblems, setExecutionProblems] = useState<string[]>([]);
  const [executionPlanLines, setExecutionPlanLines] = useState<string[]>([]);
  const [databaseObjects, setDatabaseObjects] = useState<string[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);

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

  useEffect(() => {
    setProjectStatusLabel(`${workspaceTabs.length} open`);
  }, [workspaceTabs.length]);

  const activeConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === activeConnectionId) ??
      null,
    [activeConnectionId, connections],
  );

  useEffect(() => {
    if (!activeConnectionId && connections.length > 0) {
      setActiveConnection(connections[0].id);
    }
  }, [activeConnectionId, connections, setActiveConnection]);

  useEffect(() => {
    setConnectedCount(`${connections.length} saved`);

    if (activeConnection) {
      setConnectedLabel(formatConnectionLabel(activeConnection));
      return;
    }

    setConnectedLabel("No database connected");
  }, [activeConnection, connections.length]);

  useEffect(() => {
    if (!activeConnection || activeConnection.status !== "connected") {
      setDatabaseObjects([]);
      return;
    }

    let cancelled = false;

    const loadDatabaseObjects = async () => {
      setLoadingObjects(true);
      try {
        const tables = await api.fetchTables(activeConnection);
        if (!cancelled) {
          setDatabaseObjects(
            tables.slice(0, 16).map((table) => `${table.schema}.${table.name}`),
          );
        }
      } catch {
        if (!cancelled) {
          setDatabaseObjects([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingObjects(false);
        }
      }
    };

    void loadDatabaseObjects();

    return () => {
      cancelled = true;
    };
  }, [activeConnection]);

  const themeVars = useMemo<CSSProperties>(
    () =>
      ({
        "--analyst-bg": isDark ? "#06101f" : "#d8e7ff",
        "--analyst-chrome": isDark ? "#081427" : "#bfd5fb",
        "--analyst-toolbar": isDark ? "#0a1830" : "#e9f2ff",
        "--analyst-panel": isDark ? "#0c1a31" : "#f2f7ff",
        "--analyst-editor": isDark ? "#091527" : "#ffffff",
        "--analyst-well": isDark ? "#0d1f39" : "#e4efff",
        "--analyst-active": isDark ? "#132748" : "#f8fbff",
        "--analyst-gutter": isDark ? "#081222" : "#d6e4fb",
        "--analyst-tooltip": isDark ? "#12233d" : "#ffffff",
        "--analyst-modal": isDark ? "#10213b" : "#ffffff",
        "--analyst-subtle": isDark
          ? "rgba(129,168,255,0.08)"
          : "rgba(46, 104, 199, 0.10)",
        "--analyst-border": isDark
          ? "rgba(129,168,255,0.18)"
          : "rgba(39, 84, 158, 0.22)",
        "--analyst-text": isDark ? "#edf4ff" : "#0f2f5c",
        "--analyst-muted": isDark ? "#a5bbd9" : "#3a6298",
        "--analyst-dim": isDark ? "#7690b4" : "#587daf",
        "--analyst-line": isDark ? "#5c7398" : "#7f9fc8",
        "--analyst-accent": isDark ? "#81a8ff" : "#225bb3",
        "--analyst-accent-soft": isDark
          ? "rgba(129,168,255,0.18)"
          : "rgba(34, 91, 179, 0.14)",
        "--analyst-accent-border": isDark
          ? "rgba(129,168,255,0.34)"
          : "rgba(34, 91, 179, 0.30)",
        "--analyst-brand-surface": isDark ? "#0c1a31" : "#214c91",
        "--analyst-brand-elevated": isDark
          ? "rgba(129,168,255,0.14)"
          : "rgba(255,255,255,0.08)",
        "--analyst-brand-border": isDark
          ? "rgba(129,168,255,0.22)"
          : "rgba(255,255,255,0.16)",
        "--analyst-brand-text": isDark ? "#edf4ff" : "#ffffff",
        "--analyst-brand-muted": isDark ? "#b6cae6" : "#dbe8ff",
        "--analyst-brand-dim": isDark ? "#8da9d1" : "#b8cef4",
      }) as CSSProperties,
    [isDark],
  );

  const overlayStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: isDark
        ? "radial-gradient(circle at top left, rgba(129,168,255,0.18), transparent 28%), radial-gradient(circle at 82% 18%, rgba(64,124,224,0.16), transparent 24%), linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)"
        : "radial-gradient(circle at top left, rgba(33,88,179,0.20), transparent 28%), radial-gradient(circle at 82% 18%, rgba(102,146,223,0.18), transparent 22%), linear-gradient(rgba(34,91,179,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,91,179,0.05) 1px, transparent 1px)",
    }),
    [isDark],
  );

  const beforeMount: BeforeMount = (monaco: typeof Monaco) => {
    monaco.editor.defineTheme("analystos-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "81A8FF", fontStyle: "bold" },
        { token: "string", foreground: "BFD7FF" },
        { token: "number", foreground: "9EC7FF" },
        { token: "comment", foreground: "6D88AD", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#091527",
        "editor.foreground": "#EDF4FF",
        "editorLineNumber.foreground": "#5C7398",
        "editorLineNumber.activeForeground": "#C7D9FF",
        "editor.selectionBackground": "#20437A66",
        "editor.lineHighlightBackground": "#12233D",
        "editorCursor.foreground": "#81A8FF",
        "editorWhitespace.foreground": "#1D3252",
      },
    });

    monaco.editor.defineTheme("analystos-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "225BB3", fontStyle: "bold" },
        { token: "string", foreground: "2E72BF" },
        { token: "number", foreground: "1C63C6" },
        { token: "comment", foreground: "6187B5", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#0F2F5C",
        "editorLineNumber.foreground": "#7F9FC8",
        "editorLineNumber.activeForeground": "#225BB3",
        "editor.selectionBackground": "#D7E6FF",
        "editor.lineHighlightBackground": "#ECF4FF",
        "editorCursor.foreground": "#225BB3",
        "editorWhitespace.foreground": "#C2D4EE",
      },
    });
  };

  const activeTab = useMemo(
    () =>
      workspaceTabs.find((tab) => tab.id === activeTabId) ?? workspaceTabs[0],
    [activeTabId, workspaceTabs],
  );
  const activeSql = useMemo(() => {
    if (!activeTab) {
      return "";
    }

    if (activeTab.kind === "dashboard") {
      return "";
    }

    if (activeTab.kind === "sql") {
      return activeTab.content;
    }

    return activeTab.cells
      .filter((cell) => cell.kind === "sql")
      .map((cell) => cell.content)
      .join("\n\n");
  }, [activeTab]);

  const chartModel = useMemo(() => buildChartModel(queryResult), [queryResult]);
  const insightMessage = useMemo(
    () => buildInsightMessage(queryResult),
    [queryResult],
  );

  const explorerSections = useMemo(
    () => [
      {
        title: "Workspace",
        items: workspaceTabs.map((tab) => tab.title),
      },
      {
        title: "Connections",
        items: connections.length
          ? connections.map((connection) => connection.name)
          : ["Add connection"],
      },
      {
        title: "Database Objects",
        items: databaseObjects.length
          ? databaseObjects
          : [
              loadingObjects
                ? "Loading database objects..."
                : activeConnection
                  ? "No tables discovered"
                  : "Connect a database to browse tables",
            ],
      },
    ],
    [
      activeConnection,
      connections,
      databaseObjects,
      loadingObjects,
      workspaceTabs,
    ],
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
  const accentTextClass = "text-[color:var(--analyst-accent)]";
  const accentSurfaceClass = "bg-[var(--analyst-accent-soft)]";
  const accentBorderClass = "border-[color:var(--analyst-accent-border)]";
  const brandSurfaceClass = "bg-[color:var(--analyst-brand-surface)]";
  const brandElevatedSurfaceClass = "bg-[color:var(--analyst-brand-elevated)]";
  const brandBorderClass = "border-[color:var(--analyst-brand-border)]";
  const brandTextClass = "text-[color:var(--analyst-brand-text)]";
  const brandMutedTextClass = "text-[color:var(--analyst-brand-muted)]";
  const brandDimTextClass = "text-[color:var(--analyst-brand-dim)]";
  const explorerSurfaceClass = isDark ? brandSurfaceClass : panelSurfaceClass;
  const explorerRailSurfaceClass = brandSurfaceClass;
  const explorerElevatedSurfaceClass = isDark
    ? brandElevatedSurfaceClass
    : subtleSurfaceClass;
  const explorerBorderClass = isDark ? brandBorderClass : borderClass;
  const explorerTextClass = isDark ? brandTextClass : textStrongClass;
  const explorerMutedTextClass = isDark ? brandMutedTextClass : textMutedClass;
  const explorerDimTextClass = isDark ? brandDimTextClass : textDimClass;
  const railActiveClass = `${brandBorderClass} ${brandElevatedSurfaceClass} ${brandTextClass} shadow-[0_0_0_1px_rgba(255,255,255,0.06)]`;
  const railIdleClass = `border-transparent bg-transparent ${brandDimTextClass} hover:border-white/15 hover:bg-white/10 hover:text-white`;
  const explorerActiveBadgeClass = isDark
    ? `${brandElevatedSurfaceClass} ${brandTextClass}`
    : `${accentSurfaceClass} ${accentTextClass}`;
  const explorerStatusBadgeClass = isDark
    ? `${brandBorderClass} ${brandElevatedSurfaceClass} ${brandTextClass}`
    : `${accentBorderClass} ${accentSurfaceClass} ${accentTextClass}`;
  const ghostButtonClass = `whitespace-nowrap rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-xs ${textMutedClass} transition hover:border-[color:var(--analyst-accent-border)] hover:text-[color:var(--analyst-text)]`;
  const primaryButtonClass = `whitespace-nowrap rounded-lg border ${accentBorderClass} ${accentSurfaceClass} px-3 py-2 text-xs font-medium ${accentTextClass} transition hover:brightness-95`;

  const appendLog = (entry: string) => {
    setLogEntries((current) => {
      const nextEntries = [...current, entry];
      return nextEntries.slice(-10);
    });
  };

  const appendAssistantMessage = (message: AssistantFeedItem) => {
    setAssistantFeed((current) => [...current, message].slice(-10));
  };

  const ensureConnected = async () => {
    const candidate =
      activeConnection ??
      connections.find((connection) => connection.status === "connected") ??
      connections[0] ??
      null;

    if (!candidate) {
      openConnectionDialog();
      setExecutionProblems([
        "No database connection is configured. Use Connect Database to add one.",
      ]);
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      setActivityMessage(
        "A real database connection is required before execution.",
      );
      return null;
    }

    if (!activeConnectionId) {
      setActiveConnection(candidate.id);
    }

    if (candidate.status === "connected") {
      return candidate;
    }

    const connectionResult = await connectConnection(candidate.id);
    if (!connectionResult.ok) {
      const error =
        connectionResult.error || "Failed to connect to the selected database.";
      setExecutionProblems([error]);
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      setActivityMessage(error);
      appendAssistantMessage({
        role: "assistant",
        title: "Connection Manager",
        body: error,
      });
      return null;
    }

    const refreshedConnection = useAppStore
      .getState()
      .connections.find((connection) => connection.id === candidate.id) ?? {
      ...candidate,
      status: "connected" as const,
    };

    return refreshedConnection;
  };

  const executeSql = async (sql: string, sourceLabel: string) => {
    const connection = await ensureConnected();
    if (!connection) {
      return null;
    }

    setIsExecuting(true);
    setExecutionProblems([]);
    setBottomPanelOpen(true);
    setActivePanelTab("results");
    setActiveActivity("runner");
    setAiStatusLabel("Executing live query");

    try {
      const result = await api.executeQuery(connection, sql);
      setQueryResult(result);
      setQueryRuntimeMs(result.executionTime);
      setExecutionPlanLines(
        buildResultSummaryLines(result, connection, sourceLabel),
      );
      setAiStatusLabel(
        result.status === "success" ? "Results refreshed" : "Execution failed",
      );

      if (result.status === "error") {
        const errorMessage = result.message || "The query failed.";
        setExecutionProblems([errorMessage]);
        setActivePanelTab("problems");
        setActivityMessage(errorMessage);
      } else {
        setActivityMessage(
          `Executed ${sourceLabel} against ${formatConnectionLabel(connection)} in ${result.executionTime} ms.`,
        );
      }

      appendLog(
        `09:19:${String((logEntries.length + 1) % 60).padStart(2, "0")} Executed ${sourceLabel} on ${connection.name} in ${result.executionTime} ms`,
      );

      return { connection, result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to run the query.";
      const failureResult: QueryResult = {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: 0,
        status: "error",
        message,
      };

      setQueryResult(failureResult);
      setExecutionProblems([message]);
      setActivePanelTab("problems");
      setAiStatusLabel("Execution failed");
      setActivityMessage(message);
      return null;
    } finally {
      setIsExecuting(false);
    }
  };

  const updateSqlTabContent = (tabId: string, content: string) => {
    setWorkspaceTabs((current) =>
      current.map((tab) =>
        tab.id === tabId && tab.kind === "sql"
          ? { ...tab, content, status: "Modified" }
          : tab,
      ),
    );
  };

  const updateNotebookCell = (
    tabId: string,
    cellId: string,
    content: string,
  ) => {
    setWorkspaceTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabId || tab.kind !== "notebook") {
          return tab;
        }

        return {
          ...tab,
          status: "Modified",
          cells: tab.cells.map((cell) =>
            cell.id === cellId ? { ...cell, content } : cell,
          ),
        };
      }),
    );
  };

  const addNotebookCell = (kind: NotebookCell["kind"]) => {
    if (!activeTab || activeTab.kind !== "notebook") {
      return;
    }

    const nextCell: NotebookCell = {
      id: createId("cell"),
      kind,
      content:
        kind === "markdown"
          ? "## New section\nDocument the analytical step here."
          : "SELECT\n  *\nFROM analytics.fact_sessions\nLIMIT 50;",
    };

    setWorkspaceTabs((current) =>
      current.map((tab) =>
        tab.id === activeTab.id && tab.kind === "notebook"
          ? { ...tab, status: "Modified", cells: [...tab.cells, nextCell] }
          : tab,
      ),
    );
    setActivityMessage(
      `${kind === "markdown" ? "Markdown" : "SQL"} cell added to ${activeTab.title}.`,
    );
  };

  const removeNotebookCell = (cellId: string) => {
    if (
      !activeTab ||
      activeTab.kind !== "notebook" ||
      activeTab.cells.length === 1
    ) {
      return;
    }

    setWorkspaceTabs((current) =>
      current.map((tab) =>
        tab.id === activeTab.id && tab.kind === "notebook"
          ? {
              ...tab,
              status: "Modified",
              cells: tab.cells.filter((cell) => cell.id !== cellId),
            }
          : tab,
      ),
    );
  };

  const createQueryTab = () => {
    const sequence =
      workspaceTabs.filter((tab) => tab.kind === "sql").length + 1;
    const nextTab: SqlWorkspaceTab = {
      id: createId("query"),
      kind: "sql",
      title: `query_${sequence}.sql`,
      dialect: "PostgreSQL",
      status: "Draft",
      content:
        "SELECT\n  learner_id,\n  COUNT(*) AS session_count\nFROM analytics.student_sessions\nGROUP BY 1\nORDER BY session_count DESC\nLIMIT 25;",
    };

    setWorkspaceTabs((current) => [...current, nextTab]);
    setActiveTabId(nextTab.id);
    setSelectedExplorerItem(nextTab.title);
    setActiveActivity("sql");
    setActivityMessage(
      `${nextTab.title} created and opened in the query editor.`,
    );
    appendLog(
      `09:18:1${(logEntries.length + 1) % 10} Created ${nextTab.title}`,
    );
  };

  const createNotebookTab = () => {
    const nextNotebook = createNotebookDraft(notebookSequence);
    setNotebookSequence((value) => value + 1);
    setWorkspaceTabs((current) => [...current, nextNotebook]);
    setActiveTabId(nextNotebook.id);
    setSelectedExplorerItem(nextNotebook.title);
    setActiveActivity("notebook");
    setActivityMessage(
      `${nextNotebook.title} created with starter markdown and SQL cells.`,
    );
    appendLog(
      `09:18:4${(logEntries.length + 1) % 10} Created ${nextNotebook.title}`,
    );
  };

  const closeWorkspaceTab = (tabId: string) => {
    if (workspaceTabs.length === 1) {
      return;
    }

    const closingIndex = workspaceTabs.findIndex((tab) => tab.id === tabId);
    const remaining = workspaceTabs.filter((tab) => tab.id !== tabId);
    const nextActive =
      remaining[Math.max(0, closingIndex - 1)] ??
      remaining[remaining.length - 1];

    setWorkspaceTabs(remaining);
    if (activeTabId === tabId && nextActive) {
      setActiveTabId(nextActive.id);
      setSelectedExplorerItem(nextActive.title);
      setActiveActivity(resolveActivityForTab(nextActive));
    }
  };

  const openWorkspaceTab = (title: string) => {
    const workspaceTab = workspaceTabs.find((tab) => tab.title === title);
    if (!workspaceTab) {
      return;
    }

    setActiveTabId(workspaceTab.id);
    setSelectedExplorerItem(workspaceTab.title);
    setActiveActivity(resolveActivityForTab(workspaceTab));
    setActivityMessage(`Opened ${workspaceTab.title}.`);
  };

  const handleRunNotebookCell = async (cellId: string) => {
    if (!activeTab || activeTab.kind !== "notebook") {
      return;
    }

    const cell = activeTab.cells.find((entry) => entry.id === cellId);
    if (!cell || cell.kind !== "sql" || !cell.content.trim()) {
      return;
    }

    const execution = await executeSql(
      cell.content,
      `${activeTab.title} cell ${activeTab.cells.findIndex((entry) => entry.id === cellId) + 1}`,
    );
    if (!execution) {
      return;
    }

    const { connection, result } = execution;

    setWorkspaceTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeTab.id || tab.kind !== "notebook") {
          return tab;
        }

        return {
          ...tab,
          status: "Ran",
          cells: tab.cells.map((entry) =>
            entry.id === cellId
              ? {
                  ...entry,
                  output: [
                    `Connected to ${formatConnectionLabel(connection)}`,
                    `Runtime ${result.executionTime} ms`,
                    result.status === "success"
                      ? `Returned ${result.rowCount} rows`
                      : result.message || "Execution failed",
                  ],
                }
              : entry,
          ),
        };
      }),
    );
  };

  const handleRunQuery = async () => {
    if (!activeTab) {
      return;
    }

    if (activeTab.kind === "dashboard") {
      createQueryTab();
      setActivityMessage(
        "Usage dashboard kept open. A new SQL workspace was launched for the investigation.",
      );
      return;
    }

    if (activeTab.kind === "notebook") {
      const firstSqlCell = activeTab.cells.find(
        (cell) => cell.kind === "sql" && cell.content.trim(),
      );
      if (!firstSqlCell) {
        setActivePanelTab("problems");
        setBottomPanelOpen(true);
        setActivityMessage("No SQL cell found in the active notebook.");
        appendAssistantMessage({
          role: "assistant",
          title: "Notebook Runner",
          body: "Add a SQL cell to the notebook before running it.",
        });
        return;
      }

      await handleRunNotebookCell(firstSqlCell.id);
      return;
    }

    if (!activeTab.content.trim()) {
      setActivePanelTab("problems");
      setBottomPanelOpen(true);
      setActivityMessage("No SQL found in the active editor.");
      appendAssistantMessage({
        role: "assistant",
        title: "Runner",
        body: "The active query tab is empty. Write SQL in the editor and try again.",
      });
      return;
    }

    await executeSql(activeTab.content, activeTab.title);
  };

  const handleOptimizeQuery = () => {
    if (!activeTab) {
      return;
    }

    if (activeTab.kind === "dashboard") {
      createQueryTab();
      setActivityMessage(
        "Opened a fresh SQL workspace so you can optimize a real query instead of the dashboard.",
      );
      return;
    }

    if (activeTab.kind === "sql") {
      const optimized = formatSql(activeTab.content);
      updateSqlTabContent(activeTab.id, optimized);
      setWorkspaceTabs((current) =>
        current.map((tab) =>
          tab.id === activeTab.id && tab.kind === "sql"
            ? { ...tab, status: "Optimized" }
            : tab,
        ),
      );
    } else {
      const firstSqlCell = activeTab.cells.find((cell) => cell.kind === "sql");
      if (firstSqlCell) {
        updateNotebookCell(
          activeTab.id,
          firstSqlCell.id,
          formatSql(firstSqlCell.content),
        );
      }
    }

    setRightPanelOpen(true);
    setBottomPanelOpen(true);
    setActivePanelTab("insights");
    setActiveActivity("ai");
    setAiStatusLabel("Optimization ready");
    setActivityMessage(`Optimization draft prepared for ${activeTab.title}.`);
    appendAssistantMessage({
      role: "assistant",
      title: "Optimizer",
      body: "SQL formatting was applied to the active script. Next, run EXPLAIN on a real connection and verify indexes on WHERE, JOIN, and ORDER BY columns.",
    });
  };

  const handleExplainPlan = async () => {
    if (!activeSql.trim()) {
      setExecutionProblems([
        "Write a SQL statement before opening an execution plan.",
      ]);
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      return;
    }

    const connection = await ensureConnected();
    if (!connection) {
      return;
    }

    const explainQuery = buildExplainQuery(connection, activeSql);
    if (!explainQuery) {
      const message = `Explain plans are not configured for ${connection.type} connections yet.`;
      setExecutionProblems([message]);
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      setActivityMessage(message);
      return;
    }

    setIsExecuting(true);
    setSplitView(true);
    setBottomPanelOpen(true);
    setActivePanelTab("insights");
    setActiveActivity("runner");

    try {
      const result = await api.executeQuery(connection, explainQuery);
      setQueryResult(result);
      setQueryRuntimeMs(result.executionTime);
      setExecutionPlanLines(
        result.status === "success"
          ? result.rows.slice(0, 12).map((row) =>
              Object.values(row)
                .map((value) => getCellDisplayValue(value))
                .join(" | "),
            )
          : [result.message || "Failed to retrieve an execution plan."],
      );
      setExecutionProblems(
        result.status === "error"
          ? [result.message || "Failed to retrieve an execution plan."]
          : [],
      );
      setAiStatusLabel(
        result.status === "success"
          ? "Execution plan ready"
          : "Execution failed",
      );
      setActivityMessage(`Execution plan opened for ${activeTab.title}.`);
      appendLog(
        `09:19:${String((logEntries.length + 1) % 60).padStart(2, "0")} Opened explain plan for ${activeTab.title}`,
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConnectDatabase = () => {
    setActiveActivity("settings");
    setLeftPanelOpen(true);
    openConnectionDialog();
    setActivityMessage(
      "Open the real connection dialog to add, test, and save a database connection.",
    );
    appendLog(
      "09:20:12 Opened the connection dialog for a live database session",
    );
    appendAssistantMessage({
      role: "assistant",
      title: "Connection Manager",
      body: "Use the connection dialog to test credentials and save a real database profile for Analyst OS.",
    });
  };

  const handleExplorerSelection = async (section: string, item: string) => {
    setSelectedExplorerItem(item);
    setLeftPanelOpen(true);

    if (section === "Workspace") {
      openWorkspaceTab(item);
      return;
    }

    if (section === "Connections") {
      if (item === "Add connection") {
        handleConnectDatabase();
        return;
      }

      const selectedConnection = connections.find(
        (connection) => connection.name === item,
      );
      if (!selectedConnection) {
        return;
      }

      setActiveConnection(selectedConnection.id);
      if (selectedConnection.status !== "connected") {
        await connectConnection(selectedConnection.id);
      }

      setActiveActivity("explorer");
      setActivityMessage(`Focused connection ${selectedConnection.name}.`);
      appendLog(
        `09:20:${String((logEntries.length + 1) % 60).padStart(2, "0")} Switched active connection to ${selectedConnection.name}`,
      );
      return;
    }

    if (
      item === "Loading database objects..." ||
      item === "No tables discovered"
    ) {
      return;
    }

    if (item === "Connect a database to browse tables") {
      handleConnectDatabase();
      return;
    }

    const matchingTab = workspaceTabs.find(
      (tab) => tab.kind === "sql" && tab.content.includes(`FROM ${item}`),
    );
    if (matchingTab) {
      openWorkspaceTab(matchingTab.title);
    } else {
      const nextTab: SqlWorkspaceTab = {
        id: createId("query"),
        kind: "sql",
        title: `${item.split(".").pop() || "table"}.sql`,
        dialect: activeConnection?.type === "mysql" ? "MySQL" : "SQL",
        status: "Draft",
        content: `SELECT\n  *\nFROM ${item}\nLIMIT 100;`,
      };

      setWorkspaceTabs((current) => [...current, nextTab]);
      setActiveTabId(nextTab.id);
      setSelectedExplorerItem(nextTab.title);
    }

    setActiveActivity("tables");
    setBottomPanelOpen(true);
    setActivePanelTab("results");
    setActivityMessage(`Opened ${item} in the query editor.`);
  };

  const handleSuggestedAction = (action: string) => {
    if (action === "Generate SQL from plain English") {
      setRightPanelOpen(true);
      setActiveActivity("ai");
      setAssistantPrompt(
        "Generate SQL to show weekly learner retention by campus.",
      );
      setActivityMessage("AI copilot is ready for SQL generation.");
      return;
    }

    if (action === "Fix migration type mismatches") {
      setActiveActivity("migrations");
      setBottomPanelOpen(true);
      setActivePanelTab("problems");
      setActivityMessage(
        "Migration review opened with type warnings and fixes.",
      );
      return;
    }

    handleExplainPlan();
  };

  const handlePaletteCommand = (command: PaletteCommand) => {
    setPaletteOpen(false);

    if (command === "Create SQL query") {
      createQueryTab();
      return;
    }

    if (command === "Create notebook") {
      createNotebookTab();
      return;
    }

    if (command === "Connect to PostgreSQL warehouse") {
      handleConnectDatabase();
      return;
    }

    if (command === "Generate SQL from natural language") {
      setRightPanelOpen(true);
      setActiveActivity("ai");
      setAssistantPrompt(
        "Generate SQL to show new learners by month and campus.",
      );
      setActivityMessage("AI copilot is ready to generate SQL from a prompt.");
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

    setActiveActivity("viz");
    setSplitView(true);
    setBottomPanelOpen(true);
    setActivePanelTab("insights");
    setActivityMessage(
      "Visualization preview focused on the retention heatmap.",
    );
  };

  const handleSendAssistantPrompt = () => {
    const prompt = assistantPrompt.trim();
    if (!prompt) {
      return;
    }

    appendAssistantMessage({
      role: "user",
      title: "You",
      body: prompt,
    });
    appendAssistantMessage({
      role: "assistant",
      title: "Database Copilot",
      body: buildAiResponse(prompt, activeSql, activeTab.title),
    });
    setAssistantPrompt("");
    setRightPanelOpen(true);
    setActiveActivity("ai");
  };

  const renderSidebarBody = () => {
    if (activeActivity === "migrations") {
      return (
        <div className="space-y-3">
          {migrationChecklist.map((item) => (
            <div
              key={item}
              className={`rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-3 text-[12px] ${explorerTextClass}`}
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
          {chartModel ? (
            <>
              <div
                className={`rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-3`}
              >
                <div className={`text-sm font-medium ${explorerTextClass}`}>
                  Active chart mapping
                </div>
                <div
                  className={`mt-1 text-[12px] leading-5 ${explorerMutedTextClass}`}
                >
                  Labels from {chartModel.labelColumn}, values from{" "}
                  {chartModel.numericColumn}.
                </div>
              </div>
              <div
                className={`rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-3 text-[12px] ${explorerTextClass}`}
              >
                {insightMessage}
              </div>
            </>
          ) : (
            visualizationCards.map((card) => (
              <div
                key={card.title}
                className={`rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-3`}
              >
                <div className={`text-sm font-medium ${explorerTextClass}`}>
                  {card.title}
                </div>
                <div
                  className={`mt-1 text-[12px] leading-5 ${explorerMutedTextClass}`}
                >
                  {card.detail}
                </div>
              </div>
            ))
          )}
        </div>
      );
    }

    if (activeActivity === "notebook") {
      return (
        <div className="space-y-3">
          {notebookHighlights.map((item) => (
            <div
              key={item}
              className={`rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-3 text-[12px] ${explorerTextClass}`}
            >
              {item}
            </div>
          ))}
          <button
            onClick={createNotebookTab}
            className={`${primaryButtonClass} w-full`}
          >
            <Plus className="mr-2 inline h-3.5 w-3.5" />
            Create Notebook
          </button>
        </div>
      );
    }

    if (activeActivity === "settings") {
      return (
        <div className="space-y-3">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className={`flex items-center justify-between rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-3`}
            >
              <span className={`text-[12px] ${explorerTextClass}`}>
                {formatConnectionLabel(connection)}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${explorerStatusBadgeClass}`}
              >
                {connection.status}
              </span>
            </div>
          ))}
          {connections.length === 0
            ? platformBadges.map((badge) => (
                <div
                  key={badge}
                  className={`flex items-center justify-between rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-3`}
                >
                  <span className={`text-[12px] ${explorerTextClass}`}>
                    {badge}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${explorerStatusBadgeClass}`}
                  >
                    supported
                  </span>
                </div>
              ))
            : null}
          <button
            onClick={handleConnectDatabase}
            className={`${primaryButtonClass} w-full`}
          >
            <Database className="mr-2 inline h-3.5 w-3.5" />
            Add Connection
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {explorerSections.map((section) => (
          <div key={section.title}>
            <div
              className={`mb-2 text-[10px] uppercase tracking-[0.22em] ${explorerDimTextClass}`}
            >
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <button
                  key={`${section.title}-${item}`}
                  onClick={() => {
                    void handleExplorerSelection(section.title, item);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] ${explorerTextClass} transition ${isDark ? "hover:bg-white/10 hover:text-white" : "hover:bg-[var(--analyst-subtle)] hover:text-[color:var(--analyst-text)]"}`}
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 ${explorerDimTextClass}`}
                  />
                  <span className="truncate">{item}</span>
                  {selectedExplorerItem === item ? (
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${explorerActiveBadgeClass}`}
                    >
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
      const problems = executionProblems.length
        ? executionProblems
        : [
            "No live issues detected. Run a query or connect a database to populate this panel.",
          ];

      return (
        <div className={`space-y-3 p-4 text-[12px] ${textStrongClass}`}>
          {problems.map((problem, index) => (
            <div
              key={`${index}-${problem}`}
              className={[
                "rounded-xl px-3 py-3",
                executionProblems.length === 0 || index === 0
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
      const insightCards = executionPlanLines.length
        ? executionPlanLines
        : [
            activeConnection
              ? `Active connection: ${formatConnectionLabel(activeConnection)}`
              : "No active connection selected",
            queryRuntimeMs
              ? `Last runtime: ${queryRuntimeMs} ms`
              : "No live query executed yet",
            insightMessage,
          ];

      return (
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {insightCards.map((line) => (
            <div
              key={line}
              className={`rounded-xl border ${accentBorderClass} ${accentSurfaceClass} px-3 py-3 text-[12px] ${textStrongClass}`}
            >
              {line}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="overflow-auto p-4">
        {isExecuting ? (
          <div
            className={`rounded-xl border ${borderClass} ${subtleSurfaceClass} px-4 py-8 text-center text-sm ${textMutedClass}`}
          >
            Running live query...
          </div>
        ) : !queryResult ? (
          <div
            className={`rounded-xl border ${borderClass} ${subtleSurfaceClass} px-4 py-8 text-center text-sm ${textMutedClass}`}
          >
            Run a query to see live database results here.
          </div>
        ) : queryResult.status === "error" ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-700 dark:text-rose-200">
            {queryResult.message || "The query failed."}
          </div>
        ) : (
          <table
            className={`min-w-full border-separate border-spacing-0 text-left text-[12px] ${textStrongClass}`}
          >
            <thead>
              <tr>
                {queryResult.columns.map((column) => (
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
              {queryResult.rows.map((row, rowIndex) => (
                <tr
                  key={`row-${rowIndex}`}
                  className={rowIndex % 2 === 0 ? subtleSurfaceClass : ""}
                >
                  {queryResult.columns.map((column) => (
                    <td
                      key={`cell-${rowIndex}-${column}`}
                      className={`border-b ${borderClass} px-3 py-2 font-mono ${textStrongClass}`}
                    >
                      {getCellDisplayValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const renderEditorSurface = () => {
    if (!activeTab) {
      return null;
    }

    if (activeTab.kind === "dashboard") {
      return (
        <ValstineUsageDashboard
          activityMessage={activityMessage}
          aiStatusLabel={aiStatusLabel}
          connectedLabel={connectedLabel}
          connections={connections}
          logEntries={logEntries}
          onConnectDatabase={handleConnectDatabase}
          onCreateNotebook={createNotebookTab}
          onCreateQuery={createQueryTab}
          queryRuntimeMs={queryRuntimeMs}
          workspaceCount={workspaceTabs.length}
        />
      );
    }

    if (activeTab.kind === "notebook") {
      return (
        <div
          className={`min-h-0 overflow-auto rounded-2xl border ${borderClass} ${wellSurfaceClass} shadow-[0_20px_40px_rgba(0,0,0,0.10)]`}
        >
          <div
            className={`flex items-center justify-between border-b ${borderClass} px-4 py-3 text-[12px] ${textMutedClass}`}
          >
            <span>{activeTab.title}</span>
            <span>{activeTab.cells.length} cells</span>
          </div>
          <div className="space-y-4 p-4">
            {activeTab.cells.map((cell, index) => (
              <div
                key={cell.id}
                className={`rounded-2xl border ${borderClass} ${editorSurfaceClass} overflow-hidden`}
              >
                <div
                  className={`flex items-center justify-between border-b ${borderClass} px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${textMutedClass}`}
                >
                  <span>
                    {cell.kind === "markdown"
                      ? `Markdown ${index + 1}`
                      : `SQL Cell ${index + 1}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {cell.kind === "sql" ? (
                      <button
                        onClick={() => handleRunNotebookCell(cell.id)}
                        className={`rounded-md border ${accentBorderClass} ${accentSurfaceClass} px-2 py-1 ${accentTextClass}`}
                      >
                        Run
                      </button>
                    ) : null}
                    {activeTab.cells.length > 1 ? (
                      <button
                        onClick={() => removeNotebookCell(cell.id)}
                        className={`rounded-md border ${borderClass} ${subtleSurfaceClass} px-2 py-1 ${textMutedClass}`}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                {cell.kind === "markdown" ? (
                  <textarea
                    value={cell.content}
                    onChange={(event) =>
                      updateNotebookCell(
                        activeTab.id,
                        cell.id,
                        event.target.value,
                      )
                    }
                    className={`min-h-[140px] w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-6 outline-none ${textStrongClass}`}
                  />
                ) : (
                  <textarea
                    value={cell.content}
                    onChange={(event) =>
                      updateNotebookCell(
                        activeTab.id,
                        cell.id,
                        event.target.value,
                      )
                    }
                    className={`min-h-[180px] w-full resize-y border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-6 outline-none ${textStrongClass}`}
                    spellCheck={false}
                  />
                )}
                {cell.output?.length ? (
                  <div
                    className={`border-t ${borderClass} px-4 py-3 font-mono text-[12px] ${textMutedClass}`}
                  >
                    {cell.output.map((line) => (
                      <div key={`${cell.id}-${line}`}>{line}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`min-h-0 overflow-hidden rounded-2xl border ${borderClass} ${wellSurfaceClass} shadow-[0_20px_40px_rgba(0,0,0,0.10)]`}
      >
        <div
          className={`flex items-center justify-between border-b ${borderClass} px-4 py-3 text-[12px] ${textMutedClass}`}
        >
          <span>{activeTab.title}</span>
          <span>{countLines(activeTab.content)} lines</span>
        </div>
        <div className="h-[calc(100%-45px)] min-h-[340px]">
          <Editor
            language="sql"
            theme={isDark ? "analystos-dark" : "analystos-light"}
            value={activeTab.content}
            beforeMount={beforeMount}
            onChange={(value) => updateSqlTabContent(activeTab.id, value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "JetBrains Mono, monospace",
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              padding: { top: 14 },
              bracketPairColorization: { enabled: true },
            }}
          />
        </div>
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
          className={`flex min-h-14 flex-wrap items-center justify-between gap-3 border-b ${borderClass} ${toolbarSurfaceClass} px-4 py-3`}
        >
          <div className="flex min-w-[260px] flex-1 items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentSurfaceClass} ${accentTextClass}`}
            >
              <Database className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div
                className={`text-[11px] uppercase tracking-[0.24em] ${accentTextClass}`}
              >
                Valstine Analyst OS
              </div>
              <div className={`text-sm font-medium ${textStrongClass}`}>
                Database operating system for analysis, AI, notebooks, and
                migrations
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
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
            <button onClick={createQueryTab} className={ghostButtonClass}>
              New Query
            </button>
            <button onClick={createNotebookTab} className={ghostButtonClass}>
              New Notebook
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
              className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} p-2 ${textMutedClass} transition hover:border-[color:var(--analyst-accent-border)] hover:text-[color:var(--analyst-text)]`}
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
              className={primaryButtonClass}
            >
              Connect Database
            </button>
          </div>
        </header>

        <div
          className={`grid grid-cols-3 gap-3 border-b ${brandBorderClass} ${brandSurfaceClass} px-4 py-3`}
        >
          {statusCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-xl border ${brandBorderClass} ${brandElevatedSurfaceClass} px-3 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.18)]`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] uppercase tracking-[0.22em] ${brandDimTextClass}`}
                >
                  {card.label}
                </span>
                <card.icon className={`h-4 w-4 ${brandMutedTextClass}`} />
              </div>
              <div className={`mt-2 text-sm font-medium ${brandTextClass}`}>
                {card.label === "Connected"
                  ? connectedCount
                  : card.label === "AI Assist"
                    ? aiStatusLabel
                    : projectStatusLabel}
              </div>
              <div className={`mt-1 text-[11px] ${brandMutedTextClass}`}>
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
            className={`flex w-[58px] shrink-0 flex-col items-center border-r ${explorerBorderClass} ${explorerRailSurfaceClass} py-3`}
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
                    active ? railActiveClass : railIdleClass,
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
                  className={`flex h-full min-w-0 flex-col overflow-hidden border-r ${explorerBorderClass} ${explorerSurfaceClass}`}
                >
                  <div className={`border-b ${explorerBorderClass} px-4 py-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div
                          className={`text-[10px] uppercase tracking-[0.24em] ${explorerDimTextClass}`}
                        >
                          {sidebarMeta.eyebrow}
                        </div>
                        <div
                          className={`mt-2 text-lg font-semibold ${explorerTextClass}`}
                        >
                          {sidebarMeta.heading}
                        </div>
                        <div
                          className={`mt-1 text-[12px] leading-5 ${explorerMutedTextClass}`}
                        >
                          {sidebarMeta.summary}
                        </div>
                      </div>
                      <button
                        onClick={() => setLeftPanelOpen(false)}
                        className={`rounded-lg border ${explorerBorderClass} ${explorerElevatedSurfaceClass} p-2 ${explorerMutedTextClass} transition ${isDark ? "hover:border-white/25 hover:text-white" : "hover:border-[color:var(--analyst-accent-border)] hover:text-[color:var(--analyst-text)]"}`}
                        aria-label="Close explorer panel"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>
                    <div
                      onClick={() => setPaletteOpen(true)}
                      className={`mt-4 flex cursor-pointer items-center gap-2 rounded-xl border ${explorerBorderClass} ${explorerElevatedSurfaceClass} px-3 py-2 ${explorerMutedTextClass}`}
                    >
                      <Search className="h-4 w-4" />
                      <span className="text-[12px]">
                        Search tables, files, notebooks, and commands...
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
                        {workspaceTabs.map((tab) => {
                          const active = tab.id === activeTabId;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => openWorkspaceTab(tab.title)}
                              className={[
                                "mr-1 min-w-[220px] rounded-t-xl border px-3 py-2 text-left transition",
                                active
                                  ? `${borderClass} ${activeSurfaceClass} ${textStrongClass}`
                                  : `border-transparent bg-transparent ${textDimClass} hover:bg-[var(--analyst-subtle)] hover:text-[color:var(--analyst-text)]`,
                              ].join(" ")}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-[12px] font-medium">
                                    {tab.title}
                                  </div>
                                  <div
                                    className={`mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] ${textDimClass}`}
                                  >
                                    <span>{tab.dialect}</span>
                                    <span>{tab.status}</span>
                                  </div>
                                </div>
                                <span
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeWorkspaceTab(tab.id);
                                  }}
                                  className={`rounded-md p-1 ${textDimClass} hover:bg-[var(--analyst-subtle)] hover:text-[color:var(--analyst-text)]`}
                                  aria-label={`Close ${tab.title}`}
                                  role="button"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </span>
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
                          {activeTab.kind === "dashboard" ? (
                            <>
                              <button
                                onClick={createQueryTab}
                                className={primaryButtonClass}
                              >
                                <Play className="mr-2 inline h-3.5 w-3.5" />
                                New Query
                              </button>
                              <button
                                onClick={createNotebookTab}
                                className={ghostButtonClass}
                              >
                                <Plus className="mr-2 inline h-3.5 w-3.5" />
                                New Notebook
                              </button>
                              <button
                                onClick={handleConnectDatabase}
                                className={ghostButtonClass}
                              >
                                <Database className="mr-2 inline h-3.5 w-3.5" />
                                Connect Database
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={handleRunQuery}
                                className={primaryButtonClass}
                              >
                                <Play className="mr-2 inline h-3.5 w-3.5" />
                                {activeTab.kind === "notebook"
                                  ? "Run Notebook"
                                  : "Run Query"}
                              </button>
                              <button
                                onClick={handleOptimizeQuery}
                                className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 transition hover:border-[color:var(--analyst-accent-border)] hover:text-[color:var(--analyst-text)]`}
                              >
                                <WandSparkles className="mr-2 inline h-3.5 w-3.5" />
                                Optimize
                              </button>
                              <button
                                onClick={handleExplainPlan}
                                className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 transition hover:border-[color:var(--analyst-accent-border)] hover:text-[color:var(--analyst-text)]`}
                              >
                                <PanelsTopLeft className="mr-2 inline h-3.5 w-3.5" />
                                Explain Plan
                              </button>
                              {activeTab.kind === "notebook" ? (
                                <>
                                  <button
                                    onClick={() => addNotebookCell("markdown")}
                                    className={ghostButtonClass}
                                  >
                                    <Plus className="mr-2 inline h-3.5 w-3.5" />
                                    Markdown Cell
                                  </button>
                                  <button
                                    onClick={() => addNotebookCell("sql")}
                                    className={ghostButtonClass}
                                  >
                                    <Plus className="mr-2 inline h-3.5 w-3.5" />
                                    SQL Cell
                                  </button>
                                </>
                              ) : null}
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSplitView((value) => !value)}
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-[12px] ${textStrongClass} transition hover:border-[color:var(--analyst-accent-border)]`}
                          >
                            <SplitSquareVertical className="mr-2 inline h-3.5 w-3.5" />
                            {splitView ? "Single View" : "Split View"}
                          </button>
                          <button
                            onClick={() => setPaletteOpen(true)}
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-[12px] ${textStrongClass} transition hover:border-[color:var(--analyst-accent-border)]`}
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
                      {renderEditorSurface()}

                      {splitView ? (
                        <div className="grid min-h-0 gap-4 lg:grid-rows-[1fr_1fr]">
                          <div
                            className={`overflow-auto rounded-2xl border ${accentBorderClass} ${accentSurfaceClass} p-4`}
                          >
                            <div
                              className={`text-[10px] uppercase tracking-[0.24em] ${accentTextClass}`}
                            >
                              Execution Plan
                            </div>
                            <div className="mt-3 space-y-3">
                              {(executionPlanLines.length
                                ? executionPlanLines
                                : [
                                    "Run EXPLAIN on a live query to inspect the current execution plan.",
                                  ]
                              ).map((item) => (
                                <div
                                  key={item}
                                  className={`rounded-xl border ${borderClass} ${editorSurfaceClass} px-3 py-3 text-[12px] ${textStrongClass}`}
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div
                            className={`overflow-auto rounded-2xl border ${accentBorderClass} ${accentSurfaceClass} p-4`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div
                                  className={`text-[10px] uppercase tracking-[0.24em] ${accentTextClass}`}
                                >
                                  Visualization Builder
                                </div>
                                <div
                                  className={`mt-2 text-sm font-medium ${textStrongClass}`}
                                >
                                  Result Preview
                                </div>
                              </div>
                              <Download className={`h-4 w-4 ${textDimClass}`} />
                            </div>
                            {chartModel ? (
                              <div className="mt-4 space-y-3">
                                {chartModel.points.map((point) => (
                                  <div key={`${point.label}-${point.value}`}>
                                    <div
                                      className={`mb-1 flex items-center justify-between text-[11px] ${textMutedClass}`}
                                    >
                                      <span className="truncate pr-3">
                                        {point.label}
                                      </span>
                                      <span>{point.value}</span>
                                    </div>
                                    <div
                                      className={`h-2 overflow-hidden rounded-full ${editorSurfaceClass}`}
                                    >
                                      <div
                                        className="h-full rounded-full"
                                        style={{
                                          width: `${Math.max((point.value / chartModel.maxValue) * 100, 6)}%`,
                                          backgroundColor: isDark
                                            ? "#78A8FF"
                                            : "#1F4F7E",
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div
                                className={`mt-4 rounded-xl border ${borderClass} ${editorSurfaceClass} px-4 py-8 text-center text-sm ${textMutedClass}`}
                              >
                                Run a live query that returns at least one
                                numeric column to build a chart here.
                              </div>
                            )}
                            <div
                              className={`mt-4 text-[12px] leading-5 ${textMutedClass}`}
                            >
                              {insightMessage}
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
                                  ? `${accentSurfaceClass} ${accentTextClass}`
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
                            className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} p-2 transition hover:border-[color:var(--analyst-accent-border)] hover:text-[color:var(--analyst-text)]`}
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
                        <div
                          className={`text-[10px] uppercase tracking-[0.24em] ${accentTextClass}`}
                        >
                          <ConnectionDialog />
                          AI Assistant
                        </div>
                        <div
                          className={`mt-2 text-lg font-semibold ${textStrongClass}`}
                        >
                          Real database copilot
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sparkles className={`h-4 w-4 ${accentTextClass}`} />
                        <button
                          onClick={() => setRightPanelOpen(false)}
                          className={`rounded-lg border ${borderClass} ${subtleSurfaceClass} p-2 ${textMutedClass} transition hover:border-[color:var(--analyst-accent-border)] hover:text-[color:var(--analyst-text)]`}
                          aria-label="Close assistant panel"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div
                      className={`mt-2 text-[12px] leading-5 ${textMutedClass}`}
                    >
                      Prompt against the active editor or notebook state for
                      explanations, SQL drafts, and optimization guidance.
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
                    {assistantFeed.map((message, index) => (
                      <div
                        key={`${message.role}-${index}-${message.title}`}
                        className={[
                          "rounded-2xl border px-3 py-3",
                          message.role === "assistant"
                            ? `${accentBorderClass} ${accentSurfaceClass}`
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
                        <Bell className={`h-4 w-4 ${accentTextClass}`} />
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
                            className={`w-full rounded-xl border ${borderClass} ${subtleSurfaceClass} px-3 py-2 text-left text-[12px] ${textStrongClass} transition hover:border-[color:var(--analyst-accent-border)]`}
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className={`mt-3 rounded-2xl border ${borderClass} ${editorSurfaceClass} p-3`}
                    >
                      <textarea
                        value={assistantPrompt}
                        onChange={(event) =>
                          setAssistantPrompt(event.target.value)
                        }
                        placeholder="Ask about the active query, notebook, or result set"
                        className={`min-h-[88px] w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none ${textStrongClass}`}
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={handleSendAssistantPrompt}
                          className={primaryButtonClass}
                        >
                          Send Prompt
                        </button>
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
        <div
          className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-20 backdrop-blur-sm"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className={`w-full max-w-2xl rounded-2xl border ${borderClass} ${modalSurfaceClass} shadow-[0_25px_80px_rgba(0,0,0,0.18)]`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`flex items-center gap-3 border-b ${borderClass} px-4 py-4 ${textMutedClass}`}
            >
              <Search className="h-4 w-4" />
              <span className="text-sm">
                Create tabs, notebooks, connections, and visualizations from the
                command palette
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
