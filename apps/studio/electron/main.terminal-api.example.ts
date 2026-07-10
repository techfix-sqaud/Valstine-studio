// --- electron/main.ts ---
// Add this to your main process to enable a working shell terminal
import { app, BrowserWindow, ipcMain } from 'electron';
import * as os from 'os';
import * as pty from 'node-pty';

let shell: string;
if (process.platform === 'win32') {
  shell = 'powershell.exe';
} else if (process.env.SHELL) {
  shell = process.env.SHELL;
} else {
  shell = '/bin/bash';
}

let ptyProcess: pty.IPty | null = null;

function createTerminal(win: BrowserWindow) {
  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: {
      ...process.env,
      TERMINAL_PROGRAM: 'valstine-studio',
      TERMINAL_INTEGRATION: '1',
    },
  });

  ptyProcess.onData((data) => {
    win.webContents.send('terminal:data', data);
  });

  ipcMain.on('terminal:input', (_event, data) => {
    ptyProcess?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, size) => {
    ptyProcess?.resize(size.cols, size.rows);
  });
}

// In your app ready/createWindow logic:
// createTerminal(mainWindow);
