// --- electron/preload.ts ---
// Add this to your preload script to expose terminalAPI
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('terminalAPI', {
    onData: (callback) => {
        ipcRenderer.on('terminal:data', (_event, data) => callback(data));
    },
    sendInput: (data) => {
        ipcRenderer.send('terminal:input', data);
    },
    resize: (cols, rows) => {
        ipcRenderer.send('terminal:resize', { cols, rows });
    },
});
// (Keep your existing electronAPI exposeInMainWorld as well)
