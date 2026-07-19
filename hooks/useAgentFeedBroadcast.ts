import { useEffect, useMemo, useState } from 'react';
import { subscribeRealtimeMessages, subscribeRealtimeStatus } from '../utils/realtimeClient';

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
    let cancelled = false;
    fetch('/api/agents/feed')
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && Array.isArray(body.messages)) setMessages(body.messages.slice(0, limit));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load agent feed');
      });
    const unsubscribeMessages = subscribeRealtimeMessages((payload) => {
      if (payload.type !== 'feed' || !payload.data) return;
      const msg = payload.data as FeedMessage;
      setMessages((previous) => {
        if (previous.some((message) => message.id === msg.id)) return previous;
        return [msg, ...previous].slice(0, limit);
      });
    });
    const unsubscribeStatus = subscribeRealtimeStatus((isConnected, nextError) => {
      setConnected(isConnected);
      setError(nextError);
    });

    return () => {
      cancelled = true;
      unsubscribeMessages();
      unsubscribeStatus();
    };
  }, [limit]);

  const filtered = useMemo(() => {
    if (!agentId) return messages;
    return messages.filter((m) => m.agentId === agentId);
  }, [messages, agentId]);

  return { messages: filtered, connected, error };
}
