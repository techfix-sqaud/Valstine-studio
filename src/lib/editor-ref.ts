import type * as Monaco from "monaco-editor";

// Module-level reference to the active Monaco editor instance.
// Set on editor mount, cleared on unmount. Allows toolbar/menu actions
// to target the active editor without prop-drilling.
let activeEditor: Monaco.editor.IStandaloneCodeEditor | null = null;

export function setActiveEditor(ed: Monaco.editor.IStandaloneCodeEditor | null) {
  activeEditor = ed;
}

export function getActiveEditor() {
  return activeEditor;
}
