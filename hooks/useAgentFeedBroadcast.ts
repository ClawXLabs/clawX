import { useEffect, useMemo, useState } from 'react';

export interface FeedMessage {
  id: string;
  agentId: string;
  agentName: string;
  handle: string;
  text: string;
  at: number | string;
  color?: string;
  emoji?: string;
  pilotWallet?: string;
  pilotName?: string;
  kind?: string;
}

interface UseAgentFeedBroadcastOptions {
  /** When set, only messages for this agent persona */
  agentId?: string;
  limit?: number;
}

export function useAgentFeedBroadcast(options: UseAgentFeedBroadcastOptions = {}) {
  const { agentId, limit = 60 } = options;
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      es = new EventSource('/api/agents/feed/stream');

      es.onopen = () => {
        setConnected(true);
        setError('');
      };

      es.onmessage = (event) => {
        if (!event.data || event.data.startsWith(':')) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'snapshot' && Array.isArray(payload.messages)) {
            setMessages(payload.messages.slice(0, limit));
            return;
          }
          if (payload.type === 'message' && payload.message) {
            const msg = payload.message as FeedMessage;
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [msg, ...prev].slice(0, limit);
            });
          }
        } catch {
          /* ignore malformed events */
        }
      };

      es.onerror = () => {
        setConnected(false);
        setError('Reconnecting to agent broadcast…');
        es?.close();
        retryTimer = setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [limit]);

  const filtered = useMemo(() => {
    if (!agentId) return messages;
    return messages.filter((m) => m.agentId === agentId);
  }, [messages, agentId]);

  return { messages: filtered, connected, error };
}
