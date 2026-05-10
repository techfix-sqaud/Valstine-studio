import { useState, useRef, useCallback, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as api from "@/lib/api";
import {
  Send,
  Plus,
  Trash2,
  Copy,
  Check,
  Clock,
  ChevronDown,
  Loader2,
  Bookmark,
  BookmarkCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

// ── Types ──────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

interface Header { key: string; value: string; enabled: boolean }

interface SavedRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: Header[];
  body: string;
  savedAt: string;
}

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  elapsed: number;
  size: number;
}

// ── Helpers ────────────────────────────────────────────────────

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "text-emerald-400",
  POST: "text-blue-400",
  PUT: "text-amber-400",
  PATCH: "text-orange-400",
  DELETE: "text-red-400",
  OPTIONS: "text-purple-400",
  HEAD: "text-cyan-400",
};

function statusColor(status: number): string {
  if (status >= 500) return "text-red-400";
  if (status >= 400) return "text-orange-400";
  if (status >= 300) return "text-yellow-400";
  if (status >= 200) return "text-emerald-400";
  return "text-muted-foreground";
}

function formatBody(body: string, contentType = ""): string {
  if (contentType.includes("json") || body.trimStart().startsWith("{") || body.trimStart().startsWith("[")) {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { /* raw */ }
  }
  return body;
}

function byteSize(str: string): string {
  const bytes = new TextEncoder().encode(str).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
type ReqTab = "headers" | "body";
type ResTab = "body" | "headers";

const DEFAULT_HEADERS: Header[] = [
  { key: "Content-Type", value: "application/json", enabled: true },
  { key: "Accept", value: "application/json", enabled: true },
];

export function ApiTester() {
  const { theme } = useAppStore();

  // Request state
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<Header[]>(DEFAULT_HEADERS);
  const [body, setBody] = useState("{\n  \n}");
  const [reqTab, setReqTab] = useState<ReqTab>("headers");
  const [useProxy, setUseProxy] = useState(true);

  // Response state
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resTab, setResTab] = useState<ResTab>("body");
  const [copied, setCopied] = useState(false);

  // Saved requests — loaded from server (no localStorage)
  const [saved, setSaved] = useState<SavedRequest[]>([]);
  const [requestName, setRequestName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    api.appGetApiRequests().then((reqs) => setSaved(reqs as SavedRequest[])).catch(() => {});
  }, []);

  // Method dropdown
  const [methodOpen, setMethodOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // ── Send ──────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!url.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResponse(null);

    const activeHeaders: Record<string, string> = {};
    headers.filter((h) => h.enabled && h.key.trim()).forEach((h) => {
      activeHeaders[h.key.trim()] = h.value;
    });

    const hasBody = !["GET", "HEAD", "OPTIONS"].includes(method);

    try {
      let status: number, statusText: string, resHeaders: Record<string, string>, resBody: string, elapsed: number;

      if (useProxy) {
        const res = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            method,
            headers: activeHeaders,
            body: hasBody ? body : undefined,
            timeout: 30000,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Proxy error");
        status = data.status;
        statusText = data.statusText;
        resHeaders = data.headers;
        resBody = data.body;
        elapsed = data.elapsed;
      } else {
        const start = performance.now();
        const res = await fetch(url.trim(), {
          method,
          headers: activeHeaders,
          body: hasBody ? body : undefined,
          signal: controller.signal,
        });
        elapsed = Math.round(performance.now() - start);
        status = res.status;
        statusText = res.statusText;
        resHeaders = {};
        res.headers.forEach((v, k) => { resHeaders[k] = v; });
        resBody = await res.text();
      }

      const contentType = resHeaders["content-type"] ?? "";
      setResponse({
        status,
        statusText,
        headers: resHeaders,
        body: formatBody(resBody, contentType),
        elapsed,
        size: new TextEncoder().encode(resBody).length,
      });
      setResTab("body");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  }, [url, method, headers, body, useProxy]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  // ── Headers editor ────────────────────────────────────────────
  const addHeader = () => setHeaders((h) => [...h, { key: "", value: "", enabled: true }]);
  const removeHeader = (i: number) => setHeaders((h) => h.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, field: keyof Header, val: string | boolean) =>
    setHeaders((h) => h.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  // ── Saved requests ────────────────────────────────────────────
  const handleSave = async () => {
    if (!requestName.trim()) return;
    const req: SavedRequest = {
      id: `req-${Date.now()}`,
      name: requestName.trim(),
      method, url, headers, body,
      savedAt: new Date().toISOString(),
    };
    setSaved((prev) => [req, ...prev]);
    await api.appSaveApiRequest(req).catch(() => {});
    setRequestName("");
    setShowSaveInput(false);
  };

  const loadRequest = (req: SavedRequest) => {
    setMethod(req.method);
    setUrl(req.url);
    setHeaders(req.headers);
    setBody(req.body);
    setResponse(null);
    setError(null);
  };

  const deleteRequest = async (id: string) => {
    setSaved((prev) => prev.filter((r) => r.id !== id));
    await api.appDeleteApiRequest(id).catch(() => {});
  };

  const handleCopyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputBase = "bg-panel-bg border border-panel-border text-foreground text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50";

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Saved sidebar ───────────────────────────────────── */}
      <div className="w-48 shrink-0 flex flex-col border-r border-panel-border bg-titlebar/30 overflow-hidden">
        <div className="px-3 py-2 border-b border-panel-border shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Saved
            </span>
            <button
              onClick={() => setShowSaveInput((v) => !v)}
              className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Save current request"
            >
              {showSaveInput ? <X className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            </button>
          </div>
          {showSaveInput && (
            <div className="flex gap-1">
              <input
                value={requestName}
                onChange={(e) => setRequestName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Request name"
                className={cn(inputBase, "flex-1 min-w-0")}
              />
              <button
                onClick={handleSave}
                disabled={!requestName.trim()}
                className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-40"
              >
                <BookmarkCheck className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {saved.length === 0 && (
            <div className="text-[11px] text-muted-foreground px-1 pt-2">
              No saved requests yet
            </div>
          )}
          {saved.map((req) => (
            <div
              key={req.id}
              className="group flex items-start gap-1.5 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer"
              onClick={() => loadRequest(req)}
            >
              <span className={cn("text-[10px] font-bold shrink-0 mt-0.5", METHOD_COLORS[req.method])}>
                {req.method}
              </span>
              <span className="text-[11px] text-foreground truncate flex-1">{req.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteRequest(req.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* URL bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-panel-border shrink-0 bg-panel-bg/60">
          {/* Method selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMethodOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 text-xs font-bold rounded border border-panel-border bg-panel-bg hover:bg-secondary transition-colors min-w-[72px] justify-between",
                METHOD_COLORS[method],
              )}
            >
              {method}
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            {methodOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-panel-border rounded shadow-lg overflow-hidden">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMethod(m); setMethodOpen(false); }}
                    className={cn(
                      "flex items-center w-full px-3 py-1.5 text-xs font-bold hover:bg-secondary transition-colors text-left",
                      METHOD_COLORS[m],
                      method === m && "bg-secondary/60",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* URL input */}
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
            placeholder="https://localhost:5001/api/users"
            className={cn(inputBase, "flex-1")}
          />

          {/* Proxy toggle */}
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={useProxy}
              onChange={(e) => setUseProxy(e.target.checked)}
              className="w-3 h-3 accent-primary"
            />
            Proxy
          </label>

          {/* Send / Cancel */}
          {loading ? (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!url.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          )}
        </div>

        {/* Request config + Response — vertical split */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Request config */}
          <div className="shrink-0 border-b border-panel-border" style={{ maxHeight: "40%" }}>
            <div className="flex items-center border-b border-panel-border bg-panel-bg/40">
              {(["headers", "body"] as ReqTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setReqTab(t)}
                  className={cn(
                    "px-3 py-1.5 text-xs capitalize border-b-2 transition-colors",
                    reqTab === t
                      ? "text-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {t}
                  {t === "headers" && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({headers.filter((h) => h.enabled && h.key).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {reqTab === "headers" && (
              <div className="overflow-y-auto" style={{ maxHeight: "160px" }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-panel-bg z-10">
                    <tr>
                      <th className="w-6 px-2 py-1 text-left text-[10px] text-muted-foreground font-normal"></th>
                      <th className="px-2 py-1 text-left text-[10px] text-muted-foreground font-normal">Key</th>
                      <th className="px-2 py-1 text-left text-[10px] text-muted-foreground font-normal">Value</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, i) => (
                      <tr key={i} className={cn(!h.enabled && "opacity-50")}>
                        <td className="px-2 py-0.5">
                          <input
                            type="checkbox"
                            checked={h.enabled}
                            onChange={(e) => updateHeader(i, "enabled", e.target.checked)}
                            className="w-3 h-3 accent-primary"
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            value={h.key}
                            onChange={(e) => updateHeader(i, "key", e.target.value)}
                            placeholder="Header-Name"
                            className="w-full bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground/40 font-mono"
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            value={h.value}
                            onChange={(e) => updateHeader(i, "value", e.target.value)}
                            placeholder="value"
                            className="w-full bg-transparent text-xs text-muted-foreground focus:outline-none placeholder:text-muted-foreground/40 font-mono"
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <button
                            onClick={() => removeHeader(i)}
                            className="p-0.5 rounded hover:text-destructive text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  onClick={addHeader}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add header
                </button>
              </div>
            )}

            {reqTab === "body" && (
              <div className="h-40">
                <Editor
                  height="100%"
                  language="json"
                  value={body}
                  onChange={(v) => setBody(v ?? "")}
                  theme={theme === "dark" ? "vs-dark" : "light"}
                  options={{
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: "off",
                    padding: { top: 8, bottom: 8 },
                    folding: false,
                  }}
                />
              </div>
            )}
          </div>

          {/* Response panel */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Response status bar */}
            <div className="flex items-center gap-3 px-3 py-1.5 border-b border-panel-border bg-panel-bg/40 shrink-0">
              <div className="flex items-center gap-1.5">
                {(["body", "headers"] as ResTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setResTab(t)}
                    className={cn(
                      "px-2 py-0.5 text-xs capitalize rounded transition-colors",
                      resTab === t
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {response && (
                <div className="flex items-center gap-3 ml-2 text-xs">
                  <span className={cn("font-semibold", statusColor(response.status))}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {response.elapsed}ms
                  </span>
                  <span className="text-muted-foreground">
                    {byteSize(response.body)}
                  </span>
                </div>
              )}

              <div className="ml-auto flex items-center gap-1">
                {response && (
                  <button
                    onClick={handleCopyResponse}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy response"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Response content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {loading && (
                <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending request…
                </div>
              )}

              {!loading && error && (
                <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
                  <span className="text-xs text-destructive font-medium">Request failed</span>
                  <pre className="text-xs text-destructive/80 bg-destructive/10 border border-destructive/20 rounded p-3 max-w-lg whitespace-pre-wrap">
                    {error}
                  </pre>
                </div>
              )}

              {!loading && !error && !response && (
                <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                  Send a request to see the response
                </div>
              )}

              {!loading && !error && response && resTab === "body" && (
                <Editor
                  height="100%"
                  language={
                    (response.headers["content-type"] ?? "").includes("json") ? "json" : "plaintext"
                  }
                  value={response.body}
                  theme={theme === "dark" ? "vs-dark" : "light"}
                  options={{
                    readOnly: true,
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    padding: { top: 8, bottom: 8 },
                    wordWrap: "on",
                  }}
                />
              )}

              {!loading && !error && response && resTab === "headers" && (
                <div className="overflow-y-auto h-full p-3">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr>
                        <th className="text-left text-[10px] text-muted-foreground font-normal pb-2 pr-6">Header</th>
                        <th className="text-left text-[10px] text-muted-foreground font-normal pb-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(response.headers).map(([k, v]) => (
                        <tr key={k} className="border-t border-panel-border/30">
                          <td className="py-1 pr-6 text-muted-foreground whitespace-nowrap">{k}</td>
                          <td className="py-1 text-foreground break-all">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Close method dropdown on outside click */}
      {methodOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMethodOpen(false)}
        />
      )}
    </div>
  );
}
