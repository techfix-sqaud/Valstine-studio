interface TerminalAPI {
  onData: (callback: (data: string) => void) => (() => void) | void;
  sendInput?: (data: string) => void;
  resize?: (cols: number, rows: number) => void;
  ready?: () => void;
}

interface UpdaterAPI {
  onCheckingForUpdate: (callback: () => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateError: (callback: (info: { message: string }) => void) => () => void;
  installUpdate: () => void;
  checkForUpdates: () => void;
}

declare global {
  interface Window {
    terminalAPI?: TerminalAPI;
    updaterAPI?: UpdaterAPI;
  }
}

export {};
