import { useState, useRef, useEffect, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { SchemaDiffEntry } from "@/lib/api";
import {
  Copy,
  FileCode2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── helpers to build side-by-side diff lines ── */

interface DiffLine {
  leftNum: number | null;
  rightNum: number | null;
  leftText: string;
  rightText: string;
  type: "unchanged" | "added" | "removed" | "modified";
}

function buildDiffLines(diffs: SchemaDiffEntry[]): DiffLine[] {
  if (diffs.length === 0) return [];

  const grouped = new Map<string, SchemaDiffEntry[]>();
  for (const d of diffs) {
    const key = `${d.schema}.${d.table}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(d);
  }

  const lines: DiffLine[] = [];
  let leftNum = 1;
  let rightNum = 1;

  for (const [tableKey, tableDiffs] of grouped) {
    const tableAdded = tableDiffs.some((d) => d.type === "table_added");
    const tableRemoved = tableDiffs.some((d) => d.type === "table_removed");

    if (tableAdded) {
      lines.push({
        leftNum: null,
        rightNum: rightNum++,
        leftText: "",
        rightText: `CREATE TABLE ${tableKey} (`,
        type: "added",
      });
      const td = tableDiffs.find((d) => d.type === "table_added");
      if (td?.migrationUp) {
        for (const l of td.migrationUp.split("\n").slice(1, -1)) {
          lines.push({
            leftNum: null,
            rightNum: rightNum++,
            leftText: "",
            rightText: l,
            type: "added",
          });
        }
      }
      lines.push({
        leftNum: null,
        rightNum: rightNum++,
        leftText: "",
        rightText: ");",
        type: "added",
      });
      lines.push({
        leftNum: null,
        rightNum: null,
        leftText: "",
        rightText: "",
        type: "unchanged",
      });
      continue;
    }

    if (tableRemoved) {
      lines.push({
        leftNum: leftNum++,
        rightNum: null,
        leftText: `CREATE TABLE ${tableKey} (`,
        rightText: "",
        type: "removed",
      });
      const td = tableDiffs.find((d) => d.type === "table_removed");
      if (td?.migrationDown) {
        for (const l of td.migrationDown.split("\n").slice(1, -1)) {
          lines.push({
            leftNum: leftNum++,
            rightNum: null,
            leftText: l,
            rightText: "",
            type: "removed",
          });
        }
      }
      lines.push({
        leftNum: leftNum++,
        rightNum: null,
        leftText: ");",
        rightText: "",
        type: "removed",
      });
      lines.push({
        leftNum: null,
        rightNum: null,
        leftText: "",
        rightText: "",
        type: "unchanged",
      });
      continue;
    }

    lines.push({
      leftNum: leftNum++,
      rightNum: rightNum++,
      leftText: `-- ${tableKey}`,
      rightText: `-- ${tableKey}`,
      type: "unchanged",
    });

    for (const d of tableDiffs) {
      if (d.type === "column_added") {
        lines.push({
          leftNum: null,
          rightNum: rightNum++,
          leftText: "",
          rightText: `  + ${d.column}  ${d.details ?? ""}`,
          type: "added",
        });
      } else if (d.type === "column_removed") {
        lines.push({
          leftNum: leftNum++,
          rightNum: null,
          leftText: `  - ${d.column}  ${d.details ?? ""}`,
          rightText: "",
          type: "removed",
        });
      } else if (d.type === "column_changed") {
        const parts = (d.details ?? "").split(", ");
        const before = parts.map((p) => p.split(" → ")[0]).join(", ");
        const after = parts
          .map((p) => p.split(" → ")[1] ?? p.split(" → ")[0])
          .join(", ");
        lines.push({
          leftNum: leftNum++,
          rightNum: rightNum++,
          leftText: `  ~ ${d.column}  ${before}`,
          rightText: `  ~ ${d.column}  ${after}`,
          type: "modified",
        });
      }
    }

    lines.push({
      leftNum: null,
      rightNum: null,
      leftText: "",
      rightText: "",
      type: "unchanged",
    });
  }

  return lines;
}

/* ── Minimap ── */
function Minimap({
  lines,
  containerHeight,
  scrollTop,
  totalHeight,
  onSeek,
}: {
  lines: DiffLine[];
  containerHeight: number;
  scrollTop: number;
  totalHeight: number;
  onSeek: (ratio: number) => void;
}) {
  const minimapH = Math.min(containerHeight, 400);
  const scale = minimapH / Math.max(lines.length, 1);
  const viewportH =
    totalHeight > 0 ? (containerHeight / totalHeight) * minimapH : minimapH;
  const viewportTop =
    totalHeight > 0 ? (scrollTop / totalHeight) * minimapH : 0;

  return (
    <div
      className="w-[60px] shrink-0 bg-[var(--color-panel-bg)] border-l border-border/30 relative cursor-pointer select-none"
      style={{ height: containerHeight }}
      onMouseDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientY - rect.top) / rect.height);
      }}
    >
      {lines.map((l, i) => {
        if (l.type === "unchanged") return null;
        const color =
          l.type === "added"
            ? "bg-green-500"
            : l.type === "removed"
              ? "bg-red-500"
              : "bg-blue-500";
        return (
          <div
            key={i}
            className={cn("absolute left-1 right-1 rounded-[1px]", color)}
            style={{ top: i * scale, height: Math.max(scale, 2), opacity: 0.7 }}
          />
        );
      })}
      <div
        className="absolute left-0 right-0 bg-foreground/10 border border-foreground/20 rounded-sm pointer-events-none"
        style={{ top: viewportTop, height: Math.max(viewportH, 8) }}
      />
    </div>
  );
}

/* ── Diff line component ── */
function DiffRow({ line }: { line: DiffLine }) {
  const bg =
    line.type === "added"
      ? "bg-green-500/10"
      : line.type === "removed"
        ? "bg-red-500/10"
        : line.type === "modified"
          ? "bg-blue-500/10"
          : "";

  const gutterClass =
    line.type === "added"
      ? "bg-green-500/15 text-green-500/70"
      : line.type === "removed"
        ? "bg-red-500/15 text-red-500/70"
        : line.type === "modified"
          ? "bg-blue-500/15 text-blue-500/70"
          : "text-muted-foreground/50";

  const marker =
    line.type === "added"
      ? "+"
      : line.type === "removed"
        ? "-"
        : line.type === "modified"
          ? "~"
          : " ";

  return (
    <div
      className={cn("flex h-[22px] leading-[22px] text-[12px] font-mono", bg)}
    >
      <div
        className={cn(
          "w-[48px] shrink-0 text-right pr-2 select-none",
          gutterClass,
        )}
      >
        {line.leftNum ?? ""}
      </div>
      <div className="flex-1 min-w-0 truncate px-2">
        {line.type === "removed" || line.type === "modified" ? (
          <span
            className={
              line.type === "removed" ? "text-red-400" : "text-blue-300"
            }
          >
            {line.leftText}
          </span>
        ) : (
          <span className="text-muted-foreground/70">{line.leftText}</span>
        )}
      </div>
      <div className="w-px bg-border/40 shrink-0" />
      <div
        className={cn(
          "w-[48px] shrink-0 text-right pr-2 select-none",
          gutterClass,
        )}
      >
        {line.rightNum ?? ""}
      </div>
      <div className="flex-1 min-w-0 truncate px-2">
        {line.type === "added" || line.type === "modified" ? (
          <span
            className={
              line.type === "added" ? "text-green-400" : "text-blue-300"
            }
          >
            {line.rightText}
          </span>
        ) : (
          <span className="text-muted-foreground/70">{line.rightText}</span>
        )}
      </div>
      <div
        className={cn(
          "w-[24px] shrink-0 text-center select-none text-[11px]",
          gutterClass,
        )}
      >
        {marker}
      </div>
    </div>
  );
}

/* ── Change summary ── */
function ChangeSummary({ diffs }: { diffs: SchemaDiffEntry[] }) {
  const [open, setOpen] = useState(true);
  const counts = useMemo(() => {
    const c = {
      tables_added: 0,
      tables_removed: 0,
      columns_added: 0,
      columns_removed: 0,
      columns_changed: 0,
    };
    for (const d of diffs) {
      if (d.type === "table_added") c.tables_added++;
      else if (d.type === "table_removed") c.tables_removed++;
      else if (d.type === "column_added") c.columns_added++;
      else if (d.type === "column_removed") c.columns_removed++;
      else if (d.type === "column_changed") c.columns_changed++;
    }
    return c;
  }, [diffs]);

  return (
    <div className="border-b border-border/50">
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <span>
          {diffs.length} change{diffs.length !== 1 ? "s" : ""}
        </span>
        <div className="flex gap-3 ml-auto text-[11px]">
          {counts.tables_added > 0 && (
            <span className="text-green-400">+{counts.tables_added} tbl</span>
          )}
          {counts.tables_removed > 0 && (
            <span className="text-red-400">-{counts.tables_removed} tbl</span>
          )}
          {counts.columns_added > 0 && (
            <span className="text-green-400">+{counts.columns_added} col</span>
          )}
          {counts.columns_removed > 0 && (
            <span className="text-red-400">-{counts.columns_removed} col</span>
          )}
          {counts.columns_changed > 0 && (
            <span className="text-blue-400">~{counts.columns_changed} col</span>
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {diffs.map((d, i) => {
            const color =
              d.type === "table_added" || d.type === "column_added"
                ? "bg-green-500/15 text-green-400 border-green-500/30"
                : d.type === "table_removed" || d.type === "column_removed"
                  ? "bg-red-500/15 text-red-400 border-red-500/30"
                  : "bg-blue-500/15 text-blue-400 border-blue-500/30";
            return (
              <span
                key={i}
                className={cn("text-[11px] px-2 py-0.5 rounded border", color)}
              >
                {d.schema}.{d.table}
                {d.column ? `.${d.column}` : ""}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Exported data shape stored in the tab ── */
export interface SchemaDiffData {
  diffs: SchemaDiffEntry[];
  migrationUp: string;
  migrationDown: string;
  sourceLabel: string;
  targetLabel: string;
}

/* ── Main full-screen diff view (rendered in main editor area) ── */
export default function SchemaDiffView({ data }: { data: SchemaDiffData }) {
  const { addTab, setActiveTab } = useAppStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerH, setContainerH] = useState(500);

  const diffLines = useMemo(() => buildDiffLines(data.diffs), [data.diffs]);
  const totalHeight = diffLines.length * 22;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setContainerH(el.clientHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function openMigration(sql: string, label: string) {
    const id = `migration-${Date.now()}`;
    addTab({
      id,
      title: label,
      type: "query",
      content: sql,
      connectionId: "",
      isDirty: false,
    });
    setActiveTab(id);
  }

  function copyMigration() {
    if (data.migrationUp) navigator.clipboard.writeText(data.migrationUp);
  }

  if (data.diffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-green-400 bg-green-400/5">
        Schemas are identical — no differences found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50 bg-[var(--color-panel-bg)]">
        <span className="text-xs text-muted-foreground mr-auto">
          {data.sourceLabel} → {data.targetLabel}
        </span>
        {data.migrationUp && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] gap-1"
              onClick={copyMigration}
            >
              <Copy className="w-3 h-3" /> Copy Migration
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] gap-1"
              onClick={() => openMigration(data.migrationUp, "Migration UP ↑")}
            >
              <FileCode2 className="w-3 h-3" /> Migration UP
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] gap-1"
              onClick={() => openMigration(data.migrationDown, "Rollback ↓")}
            >
              <RefreshCw className="w-3 h-3" /> Rollback
            </Button>
          </>
        )}
      </div>

      {/* Change summary */}
      <ChangeSummary diffs={data.diffs} />

      {/* Column headers */}
      <div className="flex text-[11px] text-muted-foreground border-b border-border/40 bg-muted/20">
        <div className="flex-1 px-4 py-1 truncate font-medium">
          {data.sourceLabel}
        </div>
        <div className="w-px bg-border/40" />
        <div className="flex-1 px-4 py-1 truncate font-medium">
          {data.targetLabel}
        </div>
        <div className="w-[60px]" />
      </div>

      {/* Diff body with minimap */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {diffLines.map((line, i) => (
            <DiffRow key={i} line={line} />
          ))}
        </div>
        <Minimap
          lines={diffLines}
          containerHeight={containerH}
          scrollTop={scrollTop}
          totalHeight={totalHeight}
          onSeek={(ratio) => {
            const el = scrollRef.current;
            if (el) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
          }}
        />
      </div>
    </div>
  );
}
