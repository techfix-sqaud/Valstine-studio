// ============================================================================
// Valstine Studio — IndexedDB Storage Layer (Web)
// ============================================================================
// Provides the same storage interface as the SQLite desktop layer but backed
// by IndexedDB for the browser version.
// ============================================================================

import {
  IDB_NAME,
  IDB_VERSION,
  IDB_STORES,
  type StoredConnection,
  type SSHTunnel,
  type Tag,
  type ConnectionTag,
  type Favorite,
  type Snippet,
  type VaultConfig,
  type SchemaSnapshot,
  type QuerySnapshot,
  type WorkspaceRecoveryEntry,
  type UIStateEntry,
} from './types';

// ── Open / Upgrade ───────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // connections
      if (!db.objectStoreNames.contains(IDB_STORES.connections)) {
        const s = db.createObjectStore(IDB_STORES.connections, { keyPath: 'id' });
        s.createIndex('byName', 'name', { unique: false });
        s.createIndex('byType', 'dbType', { unique: false });
      }

      // SSH tunnels
      if (!db.objectStoreNames.contains(IDB_STORES.sshTunnels)) {
        const s = db.createObjectStore(IDB_STORES.sshTunnels, { keyPath: 'id' });
        s.createIndex('byConnection', 'connectionId', { unique: false });
      }

      // tags
      if (!db.objectStoreNames.contains(IDB_STORES.tags)) {
        db.createObjectStore(IDB_STORES.tags, { keyPath: 'id' });
      }

      // connection_tags (composite key)
      if (!db.objectStoreNames.contains(IDB_STORES.connectionTags)) {
        const s = db.createObjectStore(IDB_STORES.connectionTags, { keyPath: ['connectionId', 'tagId'] });
        s.createIndex('byConnection', 'connectionId', { unique: false });
        s.createIndex('byTag', 'tagId', { unique: false });
      }

      // favorites
      if (!db.objectStoreNames.contains(IDB_STORES.favorites)) {
        const s = db.createObjectStore(IDB_STORES.favorites, { keyPath: 'id' });
        s.createIndex('byConnection', 'connectionId', { unique: false });
      }

      // snippets
      if (!db.objectStoreNames.contains(IDB_STORES.snippets)) {
        const s = db.createObjectStore(IDB_STORES.snippets, { keyPath: 'id' });
        s.createIndex('byConnection', 'connectionId', { unique: false });
      }

      // vault config (single-row)
      if (!db.objectStoreNames.contains(IDB_STORES.vaultConfig)) {
        db.createObjectStore(IDB_STORES.vaultConfig, { keyPath: 'id' });
      }

      // schema snapshots
      if (!db.objectStoreNames.contains(IDB_STORES.schemaSnapshots)) {
        const s = db.createObjectStore(IDB_STORES.schemaSnapshots, { keyPath: 'id' });
        s.createIndex('byConnection', 'connectionId', { unique: false });
        s.createIndex('byChecksum', ['connectionId', 'databaseName', 'checksum'], { unique: true });
      }

      // query snapshots
      if (!db.objectStoreNames.contains(IDB_STORES.querySnapshots)) {
        const s = db.createObjectStore(IDB_STORES.querySnapshots, { keyPath: 'id' });
        s.createIndex('byConnection', 'connectionId', { unique: false });
        s.createIndex('byDate', 'executedAt', { unique: false });
      }

      // workspace recovery
      if (!db.objectStoreNames.contains(IDB_STORES.workspaceRecovery)) {
        db.createObjectStore(IDB_STORES.workspaceRecovery, { keyPath: 'id' });
      }

      // UI state
      if (!db.objectStoreNames.contains(IDB_STORES.uiState)) {
        db.createObjectStore(IDB_STORES.uiState, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Generic CRUD helpers ─────────────────────────────────────────────────

async function put<T>(store: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as T[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function del(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function clear(store: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ── Public API ───────────────────────────────────────────────────────────

export const idb = {
  // Connections
  putConnection: (c: StoredConnection) => put(IDB_STORES.connections, c),
  getConnection: (id: string) => get<StoredConnection>(IDB_STORES.connections, id),
  getAllConnections: () => getAll<StoredConnection>(IDB_STORES.connections),
  deleteConnection: (id: string) => del(IDB_STORES.connections, id),

  // SSH Tunnels
  putSSHTunnel: (t: SSHTunnel) => put(IDB_STORES.sshTunnels, t),
  getSSHTunnel: (id: string) => get<SSHTunnel>(IDB_STORES.sshTunnels, id),
  getAllSSHTunnels: () => getAll<SSHTunnel>(IDB_STORES.sshTunnels),
  deleteSSHTunnel: (id: string) => del(IDB_STORES.sshTunnels, id),

  // Tags
  putTag: (t: Tag) => put(IDB_STORES.tags, t),
  getAllTags: () => getAll<Tag>(IDB_STORES.tags),
  deleteTag: (id: string) => del(IDB_STORES.tags, id),

  // Connection ↔ Tag
  putConnectionTag: (ct: ConnectionTag) => put(IDB_STORES.connectionTags, ct),
  getAllConnectionTags: () => getAll<ConnectionTag>(IDB_STORES.connectionTags),
  deleteConnectionTag: (connId: string, tagId: string) => del(IDB_STORES.connectionTags, [connId, tagId]),

  // Favorites
  putFavorite: (f: Favorite) => put(IDB_STORES.favorites, f),
  getAllFavorites: () => getAll<Favorite>(IDB_STORES.favorites),
  deleteFavorite: (id: string) => del(IDB_STORES.favorites, id),

  // Snippets
  putSnippet: (s: Snippet) => put(IDB_STORES.snippets, s),
  getSnippet: (id: string) => get<Snippet>(IDB_STORES.snippets, id),
  getAllSnippets: () => getAll<Snippet>(IDB_STORES.snippets),
  deleteSnippet: (id: string) => del(IDB_STORES.snippets, id),

  // Vault
  getVaultConfig: () => get<VaultConfig & { id: number }>(IDB_STORES.vaultConfig, 1),
  setVaultConfig: (v: VaultConfig) => put(IDB_STORES.vaultConfig, { id: 1, ...v }),

  // Schema Snapshots
  putSchemaSnapshot: (s: SchemaSnapshot) => put(IDB_STORES.schemaSnapshots, s),
  getSchemaSnapshot: (id: string) => get<SchemaSnapshot>(IDB_STORES.schemaSnapshots, id),
  getAllSchemaSnapshots: () => getAll<SchemaSnapshot>(IDB_STORES.schemaSnapshots),

  // Query Snapshots (Time-Travel)
  putQuerySnapshot: (q: QuerySnapshot) => put(IDB_STORES.querySnapshots, q),
  getQuerySnapshot: (id: string) => get<QuerySnapshot>(IDB_STORES.querySnapshots, id),
  getAllQuerySnapshots: () => getAll<QuerySnapshot>(IDB_STORES.querySnapshots),
  clearQuerySnapshots: () => clear(IDB_STORES.querySnapshots),

  // Workspace Recovery
  putRecovery: (r: WorkspaceRecoveryEntry) => put(IDB_STORES.workspaceRecovery, r),
  getRecovery: (id: string) => get<WorkspaceRecoveryEntry>(IDB_STORES.workspaceRecovery, id),
  getAllRecovery: () => getAll<WorkspaceRecoveryEntry>(IDB_STORES.workspaceRecovery),
  deleteRecovery: (id: string) => del(IDB_STORES.workspaceRecovery, id),
  clearRecovery: () => clear(IDB_STORES.workspaceRecovery),

  // UI State
  getUIState: (key: string) => get<UIStateEntry>(IDB_STORES.uiState, key),
  setUIState: (key: string, value: string) =>
    put<UIStateEntry>(IDB_STORES.uiState, { key, value, updatedAt: new Date().toISOString() }),
  getAllUIState: () => getAll<UIStateEntry>(IDB_STORES.uiState),
};
