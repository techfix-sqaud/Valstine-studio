import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Play, Sparkles, StopCircle, Database, WrapText, Zap, BookOpen, Save, X,
  ArrowLeftRight, FlaskConical, FolderOpen, Download, AlertTriangle, ListChecks,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { getActiveEditor } from "@/lib/editor-ref";
import * as api from "@/lib/api";
import { ExplainModal } from "./ExplainModal";
import { SavedQueriesModal } from "./SavedQueriesModal";
import { translateSqlDialect } from "@/lib/sql-formatter";
import type { DBType } from "@/lib/mock-data";

// ── Portal-based popup — escapes any ancestor overflow clipping ────────────────
function PortalPopup({
  anchor, open, onClose, className = "", children,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open && anchor) {
      const rect = anchor.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    } else if (!open) {
      setPos(null);
    }
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchor && !anchor.contains(e.target as Node)
      ) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchor]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className={`rounded-lg border border-panel-border bg-panel-bg shadow-xl ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

// ── Save query dialog ──────────────────────────────────────────────────────────
function SaveQueryDialog({ anchor, open, onClose }: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const { tabs, activeTabId, activeConnectionId, connections } = useAppStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const conn = connections.find((c) => c.id === activeConnectionId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeTab?.content?.trim()) return;
    setSaving(true);
    try {
      await api.appSaveQuery({
        name: name.trim(),
        description: description.trim(),
        sql: activeTab.content.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        connectionType: conn?.type ?? "",
      });
      setName(""); setDescription(""); setTags("");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalPopup anchor={anchor} open={open} onClose={onClose} className="w-72">
      <form onSubmit={handleSave} className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-foreground">Save Query</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Query name *"
          className="w-full rounded border border-panel-border bg-secondary px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full rounded border border-panel-border bg-secondary px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
        />
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags: analytics, reports"
          className="w-full rounded border border-panel-border bg-secondary px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="w-full rounded bg-primary px-3 py-1 text-xs text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </PortalPopup>
  );
}

// ── Translate dropdown ─────────────────────────────────────────────────────────
const DIALECT_OPTIONS: { type: DBType; label: string; icon: string }[] = [
  { type: "pg",     label: "PostgreSQL", icon: "🐘" },
  { type: "mysql",  label: "MySQL",      icon: "🐬" },
  { type: "mssql",  label: "SQL Server", icon: "🪟" },
  { type: "sqlite", label: "SQLite",     icon: "📦" },
];

function TranslatePopup({ anchor, open, fromType, sql, onTranslated, onClose }: {
  anchor: HTMLElement | null;
  open: boolean;
  fromType: DBType;
  sql: string;
  onTranslated: (sql: string, changes: string[]) => void;
  onClose: () => void;
}) {
  return (
    <PortalPopup anchor={anchor} open={open} onClose={onClose} className="min-w-[160px]">
      <p className="px-3 py-1.5 text-[10px] text-muted-foreground font-medium border-b border-panel-border">Translate to…</p>
      {DIALECT_OPTIONS.filter((d) => d.type !== fromType).map((d) => (
        <button
          key={d.type}
          onClick={() => {
            const { sql: out, changes } = translateSqlDialect(sql, fromType, d.type);
            onTranslated(out, changes);
            onClose();
          }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{d.icon}</span> {d.label}
        </button>
      ))}
    </PortalPopup>
  );
}

// ── Session menu ───────────────────────────────────────────────────────────────
function SessionPopup({ anchor, open, tabs, addTab, setActiveTab, onClose }: {
  anchor: HTMLElement | null;
  open: boolean;
  tabs: import("@/lib/mock-data").QueryTab[];
  addTab: (tab: import("@/lib/mock-data").QueryTab) => void;
  setActiveTab: (id: string) => void;
  onClose: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);

  function exportSession() {
    const queryTabs = tabs.filter(
      (t) => t.type !== "schema" && t.type !== "schema-diff" && t.type !== "dashboard",
    );
    const session = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tabs: queryTabs.map((t) => ({
        title: t.title,
        content: t.content,
        connectionId: t.connectionId,
        type: t.type ?? "query",
      })),
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valstine-session-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const session = JSON.parse(ev.target?.result as string);
        if (!session?.tabs || !Array.isArray(session.tabs)) return;
        let lastId = "";
        for (const t of session.tabs) {
          const id = `restored-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          addTab({
            id,
            title: t.title ?? "Restored",
            content: t.content ?? "",
            connectionId: t.connectionId ?? "",
            isDirty: false,
            type: t.type ?? "query",
          });
          lastId = id;
        }
        if (lastId) setActiveTab(lastId);
      } catch { /* ignore malformed */ }
    };
    reader.readAsText(file);
    e.target.value = "";
    onClose();
  }

  return (
    <>
      <PortalPopup anchor={anchor} open={open} onClose={onClose} className="min-w-[190px]">
        <p className="px-3 py-1.5 text-[10px] text-muted-foreground font-medium border-b border-panel-border">
          Investigation Session
        </p>
        <button
          onClick={exportSession}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Export tabs as JSON
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Import session from JSON
        </button>
      </PortalPopup>
      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
    </>
  );
}

// ── Main toolbar ───────────────────────────────────────────────────────────────
export function EditorToolbar() {
  const {
    executeQuery,
    runQuery,
    runAllStatements,
    isExecuting,
    activeConnectionId,
    openAiSidebar,
    connections,
    tabs,
    activeTabId,
    updateTabContent,
    dryRunMode,
    toggleDryRun,
    addTab,
    setActiveTab,
  } = useAppStore();
  const conn = connections.find((c) => c.id === activeConnectionId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Track editor selection so Run button shows context-aware label
  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => {
      const editor = getActiveEditor();
      if (!editor) return;
      const sel = editor.getSelection();
      setHasSelection(!!sel && !sel.isEmpty());
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Refs to anchor portal popups to their trigger buttons
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const translateBtnRef = useRef<HTMLButtonElement>(null);
  const sessionBtnRef = useRef<HTMLButtonElement>(null);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPlan, setExplainPlan] = useState<any>(null);
  const [explainDbType, setExplainDbType] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [translateChanges, setTranslateChanges] = useState<string[]>([]);

  // Auto-dismiss explain error
  useEffect(() => {
    if (!explainError) return;
    const t = setTimeout(() => setExplainError(null), 4000);
    return () => clearTimeout(t);
  }, [explainError]);

  // Auto-dismiss translation toast
  useEffect(() => {
    if (!translateChanges.length) return;
    const t = setTimeout(() => setTranslateChanges([]), 4000);
    return () => clearTimeout(t);
  }, [translateChanges]);

  // Run: selection → run selection; else → run full content
  const handleRun = () => {
    const editor = getActiveEditor();
    const sel = editor?.getSelection();
    const model = editor?.getModel();
    if (sel && model && !sel.isEmpty()) {
      const selectedText = model.getValueInRange(sel).trim();
      if (selectedText) { runQuery(selectedText); return; }
    }
    executeQuery();
  };

  // Detect multiple statements in the active tab
  const statementCount = (activeTab?.content ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !/^--/.test(s)).length;

  const handleFormat = () => {
    getActiveEditor()?.getAction("editor.action.formatDocument")?.run();
  };

  async function handleExplain() {
    if (!conn || !activeTab?.content?.trim()) return;
    const editor = getActiveEditor();
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    const selectedText =
      selection && model && !selection.isEmpty()
        ? model.getValueInRange(selection)
        : activeTab.content;

    setExplainLoading(true);
    setExplainError(null);
    try {
      const res = await api.explainQuery(conn, selectedText.trim());
      if (res.ok) {
        setExplainPlan(res.plan);
        setExplainDbType(res.dbType);
        setExplainOpen(true);
      } else {
        setExplainError(res.error ?? "EXPLAIN failed — check that the query is a SELECT or DML statement.");
      }
    } catch (err: any) {
      setExplainError(err.message ?? "Failed to fetch explain plan.");
    } finally {
      setExplainLoading(false);
    }
  }

  // Listen for menu-triggered explain (from MenuBar)
  useEffect(() => {
    const handler = () => handleExplain();
    window.addEventListener("valstine:explain", handler);
    return () => window.removeEventListener("valstine:explain", handler);
  }, [conn, activeTab]);

  return (
    <div className="h-8 bg-panel-bg border-b border-panel-border flex items-center px-1.5 sm:px-2 gap-1 shrink-0 overflow-x-auto">
      {/* Run */}
      <button
        onClick={handleRun}
        disabled={isExecuting}
        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 shrink-0 ${
          hasSelection
            ? "bg-primary/15 text-primary hover:bg-primary/25"
            : "bg-success/15 text-success hover:bg-success/25"
        }`}
        title={hasSelection ? "Run selected text (⌘Enter)" : "Run query (⌘Enter)"}
      >
        {isExecuting ? (
          <><StopCircle className="w-3.5 h-3.5 animate-pulse" /><span className="hidden xs:inline">Running…</span></>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{hasSelection ? "Run Selection" : "Run"}</span>
          </>
        )}
      </button>

      {/* Run All — shown when multiple statements detected */}
      {statementCount > 1 && !hasSelection && (
        <button
          onClick={runAllStatements}
          disabled={isExecuting}
          className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 shrink-0 border border-border/50"
          title={`Run all ${statementCount} statements sequentially`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Run All ({statementCount})</span>
        </button>
      )}

      <div className="h-4 w-px bg-border mx-0.5 sm:mx-1 shrink-0" />

      {/* Format */}
      <button
        onClick={handleFormat}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
        title="Format SQL (⌘⇧F)"
      >
        <WrapText className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Format</span>
      </button>

      {/* Dry Run */}
      <button
        onClick={toggleDryRun}
        className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs transition-colors shrink-0 ${
          dryRunMode
            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        }`}
        title="Dry Run — wraps query in BEGIN/ROLLBACK, no data committed"
      >
        <FlaskConical className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{dryRunMode ? "Dry Run ON" : "Dry Run"}</span>
      </button>

      {/* Explain — not available for connection types without EXPLAIN support (e.g. Cassandra) */}
      <button
        onClick={handleExplain}
        disabled={explainLoading || !conn || !api.DB_TYPE_CAPABILITIES[conn.type].supportsExplain}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 shrink-0"
        title={conn && !api.DB_TYPE_CAPABILITIES[conn.type].supportsExplain ? "Not supported for this database type" : "Explain query plan"}
      >
        <Zap className={`w-3.5 h-3.5 ${explainLoading ? "animate-pulse text-yellow-400" : ""}`} />
        <span className="hidden sm:inline">Explain</span>
      </button>

      <div className="h-4 w-px bg-border mx-0.5 sm:mx-1 shrink-0" />

      {/* Save — portal-based popup */}
      <button
        ref={saveBtnRef}
        onClick={() => setSaveOpen((v) => !v)}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
        title="Save current query"
      >
        <Save className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Save</span>
      </button>

      {/* Library */}
      <button
        onClick={() => setLibraryOpen(true)}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
        title="Query library"
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Library</span>
      </button>

      {/* Session — portal-based popup */}
      <button
        ref={sessionBtnRef}
        onClick={() => setSessionOpen((v) => !v)}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
        title="Save / load investigation session"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Session</span>
      </button>

      {/* Translate — portal-based popup. DIALECT_OPTIONS only lists SQL dialects,
          so this is meaningless for non-SQL connections like Cassandra. */}
      <button
        ref={translateBtnRef}
        onClick={() => setTranslateOpen((v) => !v)}
        disabled={!conn || !activeTab?.content?.trim() || conn.type === "cassandra"}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 shrink-0"
        title={conn?.type === "cassandra" ? "Not applicable for CQL" : "Translate SQL to another dialect"}
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Translate</span>
      </button>

      {/* AI Assist */}
      <button
        onClick={openAiSidebar}
        className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
      >
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="hidden sm:inline">AI Assist</span>
      </button>

      {/* Connection indicator */}
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground shrink-0">
        <Database className="w-3 h-3 text-success" />
        <span className="hidden sm:inline truncate max-w-[120px]">{conn?.name}</span>
      </div>

      {/* ── Portal popups — rendered outside overflow container via portals ── */}
      <SaveQueryDialog
        anchor={saveBtnRef.current}
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
      />

      <SessionPopup
        anchor={sessionBtnRef.current}
        open={sessionOpen}
        tabs={tabs}
        addTab={addTab}
        setActiveTab={setActiveTab}
        onClose={() => setSessionOpen(false)}
      />

      {conn && activeTab?.content && (
        <TranslatePopup
          anchor={translateBtnRef.current}
          open={translateOpen}
          fromType={conn.type}
          sql={activeTab.content}
          onTranslated={(sql, changes) => {
            updateTabContent(activeTab.id, sql);
            setTranslateChanges(changes);
          }}
          onClose={() => setTranslateOpen(false)}
        />
      )}

      {/* Translation result toast — fixed in bottom-right of screen */}
      {translateChanges.length > 0 &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[9999] rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[10px] text-success shadow-lg max-w-xs">
            <p className="font-medium mb-0.5">
              Translated — {translateChanges.length} change{translateChanges.length !== 1 ? "s" : ""}
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-success/80">
              {translateChanges.slice(0, 6).map((c) => <li key={c}>{c}</li>)}
              {translateChanges.length > 6 && <li>…and {translateChanges.length - 6} more</li>}
            </ul>
          </div>,
          document.body,
        )}

      {/* Explain error toast — fixed */}
      {explainError &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[9999] rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[10px] text-destructive shadow-lg max-w-xs flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{explainError}</span>
          </div>,
          document.body,
        )}

      {/* Modals (fixed position — not affected by overflow anyway) */}
      <ExplainModal
        open={explainOpen}
        plan={explainPlan}
        dbType={explainDbType}
        query={activeTab?.content?.trim().slice(0, 200) ?? ""}
        onClose={() => setExplainOpen(false)}
      />
      <SavedQueriesModal open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </div>
  );
}
