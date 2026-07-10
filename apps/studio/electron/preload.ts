import { contextBridge, ipcRenderer } from 'electron';

// ── Terminal API ───────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('terminalAPI', {
  onData: (callback: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('terminal:data', listener);
    // Return a cleanup function so the renderer can remove the listener
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  sendInput: (data: string) => {
    ipcRenderer.send('terminal:input', data);
  },
  resize: (cols: number, rows: number) => {
    ipcRenderer.send('terminal:resize', { cols, rows });
  },
  // Signal that the renderer listener is registered so the main process can
  // send a fresh shell prompt (avoids the race where initial PTY output arrives
  // before ipcRenderer.on is set up).
  ready: () => ipcRenderer.send('terminal:ready'),
});

// ── DB / Git IPC bridge ────────────────────────────────────────────────
// Maps route-style action names (matching server/index.ts) to IPC channels.

const DB_ACTION_MAP: Record<string, string> = {
  'test-connection': 'db:test-connection',
  disconnect: 'db:disconnect',
  execute: 'db:execute',
  databases: 'db:databases',
  schemas: 'db:schemas',
  tables: 'db:tables',
  columns: 'db:columns',
  'row-count': 'db:row-count',
  'create-database': 'db:create-database',
  'drop-database': 'db:drop-database',
  'drop-table': 'db:drop-table',
  'truncate-table': 'db:truncate-table',
  'create-schema': 'db:create-schema',
  'schema-diff': 'db:schema-diff',
  'git/status': 'git:status',
  'git/branches': 'git:branches',
  'git/diff': 'git:diff',
  'git/stage': 'git:stage',
  'git/unstage': 'git:unstage',
  'git/commit': 'git:commit',
  'git/push': 'git:push',
  'git/checkout': 'git:checkout',
  'git/log': 'git:log',
  'git/create-pr': 'git:create-pr',
  'git/pull': 'git:pull',
  'git/add-remote': 'git:add-remote',
  'git/init': 'git:init',
  'github/clone': 'github:clone',
  'github/schema-sql': 'github:schema-sql',
  'schema-indexes': 'db:schema-indexes',
  indexes: 'db:indexes',
  functions: 'db:functions',
  triggers: 'db:triggers',
  sequences: 'db:sequences',
  provision: 'db:provision',
};

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // DB/Git proxy: renderer calls this instead of fetch('/api/*') in Electron
  dbQuery: (action: string, payload: unknown) => {
    const channel = DB_ACTION_MAP[action];
    if (!channel) throw new Error(`Unknown db action: ${action}`);
    return ipcRenderer.invoke(channel, payload);
  },

  // Keychain (OS secure storage for connection passwords)
  keychainSet: (key: string, value: string) => ipcRenderer.invoke('keychain:set', key, value),
  keychainGet: (key: string) => ipcRenderer.invoke('keychain:get', key),
  keychainDelete: (key: string) => ipcRenderer.invoke('keychain:delete', key),

  // App-state proxy: connections, settings, history, api-requests — routed to the
  // in-process SQLite handler in the main process (replaces HTTP calls in Electron).
  appRequest: (method: string, reqPath: string, body: unknown) =>
    ipcRenderer.invoke('app:request', { method, path: reqPath, body }),

  // AI chat proxy — fetch to the external agent runs in the main process so it
  // isn't blocked by CSP or the file:// origin restriction in the renderer.
  aiChat: (messages: { role: string; content: string }[]) =>
    ipcRenderer.invoke('ai:chat', { messages }),

  // Native menu event listeners
  onMenuEvent: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'menu:new-tab',
      'menu:open-schema',
      'menu:command-palette',
      'menu:view-dashboard',
      'menu:toggle-sidebar',
      'menu:toggle-panel',
      'menu:bottom-tab',
      'menu:toggle-theme',
      'menu:execute-query',
      'menu:sidebar-tab',
      'menu:about',
    ];
    if (!validChannels.includes(channel)) return () => {};
    const listener = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});

// ── Auto-Updater API ───────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('updaterAPI', {
  onCheckingForUpdate: (callback: () => void) => {
    ipcRenderer.on('updater:checking-for-update', callback);
    return () => ipcRenderer.removeListener('updater:checking-for-update', callback);
  },
  onUpdateNotAvailable: (callback: () => void) => {
    ipcRenderer.on('updater:update-not-available', callback);
    return () => ipcRenderer.removeListener('updater:update-not-available', callback);
  },
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('updater:update-available', listener);
    return () => ipcRenderer.removeListener('updater:update-available', listener);
  },
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { percent: number }) => callback(p);
    ipcRenderer.on('updater:download-progress', listener);
    return () => ipcRenderer.removeListener('updater:download-progress', listener);
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('updater:update-downloaded', listener);
    return () => ipcRenderer.removeListener('updater:update-downloaded', listener);
  },
  // Surfaces download/check errors so the renderer can show an in-app message
  // instead of silently failing or (historically) falling back to a browser URL.
  onUpdateError: (callback: (info: { message: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { message: string }) => callback(info);
    ipcRenderer.on('updater:error', listener);
    return () => ipcRenderer.removeListener('updater:error', listener);
  },
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
});
