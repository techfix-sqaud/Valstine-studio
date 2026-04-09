import { create } from 'zustand';
import { DBConnection, QueryTab, QueryResult, defaultTabs, mockQueryResult, mockConnections } from '@/lib/mock-data';

export interface QueryHistoryEntry {
  id: string;
  query: string;
  connectionId: string;
  connectionName: string;
  executedAt: string;
  executionTime: number;
  rowCount: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

function buildAIResponse(prompt: string, state: Pick<AppState, 'tabs' | 'activeTabId' | 'activeConnectionId'>) {
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const activeQuery = activeTab?.content?.trim();
  const promptLower = prompt.toLowerCase();

  if ((promptLower.includes('explain') || promptLower.includes('what does')) && activeQuery) {
    return `This query is working against ${state.activeConnectionId}. It currently looks focused on reading data rather than mutating it. I would review: selected columns, filtering predicates, sort order, and whether the result set needs a LIMIT.\n\nActive query snippet:\n${activeQuery.slice(0, 240)}`;
  }

  if ((promptLower.includes('optimize') || promptLower.includes('faster')) && activeQuery) {
    return `For this query, the first things I would check are: indexes on WHERE and JOIN columns, whether ORDER BY can use an index, and whether you can reduce the selected columns or row count with a LIMIT.\n\nIf you want, ask me to optimize the active query and I’ll suggest a tighter SQL shape.`;
  }

  if (promptLower.includes('generate') || promptLower.includes('write sql')) {
    return `Tell me the table names and the result you want, and I can draft SQL for you in this sidebar. Example: 'Generate SQL to show active users created in the last 30 days ordered by newest first.'`;
  }

  return `I can help with query explanation, SQL generation, optimization ideas, and schema navigation for ${state.activeConnectionId}. Ask about the active query or describe the result you want.`;
}

interface AppState {
  // Theme
  theme: 'light' | 'dark';

  // Onboarding
  isFirstTime: boolean;
  hasCompletedTour: boolean;

  // Sidebar
  sidebarWidth: number;
  sidebarOpen: boolean;
  activeSidebarTab: 'explorer' | 'connections' | 'search' | 'ai';

  // Tabs
  tabs: QueryTab[];
  activeTabId: string;

  // Results
  bottomPanelVisible: boolean;
  activeBottomTab: 'results' | 'terminal' | 'problems' | 'history';
  queryResult: QueryResult | null;
  isExecuting: boolean;

  // Command palette
  commandPaletteOpen: boolean;

  // Active connection
  activeConnectionId: string;

  // Query history
  queryHistory: QueryHistoryEntry[];

  // AI chat
  aiMessages: AIChatMessage[];
  aiThinking: boolean;

  // Actions
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setActiveSidebarTab: (tab: 'explorer' | 'connections' | 'search' | 'ai') => void;
  setActiveTab: (id: string) => void;
  addTab: (tab: QueryTab) => void;
  closeTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  setBottomPanelVisible: (v: boolean) => void;
  setActiveBottomTab: (tab: 'results' | 'terminal' | 'problems' | 'history') => void;
  executeQuery: () => void;
  toggleCommandPalette: () => void;
  setActiveConnection: (id: string) => void;
  completeOnboarding: () => void;
  completeTour: () => void;
  clearHistory: () => void;
  deleteHistoryEntry: (id: string) => void;
  loadHistoryQuery: (query: string) => void;
  openSchemaTab: () => void;
  openAiSidebar: () => void;
  sendAiMessage: (prompt: string) => void;
  clearAiMessages: () => void;
  setSidebarOpen: (open: boolean) => void;
}

function loadHistory(): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem('db-studio-history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: QueryHistoryEntry[]) {
  localStorage.setItem('db-studio-history', JSON.stringify(history.slice(0, 200)));
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (typeof window !== 'undefined' && localStorage.getItem('db-studio-theme') as 'light' | 'dark') || 'dark',
  isFirstTime: typeof window !== 'undefined' ? !localStorage.getItem('db-studio-onboarded') : true,
  hasCompletedTour: typeof window !== 'undefined' ? !!localStorage.getItem('db-studio-tour-done') : false,
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
  queryHistory: loadHistory(),
  aiMessages: [
    {
      id: 'ai-welcome',
      role: 'assistant',
      content: 'Ask me to explain the active query, generate SQL, or suggest optimizations. I open in the sidebar so you can work while you chat.',
      createdAt: new Date().toISOString(),
    },
  ],
  aiThinking: false,

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
    const state = get();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const queryText = activeTab?.content ?? '';
    const connId = state.activeConnectionId;
    const conn = mockConnections.find((c) => c.id === connId);

    set({ isExecuting: true, bottomPanelVisible: true, activeBottomTab: 'results' });

    setTimeout(() => {
      const entry: QueryHistoryEntry = {
        id: `hist-${Date.now()}`,
        query: queryText.trim(),
        connectionId: connId,
        connectionName: conn?.name ?? 'Unknown',
        executedAt: new Date().toISOString(),
        executionTime: mockQueryResult.executionTime,
        rowCount: mockQueryResult.rowCount,
        status: 'success',
      };
      const newHistory = [entry, ...get().queryHistory].slice(0, 200);
      saveHistory(newHistory);
      set({ queryResult: mockQueryResult, isExecuting: false, queryHistory: newHistory });
    }, 400 + Math.random() * 300);
  },
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  openSchemaTab: () => set((s) => {
    const existing = s.tabs.find((t) => t.type === 'schema' && t.connectionId === s.activeConnectionId);
    if (existing) {
      return { activeTabId: existing.id };
    }
    const conn = mockConnections.find((c) => c.id === s.activeConnectionId);
    const tab: QueryTab = {
      id: `schema-${s.activeConnectionId}-${Date.now()}`,
      title: `Schema: ${conn?.name ?? 'Unknown'}`,
      content: '',
      connectionId: s.activeConnectionId,
      isDirty: false,
      type: 'schema',
    };
    return { tabs: [...s.tabs, tab], activeTabId: tab.id };
  }),
  openAiSidebar: () => set({ activeSidebarTab: 'ai', sidebarOpen: true }),
  sendAiMessage: (prompt) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    const userMessage: AIChatMessage = {
      id: `ai-user-${Date.now()}`,
      role: 'user',
      content: trimmedPrompt,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      activeSidebarTab: 'ai',
      sidebarOpen: true,
      aiThinking: true,
      aiMessages: [...s.aiMessages, userMessage],
    }));

    window.setTimeout(() => {
      const state = get();
      const assistantMessage: AIChatMessage = {
        id: `ai-assistant-${Date.now()}`,
        role: 'assistant',
        content: buildAIResponse(trimmedPrompt, state),
        createdAt: new Date().toISOString(),
      };

      set((s) => ({
        aiThinking: false,
        aiMessages: [...s.aiMessages, assistantMessage],
      }));
    }, 500);
  },
  clearAiMessages: () => set({
    aiThinking: false,
    aiMessages: [
      {
        id: `ai-welcome-${Date.now()}`,
        role: 'assistant',
        content: 'Chat cleared. Ask me about the active query, schema, or the SQL you want to write.',
        createdAt: new Date().toISOString(),
      },
    ],
  }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  completeOnboarding: () => {
    localStorage.setItem('db-studio-onboarded', 'true');
    set({ isFirstTime: false });
  },
  completeTour: () => {
    localStorage.setItem('db-studio-tour-done', 'true');
    localStorage.setItem('db-studio-onboarded', 'true');
    set({ hasCompletedTour: true, isFirstTime: false });
  },
  clearHistory: () => {
    localStorage.removeItem('db-studio-history');
    set({ queryHistory: [] });
  },
  deleteHistoryEntry: (id) => set((s) => {
    const newHistory = s.queryHistory.filter((h) => h.id !== id);
    saveHistory(newHistory);
    return { queryHistory: newHistory };
  }),
  loadHistoryQuery: (query) => {
    const state = get();
    const id = `tab-${Date.now()}`;
    set({
      tabs: [...state.tabs, { id, title: `history_${state.tabs.length + 1}.sql`, content: query, connectionId: state.activeConnectionId, isDirty: false }],
      activeTabId: id,
    });
  },
}));
