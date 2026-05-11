import { contextBridge, ipcRenderer } from 'electron';
// ── Terminal API ───────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('terminalAPI', {
    onData: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('terminal:data', listener);
        // Return a cleanup function so the renderer can remove the listener
        return () => ipcRenderer.removeListener('terminal:data', listener);
    },
    sendInput: (data) => {
        ipcRenderer.send('terminal:input', data);
    },
    resize: (cols, rows) => {
        ipcRenderer.send('terminal:resize', { cols, rows });
    },
    // Signal that the renderer listener is registered so the main process can
    // send a fresh shell prompt (avoids the race where initial PTY output arrives
    // before ipcRenderer.on is set up).
    ready: () => ipcRenderer.send('terminal:ready'),
});
// ── DB / Git IPC bridge ────────────────────────────────────────────────
// Maps route-style action names (matching server/index.ts) to IPC channels.
const DB_ACTION_MAP = {
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
    dbQuery: (action, payload) => {
        const channel = DB_ACTION_MAP[action];
        if (!channel)
            throw new Error(`Unknown db action: ${action}`);
        return ipcRenderer.invoke(channel, payload);
    },
    // Keychain (OS secure storage for connection passwords)
    keychainSet: (key, value) => ipcRenderer.invoke('keychain:set', key, value),
    keychainGet: (key) => ipcRenderer.invoke('keychain:get', key),
    keychainDelete: (key) => ipcRenderer.invoke('keychain:delete', key),
    // App-state proxy: connections, settings, history, api-requests — routed to the
    // in-process SQLite handler in the main process (replaces HTTP calls in Electron).
    appRequest: (method, reqPath, body) => ipcRenderer.invoke('app:request', { method, path: reqPath, body }),
    // AI chat proxy — fetch to the external agent runs in the main process so it
    // isn't blocked by CSP or the file:// origin restriction in the renderer.
    aiChat: (messages) => ipcRenderer.invoke('ai:chat', { messages }),
    // Native menu event listeners
    onMenuEvent: (channel, callback) => {
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
        if (!validChannels.includes(channel))
            return () => { };
        const listener = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    },
});
// ── Auto-Updater API ───────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('updaterAPI', {
    onUpdateAvailable: (callback) => {
        const listener = (_e, info) => callback(info);
        ipcRenderer.on('updater:update-available', listener);
        return () => ipcRenderer.removeListener('updater:update-available', listener);
    },
    onDownloadProgress: (callback) => {
        const listener = (_e, p) => callback(p);
        ipcRenderer.on('updater:download-progress', listener);
        return () => ipcRenderer.removeListener('updater:download-progress', listener);
    },
    onUpdateDownloaded: (callback) => {
        const listener = (_e, info) => callback(info);
        ipcRenderer.on('updater:update-downloaded', listener);
        return () => ipcRenderer.removeListener('updater:update-downloaded', listener);
    },
    installUpdate: () => ipcRenderer.invoke('updater:install'),
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
});
