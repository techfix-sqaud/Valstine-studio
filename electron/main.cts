import { app, BrowserWindow, shell, Menu, ipcMain, safeStorage } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import * as os from 'os';
import * as pty from 'node-pty';
import { readFileSync, existsSync } from 'node:fs';
import { registerDbIPC } from './db-ipc.cjs';

// Load .env from the project root so DO_AI_TOKEN etc. are available in process.env.
// In dev: app.getAppPath() is the project root.
// In prod: env vars come from the system; this is a no-op if there's no .env file.
function loadDotEnv() {
  const envPath = path.join(app.getAppPath(), '.env');
  if (!existsSync(envPath)) return;
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx < 1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* ignore parse errors */ }
}
loadDotEnv();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.valstine.studio');
}

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

let mainWindow: BrowserWindow | null = null;
let ptyProcess: pty.IPty | null = null;

// ── Terminal Shell Integration ─────────────────────────────────────────
function spawnPty(win: BrowserWindow) {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }

  const shellBin =
    process.platform === 'win32'
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
      if (!win.isDestroyed()) win.webContents.send('terminal:data', data);
    });

    ptyProcess.onExit(() => {
      ptyProcess = null;
    });
  } catch (err) {
    console.error('[terminal] Failed to spawn PTY:', err);
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', '\r\n\x1b[31m[Terminal: Failed to start shell process. Check that node-pty is built for this Electron version.]\x1b[0m\r\n');
    }
  }
}

function setupTerminal(win: BrowserWindow) {
  spawnPty(win);

  // Remove any stale handlers before registering (prevents duplicate listener accumulation)
  ipcMain.removeAllListeners('terminal:input');
  ipcMain.removeAllListeners('terminal:resize');
  ipcMain.removeAllListeners('terminal:ready');

  ipcMain.on('terminal:input', (_event, data: string) => {
    ptyProcess?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, size: { cols: number; rows: number }) => {
    ptyProcess?.resize(size.cols, size.rows);
  });

  // Renderer signals it has registered its onData listener — write a newline so
  // the shell outputs a fresh prompt (fixes the race where initial PTY output
  // was sent before the renderer's ipcRenderer.on was registered).
  ipcMain.on('terminal:ready', () => {
    if (ptyProcess) {
      ptyProcess.write('\n');
    } else {
      // PTY died — respawn it so the user gets a working terminal
      spawnPty(win);
    }
  });
}

// ── Native Menu (macOS: system bar, Windows/Linux: in-window) ────────────

function buildNativeMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: `About ${app.name}`,
                click: () => mainWindow?.webContents.send('menu:about'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
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
        ...(isMac ? [] : [{ role: 'quit' as const }]),
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
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://valstine.studio/docs'),
        },
        { type: 'separator' },
        {
          label: `About ${app.name}`,
          click: () => mainWindow?.webContents.send('menu:about'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── Keychain IPC (System Keychain for vault key storage) ─────────────────

function registerKeychainIPC() {
  ipcMain.handle('keychain:set', async (_event, key: string, value: string) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Sanitize key: only allow alphanumeric + hyphen + underscore to prevent path traversal
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    if (!safeKey) return false;
    const encrypted = safeStorage.encryptString(value);
    // Store in a simple file next to the app data
    const fs = await import('node:fs/promises');
    const dir = path.join(app.getPath('userData'), 'vault');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${safeKey}.enc`), encrypted);
    return true;
  });

  ipcMain.handle('keychain:get', async (_event, key: string) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    if (!safeKey) return null;
    const fs = await import('node:fs/promises');
    const filePath = path.join(app.getPath('userData'), 'vault', `${safeKey}.enc`);
    try {
      const encrypted = await fs.readFile(filePath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  });

  ipcMain.handle('keychain:delete', async (_event, key: string) => {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    if (!safeKey) return false;
    const fs = await import('node:fs/promises');
    const filePath = path.join(app.getPath('userData'), 'vault', `${safeKey}.enc`);
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore if file doesn't exist
    }
    return true;
  });
}

// ── Auto-Updater ─────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:update-downloaded', {
      version: info.version,
    });
  });

  // Check 5 seconds after launch so the app is fully visible first
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
}

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('updater:check', () => {
  if (!isDev) autoUpdater.checkForUpdates().catch(() => {});
});

// ── Window Creation ──────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 680,
    minHeight: 500,
    // macOS: hidden title bar with inset traffic lights (app draws its own bar)
    // Windows/Linux: frameless so the app renders a VS Code-style title bar
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: !isMac
      ? { color: '#1e2228', symbolColor: '#cccccc', height: 36 }
      : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 10 } : undefined,
    backgroundColor: '#1e2228',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Safety net: force-show after 5 s if ready-to-show never fires (renderer crash,
  // slow first paint, or macOS timing edge-cases with hiddenInset title bar).
  const safeShowTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  }, 5000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(safeShowTimer);
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    clearTimeout(safeShowTimer);
    console.error(`[renderer] Failed to load: ${errorCode} ${errorDescription}`);
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] Process gone: ${details.reason} (exitCode ${details.exitCode})`);
  });

  // Content-Security-Policy (prod only — dev needs looser rules for HMR)
  if (!isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-eval' blob:; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: https:; " +
            "font-src 'self' data:; " +
            "worker-src 'self' blob:; " +
            "connect-src 'self' ws://localhost:* wss://localhost:*",
          ],
        },
      });
    });
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // __dirname is dist-electron/ — dist/ is a sibling, not a child
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup terminal shell integration after window is created
  setupTerminal(mainWindow);
}

// ── App Lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(() => {
  buildNativeMenu();
  registerKeychainIPC();
  registerDbIPC();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
});
