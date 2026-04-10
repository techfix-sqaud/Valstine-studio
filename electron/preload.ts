import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // Keychain (vault key storage via OS secure storage)
  keychainSet: (key: string, value: string) => ipcRenderer.invoke('keychain:set', key, value),
  keychainGet: (key: string) => ipcRenderer.invoke('keychain:get', key),
  keychainDelete: (key: string) => ipcRenderer.invoke('keychain:delete', key),

  // Native menu event listeners (macOS menu bar & Windows overlay)
  onMenuEvent: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'menu:new-tab',
      'menu:open-schema',
      'menu:command-palette',
      'menu:toggle-sidebar',
      'menu:toggle-panel',
      'menu:toggle-theme',
      'menu:execute-query',
      'menu:sidebar-tab',
      'menu:about',
    ];
    if (validChannels.includes(channel)) {
      const listener = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },
});
