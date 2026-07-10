// --- electron/preload.ts ---
// Add this to your preload script to expose terminalAPI
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('terminalAPI', {
  onData: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal:data', (_event, data) => callback(data));
  },
  sendInput: (data: string) => {
    ipcRenderer.send('terminal:input', data);
  },
  resize: (cols: number, rows: number) => {
    ipcRenderer.send('terminal:resize', { cols, rows });
  },
});

// (Keep your existing electronAPI exposeInMainWorld as well)
