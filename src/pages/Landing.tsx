import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Apple,
  ArrowRight,
  Bot,
  Command,
  Database,
  Download,
  GitBranch,
  GitPullRequest,
  Globe,
  Laptop,
  Layers3,
  Moon,
  PanelsTopLeft,
  PlayCircle,
  Shield,
  Sparkles,
  SplitSquareVertical,
  Sun,
  TableProperties,
  TerminalSquare,
  Waypoints,
  Workflow,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

function detectPlatform(): "mac" | "windows" | "linux" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

const products = [
  {
    id: "studio",
    badge: "Operational workspace",
    title: "Valstine Studio",
    summary:
      "For shipping database changes with confidence: query editing, schema comparison, Git-aware workflows, connections, and production-minded tooling.",
    accent: "from-[#214c91]/22 via-[#4d79bf]/10 to-transparent",
    border: "border-[#214c91]/20",
    cta: "Open Studio",
    points: [
      "Query editor, results, terminal, and database explorer in one workspace",
      "Schema diff, migration workflows, and connection management",
      "Built for engineers and operators maintaining live databases",
    ],
  },
  {
    id: "analyst",
    badge: "Analytical workspace",
    title: "Valstine Analyst OS",
    summary:
      "For exploring and explaining data with SQL, notebooks, visualizations, migrations, and an in-context database copilot.",
    accent: "from-[#315ea8]/22 via-[#7aa1e4]/12 to-transparent",
    border: "border-[#315ea8]/20",
    cta: "Launch Analyst OS",
    points: [
      "Notebook-style analysis, charts, and table previews with a developer feel",
      "AI that writes SQL, explains plans, and guides imports and fixes",
      "Built for students, analysts, and teams investigating live data",
    ],
  },
] as const;

const productPillars = [
  {
    icon: Workflow,
    title: "Two focused products",
    description:
      "Studio and Analyst OS share the platform but stay visually and operationally distinct so users know which workflow they are entering.",
  },
  {
    icon: Shield,
    title: "Production and exploration",
    description:
      "Studio serves operational database work, while Analyst OS serves discovery, reporting, and data storytelling.",
  },
  {
    icon: Globe,
    title: "Cross-platform delivery",
    description:
      "macOS, Windows, Linux, and browser entry all point back to the same product family and design language.",
  },
] as const;

const platformCards = [
  {
    icon: Apple,
    title: "macOS native",
    body: "Desktop shell with Studio and Analyst OS side by side, optimized for keyboard-first workflows and native packaging.",
  },
  {
    icon: Laptop,
    title: "Windows and Linux",
    body: "One install surface for engineers, analysts, and classrooms without losing the desktop product identity.",
  },
  {
    icon: Globe,
    title: "Web entry",
    body: "Landing and browser-based access let users understand the product split before they commit to a workflow.",
  },
] as const;

function StudioPreview({
  borderClass,
  isDark,
}: {
  borderClass: string;
  isDark: boolean;
}) {
  const palette = isDark
    ? {
        frame: "#0a1324",
        topbar: "#0c1830",
        canvas: "#09111f",
        rail: "#07101d",
        sidebar: "#0b1526",
        surface: "#0a1324",
        elevated: "#12203a",
        mutedPanel: "#10203b",
        active: "#17335f",
        activeSoft: "#11213d",
        border: "rgba(255,255,255,0.10)",
        strongBorder: "rgba(78,121,199,0.30)",
        text: "#dbe7f8",
        title: "#ffffff",
        muted: "#9fb3d1",
        subtle: "#7389ab",
        line: "#5e7393",
        accent: "#8cb2f1",
        accentText: "#d7e6ff",
      }
    : {
        frame: "#f7fbff",
        topbar: "#edf4ff",
        canvas: "#f5f9ff",
        rail: "#eaf1fb",
        sidebar: "#f3f7ff",
        surface: "#f8fbff",
        elevated: "#ffffff",
        mutedPanel: "#edf4ff",
        active: "#d7e6fb",
        activeSoft: "#e7f0fc",
        border: "rgba(22,58,102,0.10)",
        strongBorder: "rgba(33,76,145,0.20)",
        text: "#183b65",
        title: "#16365f",
        muted: "#4f739d",
        subtle: "#7190b4",
        line: "#8ca5c4",
        accent: "#315ea8",
        accentText: "#1c4174",
      };

  return (
    <div
      className={`overflow-hidden rounded-[26px] border ${borderClass}`}
      style={{ backgroundColor: palette.frame }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ backgroundColor: palette.topbar, borderColor: palette.border }}
      >
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: palette.accent }}
          >
            Studio Preview
          </div>
          <div
            className="mt-1 text-sm font-semibold"
            style={{ color: palette.title }}
          >
            Query, schema diff, and Git workflow
          </div>
        </div>
        <div
          className="rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
          style={{
            borderColor: palette.strongBorder,
            backgroundColor: palette.active,
            color: palette.accentText,
          }}
        >
          Production flow
        </div>
      </div>

      <div
        className="grid min-h-[360px] grid-cols-[56px_200px_minmax(0,1fr)]"
        style={{ backgroundColor: palette.canvas }}
      >
        <div
          className="border-r p-2"
          style={{ backgroundColor: palette.rail, borderColor: palette.border }}
        >
          {[
            Database,
            PanelsTopLeft,
            GitBranch,
            TerminalSquare,
            SplitSquareVertical,
          ].map((Icon, index) => (
            <div
              key={index}
              className={[
                "mb-2 flex h-10 w-10 items-center justify-center rounded-xl border",
              ].join(" ")}
              style={
                index === 1
                  ? {
                      borderColor: palette.strongBorder,
                      backgroundColor: palette.active,
                      color: palette.accentText,
                    }
                  : { borderColor: "transparent", color: palette.subtle }
              }
            >
              <Icon className="h-4 w-4" />
            </div>
          ))}
        </div>

        <div
          className="border-r p-4"
          style={{
            backgroundColor: palette.sidebar,
            borderColor: palette.border,
          }}
        >
          <div
            className="rounded-xl border px-3 py-2 text-[12px]"
            style={{
              borderColor: palette.border,
              backgroundColor: palette.elevated,
              color: palette.muted,
            }}
          >
            Search connections, tables, diffs...
          </div>
          <div
            className="mt-4 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: palette.subtle }}
          >
            Explorer
          </div>
          <div
            className="mt-3 space-y-2 text-[12px]"
            style={{ color: palette.text }}
          >
            <div
              className="rounded-lg px-3 py-2"
              style={{ backgroundColor: palette.active }}
            >
              prod.users
            </div>
            <div className="rounded-lg px-3 py-2">prod.orders</div>
            <div className="rounded-lg px-3 py-2">stage.users</div>
            <div className="rounded-lg px-3 py-2">stage.orders</div>
          </div>
          <div
            className="mt-5 rounded-xl border p-3 text-[11px]"
            style={{
              borderColor: palette.strongBorder,
              backgroundColor: palette.activeSoft,
              color: palette.accentText,
            }}
          >
            Active compare: <span className="font-semibold">stage → prod</span>
          </div>
        </div>

        <div
          className="grid grid-rows-[auto_minmax(0,1fr)_148px]"
          style={{ backgroundColor: palette.surface }}
        >
          <div className="border-b" style={{ borderColor: palette.border }}>
            <div className="flex items-center gap-2 px-3 pt-3">
              <div
                className="rounded-t-xl border px-3 py-2 text-[12px]"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.elevated,
                  color: palette.title,
                }}
              >
                active_users.sql
              </div>
              <div
                className="rounded-t-xl border px-3 py-2 text-[12px]"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.canvas,
                  color: palette.muted,
                }}
              >
                schema_diff.diff
              </div>
              <div
                className="rounded-t-xl border px-3 py-2 text-[12px]"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.canvas,
                  color: palette.muted,
                }}
              >
                git_panel
              </div>
            </div>
            <div
              className="flex items-center gap-2 border-t px-3 py-3 text-[12px]"
              style={{ borderColor: palette.border, color: palette.muted }}
            >
              <div
                className="rounded-lg border px-3 py-1.5"
                style={{
                  borderColor: palette.strongBorder,
                  backgroundColor: palette.active,
                  color: palette.accentText,
                }}
              >
                Run Query
              </div>
              <div
                className="rounded-lg border px-3 py-1.5"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.elevated,
                }}
              >
                Compare Schema
              </div>
              <div
                className="rounded-lg border px-3 py-1.5"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.elevated,
                }}
              >
                Open PR
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-[1.05fr_0.95fr] gap-3 p-3">
            <div
              className="overflow-hidden rounded-2xl border"
              style={{
                borderColor: palette.border,
                backgroundColor: palette.elevated,
              }}
            >
              <div className="grid grid-cols-[46px_minmax(0,1fr)] font-mono text-[12px] leading-6">
                <div
                  className="border-r px-2 py-3 text-right"
                  style={{
                    borderColor: palette.border,
                    backgroundColor: palette.canvas,
                    color: palette.line,
                  }}
                >
                  <div>1</div>
                  <div>2</div>
                  <div>3</div>
                  <div>4</div>
                  <div>5</div>
                </div>
                <div className="px-4 py-3" style={{ color: palette.text }}>
                  <div>SELECT id, email, full_name</div>
                  <div>FROM prod.users</div>
                  <div>WHERE is_active = true</div>
                  <div>ORDER BY created_at DESC</div>
                  <div>LIMIT 100;</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div
                className="rounded-2xl border p-3 text-[12px]"
                style={{
                  borderColor: palette.strongBorder,
                  backgroundColor: palette.mutedPanel,
                  color: palette.accentText,
                }}
              >
                <div
                  className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: palette.accent }}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                  Schema Diff
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div style={{ color: isDark ? "#8eb5ff" : "#2a5ca7" }}>
                    ~ email varchar(100) → varchar(255)
                  </div>
                  <div className="text-emerald-300">+ audit_log table</div>
                  <div className="text-rose-300">- legacy_ref integer</div>
                </div>
              </div>
              <div
                className="rounded-2xl border p-3 text-[12px]"
                style={{
                  borderColor: palette.strongBorder,
                  backgroundColor: palette.mutedPanel,
                  color: palette.accentText,
                }}
              >
                <div
                  className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: palette.accent }}
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  Git Workflow
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div>Branch: feature/add-audit-log</div>
                  <div>2 commits ahead of origin</div>
                  <div>PR ready after migration review</div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="border-t p-3"
            style={{
              borderColor: palette.border,
              backgroundColor: palette.canvas,
            }}
          >
            <div
              className="mb-2 text-[10px] uppercase tracking-[0.2em]"
              style={{ color: palette.subtle }}
            >
              Results
            </div>
            <div
              className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border text-[11px]"
              style={{
                borderColor: palette.border,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(49,94,168,0.08)",
              }}
            >
              {[
                "id",
                "email",
                "full_name",
                "created_at",
                "18",
                "morgan@valstine.com",
                "Morgan Price",
                "2026-05-08",
              ].map((cell, index) => (
                <div
                  key={`${cell}-${index}`}
                  className={["px-2 py-2"].join(" ")}
                  style={
                    index < 4
                      ? {
                          backgroundColor: palette.surface,
                          color: palette.muted,
                        }
                      : {
                          backgroundColor: palette.elevated,
                          color: palette.text,
                        }
                  }
                >
                  {cell}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalystPreview({
  borderClass,
  isDark,
}: {
  borderClass: string;
  isDark: boolean;
}) {
  const palette = isDark
    ? {
        frame: "#07101f",
        topbar: "#0b1730",
        canvas: "#06101c",
        rail: "#050d18",
        sidebar: "#081323",
        surface: "#081223",
        elevated: "#122241",
        mutedPanel: "#10203d",
        active: "#17345f",
        border: "rgba(255,255,255,0.10)",
        strongBorder: "rgba(84,131,217,0.28)",
        text: "#e4efff",
        title: "#ffffff",
        muted: "#9fb5d5",
        subtle: "#7390b8",
        line: "#637a9f",
        accent: "#8db6ff",
        accentText: "#d7e6ff",
      }
    : {
        frame: "#f7fbff",
        topbar: "#eef4ff",
        canvas: "#f5f8ff",
        rail: "#ecf2fb",
        sidebar: "#f2f7ff",
        surface: "#f8fbff",
        elevated: "#ffffff",
        mutedPanel: "#edf3ff",
        active: "#dbe7fb",
        border: "rgba(20,56,98,0.10)",
        strongBorder: "rgba(49,94,168,0.22)",
        text: "#17385f",
        title: "#15365d",
        muted: "#51759e",
        subtle: "#7191ba",
        line: "#8ca5c8",
        accent: "#315ea8",
        accentText: "#1d457b",
      };

  return (
    <div
      className={`overflow-hidden rounded-[26px] border ${borderClass}`}
      style={{ backgroundColor: palette.frame }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ backgroundColor: palette.topbar, borderColor: palette.border }}
      >
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: palette.accent }}
          >
            Analyst OS Preview
          </div>
          <div
            className="mt-1 text-sm font-semibold"
            style={{ color: palette.title }}
          >
            SQL, notebooks, AI, and visualization
          </div>
        </div>
        <div
          className="rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
          style={{
            borderColor: palette.strongBorder,
            backgroundColor: palette.active,
            color: palette.accentText,
          }}
        >
          Exploration flow
        </div>
      </div>

      <div
        className="grid min-h-[360px] grid-cols-[56px_210px_minmax(0,1fr)]"
        style={{ backgroundColor: palette.canvas }}
      >
        <div
          className="border-r p-2"
          style={{ backgroundColor: palette.rail, borderColor: palette.border }}
        >
          {[
            PanelsTopLeft,
            PlayCircle,
            TableProperties,
            Bot,
            Waypoints,
            Command,
          ].map((Icon, index) => (
            <div
              key={index}
              className={[
                "mb-2 flex h-10 w-10 items-center justify-center rounded-xl border",
              ].join(" ")}
              style={
                index === 3
                  ? {
                      borderColor: palette.strongBorder,
                      backgroundColor: palette.active,
                      color: palette.accentText,
                    }
                  : { borderColor: "transparent", color: palette.subtle }
              }
            >
              <Icon className="h-4 w-4" />
            </div>
          ))}
        </div>

        <div
          className="border-r p-4"
          style={{
            backgroundColor: palette.sidebar,
            borderColor: palette.border,
          }}
        >
          <div
            className="rounded-xl border px-3 py-2 text-[12px]"
            style={{
              borderColor: palette.border,
              backgroundColor: palette.elevated,
              color: palette.muted,
            }}
          >
            Search tables, notebooks, prompts...
          </div>
          <div
            className="mt-4 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: palette.subtle }}
          >
            Explorer
          </div>
          <div
            className="mt-3 space-y-2 text-[12px]"
            style={{ color: palette.text }}
          >
            <div
              className="rounded-lg px-3 py-2"
              style={{ backgroundColor: palette.active }}
            >
              analytics/cohorts.ipynb
            </div>
            <div className="rounded-lg px-3 py-2">queries/retention.sql</div>
            <div className="rounded-lg px-3 py-2">charts/retention_heatmap</div>
            <div className="rounded-lg px-3 py-2">imports/students.csv</div>
          </div>
        </div>

        <div
          className="grid grid-rows-[auto_minmax(0,1fr)_148px]"
          style={{ backgroundColor: palette.surface }}
        >
          <div className="border-b" style={{ borderColor: palette.border }}>
            <div className="flex items-center gap-2 px-3 pt-3">
              <div
                className="rounded-t-xl border px-3 py-2 text-[12px]"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.elevated,
                  color: palette.title,
                }}
              >
                cohort_retention.sql
              </div>
              <div
                className="rounded-t-xl border px-3 py-2 text-[12px]"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.canvas,
                  color: palette.muted,
                }}
              >
                retention_notes.ipynb
              </div>
            </div>
            <div
              className="flex items-center gap-2 border-t px-3 py-3 text-[12px]"
              style={{ borderColor: palette.border, color: palette.muted }}
            >
              <div
                className="rounded-lg border px-3 py-1.5"
                style={{
                  borderColor: palette.strongBorder,
                  backgroundColor: palette.active,
                  color: palette.accentText,
                }}
              >
                Run Query
              </div>
              <div
                className="rounded-lg border px-3 py-1.5"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.elevated,
                }}
              >
                AI Explain
              </div>
              <div
                className="rounded-lg border px-3 py-1.5"
                style={{
                  borderColor: palette.border,
                  backgroundColor: palette.elevated,
                }}
              >
                Build Chart
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-[1.1fr_0.9fr] gap-3 p-3">
            <div
              className="overflow-hidden rounded-2xl border"
              style={{
                borderColor: palette.border,
                backgroundColor: palette.elevated,
              }}
            >
              <div className="grid grid-cols-[46px_minmax(0,1fr)] font-mono text-[12px] leading-6">
                <div
                  className="border-r px-2 py-3 text-right"
                  style={{
                    borderColor: palette.border,
                    backgroundColor: palette.canvas,
                    color: palette.line,
                  }}
                >
                  <div>1</div>
                  <div>2</div>
                  <div>3</div>
                  <div>4</div>
                  <div>5</div>
                </div>
                <div className="px-4 py-3" style={{ color: palette.text }}>
                  <div>WITH cohort_sizes AS (</div>
                  <div>&nbsp;&nbsp;SELECT cohort_month, COUNT(*)</div>
                  <div>&nbsp;&nbsp;FROM analytics.fact_sessions</div>
                  <div>)</div>
                  <div>SELECT * FROM retention_summary;</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div
                className="rounded-2xl border p-3 text-[12px]"
                style={{
                  borderColor: palette.strongBorder,
                  backgroundColor: palette.mutedPanel,
                  color: palette.accentText,
                }}
              >
                <div
                  className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: palette.accent }}
                >
                  <Bot className="h-3.5 w-3.5" />
                  AI Insight
                </div>
                <div className="text-[11px] leading-5">
                  Month-two retention drops hardest in cohorts with fewer than
                  three weekly interactions.
                </div>
              </div>
              <div
                className="rounded-2xl border p-3"
                style={{
                  borderColor: palette.strongBorder,
                  backgroundColor: palette.mutedPanel,
                }}
              >
                <div
                  className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: palette.accent }}
                >
                  <Layers3 className="h-3.5 w-3.5" />
                  Visualization
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <div
                      key={index}
                      className="aspect-square rounded-md"
                      style={{
                        backgroundColor: isDark
                          ? `rgba(120, 163, 255, ${0.16 + ((index % 4) + 1) * 0.12})`
                          : `rgba(49, 94, 168, ${0.12 + ((index % 4) + 1) * 0.1})`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            className="border-t p-3"
            style={{
              borderColor: palette.border,
              backgroundColor: palette.canvas,
            }}
          >
            <div
              className="mb-2 text-[10px] uppercase tracking-[0.2em]"
              style={{ color: palette.subtle }}
            >
              Results
            </div>
            <div
              className="grid grid-cols-5 gap-px overflow-hidden rounded-xl border text-[11px]"
              style={{
                borderColor: palette.border,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(49,94,168,0.08)",
              }}
            >
              {[
                "cohort",
                "month",
                "retention",
                "active",
                "size",
                "2025-11",
                "2025-12",
                "74.8%",
                "585",
                "782",
              ].map((cell, index) => (
                <div
                  key={`${cell}-${index}`}
                  className={["px-2 py-2"].join(" ")}
                  style={
                    index < 5
                      ? {
                          backgroundColor: palette.surface,
                          color: palette.muted,
                        }
                      : {
                          backgroundColor: palette.elevated,
                          color: palette.text,
                        }
                  }
                >
                  {cell}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { completeOnboarding, isFirstTime, theme, toggleTheme } = useAppStore();
  const platform = detectPlatform();
  const isDark = theme === "dark";
  const [releaseInfo, setReleaseInfo] = useState<{
    tag: string;
    publishedAt: string;
    releaseUrl: string;
    assets: Record<string, string>;
  } | null>(null);

  const themeVars = useMemo<CSSProperties>(
    () =>
      ({
        "--landing-bg": isDark ? "#050c18" : "#edf4ff",
        "--landing-nav": isDark
          ? "rgba(7,14,28,0.84)"
          : "rgba(255,255,255,0.86)",
        "--landing-panel": isDark
          ? "rgba(9,18,34,0.95)"
          : "rgba(255,255,255,0.95)",
        "--landing-panel-alt": isDark
          ? "rgba(11,23,44,0.92)"
          : "rgba(245,250,255,0.98)",
        "--landing-soft": isDark
          ? "rgba(124,164,255,0.08)"
          : "rgba(27,74,140,0.05)",
        "--landing-soft-hover": isDark
          ? "rgba(124,164,255,0.14)"
          : "rgba(27,74,140,0.09)",
        "--landing-border": isDark
          ? "rgba(124,164,255,0.16)"
          : "rgba(27,74,140,0.12)",
        "--landing-text": isDark ? "#eef5ff" : "#15365d",
        "--landing-muted": isDark ? "#c4d7f2" : "#3f648f",
        "--landing-dim": isDark ? "#7c95b7" : "#5d80a9",
        "--landing-accent": isDark ? "#8db6ff" : "#2f5ea7",
        "--landing-accent-strong": isDark ? "#214c91" : "#1f4f93",
        "--landing-accent-soft": isDark
          ? "rgba(33,76,145,0.12)"
          : "rgba(33,76,145,0.10)",
        "--landing-accent-soft-hover": isDark
          ? "rgba(33,76,145,0.20)"
          : "rgba(33,76,145,0.16)",
        "--landing-accent-text": isDark ? "#dbe8ff" : "#183b66",
        "--landing-primary-button": isDark ? "#214c91" : "#214c91",
        "--landing-primary-button-hover": isDark ? "#1a3e75" : "#183f7c",
        "--landing-primary-button-text": "#ffffff",
        "--landing-shadow": isDark
          ? "0 30px 90px rgba(0,0,0,0.34)"
          : "0 24px 80px rgba(17,47,87,0.12)",
        "--landing-card-shadow": isDark
          ? "0 18px 45px rgba(0,0,0,0.18)"
          : "0 18px 45px rgba(17,47,87,0.08)",
      }) as CSSProperties,
    [isDark],
  );

  const overlayStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: isDark
        ? "radial-gradient(circle at top left, rgba(83,128,218,0.24), transparent 28%), radial-gradient(circle at 84% 16%, rgba(128,164,255,0.18), transparent 22%), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)"
        : "radial-gradient(circle at top left, rgba(49,94,168,0.16), transparent 28%), radial-gradient(circle at 84% 16%, rgba(117,154,225,0.16), transparent 22%), linear-gradient(rgba(27,74,140,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(27,74,140,0.04) 1px, transparent 1px)",
    }),
    [isDark],
  );

  const borderClass = "border-[color:var(--landing-border)]";
  const panelClass = "bg-[var(--landing-panel)]";
  const panelAltClass = "bg-[var(--landing-panel-alt)]";
  const softClass = "bg-[var(--landing-soft)]";
  const softHoverClass = "hover:bg-[var(--landing-soft-hover)]";
  const textClass = "text-[color:var(--landing-text)]";
  const mutedTextClass = "text-[color:var(--landing-muted)]";
  const dimTextClass = "text-[color:var(--landing-dim)]";
  const accentTextClass = "text-[color:var(--landing-accent)]";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    fetch(
      "https://api.github.com/repos/techfix-sqaud/Valstine-studio/releases?per_page=1",
    )
      .then((res) => res.json())
      .then((releases) => {
        if (!Array.isArray(releases) || releases.length === 0) {
          throw new Error("No releases found");
        }

        const data = releases[0];
        if (!data.tag_name || !Array.isArray(data.assets)) {
          throw new Error("No release found");
        }

        const assets: Record<string, string> = {};
        for (const asset of data.assets) {
          if (asset.name.endsWith(".dmg"))
            assets.mac = asset.browser_download_url;
          if (asset.name.endsWith(".exe"))
            assets.windows = asset.browser_download_url;
          if (asset.name.endsWith(".AppImage"))
            assets.linux = asset.browser_download_url;
        }

        setReleaseInfo({
          tag: data.tag_name,
          publishedAt: data.published_at ?? '',
          releaseUrl: data.html_url ?? '',
          assets,
        });
      })
      .catch(() => setReleaseInfo(null));
  }, []);

  const fallbackBase =
    "https://github.com/techfix-sqaud/Valstine-studio/releases/latest/download";
  const downloadLinks = {
    mac: releaseInfo?.assets.mac || `${fallbackBase}/Valstine-Studio.dmg`,
    windows:
      releaseInfo?.assets.windows ||
      `${fallbackBase}/Valstine-Studio-Setup.exe`,
    linux:
      releaseInfo?.assets.linux || `${fallbackBase}/Valstine-Studio.AppImage`,
  };

  const handleDownload = (target: "mac" | "windows" | "linux") => {
    window.open(downloadLinks[target], "_blank");
  };

  const handleEnterStudio = () => {
    if (isFirstTime) {
      navigate("/tour");
      return;
    }

    navigate("/studio");
  };

  const handleEnterAnalyst = () => {
    if (isFirstTime) {
      completeOnboarding();
    }

    navigate("/analyst-os");
  };

  return (
    <div
      className="min-h-screen overflow-auto bg-[var(--landing-bg)] text-[color:var(--landing-text)]"
      style={themeVars}
    >
      <div
        className="absolute inset-0 bg-[size:auto,auto,34px_34px,34px_34px] opacity-70"
        style={overlayStyle}
      />

      <div className="relative">
        <nav
          className={`sticky top-0 z-50 border-b ${borderClass} bg-[var(--landing-nav)] backdrop-blur-xl`}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--landing-accent-soft)] text-[color:var(--landing-accent)]">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <div
                  className={`text-[11px] uppercase tracking-[0.24em] ${accentTextClass}`}
                >
                  Valstine Platform
                </div>
                <div className={`text-sm font-medium ${textClass}`}>
                  Studio + Analyst OS
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className={`rounded-xl border ${borderClass} ${softClass} p-2 ${mutedTextClass} transition hover:border-[#315ea8]/40 hover:text-[color:var(--landing-text)] ${softHoverClass}`}
                aria-label="Toggle theme"
              >
                {isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={handleEnterStudio}
                className={`hidden rounded-xl border ${borderClass} ${softClass} px-4 py-2 text-sm ${mutedTextClass} transition hover:border-[#315ea8]/40 hover:text-[color:var(--landing-text)] ${softHoverClass} md:inline-flex`}
              >
                Open Studio
              </button>
              <button
                onClick={handleEnterAnalyst}
                className="rounded-xl border border-[color:var(--landing-accent-strong)]/20 bg-[var(--landing-accent-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--landing-accent-text)] transition hover:bg-[var(--landing-accent-soft-hover)]"
              >
                Launch Analyst OS
              </button>
            </div>
          </div>
        </nav>

        <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-24 lg:pt-18">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--landing-accent-strong)]/20 bg-[var(--landing-accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--landing-accent)]">
                <Sparkles className="h-3.5 w-3.5" />
                Two products, one platform
              </div>
              <h1
                className={`mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] ${textClass} sm:text-5xl lg:text-6xl`}
              >
                A sharper navy design system for database operations and data
                exploration.
              </h1>
              <p
                className={`mt-6 max-w-2xl text-base leading-7 ${mutedTextClass} sm:text-lg`}
              >
                Valstine Studio and Valstine Analyst OS should feel like peers,
                not one product shadowing the other. This landing hub makes both
                flows obvious: Studio for operational database work, Analyst OS
                for analytical workspaces, notebooks, charts, and AI guidance.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleEnterStudio}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--landing-primary-button)] px-6 py-3 text-sm font-semibold text-[color:var(--landing-primary-button-text)] transition hover:bg-[var(--landing-primary-button-hover)]"
                >
                  Enter Studio
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={handleEnterAnalyst}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--landing-accent-strong)]/20 bg-[var(--landing-accent-soft)] px-6 py-3 text-sm font-semibold text-[color:var(--landing-accent-text)] transition hover:bg-[var(--landing-accent-soft-hover)]"
                >
                  Enter Analyst OS
                  <ArrowRight className="h-4 w-4" />
                </button>
                {platform !== "unknown" ? (
                  <button
                    onClick={() => handleDownload(platform)}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border ${borderClass} ${softClass} px-6 py-3 text-sm font-medium ${mutedTextClass} transition hover:border-[#315ea8]/40 hover:text-[color:var(--landing-text)] ${softHoverClass}`}
                  >
                    <Download className="h-4 w-4" />
                    Install for{" "}
                    {platform === "mac"
                      ? "macOS"
                      : platform === "windows"
                        ? "Windows"
                        : "Linux"}
                  </button>
                ) : null}
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {productPillars.map((item) => (
                  <div
                    key={item.title}
                    className={`rounded-2xl border ${borderClass} ${panelAltClass} p-4`}
                    style={{ boxShadow: "var(--landing-card-shadow)" }}
                  >
                    <item.icon className="h-5 w-5 text-[#8db6ff]" />
                    <div className={`mt-4 text-sm font-medium ${textClass}`}>
                      {item.title}
                    </div>
                    <div
                      className={`mt-2 text-[13px] leading-6 ${dimTextClass}`}
                    >
                      {item.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5">
              <StudioPreview borderClass={borderClass} isDark={isDark} />
              <AnalystPreview borderClass={borderClass} isDark={isDark} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="grid gap-6 lg:grid-cols-2">
            {products.map((product) => (
              <div
                key={product.id}
                className={`rounded-[30px] border ${product.border} bg-gradient-to-br ${product.accent} p-[1px]`}
                style={{ boxShadow: "var(--landing-shadow)" }}
              >
                <div className={`h-full rounded-[29px] ${panelClass} p-6`}>
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-full border ${borderClass} ${softClass} px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${dimTextClass}`}
                    >
                      {product.badge}
                    </span>
                    {product.id === "studio" ? (
                      <GitBranch className="h-4 w-4 text-[color:var(--landing-accent)]" />
                    ) : (
                      <Bot className="h-4 w-4 text-[color:var(--landing-accent)]" />
                    )}
                  </div>
                  <div className={`mt-6 text-2xl font-semibold ${textClass}`}>
                    {product.title}
                  </div>
                  <div className={`mt-3 text-sm leading-7 ${mutedTextClass}`}>
                    {product.summary}
                  </div>
                  <div className={`mt-6 space-y-3 text-[13px] ${dimTextClass}`}>
                    {product.points.map((point) => (
                      <div key={point} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--landing-accent)]" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 flex items-center gap-3">
                    <button
                      onClick={
                        product.id === "studio"
                          ? handleEnterStudio
                          : handleEnterAnalyst
                      }
                      className="inline-flex items-center gap-2 rounded-2xl bg-[var(--landing-primary-button)] px-4 py-2.5 text-sm font-semibold text-[color:var(--landing-primary-button-text)] transition hover:bg-[var(--landing-primary-button-hover)]"
                    >
                      {product.cta}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <div className={`text-xs ${dimTextClass}`}>
                      {product.id === "studio"
                        ? "Schema comparison, connections, Git, terminal"
                        : "SQL, notebooks, AI guidance, charts, migrations"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div>
              <div
                className={`text-[11px] uppercase tracking-[0.24em] ${accentTextClass}`}
              >
                Design and platforms
              </div>
              <h2
                className={`mt-4 text-3xl font-semibold ${textClass} sm:text-4xl`}
              >
                Navy-first, product-led, and clear about where each workflow
                lives.
              </h2>
              <p className={`mt-4 text-base leading-7 ${dimTextClass}`}>
                The palette now leans into navy and layered blue instead of
                neutral gray. The landing page also makes the product split
                explicit with two separate preview images, clearer descriptions,
                and install messaging that supports both design identity and
                platform reach.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div
                  className={`rounded-2xl border ${borderClass} ${panelAltClass} p-4`}
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[color:var(--landing-accent)]">
                    <PanelsTopLeft className="h-4 w-4" />
                    Studio visual language
                  </div>
                  <div className={`text-[13px] leading-6 ${dimTextClass}`}>
                    More operational, pane-driven, and diff-oriented for
                    database shipping workflows.
                  </div>
                </div>
                <div
                  className={`rounded-2xl border ${borderClass} ${panelAltClass} p-4`}
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[color:var(--landing-accent)]">
                    <Bot className="h-4 w-4" />
                    Analyst OS visual language
                  </div>
                  <div className={`text-[13px] leading-6 ${dimTextClass}`}>
                    More exploratory, insight-led, and chart-aware for SQL and
                    notebook workflows.
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {platformCards.map((card) => (
                <div
                  key={card.title}
                  className={`rounded-2xl border ${borderClass} ${panelAltClass} p-5`}
                  style={{ boxShadow: "var(--landing-card-shadow)" }}
                >
                  <card.icon className="h-5 w-5 text-[color:var(--landing-accent)]" />
                  <div className={`mt-4 text-lg font-medium ${textClass}`}>
                    {card.title}
                  </div>
                  <div className={`mt-2 text-[13px] leading-6 ${dimTextClass}`}>
                    {card.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 pt-2 sm:px-6 lg:px-8 lg:pb-24">
          <div
            className={`rounded-[30px] border ${borderClass} ${panelClass} p-6 sm:p-8`}
            style={{ boxShadow: "var(--landing-shadow)" }}
          >
            {/* Header row */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className={`text-[11px] uppercase tracking-[0.24em] ${accentTextClass}`}>
                  Download
                </div>
                <h2 className={`mt-3 text-3xl font-semibold ${textClass}`}>
                  One install. Studio and Analyst OS included.
                </h2>
                <p className={`mt-3 max-w-xl text-sm leading-7 ${dimTextClass}`}>
                  A single cross-platform app ships both workspaces. Install once
                  and switch between Studio and Analyst OS from the home screen.
                </p>
              </div>

              {/* Version badge */}
              <div className={`flex flex-col items-end gap-2`}>
                <div
                  className={`inline-flex items-center gap-2 rounded-full border ${borderClass} bg-[var(--landing-accent-soft)] px-4 py-1.5`}
                >
                  <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accentTextClass}`}>
                    {releaseInfo?.tag ?? "Latest"}
                  </span>
                  <span className={`text-[10px] ${dimTextClass}`}>Stable</span>
                </div>
                {releaseInfo?.publishedAt && (
                  <span className={`text-[11px] ${dimTextClass}`}>
                    Released{" "}
                    {new Date(releaseInfo.publishedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
                {releaseInfo?.releaseUrl && (
                  <a
                    href={releaseInfo.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-[11px] underline underline-offset-2 ${accentTextClass} hover:opacity-80`}
                  >
                    Release notes →
                  </a>
                )}
              </div>
            </div>

            {/* Download buttons */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {/* macOS */}
              <button
                onClick={() => handleDownload("mac")}
                className={`group relative flex flex-col items-start gap-1 rounded-2xl border ${borderClass} ${softClass} px-5 py-4 text-left transition hover:border-[#315ea8]/40 ${softHoverClass}`}
              >
                <div className="flex w-full items-center justify-between">
                  <Apple className={`h-5 w-5 ${accentTextClass}`} />
                  {platform === "mac" && (
                    <span className={`rounded-full border ${borderClass} bg-[var(--landing-accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${accentTextClass}`}>
                      Your platform
                    </span>
                  )}
                </div>
                <span className={`mt-2 text-sm font-semibold ${textClass}`}>macOS</span>
                <span className={`text-[11px] ${dimTextClass}`}>.dmg · Universal binary</span>
              </button>

              {/* Windows */}
              <button
                onClick={() => handleDownload("windows")}
                className={`group relative flex flex-col items-start gap-1 rounded-2xl border ${borderClass} ${softClass} px-5 py-4 text-left transition hover:border-[#315ea8]/40 ${softHoverClass}`}
              >
                <div className="flex w-full items-center justify-between">
                  <Laptop className={`h-5 w-5 ${accentTextClass}`} />
                  {platform === "windows" && (
                    <span className={`rounded-full border ${borderClass} bg-[var(--landing-accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${accentTextClass}`}>
                      Your platform
                    </span>
                  )}
                </div>
                <span className={`mt-2 text-sm font-semibold ${textClass}`}>Windows</span>
                <span className={`text-[11px] ${dimTextClass}`}>.exe · NSIS installer</span>
              </button>

              {/* Linux */}
              <button
                onClick={() => handleDownload("linux")}
                className={`group relative flex flex-col items-start gap-1 rounded-2xl border ${borderClass} ${softClass} px-5 py-4 text-left transition hover:border-[#315ea8]/40 ${softHoverClass}`}
              >
                <div className="flex w-full items-center justify-between">
                  <TerminalSquare className={`h-5 w-5 ${accentTextClass}`} />
                  {platform === "linux" && (
                    <span className={`rounded-full border ${borderClass} bg-[var(--landing-accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${accentTextClass}`}>
                      Your platform
                    </span>
                  )}
                </div>
                <span className={`mt-2 text-sm font-semibold ${textClass}`}>Linux</span>
                <span className={`text-[11px] ${dimTextClass}`}>.AppImage · No install needed</span>
              </button>
            </div>

            <p className={`mt-5 text-[11px] ${dimTextClass}`}>
              Auto-updates are built in — the app notifies you when a new version is available.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
