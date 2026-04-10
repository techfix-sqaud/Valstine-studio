// ============================================================================
// Valstine Studio — Unified TypeScript Interfaces
// Shared between SQLite (desktop) and IndexedDB (web) storage layers
// ============================================================================

// ── Connection & SSH ─────────────────────────────────────────────────────

export type DBType = 'pg' | 'mysql' | 'sqlite' | 'mssql';

export interface StoredConnection {
  id: string;
  name: string;
  dbType: DBType;
  host?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  /** AES-256-GCM encrypted, base64 encoded */
  passwordEnc?: string;
  /** AES initialisation vector, base64 */
  passwordIv?: string;
  filename?: string;       // SQLite file path
  sslEnabled: boolean;
  sslCa?: string;
  sslCert?: string;
  sslKey?: string;
  color?: string;
  sortOrder: number;
  isLocalOnly: boolean;    // never sync to web profile
  createdAt: string;       // ISO-8601
  updatedAt: string;
}

export interface SSHTunnel {
  id: string;
  connectionId: string;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  authMethod: 'password' | 'key';
  sshPasswordEnc?: string;
  sshPasswordIv?: string;
  privateKeyPath?: string;
  passphraseEnc?: string;
  passphraseIv?: string;
  localPort?: number;
  createdAt: string;
}

// ── Favorites & Tags ─────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface ConnectionTag {
  connectionId: string;
  tagId: string;
}

export interface Favorite {
  id: string;
  connectionId: string;
  label?: string;
  pinnedAt: string;
}

// ── Snippets ─────────────────────────────────────────────────────────────

export interface Snippet {
  id: string;
  title: string;
  description?: string;
  sqlText: string;
  language: string;
  connectionId?: string;
  tags: string[];          // tag ids
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Master Password / Vault ──────────────────────────────────────────────

export interface VaultConfig {
  kdfSalt: string;         // base64
  kdfIterations: number;
  verifyHash: string;      // SHA-256 hex of derived key
  createdAt: string;
}

// ── Time-Travel Query Log ────────────────────────────────────────────────

export interface SchemaSnapshot {
  id: string;
  connectionId: string;
  databaseName: string;
  snapshotJson: string;    // full schema serialised
  checksum: string;        // SHA-256 of snapshotJson
  capturedAt: string;
}

export interface QuerySnapshot {
  id: string;
  connectionId: string;
  connectionName: string;
  databaseName: string;
  sqlText: string;
  status: 'success' | 'error';
  errorMessage?: string;
  executionTimeMs: number;
  rowCount: number;
  resultSample?: string;   // first N rows JSON
  schemaSnapshotId?: string;
  executedAt: string;
}

// ── Workspace Recovery ───────────────────────────────────────────────────

export interface WorkspaceRecoveryEntry {
  id: string;              // matches tab id
  tabTitle: string;
  connectionId?: string;
  content: string;
  cursorLine?: number;
  cursorColumn?: number;
  scrollTop?: number;
  isDirty: boolean;
  savedAt: string;
}

// ── UI State ─────────────────────────────────────────────────────────────

export interface UIStateEntry {
  key: string;
  value: string;           // JSON-encoded
  updatedAt: string;
}

// ── Sync Export / Import Schema ──────────────────────────────────────────

export interface SyncPayload {
  version: number;         // schema version for forward compat
  exportedAt: string;
  platform: 'desktop' | 'web';
  connections: StoredConnection[];
  sshTunnels: SSHTunnel[];
  tags: Tag[];
  connectionTags: ConnectionTag[];
  favorites: Favorite[];
  snippets: Snippet[];
  /** Passwords are re-encrypted with a transport key before export */
  transportKeyHash?: string;
}

// ── IndexedDB Store Names ────────────────────────────────────────────────

export const IDB_STORES = {
  connections: 'connections',
  sshTunnels: 'sshTunnels',
  tags: 'tags',
  connectionTags: 'connectionTags',
  favorites: 'favorites',
  snippets: 'snippets',
  vaultConfig: 'vaultConfig',
  schemaSnapshots: 'schemaSnapshots',
  querySnapshots: 'querySnapshots',
  workspaceRecovery: 'workspaceRecovery',
  uiState: 'uiState',
} as const;

export const IDB_NAME = 'valstine-studio';
export const IDB_VERSION = 1;
