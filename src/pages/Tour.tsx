import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/app-store";
import {
  Database,
  FolderTree,
  Play,
  Table2,
  Share2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Search,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tourSteps = [
  {
    icon: Database,
    title: "Connect Your Database",
    description:
      "Start by adding a database connection. Valstine Studio supports PostgreSQL, MySQL, SQLite, and more. Your connections are securely stored locally.",
    visual: (
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        {[
          {
            name: "Production DB",
            host: "prod.db.example.com",
            connected: true,
          },
          {
            name: "Staging DB",
            host: "staging.db.example.com",
            connected: true,
          },
          { name: "Local Dev", host: "localhost", connected: false },
        ].map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50"
          >
            <Database
              className={cn(
                "w-4 h-4",
                c.connected ? "text-success" : "text-muted-foreground",
              )}
            />
            <div>
              <div className="text-xs font-medium">{c.name}</div>
              <div className="text-[10px] text-muted-foreground">{c.host}</div>
            </div>
            <div
              className={cn(
                "ml-auto w-2 h-2 rounded-full",
                c.connected ? "bg-success" : "bg-muted-foreground/40",
              )}
            />
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: FolderTree,
    title: "Explore Your Schema",
    description:
      "Browse tables, columns, and data types in the sidebar explorer. Expand schemas, view column details, and see row counts at a glance.",
    visual: (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
          Explorer
        </div>
        <div className="space-y-1 ml-2">
          <div className="flex items-center gap-1.5 text-xs text-foreground/70">
            <ChevronRight className="w-3 h-3" />
            <FolderTree className="w-3.5 h-3.5 text-warning" />
            <span>public</span>
          </div>
          {["users", "orders", "products"].map((t) => (
            <div
              key={t}
              className="flex items-center gap-1.5 text-xs text-foreground/70 ml-4"
            >
              <Table2 className="w-3.5 h-3.5 text-primary" />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: Play,
    title: "Write & Execute Queries",
    description:
      "Use the intelligent SQL editor with syntax highlighting and auto-completion. Run queries with Cmd+Enter (Ctrl+Enter on Windows) and see results instantly.",
    visual: (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="h-7 border-b border-panel-border bg-tab-inactive flex items-center px-3">
          <span className="text-[10px] text-primary">active_users.sql</span>
        </div>
        <div className="p-3 font-mono text-[11px] text-muted-foreground bg-background leading-relaxed">
          <span className="text-blue-400 font-bold">SELECT</span> *{" "}
          <span className="text-blue-400 font-bold">FROM</span> users
          <br />
          <span className="text-blue-400 font-bold">WHERE</span> is_active ={" "}
          <span className="text-green-400">true</span>
          <br />
          <span className="text-blue-400 font-bold">LIMIT</span>{" "}
          <span className="text-orange-400">100</span>;
        </div>
        <div className="h-7 border-t border-panel-border bg-panel-bg flex items-center px-3 gap-2">
          <span className="text-[10px] text-success">8 rows</span>
          <span className="text-[10px] text-muted-foreground">23ms</span>
        </div>
      </div>
    ),
  },
  {
    icon: Share2,
    title: "Visualize Relationships",
    description:
      "See your database schema as an interactive diagram. Drag tables, zoom in/out, and understand relationships between your tables visually.",
    visual: (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-center gap-8">
          <div className="rounded-lg border border-border p-2 bg-secondary/30 text-center">
            <div className="text-[10px] font-medium bg-primary text-primary-foreground rounded px-2 py-0.5 mb-1">
              users
            </div>
            <div className="text-[9px] text-muted-foreground">
              id, email, name
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-12 h-px bg-primary" />
            <span className="text-[8px] text-primary">1:N</span>
          </div>
          <div className="rounded-lg border border-border p-2 bg-secondary/30 text-center">
            <div className="text-[10px] font-medium bg-primary text-primary-foreground rounded px-2 py-0.5 mb-1">
              orders
            </div>
            <div className="text-[9px] text-muted-foreground">
              id, user_id, total
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Clock,
    title: "Query History",
    description:
      "Every query you run is automatically saved. Search through your history, re-run past queries, or copy them to a new tab. Never lose a query again.",
    visual: (
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        {[
          { q: "SELECT * FROM users WHERE...", time: "2m ago", ms: "23ms" },
          { q: "UPDATE orders SET status...", time: "15m ago", ms: "45ms" },
          { q: "SELECT COUNT(*) FROM...", time: "1h ago", ms: "12ms" },
        ].map((h) => (
          <div
            key={h.q}
            className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 text-xs"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            <span className="text-foreground/70 truncate flex-1 font-mono text-[10px]">
              {h.q}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {h.time}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Sparkles,
    title: "You're All Set!",
    description:
      "You're ready to start using Valstine Studio. Use Cmd+K (Ctrl+K) to open the command palette anytime. Enjoy your database workflow!",
    visual: (
      <div className="flex flex-col items-center justify-center py-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Tip: Press{" "}
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono mx-0.5">
            Cmd+K
          </kbd>{" "}
          to search anything
        </p>
      </div>
    ),
  },
];

export default function Tour() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { completeTour } = useAppStore();
  const current = tourSteps[step];

  const handleNext = () => {
    if (step < tourSteps.length - 1) {
      setStep(step + 1);
    } else {
      completeTour();
      navigate("/studio");
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    completeTour();
    navigate("/studio");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-6 sm:mb-8 justify-center">
          {tourSteps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                i === step
                  ? "w-8 bg-primary"
                  : i < step
                    ? "w-4 bg-primary/50"
                    : "w-4 bg-border",
              )}
            />
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Icon header */}
          <div className="flex items-center justify-center pt-8 pb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <current.icon className="w-6 h-6 text-primary" />
            </div>
          </div>

          {/* Content */}
          <div className="px-6 sm:px-8 pb-4 text-center">
            <h2 className="text-lg sm:text-xl font-bold mb-2">
              {current.title}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Visual */}
          <div className="px-6 sm:px-8 pb-6">{current.visual}</div>

          {/* Actions */}
          <div className="px-6 sm:px-8 pb-6 flex items-center justify-between">
            <div>
              {step > 0 ? (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-secondary"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              ) : (
                <button
                  onClick={handleSkip}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-secondary"
                >
                  Skip tour
                </button>
              )}
            </div>
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {step === tourSteps.length - 1 ? "Open Studio" : "Next"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Step counter */}
        <div className="text-center mt-4 text-xs text-muted-foreground">
          {step + 1} of {tourSteps.length}
        </div>
      </div>
    </div>
  );
}
