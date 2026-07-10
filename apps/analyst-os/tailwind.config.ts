import type { Config } from "tailwindcss";
import uiPreset from "@valstine/ui/tailwind.preset";

export default {
  presets: [uiPreset],
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/**/*.{ts,tsx}",
    "../../packages/core/**/*.{ts,tsx}",
  ],
} satisfies Config;
