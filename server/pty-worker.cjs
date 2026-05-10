#!/usr/bin/env node
'use strict';

/**
 * Spawned as a child process by the Bun server.
 * Owns the PTY so node-pty runs in Node.js (Bun can't read PTY fds).
 *
 * Protocol:
 *   stdin  ← parent: newline-delimited JSON
 *              { type: "input",  data: "<base64-encoded bytes>" }
 *              { type: "resize", cols: N, rows: N }
 *   stdout → parent: raw PTY bytes (no framing — just stream)
 */

const pty = require('node-pty');
const os  = require('os');

const cols  = parseInt(process.env.PTY_COLS  || '80', 10);
const rows  = parseInt(process.env.PTY_ROWS  || '24', 10);
const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');

let proc;
try {
  proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols, rows,
    cwd: os.homedir(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'valstine-studio',
    },
  });
} catch (err) {
  process.stderr.write('[pty-worker] spawn failed: ' + err.message + '\n');
  process.exit(1);
}

// PTY output → stdout (raw bytes; parent forwards to WebSocket)
proc.onData(data => {
  process.stdout.write(Buffer.from(data, 'binary'));
});

proc.onExit(({ exitCode }) => {
  process.exit(exitCode ?? 0);
});

// stdin → PTY (newline-delimited JSON, input data is base64)
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'input' && typeof msg.data === 'string') {
        proc.write(Buffer.from(msg.data, 'base64').toString('binary'));
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        proc.resize(msg.cols, msg.rows);
      }
    } catch {
      // ignore malformed messages
    }
  }
});

process.stdin.on('end', () => { proc.kill(); });

process.on('SIGTERM', () => { proc.kill(); process.exit(0); });
