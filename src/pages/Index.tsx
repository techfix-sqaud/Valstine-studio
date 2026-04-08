import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { TitleBar } from '@/components/TitleBar';
import { ActivityBar } from '@/components/ActivityBar';
import { AppSidebar } from '@/components/Sidebar';
import { TabBar } from '@/components/TabBar';
import { EditorToolbar } from '@/components/EditorToolbar';
import { QueryEditor } from '@/components/QueryEditor';
import { ResultsPanel } from '@/components/ResultsPanel';
import { StatusBar } from '@/components/StatusBar';
import { CommandPalette } from '@/components/CommandPalette';
import { useAppStore } from '@/store/app-store';
import { useEffect } from 'react';

const Index = () => {
  const { executeQuery, bottomPanelVisible } = useAppStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [executeQuery]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <ActivityBar />
        <PanelGroup direction="horizontal" className="flex-1">
          <Panel defaultSize={20} minSize={12} maxSize={35}>
            <AppSidebar />
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={80}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={bottomPanelVisible ? 60 : 100} minSize={30}>
                <div className="flex flex-col h-full">
                  <TabBar />
                  <EditorToolbar />
                  <QueryEditor />
                </div>
              </Panel>
              {bottomPanelVisible && (
                <>
                  <PanelResizeHandle />
                  <Panel defaultSize={40} minSize={15}>
                    <ResultsPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  );
};

export default Index;
