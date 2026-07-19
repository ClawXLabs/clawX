import { query } from '../db/postgres.js';
import { decryptSecret, encryptSecret, maskSecret } from '../security/encryption.js';

export async function getUserSettings(wallet, { includeKey = false } = {}) {
  const result = await query('SELECT * FROM user_settings WHERE wallet = $1', [wallet.toLowerCase()]);
  const row = result.rows[0];
  if (!row) return null;
  const apiKey = includeKey && row.llm_api_key_enc ? decryptSecret(row.llm_api_key_enc) : null;
  return {
    wallet: row.wallet,
    provider: row.llm_provider,
    model: row.llm_model,
    baseUrl: row.llm_base_url,
    cooldownSec: Number(row.llm_cooldown_sec),
    keyVerified: Boolean(row.key_verified),
    keyMasked: row.llm_api_key_enc ? maskSecret(decryptSecret(row.llm_api_key_enc)) : null,
    updatedAt: new Date(row.updated_at).getTime(),
    ...(includeKey ? { apiKey } : {}),
  };
}

export async function saveUserSettings(wallet, settings) {
  const encryptedKey = encryptSecret(settings.apiKey);
  const result = await query(
    `INSERT INTO user_settings (
       wallet, llm_provider, llm_api_key_enc, llm_model, llm_base_url,
       llm_cooldown_sec, key_verified, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (wallet) DO UPDATE SET
       llm_provider=EXCLUDED.llm_provider,
       llm_api_key_enc=EXCLUDED.llm_api_key_enc,
       llm_model=EXCLUDED.llm_model,
       llm_base_url=EXCLUDED.llm_base_url,
       llm_cooldown_sec=EXCLUDED.llm_cooldown_sec,
       key_verified=EXCLUDED.key_verified,
       updated_at=NOW()
     RETURNING *`,
    [
      wallet.toLowerCase(),
      settings.provider,
      encryptedKey,
      settings.model,
      settings.baseUrl,
      settings.cooldownSec,
      Boolean(settings.keyVerified),
    ]
  );
  return {
    wallet: result.rows[0].wallet,
    provider: result.rows[0].llm_provider,
    model: result.rows[0].llm_model,
    baseUrl: result.rows[0].llm_base_url,
    cooldownSec: Number(result.rows[0].llm_cooldown_sec),
    keyVerified: Boolean(result.rows[0].key_verified),
    keyMasked: maskSecret(settings.apiKey),
    updatedAt: new Date(result.rows[0].updated_at).getTime(),
  };
}
