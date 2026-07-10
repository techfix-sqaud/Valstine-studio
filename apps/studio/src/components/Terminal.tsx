import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useAppStore } from "@/store/app-store";
import { getPresetById } from "@/lib/terminal-themes";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/terminal`;
}

function resolveTheme(settings: ReturnType<typeof useAppStore.getState>["settings"]["terminal"]) {
  const preset = getPresetById(settings.presetId);
  const colors = settings.presetId === "custom"
    ? { ...preset.colors, background: settings.background, foreground: settings.foreground, cursor: settings.cursor, selectionBackground: settings.selectionBackground }
    : preset.colors;
  return colors;
}

const TerminalComponent = () => {
  const terminalSettings = useAppStore((s) => s.settings.terminal);

  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onDataCleanupRef = useRef<(() => void) | null>(null);

  // ── Apply theme/font changes to existing terminal ─────────────────────
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const colors = resolveTheme(terminalSettings);
    term.options.theme = colors;
    term.options.fontSize = terminalSettings.fontSize;
    term.options.fontFamily = terminalSettings.fontFamily;
    try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
  }, [terminalSettings]);

  // ── Mount terminal once ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const settings = useAppStore.getState().settings.terminal;
    const colors = resolveTheme(settings);

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: 1.2,
      scrollback: 5000,
      theme: colors,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const doFit = () => {
      try {
        fitAddon.fit();
        const { cols, rows } = term;
        if (isElectron) {
          window.terminalAPI?.resize?.(cols, rows);
        } else if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      } catch {
        // viewport not ready yet
      }
    };

    // ── Electron mode ─────────────────────────────────────────────────
    if (isElectron) {
      if (window.terminalAPI?.onData) {
        const cleanup = window.terminalAPI.onData((data: string) => term.write(data));
        if (typeof cleanup === "function") onDataCleanupRef.current = cleanup;
      }
      // Tell the main process the listener is registered — it will write a newline
      // to trigger a fresh shell prompt (fixes the initial-output timing race).
      window.terminalAPI?.ready?.();

      const inputDisposable = term.onData((data) => window.terminalAPI?.sendInput?.(data));
      const ro = new ResizeObserver(doFit);
      ro.observe(containerRef.current!);
      const initialFit = setTimeout(doFit, 50);
      return () => {
        clearTimeout(initialFit);
        onDataCleanupRef.current?.();
        inputDisposable.dispose();
        ro.disconnect();
        term.dispose();
        xtermRef.current = null;
      };
    }

    // ── Web mode: WebSocket to Bun server ────────────────────────────
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let reconnectCount = 0;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(buildWsUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectCount = 0;
        doFit();
      };

      ws.onmessage = (e: MessageEvent) => {
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data));
        } else if (typeof e.data === "string") {
          term.write(e.data);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        wsRef.current = null;
        if (!destroyed) {
          reconnectCount++;
          const delay = Math.min(1000 * reconnectCount, 10000);
          term.write(`\r\n\x1b[33m[Connection closed — reconnecting in ${Math.round(delay / 1000)}s…]\x1b[0m\r\n`);
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    }

    connect();

    const inputDisposable = term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const ro = new ResizeObserver(doFit);
    ro.observe(containerRef.current!);
    const initialFit = setTimeout(doFit, 50);

    return () => {
      destroyed = true;
      clearTimeout(initialFit);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      inputDisposable.dispose();
      resizeDisposable.dispose();
      ro.disconnect();
      ws?.close();
      wsRef.current = null;
      term.dispose();
      xtermRef.current = null;
    };
  }, []); // mount once — theme changes handled by separate effect above

  return <div ref={containerRef} className="h-full w-full" />;
};

export default TerminalComponent;
