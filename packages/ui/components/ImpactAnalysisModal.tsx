import { useState } from "react";
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Wrench,
} from "lucide-react";
import type { ImpactReport, DDLRisk } from "@/lib/impact-analysis";
import { cn } from "@/lib/utils";

// ── Risk configuration ────────────────────────────────────────────────────

const RISK_CONFIG: Record<
  DDLRisk,
  {
    color: string;
    bg: string;
    border: string;
    Icon: typeof AlertTriangle;
    label: string;
    proceedLabel: string;
    proceedClass: string;
  }
> = {
  LOW: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    Icon: Info,
    label: "Low Risk",
    proceedLabel: "Execute",
    proceedClass: "bg-primary text-primary-foreground hover:bg-primary/90",
  },
  MEDIUM: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    Icon: AlertTriangle,
    label: "Medium Risk",
    proceedLabel: "Execute Anyway",
    proceedClass: "bg-yellow-500 text-black hover:bg-yellow-400",
  },
  HIGH: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    Icon: AlertTriangle,
    label: "High Risk",
    proceedLabel: "Execute Anyway",
    proceedClass: "bg-orange-500 text-white hover:bg-orange-400",
  },
  CRITICAL: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    Icon: AlertOctagon,
    label: "Critical Risk",
    proceedLabel: "Execute (Dangerous)",
    proceedClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
};

// ── Risk meter bar ────────────────────────────────────────────────────────

function RiskMeter({ score, risk }: { score: number; risk: DDLRisk }) {
  const barColor =
    risk === "CRITICAL" ? "bg-red-500" :
    risk === "HIGH"     ? "bg-orange-500" :
    risk === "MEDIUM"   ? "bg-yellow-500" :
                          "bg-blue-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Risk Score</span>
        <span className={RISK_CONFIG[risk].color}>{score} / 100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────

interface Props {
  report: ImpactReport;
  onProceed: () => void;
  onCancel: () => void;
}

export function ImpactAnalysisModal({ report, onProceed, onCancel }: Props) {
  const cfg = RISK_CONFIG[report.risk];
  const { Icon } = cfg;

  const [showQueries, setShowQueries] = useState(true);
  const [showMigration, setShowMigration] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyMigration = () => {
    if (!report.suggestedMigration) return;
    navigator.clipboard.writeText(report.suggestedMigration);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex w-full max-w-2xl max-h-[88vh] flex-col rounded-xl border border-panel-border bg-panel-bg shadow-2xl">

        {/* ── Header ── */}
        <div className={cn("flex items-start gap-3 rounded-t-xl border-b border-panel-border p-4", cfg.bg)}>
          <div className={cn("mt-0.5 shrink-0 rounded-lg border p-1.5", cfg.bg, cfg.border)}>
            <Icon className={cn("h-4 w-4", cfg.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", cfg.bg, cfg.border, cfg.color)}>
                {cfg.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Impact Analysis — Pre-Flight Check
              </span>
            </div>
            <p className="mt-1.5 text-xs text-foreground/90 leading-snug">
              {report.summary}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 space-y-3 overflow-auto p-4">

          <RiskMeter score={report.riskScore} risk={report.risk} />

          {/* Quoted SQL preview — always shown so user sees exactly what will execute */}
          <div className="rounded-md border border-panel-border bg-background/60 p-2.5">
            <div className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Will Execute
            </div>
            <pre className="font-mono text-[11px] text-foreground/90 whitespace-pre-wrap break-all">
              {report.quotedSQL}
            </pre>
          </div>

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div className="space-y-1.5">
              {report.warnings.map((w, i) => (
                <div
                  key={i}
                  className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs", cfg.bg, cfg.border)}
                >
                  <AlertTriangle className={cn("mt-0.5 h-3 w-3 shrink-0", cfg.color)} />
                  <span className="text-foreground/80">{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Impacted historical queries */}
          {report.impactedQueries.length > 0 ? (
            <div>
              <button
                onClick={() => setShowQueries(v => !v)}
                className="mb-1.5 flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {showQueries ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {report.impactedQueries.length} Historical Quer{report.impactedQueries.length === 1 ? "y" : "ies"} Affected
              </button>
              {showQueries && (
                <div className="max-h-52 space-y-1.5 overflow-auto">
                  {report.impactedQueries.map(q => (
                    <div key={q.id} className="rounded-md border border-panel-border bg-background/60 p-2">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                          {q.connectionName}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(q.executedAt).toLocaleDateString()}
                        </span>
                        <span className="ml-auto text-[9px] text-muted-foreground">
                          {q.matchReason}
                        </span>
                      </div>
                      <pre className="truncate whitespace-pre-wrap font-mono text-[10px] text-muted-foreground/80">
                        {q.query.trim().slice(0, 160)}{q.query.length > 160 ? "…" : ""}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-panel-border bg-green-500/5 px-2.5 py-2 text-xs text-muted-foreground">
              <Check className="h-3 w-3 shrink-0 text-green-500" />
              No recent historical queries reference this {report.operation.column ? "column" : "table"}.
            </div>
          )}

          {/* Suggested migration script */}
          {report.suggestedMigration && (
            <div>
              <button
                onClick={() => setShowMigration(v => !v)}
                className="mb-1.5 flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {showMigration ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Wrench className="h-3 w-3" />
                Safer Migration Script
              </button>
              {showMigration && (
                <div className="relative rounded-md border border-panel-border bg-background/60">
                  <button
                    onClick={copyMigration}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <pre className="max-h-44 overflow-auto p-3 font-mono text-[10px] text-muted-foreground/80 whitespace-pre-wrap">
                    {report.suggestedMigration}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 rounded-b-xl border-t border-panel-border p-4">
          <p className="text-[10px] text-muted-foreground">
            Analysis based on {report.impactedQueries.length} historical quer{report.impactedQueries.length === 1 ? "y" : "ies"} and operation risk profile.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onCancel}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={onProceed}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", cfg.proceedClass)}
            >
              {cfg.proceedLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
