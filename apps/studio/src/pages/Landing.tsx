import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Apple,
  ArrowRight,
  Bot,
  Database,
  Download,
  GitBranch,
  GitPullRequest,
  Globe,
  Laptop,
  Layers3,
  Moon,
  PlayCircle,
  Shield,
  Sparkles,
  SplitSquareVertical,
  Sun,
  TerminalSquare,
  Waypoints,
  Workflow,
} from "lucide-react";
import { useAppStore } from "@valstine/core/store/app-store";
import { isDarkTheme } from "@valstine/core/lib/themes";
import { DB_TYPE_META } from "@valstine/core/lib/api";
import { cn } from "@valstine/ui/lib/utils";

function detectPlatform(): "mac" | "windows" | "linux" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

// Reveals content once it scrolls into view. Skips the animation entirely
// under prefers-reduced-motion instead of just shortening it.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(className, visible ? "animate-fade-in" : "opacity-0")}
    >
      {children}
    </div>
  );
}

const products = [
  {
    id: "studio",
    badge: "Operational workspace",
    title: "Valstine Studio",
    summary:
      "For shipping database changes with confidence: query editing, schema comparison, Git-aware workflows, connections, and production-minded tooling.",
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
    cta: "Launch Analyst OS",
    points: [
      "Notebook-style analysis, charts, and table previews with a developer feel",
      "AI that writes SQL, explains plans, and guides imports and fixes",
      "Built for students, analysts, and teams investigating live data",
    ],
  },
] as const;

const trustStrip = [
  {
    icon: Workflow,
    label: "Two focused products",
    detail: "Studio and Analyst OS stay visually and operationally distinct.",
  },
  {
    icon: Shield,
    label: "Production and exploration",
    detail: "One for shipping changes, one for discovery and reporting.",
  },
  {
    icon: Globe,
    label: "Desktop and browser",
    detail: "Studio installs natively; Analyst OS runs entirely in the browser.",
  },
] as const;

const platformCards = [
  {
    icon: Apple,
    title: "macOS native",
    body: "Studio installs as a native desktop app, optimized for keyboard-first workflows and native packaging.",
  },
  {
    icon: Laptop,
    title: "Windows and Linux",
    body: "The same Studio install surface for engineers running outside of macOS, without losing the desktop product identity.",
  },
  {
    icon: Globe,
    title: "Analyst OS, in your browser",
    body: "No install required — sign in and start exploring data with SQL, notebooks, and AI guidance from any machine.",
  },
] as const;

// Single source of truth for supported database types (packages/core/lib/api.ts) —
// listing them here directly instead of re-declaring labels/icons keeps this
// section from drifting out of sync with what the app actually connects to.
const supportedDatabases = [
  "pg",
  "mysql",
  "sqlite",
  "mssql",
  "mongodb",
  "redis",
  "cassandra",
  "firebase",
] as const;

const features = [
  {
    icon: PlayCircle,
    title: "Query editor",
    body: "A fast, Monaco-powered SQL editor with autocomplete, run-selection, and inline results.",
  },
  {
    icon: SplitSquareVertical,
    title: "Schema diff",
    body: "Compare schemas across environments and generate safe migration scripts.",
  },
  {
    icon: GitPullRequest,
    title: "Git-aware workflows",
    body: "Branch, commit, and open pull requests without leaving the database workspace.",
  },
  {
    icon: TerminalSquare,
    title: "Integrated terminal",
    body: "A real shell alongside your queries, for scripts, migrations, and tooling.",
  },
  {
    icon: Bot,
    title: "AI copilot",
    body: "Ask questions about your schema, generate SQL, and get plain-English explanations of query plans.",
  },
  {
    icon: Waypoints,
    title: "Notebooks & visualization",
    body: "Notebook-style analysis with charts and table previews in Analyst OS.",
  },
  {
    icon: Database,
    title: "Multi-database support",
    body: "PostgreSQL, MySQL, SQLite, SQL Server, MongoDB, Cassandra, Redis, and Firebase.",
  },
  {
    icon: Globe,
    title: "Cross-platform",
    body: "Native on macOS, Windows, and Linux, plus a full browser experience for Analyst OS.",
  },
] as const;

const pricingPlans = [
  {
    name: "Individuals / Students",
    price: "Free",
    cadence: "No credit card",
    badge: "Entry tier",
    summary:
      "For learning, solo experimentation, and light daily database work.",
    cta: "Start Free",
    action: "launch",
    highlight: false,
    features: [
      "Up to 3 database connections at a time",
      "3 AI questions per day",
      "No cloud deployments",
      "Core Studio and Analyst OS workspace features",
      "New foundational features as the platform grows",
    ],
  },
  {
    name: "Pro",
    price: "$8",
    cadence: "/ month",
    badge: "Most popular",
    summary:
      "For independent builders who need more AI help and more room to ship.",
    cta: "Upgrade to Pro",
    action: "launch",
    highlight: true,
    features: [
      "10 AI questions per day",
      "Unlimited database connections",
      "Up to 2 cloud deployments",
      "Priority access to new features and improvements",
      "Includes future Pro features as they are added",
    ],
  },
  {
    name: "Teams",
    price: "Custom",
    cadence: "Contact sales",
    badge: "Scale tier",
    summary:
      "For teams running many environments, shared workflows, and ongoing delivery.",
    cta: "Talk to Us",
    action: "contact",
    highlight: false,
    features: [
      "30 AI questions per day",
      "Unlimited database connections",
      "Unlimited cloud connections",
      "Built for multi-environment delivery and shared operations",
      "Access to additional team features as they are introduced",
    ],
  },
] as const;

// Renders whichever theme's captured screenshot matches the current preview
// state and crossfades between them — this is what keeps the product imagery
// in sync with the theme toggle instead of hard-cutting.
function ThemedScreenshot({
  base,
  isDark,
  alt,
}: {
  base: "studio" | "analyst";
  isDark: boolean;
  alt: string;
}) {
  const [lightFailed, setLightFailed] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);
  const bothFailed = lightFailed && darkFailed;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3xl border border-border bg-secondary shadow-2xl">
      {bothFailed ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Database className="h-10 w-10 opacity-30" />
        </div>
      ) : (
        <>
          <img
            src={`/screenshots/${base}-light-modern.png`}
            alt={alt}
            loading="lazy"
            onError={() => setLightFailed(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500",
              isDark ? "opacity-0" : "opacity-100",
              lightFailed && "hidden",
            )}
          />
          <img
            src={`/screenshots/${base}-black.png`}
            alt=""
            aria-hidden={!isDark}
            loading="lazy"
            onError={() => setDarkFailed(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500",
              isDark ? "opacity-100" : "opacity-0",
              darkFailed && "hidden",
            )}
          />
        </>
      )}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { completeOnboarding, isFirstTime, theme } = useAppStore();
  const platform = detectPlatform();

  // The landing page presents exactly the two flagship themes (Black / Space
  // Gray and Light Modern) regardless of whatever theme the app itself is
  // currently set to — this is a local preview toggle, not a write to the
  // user's real app-wide theme preference. Seeded once from the app's
  // current theme so returning users see a consistent bucket on arrival.
  const [isDark, setIsDark] = useState(() => isDarkTheme(theme));

  const isElectron =
    typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
  const [releaseInfo, setReleaseInfo] = useState<{
    tag: string;
    publishedAt: string;
    releaseUrl: string;
    assets: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (isElectron) return;
    fetch("/api/latest-release")
      .then((res) => res.json())
      .then((data) => {
        if (!data.tag) return;
        setReleaseInfo({
          tag: data.tag,
          publishedAt: data.publishedAt ?? "",
          releaseUrl: `https://github.com/techfix-sqaud/Valstine-studio/releases/tag/${data.tag}`,
          assets: data.assets ?? {},
        });
      })
      .catch(() => {
        /* no release info available */
      });
  }, []);

  const handleDownload = (target: "mac" | "windows" | "linux") => {
    if (isElectron) return;
    const url = releaseInfo?.assets[target];
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
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
    const analystOsUrl = import.meta.env.VITE_ANALYST_OS_URL ?? "/analyst-os";
    window.location.href = analystOsUrl;
  };

  const handlePricingAction = (action: "launch" | "contact") => {
    if (action === "contact") {
      window.location.href =
        "mailto:support@valstine.com?subject=Valstine%20Teams%20Plan";
      return;
    }
    handleEnterAnalyst();
  };

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div
      className={cn(
        "landing-page min-h-screen overflow-auto bg-background text-foreground",
        isDark ? "dark theme-black" : "theme-light-modern",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: isDark
            ? "radial-gradient(circle at top left, hsl(var(--primary) / 0.14), transparent 30%), radial-gradient(circle at 84% 16%, hsl(var(--primary) / 0.10), transparent 24%)"
            : "radial-gradient(circle at top left, hsl(var(--primary) / 0.08), transparent 30%), radial-gradient(circle at 84% 16%, hsl(var(--primary) / 0.06), transparent 24%)",
        }}
      />

      <div className="relative">
        <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-primary">
                  Valstine Platform
                </div>
                <div className="text-sm font-medium text-foreground">
                  Studio + Analyst OS
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDark((d) => !d)}
                className={cn(
                  "rounded-xl border border-border bg-secondary p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground",
                  focusRing,
                )}
                aria-label={isDark ? "Preview light theme" : "Preview dark theme"}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={handleEnterStudio}
                className={cn(
                  "hidden rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground md:inline-flex",
                  focusRing,
                )}
              >
                Open Studio
              </button>
              <button
                onClick={handleEnterAnalyst}
                className={cn(
                  "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90",
                  focusRing,
                )}
              >
                Launch Analyst OS
              </button>
            </div>
          </div>
        </nav>

        {/* Hero: one thesis — a single headline, a single primary action. */}
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Two products, one platform
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-foreground text-balance sm:text-5xl lg:text-6xl">
              Ship database changes. Understand your data.
              <br className="hidden sm:block" /> One platform, not a compromise.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Valstine Studio handles the operational work of shipping schema
              and query changes safely, as a native desktop app. Valstine
              Analyst OS handles exploring and explaining what's in the
              database, right in your browser.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={handleEnterStudio}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90",
                  focusRing,
                )}
              >
                Enter Studio
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleEnterAnalyst}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent",
                  focusRing,
                )}
              >
                Enter Analyst OS
              </button>
            </div>

            {!isElectron && platform !== "unknown" ? (
              <button
                onClick={() => handleDownload(platform)}
                className={cn(
                  "mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline",
                  focusRing,
                  "rounded-md",
                )}
              >
                <Download className="h-3.5 w-3.5" />
                Install for{" "}
                {platform === "mac" ? "macOS" : platform === "windows" ? "Windows" : "Linux"}
              </button>
            ) : null}
          </div>

          <Reveal className="mx-auto mt-14 max-w-5xl">
            <ThemedScreenshot
              base="studio"
              isDark={isDark}
              alt="Valstine Studio workspace showing the query editor, schema diff, and results grid"
            />
          </Reveal>

          <div className="mx-auto mt-14 grid max-w-4xl gap-8 sm:grid-cols-3">
            {trustStrip.map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
                    {item.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Products */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="grid gap-6 lg:grid-cols-2">
            {products.map((product) => (
              <div
                key={product.id}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-border bg-secondary px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {product.badge}
                  </span>
                  {product.id === "studio" ? (
                    <GitBranch className="h-4 w-4 text-primary" />
                  ) : (
                    <Bot className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="mt-6 text-2xl font-semibold text-foreground">
                  {product.title}
                </div>
                <div className="mt-3 text-sm leading-7 text-muted-foreground">
                  {product.summary}
                </div>
                <div className="mt-6 space-y-3 text-[13px] text-muted-foreground">
                  {product.points.map((point) => (
                    <div key={point} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8">
                  <button
                    onClick={product.id === "studio" ? handleEnterStudio : handleEnterAnalyst}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90",
                      focusRing,
                    )}
                  >
                    {product.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            ))}
          </Reveal>
        </section>

        {/* Supported databases */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-center">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-primary">
                Database support
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl text-balance">
                Every database you actually use.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Relational, document, key-value, and wide-column stores —
                connect once and both workspaces understand your schema.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {supportedDatabases.map((key) => {
                const meta = DB_TYPE_META[key];
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg">
                      {meta.icon}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] uppercase tracking-[0.24em] text-primary">
              Everything included
            </div>
            <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl text-balance">
              Built with everything you need, out of the box.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              No plugins to hunt down before a workspace feels complete.
            </p>
          </Reveal>

          <Reveal className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div className="mt-4 text-sm font-semibold text-foreground">
                  {feature.title}
                </div>
                <div className="mt-2 text-[13px] leading-6 text-muted-foreground">
                  {feature.body}
                </div>
              </div>
            ))}
          </Reveal>
        </section>

        {/* Analyst OS screenshot + platform reach */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
            <Reveal>
              <div className="text-[11px] uppercase tracking-[0.24em] text-primary">
                Available everywhere
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl text-balance">
                Desktop where it matters, browser where it's easier.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Studio installs natively on macOS, Windows, and Linux for
                operational database work. Analyst OS runs entirely in the
                browser — no install, same design language.
              </p>
              <div className="mt-8 grid gap-4">
                {platformCards.map((card) => (
                  <div key={card.title} className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {card.title}
                      </div>
                      <div className="mt-1 text-[13px] leading-6 text-muted-foreground">
                        {card.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal>
              <ThemedScreenshot
                base="analyst"
                isDark={isDark}
                alt="Valstine Analyst OS workspace showing a SQL notebook, AI insight, and visualization"
              />
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-primary">
                Pricing
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl text-balance">
                Simple plans for students, solo operators, and teams.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Every plan includes both Valstine Studio and Analyst OS. As the
                platform expands, plan-specific capabilities can grow with it.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
              AI usage and cloud deployment limits scale by plan.
            </div>
          </Reveal>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Reveal key={plan.name}>
                <div
                  className={cn(
                    "flex h-full flex-col rounded-2xl border p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg",
                    plan.highlight
                      ? "border-primary/40 bg-primary/[0.04]"
                      : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className={cn(
                          "inline-flex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em]",
                          plan.highlight
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-secondary text-muted-foreground",
                        )}
                      >
                        {plan.badge}
                      </div>
                      <div className="mt-4 text-xl font-semibold text-foreground">
                        {plan.name}
                      </div>
                    </div>
                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                      {plan.highlight ? (
                        <Sparkles className="h-5 w-5" />
                      ) : plan.name === "Teams" ? (
                        <Layers3 className="h-5 w-5" />
                      ) : (
                        <Bot className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex items-end gap-2">
                    <div className="text-4xl font-semibold text-foreground">
                      {plan.price}
                    </div>
                    <div className="pb-1 text-sm text-muted-foreground">
                      {plan.cadence}
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {plan.summary}
                  </p>

                  <div className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="text-[13px] leading-6 text-muted-foreground">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handlePricingAction(plan.action)}
                    className={cn(
                      "mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                      plan.highlight
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-border bg-secondary text-foreground hover:bg-accent",
                      focusRing,
                    )}
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Download */}
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-2 sm:px-6 lg:px-8 lg:pb-24">
          <Reveal className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-primary">
                  Download
                </div>
                <h2 className="mt-3 text-3xl font-semibold text-foreground text-balance">
                  Install Studio. Analyst OS is already in your browser.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                  Studio installs natively for macOS, Windows, and Linux.
                  Analyst OS needs no download — launch it straight from the
                  button above.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {releaseInfo?.tag ?? "Latest"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Stable</span>
                </div>
                {releaseInfo?.publishedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    Released{" "}
                    {new Date(releaseInfo.publishedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
                {!isElectron && releaseInfo?.releaseUrl && (
                  <a
                    href={releaseInfo.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "text-[11px] text-primary underline underline-offset-2 hover:opacity-80",
                      focusRing,
                      "rounded-sm",
                    )}
                  >
                    Release notes →
                  </a>
                )}
              </div>
            </div>

            {!isElectron && (
              <>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      { key: "mac" as const, label: "macOS", sub: ".dmg · Universal binary", Icon: Apple },
                      { key: "windows" as const, label: "Windows", sub: ".exe · NSIS installer", Icon: Laptop },
                      { key: "linux" as const, label: "Linux", sub: ".AppImage · No install needed", Icon: TerminalSquare },
                    ] as const
                  ).map(({ key, label, sub, Icon }) => (
                    <button
                      key={key}
                      onClick={() => handleDownload(key)}
                      className={cn(
                        "group relative flex flex-col items-start gap-1 rounded-xl border border-border bg-secondary px-5 py-4 text-left transition hover:bg-accent",
                        focusRing,
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon className="h-5 w-5 text-primary" />
                        {platform === key && (
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary">
                            Your platform
                          </span>
                        )}
                      </div>
                      <span className="mt-2 text-sm font-semibold text-foreground">{label}</span>
                      <span className="text-[11px] text-muted-foreground">{sub}</span>
                    </button>
                  ))}
                </div>

                <p className="mt-5 text-[11px] text-muted-foreground">
                  Auto-updates are built in — the app notifies you when a new
                  version is available.
                </p>
              </>
            )}
          </Reveal>
        </section>
      </div>
    </div>
  );
}
