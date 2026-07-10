import { useEffect, useRef } from 'react';
import { useAppStore } from '@valstine/core/store/app-store';
import { idb } from '@valstine/core/lib/db/indexeddb';
import type { WorkspaceRecoveryEntry } from '@valstine/core/lib/db/types';
import type { QueryTab } from '@valstine/core/lib/mock-data';

// Keys must match packages/core/lib/session-restore.ts (restoreSessionFromIDB reads them).
const SESSION_KEYS = {
  activeTabId: 'session:activeTabId',
  activeConnectionId: 'session:activeConnectionId',
  tabsMeta: 'session:tabsMeta',
  activeSidebarTab: 'session:activeSidebarTab',
  sidebarOpen: 'session:sidebarOpen',
} as const;

// Debounce: schedules fn after delay ms, cancels any prior call.
// Returns a stable ref-based wrapper so it never changes identity across renders.
function makeDebounced<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, delay);
  };
}

// ── Hook: call inside the main workspace component ────────────────────────
// Every state write is fire-and-forget — IDB errors never surface to the UI.
// Two separate debounce budgets:
//   - Tab content: 150 ms — tight enough that we rarely lose more than a
//     few chars on a hard crash; loose enough to avoid IDB write storms.
//   - App state: 500 ms — active tab / connection change far less often.

export function useSessionPersistence() {
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const activeConnectionId = useAppStore(s => s.activeConnectionId);
  const activeSidebarTab = useAppStore(s => s.activeSidebarTab);
  const sidebarOpen = useAppStore(s => s.sidebarOpen);

  // Stable debounced writers — created once via ref, never re-created
  const saveTabsRef = useRef(makeDebounced(async (snapTabs: QueryTab[]) => {
    // Persist tab shell metadata (no content here — content lives in recovery)
    const meta = snapTabs.map(({ id, title, connectionId, type }) => ({
      id, title, connectionId, type,
    }));
    idb.setUIState(SESSION_KEYS.tabsMeta, JSON.stringify(meta)).catch(() => {});

    // Write per-tab content to workspaceRecovery
    for (const tab of snapTabs) {
      const entry: WorkspaceRecoveryEntry = {
        id: tab.id,
        tabTitle: tab.title,
        connectionId: tab.connectionId,
        content: tab.content,
        isDirty: tab.isDirty ?? false,
        savedAt: new Date().toISOString(),
      };
      idb.putRecovery(entry).catch(() => {});
    }

    // Prune stale recovery entries for tabs that no longer exist
    const currentIds = new Set(snapTabs.map(t => t.id));
    idb.getAllRecovery()
      .then(all => {
        for (const e of all) {
          if (!currentIds.has(e.id)) idb.deleteRecovery(e.id).catch(() => {});
        }
      })
      .catch(() => {});
  }, 150));

  const saveAppStateRef = useRef(makeDebounced(async (
    tabId: string,
    connId: string,
    sidebarTab: string,
    sidebarIsOpen: boolean,
  ) => {
    Promise.all([
      idb.setUIState(SESSION_KEYS.activeTabId, tabId),
      idb.setUIState(SESSION_KEYS.activeConnectionId, connId),
      idb.setUIState(SESSION_KEYS.activeSidebarTab, sidebarTab),
      idb.setUIState(SESSION_KEYS.sidebarOpen, String(sidebarIsOpen)),
    ]).catch(() => {});
  }, 500));

  useEffect(() => { saveTabsRef.current(tabs); }, [tabs]);

  useEffect(() => {
    saveAppStateRef.current(activeTabId, activeConnectionId, activeSidebarTab, sidebarOpen);
  }, [activeTabId, activeConnectionId, activeSidebarTab, sidebarOpen]);
}
