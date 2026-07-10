import * as React from "react";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";

export interface ThemeMenuOption {
  id: string;
  label: string;
  description?: string;
  swatch: { bg: string; panel: string; accent: string };
}

export interface ThemeMenuProps {
  value: string;
  options: ThemeMenuOption[];
  onChange: (id: string) => void;
  trigger: React.ReactNode;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
}

// VS Code-style color theme picker: a trigger (icon button, settings row, …)
// that opens a dropdown listing every registered theme with a live swatch.
export function ThemeMenu({ value, options, onChange, trigger, triggerClassName, align = "end" }: ThemeMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(triggerClassName)} title="Color theme">
          {trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          Color Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="flex items-center gap-2.5 text-xs cursor-pointer"
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 dark:border-white/10"
              style={{
                background: `linear-gradient(135deg, ${opt.swatch.bg} 50%, ${opt.swatch.panel} 50%)`,
              }}
            />
            <span className="flex-1 truncate">{opt.label}</span>
            {value === opt.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
