// ============================================================================
// Valstine Studio — AES-256-GCM Encryption Service
// ============================================================================
// Provides a unified API with different backends:
//   • Web: Web Crypto API (SubtleCrypto)
//   • Desktop: delegates to Electron main process via IPC which uses the
//     system keychain (macOS Keychain / Windows Credential Manager / libsecret)
// ============================================================================

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV for GCM
const KDF_ITERATIONS = 600_000;
const SALT_LENGTH = 32;

// ── Helpers ──────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Key Derivation (PBKDF2) ─────────────────────────────────────────────

export async function deriveKey(
  masterPassword: string,
  salt: Uint8Array,
  iterations = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    baseKey,
    { name: ALGO, length: KEY_LENGTH },
    true, // extractable for verify hash
    ['encrypt', 'decrypt'],
  );
}

export async function generateSalt(): Promise<Uint8Array> {
  return randomBytes(SALT_LENGTH);
}

/** Hash the raw key bytes so we can verify unlock without storing the key. */
export async function computeVerifyHash(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return sha256Hex(raw);
}

// ── Encrypt / Decrypt ────────────────────────────────────────────────────

export interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string;         // base64
}

export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedBlob> {
  const enc = new TextEncoder();
  const iv = randomBytes(IV_LENGTH);
  const ct = await crypto.subtle.encrypt(
    { name: ALGO, iv: iv.buffer as ArrayBuffer },
    key,
    enc.encode(plaintext),
  );
  return { ciphertext: toBase64(ct), iv: toBase64(iv.buffer as ArrayBuffer) };
}

export async function decrypt(
  blob: EncryptedBlob,
  key: CryptoKey,
): Promise<string> {
  const ct = fromBase64(blob.ciphertext);
  const iv = fromBase64(blob.iv);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct);
  return new TextDecoder().decode(plain);
}

// ── Master Password Setup & Unlock ───────────────────────────────────────

export interface VaultSetupResult {
  salt: string;          // base64
  iterations: number;
  verifyHash: string;    // hex
}

/** First-time vault setup: derive key, return salt + verify hash to store. */
export async function setupMasterPassword(
  masterPassword: string,
): Promise<{ key: CryptoKey; vault: VaultSetupResult }> {
  const salt = await generateSalt();
  const key = await deriveKey(masterPassword, salt, KDF_ITERATIONS);
  const verifyHash = await computeVerifyHash(key);
  return {
    key,
    vault: {
      salt: toBase64(salt),
      iterations: KDF_ITERATIONS,
      verifyHash,
    },
  };
}

/** Unlock existing vault: derive key and verify against stored hash. */
export async function unlockVault(
  masterPassword: string,
  salt: string,
  iterations: number,
  expectedHash: string,
): Promise<CryptoKey | null> {
  const key = await deriveKey(masterPassword, new Uint8Array(fromBase64(salt)), iterations);
  const hash = await computeVerifyHash(key);
  return hash === expectedHash ? key : null;
}

// ── Desktop Keychain Integration (Electron IPC) ─────────────────────────
// On desktop the derived encryption key is stored in the OS keychain so
// the user doesn't have to re-enter the master password every launch.

const isElectron =
  typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;

export async function storeKeyInKeychain(raw: ArrayBuffer): Promise<void> {
  if (!isElectron) return; // web: no keychain, key lives only in memory
  const b64 = toBase64(raw);
  await (window as any).electronAPI.keychainSet('valstine-studio-vault-key', b64);
}

export async function loadKeyFromKeychain(): Promise<CryptoKey | null> {
  if (!isElectron) return null;
  const b64: string | null = await (window as any).electronAPI.keychainGet(
    'valstine-studio-vault-key',
  );
  if (!b64) return null;
  const raw = fromBase64(b64);
  return crypto.subtle.importKey('raw', raw, { name: ALGO, length: KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function clearKeychain(): Promise<void> {
  if (!isElectron) return;
  await (window as any).electronAPI.keychainDelete('valstine-studio-vault-key');
}
