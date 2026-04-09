import { create } from 'zustand';
import { DBConnection, QueryTab, QueryResult, defaultTabs } from '@/lib/mock-data';
import * as api from '@/lib/api';

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
  activeSidebarTab: 'explorer' | 'connections' | 'search' | 'ai' | 'schema-compare' | 'git';

  // Connections
  connections: DBConnection[];
  activeConnectionId: string;

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

  // Query history
  queryHistory: QueryHistoryEntry[];

  // AI chat
  aiMessages: AIChatMessage[];
  aiThinking: boolean;

  // Connection dialog
  connectionDialogOpen: boolean;
  editingConnection: DBConnection | null;

  // Actions
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setActiveSidebarTab: (tab: 'explorer' | 'connections' | 'search' | 'ai' | 'schema-compare' | 'git') => void;
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

  // Connection management
  addConnection: (conn: DBConnection) => void;
  removeConnection: (id: string) => void;
  updateConnection: (conn: DBConnection) => void;
  connectConnection: (id: string) => Promise<{ ok: boolean; error?: string }>;
  disconnectConnection: (id: string) => Promise<void>;
  switchDatabase: (dbName: string) => Promise<void>;
  openConnectionDialog: (conn?: DBConnection) => void;
  closeConnectionDialog: () => void;
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

function loadConnections(): DBConnection[] {
  try {
    const raw = localStorage.getItem('db-studio-connections');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConnections(conns: DBConnection[]) {
  // Strip passwords before saving in localStorage for basic safety – user re-enters on connect
  const safe = conns.map(c => ({ ...c, password: '' }));
  localStorage.setItem('db-studio-connections', JSON.stringify(safe));
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (typeof window !== 'undefined' && localStorage.getItem('db-studio-theme') as 'light' | 'dark') || 'dark',
  isFirstTime: typeof window !== 'undefined' ? !localStorage.getItem('db-studio-onboarded') : true,
  hasCompletedTour: typeof window !== 'undefined' ? !!localStorage.getItem('db-studio-tour-done') : false,
  sidebarWidth: 260,
  sidebarOpen: true,
  activeSidebarTab: 'explorer',
  connections: loadConnections(),
  activeConnectionId: '',
  tabs: defaultTabs,
  activeTabId: 'tab-1',
  bottomPanelVisible: true,
  activeBottomTab: 'results',
  queryResult: null,
  isExecuting: false,
  commandPaletteOpen: false,
  queryHistory: loadHistory(),
  connectionDialogOpen: false,
  editingConnection: null,
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
  executeQuery: async () => {
    const state = get();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const queryText = activeTab?.content ?? '';
    const connId = state.activeConnectionId;
    const conn = state.connections.find((c) => c.id === connId);

    if (!queryText.trim()) return;
    if (!conn) {
      set({
        queryResult: { columns: [], rows: [], rowCount: 0, executionTime: 0, status: 'error', message: 'No active connection. Please connect to a database first.' },
        bottomPanelVisible: true,
        activeBottomTab: 'results',
      });
      return;
    }

    set({ isExecuting: true, bottomPanelVisible: true, activeBottomTab: 'results', queryResult: null });

    const start = performance.now();
    try {
      const result: QueryResult = await api.executeQuery(conn, queryText);
      const elapsed = Math.round(performance.now() - start);
      if (!result.executionTime) result.executionTime = elapsed;

      const entry: QueryHistoryEntry = {
        id: `hist-${Date.now()}`,
        query: queryText.trim(),
        connectionId: connId,
        connectionName: conn.name,
        executedAt: new Date().toISOString(),
        executionTime: result.executionTime,
        rowCount: result.rowCount,
        status: result.status,
        errorMessage: result.message,
      };
      const newHistory = [entry, ...get().queryHistory].slice(0, 200);
      saveHistory(newHistory);
      set({ queryResult: result, isExecuting: false, queryHistory: newHistory });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      const errorResult: QueryResult = {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: elapsed,
        status: 'error',
        message: err.message ?? 'Failed to connect to query server. Is the server running?',
      };
      const entry: QueryHistoryEntry = {
        id: `hist-${Date.now()}`,
        query: queryText.trim(),
        connectionId: connId,
        connectionName: conn.name,
        executedAt: new Date().toISOString(),
        executionTime: elapsed,
        rowCount: 0,
        status: 'error',
        errorMessage: errorResult.message,
      };
      const newHistory = [entry, ...get().queryHistory].slice(0, 200);
      saveHistory(newHistory);
      set({ queryResult: errorResult, isExecuting: false, queryHistory: newHistory });
    }
  },
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  openSchemaTab: () => set((s) => {
    const existing = s.tabs.find((t) => t.type === 'schema' && t.connectionId === s.activeConnectionId);
    if (existing) {
      return { activeTabId: existing.id };
    }
    const conn = s.connections.find((c) => c.id === s.activeConnectionId);
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

  // ── Connection management ──
  addConnection: (conn) => {
    const newConns = [...get().connections, conn];
    saveConnections(newConns);
    set({ connections: newConns, activeConnectionId: conn.id, connectionDialogOpen: false, editingConnection: null });
  },
  removeConnection: (id) => {
    const newConns = get().connections.filter((c) => c.id !== id);
    saveConnections(newConns);
    const newActive = get().activeConnectionId === id ? (newConns[0]?.id ?? '') : get().activeConnectionId;
    set({ connections: newConns, activeConnectionId: newActive });
  },
  updateConnection: (conn) => {
    const newConns = get().connections.map((c) => c.id === conn.id ? conn : c);
    saveConnections(newConns);
    set({ connections: newConns, connectionDialogOpen: false, editingConnection: null });
  },
  connectConnection: async (id) => {
    const conn = get().connections.find((c) => c.id === id);
    if (!conn) return { ok: false, error: 'Connection not found' };
    const result = await api.testConnection(conn);
    if (result.ok) {
      const newConns = get().connections.map((c) => c.id === id ? { ...c, status: 'connected' as const } : c);
      saveConnections(newConns);
      set({ connections: newConns, activeConnectionId: id });
    }
    return result;
  },
  disconnectConnection: async (id) => {
    const conn = get().connections.find((c) => c.id === id);
    if (conn) {
      await api.disconnectConnection(conn).catch(() => {});
      const newConns = get().connections.map((c) => c.id === id ? { ...c, status: 'disconnected' as const } : c);
      saveConnections(newConns);
      set({ connections: newConns });
    }
  },
  openConnectionDialog: (conn) => set({ connectionDialogOpen: true, editingConnection: conn ?? null }),
  closeConnectionDialog: () => set({ connectionDialogOpen: false, editingConnection: null }),

  switchDatabase: async (dbName) => {
    const conn = get().connections.find((c) => c.id === get().activeConnectionId);
    if (!conn || conn.database === dbName) return;
    // Disconnect old knex pool so a new one is created with the new DB
    await api.disconnectConnection(conn).catch(() => {});
    const updated: DBConnection = { ...conn, database: dbName, status: 'connected' as const };
    const newConns = get().connections.map((c) => c.id === conn.id ? updated : c);
    saveConnections(newConns);
    set({ connections: newConns });
    // Verify the new connection works
    const result = await api.testConnection(updated);
    if (!result.ok) {
      // Mark as disconnected if it failed
      const conns2 = get().connections.map((c) => c.id === conn.id ? { ...c, database: dbName, status: 'disconnected' as const } : c);
      saveConnections(conns2);
      set({ connections: conns2 });
    }
  },
}));
