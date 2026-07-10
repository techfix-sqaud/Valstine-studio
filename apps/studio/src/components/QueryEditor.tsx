import { useRef, useCallback } from "react";
import Editor, { OnMount, BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useAppStore } from "@valstine/core/store/app-store";
import { registerSQLCompletion } from "@/lib/sql-completion";
import { useSchemaCache } from "@/hooks/use-schema-cache";
import { formatSQL } from "@/lib/sql-formatter";
import { setActiveEditor } from "@/lib/editor-ref";
import { registerDbStudioThemes, dbStudioThemeName } from "@/lib/monaco-themes";

export function QueryEditor() {
  const { tabs, activeTabId, updateTabContent, theme } = useAppStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const { cacheRef, fetchColumnsForTable } = useSchemaCache();
  const completionDisposable = useRef<Monaco.IDisposable | null>(null);
  const formatterDisposable = useRef<Monaco.IDisposable | null>(null);

  // Stable refs so the completion provider closure never goes stale
  const getCacheFn = useCallback(() => cacheRef.current, [cacheRef]);
  const fetchColumnsFn = useCallback(fetchColumnsForTable, [fetchColumnsForTable]);

  const beforeMount: BeforeMount = (monaco) => {
    registerDbStudioThemes(monaco);
  };

  const handleMount: OnMount = (editor, monaco) => {
    // Register this as the active editor for toolbar actions
    setActiveEditor(editor);

    // Clean up previous providers
    completionDisposable.current?.dispose();
    formatterDisposable.current?.dispose();

    completionDisposable.current = registerSQLCompletion(
      monaco,
      getCacheFn,
      fetchColumnsFn,
    );

    // Register SQL document formatter (Ctrl+Shift+F / Shift+Alt+F)
    formatterDisposable.current = monaco.languages.registerDocumentFormattingEditProvider("sql", {
      provideDocumentFormattingEdits(model) {
        const formatted = formatSQL(model.getValue());
        return [
          {
            range: model.getFullModelRange(),
            text: formatted,
          },
        ];
      },
    });

    // Ctrl+Enter: run selected text if a selection exists, otherwise run full content
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        const selection = editor.getSelection();
        const model = editor.getModel();
        if (selection && model && !selection.isEmpty()) {
          const selectedText = model.getValueInRange(selection).trim();
          if (selectedText) {
            useAppStore.getState().runQuery(selectedText);
            return;
          }
        }
        useAppStore.getState().executeQuery();
      },
    );
  };

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Open a query tab to start editing
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        key={activeTab.id + theme}
        defaultValue={activeTab.content}
        language="sql"
        theme={dbStudioThemeName(theme)}
        onChange={(v) => updateTabContent(activeTab.id, v ?? "")}
        beforeMount={beforeMount}
        onMount={handleMount}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          renderLineHighlight: "line",
          scrollBeyondLastLine: false,
          padding: { top: 12 },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          bracketPairColorization: { enabled: true },
          autoIndent: "full",
          formatOnPaste: true,
          suggest: {
            showKeywords: true,
            showSnippets: true,
            filterGraceful: true,
          },
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          quickSuggestionsDelay: 400,
          wordWrap: "off",
          tabSize: 2,
        }}
      />
    </div>
  );
}
