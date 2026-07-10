// ============================================================================
// Valstine Studio — Sync Engine (Export / Import)
// ============================================================================
// JSON-based transfer format lets users move Desktop ↔ Web settings.
// Passwords are re-encrypted with a one-time transport key derived from a
// user-supplied passphrase so the export file is safe at rest.
// ============================================================================

import { idb } from './indexeddb';
import {
  type SyncPayload,
  type StoredConnection,
  type SSHTunnel,
  type Tag,
  type ConnectionTag,
  type Favorite,
  type Snippet,
} from './types';
import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  computeVerifyHash,
  type EncryptedBlob,
} from './encryption';

const SYNC_VERSION = 1;

// ── Export ────────────────────────────────────────────────────────────────

export interface ExportOptions {
  /** Passphrase to protect the export file */
  transportPassphrase: string;
  /** Current vault key to decrypt passwords before re-encrypting */
  vaultKey: CryptoKey;
  /** Only export connections NOT marked local-only */
  excludeLocalOnly?: boolean;
}

export async function exportProfile(opts: ExportOptions): Promise<string> {
  const {
    transportPassphrase,
    vaultKey,
    excludeLocalOnly = true,
  } = opts;

  // Derive a transport key from the passphrase
  const salt = await generateSalt();
  const transportKey = await deriveKey(transportPassphrase, salt, 100_000);
  const transportKeyHash = await computeVerifyHash(transportKey);

  // Gather data
  let connections = await idb.getAllConnections();
  if (excludeLocalOnly) {
    connections = connections.filter((c) => !c.isLocalOnly);
  }

  // Re-encrypt passwords with transport key
  const reEncrypted: StoredConnection[] = await Promise.all(
    connections.map(async (conn) => {
      if (conn.passwordEnc && conn.passwordIv) {
        try {
          const plain = await decrypt(
            { ciphertext: conn.passwordEnc, iv: conn.passwordIv },
            vaultKey,
          );
          const blob = await encrypt(plain, transportKey);
          return { ...conn, passwordEnc: blob.ciphertext, passwordIv: blob.iv };
        } catch {
          // If decryption fails, strip the password
          return { ...conn, passwordEnc: undefined, passwordIv: undefined };
        }
      }
      return conn;
    }),
  );

  const tunnels = await idb.getAllSSHTunnels();
  const tags = await idb.getAllTags();
  const connectionTags = await idb.getAllConnectionTags();
  const favorites = await idb.getAllFavorites();
  const snippets = await idb.getAllSnippets();

  const payload: SyncPayload = {
    version: SYNC_VERSION,
    exportedAt: new Date().toISOString(),
    platform: isElectron() ? 'desktop' : 'web',
    connections: reEncrypted,
    sshTunnels: tunnels,
    tags,
    connectionTags,
    favorites,
    snippets,
    transportKeyHash,
  };

  // Encode salt into the payload header so the importer can derive the key
  return JSON.stringify({ salt: btoa(String.fromCharCode(...salt)), payload });
}

// ── Import ───────────────────────────────────────────────────────────────

export interface ImportOptions {
  /** The raw JSON string from the export file */
  json: string;
  /** Passphrase the user entered to unlock the export */
  transportPassphrase: string;
  /** Current vault key to re-encrypt passwords for local storage */
  vaultKey: CryptoKey;
  /** Merge strategy: 'replace' clears existing, 'merge' keeps both */
  strategy: 'replace' | 'merge';
}

export async function importProfile(opts: ImportOptions): Promise<{ imported: number }> {
  const { json, transportPassphrase, vaultKey, strategy } = opts;
  const parsed = JSON.parse(json);
  const salt = Uint8Array.from(atob(parsed.salt), (c) => c.charCodeAt(0));
  const payload: SyncPayload = parsed.payload;

  if (payload.version > SYNC_VERSION) {
    throw new Error(`Unsupported sync version ${payload.version}. Please update Valstine Studio.`);
  }

  // Derive the transport key
  const transportKey = await deriveKey(transportPassphrase, salt, 100_000);
  const hash = await computeVerifyHash(transportKey);
  if (hash !== payload.transportKeyHash) {
    throw new Error('Incorrect passphrase. Cannot decrypt the export file.');
  }

  // Re-encrypt passwords with local vault key
  const localConnections: StoredConnection[] = await Promise.all(
    payload.connections.map(async (conn) => {
      if (conn.passwordEnc && conn.passwordIv) {
        try {
          const plain = await decrypt(
            { ciphertext: conn.passwordEnc, iv: conn.passwordIv },
            transportKey,
          );
          const blob = await encrypt(plain, vaultKey);
          return { ...conn, passwordEnc: blob.ciphertext, passwordIv: blob.iv };
        } catch {
          return { ...conn, passwordEnc: undefined, passwordIv: undefined };
        }
      }
      return conn;
    }),
  );

  // Write to IndexedDB
  if (strategy === 'replace') {
    // Clear existing before import
    await Promise.all(
      localConnections.map((c) => idb.deleteConnection(c.id)),
    );
  }

  let imported = 0;
  for (const conn of localConnections) {
    await idb.putConnection(conn);
    imported++;
  }
  for (const t of payload.sshTunnels) await idb.putSSHTunnel(t);
  for (const t of payload.tags) await idb.putTag(t);
  for (const ct of payload.connectionTags) await idb.putConnectionTag(ct);
  for (const f of payload.favorites) await idb.putFavorite(f);
  for (const s of payload.snippets) await idb.putSnippet(s);

  return { imported };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
}
