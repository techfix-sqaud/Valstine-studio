import { app, BrowserWindow, shell, Menu, ipcMain, safeStorage } from 'electron';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import path from 'node:path';
import * as os from 'os';
import * as pty from 'node-pty';
import { registerDbIPC } from './db-ipc.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.valstine.studio');
}

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

let mainWindow: BrowserWindow | null = null;
let ptyProcess: pty.IPty | null = null;

// ── Terminal Shell Integration ─────────────────────────────────────────
function setupTerminal(win: BrowserWindow) {
  // Kill any previous PTY before spawning a new one (handles HMR reloads in dev)
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }

  const shellBin =
    process.platform === 'win32'
      ? 'powershell.exe'
      : (process.env.SHELL ?? '/bin/bash');

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
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', data);
    }
  });

  ptyProcess.onExit(() => {
    ptyProcess = null;
  });

  // Remove any stale handlers before registering (prevents duplicate listener accumulation)
  ipcMain.removeAllListeners('terminal:input');
  ipcMain.removeAllListeners('terminal:resize');

  ipcMain.on('terminal:input', (_event, data: string) => {
    ptyProcess?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, size: { cols: number; rows: number }) => {
    ptyProcess?.resize(size.cols, size.rows);
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
              { role: 'about' as const },
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
    const encrypted = safeStorage.encryptString(value);
    // Store in a simple file next to the app data
    const fs = await import('node:fs/promises');
    const dir = path.join(app.getPath('userData'), 'vault');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${key}.enc`), encrypted);
    return true;
  });

  ipcMain.handle('keychain:get', async (_event, key: string) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const fs = await import('node:fs/promises');
    const filePath = path.join(app.getPath('userData'), 'vault', `${key}.enc`);
    try {
      const encrypted = await fs.readFile(filePath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  });

  ipcMain.handle('keychain:delete', async (_event, key: string) => {
    const fs = await import('node:fs/promises');
    const filePath = path.join(app.getPath('userData'), 'vault', `${key}.enc`);
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Graceful show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

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
