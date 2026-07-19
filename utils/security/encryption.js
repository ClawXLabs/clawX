import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encryptionKey() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY || '';
  let key;
  if (/^[a-fA-F0-9]{64}$/.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      key = null;
    }
  }
  if (!key || key.length !== 32) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must be a 32-byte base64 value or 64 hex characters');
  }
  return key;
}

export function encryptSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(payload) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(payload || '').split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Unsupported encrypted secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskSecret(secret) {
  const value = String(secret || '');
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}
