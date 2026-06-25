import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { schemaDiff, fetchSchemas, fetchDatabases } from "@/lib/api";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CompareMode = "schemas" | "databases" | "connections";

const MODE_LABELS: Record<CompareMode, string> = {
  schemas: "Schemas",
  databases: "Databases",
  connections: "Connections",
};

export default function SchemaCompare() {
  const { connections, addTab, setActiveTab } = useAppStore();
  const connected = connections.filter((c) => c.status === "connected");

  const [mode, setMode] = useState<CompareMode>("databases");

  // Shared connection (for schemas & databases modes)
  const [connId, setConnId] = useState("");

  // Schemas mode
  const [sourceSchema, setSourceSchema] = useState("");
  const [targetSchema, setTargetSchema] = useState("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  // Databases mode
  const [sourceDb, setSourceDb] = useState("");
  const [targetDb, setTargetDb] = useState("");
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDbs, setLoadingDbs] = useState(false);

  // Connections mode
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const conn = connected.find((c) => c.id === connId);

  // Fetch schemas when connection changes in schemas mode
  useEffect(() => {
    if (mode !== "schemas" || !connId) return;
    const c = connections.find(
      (x) => x.id === connId && x.status === "connected",
    );
    if (!c) return;
    let cancelled = false;
    setLoadingSchemas(true);
    setSourceSchema("");
    setTargetSchema("");
    fetchSchemas(c)
      .then((s) => {
        if (!cancelled) setSchemas(s);
      })
      .catch(() => {
        if (!cancelled) setSchemas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSchemas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connId, mode, connections]);

  // Fetch databases when connection changes in databases mode
  useEffect(() => {
    if (mode !== "databases" || !connId) return;
    const c = connections.find(
      (x) => x.id === connId && x.status === "connected",
    );
    if (!c) return;
    let cancelled = false;
    setLoadingDbs(true);
    setSourceDb("");
    setTargetDb("");
    fetchDatabases(c)
      .then((d) => {
        if (!cancelled) setDatabases(d);
      })
      .catch(() => {
        if (!cancelled) setDatabases([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDbs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connId, mode, connections]);

  // Reset error on mode change
  useEffect(() => {
    setError("");
  }, [mode]);

  async function compare() {
    setLoading(true);
    setError("");
    try {
      let result;
      if (mode === "schemas") {
        if (!conn || !sourceSchema || !targetSchema) return;
        result = await schemaDiff(conn, conn, sourceSchema, targetSchema);
      } else if (mode === "databases") {
        if (!conn || !sourceDb || !targetDb) return;
        result = await schemaDiff(conn, conn, undefined, undefined, sourceDb, targetDb);
      } else {
        const source = connected.find((c) => c.id === sourceId);
        const target = connected.find((c) => c.id === targetId);
        if (!source || !target) return;
        result = await schemaDiff(source, target);
      }
      if (!result.ok) {
        setError(result.error ?? "Comparison failed");
        return;
      }

      // Build a label for the tab title
      const tabTitle = `${result.source} ↔ ${result.target}`;
      const id = `diff-${Date.now()}`;
      addTab({
        id,
        title: tabTitle,
        type: "schema-diff",
        content: "",
        connectionId: "",
        isDirty: false,
        diffData: {
          diffs: result.diffs,
          migrationUp: result.migrationUp,
          migrationDown: result.migrationDown,
          sourceLabel: result.source,
          targetLabel: result.target,
        },
      });
      setActiveTab(id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const canCompare =
    mode === "schemas"
      ? connId && sourceSchema && targetSchema && sourceSchema !== targetSchema
      : mode === "databases"
        ? connId && sourceDb && targetDb && sourceDb !== targetDb
        : sourceId && targetId && sourceId !== targetId;

  if (connected.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        <ArrowRightLeft className="w-5 h-5 mx-auto mb-2 opacity-40" />
        <p className="text-center">Connect to a database to compare schemas.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-3 py-2 border-b border-border/50 bg-[var(--color-panel-bg)] space-y-2">
        {/* Mode toggle — 3 tabs */}
        <div className="flex rounded-md border border-border overflow-hidden text-[10px]">
          {(["databases", "schemas", "connections"] as CompareMode[]).map(
            (m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 py-1 px-1.5 transition-colors text-center",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {MODE_LABELS[m]}
              </button>
            ),
          )}
        </div>

        {/* ── Schemas mode ── */}
        {mode === "schemas" && (
          <>
            <Select value={connId} onValueChange={setConnId}>
              <SelectTrigger className="h-6 text-[11px]">
                <SelectValue placeholder="Select connection…" />
              </SelectTrigger>
              <SelectContent>
                {connected.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.database})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {connId && (
              <div className="flex items-center gap-2">
                <Select
                  value={sourceSchema}
                  onValueChange={setSourceSchema}
                  disabled={loadingSchemas || schemas.length === 0}
                >
                  <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0">
                    <SelectValue
                      placeholder={
                        loadingSchemas ? "Loading…" : "Source schema…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {schemas.map((s) => (
                      <SelectItem
                        key={s}
                        value={s}
                        disabled={s === targetSchema}
                      >
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />

                <Select
                  value={targetSchema}
                  onValueChange={setTargetSchema}
                  disabled={loadingSchemas || schemas.length === 0}
                >
                  <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0">
                    <SelectValue
                      placeholder={
                        loadingSchemas ? "Loading…" : "Target schema…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {schemas.map((s) => (
                      <SelectItem
                        key={s}
                        value={s}
                        disabled={s === sourceSchema}
                      >
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {connId && schemas.length === 0 && !loadingSchemas && (
              <p className="text-[10px] text-muted-foreground">
                Only one schema found — try Databases mode.
              </p>
            )}
          </>
        )}

        {/* ── Databases mode ── */}
        {mode === "databases" && (
          <>
            <Select value={connId} onValueChange={setConnId}>
              <SelectTrigger className="h-6 text-[11px]">
                <SelectValue placeholder="Select connection…" />
              </SelectTrigger>
              <SelectContent>
                {connected.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.host}:{c.port}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {connId && (
              <div className="flex items-center gap-2">
                <Select
                  value={sourceDb}
                  onValueChange={setSourceDb}
                  disabled={loadingDbs || databases.length === 0}
                >
                  <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0">
                    <SelectValue
                      placeholder={loadingDbs ? "Loading…" : "Source DB…"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((d) => (
                      <SelectItem key={d} value={d} disabled={d === targetDb}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />

                <Select
                  value={targetDb}
                  onValueChange={setTargetDb}
                  disabled={loadingDbs || databases.length === 0}
                >
                  <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0">
                    <SelectValue
                      placeholder={loadingDbs ? "Loading…" : "Target DB…"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((d) => (
                      <SelectItem key={d} value={d} disabled={d === sourceDb}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {connId && databases.length < 2 && !loadingDbs && (
              <p className="text-[10px] text-muted-foreground">
                Only {databases.length} database found on this host.
              </p>
            )}
          </>
        )}

        {/* ── Connections mode ── */}
        {mode === "connections" && (
          <div className="flex items-center gap-2">
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0">
                <SelectValue placeholder="Source…" />
              </SelectTrigger>
              <SelectContent>
                {connected.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    disabled={c.id === targetId}
                  >
                    {c.name} ({c.database})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />

            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0">
                <SelectValue placeholder="Target…" />
              </SelectTrigger>
              <SelectContent>
                {connected.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    disabled={c.id === sourceId}
                  >
                    {c.name} ({c.database})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          size="sm"
          className="w-full h-6 text-[11px]"
          onClick={compare}
          disabled={!canCompare || loading}
        >
          {loading ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <ArrowRightLeft className="w-3 h-3 mr-1" />
          )}
          Compare
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-3 mt-2 text-xs text-red-400 bg-red-400/10 rounded p-2">
          {error}
        </div>
      )}
    </div>
  );
}
