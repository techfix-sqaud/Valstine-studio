import { useState } from "react";
import { X, Loader2, CheckCircle2, XCircle, HardDrive, AlertTriangle, Copy, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { DB_TYPE_META } from "@/lib/api";
import { DBType } from "@/lib/mock-data";

// ── Helpers ────────────────────────────────────────────────────

function randomPassword(len = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randomName(type: DBType): string {
  const suffix = Math.floor(Math.random() * 1000);
  return `valstine_${type}_${suffix}`;
}

const DB_TYPES: DBType[] = ["pg", "mysql", "mssql", "sqlite"];

const DOCKER_INFO: Record<Exclude<DBType, "sqlite">, { image: string; note: string; defaultUser: string }> = {
  pg: { image: "postgres:16", note: "Requires Docker Desktop", defaultUser: "postgres" },
  mysql: { image: "mysql:8", note: "Requires Docker Desktop", defaultUser: "root" },
  mssql: { image: "mcr.microsoft.com/mssql/server:2022-latest", note: "Requires Docker Desktop · 1.5 GB image", defaultUser: "sa" },
};

interface ProvisionPayload {
  type: DBType;
  containerName?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  filename?: string;
}

interface ProvisionResult {
  ok: boolean;
  connection?: { type: DBType; host: string; port: number; database: string; user: string; password: string; filename?: string };
  containerId?: string;
  error?: string;
}

async function callProvision(payload: ProvisionPayload): Promise<ProvisionResult> {
  const res = await fetch("/api/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ── Component ─────────────────────────────────────────────────

export function ProvisionDialog() {
  const { provisionDialogOpen, closeProvisionDialog, addConnection } = useAppStore();

  const [dbType, setDbType] = useState<DBType>("pg");
  const [name, setName] = useState("");
  const [database, setDatabase] = useState("mydb");
  const [port, setPort] = useState(5433);
  const [user, setUser] = useState("postgres");
  const [password, setPassword] = useState(() => randomPassword());
  const [filename, setFilename] = useState("/tmp/valstine.db");
  const [containerName, setContainerName] = useState(() => randomName("pg"));

  const [provisioning, setProvisioning] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  if (!provisionDialogOpen) return null;

  const isSqlite = dbType === "sqlite";
  const dockerInfo = isSqlite ? null : DOCKER_INFO[dbType as Exclude<DBType, "sqlite">];
  const meta = DB_TYPE_META[dbType];

  const handleTypeChange = (t: DBType) => {
    setDbType(t);
    setResult(null);
    const defaults: Record<DBType, { port: number; user: string }> = {
      pg: { port: 5433, user: "postgres" },
      mysql: { port: 3307, user: "root" },
      mssql: { port: 1434, user: "sa" },
      sqlite: { port: 0, user: "" },
    };
    setPort(defaults[t].port);
    setUser(defaults[t].user);
    setContainerName(randomName(t));
    setPassword(randomPassword());
  };

  const handleProvision = async () => {
    setProvisioning(true);
    setResult(null);
    try {
      const payload: ProvisionPayload = isSqlite
        ? { type: "sqlite", database: filename, filename }
        : { type: dbType, containerName, port, database, user, password };

      const r = await callProvision(payload);
      setResult(r);

      if (r.ok && r.connection) {
        addConnection({
          id: `conn-${Date.now()}`,
          name: name.trim() || `${meta.label} (provisioned)`,
          type: dbType,
          host: r.connection.host ?? "localhost",
          port: r.connection.port ?? port,
          database: r.connection.database ?? database,
          user: r.connection.user ?? user,
          password: r.connection.password ?? password,
          filename: r.connection.filename,
          ssl: false,
          status: "connected",
        });
      }
    } catch (err: any) {
      setResult({ ok: false, error: err.message ?? "Failed to reach server" });
    } finally {
      setProvisioning(false);
    }
  };

  const handleDone = () => {
    setResult(null);
    closeProvisionDialog();
  };

  const inputBase = "w-full h-8 px-2.5 rounded border border-panel-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={!provisioning ? closeProvisionDialog : undefined} />

      <div className="relative z-10 w-[520px] max-w-[96vw] bg-panel-bg border border-panel-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-panel-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Provision New Database</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Create a fresh database instance — SQLite file or Docker container
            </p>
          </div>
          {!provisioning && (
            <button onClick={closeProvisionDialog} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* DB type */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium mb-1.5 block">Database Engine</label>
            <div className="grid grid-cols-4 gap-1.5">
              {DB_TYPES.map((t) => {
                const m = DB_TYPE_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => handleTypeChange(t)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-colors",
                      dbType === t
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-panel-border bg-background text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <span className="text-lg">{m.icon}</span>
                    <span className="text-[10px] font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connection name */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Connection Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`My ${meta.label} (leave blank for default)`}
              className={inputBase}
            />
          </div>

          {isSqlite ? (
            /* SQLite: just a file path */
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block flex items-center gap-1.5">
                <HardDrive className="w-3 h-3" /> File Path
              </label>
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="/path/to/database.db"
                className={inputBase}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                The file will be created automatically when the connection is first used.
              </p>
            </div>
          ) : (
            /* Docker-based */
            <>
              {/* Docker notice */}
              <div className="flex items-start gap-2 p-2.5 rounded bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{dockerInfo?.note} · Image: <span className="font-mono">{dockerInfo?.image}</span></span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Container Name</label>
                  <div className="flex gap-1">
                    <input value={containerName} onChange={(e) => setContainerName(e.target.value)} className={cn(inputBase, "flex-1")} />
                    <button onClick={() => setContainerName(randomName(dbType))} className="px-1.5 rounded border border-panel-border hover:bg-secondary text-muted-foreground" title="Randomize">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Host Port</label>
                  <input type="number" value={port} onChange={(e) => setPort(parseInt(e.target.value) || port)} className={inputBase} />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Database Name</label>
                <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="mydb" className={inputBase} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Username</label>
                  <input value={user} onChange={(e) => setUser(e.target.value)} className={inputBase} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Password</label>
                  <div className="flex gap-1">
                    <input value={password} onChange={(e) => setPassword(e.target.value)} className={cn(inputBase, "flex-1 font-mono text-[11px]")} />
                    <button
                      onClick={() => { navigator.clipboard.writeText(password); setCopiedPassword(true); setTimeout(() => setCopiedPassword(false), 2000); }}
                      className="px-1.5 rounded border border-panel-border hover:bg-secondary text-muted-foreground"
                      title="Copy password"
                    >
                      {copiedPassword ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => setPassword(randomPassword())} className="px-1.5 rounded border border-panel-border hover:bg-secondary text-muted-foreground" title="Regenerate">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Docker will pull the image if not already cached. First-time setup may take a minute.
              </p>
            </>
          )}

          {/* Result */}
          {result && (
            <div className={cn("flex items-start gap-2.5 p-3 rounded border text-xs", result.ok ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive")}>
              {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <div>
                {result.ok ? (
                  <>
                    <div className="font-medium">
                      {isSqlite ? "SQLite file ready" : "Container started successfully"}
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      Connection added to your list. {!isSqlite && `Container ID: ${result.containerId?.slice(0, 12)}`}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-medium">Provisioning failed</div>
                    <div className="text-[11px] opacity-80 mt-0.5 font-mono whitespace-pre-wrap">{result.error}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-panel-border bg-panel-bg/60">
          {result?.ok ? (
            <button onClick={handleDone} className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
              Done
            </button>
          ) : (
            <>
              <button onClick={closeProvisionDialog} disabled={provisioning} className="px-3 py-1.5 rounded border border-panel-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleProvision}
                disabled={provisioning || (!isSqlite && (!database.trim() || !containerName.trim())) || (isSqlite && !filename.trim())}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {provisioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {provisioning ? (isSqlite ? "Creating…" : "Provisioning…") : (isSqlite ? "Create File" : "Provision with Docker")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
