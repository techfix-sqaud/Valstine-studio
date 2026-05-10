interface TerminalAPI {
  onData: (callback: (data: string) => void) => (() => void) | void;
  sendInput?: (data: string) => void;
  resize?: (cols: number, rows: number) => void;
}

declare global {
  interface Window {
    terminalAPI?: TerminalAPI;
  }
}

export {};
