import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { idb } from '@/lib/db/indexeddb';
import type { WorkspaceRecoveryEntry } from '@/lib/db/types';
import type { QueryTab } from '@/lib/mock-data';

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

// ── Public restore API (called by initApp before first render) ─────────────

export async function restoreSessionFromIDB(): Promise<{
  tabs: QueryTab[];
  activeTabId: string;
  activeConnectionId: string;
  activeSidebarTab: string;
  sidebarOpen: boolean;
} | null> {
  try {
    const [tabsMetaEntry, activeTabEntry, activeConnEntry, sidebarTabEntry, sidebarOpenEntry] =
      await Promise.all([
        idb.getUIState(SESSION_KEYS.tabsMeta),
        idb.getUIState(SESSION_KEYS.activeTabId),
        idb.getUIState(SESSION_KEYS.activeConnectionId),
        idb.getUIState(SESSION_KEYS.activeSidebarTab),
        idb.getUIState(SESSION_KEYS.sidebarOpen),
      ]);

    if (!tabsMetaEntry?.value) return null;

    // Restore tab shell (id, title, type, connectionId) from the metadata blob
    type TabMeta = Omit<QueryTab, 'content' | 'isDirty'>;
    const metaList: TabMeta[] = JSON.parse(tabsMetaEntry.value);
    if (!metaList.length) return null;

    // Re-hydrate content from workspaceRecovery store (written per-keystroke)
    const recoveryEntries = await idb.getAllRecovery().catch(() => [] as WorkspaceRecoveryEntry[]);
    const byTabId = new Map(recoveryEntries.map(e => [e.id, e]));

    const tabs: QueryTab[] = metaList.map(meta => ({
      ...meta,
      content: byTabId.get(meta.id)?.content ?? '',
      isDirty: byTabId.get(meta.id)?.isDirty ?? false,
    }));

    return {
      tabs,
      activeTabId: activeTabEntry?.value ?? tabs[0]?.id ?? '',
      activeConnectionId: activeConnEntry?.value ?? '',
      activeSidebarTab: sidebarTabEntry?.value ?? 'explorer',
      sidebarOpen: sidebarOpenEntry?.value !== 'false',
    };
  } catch {
    return null;
  }
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
