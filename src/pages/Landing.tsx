import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/app-store";
import { useEffect, useState } from "react";
import {
  Database,
  Zap,
  Shield,
  Globe,
  Monitor,
  ArrowRight,
  Code2,
  Table2,
  GitBranch,
  Sparkles,
  ChevronRight,
  Moon,
  Sun,
  ArrowRightLeft,
  GitPullRequest,
  Minus,
  Plus,
  Download,
  Apple,
} from "lucide-react";

const isElectron =
  typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

function detectPlatform(): "mac" | "windows" | "linux" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

const features = [
  {
    icon: Code2,
    title: "Intelligent SQL Editor",
    description:
      "Monaco-powered editor with syntax highlighting, auto-complete, and bracket matching.",
  },
  {
    icon: Table2,
    title: "Visual Schema Explorer",
    description:
      "Navigate your database schema with an interactive diagram and tree explorer.",
  },
  {
    icon: Zap,
    title: "Lightning Fast Queries",
    description:
      "Execute queries with real-time results, copy data, and export with one click.",
  },
  {
    icon: ArrowRightLeft,
    title: "Schema Comparison",
    description:
      "Side-by-side diff view inspired by VS Code. Compare two databases, see every change, and generate migration SQL instantly.",
  },
  {
    icon: GitBranch,
    title: "Built-in Version Control",
    description:
      "Stage, commit, push, and switch branches without leaving the studio. Full Git integration from the sidebar.",
  },
  {
    icon: GitPullRequest,
    title: "Pull Requests",
    description:
      "Push your branch and open a GitHub or GitLab PR directly from the studio — no context switching.",
  },
  {
    icon: Shield,
    title: "Secure Connections",
    description:
      "SSL/TLS encrypted connections with credential management and SSH tunneling.",
  },
  {
    icon: Globe,
    title: "Cross-Platform",
    description:
      "Works on Web, macOS, and Windows. Your workspace syncs across devices.",
  },
  {
    icon: Sparkles,
    title: "AI Assistant",
    description:
      "Ask the built-in AI to explain queries, suggest optimizations, or generate SQL from plain English.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { completeOnboarding, isFirstTime, theme, toggleTheme } = useAppStore();
  const platform = detectPlatform();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Desktop app: skip landing page entirely — go straight to tour or studio
  useEffect(() => {
    if (isElectron) {
      if (isFirstTime) {
        navigate("/tour", { replace: true });
      } else {
        navigate("/studio", { replace: true });
      }
    }
  }, [isElectron, isFirstTime, navigate]);

  const handleGetStarted = () => {
    if (isFirstTime) {
      navigate("/tour");
    } else {
      navigate("/studio");
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    navigate("/studio");
  };

  // ── Download logic: fetch latest release info from GitHub API ──────────
  const [releaseInfo, setReleaseInfo] = useState<{
    tag: string;
    assets: Record<string, string>;
  } | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch all releases (including pre-releases) from GitHub API
    fetch(
      "https://api.github.com/repos/techfix-sqaud/Valstine-studio/releases?per_page=1",
    )
      .then((res) => res.json())
      .then((releases) => {
        if (!Array.isArray(releases) || releases.length === 0)
          throw new Error("No releases found");
        const data = releases[0];
        if (!data.tag_name || !Array.isArray(data.assets))
          throw new Error("No release found");
        // Map asset names to download URLs
        const assets: Record<string, string> = {};
        for (const asset of data.assets) {
          if (asset.name.endsWith(".dmg"))
            assets.mac = asset.browser_download_url;
          if (asset.name.endsWith(".exe"))
            assets.windows = asset.browser_download_url;
          if (asset.name.endsWith(".AppImage"))
            assets.linux = asset.browser_download_url;
        }
        setReleaseInfo({ tag: data.tag_name, assets });
      })
      .catch((err) => setReleaseError("Could not fetch release info."));
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

  const platformLabel = {
    mac: "Download for macOS",
    windows: "Download for Windows",
    linux: "Download for Linux",
  };

  const platformIcon = {
    mac: "🍎",
    windows: "🪟",
    linux: "🐧",
  };

  const handleDownload = (p: "mac" | "windows" | "linux") => {
    window.open(downloadLinks[p], "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-auto">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm tracking-wide">
              Valstine Studio
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-secondary"
            >
              Skip to Studio
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-16 sm:pb-20">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
              <Sparkles className="w-3 h-3" />
              Built for modern database workflows
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-4 sm:mb-6">
              The Database Studio
              <br />
              <span className="text-primary">You Deserve</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-8 sm:mb-10 leading-relaxed px-4">
              A powerful, beautiful database management tool that runs
              everywhere. Query, explore, and visualize your data with ease.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4">
              <button
                onClick={handleGetStarted}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
              >
                Open in Browser
                <ArrowRight className="w-4 h-4" />
              </button>
              {platform !== "unknown" && (
                <button
                  onClick={() => handleDownload(platform)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-medium text-sm hover:bg-secondary transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {platformLabel[platform]}
                </button>
              )}
            </div>
            {/* All platform downloads */}
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
              <span>Also available:</span>
              {(["mac", "windows", "linux"] as const)
                .filter((p) => p !== platform)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => handleDownload(p)}
                    className="hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    {platformIcon[p]}{" "}
                    {p === "mac"
                      ? "macOS"
                      : p === "windows"
                        ? "Windows"
                        : "Linux"}
                  </button>
                ))}
            </div>
          </div>

          {/* Preview */}
          <div className="mt-12 sm:mt-16 max-w-4xl mx-auto px-4">
            <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
              <div className="h-8 bg-titlebar flex items-center px-3 gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/70" />
                <div className="w-3 h-3 rounded-full bg-warning/70" />
                <div className="w-3 h-3 rounded-full bg-success/70" />
                <span className="ml-3 text-[10px] text-muted-foreground">
                  Valstine Studio
                </span>
              </div>
              <div className="grid grid-cols-12 h-48 sm:h-64">
                <div className="col-span-3 bg-panel-bg border-r border-panel-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                    Explorer
                  </div>
                  <div className="space-y-1">
                    {["public.users", "public.orders", "public.products"].map(
                      (t) => (
                        <div
                          key={t}
                          className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-foreground/70 py-0.5"
                        >
                          <Table2 className="w-3 h-3 text-primary" />
                          <span className="truncate">{t}</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <div className="col-span-9 flex flex-col">
                  <div className="h-7 border-b border-panel-border bg-tab-inactive flex items-center px-2">
                    <span className="text-[10px] text-muted-foreground">
                      active_users.sql
                    </span>
                  </div>
                  <div className="flex-1 bg-background p-3 font-mono text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
                    <span className="text-blue-400 font-bold">SELECT</span> id,
                    email, full_name
                    <br />
                    <span className="text-blue-400 font-bold">FROM</span>{" "}
                    public.users
                    <br />
                    <span className="text-blue-400 font-bold">WHERE</span>{" "}
                    is_active = <span className="text-green-400">true</span>
                    <br />
                    <span className="text-blue-400 font-bold">
                      ORDER BY
                    </span>{" "}
                    created_at{" "}
                    <span className="text-blue-400 font-bold">DESC</span>;
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 sm:mb-4">
              Everything you need
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
              Professional-grade tools for database management, all in one
              place.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-5 sm:p-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-lg transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Databases */}
      <section className="py-16 sm:py-24 border-t border-border bg-secondary/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 sm:mb-4">
              Connect to Any Database
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
              First-class support for the most popular relational databases.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {[
              {
                name: "PostgreSQL",
                icon: "🐘",
                color: "text-blue-400",
                bg: "bg-blue-500/10",
                desc: "Full support including schemas, extensions, and advanced types",
              },
              {
                name: "MySQL",
                icon: "🐬",
                color: "text-orange-400",
                bg: "bg-orange-500/10",
                desc: "Complete MySQL & MariaDB compatibility with all features",
              },
              {
                name: "SQLite",
                icon: "📁",
                color: "text-emerald-400",
                bg: "bg-emerald-500/10",
                desc: "Open local .db files directly with zero configuration",
              },
              {
                name: "SQL Server",
                icon: "🔷",
                color: "text-red-400",
                bg: "bg-red-500/10",
                desc: "Microsoft SQL Server with Windows & SQL authentication",
              },
            ].map((db) => (
              <div
                key={db.name}
                className="group flex flex-col items-center gap-3 p-5 sm:p-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-lg transition-all text-center"
              >
                <div
                  className={`w-14 h-14 rounded-xl ${db.bg} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}
                >
                  {db.icon}
                </div>
                <div className={`font-semibold text-sm ${db.color}`}>
                  {db.name}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed hidden sm:block">
                  {db.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Schema Comparison & Git Showcase */}
      <section className="py-16 sm:py-24 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
              <ArrowRightLeft className="w-3 h-3" />
              New in Valstine Studio
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 sm:mb-4">
              Schema Diff & Version Control
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              Compare database schemas side-by-side and manage your changes with
              built-in Git — all without leaving the studio.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Schema diff mockup */}
            <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="h-8 bg-titlebar flex items-center px-3 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-warning/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-success/70" />
                <span className="ml-2 text-[10px] text-muted-foreground">
                  Schema Compare — staging ↔ production
                </span>
              </div>
              {/* Column headers */}
              <div className="flex text-[10px] text-muted-foreground border-b border-border/40 bg-muted/20">
                <div className="flex-1 px-2 py-0.5">staging (dev_db)</div>
                <div className="w-px bg-border/40" />
                <div className="flex-1 px-2 py-0.5">production (prod_db)</div>
              </div>
              {/* Side-by-side diff lines */}
              <div className="font-mono text-[10px] sm:text-[11px] leading-[20px]">
                {/* Unchanged */}
                <div className="flex">
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50">
                    1
                  </div>
                  <div className="flex-1 px-1 text-muted-foreground/70 truncate">
                    -- public.users
                  </div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50">
                    1
                  </div>
                  <div className="flex-1 px-1 text-muted-foreground/70 truncate">
                    -- public.users
                  </div>
                </div>
                {/* Added column */}
                <div className="flex bg-green-500/10">
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50"></div>
                  <div className="flex-1 px-1 text-muted-foreground/40 truncate"></div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 bg-green-500/15 text-green-500/70">
                    2
                  </div>
                  <div className="flex-1 px-1 text-green-400 truncate">
                    {" "}
                    + avatar_url varchar(512)
                  </div>
                </div>
                {/* Modified column */}
                <div className="flex bg-blue-500/10">
                  <div className="w-[28px] shrink-0 text-right pr-1 bg-blue-500/15 text-blue-500/70">
                    2
                  </div>
                  <div className="flex-1 px-1 text-blue-300 truncate">
                    {" "}
                    ~ email varchar(100)
                  </div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 bg-blue-500/15 text-blue-500/70">
                    3
                  </div>
                  <div className="flex-1 px-1 text-blue-300 truncate">
                    {" "}
                    ~ email varchar(255)
                  </div>
                </div>
                {/* Unchanged */}
                <div className="flex">
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50">
                    3
                  </div>
                  <div className="flex-1 px-1 text-muted-foreground/70 truncate">
                    -- public.orders
                  </div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50">
                    4
                  </div>
                  <div className="flex-1 px-1 text-muted-foreground/70 truncate">
                    -- public.orders
                  </div>
                </div>
                {/* Removed column */}
                <div className="flex bg-red-500/10">
                  <div className="w-[28px] shrink-0 text-right pr-1 bg-red-500/15 text-red-500/70">
                    4
                  </div>
                  <div className="flex-1 px-1 text-red-400 truncate">
                    {" "}
                    - legacy_ref integer
                  </div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50"></div>
                  <div className="flex-1 px-1 text-muted-foreground/40 truncate"></div>
                </div>
                {/* New table */}
                <div className="flex bg-green-500/10">
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50"></div>
                  <div className="flex-1 px-1 text-muted-foreground/40 truncate"></div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 bg-green-500/15 text-green-500/70">
                    5
                  </div>
                  <div className="flex-1 px-1 text-green-400 truncate">
                    CREATE TABLE public.audit_log (
                  </div>
                </div>
                <div className="flex bg-green-500/10">
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50"></div>
                  <div className="flex-1 px-1 text-muted-foreground/40 truncate"></div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 bg-green-500/15 text-green-500/70">
                    6
                  </div>
                  <div className="flex-1 px-1 text-green-400 truncate">
                    {" "}
                    id serial PRIMARY KEY
                  </div>
                </div>
                <div className="flex bg-green-500/10">
                  <div className="w-[28px] shrink-0 text-right pr-1 text-muted-foreground/50"></div>
                  <div className="flex-1 px-1 text-muted-foreground/40 truncate"></div>
                  <div className="w-px bg-border/40" />
                  <div className="w-[28px] shrink-0 text-right pr-1 bg-green-500/15 text-green-500/70">
                    7
                  </div>
                  <div className="flex-1 px-1 text-green-400 truncate">);</div>
                </div>
              </div>
              {/* Bottom bar */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/40 bg-muted/10 text-[10px] text-muted-foreground">
                <span className="text-green-400">+3 added</span>
                <span className="text-red-400">-1 removed</span>
                <span className="text-blue-400">~1 modified</span>
                <span className="ml-auto">Generate migration SQL →</span>
              </div>
            </div>

            {/* Git panel mockup */}
            <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="h-8 bg-titlebar flex items-center px-3 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-warning/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-success/70" />
                <span className="ml-2 text-[10px] text-muted-foreground">
                  Source Control
                </span>
              </div>
              <div className="p-4 space-y-3">
                {/* Branch */}
                <div className="flex items-center gap-2 text-xs">
                  <GitBranch className="w-3.5 h-3.5 text-primary" />
                  <span className="font-medium">feature/add-audit-log</span>
                  <span className="ml-auto text-green-400 text-[10px]">
                    ↑2 ahead
                  </span>
                </div>
                {/* Commit box */}
                <div className="rounded-md border border-border bg-background p-2">
                  <div className="text-[11px] text-muted-foreground mb-1">
                    Add audit_log table and update email col
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 h-6 rounded bg-primary/90 flex items-center justify-center text-[10px] text-primary-foreground font-medium">
                      <GitBranch className="w-3 h-3 mr-1" /> Commit
                    </div>
                    <div className="h-6 w-6 rounded border border-border flex items-center justify-center">
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div className="h-6 w-6 rounded border border-border flex items-center justify-center">
                      <GitPullRequest className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                {/* Changed files */}
                <div>
                  <div className="text-[10px] font-medium text-foreground mb-1.5">
                    Changes (3 files)
                  </div>
                  <div className="space-y-0.5">
                    {[
                      {
                        status: "M",
                        file: "migrations/002_email.sql",
                        color: "text-yellow-400",
                      },
                      {
                        status: "A",
                        file: "migrations/003_audit_log.sql",
                        color: "text-green-400",
                      },
                      {
                        status: "M",
                        file: "schema/public.sql",
                        color: "text-yellow-400",
                      },
                    ].map((f) => (
                      <div
                        key={f.file}
                        className="flex items-center gap-1.5 text-[11px] py-0.5 px-1 rounded hover:bg-muted/30"
                      >
                        <span
                          className={`font-mono text-[10px] w-3 ${f.color}`}
                        >
                          {f.status}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {f.file}
                        </span>
                        <Plus className="w-3 h-3 text-green-400/50 ml-auto" />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Recent commits */}
                <div>
                  <div className="text-[10px] font-medium text-foreground mb-1.5">
                    Recent Commits
                  </div>
                  <div className="space-y-0.5">
                    {[
                      { hash: "a3f82c1", msg: "Add audit_log table migration" },
                      {
                        hash: "e91d4b0",
                        msg: "Update email column varchar(255)",
                      },
                      { hash: "7c03fa2", msg: "Initial schema setup" },
                    ].map((c) => (
                      <div
                        key={c.hash}
                        className="flex items-center gap-1.5 text-[11px] py-0.5 px-1"
                      >
                        <span className="font-mono text-[10px] text-blue-400">
                          {c.hash}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {c.msg}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* PR hint */}
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20 text-[10px] text-primary">
                  <GitPullRequest className="w-3.5 h-3.5" />
                  Push & open a Pull Request on GitHub in one click
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platforms & Downloads */}
      <section className="py-16 sm:py-24 border-t border-border bg-secondary/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 sm:mb-4">
            Run Anywhere
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto mb-10 sm:mb-12">
            Native desktop apps for macOS, Windows, and Linux — plus a full web
            experience. One click to install.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="flex flex-col items-center gap-3 px-6 py-6 rounded-xl border border-border bg-card">
              <Monitor className="w-8 h-8 text-primary" />
              <div className="font-medium text-sm">Web Browser</div>
              <div className="text-xs text-muted-foreground">
                Chrome, Firefox, Safari
              </div>
              <button
                onClick={handleGetStarted}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Open in Browser
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {(
              [
                {
                  key: "mac" as const,
                  label: "macOS",
                  sub: "Apple Silicon & Intel",
                  icon: "🍎",
                  ext: ".dmg",
                },
                {
                  key: "windows" as const,
                  label: "Windows",
                  sub: "Windows 10+",
                  icon: "🪟",
                  ext: ".exe",
                },
                {
                  key: "linux" as const,
                  label: "Linux",
                  sub: "AppImage & .deb",
                  icon: "🐧",
                  ext: ".AppImage",
                },
              ] as const
            ).map((p) => (
              <div
                key={p.key}
                className="flex flex-col items-center gap-3 px-6 py-6 rounded-xl border border-border bg-card"
              >
                <span className="text-3xl">{p.icon}</span>
                <div className="font-medium text-sm">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.sub}</div>
                <button
                  onClick={() => handleDownload(p.key)}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-secondary transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download {p.ext}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 sm:mb-4">
            Ready to get started?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
            Jump right in and start querying your databases.
          </p>
          <button
            onClick={handleGetStarted}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
          >
            Launch Studio
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 sm:py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-primary" />
            <span>Valstine Studio</span>
          </div>
          <span>Built with care for developers</span>
        </div>
      </footer>
    </div>
  );
}
