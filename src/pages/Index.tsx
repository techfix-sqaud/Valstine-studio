import { Panel, Group, Separator, usePanelRef } from "react-resizable-panels";
import { TitleBar } from "@/components/TitleBar";
import { ActivityBar } from "@/components/ActivityBar";
import { AppSidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { EditorToolbar } from "@/components/EditorToolbar";
import { QueryEditor } from "@/components/QueryEditor";
import { ResultsPanel } from "@/components/ResultsPanel";
import { SchemaVisualization } from "@/components/SchemaVisualization";
import { StatusBar } from "@/components/StatusBar";
import { CommandPalette } from "@/components/CommandPalette";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { ContextMenuProvider } from "@/components/ContextMenu";
import { useAppStore } from "@/store/app-store";
import { useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const {
    executeQuery,
    bottomPanelVisible,
    sidebarOpen,
    setSidebarOpen,
    tabs,
    activeTabId,
    theme,
  } = useAppStore();
  const isMobile = useIsMobile();
  const sidebarPanelRef = usePanelRef();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isSchemaTab = activeTab?.type === "schema";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        executeQuery();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [executeQuery]);

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
  const editorContent = isSchemaTab ? (
    <div className="h-full w-full">
      <SchemaVisualization />
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
      </div>
    </ContextMenuProvider>
  );
};

export default Index;
