import {
  Bot,
  ChartColumnBig,
  Database,
  DatabaseZap,
  FileCode2,
  FolderKanban,
  NotebookTabs,
  PanelsTopLeft,
  PlayCircle,
  Settings2,
  TableProperties,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type AnalystActivityId =
  | "explorer"
  | "sql"
  | "runner"
  | "tables"
  | "ai"
  | "viz"
  | "migrations"
  | "notebook"
  | "settings";

export interface AnalystActivityItem {
  id: AnalystActivityId;
  label: string;
  icon: LucideIcon;
}

export interface AnalystTab {
  id: string;
  title: string;
  dialect: string;
  status: string;
  query: string[];
}

export const analystActivities: AnalystActivityItem[] = [
  { id: "explorer", label: "Explorer", icon: PanelsTopLeft },
  { id: "sql", label: "SQL Editor", icon: FileCode2 },
  { id: "runner", label: "Query Runner", icon: PlayCircle },
  { id: "tables", label: "Data Tables", icon: TableProperties },
  { id: "ai", label: "AI Assistant", icon: Bot },
  { id: "viz", label: "Visualizations", icon: ChartColumnBig },
  { id: "migrations", label: "Migrations", icon: Waypoints },
  { id: "notebook", label: "Notebook", icon: NotebookTabs },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export const analystTabs: AnalystTab[] = [
  {
    id: "cohort-retention",
    title: "cohort_retention.sql",
    dialect: "PostgreSQL",
    status: "Ready",
    query: [
      "WITH student_sessions AS (",
      "  SELECT",
      "    cohort_month,",
      "    DATE_TRUNC('month', session_started_at) AS active_month,",
      "    COUNT(DISTINCT learner_id) AS active_learners",
      "  FROM analytics.student_sessions",
      "  WHERE campus_id = 'north-hub'",
      "  GROUP BY 1, 2",
      "),",
      "cohort_sizes AS (",
      "  SELECT cohort_month, MAX(active_learners) AS cohort_size",
      "  FROM student_sessions",
      "  GROUP BY 1",
      ")",
      "SELECT",
      "  s.cohort_month,",
      "  s.active_month,",
      "  ROUND(100.0 * s.active_learners / c.cohort_size, 1) AS retention_pct",
      "FROM student_sessions s",
      "JOIN cohort_sizes c USING (cohort_month)",
      "ORDER BY s.cohort_month, s.active_month;",
    ],
  },
  {
    id: "revenue-pulse",
    title: "revenue_pulse.sql",
    dialect: "MySQL",
    status: "AI optimized",
    query: [
      "SELECT",
      "  DATE_FORMAT(invoice_date, '%Y-%m') AS invoice_month,",
      "  region,",
      "  SUM(total_amount) AS revenue,",
      "  AVG(total_amount) AS avg_invoice_value",
      "FROM finance.invoices",
      "WHERE invoice_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)",
      "GROUP BY 1, 2",
      "ORDER BY invoice_month DESC, revenue DESC;",
    ],
  },
  {
    id: "supply-anomalies",
    title: "supply_anomalies.sql",
    dialect: "SQLite",
    status: "Needs review",
    query: [
      "SELECT",
      "  warehouse_id,",
      "  sku,",
      "  COUNT(*) AS anomaly_events,",
      "  MAX(event_at) AS last_event_at",
      "FROM inventory_anomalies",
      "WHERE severity IN ('high', 'critical')",
      "GROUP BY warehouse_id, sku",
      "HAVING COUNT(*) >= 3",
      "ORDER BY anomaly_events DESC;",
    ],
  },
];

export const explorerTree = [
  {
    title: "Workspace",
    items: [
      "analytics/cohorts.ipynb",
      "queries/revenue_pulse.sql",
      "migrations/load_students.csv",
      "charts/retention_heatmap.viz",
    ],
  },
  {
    title: "Connections",
    items: [
      "postgres://campus-warehouse",
      "mysql://sales-mirror",
      "sqlite://local-notes.db",
    ],
  },
  {
    title: "Schemas",
    items: [
      "analytics.fact_sessions",
      "analytics.dim_students",
      "finance.invoices",
      "ops.inventory_anomalies",
    ],
  },
];

export const resultColumns = [
  "cohort_month",
  "active_month",
  "retention_pct",
  "active_learners",
  "cohort_size",
];

export const resultRows = [
  ["2025-11-01", "2025-11-01", "100.0%", "782", "782"],
  ["2025-11-01", "2025-12-01", "74.8%", "585", "782"],
  ["2025-11-01", "2026-01-01", "63.4%", "496", "782"],
  ["2025-12-01", "2025-12-01", "100.0%", "814", "814"],
  ["2025-12-01", "2026-01-01", "71.5%", "582", "814"],
];

export const executionPlan = [
  "Hash Join on cohort_sizes using cohort_month",
  "GroupAggregate on student_sessions",
  "Bitmap Index Scan on idx_sessions_campus_started_at",
  "Cost: 12.4k | Buffers hit: 91% | Runtime: 42 ms",
];

export const assistantMessages = [
  {
    role: "assistant",
    title: "Database Copilot",
    body: "I rewrote the retention query to pre-aggregate by month. Estimated runtime dropped from 118 ms to 42 ms.",
  },
  {
    role: "user",
    title: "You",
    body: "Explain why month two retention dipped for north-hub learners.",
  },
  {
    role: "assistant",
    title: "Database Copilot",
    body: "The sharpest drop aligns with late assignment submission spikes. I recommend joining course_activity and filtering by support cohort before charting.",
  },
];

export const migrationChecklist = [
  "Auto-detect CSV schema for semester_enrollment_2026.csv",
  "Normalize grade columns and suggest nullable fixes",
  "Generate PostgreSQL and MySQL migration scripts",
  "Preview 250 sample rows before loading",
];

export const visualizationCards = [
  {
    title: "Retention Heatmap",
    detail: "Auto-generated from the last query with cohort and month buckets.",
  },
  {
    title: "Revenue Pulse",
    detail: "Line chart with anomaly bands and AI-generated commentary.",
  },
  {
    title: "Warehouse Risk",
    detail: "Scatter plot of anomaly frequency vs. fulfillment delay.",
  },
];

export const notebookHighlights = [
  "Markdown + SQL cells in one workspace",
  "Inline chart outputs beside query blocks",
  "Reusable data prep snippets for students and analysts",
];

export const platformBadges = ["macOS native", "Windows native", "Linux native"];

export const statusCards = [
  {
    label: "Connected",
    value: "3 engines",
    icon: Database,
  },
  {
    label: "AI Assist",
    value: "Live suggestions",
    icon: DatabaseZap,
  },
  {
    label: "Projects",
    value: "12 active",
    icon: FolderKanban,
  },
];