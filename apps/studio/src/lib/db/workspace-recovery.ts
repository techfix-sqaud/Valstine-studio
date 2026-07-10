// ============================================================================
// Valstine Studio — Workspace Recovery
// ============================================================================
// Auto-saves every open editor tab to IndexedDB/SQLite every 2 seconds.
// On next launch, unsaved buffers are restored automatically.
// ============================================================================

import { idb } from './indexeddb';
import type { WorkspaceRecoveryEntry } from './types';

let intervalId: ReturnType<typeof setInterval> | null = null;
let pendingWrites = new Map<string, WorkspaceRecoveryEntry>();

// ── Auto-save loop ───────────────────────────────────────────────────────

/** Start the auto-save loop (call once on app init). */
export function startRecoveryLoop(intervalMs = 2000): void {
  if (intervalId) return;
  intervalId = setInterval(flushPending, intervalMs);
}

export function stopRecoveryLoop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/** Queue a tab buffer for the next flush. */
export function markDirty(entry: WorkspaceRecoveryEntry): void {
  pendingWrites.set(entry.id, { ...entry, savedAt: new Date().toISOString() });
}

/** Write all pending buffers to storage. */
async function flushPending(): Promise<void> {
  if (pendingWrites.size === 0) return;
  const batch = new Map(pendingWrites);
  pendingWrites.clear();
  await Promise.all(
    Array.from(batch.values()).map((entry) => idb.putRecovery(entry)),
  );
}

// ── Recovery on launch ───────────────────────────────────────────────────

/** Load all saved buffers (call on app init to restore tabs). */
export async function loadRecoveryEntries(): Promise<WorkspaceRecoveryEntry[]> {
  return idb.getAllRecovery();
}

/** Remove a single recovered tab (e.g. after user explicitly closes it). */
export async function removeRecoveryEntry(tabId: string): Promise<void> {
  pendingWrites.delete(tabId);
  await idb.deleteRecovery(tabId);
}

/** Clear all recovery data (e.g. after successful restore). */
export async function clearAllRecovery(): Promise<void> {
  pendingWrites.clear();
  await idb.clearRecovery();
}
