import type * as Monaco from "monaco-editor";

// Shared Monaco color themes matching Studio's app-level color themes
// (light / dark / black-space-gray). Call from a Monaco <Editor>'s
// beforeMount so `theme="dbstudio-dark" | "dbstudio-black" | "dbstudio-light"`
// resolves.
export function registerDbStudioThemes(monaco: typeof Monaco) {
  monaco.editor.defineTheme("dbstudio-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "569cd6", fontStyle: "bold" },
      { token: "string", foreground: "ce9178" },
      { token: "number", foreground: "b5cea8" },
      { token: "comment", foreground: "6a9955", fontStyle: "italic" },
      { token: "operator", foreground: "d4d4d4" },
      { token: "type", foreground: "4ec9b0" },
    ],
    colors: {
      "editor.background": "#1e2228",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#4a5568",
      "editorLineNumber.activeForeground": "#a0aec0",
      "editor.selectionBackground": "#264f78",
      "editor.lineHighlightBackground": "#252a33",
      "editorCursor.foreground": "#528bff",
      "editorWhitespace.foreground": "#3b4048",
      "editorIndentGuide.background": "#3b4048",
      "editor.selectionHighlightBackground": "#264f7844",
    },
  });

  monaco.editor.defineTheme("dbstudio-black", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "569cd6", fontStyle: "bold" },
      { token: "string", foreground: "ce9178" },
      { token: "number", foreground: "b5cea8" },
      { token: "comment", foreground: "6a9955", fontStyle: "italic" },
      { token: "operator", foreground: "d4d4d4" },
      { token: "type", foreground: "4ec9b0" },
    ],
    colors: {
      "editor.background": "#1f1f1f",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#5a5a5a",
      "editorLineNumber.activeForeground": "#a0a0a0",
      "editor.selectionBackground": "#2a2a2a",
      "editor.lineHighlightBackground": "#262626",
      "editorCursor.foreground": "#5b9dff",
      "editorWhitespace.foreground": "#3a3a3a",
      "editorIndentGuide.background": "#2a2a2a",
      "editor.selectionHighlightBackground": "#2a2a2a88",
    },
  });

  monaco.editor.defineTheme("dbstudio-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "0000ff", fontStyle: "bold" },
      { token: "string", foreground: "a31515" },
      { token: "number", foreground: "098658" },
      { token: "comment", foreground: "008000", fontStyle: "italic" },
      { token: "operator", foreground: "333333" },
      { token: "type", foreground: "267f99" },
    ],
    colors: {
      "editor.background": "#f8f8f8",
      "editor.foreground": "#333333",
      "editorLineNumber.foreground": "#999999",
      "editorLineNumber.activeForeground": "#333333",
      "editor.selectionBackground": "#add6ff",
      "editor.lineHighlightBackground": "#f0f0f0",
      "editorCursor.foreground": "#0066cc",
      "editorWhitespace.foreground": "#cccccc",
      "editorIndentGuide.background": "#dddddd",
      "editor.selectionHighlightBackground": "#add6ff44",
    },
  });

  monaco.editor.defineTheme("dbstudio-light-modern", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "0000ff", fontStyle: "bold" },
      { token: "string", foreground: "a31515" },
      { token: "number", foreground: "098658" },
      { token: "comment", foreground: "008000", fontStyle: "italic" },
      { token: "operator", foreground: "3b3b3b" },
      { token: "type", foreground: "267f99" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#3b3b3b",
      "editorLineNumber.foreground": "#a0a0a0",
      "editorLineNumber.activeForeground": "#3b3b3b",
      "editor.selectionBackground": "#cce4fa",
      "editor.lineHighlightBackground": "#f5f5f5",
      "editorCursor.foreground": "#005fb8",
      "editorWhitespace.foreground": "#d4d4d4",
      "editorIndentGuide.background": "#e5e5e5",
      "editor.selectionHighlightBackground": "#cce4fa88",
    },
  });
}

export function dbStudioThemeName(
  theme: string,
): "dbstudio-dark" | "dbstudio-black" | "dbstudio-light" | "dbstudio-light-modern" {
  if (theme === "black") return "dbstudio-black";
  if (theme === "light") return "dbstudio-light";
  if (theme === "light-modern") return "dbstudio-light-modern";
  return "dbstudio-dark";
}
