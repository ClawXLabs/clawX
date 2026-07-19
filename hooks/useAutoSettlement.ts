import { useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useMarketData, refreshMarketData, hasExpiredMarkets } from '../contexts/MarketDataContext';
import { FUJI_RPC_PUBLIC } from '../utils/contract';

const SETTLE_CONFIRM_MS = 5000;
const SETTLE_RECEIPT_POLL_MS = 150;
const SETTLE_API_RETRY_MS = 350;
const SETTLE_API_MAX_MS = 6000;
const SETTLE_KEEPER_WAIT_MS = 2500;
const EXPIRED_REFRESH_MS = 450;
const SETTLE_FIRE_DELAY_MS = 0;

type SettleResult = {
  settled?: boolean;
  submitted?: boolean;
  hash?: string;
  expired?: unknown[];
};

async function requestSettlement(): Promise<SettleResult> {
  const started = Date.now();
  let lastResult: SettleResult | null = null;

  while (Date.now() - started < SETTLE_API_MAX_MS) {
    let response: Response;
    let result: SettleResult;
    try {
      response = await fetch('/api/settle', { method: 'POST', cache: 'no-store' });
      result = await response.json();
    } catch {
      return { settled: false, submitted: false, expired: [] };
    }
    if (!response.ok) {
      lastResult = result;
      break;
    }
    lastResult = result;
    if (result.settled) return result;
    if (result.submitted && result.hash) return result;
    if (Array.isArray(result.expired) && result.expired.length === 0) return result;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_API_RETRY_MS));
  }

  return lastResult || { settled: false, submitted: false, expired: [] };
}

async function waitForSettlementReceipt(hash: string): Promise<boolean> {
  if (!hash) return false;
  const provider = new ethers.JsonRpcProvider(FUJI_RPC_PUBLIC);
  const deadline = Date.now() + SETTLE_CONFIRM_MS;
  while (Date.now() < deadline) {
    try {
      const receipt = await provider.getTransactionReceipt(hash);
      if (receipt) {
        const status = Number(receipt.status);
        if (status === 1) return true;
        if (status === 0) return false;
      }
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, SETTLE_RECEIPT_POLL_MS));
  }
  return false;
}

async function waitForKeeperSettlement(maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await refreshMarketData();
    if (!hasExpiredMarkets()) return true;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_API_RETRY_MS));
  }
  return false;
}

/** Auto-settle expired rounds when timer hits 0 (same flow as Agentic Avax). */
export function useAutoSettlement() {
  const { markets, ready } = useMarketData();
  const settleInFlightRef = useRef(false);
  const submittedKeyRef = useRef('');
  const lastAutoSettleAtRef = useRef(0);

  const expiredList = Object.values(markets).filter(
    (m) => !m.resolved && m.endTime <= Math.floor(Date.now() / 1000)
  );
  const expiredMarketKey = expiredList.map((m) => m.roundId).join('-');

  useEffect(() => {
    if (!ready || expiredList.length === 0) return undefined;
    const stuck =
      submittedKeyRef.current === expiredMarketKey &&
      Date.now() - lastAutoSettleAtRef.current > 12000;
    if (submittedKeyRef.current === expiredMarketKey && !stuck) return undefined;

    lastAutoSettleAtRef.current = Date.now();
    const delay = setTimeout(() => {
      if (settleInFlightRef.current) return;
      settleInFlightRef.current = true;

      (async () => {
        try {
          let settled = await waitForKeeperSettlement(SETTLE_KEEPER_WAIT_MS);

          if (!settled) {
            const result = await requestSettlement();
            const alreadyDone =
              !result.submitted &&
              !result.settled &&
              Array.isArray(result.expired) &&
              result.expired.length === 0;
            if (alreadyDone || result.settled) {
              settled = true;
            } else if (result.submitted && result.hash) {
              settled =
                (await waitForSettlementReceipt(result.hash)) ||
                (await waitForKeeperSettlement(4000));
            } else {
              settled = await waitForKeeperSettlement(4000);
            }
          }

          await refreshMarketData();
          if (!hasExpiredMarkets()) settled = true;

          submittedKeyRef.current = settled ? expiredMarketKey : '';
          if (!settled) {
            setTimeout(() => {
              submittedKeyRef.current = '';
              refreshMarketData();
            }, 6000);
          }
        } catch (error) {
          console.error('Auto-settlement failed:', error);
          submittedKeyRef.current = '';
        } finally {
          settleInFlightRef.current = false;
        }
      })();
    }, SETTLE_FIRE_DELAY_MS);

    return () => clearTimeout(delay);
  }, [ready, expiredMarketKey, expiredList.length]);

  useEffect(() => {
    if (!expiredMarketKey) submittedKeyRef.current = '';
  }, [expiredMarketKey]);

  useEffect(() => {
    if (!ready || !expiredMarketKey) return undefined;
    let active = true;
    const poll = async () => {
      if (!active || settleInFlightRef.current) return;
      await refreshMarketData();
      if (!hasExpiredMarkets()) submittedKeyRef.current = '';
    };
    poll();
    const id = setInterval(poll, EXPIRED_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [ready, expiredMarketKey]);

}
