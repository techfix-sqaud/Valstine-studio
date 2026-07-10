import { Panel, Group, Separator, usePanelRef } from "react-resizable-panels";
import { TitleBar } from "@/components/TitleBar";
import { ActivityBar } from "@/components/ActivityBar";
import { AppSidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { EditorToolbar } from "@/components/EditorToolbar";
import { QueryEditor } from "@/components/QueryEditor";
import { ResultsPanel } from "@/components/ResultsPanel";
import { SchemaVisualization } from "@/components/SchemaVisualization";
import SchemaDiffView from "@/components/SchemaDiffView";
import { ApiGenerator } from "@/components/ApiGenerator";
import { ApiTester } from "@/components/ApiTester";
import { UsageDashboard } from "@/components/UsageDashboard";
import { StatusBar } from "@/components/StatusBar";
import { CommandPalette } from "@/components/CommandPalette";
import { ConnectionDialog } from "@valstine/core/components/ConnectionDialog";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ProvisionDialog } from "@/components/ProvisionDialog";
import { ContextMenuProvider } from "@/components/ContextMenu";
import { VariablesModal } from "@/components/VariablesModal";
import { DestructiveQueryGuard } from "@/components/DestructiveQueryGuard";
import { ImpactAnalysisModal } from "@/components/ImpactAnalysisModal";
import { SqlOptimizerModal } from "@/components/SqlOptimizerModal";
import { SqlRecycleBinPanel } from "@/components/SqlRecycleBinPanel";
import { useAppStore } from "@valstine/core/store/app-store";
import { applyThemeClass } from "@valstine/core/lib/themes";
import { useEffect } from "react";
import { useIsMobile } from "@valstine/ui/hooks/use-mobile";
import { useSessionPersistence } from "@/hooks/use-session-persistence";
import { useSchemaCache } from "@/hooks/use-schema-cache";
import { buildSchemaContextBlock } from "@/lib/ai-context";

const isElectronApp =
  typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

const Index = () => {
  const {
    executeQuery,
    bottomPanelVisible,
    sidebarOpen,
    setSidebarOpen,
    tabs,
    activeTabId,
    theme,
    initApp,
    variablesModalOpen,
    pendingVariables,
    closeVariablesModal,
    runQueryWithVariables,
    impactAnalysisOpen,
    impactReport,
    closeImpactAnalysis,
    proceedAfterImpact,
    sqlOptimizerOpen,
    sqlOptimizerResult,
    closeSqlOptimizer,
    proceedAfterOptimizer,
    connections,
    activeConnectionId,
    setSchemaContextCache,
  } = useAppStore();

  const { cache } = useSchemaCache();
  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const isMobile = useIsMobile();
  const sidebarPanelRef = usePanelRef();

  // Syncs tab content + workspace state to IndexedDB per-keystroke (debounced)
  useSessionPersistence();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isDashboardTab = activeTab?.type === "dashboard";
  const isSchemaTab = activeTab?.type === "schema";
  const isDiffTab = activeTab?.type === "schema-diff";
  const isApiGeneratorTab = activeTab?.type === "api-generator";
  const isApiTesterTab = activeTab?.type === "api-tester";

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Keep the schema context string in the store so executeQuery can pass it to the SQL Optimizer.
  useEffect(() => {
    setSchemaContextCache(buildSchemaContextBlock(cache, activeConn));
  }, [cache, activeConn]);

  // Cmd+Enter is handled inside the Monaco editor via addCommand (see QueryEditor.tsx),
  // so it correctly runs only the selected text when a selection exists.
  // The toolbar Run button covers the case when the editor is not focused.

  // Listen for native Electron menu events
  useEffect(() => {
    if (!isElectronApp) return;
    const api = (window as any).electronAPI;
    const cleanups: (() => void)[] = [];
    const store = useAppStore.getState;

    cleanups.push(
      api.onMenuEvent("menu:new-tab", () => {
        const tabs = store().tabs;
        store().addTab({
          id: `tab-${Date.now()}`,
          title: `query_${tabs.length + 1}.sql`,
          content: "-- New query\nSELECT 1;",
          connectionId: store().activeConnectionId || "conn-1",
          isDirty: false,
        });
      }),
    );
    cleanups.push(
      api.onMenuEvent("menu:open-schema", () => store().openSchemaTab()),
    );
    cleanups.push(
      api.onMenuEvent("menu:command-palette", () =>
        store().toggleCommandPalette(),
      ),
    );
    cleanups.push(
      api.onMenuEvent("menu:view-dashboard", () => store().openDashboardTab()),
    );
    cleanups.push(
      api.onMenuEvent("menu:toggle-sidebar", () => store().toggleSidebar()),
    );
    cleanups.push(
      api.onMenuEvent("menu:toggle-panel", () =>
        store().setBottomPanelVisible(!store().bottomPanelVisible),
      ),
    );
    cleanups.push(
      api.onMenuEvent("menu:toggle-theme", () => store().toggleTheme()),
    );
    cleanups.push(
      api.onMenuEvent("menu:execute-query", () => store().executeQuery()),
    );
    cleanups.push(
      api.onMenuEvent("menu:sidebar-tab", (tab: string) =>
        store().setActiveSidebarTab(tab as any),
      ),
    );
    cleanups.push(
      api.onMenuEvent("menu:bottom-tab", (tab: string) => {
        store().setActiveBottomTab(tab as any);
        store().setBottomPanelVisible(true);
      }),
    );
    cleanups.push(
      api.onMenuEvent("menu:about", () => store().openSettingsPanel("about")),
    );

    return () => cleanups.forEach((fn) => fn());
  }, []);

  // Sync store → panel
  useEffect(() => {
    if (!isMobile) {
      if (sidebarOpen) {
        sidebarPanelRef.current?.expand();
      } else {
        sidebarPanelRef.current?.collapse();
      }
    }
  }, [sidebarOpen, isMobile, sidebarPanelRef]);

  // Active tab content area
  const editorContent = isDashboardTab ? (
    <div className="h-full w-full">
      <UsageDashboard />
    </div>
  ) : isDiffTab && activeTab?.diffData ? (
    <div className="h-full w-full">
      <SchemaDiffView data={activeTab.diffData} />
    </div>
  ) : isSchemaTab ? (
    <div className="h-full w-full">
      <SchemaVisualization />
    </div>
  ) : isApiGeneratorTab ? (
    <div className="h-full w-full">
      <ApiGenerator />
    </div>
  ) : isApiTesterTab ? (
    <div className="h-full w-full">
      <ApiTester />
    </div>
  ) : (
    <>
      <EditorToolbar />
      <div className="flex-1 min-h-0 min-w-0">
        {bottomPanelVisible ? (
          <Group orientation="vertical" id="editor-results" className="h-full">
            <Panel id="editor-top" defaultSize={60} minSize={20}>
              <QueryEditor />
            </Panel>
            <Separator />
            <Panel id="results-bottom" defaultSize={40} minSize={10}>
              <ResultsPanel />
            </Panel>
          </Group>
        ) : (
          <QueryEditor />
        )}
      </div>
    </>
  );

  const editorArea = (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      <TabBar />
      {editorContent}
    </div>
  );

  return (
    <ContextMenuProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <TitleBar />
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          <ActivityBar />

          {isMobile ? (
            <>
              <AppSidebar />
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {editorArea}
              </div>
            </>
          ) : (
            <Group
              orientation="horizontal"
              id="main-layout"
              className="flex-1 min-w-0"
            >
              <Panel
                id="sidebar-panel"
                panelRef={sidebarPanelRef}
                defaultSize="15%"
                minSize="12%"
                maxSize="40%"
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  const collapsed = size.asPercentage === 0;
                  if (collapsed && sidebarOpen) {
                    setSidebarOpen(false);
                  } else if (!collapsed && !sidebarOpen) {
                    setSidebarOpen(true);
                  }
                }}
              >
                <AppSidebar />
              </Panel>
              <Separator />
              <Panel id="editor-panel" defaultSize="75%" minSize="30%">
                {editorArea}
              </Panel>
            </Group>
          )}
        </div>
        <StatusBar />
        <CommandPalette />
        <ConnectionDialog />
        <SettingsPanel />
        <ProvisionDialog />
        <VariablesModal
          open={variablesModalOpen}
          variables={pendingVariables}
          onRun={runQueryWithVariables}
          onClose={closeVariablesModal}
        />
        <DestructiveQueryGuard />
        {impactAnalysisOpen && impactReport && (
          <ImpactAnalysisModal
            report={impactReport}
            onProceed={proceedAfterImpact}
            onCancel={closeImpactAnalysis}
          />
        )}
        {sqlOptimizerOpen && sqlOptimizerResult && (
          <SqlOptimizerModal
            result={sqlOptimizerResult}
            onProceed={proceedAfterOptimizer}
            onCancel={closeSqlOptimizer}
          />
        )}
        <SqlRecycleBinPanel />
      </div>
    </ContextMenuProvider>
  );
};

export default Index;
