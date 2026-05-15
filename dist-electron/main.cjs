"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const node_path_1 = __importDefault(require("node:path"));
const os = __importStar(require("os"));
const pty = __importStar(require("node-pty"));
const node_fs_1 = require("node:fs");
const db_ipc_cjs_1 = require("./db-ipc.cjs");
// Register the custom renderer scheme before app.ready so Chromium grants it
// full privileges (standard origin, secure context, fetch support, no CORS).
// This lets the packaged renderer load ES modules and workers from ASAR without
// the crossorigin/CORS issues that affect plain file:// loading.
electron_1.protocol.registerSchemesAsPrivileged([{
        scheme: 'valstine',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    }]);
// Load .env from the project root so DO_AI_TOKEN etc. are available in process.env.
// In dev: app.getAppPath() is the project root.
// In prod: env vars come from the system; this is a no-op if there's no .env file.
function loadDotEnv() {
    const envPath = node_path_1.default.join(electron_1.app.getAppPath(), '.env');
    if (!(0, node_fs_1.existsSync)(envPath))
        return;
    try {
        const lines = (0, node_fs_1.readFileSync)(envPath, 'utf8').split('\n');
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('#'))
                continue;
            const eqIdx = line.indexOf('=');
            if (eqIdx < 1)
                continue;
            const key = line.slice(0, eqIdx).trim();
            const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (key && !(key in process.env))
                process.env[key] = val;
        }
    }
    catch { /* ignore parse errors */ }
}
loadDotEnv();
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
    electron_1.app.setAppUserModelId('com.valstine.studio');
}
const isDev = !electron_1.app.isPackaged;
const isMac = process.platform === 'darwin';
let mainWindow = null;
let ptyProcess = null;
// ── Terminal Shell Integration ─────────────────────────────────────────
function spawnPty(win) {
    if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
    }
    const shellBin = process.platform === 'win32'
        ? 'powershell.exe'
        : (process.env.SHELL ?? '/bin/bash');
    try {
        ptyProcess = pty.spawn(shellBin, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: os.homedir(),
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                TERM_PROGRAM: 'valstine-studio',
            },
        });
        ptyProcess.onData((data) => {
            if (!win.isDestroyed())
                win.webContents.send('terminal:data', data);
        });
        ptyProcess.onExit(() => {
            ptyProcess = null;
        });
    }
    catch (err) {
        console.error('[terminal] Failed to spawn PTY:', err);
        if (!win.isDestroyed()) {
            win.webContents.send('terminal:data', '\r\n\x1b[31m[Terminal: Failed to start shell process. Check that node-pty is built for this Electron version.]\x1b[0m\r\n');
        }
    }
}
function setupTerminal(win) {
    spawnPty(win);
    // Remove any stale handlers before registering (prevents duplicate listener accumulation)
    electron_1.ipcMain.removeAllListeners('terminal:input');
    electron_1.ipcMain.removeAllListeners('terminal:resize');
    electron_1.ipcMain.removeAllListeners('terminal:ready');
    electron_1.ipcMain.on('terminal:input', (_event, data) => {
        ptyProcess?.write(data);
    });
    electron_1.ipcMain.on('terminal:resize', (_event, size) => {
        ptyProcess?.resize(size.cols, size.rows);
    });
    // Renderer signals it has registered its onData listener — write a newline so
    // the shell outputs a fresh prompt (fixes the race where initial PTY output
    // was sent before the renderer's ipcRenderer.on was registered).
    electron_1.ipcMain.on('terminal:ready', () => {
        if (ptyProcess) {
            ptyProcess.write('\n');
        }
        else {
            // PTY died — respawn it so the user gets a working terminal
            spawnPty(win);
        }
    });
}
// ── Native Menu (macOS: system bar, Windows/Linux: in-window) ────────────
function buildNativeMenu() {
    const template = [
        // macOS app menu
        ...(isMac
            ? [
                {
                    label: electron_1.app.name,
                    submenu: [
                        {
                            label: `About ${electron_1.app.name}`,
                            click: () => mainWindow?.webContents.send('menu:about'),
                        },
                        { type: 'separator' },
                        { role: 'services' },
                        { type: 'separator' },
                        { role: 'hide' },
                        { role: 'hideOthers' },
                        { role: 'unhide' },
                        { type: 'separator' },
                        { role: 'quit' },
                    ],
                },
            ]
            : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Query Tab',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow?.webContents.send('menu:new-tab'),
                },
                { type: 'separator' },
                {
                    label: 'Open Schema Diagram',
                    click: () => mainWindow?.webContents.send('menu:open-schema'),
                },
                { type: 'separator' },
                ...(isMac ? [] : [{ role: 'quit' }]),
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Command Palette',
                    accelerator: 'CmdOrCtrl+Shift+P',
                    click: () => mainWindow?.webContents.send('menu:command-palette'),
                },
                {
                    label: "View Dashboard",
                    click: () => mainWindow?.webContents.send('menu:view-dashboard'),
                },
                { type: 'separator' },
                {
                    label: 'Toggle Sidebar',
                    accelerator: 'CmdOrCtrl+B',
                    click: () => mainWindow?.webContents.send('menu:toggle-sidebar'),
                },
                {
                    label: 'Toggle Panel',
                    accelerator: 'CmdOrCtrl+J',
                    click: () => mainWindow?.webContents.send('menu:toggle-panel'),
                },
                { type: 'separator' },
                {
                    label: 'Toggle Theme',
                    click: () => mainWindow?.webContents.send('menu:toggle-theme'),
                },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Go',
            submenu: [
                {
                    label: 'Go to File...',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => mainWindow?.webContents.send('menu:command-palette'),
                },
                { type: 'separator' },
                {
                    label: 'Explorer',
                    click: () => mainWindow?.webContents.send('menu:sidebar-tab', 'explorer'),
                },
                {
                    label: 'Connections',
                    click: () => mainWindow?.webContents.send('menu:sidebar-tab', 'connections'),
                },
                {
                    label: 'Search',
                    accelerator: 'Shift+CmdOrCtrl+F',
                    click: () => mainWindow?.webContents.send('menu:sidebar-tab', 'search'),
                },
            ],
        },
        {
            label: 'Run',
            submenu: [
                {
                    label: 'Execute Query',
                    accelerator: 'CmdOrCtrl+Enter',
                    click: () => mainWindow?.webContents.send('menu:execute-query'),
                },
            ],
        },
        {
            label: 'Terminal',
            submenu: [
                {
                    label: 'New Terminal',
                    accelerator: 'Ctrl+`',
                    click: () => mainWindow?.webContents.send('menu:bottom-tab', 'terminal'),
                },
                { type: 'separator' },
                {
                    label: 'Show Results',
                    click: () => mainWindow?.webContents.send('menu:bottom-tab', 'results'),
                },
                {
                    label: 'Show Problems',
                    click: () => mainWindow?.webContents.send('menu:bottom-tab', 'problems'),
                },
                {
                    label: 'Show History',
                    click: () => mainWindow?.webContents.send('menu:bottom-tab', 'history'),
                },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac
                    ? [{ type: 'separator' }, { role: 'front' }]
                    : [{ role: 'close' }]),
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Documentation',
                    click: () => electron_1.shell.openExternal('https://valstine.studio/docs'),
                },
                { type: 'separator' },
                {
                    label: `About ${electron_1.app.name}`,
                    click: () => mainWindow?.webContents.send('menu:about'),
                },
            ],
        },
    ];
    const menu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(menu);
}
// ── Keychain IPC (System Keychain for vault key storage) ─────────────────
function registerKeychainIPC() {
    electron_1.ipcMain.handle('keychain:set', async (_event, key, value) => {
        if (!electron_1.safeStorage.isEncryptionAvailable())
            return false;
        // Sanitize key: only allow alphanumeric + hyphen + underscore to prevent path traversal
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
        if (!safeKey)
            return false;
        const encrypted = electron_1.safeStorage.encryptString(value);
        // Store in a simple file next to the app data
        const fs = await import('node:fs/promises');
        const dir = node_path_1.default.join(electron_1.app.getPath('userData'), 'vault');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(node_path_1.default.join(dir, `${safeKey}.enc`), encrypted);
        return true;
    });
    electron_1.ipcMain.handle('keychain:get', async (_event, key) => {
        if (!electron_1.safeStorage.isEncryptionAvailable())
            return null;
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
        if (!safeKey)
            return null;
        const fs = await import('node:fs/promises');
        const filePath = node_path_1.default.join(electron_1.app.getPath('userData'), 'vault', `${safeKey}.enc`);
        try {
            const encrypted = await fs.readFile(filePath);
            return electron_1.safeStorage.decryptString(encrypted);
        }
        catch {
            return null;
        }
    });
    electron_1.ipcMain.handle('keychain:delete', async (_event, key) => {
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
        if (!safeKey)
            return false;
        const fs = await import('node:fs/promises');
        const filePath = node_path_1.default.join(electron_1.app.getPath('userData'), 'vault', `${safeKey}.enc`);
        try {
            await fs.unlink(filePath);
        }
        catch {
            // ignore if file doesn't exist
        }
        return true;
    });
}
// ── Renderer Protocol (valstine://) ──────────────────────────────────────
// Serves packaged renderer assets from the ASAR via a privileged custom scheme.
// Using fs.readFile (which has ASAR interception) instead of net.fetch ensures
// files are always resolved correctly from inside the ASAR archive.
function getMimeType(filePath) {
    const ext = node_path_1.default.extname(filePath).toLowerCase();
    return {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.wasm': 'application/wasm',
        '.map': 'application/json',
    }[ext] ?? 'application/octet-stream';
}
function registerRendererProtocol() {
    // app.getAppPath() returns the ASAR root in prod and the project root in dev.
    const distPath = node_path_1.default.join(electron_1.app.getAppPath(), 'dist');
    electron_1.protocol.handle('valstine', async (request) => {
        const url = new URL(request.url);
        const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
        const filePath = node_path_1.default.resolve(distPath, rel);
        // Prevent path traversal attacks.
        if (!filePath.startsWith(distPath)) {
            return new Response('Forbidden', { status: 403 });
        }
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
        };
        try {
            const data = await node_fs_1.promises.readFile(filePath);
            // Buffer extends Uint8Array; cast explicitly so TypeScript's BodyInit check passes.
            return new Response(new Uint8Array(data), { headers: { 'Content-Type': getMimeType(filePath), ...corsHeaders } });
        }
        catch {
            // SPA fallback: unknown paths return index.html so BrowserRouter handles routing.
            try {
                const index = await node_fs_1.promises.readFile(node_path_1.default.join(distPath, 'index.html'));
                return new Response(new Uint8Array(index), { headers: { 'Content-Type': 'text/html', ...corsHeaders } });
            }
            catch {
                return new Response('Not Found', { status: 404 });
            }
        }
    });
}
// ── Auto-Updater ─────────────────────────────────────────────────────────
function setupAutoUpdater() {
    if (isDev)
        return;
    // Route electron-updater logs through the main-process console so they
    // appear in the packaged-app log file (~/Library/Logs/<app>/main.log on macOS).
    electron_updater_1.autoUpdater.logger = console;
    // Never open a browser or prompt the user — download silently, then notify.
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    // Do NOT pick up pre-release builds for stable users.
    electron_updater_1.autoUpdater.allowPrerelease = false;
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        console.log('[updater] Checking for update…');
        mainWindow?.webContents.send('updater:checking-for-update');
    });
    electron_updater_1.autoUpdater.on('update-not-available', () => {
        console.log('[updater] No update available');
        mainWindow?.webContents.send('updater:update-not-available');
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        console.log(`[updater] Update available: ${info.version}`);
        mainWindow?.webContents.send('updater:update-available', {
            version: info.version,
            releaseNotes: info.releaseNotes,
        });
    });
    electron_updater_1.autoUpdater.on('download-progress', (progress) => {
        mainWindow?.webContents.send('updater:download-progress', {
            percent: Math.round(progress.percent),
            transferred: progress.transferred,
            total: progress.total,
        });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        console.log(`[updater] Update downloaded: ${info.version}`);
        mainWindow?.webContents.send('updater:update-downloaded', {
            version: info.version,
        });
    });
    // Surface errors in the renderer so the UI can show a helpful message
    // instead of silently failing or falling back to a browser redirect.
    electron_updater_1.autoUpdater.on('error', (err) => {
        console.error('[updater] Error:', err);
        mainWindow?.webContents.send('updater:error', {
            message: err.message ?? String(err),
        });
    });
    // Check 5 seconds after launch so the app is fully visible first.
    setTimeout(() => {
        electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
            console.error('[updater] checkForUpdates failed:', err);
        });
    }, 5000);
}
electron_1.ipcMain.handle('updater:install', () => {
    electron_updater_1.autoUpdater.quitAndInstall();
});
electron_1.ipcMain.handle('updater:check', () => {
    if (!isDev) {
        electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
            console.error('[updater] manual check failed:', err);
        });
    }
});
// ── Window Creation ──────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 680,
        minHeight: 500,
        // macOS: use 'hidden' with trafficLightPosition instead of 'hiddenInset' to avoid macOS UI render bugs
        // Windows/Linux: frameless so the app renders a VS Code-style title bar
        titleBarStyle: 'hidden',
        titleBarOverlay: !isMac
            ? { color: '#1e2228', symbolColor: '#cccccc', height: 36 }
            : undefined,
        trafficLightPosition: isMac ? { x: 12, y: 10 } : undefined,
        backgroundColor: '#1e2228',
        // Force transparency off on macOS to fix blurred/blank window render bug
        transparent: false,
        vibrancy: undefined,
        show: false,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    // Safety net: force-show after 5 s if ready-to-show never fires (renderer crash,
    // slow first paint, or macOS timing edge-cases with hiddenInset title bar).
    const safeShowTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible())
            mainWindow.show();
    }, 5000);
    mainWindow.once('ready-to-show', () => {
        clearTimeout(safeShowTimer);
        mainWindow?.show();
        mainWindow?.focus();
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        clearTimeout(safeShowTimer);
        console.error(`[renderer] Failed to load: ${errorCode} ${errorDescription}`);
        if (mainWindow && !mainWindow.isVisible())
            mainWindow.show();
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error(`[renderer] Process gone: ${details.reason} (exitCode ${details.exitCode})`);
    });
    // Content-Security-Policy (prod only — dev needs looser rules for HMR).
    // 'self' = valstine://app origin (all renderer assets are served from there).
    // 'wasm-unsafe-eval' is required for Monaco Editor's WASM-based features.
    // connect-src https: allows the Landing page GitHub API fetch and any HTTPS
    // calls the renderer makes; all sensitive data goes through IPC, not fetch.
    if (!isDev) {
        mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self'; " +
                            "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; " +
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
                            "img-src 'self' data: blob: https:; " +
                            "font-src 'self' data: https://fonts.gstatic.com; " +
                            "worker-src 'self' blob:; " +
                            "connect-src 'self' https: wss: ws:",
                    ],
                },
            });
        });
        // Forward renderer console errors to the main-process log file so they are
        // visible even when DevTools are closed (level 2 = warning, 3 = error).
        mainWindow.webContents.on('console-message', (_ev, level, message, line, sourceId) => {
            if (level >= 2) {
                console.error(`[renderer:${level === 3 ? 'error' : 'warn'}] ${message} (${sourceId}:${line})`);
            }
        });
    }
    // Open external links in the system browser; block in-app navigation to external URLs.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        // Load the renderer via the registered valstine:// protocol.
        // This gives the page a real secure origin so ES modules, workers, and CSP
        // all work correctly from the packaged ASAR — avoids the crossorigin/file://
        // ambiguity that causes blank windows in packaged macOS builds.
        mainWindow.loadURL('valstine://app/');
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Setup terminal shell integration after window is created
    setupTerminal(mainWindow);
}
// ── App Lifecycle ────────────────────────────────────────────────────────
// Disable hardware acceleration on Linux (avoids blank screens) or if disabled by a flag
if (process.platform === 'linux' || process.env.DISABLE_GPU) {
    electron_1.app.disableHardwareAcceleration();
}
electron_1.app.whenReady().then(() => {
    // Must be called after app.ready but before createWindow.
    registerRendererProtocol();
    buildNativeMenu();
    registerKeychainIPC();
    (0, db_ipc_cjs_1.registerDbIPC)();
    createWindow();
    setupAutoUpdater();
    // F12 toggles DevTools in production builds — essential for diagnosing
    // packaged-build rendering issues without rebuilding with isDev=true.
    electron_1.globalShortcut.register('F12', () => {
        if (!mainWindow)
            return;
        mainWindow.webContents.isDevToolsOpened()
            ? mainWindow.webContents.closeDevTools()
            : mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (!isMac) {
        electron_1.app.quit();
    }
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
    if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
    }
});
