import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Table2,
  Columns3,
  Key,
  Database,
  FolderOpen,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mockConnections,
  mockTables,
  DBTable,
  DBColumn,
} from "@/lib/mock-data";
import { useAppStore } from "@/store/app-store";
import { showContextMenu } from "./ContextMenu";

function ColumnItem({ col, tableName }: { col: DBColumn; tableName: string }) {
  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      {
        label: "Copy Column Name",
        action: () => navigator.clipboard.writeText(col.name),
      },
      {
        label: `SELECT ${col.name}`,
        action: () => {
          const store = useAppStore.getState();
          store.addTab({
            id: `tab-${Date.now()}`,
            title: `select_${col.name}.sql`,
            content: `SELECT ${col.name}\nFROM ${tableName}\nLIMIT 100;`,
            connectionId: store.activeConnectionId,
            isDirty: false,
          });
        },
      },
      { separator: true, label: "sep" },
      { label: `Type: ${col.type}`, disabled: true },
      {
        label: col.nullable ? "Nullable: Yes" : "Nullable: No",
        disabled: true,
      },
      {
        label: col.primaryKey ? "Primary Key: Yes" : "Primary Key: No",
        disabled: true,
      },
    ]);
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className="tree-item flex items-center gap-1.5 py-0.5 px-2 pl-14 text-xs cursor-default"
    >
      {col.primaryKey ? (
        <Key className="w-3 h-3 text-warning shrink-0" />
      ) : (
        <Columns3 className="w-3 h-3 text-muted-foreground shrink-0" />
      )}
      <span className="text-foreground truncate">{col.name}</span>
      <span className="text-muted-foreground ml-auto text-[10px] truncate">
        {col.type}
      </span>
    </div>
  );
}

function TableItem({ table }: { table: DBTable }) {
  const [open, setOpen] = useState(false);
  const { addTab, tabs } = useAppStore();

  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      {
        label: "SELECT TOP 100",
        action: () =>
          addTab({
            id: `tab-${Date.now()}`,
            title: `${table.name}.sql`,
            content: `SELECT *\nFROM ${table.schema}.${table.name}\nLIMIT 100;`,
            connectionId: useAppStore.getState().activeConnectionId,
            isDirty: false,
          }),
      },
      {
        label: "SELECT COUNT(*)",
        action: () =>
          addTab({
            id: `tab-${Date.now()}`,
            title: `count_${table.name}.sql`,
            content: `SELECT COUNT(*)\nFROM ${table.schema}.${table.name};`,
            connectionId: useAppStore.getState().activeConnectionId,
            isDirty: false,
          }),
      },
      { separator: true, label: "sep" },
      {
        label: "View Schema",
        action: () => useAppStore.getState().openSchemaTab(),
      },
      {
        label: "Generate INSERT",
        action: () => {
          const cols = table.columns.map((c) => c.name).join(", ");
          addTab({
            id: `tab-${Date.now()}`,
            title: `insert_${table.name}.sql`,
            content: `INSERT INTO ${table.schema}.${table.name} (${cols})\nVALUES ();`,
            connectionId: useAppStore.getState().activeConnectionId,
            isDirty: false,
          });
        },
      },
      {
        label: "Generate CREATE TABLE",
        action: () => {
          const cols = table.columns
            .map(
              (c) =>
                `  ${c.name} ${c.type}${c.primaryKey ? " PRIMARY KEY" : ""}${c.nullable ? "" : " NOT NULL"}`,
            )
            .join(",\n");
          addTab({
            id: `tab-${Date.now()}`,
            title: `create_${table.name}.sql`,
            content: `CREATE TABLE ${table.schema}.${table.name} (\n${cols}\n);`,
            connectionId: useAppStore.getState().activeConnectionId,
            isDirty: false,
          });
        },
      },
      { separator: true, label: "sep2" },
      {
        label: "Copy Table Name",
        action: () =>
          navigator.clipboard.writeText(`${table.schema}.${table.name}`),
      },
      { label: "Refresh", disabled: true },
      { separator: true, label: "sep3" },
      { label: "Truncate Table", danger: true, disabled: true },
      { label: "Drop Table", danger: true, disabled: true },
    ]);
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        onContextMenu={handleContextMenu}
        className="tree-item flex items-center gap-1.5 py-1 px-2 pl-10 w-full text-left text-xs rounded-sm"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-foreground truncate">{table.name}</span>
        <span className="text-muted-foreground ml-auto text-[10px]">
          {table.rowCount.toLocaleString()}
        </span>
      </button>
      {open &&
        table.columns.map((col) => (
          <ColumnItem
            key={col.name}
            col={col}
            tableName={`${table.schema}.${table.name}`}
          />
        ))}
    </div>
  );
}

function SchemaGroup({
  schema,
  tables,
}: {
  schema: string;
  tables: DBTable[];
}) {
  const [open, setOpen] = useState(schema === "public");
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="tree-item flex items-center gap-1.5 py-1 px-2 pl-6 w-full text-left text-xs rounded-sm"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        {open ? (
          <FolderOpen className="w-3.5 h-3.5 text-warning shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-warning shrink-0" />
        )}
        <span className="text-foreground">{schema}</span>
        <span className="text-muted-foreground ml-auto text-[10px]">
          {tables.length}
        </span>
      </button>
      {open && tables.map((t) => <TableItem key={t.name} table={t} />)}
    </div>
  );
}

export function DatabaseExplorer() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const tables = mockTables[activeConnectionId] || [];
  const conn = mockConnections.find((c) => c.id === activeConnectionId);

  const schemas = tables.reduce<Record<string, DBTable[]>>((acc, t) => {
    (acc[t.schema] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Explorer
      </div>

      {/* Active connection */}
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-panel-border">
        <Database className="w-3.5 h-3.5 text-success" />
        <span className="text-xs font-medium text-foreground truncate">
          {conn?.name}
        </span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {Object.entries(schemas).map(([schema, tbls]) => (
          <SchemaGroup key={schema} schema={schema} tables={tbls} />
        ))}
      </div>
    </div>
  );
}
