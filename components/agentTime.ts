export function formatDistanceToNow(unixSeconds: number | string | undefined): string {
  if (!unixSeconds) return 'just now';
  const ts   = typeof unixSeconds === 'string' ? parseFloat(unixSeconds) : unixSeconds;
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
