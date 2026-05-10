import { useState } from "react";
import { X, Monitor, Terminal, Shield, Info, ChevronRight, Sun, Moon, AlertTriangle, Bot, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { TERMINAL_PRESETS, getPresetById } from "@/lib/terminal-themes";

type Section = "general" | "terminal" | "ai" | "security" | "about";

const NAV: { id: Section; label: string; icon: typeof Monitor }[] = [
  { id: "general", label: "General", icon: Monitor },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "ai", label: "AI Agent", icon: Bot },
  { id: "security", label: "Security", icon: Shield },
  { id: "about", label: "About", icon: Info },
];

// ── Colour swatch input ────────────────────────────────────────
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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
function TerminalPreview({ bg, fg, cursor }: { bg: string; fg: string; cursor: string }) {
  return (
    <div
      className="rounded font-mono text-[11px] p-3 leading-5 border border-panel-border overflow-hidden"
      style={{ background: bg, color: fg }}
    >
      <div><span style={{ color: "#569cd6" }}>valstine</span><span style={{ color: "#d7ba7d" }}>@studio</span><span>:~$ </span><span>SELECT * FROM users LIMIT 5;</span></div>
      <div><span style={{ color: "#6a9955" }}>-- 5 rows returned in 12ms</span></div>
      <div> id │ email              │ active</div>
      <div> ───┼────────────────────┼───────</div>
      <div>  1 │ alice@example.com  │ true</div>
      <div>  2 │ bob@example.com    │ false</div>
      <div><span>valstine@studio:~$ </span><span style={{ background: cursor, color: bg }}>&nbsp;</span></div>
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────
function GeneralSection() {
  const { theme, toggleTheme } = useAppStore();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Appearance</h3>
        <div className="flex items-center justify-between py-2 border-b border-panel-border/50">
          <div>
            <div className="text-xs text-foreground">Color Theme</div>
            <div className="text-[11px] text-muted-foreground">Switch between dark and light mode</div>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-panel-border text-xs text-foreground hover:bg-secondary transition-colors"
          >
            {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>
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

  const previewColors = ts.presetId === "custom"
    ? { bg: ts.background, fg: ts.foreground, cursor: ts.cursor }
    : (() => { const c = getPresetById(ts.presetId).colors; return { bg: c.background, fg: c.foreground, cursor: c.cursor }; })();

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
                  isActive ? "border-primary bg-primary/10" : "border-panel-border hover:border-primary/40",
                )}
              >
                {/* Mini colour swatch */}
                <div className="flex gap-0.5 w-full">
                  <div className="h-3 flex-1 rounded-sm" style={{ background: p.colors.background }} />
                  <div className="h-3 w-3 rounded-sm" style={{ background: p.colors.foreground }} />
                  <div className="h-3 w-3 rounded-sm" style={{ background: p.colors.cursor }} />
                </div>
                <span className="text-[10px] text-foreground leading-none">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom colours (only when presetId === 'custom') */}
      {ts.presetId === "custom" && (
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-2">Custom Colors</h3>
          <div className="space-y-0.5">
            <ColorField label="Background" value={ts.background} onChange={(v) => updateTerminalSettings({ background: v })} />
            <ColorField label="Foreground (text)" value={ts.foreground} onChange={(v) => updateTerminalSettings({ foreground: v })} />
            <ColorField label="Cursor" value={ts.cursor} onChange={(v) => updateTerminalSettings({ cursor: v })} />
            <ColorField label="Selection" value={ts.selectionBackground} onChange={(v) => updateTerminalSettings({ selectionBackground: v })} />
          </div>
        </div>
      )}

      {/* Font */}
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Font</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Font Family</label>
            <input
              value={ts.fontFamily}
              onChange={(e) => updateTerminalSettings({ fontFamily: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-panel-border bg-panel-bg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Font Size — {ts.fontSize}px</label>
            <input
              type="range"
              min={10}
              max={22}
              value={ts.fontSize}
              onChange={(e) => updateTerminalSettings({ fontSize: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>10</span><span>22</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-2">Preview</h3>
        <TerminalPreview bg={previewColors.bg} fg={previewColors.fg} cursor={previewColors.cursor} />
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
        <h3 className="text-xs font-semibold text-foreground mb-1">DigitalOcean AI Agent</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Valstine Studio is connected to a DigitalOcean Gen AI agent. If the agent requires authentication, enter your DigitalOcean API token below.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">DigitalOcean API Token (optional)</label>
            <div className="flex gap-1">
              <input
                type={visible ? "text" : "password"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="dop_v1_..."
                className="flex-1 h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <button
                onClick={() => setVisible((v) => !v)}
                className="px-2 rounded border border-panel-border hover:bg-secondary text-muted-foreground"
                title={visible ? "Hide token" : "Show token"}
              >
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
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
              Token is saved. The AI chat sidebar will include it with each request.
            </div>
          )}
        </div>
      </div>

      <div className="pt-1">
        <h3 className="text-xs font-semibold text-foreground mb-2">Agent Endpoint</h3>
        <div className="font-mono text-[11px] text-muted-foreground bg-secondary/30 rounded px-2.5 py-2 break-all">
          https://a3wb4h5l3ao4rvv6yle57zjj.agents.do-ai.run
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Requests are proxied server-side. The agent receives your SQL context and conversation history automatically.
        </p>
      </div>
    </div>
  );
}

function SecuritySection() {
  const { settings, updateSettings, connections } = useAppStore();
  const [showWarning, setShowWarning] = useState(false);

  const handleToggle = (val: boolean) => {
    if (val && !showWarning) { setShowWarning(true); return; }
    updateSettings({ savePasswords: val });
    setShowWarning(false);
  };

  const hasSavedPasswords = connections.some((c) => !!c.password);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Password Storage</h3>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 py-2 border-b border-panel-border/50">
            <div className="min-w-0">
              <div className="text-xs text-foreground">Save passwords locally</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Store connection passwords encrypted in the local SQLite database. Passwords are never sent to any cloud service.
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
                <div className="font-medium mb-1">Storing passwords locally</div>
                <div className="text-[11px] opacity-80">Passwords are encrypted with AES-256-GCM before being written to the local database. Only enable this on trusted personal devices.</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { updateSettings({ savePasswords: true }); setShowWarning(false); }} className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] hover:bg-amber-600">
                    Enable anyway
                  </button>
                  <button onClick={() => setShowWarning(false)} className="px-2 py-1 border border-amber-500/40 rounded text-[10px] hover:bg-amber-500/10">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {settings.savePasswords && (
            <div className="text-[11px] text-muted-foreground p-2 bg-secondary/30 rounded">
              Passwords are saved. New connections will persist their passwords across sessions.
              {hasSavedPasswords && " Existing connections already have passwords saved."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Valstine Studio</h3>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Version</span><span className="text-foreground font-mono">0.1.0</span>
          </div>
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Runtime</span><span className="text-foreground font-mono">Bun + React</span>
          </div>
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Terminal</span><span className="text-foreground font-mono">xterm.js</span>
          </div>
          <div className="flex justify-between py-1 border-b border-panel-border/30">
            <span>Editor</span><span className="text-foreground font-mono">Monaco</span>
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-3">Keyboard Shortcuts</h3>
        <div className="space-y-1 text-[11px]">
          {[
            ["Run query", "⌘ Enter"],
            ["Command palette", "⌘ K"],
            ["Toggle sidebar", "⌘ B"],
            ["New tab", "⌘ T"],
          ].map(([label, key]) => (
            <div key={label} className="flex justify-between py-1 border-b border-panel-border/30">
              <span className="text-muted-foreground">{label}</span>
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-panel-border bg-secondary text-foreground">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
      <div className="pt-2">
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-primary">Coming soon:</span> Deploy to DigitalOcean, managed cloud databases, team workspaces, and more.
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────
export function SettingsPanel() {
  const { settingsPanelOpen, closeSettingsPanel } = useAppStore();
  const [section, setSection] = useState<Section>("general");

  if (!settingsPanelOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeSettingsPanel} />

      {/* Dialog */}
      <div className="relative z-10 w-[720px] max-w-[96vw] h-[520px] max-h-[90vh] bg-panel-bg border border-panel-border rounded-xl shadow-2xl flex overflow-hidden">
        {/* Left nav */}
        <div className="w-44 shrink-0 bg-titlebar/50 border-r border-panel-border flex flex-col py-2">
          <div className="px-4 py-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Settings</span>
          </div>
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
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
              {section === item.id && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
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
            {section === "about" && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
