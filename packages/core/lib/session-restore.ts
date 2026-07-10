import { idb } from './db/indexeddb';
import type { WorkspaceRecoveryEntry } from './db/types';
import type { QueryTab } from './mock-data';

const SESSION_KEYS = {
  activeTabId: 'session:activeTabId',
  activeConnectionId: 'session:activeConnectionId',
  tabsMeta: 'session:tabsMeta',
  activeSidebarTab: 'session:activeSidebarTab',
  sidebarOpen: 'session:sidebarOpen',
} as const;

// Called by initApp() before first render — restores tabs/connection/sidebar
// state saved by useSessionPersistence() (apps/studio/src/hooks).
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
