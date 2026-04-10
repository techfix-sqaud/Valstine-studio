import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

const TerminalComponent = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xterm = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize Terminal instance
    xterm.current = new Terminal({
      cursorBlink: true,
      theme: { background: "#1e1e1e" },
    });

    // Attach terminal to the DOM
    xterm.current.open(terminalRef.current);
    xterm.current.writeln("Hello from \x1B[1;3;31mXterm.js\x1B[0m with Bun!");

    // Echo input back to terminal
    const disposable = xterm.current.onData((data) => {
      xterm.current?.write(data);
    });

    return () => {
      disposable.dispose();
      xterm.current?.dispose();
    };
  }, []);

  return <div ref={terminalRef} style={{ height: "400px", width: "100%" }} />;
};

export default TerminalComponent;
