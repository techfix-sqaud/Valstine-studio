import Editor from '@monaco-editor/react';
import { useAppStore } from '@/store/app-store';

export function QueryEditor() {
  const { tabs, activeTabId, updateTabContent, theme } = useAppStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Open a query tab to start editing
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        key={activeTab.id + theme}
        defaultValue={activeTab.content}
        language="sql"
        theme={theme === 'dark' ? 'dbstudio-dark' : 'dbstudio-light'}
        onChange={(v) => updateTabContent(activeTab.id, v ?? '')}
        beforeMount={(monaco) => {
          monaco.editor.defineTheme('dbstudio-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
              { token: 'string', foreground: 'ce9178' },
              { token: 'number', foreground: 'b5cea8' },
              { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
              { token: 'operator', foreground: 'd4d4d4' },
              { token: 'type', foreground: '4ec9b0' },
            ],
            colors: {
              'editor.background': '#1e2228',
              'editor.foreground': '#d4d4d4',
              'editorLineNumber.foreground': '#4a5568',
              'editorLineNumber.activeForeground': '#a0aec0',
              'editor.selectionBackground': '#264f78',
              'editor.lineHighlightBackground': '#252a33',
              'editorCursor.foreground': '#528bff',
              'editorWhitespace.foreground': '#3b4048',
              'editorIndentGuide.background': '#3b4048',
              'editor.selectionHighlightBackground': '#264f7844',
            },
          });
          monaco.editor.defineTheme('dbstudio-light', {
            base: 'vs',
            inherit: true,
            rules: [
              { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
              { token: 'string', foreground: 'a31515' },
              { token: 'number', foreground: '098658' },
              { token: 'comment', foreground: '008000', fontStyle: 'italic' },
              { token: 'operator', foreground: '333333' },
              { token: 'type', foreground: '267f99' },
            ],
            colors: {
              'editor.background': '#f8f8f8',
              'editor.foreground': '#333333',
              'editorLineNumber.foreground': '#999999',
              'editorLineNumber.activeForeground': '#333333',
              'editor.selectionBackground': '#add6ff',
              'editor.lineHighlightBackground': '#f0f0f0',
              'editorCursor.foreground': '#0066cc',
              'editorWhitespace.foreground': '#cccccc',
              'editorIndentGuide.background': '#dddddd',
              'editor.selectionHighlightBackground': '#add6ff44',
            },
          });
        }}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          scrollBeyondLastLine: false,
          padding: { top: 12 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          autoIndent: 'full',
          formatOnPaste: true,
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
          wordWrap: 'off',
          tabSize: 2,
        }}
      />
    </div>
  );
}
