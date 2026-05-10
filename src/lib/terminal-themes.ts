export interface TerminalThemeColors {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TerminalPreset {
  id: string;
  label: string;
  colors: TerminalThemeColors;
}

export const TERMINAL_PRESETS: TerminalPreset[] = [
  {
    id: "vs-dark",
    label: "VS Dark (default)",
    colors: {
      background: "#1e1e1e", foreground: "#d4d4d4", cursor: "#aeafad", cursorAccent: "#1e1e1e",
      selectionBackground: "#264f78",
      black: "#1e1e1e", red: "#f44747", green: "#6a9955", yellow: "#d7ba7d",
      blue: "#569cd6", magenta: "#c678dd", cyan: "#4ec9b0", white: "#d4d4d4",
      brightBlack: "#808080", brightRed: "#f44747", brightGreen: "#6a9955",
      brightYellow: "#d7ba7d", brightBlue: "#569cd6", brightMagenta: "#c678dd",
      brightCyan: "#4ec9b0", brightWhite: "#ffffff",
    },
  },
  {
    id: "green-black",
    label: "Green on Black",
    colors: {
      background: "#000000", foreground: "#00ff00", cursor: "#00ff00", cursorAccent: "#000000",
      selectionBackground: "#003300",
      black: "#000000", red: "#cc0000", green: "#00ff00", yellow: "#cccc00",
      blue: "#0000cc", magenta: "#cc00cc", cyan: "#00cccc", white: "#cccccc",
      brightBlack: "#555555", brightRed: "#ff0000", brightGreen: "#00ff00",
      brightYellow: "#ffff00", brightBlue: "#0000ff", brightMagenta: "#ff00ff",
      brightCyan: "#00ffff", brightWhite: "#ffffff",
    },
  },
  {
    id: "amber-black",
    label: "Amber on Black",
    colors: {
      background: "#0a0800", foreground: "#ffb000", cursor: "#ffb000", cursorAccent: "#0a0800",
      selectionBackground: "#332200",
      black: "#0a0800", red: "#ff4444", green: "#88cc00", yellow: "#ffb000",
      blue: "#4488ff", magenta: "#ff44ff", cyan: "#44ffff", white: "#ffcc88",
      brightBlack: "#554422", brightRed: "#ff6666", brightGreen: "#aaee22",
      brightYellow: "#ffcc44", brightBlue: "#66aaff", brightMagenta: "#ff66ff",
      brightCyan: "#66ffff", brightWhite: "#ffffff",
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    colors: {
      background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", cursorAccent: "#282a36",
      selectionBackground: "#44475a",
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94",
      brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df",
      brightCyan: "#a4ffff", brightWhite: "#ffffff",
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    colors: {
      background: "#002b36", foreground: "#839496", cursor: "#839496", cursorAccent: "#002b36",
      selectionBackground: "#073642",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75",
      brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
    },
  },
  {
    id: "monokai",
    label: "Monokai",
    colors: {
      background: "#272822", foreground: "#f8f8f2", cursor: "#f8f8f0", cursorAccent: "#272822",
      selectionBackground: "#49483e",
      black: "#272822", red: "#f92672", green: "#a6e22e", yellow: "#f4bf75",
      blue: "#66d9ef", magenta: "#ae81ff", cyan: "#a1efe4", white: "#f8f8f2",
      brightBlack: "#75715e", brightRed: "#f92672", brightGreen: "#a6e22e",
      brightYellow: "#f4bf75", brightBlue: "#66d9ef", brightMagenta: "#ae81ff",
      brightCyan: "#a1efe4", brightWhite: "#f9f8f5",
    },
  },
  {
    id: "nord",
    label: "Nord",
    colors: {
      background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", cursorAccent: "#2e3440",
      selectionBackground: "#434c5e",
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b", brightBlue: "#81a1c1", brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb", brightWhite: "#eceff4",
    },
  },
  {
    id: "light",
    label: "Light",
    colors: {
      background: "#ffffff", foreground: "#333333", cursor: "#333333", cursorAccent: "#ffffff",
      selectionBackground: "#add6ff",
      black: "#000000", red: "#cd3131", green: "#00BC00", yellow: "#949800",
      blue: "#0451a5", magenta: "#bc05bc", cyan: "#0598bc", white: "#555555",
      brightBlack: "#666666", brightRed: "#cd3131", brightGreen: "#14CE14",
      brightYellow: "#b5ba00", brightBlue: "#0451a5", brightMagenta: "#bc05bc",
      brightCyan: "#0598bc", brightWhite: "#a5a5a5",
    },
  },
  {
    id: "custom",
    label: "Custom",
    colors: {
      background: "#1e1e1e", foreground: "#d4d4d4", cursor: "#aeafad", cursorAccent: "#1e1e1e",
      selectionBackground: "#264f78",
      black: "#1e1e1e", red: "#f44747", green: "#6a9955", yellow: "#d7ba7d",
      blue: "#569cd6", magenta: "#c678dd", cyan: "#4ec9b0", white: "#d4d4d4",
      brightBlack: "#808080", brightRed: "#f44747", brightGreen: "#6a9955",
      brightYellow: "#d7ba7d", brightBlue: "#569cd6", brightMagenta: "#c678dd",
      brightCyan: "#4ec9b0", brightWhite: "#ffffff",
    },
  },
];

export const DEFAULT_PRESET_ID = "vs-dark";
export const DEFAULT_TERMINAL_FONT = 'Menlo, Monaco, "Courier New", monospace';
export const DEFAULT_TERMINAL_FONT_SIZE = 13;

export function getPresetById(id: string): TerminalPreset {
  return TERMINAL_PRESETS.find((p) => p.id === id) ?? TERMINAL_PRESETS[0];
}
