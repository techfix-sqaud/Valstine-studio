import { create } from 'zustand';
import { DBConnection, QueryTab, QueryResult, defaultTabs, mockQueryResult } from '@/lib/mock-data';

interface AppState {
  // Theme
  theme: 'light' | 'dark';

  // Sidebar
  sidebarWidth: number;
  sidebarOpen: boolean;
  activeSidebarTab: 'explorer' | 'connections' | 'search' | 'schema';

  // Tabs
  tabs: QueryTab[];
  activeTabId: string;

  // Results
  bottomPanelVisible: boolean;
  activeBottomTab: 'results' | 'terminal' | 'problems';
  queryResult: QueryResult | null;
  isExecuting: boolean;

  // Command palette
  commandPaletteOpen: boolean;

  // Active connection
  activeConnectionId: string;

  // Actions
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setActiveSidebarTab: (tab: 'explorer' | 'connections' | 'search' | 'schema') => void;
  setActiveTab: (id: string) => void;
  addTab: (tab: QueryTab) => void;
  closeTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  setBottomPanelVisible: (v: boolean) => void;
  setActiveBottomTab: (tab: 'results' | 'terminal' | 'problems') => void;
  executeQuery: () => void;
  toggleCommandPalette: () => void;
  setActiveConnection: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (typeof window !== 'undefined' && localStorage.getItem('db-studio-theme') as 'light' | 'dark') || 'dark',
  sidebarWidth: 260,
  sidebarOpen: true,
  activeSidebarTab: 'explorer',
  tabs: defaultTabs,
  activeTabId: 'tab-1',
  bottomPanelVisible: true,
  activeBottomTab: 'results',
  queryResult: null,
  isExecuting: false,
  commandPaletteOpen: false,
  activeConnectionId: 'conn-1',

  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('db-studio-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    return { theme: next };
  }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab, sidebarOpen: true }),
  setActiveTab: (id) => set({ activeTabId: id }),
  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),
  closeTab: (id) => set((s) => {
    const filtered = s.tabs.filter((t) => t.id !== id);
    const newActive = s.activeTabId === id
      ? (filtered[filtered.length - 1]?.id ?? '')
      : s.activeTabId;
    return { tabs: filtered, activeTabId: newActive };
  }),
  updateTabContent: (id, content) => set((s) => ({
    tabs: s.tabs.map((t) => t.id === id ? { ...t, content, isDirty: true } : t),
  })),
  setBottomPanelVisible: (v) => set({ bottomPanelVisible: v }),
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab, bottomPanelVisible: true }),
  executeQuery: () => {
    set({ isExecuting: true, bottomPanelVisible: true, activeBottomTab: 'results' });
    setTimeout(() => {
      set({ queryResult: mockQueryResult, isExecuting: false });
    }, 400 + Math.random() * 300);
  },
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setActiveConnection: (id) => set({ activeConnectionId: id }),
}));
