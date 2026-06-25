import { useState, useEffect, useRef } from "react";
import { X, Variable } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  variables: string[];
  onRun: (values: Record<string, string>) => void;
  onClose: () => void;
}

export function VariablesModal({ open, variables, onRun, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValues({});
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, variables]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onRun(values);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-sm rounded-lg border border-panel-border bg-panel-bg shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Variable className="w-4 h-4 text-primary" />
            Fill in query variables
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {variables.map((name, i) => (
            <div key={name} className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-mono">{`{{${name}}}`}</label>
              <input
                ref={i === 0 ? firstRef : undefined}
                type="text"
                value={values[name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
                placeholder={`Value for ${name}`}
                className={cn(
                  "w-full rounded border border-panel-border bg-secondary px-3 py-1.5",
                  "text-xs text-foreground placeholder:text-muted-foreground outline-none",
                  "focus:border-primary transition-colors",
                )}
              />
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-panel-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Run Query
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
