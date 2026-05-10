import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppStore } from "@/store/app-store";
import { DBConnection, DBType } from "@/lib/mock-data";
import { DB_TYPE_META, testConnection } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const DB_TYPES: DBType[] = ["pg", "mysql", "sqlite", "mssql"];

function emptyConn(type: DBType = "pg"): Omit<DBConnection, "id"> {
  const meta = DB_TYPE_META[type];
  return {
    name: "",
    type,
    host: type === "sqlite" ? "" : "localhost",
    port: meta.defaultPort,
    database: "",
    user: "",
    password: "",
    filename: "",
    ssl: false,
    status: "disconnected" as const,
  };
}

export function ConnectionDialog() {
  const {
    connectionDialogOpen,
    closeConnectionDialog,
    editingConnection,
    addConnection,
    updateConnection,
  } = useAppStore();
  const isEditing = !!editingConnection;

  const [form, setForm] = useState<Omit<DBConnection, "id">>(emptyConn());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (connectionDialogOpen) {
      if (editingConnection) {
        const { id, ...rest } = editingConnection;
        setForm(rest);
      } else {
        setForm(emptyConn());
      }
      setTestResult(null);
    }
  }, [connectionDialogOpen, editingConnection]);

  const handleTypeChange = (type: DBType) => {
    setForm((f) => ({
      ...f,
      type,
      port: DB_TYPE_META[type].defaultPort,
      host: type === "sqlite" ? "" : f.host || "localhost",
    }));
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const conn: DBConnection = {
      id: editingConnection?.id ?? "temp",
      ...form,
    };
    const r = await testConnection(conn).catch((e) => ({
      ok: false as const,
      error: e.message,
    }));
    // Server may return 'message' instead of 'error'
    const normalized = {
      ok: !!r.ok,
      error: r.error ?? (r as any).message,
    };
    setTestResult(normalized);
    setTesting(false);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      alert("Connection name is required");
      return;
    }
    if (form.type !== "sqlite" && !form.database.trim()) {
      alert("Database name is required");
      return;
    }
    if (
      form.type === "sqlite" &&
      !form.filename?.trim() &&
      !form.database.trim()
    ) {
      alert("Filename is required for SQLite");
      return;
    }

    if (isEditing && editingConnection) {
      updateConnection({ ...form, id: editingConnection.id });
    } else {
      addConnection({
        ...form,
        id: `conn-${Date.now()}`,
        status: testResult?.ok ? "connected" : "disconnected",
      });
    }
  };

  const isSQLite = form.type === "sqlite";
  const meta = DB_TYPE_META[form.type];

  return (
    <Dialog
      open={connectionDialogOpen}
      onOpenChange={(open) => !open && closeConnectionDialog()}
    >
      <DialogContent className="sm:max-w-[520px] bg-panel-bg border-panel-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {isEditing ? "Edit Connection" : "New Connection"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure a real database connection, test it against the backend,
            and save it for reuse in Studio or Analyst OS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* DB Type selector */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium mb-1.5 block">
              Database Type
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {DB_TYPES.map((t) => {
                const m = DB_TYPE_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => handleTypeChange(t)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-colors ${
                      form.type === t
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className="text-lg">{m.icon}</span>
                    <span className="text-[10px] font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
              Connection Name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={`My ${meta.label} Database`}
              className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {isSQLite ? (
            /* SQLite: just filename */
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
                Database File Path
              </label>
              <input
                value={form.filename ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    filename: e.target.value,
                    database: e.target.value,
                  }))
                }
                placeholder="/path/to/database.db"
                className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ) : (
            /* Host / Port / DB / User / Password */
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
                    Host
                  </label>
                  <input
                    value={form.host}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, host: e.target.value }))
                    }
                    placeholder="localhost"
                    className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
                    Port
                  </label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        port: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
                  Database
                </label>
                <input
                  value={form.database}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, database: e.target.value }))
                  }
                  placeholder="my_database"
                  className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
                    Username
                  </label>
                  <input
                    value={form.user ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, user: e.target.value }))
                    }
                    placeholder={form.type === "mysql" ? "root" : "postgres"}
                    className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
                    Password
                  </label>
                  <input
                    type="password"
                    value={form.password ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    placeholder="••••••••"
                    className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ssl ?? false}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ssl: e.target.checked }))
                  }
                  className="rounded"
                />
                Use SSL / TLS
              </label>
            </>
          )}

          {/* Test result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 text-xs p-2 rounded-md ${
                testResult.ok
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {testResult.ok
                ? "Connection successful!"
                : (testResult.error ?? "Connection failed")}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Test Connection
          </button>
          <button
            onClick={closeConnectionDialog}
            className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            {isEditing ? "Save" : "Add Connection"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
