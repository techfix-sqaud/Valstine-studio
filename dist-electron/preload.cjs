"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// ── Terminal API ───────────────────────────────────────────────────────
electron_1.contextBridge.exposeInMainWorld('terminalAPI', {
    onData: (callback) => {
        const listener = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('terminal:data', listener);
        // Return a cleanup function so the renderer can remove the listener
        return () => electron_1.ipcRenderer.removeListener('terminal:data', listener);
    },
    sendInput: (data) => {
        electron_1.ipcRenderer.send('terminal:input', data);
    },
    resize: (cols, rows) => {
        electron_1.ipcRenderer.send('terminal:resize', { cols, rows });
    },
    // Signal that the renderer listener is registered so the main process can
    // send a fresh shell prompt (avoids the race where initial PTY output arrives
    // before ipcRenderer.on is set up).
    ready: () => electron_1.ipcRenderer.send('terminal:ready'),
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
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
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
        return electron_1.ipcRenderer.invoke(channel, payload);
    },
    // Keychain (OS secure storage for connection passwords)
    keychainSet: (key, value) => electron_1.ipcRenderer.invoke('keychain:set', key, value),
    keychainGet: (key) => electron_1.ipcRenderer.invoke('keychain:get', key),
    keychainDelete: (key) => electron_1.ipcRenderer.invoke('keychain:delete', key),
    // App-state proxy: connections, settings, history, api-requests — routed to the
    // in-process SQLite handler in the main process (replaces HTTP calls in Electron).
    appRequest: (method, reqPath, body) => electron_1.ipcRenderer.invoke('app:request', { method, path: reqPath, body }),
    // AI chat proxy — fetch to the external agent runs in the main process so it
    // isn't blocked by CSP or the file:// origin restriction in the renderer.
    aiChat: (messages) => electron_1.ipcRenderer.invoke('ai:chat', { messages }),
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
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    },
});
// ── Auto-Updater API ───────────────────────────────────────────────────────
electron_1.contextBridge.exposeInMainWorld('updaterAPI', {
    onUpdateAvailable: (callback) => {
        const listener = (_e, info) => callback(info);
        electron_1.ipcRenderer.on('updater:update-available', listener);
        return () => electron_1.ipcRenderer.removeListener('updater:update-available', listener);
    },
    onDownloadProgress: (callback) => {
        const listener = (_e, p) => callback(p);
        electron_1.ipcRenderer.on('updater:download-progress', listener);
        return () => electron_1.ipcRenderer.removeListener('updater:download-progress', listener);
    },
    onUpdateDownloaded: (callback) => {
        const listener = (_e, info) => callback(info);
        electron_1.ipcRenderer.on('updater:update-downloaded', listener);
        return () => electron_1.ipcRenderer.removeListener('updater:update-downloaded', listener);
    },
    installUpdate: () => electron_1.ipcRenderer.invoke('updater:install'),
    checkForUpdates: () => electron_1.ipcRenderer.invoke('updater:check'),
});
