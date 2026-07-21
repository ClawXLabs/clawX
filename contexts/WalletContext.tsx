import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../utils/contract';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WalletContextValue {
  account: string | null;
  provider: BrowserProvider | null;
  contract: Contract | null;
  connectWallet: () => Promise<string | null>;
  disconnectWallet: () => void;
  showConnectModal: boolean;
  setShowConnectModal: (show: boolean) => void;
  isRestoring: boolean;
}

interface WalletProviderProps {
  children: ReactNode;
}

// ─── MetaMask helper ──────────────────────────────────────────────────────────

type EthProvider = {
  isMetaMask?: boolean;
  providers?: EthProvider[];
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function getMetaMaskEthereum(): EthProvider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as { ethereum?: EthProvider }).ethereum;
  if (!eth) return null;
  const list = eth.providers;
  if (Array.isArray(list) && list.length > 0) {
    const mm = list.find((p) => p?.isMetaMask === true);
    if (mm) return mm;
  }
  if (eth.isMetaMask === true) return eth;
  return null;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: WalletProviderProps) {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);

  const [isRestoring, setIsRestoring] = useState<boolean>(true);

  // Auto-restore session on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setIsRestoring(false);
      return;
    }
    const eth = getMetaMaskEthereum();
    if (!eth) {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;
    const restore = async () => {
      try {
        const accounts = await eth.request({ method: 'eth_accounts' }) as string[];
        if (cancelled) return;
        if (accounts?.[0]) {
          const nextProvider = new ethers.BrowserProvider(eth as unknown as ethers.Eip1193Provider);
          const signer = await nextProvider.getSigner();
          const address = await signer.getAddress();
          const marketContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
          setAccount(address);
          setProvider(nextProvider);
          setContract(marketContract);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setIsRestoring(false);
      }
    };

    restore();
    return () => { cancelled = true; };
  }, []);

  // Connect
  const connectWallet = useCallback(async (): Promise<string | null> => {
    const eth = getMetaMaskEthereum();
    if (!eth) {
      const w = window as { ethereum?: EthProvider };
      if (w.ethereum && !w.ethereum.isMetaMask) {
        alert('MetaMask not detected. Disable other wallet extensions or install MetaMask.');
        return null;
      }
      alert('Please install MetaMask for this application.');
      return null;
    }

    try {
      await eth.request({ method: 'eth_requestAccounts' });
      const nextProvider = new ethers.BrowserProvider(eth as unknown as ethers.Eip1193Provider);
      const signer = await nextProvider.getSigner();
      const address = await signer.getAddress();
      const marketContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setAccount(address);
      setProvider(nextProvider);
      setContract(marketContract);
      setShowConnectModal(false);
      return address;
    } catch (error: unknown) {
      const err = error as { message?: string; shortMessage?: string };
      console.error('Wallet connect:', err);
      if (!err?.message?.includes('User rejected')) {
        alert('Connection failed: ' + (err.shortMessage || err.message || error));
      }
      return null;
    }
  }, []);

  // Disconnect
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setContract(null);
  }, []);

  // Account change listener
  useEffect(() => {
    const eth = getMetaMaskEthereum();
    if (!eth) return;
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      if (list && list.length > 0) {
        // Automatically switch account
        connectWallet();
      } else {
        setAccount(null);
        setContract(null);
        setProvider(null);
      }
    };
    eth.on?.('accountsChanged', onAccounts);
    return () => eth.removeListener?.('accountsChanged', onAccounts);
  }, [connectWallet]);

  const value = useMemo<WalletContextValue>(
    () => ({ account, provider, contract, connectWallet, disconnectWallet, showConnectModal, setShowConnectModal, isRestoring }),
    [account, provider, contract, connectWallet, disconnectWallet, showConnectModal, setShowConnectModal, isRestoring]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
