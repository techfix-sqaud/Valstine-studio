import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM, keyed by a per-runtime master key (Electron: per-OS-user key file
// under app.getPath('userData'); server: per-DATA_DIR key file). Both runtimes
// used to carry byte-identical copies of this logic — unified here.

export function encrypt(plaintext: string, key: Buffer): string {
  if (!plaintext) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(stored: string, key: Buffer): string {
  if (!stored) return '';
  if (!stored.startsWith('enc:')) return stored; // legacy plaintext passthrough
  const parts = stored.split(':');
  if (parts.length !== 4) return '';
  const [, ivHex, tagHex, ctHex] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ct = Buffer.from(ctHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct).toString('utf8') + decipher.final('utf8');
  } catch {
    return '';
  }
}
