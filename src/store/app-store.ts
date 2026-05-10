import { create } from 'zustand';
import { DBConnection, QueryTab, QueryResult, defaultTabs } from '@/lib/mock-data';
import * as api from '@/lib/api';
import { DEFAULT_PRESET_ID, DEFAULT_TERMINAL_FONT, DEFAULT_TERMINAL_FONT_SIZE, getPresetById } from '@/lib/terminal-themes';

export interface TerminalSettings {
  presetId: string;
  fontFamily: string;
  fontSize: number;
  // custom color overrides (only used when presetId === 'custom')
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
}

export interface AppSettings {
  terminal: TerminalSettings;
  savePasswords: boolean;
}

function defaultTerminalSettings(): TerminalSettings {
  const preset = getPresetById(DEFAULT_PRESET_ID);
  return {
    presetId: DEFAULT_PRESET_ID,
    fontFamily: DEFAULT_TERMINAL_FONT,
    fontSize: DEFAULT_TERMINAL_FONT_SIZE,
    background: preset.colors.background,
    foreground: preset.colors.foreground,
    cursor: preset.colors.cursor,
    selectionBackground: preset.colors.selectionBackground,
  };
}

function defaultSettings(): AppSettings {
  return { terminal: defaultTerminalSettings(), savePasswords: false };
}

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

interface AppState {
  // Theme
  theme: 'light' | 'dark';

  // GitHub
  githubToken: string;
  setGithubToken: (token: string) => Promise<void>;

  // DigitalOcean AI agent token
  doAiToken: string;
  setDoAiToken: (token: string) => void;

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

  // Settings panel
  settingsPanelOpen: boolean;
  settings: AppSettings;

  // Provision dialog (create DB from scratch)
  provisionDialogOpen: boolean;

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
  openDashboardTab: () => void;
  openSchemaTab: () => void;
  openApiGeneratorTab: () => void;
  openApiTesterTab: () => void;
  openAiSidebar: () => void;
  sendAiMessage: (prompt: string) => void;
  clearAiMessages: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Connection management
  addConnection: (conn: DBConnection) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  updateConnection: (conn: DBConnection) => Promise<void>;
  connectConnection: (id: string) => Promise<{ ok: boolean; error?: string }>;
  disconnectConnection: (id: string) => Promise<void>;
  switchDatabase: (dbName: string) => Promise<void>;
  openConnectionDialog: (conn?: DBConnection) => void;
  closeConnectionDialog: () => void;

  openSettingsPanel: () => void;
  closeSettingsPanel: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateTerminalSettings: (patch: Partial<TerminalSettings>) => void;

  openProvisionDialog: () => void;
  closeProvisionDialog: () => void;

  // Loads connections, settings, and history from server SQLite on app start
  initApp: () => Promise<void>;
}


// ── Secure token helpers (no localStorage) ──────────────────────────────
// Electron: delegate to OS keychain via the preload bridge.
// Web: use sessionStorage (cleared on tab/window close, never persisted to disk).
const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;

async function storeToken(key: string, value: string): Promise<void> {
  if (electronAPI?.keychainSet) {
    await electronAPI.keychainSet(key, value).catch(() => {});
  } else if (typeof sessionStorage !== 'undefined') {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  }
}

async function loadToken(key: string): Promise<string> {
  if (electronAPI?.keychainGet) {
    return (await electronAPI.keychainGet(key).catch(() => null)) ?? '';
  }
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(key) ?? '';
  }
  return '';
}

async function removeToken(key: string): Promise<void> {
  if (electronAPI?.keychainDelete) {
    await electronAPI.keychainDelete(key).catch(() => {});
  } else if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(key);
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  // Theme starts dark; initApp() will overwrite it from SQLite app_settings
  theme: 'dark',
  githubToken: '',
  setGithubToken: async (token: string) => {
    if (token) await storeToken('valstine-github-token', token);
    else await removeToken('valstine-github-token');
    set({ githubToken: token });
  },
  doAiToken: '',
  setDoAiToken: (token: string) => { set({ doAiToken: token }); },
  // isFirstTime / hasCompletedTour are loaded from SQLite by initApp()
  isFirstTime: true,
  hasCompletedTour: false,
  sidebarWidth: 260,
  sidebarOpen: true,
  activeSidebarTab: 'explorer',
  connections: [],
  activeConnectionId: '',
  tabs: defaultTabs,
  activeTabId: 'tab-1',
  bottomPanelVisible: true,
  activeBottomTab: 'results',
  queryResult: null,
  isExecuting: false,
  commandPaletteOpen: false,
  queryHistory: [],
  connectionDialogOpen: false,
  editingConnection: null,
  settingsPanelOpen: false,
  settings: defaultSettings(),
  provisionDialogOpen: false,
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
    api.appUpdateSettings({ theme: next }).catch(() => {});
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
      api.appAddHistoryEntry(entry).catch(() => {});
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
      api.appAddHistoryEntry(entry).catch(() => {});
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
  openApiGeneratorTab: () => set((s) => {
    const existing = s.tabs.find((t) => t.type === 'api-generator');
    if (existing) return { activeTabId: existing.id };
    const tab: QueryTab = {
      id: `api-generator-${Date.now()}`,
      title: '.NET Generator',
      content: '',
      connectionId: s.activeConnectionId,
      isDirty: false,
      type: 'api-generator',
    };
    return { tabs: [...s.tabs, tab], activeTabId: tab.id };
  }),
  openApiTesterTab: () => set((s) => {
    const existing = s.tabs.find((t) => t.type === 'api-tester');
    if (existing) return { activeTabId: existing.id };
    const tab: QueryTab = {
      id: `api-tester-${Date.now()}`,
      title: 'API Tester',
      content: '',
      connectionId: s.activeConnectionId,
      isDirty: false,
      type: 'api-tester',
    };
    return { tabs: [...s.tabs, tab], activeTabId: tab.id };
  }),
  openAiSidebar: () => set({ activeSidebarTab: 'ai', sidebarOpen: true }),
  sendAiMessage: async (prompt) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    const state = get();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const activeConn = state.connections.find((c) => c.id === state.activeConnectionId);

    const userMsg: AIChatMessage = {
      id: `ai-user-${Date.now()}`,
      role: 'user',
      content: trimmedPrompt,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...state.aiMessages, userMsg];
    set({ activeSidebarTab: 'ai', sidebarOpen: true, aiThinking: true, aiMessages: updatedMessages });

    // Build context prefix to inject into the user message (DO agent disallows system role)
    const contextParts: string[] = [];
    if (activeConn) {
      contextParts.push(`[Context: ${activeConn.name} (${activeConn.type.toUpperCase()}, db: ${activeConn.database}${activeConn.host ? `, host: ${activeConn.host}` : ''})]`);
    }
    if (activeTab?.content?.trim()) {
      contextParts.push(`[Active SQL:\n\`\`\`sql\n${activeTab.content.trim().slice(0, 600)}\n\`\`\`]`);
    }

    // Inject context as a prefix on the first user message of this turn
    const historyMessages = updatedMessages
      .filter((m) => !m.id.startsWith('ai-welcome'))
      .map((m) => ({ role: m.role, content: m.content }));

    if (contextParts.length > 0 && historyMessages.length > 0) {
      const last = historyMessages[historyMessages.length - 1];
      if (last.role === 'user') {
        historyMessages[historyMessages.length - 1] = {
          ...last,
          content: `${contextParts.join('\n')}\n\n${last.content}`,
        };
      }
    }

    const apiMessages = historyMessages;

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = (await res.json()) as { ok: boolean; content?: string; error?: string };
      set((s) => ({
        aiThinking: false,
        aiMessages: [
          ...s.aiMessages,
          {
            id: `ai-assistant-${Date.now()}`,
            role: 'assistant' as const,
            content: data.ok ? (data.content ?? '') : `Error: ${data.error}`,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    } catch (err: any) {
      set((s) => ({
        aiThinking: false,
        aiMessages: [
          ...s.aiMessages,
          {
            id: `ai-assistant-${Date.now()}`,
            role: 'assistant' as const,
            content: `Failed to reach AI agent: ${err.message ?? 'Network error'}`,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    }
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
    api.appUpdateSettings({ onboarded: true }).catch(() => {});
    set({ isFirstTime: false });
  },
  completeTour: () => {
    api.appUpdateSettings({ onboarded: true, tourDone: true }).catch(() => {});
    set({ hasCompletedTour: true, isFirstTime: false });
  },
  clearHistory: () => {
    api.appClearHistory().catch(() => {});
    set({ queryHistory: [] });
  },
  deleteHistoryEntry: (id) => {
    api.appDeleteHistoryEntry(id).catch(() => {});
    set((s) => ({ queryHistory: s.queryHistory.filter((h) => h.id !== id) }));
  },
  loadHistoryQuery: (query) => {
    const state = get();
    const id = `tab-${Date.now()}`;
    set({
      tabs: [...state.tabs, { id, title: `history_${state.tabs.length + 1}.sql`, content: query, connectionId: state.activeConnectionId, isDirty: false }],
      activeTabId: id,
    });
  },
  openDashboardTab: () => set((s) => {
    const existing = s.tabs.find((t) => t.type === 'dashboard');
    if (existing) return { activeTabId: existing.id };
    const tab: QueryTab = {
      id: `dashboard-${Date.now()}`,
      title: 'fleet_usage.vdash',
      content: '',
      connectionId: s.activeConnectionId || s.connections[0]?.id || '',
      isDirty: false,
      type: 'dashboard',
    };
    return { tabs: [...s.tabs, tab], activeTabId: tab.id };
  }),

  // ── Connection management ──
  addConnection: async (conn) => {
    await api.appSaveConnection(conn).catch(() => {});
    // Refresh from server so we never hold passwords in state
    const connections = await api.appGetConnections().catch(() => [...get().connections, { ...conn, password: '' }]);
    set({ connections, activeConnectionId: conn.id, connectionDialogOpen: false, editingConnection: null });
  },
  removeConnection: async (id) => {
    await api.appDeleteConnection(id).catch(() => {});
    const newConns = get().connections.filter((c) => c.id !== id);
    const newActive = get().activeConnectionId === id ? (newConns[0]?.id ?? '') : get().activeConnectionId;
    set({ connections: newConns, activeConnectionId: newActive });
  },
  updateConnection: async (conn) => {
    await api.appUpdateConnection(conn).catch(() => {});
    const connections = await api.appGetConnections().catch(() =>
      get().connections.map((c) => c.id === conn.id ? { ...conn, password: '' } : c)
    );
    set({ connections, connectionDialogOpen: false, editingConnection: null });
  },
  connectConnection: async (id) => {
    const conn = get().connections.find((c) => c.id === id);
    if (!conn) return { ok: false, error: 'Connection not found' };
    const result = await api.testConnection(conn);
    if (result.ok) {
      set((s) => ({ connections: s.connections.map((c) => c.id === id ? { ...c, status: 'connected' as const } : c), activeConnectionId: id }));
    }
    return result;
  },
  disconnectConnection: async (id) => {
    const conn = get().connections.find((c) => c.id === id);
    if (conn) {
      await api.disconnectConnection(conn).catch(() => {});
      set((s) => ({ connections: s.connections.map((c) => c.id === id ? { ...c, status: 'disconnected' as const } : c) }));
    }
  },
  openConnectionDialog: (conn) => set({ connectionDialogOpen: true, editingConnection: conn ?? null }),
  closeConnectionDialog: () => set({ connectionDialogOpen: false, editingConnection: null }),

  openSettingsPanel: () => set({ settingsPanelOpen: true }),
  closeSettingsPanel: () => set({ settingsPanelOpen: false }),
  updateSettings: (patch) => set((s) => {
    const next = { ...s.settings, ...patch };
    api.appUpdateSettings(next).catch(() => {});
    return { settings: next };
  }),
  updateTerminalSettings: (patch) => set((s) => {
    const next = { ...s.settings, terminal: { ...s.settings.terminal, ...patch } };
    api.appUpdateSettings(next).catch(() => {});
    return { settings: next };
  }),

  openProvisionDialog: () => set({ provisionDialogOpen: true }),
  closeProvisionDialog: () => set({ provisionDialogOpen: false }),

  switchDatabase: async (dbName) => {
    const conn = get().connections.find((c) => c.id === get().activeConnectionId);
    if (!conn || conn.database === dbName) return;
    await api.disconnectConnection(conn).catch(() => {});
    const updated: DBConnection = { ...conn, database: dbName, status: 'connected' as const };
    // Persist the new database name to server
    await api.appUpdateConnection(updated).catch(() => {});
    set((s) => ({ connections: s.connections.map((c) => c.id === conn.id ? updated : c) }));
    const result = await api.testConnection(updated);
    if (!result.ok) {
      set((s) => ({ connections: s.connections.map((c) => c.id === conn.id ? { ...c, database: dbName, status: 'disconnected' as const } : c) }));
    }
  },

  initApp: async () => {
    try {
      const [connections, rawSettings, history, githubToken] = await Promise.all([
        api.appGetConnections(),
        api.appGetSettings(),
        api.appGetHistory(),
        loadToken('valstine-github-token'),
      ]);
      const appSettings: AppSettings = {
        terminal: { ...defaultTerminalSettings(), ...(rawSettings.terminal ?? {}) },
        savePasswords: rawSettings.savePasswords ?? false,
      };
      const theme: 'light' | 'dark' = rawSettings.theme === 'light' ? 'light' : 'dark';
      const isFirstTime = !rawSettings.onboarded;
      const hasCompletedTour = !!rawSettings.tourDone;
      document.documentElement.classList.toggle('dark', theme === 'dark');

      // Determine the first previously-connected connection to make active
      const prevActive = connections.find((c) => c.status === 'connected');
      set({
        connections,
        settings: appSettings,
        queryHistory: history,
        theme,
        isFirstTime,
        hasCompletedTour,
        githubToken,
        activeConnectionId: prevActive?.id ?? connections[0]?.id ?? '',
      });

      // Silently verify each previously-connected connection. The server pool
      // is re-created lazily on the first query anyway, so this is just a UI
      // health check — if the remote DB is unreachable we flip it to disconnected.
      const toVerify = connections.filter((c) => c.status === 'connected');
      for (const conn of toVerify) {
        api.testConnection(conn).then((result) => {
          if (!result.ok) {
            set((s) => ({
              connections: s.connections.map((c) =>
                c.id === conn.id ? { ...c, status: 'disconnected' as const } : c
              ),
            }));
          }
        }).catch(() => {
          set((s) => ({
            connections: s.connections.map((c) =>
              c.id === conn.id ? { ...c, status: 'disconnected' as const } : c
            ),
          }));
        });
      }
    } catch {
      // Server not available — start with defaults (web dev without backend)
    }
  },
}));
