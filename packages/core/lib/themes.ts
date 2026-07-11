// Shared color-theme registry for both apps/studio and apps/analyst-os.
// Adding a new theme: append an entry here, then add matching CSS variable
// overrides in packages/ui/styles/tokens.css (studio) and the inline
// `--analyst-*` var maps in the analyst-os workbench components.
export type ThemeId = "light" | "light-modern" | "dark" | "black";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
  mode: "light" | "dark";
  swatch: { bg: string; panel: string; accent: string };
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    label: "Light",
    description: "Default light appearance.",
    mode: "light",
    swatch: { bg: "#ffffff", panel: "#eef3fb", accent: "#1d4ed8" },
  },
  {
    id: "light-modern",
    label: "Light Modern",
    description: "Neutral VS Code Light Modern palette.",
    mode: "light",
    swatch: { bg: "#ffffff", panel: "#f5f5f5", accent: "#005fb8" },
  },
  {
    id: "dark",
    label: "Dark (Default)",
    description: "Default dark appearance.",
    mode: "dark",
    swatch: { bg: "#131b29", panel: "#182236", accent: "#3b82f6" },
  },
  {
    id: "black",
    label: "Black (Space Gray)",
    description: "Near-black, neutral gray chrome.",
    mode: "dark",
    swatch: { bg: "#121212", panel: "#1a1a1a", accent: "#3b82f6" },
  },
];

export const DEFAULT_THEME_ID: ThemeId = "dark";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_OPTIONS.some((t) => t.id === value);
}

export function getThemeOption(id: string): ThemeOption {
  return THEME_OPTIONS.find((t) => t.id === id) ?? THEME_OPTIONS[1];
}

export function isDarkTheme(id: string): boolean {
  return getThemeOption(id).mode === "dark";
}

// Applies the theme to <html>: toggles the `.dark` class Tailwind's
// `darkMode: ["class"]` relies on, plus a `.theme-<id>` class so CSS can
// target theme-specific variable overrides (e.g. `.dark.theme-black`).
// data-theme is also stamped for debugging/introspection.
export function applyThemeClass(themeId: string): void {
  if (typeof document === "undefined") return;
  const opt = getThemeOption(themeId);
  const root = document.documentElement;
  root.classList.toggle("dark", opt.mode === "dark");
  for (const t of THEME_OPTIONS) root.classList.remove(`theme-${t.id}`);
  root.classList.add(`theme-${opt.id}`);
  root.setAttribute("data-theme", opt.id);
}
