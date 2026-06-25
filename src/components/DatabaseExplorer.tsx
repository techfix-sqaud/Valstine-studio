import { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Table2,
  Columns3,
  Key,
  Database,
  FolderOpen,
  Folder,
  Eye,
  RefreshCw,
  Loader2,
  Copy,
  Download,
  GitBranch,
  Trash2,
  AlertTriangle,
  Braces,
  Zap,
  ListFilter,
  ArrowUpDown,
  KeyRound,
  FunctionSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { showContextMenu } from "./ContextMenu";
import * as api from "@/lib/api";
import { DB_TYPE_META } from "@/lib/api";

// ── Column node ──────────────────────────────────────────────────────────────
function ColumnItem({ col, tableName }: { col: api.RemoteColumnInfo; tableName: string }) {
  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      { label: "Copy Column Name", action: () => navigator.clipboard.writeText(col.name) },
      {
        label: `SELECT ${col.name}`,
        action: () => {
          const store = useAppStore.getState();
          store.addTab({ id: `tab-${Date.now()}`, title: `select_${col.name}.sql`, content: `SELECT ${col.name}\nFROM ${tableName}\nLIMIT 100;`, connectionId: store.activeConnectionId, isDirty: false });
        },
      },
      {
        label: `Find References to "${col.name}"`,
        action: () => {
          const store = useAppStore.getState();
          const conn = store.connections.find(c => c.id === store.activeConnectionId);
          if (!conn) return;
          // Build a query that searches views, functions, and triggers for this column name
          let sql = "";
          if (conn.type === "pg") {
            sql = `-- Find references to column "${col.name}" in views, functions, triggers\nSELECT\n  'view' AS kind,\n  table_schema AS schema_name,\n  table_name AS object_name,\n  NULL AS routine_name\nFROM information_schema.view_column_usage\nWHERE column_name = '${col.name}'\n\nUNION ALL\n\nSELECT\n  'routine' AS kind,\n  routine_schema AS schema_name,\n  NULL AS object_name,\n  routine_name\nFROM information_schema.routines\nWHERE routine_definition ILIKE '%${col.name}%'\n\nUNION ALL\n\nSELECT\n  'trigger' AS kind,\n  trigger_schema AS schema_name,\n  event_object_table AS object_name,\n  trigger_name AS routine_name\nFROM information_schema.triggers\nWHERE action_statement ILIKE '%${col.name}%'\n\nORDER BY kind, schema_name, object_name;`;
          } else if (conn.type === "mysql") {
            sql = `-- Find references to column "${col.name}" in views and routines\nSELECT 'view' AS kind, TABLE_SCHEMA AS schema_name, TABLE_NAME AS object_name, NULL AS routine_name\nFROM information_schema.VIEW_TABLE_USAGE\nWHERE COLUMN_NAME = '${col.name}'\n\nUNION ALL\n\nSELECT 'routine' AS kind, ROUTINE_SCHEMA, NULL, ROUTINE_NAME\nFROM information_schema.ROUTINES\nWHERE ROUTINE_DEFINITION LIKE '%${col.name}%'\n\nORDER BY kind, schema_name;`;
          } else if (conn.type === "mssql") {
            sql = `-- Find references to column "${col.name}" in views, stored procedures, and triggers\nSELECT\n  o.type_desc AS kind,\n  s.name AS schema_name,\n  o.name AS object_name\nFROM sys.sql_modules m\nJOIN sys.objects o ON o.object_id = m.object_id\nJOIN sys.schemas s ON s.schema_id = o.schema_id\nWHERE m.definition LIKE '%${col.name}%'\n  AND o.type IN ('V','P','TR','FN','IF','TF')\nORDER BY o.type_desc, o.name;`;
          } else {
            sql = `-- SQLite: search for "${col.name}" in view definitions\nSELECT 'view' AS kind, name AS object_name, sql AS definition\nFROM sqlite_master\nWHERE type IN ('view','trigger')\n  AND sql LIKE '%${col.name}%'\nORDER BY type, name;`;
          }
          const tabId = `ref-${Date.now()}`;
          store.addTab({
            id: tabId,
            title: `refs_${col.name}.sql`,
            content: sql,
            connectionId: store.activeConnectionId,
            isDirty: false,
          });
          store.setActiveTab(tabId);
        },
      },
      { separator: true, label: "sep" },
      { label: `Type: ${col.type}`, disabled: true },
      { label: col.nullable ? "Nullable: Yes" : "Nullable: No", disabled: true },
      { label: col.primaryKey ? "Primary Key: Yes" : "Primary Key: No", disabled: true },
    ]);
  };

  return (
    <div onContextMenu={handleContextMenu} className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-[4.5rem] text-xs cursor-default">
      {col.primaryKey ? <Key className="w-3 h-3 text-warning shrink-0" /> : <Columns3 className="w-3 h-3 text-muted-foreground shrink-0" />}
      <span className="text-foreground truncate">{col.name}</span>
      <span className="text-muted-foreground ml-auto text-[10px] truncate">{col.type}</span>
    </div>
  );
}

// ── Indexes sub-group (inside a table node) ──────────────────────────────────
function IndexesGroup({ tableName, schema, indent }: { tableName: string; schema: string; indent: string }) {
  const [open, setOpen] = useState(false);
  const [indexes, setIndexes] = useState<api.RemoteIndexInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const conn = useAppStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));

  const load = useCallback(async () => {
    if (!conn || loaded) return;
    setLoading(true);
    try { setIndexes(await api.fetchIndexes(conn, tableName, schema)); setLoaded(true); } catch { /* ignore */ }
    setLoading(false);
  }, [conn, tableName, schema, loaded]);

  const handleToggle = () => { if (!open && !loaded) load(); setOpen((o) => !o); };

  return (
    <div>
      <button onClick={handleToggle} className={`tree-item flex items-center gap-1.5 py-0.5 px-2 ${indent} w-full text-left text-xs rounded-sm`}>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        <ListFilter className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Indexes</span>
        {loaded && <span className="text-muted-foreground ml-auto text-[10px]">{indexes.length}</span>}
        {loading && <Loader2 className="w-3 h-3 text-muted-foreground ml-auto animate-spin shrink-0" />}
      </button>
      {open && loaded && (
        indexes.length === 0
          ? <div className="pl-24 py-0.5 text-[10px] text-muted-foreground italic">No indexes</div>
          : indexes.map((idx) => (
            <div key={idx.name} onContextMenu={(e) => showContextMenu(e, [{ label: "Copy Index Name", action: () => navigator.clipboard.writeText(idx.name) }])}
              className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-24 text-xs cursor-default">
              {idx.unique ? <KeyRound className="w-3 h-3 text-amber-400 shrink-0" /> : <ListFilter className="w-3 h-3 text-muted-foreground shrink-0" />}
              <span className="text-foreground truncate">{idx.name}</span>
              <span className="text-muted-foreground ml-auto text-[10px] truncate max-w-[6rem]">{idx.columns}</span>
            </div>
          ))
      )}
    </div>
  );
}

// ── Table / View node ────────────────────────────────────────────────────────
function TableItem({ table, schema, eagerRowCount }: { table: api.RemoteTableInfo; schema: string; eagerRowCount?: number | null }) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<api.RemoteColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [rowCount, setRowCount] = useState<number | null>(eagerRowCount ?? null);
  const conn = useAppStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const addTab = useAppStore((s) => s.addTab);

  // Eagerly fetch row count in background so badge shows without expanding
  useEffect(() => {
    if (eagerRowCount !== undefined) return; // parent already provided it
    if (!conn || table.type !== "table") return;
    let cancelled = false;
    api.fetchRowCount(conn, table.name, schema).then((n) => { if (!cancelled) setRowCount(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [conn?.id, table.name, schema]);

  const loadColumns = useCallback(async () => {
    if (!conn || columns.length > 0) return;
    setLoading(true);
    try { setColumns(await api.fetchColumns(conn, table.name, schema)); } catch { /* ignore */ }
    setLoading(false);
  }, [conn, table.name, schema, columns.length]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      loadColumns();
    }
  };

  const qualified = `${schema}.${table.name}`;

  const exportTableData = async (format: "csv" | "json") => {
    if (!conn) return;
    const cols = columns.length > 0 ? columns : await api.fetchColumns(conn, table.name, schema);
    const result = await api.executeQuery(conn, `SELECT * FROM ${qualified} LIMIT 5000`);
    if (result.status === "error") { alert(result.message); return; }
    const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
    if (format === "csv") {
      const escape = (v: unknown) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [cols.map((c) => c.name).join(","), ...result.rows.map((r) => cols.map((c) => escape(r[c.name])).join(","))].join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${table.name}_${ts}.csv`; a.click();
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(result.rows, null, 2)], { type: "application/json" })); a.download = `${table.name}_${ts}.json`; a.click();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    const connId = useAppStore.getState().activeConnectionId;
    showContextMenu(e, [
      { label: "SELECT TOP 1000", action: () => { addTab({ id: `tab-${Date.now()}`, title: `${table.name}.sql`, content: `SELECT *\nFROM ${qualified}\nLIMIT 1000;`, connectionId: connId, isDirty: false }); useAppStore.getState().executeQuery(); } },
      { label: "SELECT COUNT(*)", action: () => { addTab({ id: `tab-${Date.now()}`, title: `count_${table.name}.sql`, content: `SELECT COUNT(*) AS total_rows\nFROM ${qualified};`, connectionId: connId, isDirty: false }); useAppStore.getState().executeQuery(); } },
      { label: "Preview (100 rows)", action: async () => { if (!conn) return; const cols = columns.length > 0 ? columns : await api.fetchColumns(conn, table.name, schema); const pk = cols.find((c) => c.primaryKey)?.name ?? cols[0]?.name ?? "1"; addTab({ id: `tab-${Date.now()}`, title: `preview_${table.name}.sql`, content: `SELECT *\nFROM ${qualified}\nORDER BY ${pk}\nLIMIT 100;`, connectionId: connId, isDirty: false }); useAppStore.getState().executeQuery(); } },
      { separator: true, label: "sep" },
      { label: "Generate INSERT template", action: async () => { if (!conn) return; const cols = columns.length > 0 ? columns : await api.fetchColumns(conn, table.name, schema); const colNames = cols.map((c) => c.name).join(",\n  "); const vals = cols.map((c) => `-- ${c.type}`).join(",\n  "); addTab({ id: `tab-${Date.now()}`, title: `insert_${table.name}.sql`, content: `INSERT INTO ${qualified} (\n  ${colNames}\n)\nVALUES (\n  ${vals}\n);`, connectionId: connId, isDirty: false }); } },
      { label: "Generate UPDATE template", action: async () => { if (!conn) return; const cols = columns.length > 0 ? columns : await api.fetchColumns(conn, table.name, schema); const pk = cols.find((c) => c.primaryKey); const setClauses = cols.filter((c) => !c.primaryKey).map((c) => `  ${c.name} = -- ${c.type}`).join(",\n"); addTab({ id: `tab-${Date.now()}`, title: `update_${table.name}.sql`, content: `UPDATE ${qualified}\nSET\n${setClauses}\nWHERE ${pk ? `${pk.name} = ?` : "-- condition"};`, connectionId: connId, isDirty: false }); } },
      { label: "Generate CREATE TABLE", action: async () => { if (!conn) return; const cols = columns.length > 0 ? columns : await api.fetchColumns(conn, table.name, schema); const colDefs = cols.map((c) => `  "${c.name}" ${c.type}${c.primaryKey ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ""}`).join(",\n"); addTab({ id: `tab-${Date.now()}`, title: `create_${table.name}.sql`, content: `CREATE TABLE ${qualified} (\n${colDefs}\n);`, connectionId: connId, isDirty: false }); } },
      { separator: true, label: "sep2" },
      { label: "Export data as CSV", action: () => exportTableData("csv") },
      { label: "Export data as JSON", action: () => exportTableData("json") },
      { separator: true, label: "sep3" },
      { label: "Copy Table Name", action: () => navigator.clipboard.writeText(table.name) },
      { label: "Copy Qualified Name", action: () => navigator.clipboard.writeText(qualified) },
      { label: "Refresh Columns", action: async () => { if (!conn) return; setColumns([]); setColumns(await api.fetchColumns(conn, table.name, schema)); } },
      { separator: true, label: "sep4" },
      { label: "Truncate Table", danger: true, action: async () => { if (!conn || !confirm(`TRUNCATE ${qualified}?\n\nThis will delete ALL rows permanently.`)) return; const r = await api.truncateTable(conn, table.name, schema); if (!r.ok) alert(r.error ?? "Failed"); } },
      { label: "Drop Table", danger: true, action: async () => { if (!conn || !confirm(`DROP TABLE ${qualified}?\n\nThis is irreversible.`)) return; const r = await api.dropTable(conn, table.name, schema); if (!r.ok) alert(r.error ?? "Failed"); } },
    ]);
  };

  return (
    <div>
      <button onClick={handleToggle} onContextMenu={handleContextMenu}
        className="tree-item flex items-center gap-1.5 py-1 px-2 pl-[3.25rem] w-full text-left text-xs rounded-sm">
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        {table.type === "view" ? <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" /> : <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />}
        <span className="text-foreground truncate">{table.name}</span>
        {rowCount !== null && <span className="text-muted-foreground ml-auto text-[9px] shrink-0 tabular-nums">{rowCount >= 0 ? rowCount.toLocaleString() : ""}</span>}
        {loading && <Loader2 className="w-3 h-3 text-muted-foreground ml-auto animate-spin shrink-0" />}
      </button>
      {open && (
        <>
          {columns.map((col) => <ColumnItem key={col.name} col={col} tableName={qualified} />)}
          {table.type === "table" && <IndexesGroup tableName={table.name} schema={schema} indent="pl-[4.5rem]" />}
        </>
      )}
    </div>
  );
}

// ── Generic lazy-load category group ────────────────────────────────────────
function CategoryGroup({
  label, icon: Icon, iconClass, indent, defaultOpen = false,
  onLoad, renderItems, emptyText, onHeaderContextMenu, onRefresh,
}: {
  label: string;
  icon: React.ElementType;
  iconClass: string;
  indent: string;
  defaultOpen?: boolean;
  onLoad: () => Promise<number>;
  renderItems: () => React.ReactNode;
  emptyText: string;
  onHeaderContextMenu?: (e: React.MouseEvent) => void;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try { setCount(await onLoad()); setLoaded(true); } catch { setCount(0); setLoaded(true); }
    setLoading(false);
  }, [loaded, onLoad]);

  const refresh = useCallback(async () => {
    setLoaded(false);
    setCount(null);
    setLoading(true);
    try { setCount(await onLoad()); setLoaded(true); } catch { setCount(0); setLoaded(true); }
    setLoading(false);
    onRefresh?.();
  }, [onLoad, onRefresh]);

  const handleToggle = () => { if (!open && !loaded) load(); setOpen((o) => !o); };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onHeaderContextMenu) { onHeaderContextMenu(e); return; }
    showContextMenu(e, [
      { label: "Refresh", action: refresh },
    ]);
  };

  return (
    <div>
      <button onClick={handleToggle} onContextMenu={handleContextMenu}
        className={`tree-item flex items-center gap-1.5 py-0.5 px-2 ${indent} w-full text-left text-xs rounded-sm`}>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        <Icon className={cn("w-3.5 h-3.5 shrink-0", iconClass)} />
        <span className="text-muted-foreground">{label}</span>
        {count !== null && <span className="text-muted-foreground ml-auto text-[10px]">{count}</span>}
        {loading && <Loader2 className="w-3 h-3 text-muted-foreground ml-auto animate-spin shrink-0" />}
      </button>
      {open && loaded && (count === 0
        ? <div className={`${indent} pl-8 py-0.5 text-[10px] text-muted-foreground italic`}>{emptyText}</div>
        : renderItems()
      )}
    </div>
  );
}

// ── Schema node ──────────────────────────────────────────────────────────────
function SchemaGroup({ schema, defaultOpen }: { schema: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tables, setTables] = useState<api.RemoteTableInfo[]>([]);
  const [schemaIndexes, setSchemaIndexes] = useState<api.RemoteSchemaIndexInfo[]>([]);
  const [functions, setFunctions] = useState<api.RemoteFunctionInfo[]>([]);
  const [triggers, setTriggers] = useState<api.RemoteTriggerInfo[]>([]);
  const [sequences, setSequences] = useState<string[]>([]);
  const [tablesLoaded, setTablesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const conn = useAppStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const connType = conn?.type;

  const loadTables = useCallback(async () => {
    if (!conn || tablesLoaded) return;
    setLoading(true);
    try { setTables(await api.fetchTables(conn, schema)); setTablesLoaded(true); } catch { /* ignore */ }
    setLoading(false);
  }, [conn, schema, tablesLoaded]);

  useEffect(() => { if (open && !tablesLoaded) loadTables(); }, [open, tablesLoaded, loadTables]);

  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      { label: "Refresh", action: () => { setTablesLoaded(false); setTables([]); setFunctions([]); setTriggers([]); setSequences([]); loadTables(); } },
      { label: "New Query", action: () => { const store = useAppStore.getState(); store.addTab({ id: `tab-${Date.now()}`, title: `query_${schema}.sql`, content: `-- Schema: ${schema}\nSELECT 1;`, connectionId: store.activeConnectionId, isDirty: false }); } },
      { separator: true, label: "sep" },
      { label: "Create Table...", action: () => { const store = useAppStore.getState(); store.addTab({ id: `tab-${Date.now()}`, title: `new_table.sql`, content: `CREATE TABLE ${schema}.new_table (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);`, connectionId: store.activeConnectionId, isDirty: false }); } },
    ]);
  };

  const tablesList = tables.filter((t) => t.type === "table");
  const viewsList = tables.filter((t) => t.type === "view");

  return (
    <div>
      <button onClick={() => setOpen(!open)} onContextMenu={handleContextMenu}
        className="tree-item flex items-center gap-1.5 py-1 px-2 pl-6 w-full text-left text-xs rounded-sm">
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        {open ? <FolderOpen className="w-3.5 h-3.5 text-warning shrink-0" /> : <Folder className="w-3.5 h-3.5 text-warning shrink-0" />}
        <span className="text-foreground">{schema}</span>
        <span className="text-muted-foreground ml-auto text-[10px]">
          {tablesLoaded ? `${tablesList.length}T${viewsList.length ? ` ${viewsList.length}V` : ""}` : ""}
        </span>
        {loading && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin shrink-0" />}
      </button>

      {open && (
        <div>
          {/* Tables */}
          <CategoryGroup
            key="tables"
            label="Tables" icon={Table2} iconClass="text-primary" indent="pl-10"
            defaultOpen={defaultOpen}
            onLoad={async () => { if (!tablesLoaded) await loadTables(); return tablesList.length; }}
            onHeaderContextMenu={(e) => showContextMenu(e, [
              { label: "Refresh Tables", action: () => { setTablesLoaded(false); setTables([]); loadTables(); } },
              { separator: true, label: "s" },
              { label: "Create Table...", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: "new_table.sql", content: `CREATE TABLE ${schema}.new_table (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);`, connectionId: s.activeConnectionId, isDirty: false }); } },
            ])}
            renderItems={() => (
              tablesList.length === 0
                ? <div className="pl-16 py-0.5 text-[10px] text-muted-foreground italic">No tables</div>
                : <>{tablesList.map((t) => <TableItem key={t.name} table={t} schema={schema} />)}</>
            )}
            emptyText="No tables"
          />

          {/* Views */}
          <CategoryGroup
            key="views"
            label="Views" icon={Eye} iconClass="text-purple-400" indent="pl-10"
            onLoad={async () => { if (!tablesLoaded) await loadTables(); return viewsList.length; }}
            onHeaderContextMenu={(e) => showContextMenu(e, [
              { label: "Refresh Views", action: () => { setTablesLoaded(false); setTables([]); loadTables(); } },
              { separator: true, label: "s" },
              { label: "Create View...", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: "new_view.sql", content: `CREATE OR REPLACE VIEW ${schema}.new_view AS\nSELECT\n  -- your query here\n  1;`, connectionId: s.activeConnectionId, isDirty: false }); } },
            ])}
            renderItems={() => <>{viewsList.map((t) => <TableItem key={t.name} table={t} schema={schema} />)}</>}
            emptyText="No views"
          />

          {/* Indexes */}
          <CategoryGroup
            key="indexes"
            label="Indexes" icon={KeyRound} iconClass="text-amber-400" indent="pl-10"
            onLoad={async () => { if (!conn) return 0; const idxs = await api.fetchSchemaIndexes(conn, schema); setSchemaIndexes(idxs); return idxs.length; }}
            onHeaderContextMenu={(e) => showContextMenu(e, [
              { label: "Refresh Indexes", action: () => { setSchemaIndexes([]); } },
            ])}
            renderItems={() => (
              <>{schemaIndexes.map((idx) => (
                <div key={`${idx.tableName}::${idx.name}`}
                  onContextMenu={(e) => showContextMenu(e, [
                    { label: "Copy Index Name", action: () => navigator.clipboard.writeText(idx.name) },
                    { label: "Copy DROP INDEX", action: () => navigator.clipboard.writeText(`DROP INDEX ${schema}.${idx.name};`) },
                    { separator: true, label: "s" },
                    { label: `Table: ${idx.tableName}`, disabled: true },
                    { label: idx.unique ? "Unique index" : "Non-unique index", disabled: true },
                    { label: `Columns: ${idx.columns}`, disabled: true },
                  ])}
                  className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-14 text-xs cursor-default">
                  {idx.unique ? <KeyRound className="w-3 h-3 text-amber-400 shrink-0" /> : <ListFilter className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <span className="text-foreground truncate">{idx.name}</span>
                  <span className="text-muted-foreground ml-auto text-[10px] shrink-0 truncate max-w-[5rem]">{idx.tableName}</span>
                </div>
              ))}</>
            )}
            emptyText="No indexes"
          />

          {/* Functions & Procedures — not SQLite */}
          {connType !== "sqlite" && (
            <CategoryGroup
              key="functions"
              label="Functions" icon={FunctionSquare} iconClass="text-sky-400" indent="pl-10"
              onLoad={async () => { if (!conn) return 0; const fns = await api.fetchFunctions(conn, schema); setFunctions(fns); return fns.length; }}
              onHeaderContextMenu={(e) => showContextMenu(e, [
                { label: "Refresh Functions", action: () => { setFunctions([]); } },
                { separator: true, label: "s" },
                { label: "Create Function...", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: "new_function.sql", content: `CREATE OR REPLACE FUNCTION ${schema}.new_function()\nRETURNS void\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  -- function body\nEND;\n$$;`, connectionId: s.activeConnectionId, isDirty: false }); } },
              ])}
              renderItems={() => (
                <>{functions.map((fn) => (
                  <div key={fn.name}
                    onContextMenu={(e) => showContextMenu(e, [
                      { label: "Copy Function Name", action: () => navigator.clipboard.writeText(fn.name) },
                      { label: fn.kind === "PROCEDURE" ? "Copy CALL Statement" : "Copy SELECT Call",
                        action: () => navigator.clipboard.writeText(fn.kind === "PROCEDURE"
                          ? `CALL ${schema}.${fn.name}();`
                          : `SELECT ${schema}.${fn.name}();`) },
                      { label: "Open in Editor", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: `${fn.name}.sql`, content: fn.kind === "PROCEDURE" ? `CALL ${schema}.${fn.name}();` : `SELECT ${schema}.${fn.name}();`, connectionId: s.activeConnectionId, isDirty: false }); } },
                      { separator: true, label: "s" },
                      { label: `Kind: ${fn.kind}`, disabled: true },
                      { label: `Returns: ${fn.returnType}`, disabled: true },
                      { label: `Language: ${fn.language}`, disabled: true },
                      { separator: true, label: "s2" },
                      { label: `DROP ${fn.kind === "PROCEDURE" ? "PROCEDURE" : "FUNCTION"} ${fn.name}`, danger: true,
                        action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: `drop_${fn.name}.sql`, content: `DROP ${fn.kind === "PROCEDURE" ? "PROCEDURE" : "FUNCTION"} IF EXISTS ${schema}.${fn.name}();`, connectionId: s.activeConnectionId, isDirty: false }); } },
                    ])}
                    className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-14 text-xs cursor-default">
                    {fn.kind === "PROCEDURE"
                      ? <GitBranch className="w-3 h-3 text-sky-400 shrink-0" />
                      : <Braces className="w-3 h-3 text-sky-400 shrink-0" />}
                    <span className="text-foreground truncate">{fn.name}</span>
                    <span className="text-muted-foreground ml-auto text-[10px] shrink-0">{fn.kind === "PROCEDURE" ? "proc" : fn.returnType}</span>
                  </div>
                ))}</>
              )}
              emptyText="No functions"
            />
          )}

          {/* Triggers */}
          <CategoryGroup
            key="triggers"
            label="Triggers" icon={Zap} iconClass="text-orange-400" indent="pl-10"
            onLoad={async () => { if (!conn) return 0; const tgs = await api.fetchTriggers(conn, schema); setTriggers(tgs); return tgs.length; }}
            onHeaderContextMenu={(e) => showContextMenu(e, [
              { label: "Refresh Triggers", action: () => { setTriggers([]); } },
              { separator: true, label: "s" },
              { label: "Create Trigger...", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: "new_trigger.sql", content: `CREATE OR REPLACE TRIGGER new_trigger\nBEFORE INSERT OR UPDATE ON ${schema}.table_name\nFOR EACH ROW\nEXECUTE FUNCTION ${schema}.trigger_function();`, connectionId: s.activeConnectionId, isDirty: false }); } },
            ])}
            renderItems={() => (
              <>{triggers.map((tg) => (
                <div key={`${tg.tableName}::${tg.name}`}
                  onContextMenu={(e) => showContextMenu(e, [
                    { label: "Copy Trigger Name", action: () => navigator.clipboard.writeText(tg.name) },
                    { label: "Open DROP Statement", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: `drop_${tg.name}.sql`, content: `DROP TRIGGER IF EXISTS ${tg.name} ON ${schema}.${tg.tableName};`, connectionId: s.activeConnectionId, isDirty: false }); } },
                    { separator: true, label: "s" },
                    { label: `On table: ${tg.tableName}`, disabled: true },
                    ...(tg.event ? [{ label: `${tg.timing} ${tg.event}`, disabled: true as const }] : []),
                  ])}
                  className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-14 text-xs cursor-default">
                  <Zap className="w-3 h-3 text-orange-400 shrink-0" />
                  <span className="text-foreground truncate">{tg.name}</span>
                  <span className="text-muted-foreground ml-auto text-[10px] shrink-0 truncate max-w-[5rem]">{tg.tableName}</span>
                </div>
              ))}</>
            )}
            emptyText="No triggers"
          />

          {/* Sequences — PostgreSQL only */}
          {connType === "pg" && (
            <CategoryGroup
              key="sequences"
              label="Sequences" icon={ArrowUpDown} iconClass="text-teal-400" indent="pl-10"
              onLoad={async () => { if (!conn) return 0; const seqs = await api.fetchSequences(conn, schema); setSequences(seqs); return seqs.length; }}
              onHeaderContextMenu={(e) => showContextMenu(e, [
                { label: "Refresh Sequences", action: () => { setSequences([]); } },
                { separator: true, label: "s" },
                { label: "Create Sequence...", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: "new_sequence.sql", content: `CREATE SEQUENCE IF NOT EXISTS ${schema}.new_sequence\n  START WITH 1\n  INCREMENT BY 1\n  NO MINVALUE\n  NO MAXVALUE\n  CACHE 1;`, connectionId: s.activeConnectionId, isDirty: false }); } },
              ])}
              renderItems={() => (
                <>{sequences.map((seq) => (
                  <div key={seq}
                    onContextMenu={(e) => showContextMenu(e, [
                      { label: "Copy Sequence Name", action: () => navigator.clipboard.writeText(seq) },
                      { label: "Copy NEXTVAL", action: () => navigator.clipboard.writeText(`SELECT nextval('${schema}.${seq}');`) },
                      { label: "Copy CURRVAL", action: () => navigator.clipboard.writeText(`SELECT currval('${schema}.${seq}');`) },
                      { label: "Open NEXTVAL in Editor", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: `${seq}.sql`, content: `SELECT nextval('${schema}.${seq}');`, connectionId: s.activeConnectionId, isDirty: false }); } },
                      { separator: true, label: "s" },
                      { label: "Reset to 1", action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: `reset_${seq}.sql`, content: `SELECT setval('${schema}.${seq}', 1, false);`, connectionId: s.activeConnectionId, isDirty: false }); } },
                      { label: "Drop Sequence", danger: true, action: () => { const s = useAppStore.getState(); s.addTab({ id: `tab-${Date.now()}`, title: `drop_${seq}.sql`, content: `DROP SEQUENCE IF EXISTS ${schema}.${seq};`, connectionId: s.activeConnectionId, isDirty: false }); } },
                    ])}
                    className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-14 text-xs cursor-default">
                    <ArrowUpDown className="w-3 h-3 text-teal-400 shrink-0" />
                    <span className="text-foreground truncate">{seq}</span>
                  </div>
                ))}</>
              )}
              emptyText="No sequences"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Database node ────────────────────────────────────────────────────────────
function DatabaseNode({ dbName, isActive, onSwitch }: { dbName: string; isActive: boolean; onSwitch: (name: string) => void }) {
  const [open, setOpen] = useState(isActive);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const conn = useAppStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));

  useEffect(() => {
    if (!isActive || !open || !conn) return;
    let cancelled = false;
    setLoading(true);
    api.fetchSchemas(conn).then((s) => { if (!cancelled) { setSchemas(s); setLoading(false); } }).catch(() => { if (!cancelled) { setSchemas([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [isActive, open, conn?.id, conn?.database, conn?.status, fetchKey]);

  useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  const refresh = () => setFetchKey((k) => k + 1);

  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      { label: isActive ? "Current Database" : "Switch to This Database", disabled: isActive, action: () => onSwitch(dbName) },
      { label: "Refresh", action: refresh },
      { separator: true, label: "sep" },
      { label: "New Query", action: () => { const store = useAppStore.getState(); store.addTab({ id: `tab-${Date.now()}`, title: `query_${dbName}.sql`, content: `-- Database: ${dbName}\nSELECT 1;`, connectionId: store.activeConnectionId, isDirty: false }); } },
      { label: "Create Schema...", action: async () => { if (!isActive) { alert("Switch to this database first"); return; } const name = prompt("Enter new schema name:"); if (!name?.trim() || !conn) return; const r = await api.createSchema(conn, name.trim()); if (r.ok) refresh(); else alert(r.error ?? "Failed"); } },
      { separator: true, label: "sep2" },
      { label: "Drop Database", danger: true, action: async () => { if (isActive) { alert("Cannot drop the active database."); return; } if (!conn || !confirm(`DROP database "${dbName}"?`)) return; const r = await api.dropDatabase(conn, dbName); if (!r.ok) alert(r.error ?? "Failed"); } },
    ]);
  };

  return (
    <div>
      <button onClick={() => { if (!isActive) onSwitch(dbName); else setOpen(!open); }} onContextMenu={handleContextMenu}
        className={cn("tree-item flex items-center gap-1.5 py-1 px-2 pl-3 w-full text-left text-xs rounded-sm", isActive && "bg-accent/50")}>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        <Database className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-success" : "text-muted-foreground")} />
        <span className={cn("truncate", isActive ? "text-foreground font-medium" : "text-foreground/70")}>{dbName}</span>
        {isActive && <span className="text-[9px] px-1 py-0.5 rounded bg-success/15 text-success ml-auto shrink-0">active</span>}
        {loading && <Loader2 className="w-3 h-3 text-muted-foreground ml-auto animate-spin shrink-0" />}
      </button>
      {open && isActive && (
        <div>
          {loading && schemas.length === 0 && <div className="flex items-center gap-2 py-2 pl-8 text-[10px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Loading schemas...</div>}
          {schemas.map((schema, i) => <SchemaGroup key={schema} schema={schema} defaultOpen={i === 0} />)}
          {!loading && schemas.length === 0 && <div className="pl-8 py-1 text-[10px] text-muted-foreground italic">No schemas</div>}
        </div>
      )}
      {open && !isActive && <div className="pl-8 py-1.5 text-[10px] text-muted-foreground italic">Click to switch to this database</div>}
    </div>
  );
}

// ── Main Explorer ────────────────────────────────────────────────────────────
export function DatabaseExplorer() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const conn = useAppStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const switchDatabase = useAppStore((s) => s.switchDatabase);
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!conn || conn.status !== "connected") { setDatabases([]); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    api.fetchDatabases(conn).then((dbs) => { if (!cancelled) { setDatabases(dbs); setLoading(false); } }).catch((e: any) => { if (!cancelled) { setError(e.message ?? "Failed to load databases"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeConnectionId, conn?.status, conn?.database, fetchKey]);

  const handleSwitchDb = async (dbName: string) => {
    if (conn?.database === dbName) return;
    await switchDatabase(dbName);
    setFetchKey((k) => k + 1);
  };

  const handleTitleContextMenu = (e: React.MouseEvent) => {
    if (!conn) return;
    showContextMenu(e, [
      { label: "New Query Tab", action: () => { useAppStore.getState().addTab({ id: `tab-${Date.now()}`, title: `query_${conn.name}.sql`, content: `-- Connected to ${conn.name}\nSELECT 1;`, connectionId: conn.id, isDirty: false }); } },
      { label: "Refresh Explorer", action: () => setFetchKey((k) => k + 1) },
      { separator: true, label: "sep" },
      { label: "Create Database...", action: async () => { const name = prompt("Enter new database name:"); if (!name?.trim() || !conn) return; const r = await api.createDatabase(conn, name.trim()); if (r.ok) setFetchKey((k) => k + 1); else alert(r.error ?? "Failed"); } },
      { separator: true, label: "sep2" },
      { label: "Copy Connection String", action: () => { const cs = conn.type === "sqlite" ? conn.filename ?? conn.database : `${conn.type}://${conn.user ? conn.user + "@" : ""}${conn.host}:${conn.port}/${conn.database}`; navigator.clipboard.writeText(cs); } },
      { label: "Push Schema to GitHub →", action: () => { useAppStore.getState().setActiveSidebarTab("git"); } },
      { separator: true, label: "sep3" },
      { label: "Disconnect", action: () => useAppStore.getState().disconnectConnection(conn.id), danger: true },
    ]);
  };

  if (!conn) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Explorer</div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground text-xs text-center">
          <Database className="w-8 h-8 opacity-30" />
          <span>No connection selected</span>
          <button onClick={() => useAppStore.getState().setActiveSidebarTab("connections")} className="text-primary hover:underline text-[11px]">Go to Connections</button>
        </div>
      </div>
    );
  }

  const dbMeta = DB_TYPE_META[conn.type];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>Explorer</span>
        <button onClick={() => setFetchKey((k) => k + 1)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
        </button>
      </div>

      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-panel-border cursor-context-menu" onContextMenu={handleTitleContextMenu}>
        <Database className={cn("w-3.5 h-3.5", conn.status === "connected" ? "text-success" : "text-muted-foreground")} />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground truncate">{conn.name}</span>
          <span className="text-[10px] text-muted-foreground truncate">{dbMeta.label} — {conn.database}</span>
        </div>
      </div>

      {conn.status !== "connected" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground text-xs text-center">
          <span>Connection is disconnected</span>
          <button onClick={() => useAppStore.getState().connectConnection(conn.id)} className="px-3 py-1 rounded bg-primary/15 text-primary text-[11px] hover:bg-primary/25 transition-colors">Connect</button>
        </div>
      )}

      {conn.status === "connected" && error && <div className="p-3 text-xs text-destructive">{error}</div>}

      {conn.status === "connected" && (
        <div className="flex-1 overflow-y-auto py-1">
          {loading && databases.length === 0 && <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading databases...</div>}
          {databases.map((dbName) => <DatabaseNode key={dbName} dbName={dbName} isActive={dbName === conn.database} onSwitch={handleSwitchDb} />)}
          {!loading && databases.length === 0 && !error && <div className="px-3 py-4 text-xs text-muted-foreground text-center">No databases found</div>}
        </div>
      )}
    </div>
  );
}
