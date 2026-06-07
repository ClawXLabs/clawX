import { useAutoSettlement } from '../hooks/useAutoSettlement';

/** Runs auto-settlement when rounds expire — no UI. */
export default function AutoSettlementWatcher() {
  useAutoSettlement();
  return null;
}
