/**
 * Shared wallet session preference for clawxlab.xyz ↔ app.clawxlab.xyz.
 * Cookie Domain=.clawxlab.xyz so a later landing→app redirect keeps the same wallet.
 * localStorage covers localhost / same-origin restores.
 */

export const WALLET_STORAGE_KEY = 'clawx.connectedWallet';
export const WALLET_DISCONNECTED_KEY = 'clawx.walletDisconnected';
export const WALLET_COOKIE_NAME = 'clawx_wallet';

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isClawxHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase();
  return host === 'clawxlab.xyz' || host.endsWith('.clawxlab.xyz');
}

function readCookie(name: string): string | null {
  if (!canUseDom()) return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) {
      const value = decodeURIComponent(rest.join('=') || '').trim();
      return value || null;
    }
  }
  return null;
}

function writeCookie(name: string, value: string | null) {
  if (!canUseDom()) return;
  const host = window.location.hostname;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (!value) {
    document.cookie = `${name}=; Path=/; Max-Age=0`;
    if (isClawxHost(host)) {
      document.cookie = `${name}=; Domain=.clawxlab.xyz; Path=/; Max-Age=0`;
    }
    return;
  }
  const encoded = encodeURIComponent(value);
  if (isClawxHost(host)) {
    document.cookie =
      `${name}=${encoded}; Domain=.clawxlab.xyz; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SEC}${secure}`;
  } else {
    document.cookie =
      `${name}=${encoded}; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SEC}${secure}`;
  }
}

export function getPersistedWallet(): string | null {
  if (!canUseDom()) return null;
  try {
    if (localStorage.getItem(WALLET_DISCONNECTED_KEY) === '1') return null;
  } catch { /* ignore */ }

  const fromCookie = readCookie(WALLET_COOKIE_NAME);
  if (fromCookie) return fromCookie;

  try {
    const fromStorage = localStorage.getItem(WALLET_STORAGE_KEY);
    return fromStorage || null;
  } catch {
    return null;
  }
}

export function persistConnectedWallet(address: string) {
  if (!canUseDom() || !address) return;
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, address);
    localStorage.removeItem(WALLET_DISCONNECTED_KEY);
  } catch { /* ignore */ }
  writeCookie(WALLET_COOKIE_NAME, address);
}

export function clearPersistedWallet() {
  if (!canUseDom()) return;
  try {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    localStorage.setItem(WALLET_DISCONNECTED_KEY, '1');
  } catch { /* ignore */ }
  writeCookie(WALLET_COOKIE_NAME, null);
}

export function pickPreferredAccount(accounts: string[], preferred: string | null): string | null {
  if (!accounts?.length) return null;
  if (preferred) {
    const match = accounts.find(
      (a) => a && a.toLowerCase() === preferred.toLowerCase()
    );
    if (match) return match;
  }
  return accounts[0] || null;
}
