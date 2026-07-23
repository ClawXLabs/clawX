/**
 * Wallet-scoped browser cache (localStorage). Hydrate UI instantly, sync when fresh data arrives.
 */

export function cacheKey(namespace: string, wallet?: string | null): string {
  const w = wallet ? String(wallet).toLowerCase() : 'global';
  return `clawx:${namespace}:${w}`;
}

export function readBrowserCache<T>(namespace: string, wallet?: string | null): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(namespace, wallet));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeBrowserCache(namespace: string, data: unknown, wallet?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(cacheKey(namespace, wallet), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function clearBrowserCache(namespace: string, wallet?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (wallet) {
      localStorage.removeItem(cacheKey(namespace, wallet));
      return;
    }
    const prefix = `clawx:${namespace}:`;
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    });
  } catch {
    /* ignore */
  }
}
