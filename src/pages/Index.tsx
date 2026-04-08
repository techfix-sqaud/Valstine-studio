import { Panel, Group, Separator } from 'react-resizable-panels';
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
import { useIsMobile } from '@/hooks/use-mobile';

const Index = () => {
  const { executeQuery, bottomPanelVisible, theme } = useAppStore();
  const isMobile = useIsMobile();

  // Apply theme class on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

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
        {isMobile ? (
          <div className="flex-1 flex flex-col min-h-0">
            <AppSidebar />
            <TabBar />
            <EditorToolbar />
            <QueryEditor />
            {bottomPanelVisible && <ResultsPanel />}
          </div>
        ) : (
          <Group direction="horizontal" className="flex-1">
            <Panel defaultSize={20} minSize={12} maxSize={35}>
              <AppSidebar />
            </Panel>
            <Separator />
            <Panel defaultSize={80}>
              <Group direction="vertical">
                <Panel defaultSize={bottomPanelVisible ? 60 : 100} minSize={30}>
                  <div className="flex flex-col h-full">
                    <TabBar />
                    <EditorToolbar />
                    <QueryEditor />
                  </div>
                </Panel>
                {bottomPanelVisible && (
                  <>
                    <Separator />
                    <Panel defaultSize={40} minSize={15}>
                      <ResultsPanel />
                    </Panel>
                  </>
                )}
              </Group>
            </Panel>
          </Group>
        )}
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  );
};

export default Index;
