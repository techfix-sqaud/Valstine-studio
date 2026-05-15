import { useEffect, useState } from "react";
import {
  X,
  Monitor,
  Terminal,
  Shield,
  Info,
  Cloud,
  ChevronRight,
  Sun,
  Moon,
  AlertTriangle,
  Bot,
  Eye,
  EyeOff,
  User,
  GitBranch,
  ExternalLink,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, type AccountAuthProvider } from "@/store/app-store";
import { TERMINAL_PRESETS, getPresetById } from "@/lib/terminal-themes";
import { getSourceControlProviderLabel } from "@/lib/source-control";

type Section =
  | "general"
  | "terminal"
  | "ai"
  | "security"
  | "about"
  | "profile"
  | "version control"
  | "cloud";

const NAV: { id: Section; label: string; icon: typeof Monitor }[] = [
  { id: "general", label: "General", icon: Monitor },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "ai", label: "AI Agent", icon: Bot },
  { id: "security", label: "Security", icon: Shield },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "about", label: "About", icon: Info },
  { id: "profile", label: "Accounts", icon: User },
  { id: "version control", label: "Source Control", icon: GitBranch },
];

const CLOUD_DEPLOY_OPTIONS = [
  {
    id: "digitalocean",
    label: "DigitalOcean",
    description: "App Platform and managed database deploy flows.",
    href: "https://cloud.digitalocean.com/apps/new",
    note: "Fastest fit if you already use the AI agent token here.",
    accent: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  {
    id: "azure",
    label: "Microsoft Azure",
    description: "Azure App Service, Container Apps, and managed databases.",
    href: "https://portal.azure.com/#create/Microsoft.App",
    note: "Best fit if you plan to use Microsoft sign-in and Azure DevOps.",
    accent: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  {
    id: "aws",
    label: "AWS",
    description: "Open AWS console and start an app or database deployment.",
    href: "https://console.aws.amazon.com/console/home",
    note: "Good for ECS, Lambda, RDS, or EKS-based deployment paths.",
    accent: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  {
    id: "gcp",
    label: "Google Cloud",
    description: "Launch Cloud Run, GKE, or Cloud SQL setup from the console.",
    href: "https://console.cloud.google.com/run/create",
    note: "Pairs well with Google account sign-in once auth is wired.",
    accent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
] as const;

const ACCOUNT_OPTIONS: Array<{
  id: AccountAuthProvider;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    id: "microsoft",
    label: "Microsoft",
    description:
      "Use Microsoft identity for work and Azure-connected workflows.",
    accent: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  {
    id: "github",
    label: "GitHub",
    description:
      "Sign in with GitHub for user identity and future OAuth repo access.",
    accent: "bg-foreground/10 text-foreground border-foreground/10",
  },
  {
    id: "google",
    label: "Google",
    description:
      "Use Google sign-in for personal accounts and simple onboarding.",
    accent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  {
    id: "email",
    label: "Email",
    description: "Passwordless email entry point for a later magic-link flow.",
    accent: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
];

// ── Colour swatch input ────────────────────────────────────────
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-foreground">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-panel-border cursor-pointer bg-transparent"
        />
      </div>
    </label>
  );
}

// ── Terminal preview ───────────────────────────────────────────
function TerminalPreview({
  bg,
  fg,
  cursor,
}: {
  bg: string;
  fg: string;
  cursor: string;
}) {
  return (
    <div
      className="rounded font-mono text-[11px] p-3 leading-5 border border-panel-border overflow-hidden"
      style={{ background: bg, color: fg }}
    >
      <div>
        <span style={{ color: "#569cd6" }}>valstine</span>
        <span style={{ color: "#d7ba7d" }}>@studio</span>
        <span>:~$ </span>
        <span>SELECT * FROM users LIMIT 5;</span>
      </div>
      <div>
        <span style={{ color: "#6a9955" }}>-- 5 rows returned in 12ms</span>
      </div>
      <div> id │ email │ active</div>
      <div> ───┼────────────────────┼───────</div>
      <div> 1 │ alice@example.com │ true</div>
      <div> 2 │ bob@example.com │ false</div>
      <div>
        <span>valstine@studio:~$ </span>
        <span style={{ background: cursor, color: bg }}>&nbsp;</span>
      </div>
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────
function GeneralSection() {
  const { theme, toggleTheme } = useAppStore();
  const [updateStatus, setUpdateStatus] = useState<{
    tone: "idle" | "checking" | "success" | "error";
    message: string;
  }>({
    tone: "idle",
    message: "",
  });

  useEffect(() => {
    const api = window.updaterAPI;
    if (!api) return;

    const offChecking = api.onCheckingForUpdate(() => {
      setUpdateStatus({
        tone: "checking",
        message: "Checking for updates…",
      });
    });

    const offNotAvailable = api.onUpdateNotAvailable(() => {
      setUpdateStatus({
        tone: "success",
        message: "You already have the latest version.",
      });
    });

    const offAvailable = api.onUpdateAvailable(({ version }) => {
      setUpdateStatus({
        tone: "success",
        message: `Version ${version} is available and downloading now.`,
      });
    });

    const offDownloaded = api.onUpdateDownloaded(({ version }) => {
      setUpdateStatus({
        tone: "success",
        message: version
          ? `Version ${version} is ready to install. Restart from the update banner.`
          : "Update downloaded. Restart from the update banner to install it.",
      });
    });

    const offError = api.onUpdateError(({ message }) => {
      setUpdateStatus({
        tone: "error",
        message: message || "Unable to check for updates right now.",
      });
    });

    return () => {
      offChecking();
      offNotAvailable();
      offAvailable();
      offDownloaded();
      offError();
    };
  }, []);

  const handleManualUpdateCheck = () => {
    if (!window.updaterAPI) {
      setUpdateStatus({
        tone: "error",
        message:
          "Update checks are only available in the packaged desktop app.",
      });
      return;
    }

    setUpdateStatus({
      tone: "checking",
      message: "Checking for updates…",
    });
    window.updaterAPI.checkForUpdates();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">
          Appearance
        </h3>
        <div className="flex items-center justify-between py-2 border-b border-panel-border/50">
          <div>
            <div className="text-xs text-foreground">Color Theme</div>
            <div className="text-[11px] text-muted-foreground">
              Switch between dark and light mode
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-panel-border text-xs text-foreground hover:bg-secondary transition-colors"
          >
            {theme === "dark" ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Updates</h3>
        <div className="flex items-start justify-between gap-4 py-2 border-b border-panel-border/50">
          <div className="min-w-0">
            <div className="text-xs text-foreground">Check for updates</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Manually check for the latest Valstine Studio release.
            </div>
          </div>
          <button
            onClick={handleManualUpdateCheck}
            disabled={updateStatus.tone === "checking"}
            className="inline-flex shrink-0 items-center gap-2 rounded border border-panel-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateStatus.tone === "checking" ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {updateStatus.tone === "checking" ? "Checking..." : "Check now"}
          </button>
        </div>

        {updateStatus.message && (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded border px-3 py-2 text-[11px]",
              updateStatus.tone === "error"
                ? "border-red-500/20 bg-red-500/10 text-red-400"
                : updateStatus.tone === "success"
                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                  : "border-panel-border bg-secondary/30 text-muted-foreground",
            )}
          >
            {updateStatus.tone === "checking" ? (
              <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : updateStatus.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : updateStatus.tone === "error" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : null}
            <span>{updateStatus.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalSection() {
  const { settings, updateTerminalSettings } = useAppStore();
  const ts = settings.terminal;

  const handlePresetChange = (presetId: string) => {
    const preset = getPresetById(presetId);
    updateTerminalSettings({
      presetId,
      background: preset.colors.background,
      foreground: preset.colors.foreground,
      cursor: preset.colors.cursor,
      selectionBackground: preset.colors.selectionBackground,
    });
  };

  const previewColors =
    ts.presetId === "custom"
      ? { bg: ts.background, fg: ts.foreground, cursor: ts.cursor }
      : (() => {
          const c = getPresetById(ts.presetId).colors;
          return { bg: c.background, fg: c.foreground, cursor: c.cursor };
        })();

  return (
    <div className="space-y-5">
      {/* Theme preset */}
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Theme</h3>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {TERMINAL_PRESETS.map((p) => {
            const isActive = ts.presetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={cn(
                  "flex flex-col items-start gap-1.5 p-2 rounded border text-left transition-colors",
                  isActive
                    ? "border-primary bg-primary/10"
                    : "border-panel-border hover:border-primary/40",
                )}
              >
                {/* Mini colour swatch */}
                <div className="flex gap-0.5 w-full">
                  <div
                    className="h-3 flex-1 rounded-sm"
                    style={{ background: p.colors.background }}
                  />
                  <div
                    className="h-3 w-3 rounded-sm"
                    style={{ background: p.colors.foreground }}
                  />
                  <div
                    className="h-3 w-3 rounded-sm"
                    style={{ background: p.colors.cursor }}
                  />
                </div>
                <span className="text-[10px] text-foreground leading-none">
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom colours (only when presetId === 'custom') */}
      {ts.presetId === "custom" && (
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-2">
            Custom Colors
          </h3>
          <div className="space-y-0.5">
            <ColorField
              label="Background"
              value={ts.background}
              onChange={(v) => updateTerminalSettings({ background: v })}
            />
            <ColorField
              label="Foreground (text)"
              value={ts.foreground}
              onChange={(v) => updateTerminalSettings({ foreground: v })}
            />
            <ColorField
              label="Cursor"
              value={ts.cursor}
              onChange={(v) => updateTerminalSettings({ cursor: v })}
            />
            <ColorField
              label="Selection"
              value={ts.selectionBackground}
              onChange={(v) =>
                updateTerminalSettings({ selectionBackground: v })
              }
            />
          </div>
        </div>
      )}

      {/* Font */}
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Font</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">
              Font Family
            </label>
            <input
              value={ts.fontFamily}
              onChange={(e) =>
                updateTerminalSettings({ fontFamily: e.target.value })
              }
              className="w-full px-2 py-1.5 rounded border border-panel-border bg-panel-bg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">
              Font Size — {ts.fontSize}px
            </label>
            <input
              type="range"
              min={10}
              max={22}
              value={ts.fontSize}
              onChange={(e) =>
                updateTerminalSettings({ fontSize: parseInt(e.target.value) })
              }
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>10</span>
              <span>22</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-2">Preview</h3>
        <TerminalPreview
          bg={previewColors.bg}
          fg={previewColors.fg}
          cursor={previewColors.cursor}
        />
      </div>
    </div>
  );
}

function AISection() {
  const { doAiToken, setDoAiToken } = useAppStore();
  const [draft, setDraft] = useState(doAiToken);
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setDoAiToken(draft.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-1">AI Agent</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Valstine Studio is connected to a Gen AI agent. If the agent requires
          authentication, enter your API token below.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">
              API Token (optional)
            </label>
            <div className="flex gap-1">
              <input
                type={visible ? "text" : "password"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="api_v1_..."
                className="flex-1 h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <button
                onClick={() => setVisible((v) => !v)}
                className="px-2 rounded border border-panel-border hover:bg-secondary text-muted-foreground"
                title={visible ? "Hide token" : "Show token"}
              >
                {visible ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            {saved ? "Saved!" : "Save Token"}
          </button>
          {doAiToken && (
            <div className="text-[11px] text-muted-foreground p-2 bg-secondary/30 rounded">
              Token is saved. The AI chat sidebar will include it with each
              request.
            </div>
          )}
        </div>
      </div>

      <div className="pt-1">
        <h3 className="text-xs font-semibold text-foreground mb-2">
          Agent Endpoint
        </h3>
        <div className="font-mono text-[11px] text-muted-foreground bg-secondary/30 rounded px-2.5 py-2 break-all">
          https://a3wb4h5l3ao4rvv6yle57zjj.agents.do-ai.run
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Requests are proxied server-side. The agent receives your SQL context
          and conversation history automatically.
        </p>
      </div>
    </div>
  );
}

function SecuritySection() {
  const { settings, updateSettings, connections } = useAppStore();
  const [showWarning, setShowWarning] = useState(false);

  const handleToggle = (val: boolean) => {
    if (val && !showWarning) {
      setShowWarning(true);
      return;
    }
    updateSettings({ savePasswords: val });
    setShowWarning(false);
  };

  const hasSavedPasswords = connections.some((c) => !!c.password);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">
          Password Storage
        </h3>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 py-2 border-b border-panel-border/50">
            <div className="min-w-0">
              <div className="text-xs text-foreground">
                Save passwords locally
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Store connection passwords encrypted in the local SQLite
                database. Passwords are never sent to any cloud service.
              </div>
            </div>
            <button
              onClick={() => handleToggle(!settings.savePasswords)}
              className={cn(
                "relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                settings.savePasswords ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                  settings.savePasswords ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </button>
          </div>

          {showWarning && (
            <div className="flex items-start gap-2 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium mb-1">
                  Storing passwords locally
                </div>
                <div className="text-[11px] opacity-80">
                  Passwords are encrypted with AES-256-GCM before being written
                  to the local database. Only enable this on trusted personal
                  devices.
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      updateSettings({ savePasswords: true });
                      setShowWarning(false);
                    }}
                    className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] hover:bg-amber-600"
                  >
                    Enable anyway
                  </button>
                  <button
                    onClick={() => setShowWarning(false)}
                    className="px-2 py-1 border border-amber-500/40 rounded text-[10px] hover:bg-amber-500/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {settings.savePasswords && (
            <div className="text-[11px] text-muted-foreground p-2 bg-secondary/30 rounded">
              Passwords are saved. New connections will persist their passwords
              across sessions.
              {hasSavedPasswords &&
                " Existing connections already have passwords saved."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CloudSection() {
  const [statusMessage, setStatusMessage] = useState("");

  const launchProvider = (label: string, href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
    setStatusMessage(`${label} deploy flow opened in a new tab.`);
    setTimeout(() => setStatusMessage(""), 2500);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-2">
          Cloud Deploy
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Start deployment from the cloud provider you want to target. These
          actions open the provider's deploy flow now, and you can wire them to
          your real in-app deployment backend later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {CLOUD_DEPLOY_OPTIONS.map((provider) => (
          <div
            key={provider.id}
            className="rounded border border-panel-border bg-secondary/20 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded border text-[10px] font-semibold uppercase",
                      provider.accent,
                    )}
                  >
                    {provider.label.slice(0, 1)}
                  </span>
                  <div>
                    <div className="text-xs font-medium text-foreground">
                      {provider.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {provider.description}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {provider.note}
                </div>
              </div>
              <button
                onClick={() => launchProvider(provider.label, provider.href)}
                className="shrink-0 inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Deploy
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded border border-dashed border-panel-border px-3 py-2 text-[10px] text-muted-foreground">
        This is a launcher action today, not a full deployment pipeline. Once
        your real auth and deploy backend exist, these same buttons can call
        that flow instead of opening external provider pages.
      </div>

      {statusMessage && (
        <div className="rounded border border-green-400/20 bg-green-400/10 px-3 py-2 text-[11px] text-green-400">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">
          Valstine Studio
        </h3>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Version</span>
            <span className="text-foreground font-mono">0.1.0</span>
          </div>
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Runtime</span>
            <span className="text-foreground font-mono">Bun + React</span>
          </div>
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Terminal</span>
            <span className="text-foreground font-mono">xterm.js</span>
          </div>
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Editor</span>
            <span className="text-foreground font-mono">Monaco</span>
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">
          Keyboard Shortcuts
        </h3>
        <div className="space-y-1 text-[11px]">
          {[
            ["Run query", "⌘ Enter"],
            ["Command palette", "⌘ K"],
            ["Toggle sidebar", "⌘ B"],
            ["New tab", "⌘ T"],
          ].map(([label, key]) => (
            <div
              key={label}
              className="flex justify-between py-1 border-b border-panel-border/30"
            >
              <span className="text-muted-foreground">{label}</span>
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-panel-border bg-secondary text-foreground">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
      <div className="pt-2">
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-primary">Coming soon:</span> Deploy
          to DigitalOcean, managed cloud databases, team workspaces, and more.
        </div>
      </div>
    </div>
  );
}

function ProfileSection() {
  const { settings, updateAccountProvider } = useAppStore();
  const accounts = settings.accounts;
  const [emailDraft, setEmailDraft] = useState(accounts.email.identifier);
  const [statusMessage, setStatusMessage] = useState("");

  const flash = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(""), 2000);
  };

  const connectProvider = (provider: AccountAuthProvider) => {
    if (provider === "email") {
      const email = emailDraft.trim();
      if (!email) {
        flash("Enter an email first");
        return;
      }
      updateAccountProvider("email", {
        status: "authorized",
        identifier: email,
      });
      flash("Email sign-in placeholder saved");
      return;
    }

    const label =
      ACCOUNT_OPTIONS.find((option) => option.id === provider)?.label ??
      provider;
    updateAccountProvider(provider, {
      status: "authorized",
      identifier: `${label} account`,
    });
    flash(`${label} auth entry point is ready for OAuth wiring`);
  };

  const disconnectProvider = (provider: AccountAuthProvider) => {
    updateAccountProvider(provider, { status: "signed-out", identifier: "" });
    if (provider === "email") setEmailDraft("");
    flash("Account disconnected");
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-2">Accounts</h3>
        <p className="text-[11px] text-muted-foreground">
          Keep sign-in entry points simple. Connect an account here, then let
          each feature use that identity later.
        </p>
      </div>

      <div className="space-y-2">
        {ACCOUNT_OPTIONS.map((option) => {
          const account = accounts[option.id];
          const connected = account.status === "authorized";

          return (
            <div
              key={option.id}
              className="rounded border border-panel-border bg-secondary/20 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded border text-[10px] font-semibold uppercase",
                        option.accent,
                      )}
                    >
                      {option.label.slice(0, 1)}
                    </span>
                    <div>
                      <div className="text-xs font-medium text-foreground">
                        {option.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {connected
                      ? `Connected as ${account.identifier || option.label}`
                      : "Signed out"}
                  </div>
                </div>
                <button
                  onClick={() =>
                    connected
                      ? disconnectProvider(option.id)
                      : connectProvider(option.id)
                  }
                  className={cn(
                    "shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                    connected
                      ? "border border-panel-border text-muted-foreground hover:bg-secondary"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {connected
                    ? "Disconnect"
                    : option.id === "email"
                      ? "Continue"
                      : `Sign in`}
                </button>
              </div>

              {option.id === "email" && !connected && (
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded border border-dashed border-panel-border px-3 py-2 text-[10px] text-muted-foreground">
        These buttons are intentionally scaffolding only. Later you can swap
        each handler for the real OAuth or email-link flow without changing the
        layout.
      </div>

      {statusMessage && (
        <div className="text-[11px] text-green-400 bg-green-400/10 border border-green-400/20 rounded px-3 py-2">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

function VersionControlSection() {
  const {
    settings,
    githubToken,
    azureDevOpsToken,
    setGithubToken,
    setAzureDevOpsToken,
    updateSourceControlSettings,
  } = useAppStore();
  const sourceControl = settings.sourceControl;
  const provider = sourceControl.provider;
  const providerLabel = getSourceControlProviderLabel(provider);
  const [githubDraft, setGithubDraft] = useState(githubToken);
  const [azureDraft, setAzureDraft] = useState(azureDevOpsToken);
  const [azureOrganization, setAzureOrganization] = useState(
    sourceControl.azureOrganization,
  );
  const [azureProject, setAzureProject] = useState(sourceControl.azureProject);
  const [savedMessage, setSavedMessage] = useState("");

  const flashSaved = (message: string) => {
    setSavedMessage(message);
    setTimeout(() => setSavedMessage(""), 2000);
  };

  const saveGitHubToken = async () => {
    await setGithubToken(githubDraft.trim());
    flashSaved(
      githubDraft.trim() ? "GitHub token saved" : "GitHub token cleared",
    );
  };

  const saveAzureDevOps = async () => {
    updateSourceControlSettings({
      azureOrganization: azureOrganization.trim(),
      azureProject: azureProject.trim(),
    });
    await setAzureDevOpsToken(azureDraft.trim());
    flashSaved("Azure DevOps settings saved");
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-2">
          Primary Provider
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Keep this simple: pick the provider your repository tooling should
          use. Account sign-in lives in Accounts.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "github", label: "GitHub" },
            { id: "azure-devops", label: "Azure DevOps" },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() =>
                updateSourceControlSettings({
                  provider: option.id as "github" | "azure-devops",
                })
              }
              className={cn(
                "rounded border px-3 py-2 text-left transition-colors",
                provider === option.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-panel-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <div className="text-xs font-medium">{option.label}</div>
              <div className="text-[10px] mt-1 opacity-80">
                {option.id === "github"
                  ? "Repo browsing, clone helpers, schema push"
                  : "Organization repos, repo creation, Azure remotes"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">
          Provider Access
        </h3>
        <div className="rounded border border-panel-border bg-secondary/20 p-3 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Provider</span>
            <span className="font-medium text-foreground">{providerLabel}</span>
          </div>
          {provider === "github" ? (
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground block">
                GitHub Personal Access Token
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={githubDraft}
                  onChange={(e) => setGithubDraft(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="flex-1 h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <button
                  onClick={saveGitHubToken}
                  className="px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Keep PAT-based automation here until GitHub OAuth is fully
                wired.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground block">
                Azure DevOps Personal Access Token
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={azureDraft}
                  onChange={(e) => setAzureDraft(e.target.value)}
                  placeholder="ado_pat_xxxxxxxxxxxx"
                  className="flex-1 h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <button
                  onClick={saveAzureDevOps}
                  className="px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Save
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">
                    Organization
                  </label>
                  <input
                    value={azureOrganization}
                    onChange={(e) => setAzureOrganization(e.target.value)}
                    placeholder="your-org"
                    className="w-full h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">
                    Default Project
                  </label>
                  <input
                    value={azureProject}
                    onChange={(e) => setAzureProject(e.target.value)}
                    placeholder="Platform"
                    className="w-full h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Only the organization and default project are needed here for
                Azure repo automation.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="pt-2">
        {savedMessage ? (
          <div className="text-[11px] text-green-400 bg-green-400/10 border border-green-400/20 rounded px-3 py-2">
            {savedMessage}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            Source Control stays intentionally small. Sign-in providers live in
            Accounts, and this page only keeps the provider-specific automation
            details.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────
export function SettingsPanel() {
  const {
    settingsPanelOpen,
    settingsPanelSection,
    setSettingsPanelSection,
    closeSettingsPanel,
  } = useAppStore();
  const section = settingsPanelSection;

  if (!settingsPanelOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeSettingsPanel}
      />

      {/* Dialog */}
      <div className="relative z-10 w-[720px] max-w-[96vw] h-[520px] max-h-[90vh] bg-panel-bg border border-panel-border rounded-xl shadow-2xl flex overflow-hidden">
        {/* Left nav */}
        <div className="w-44 shrink-0 bg-titlebar/50 border-r border-panel-border flex flex-col py-2">
          <div className="px-4 py-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Settings
            </span>
          </div>
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSettingsPanelSection(item.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-xs transition-colors text-left",
                section === item.id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
              )}
            >
              {section === item.id && (
                <div className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />
              )}
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              {item.label}
              {section === item.id && (
                <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-panel-border shrink-0">
            <h2 className="text-sm font-semibold text-foreground">
              {NAV.find((n) => n.id === section)?.label}
            </h2>
            <button
              onClick={closeSettingsPanel}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {section === "general" && <GeneralSection />}
            {section === "terminal" && <TerminalSection />}
            {section === "ai" && <AISection />}
            {section === "security" && <SecuritySection />}
            {section === "cloud" && <CloudSection />}
            {section === "about" && <AboutSection />}
            {section === "profile" && <ProfileSection />}
            {section === "version control" && <VersionControlSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
