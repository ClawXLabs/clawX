import { useEffect, useState } from 'react';
import { subscribeRealtimeMessages, subscribeRealtimeStatus } from '../utils/realtimeClient';

export interface StreamPrice {
  symbol: string;
  price: number;
  price8: string;
  updatedAt: number;
  sources?: Array<{ name: string; price?: number; error?: string }>;
}

export type StreamPrices = Record<string, StreamPrice>;

export function usePriceStream() {
  const [prices, setPrices] = useState<StreamPrices>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribeMessages = subscribeRealtimeMessages((message) => {
      if (message.type === 'prices' && message.data) {
        setPrices((current) => ({ ...current, ...message.data }));
      }
    });
    const unsubscribeStatus = subscribeRealtimeStatus((isConnected, nextError) => {
      setConnected(isConnected);
      setError(nextError);
    });
    return () => {
      unsubscribeMessages();
      unsubscribeStatus();
    };
  }, []);

  return { prices, connected, error };
}
