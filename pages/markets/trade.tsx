import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppShell from '../../components/AppShell';
import TradingChartv2 from '../../components/TradingChartv2';
import { useMarket, useMarketHistory, useMarketData } from '../../contexts/MarketDataContext';
import { useWallet } from '../../contexts/WalletContext';
import { signErc2612Permit } from '../../utils/tradePermit';
import { buildTradeAuthMessage } from '../../utils/tradeAuth';
import { relayClaimWinnings } from '../../utils/relayClaim';
import { CONTRACT_ADDRESS, TUSDC_ADDRESS, ERC20_ABI } from '../../utils/contract';
import { ethers } from 'ethers';
import TradingChart from '../../components/TradingChart';
import { ActiveMarketsPanel, RoundHistoryPanel } from '../../components/TradeSidePanels';
import TradeTicketPanel from '../../components/TradeTicketPanel';

const MONO: React.CSSProperties = { fontFamily: '"Courier New", Courier, monospace' };
const FUJI_CHAIN_ID_HEX = '0xa869';

async function ensureFujiNetwork(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const eth = (window as any).ethereum;
  if (!eth) return false;
  try {
    const chainId = await eth.request({ method: 'eth_chainId' }) as string;
    if (Number(chainId) === 43113) return true;
  } catch {}
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: FUJI_CHAIN_ID_HEX }] });
    return true;
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      try {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: FUJI_CHAIN_ID_HEX,
            chainName: 'Avalanche Fuji C-Chain',
            nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
            rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
            blockExplorerUrls: ['https://testnet.snowtrace.io'],
          }],
        });
        return true;
      } catch {}
    }
  }
  return false;
}

export default function MarketsTradePage() {
  const router = useRouter();
  const { ready, error } = useMarketData();
  const { account, provider, contract, connectWallet } = useWallet();

  const raw = router.isReady ? router.query.asset : undefined;
  const parsed = raw !== undefined ? Number(Array.isArray(raw) ? raw[0] : raw) : NaN;
  const assetId = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;

  const market = useMarket(assetId);
  const history = useMarketHistory(assetId);

  // Archive and interactive previous rounds state
  const [selectedHistoryRound, setSelectedHistoryRound] = useState<any | null>(null);

  // Clear archive view when active asset changes
  useEffect(() => {
    setSelectedHistoryRound(null);
  }, [assetId]);

  const handleTakePosition = async (id: number, isUp: boolean, amount: string) => {
    let activeAccount = account;
    if (!activeAccount) {
      activeAccount = await connectWallet();
      if (!activeAccount) {
        alert("Please connect your MetaMask wallet to place a position.");
        return;
      }
    }

    const success = await ensureFujiNetwork();
    if (!success) {
      alert("Please switch your wallet to Avalanche Fuji C-Chain to trade.");
      return;
    }

    if (!market) {
      alert("Market info is not loaded.");
      return;
    }

    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No web3 provider detected");
      const activeProvider = new ethers.BrowserProvider(eth);
      const signer = await activeProvider.getSigner();
      const amountRaw = ethers.parseUnits(amount, 6); // TUSDC has 6 decimals

      // Check allowance using fresh provider
      const token = new ethers.Contract(TUSDC_ADDRESS, ERC20_ABI, activeProvider);
      const allowance: bigint = await token.allowance(activeAccount, CONTRACT_ADDRESS);
      
      let permit = null;
      if (allowance < amountRaw) {
        // Sign permit for 100,000 TUSDC so we don't have to permit again
        const permitAmount = ethers.parseUnits("100000", 6);
        const network = await activeProvider.getNetwork();
        const chainId = Number(network.chainId);
        permit = await signErc2612Permit(signer, TUSDC_ADDRESS, CONTRACT_ADDRESS, permitAmount, chainId);
      }

      // Generate a unique nonce
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 mins

      const network = await activeProvider.getNetwork();
      const chainId = Number(network.chainId);

      // Build trade auth message
      const authMessage = buildTradeAuthMessage({
        chainId,
        contractAddress: CONTRACT_ADDRESS,
        trader: activeAccount,
        action: 'buy',
        roundId: market.roundId,
        isUp,
        amount: amountRaw.toString(),
        nonce,
        deadline,
      });

      // Sign the auth message
      const signature = await signer.signMessage(authMessage);

      // POST to /api/trade
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'buy',
          trader: activeAccount,
          roundId: market.roundId,
          isUp,
          amountRaw: amountRaw.toString(),
          deadline,
          nonce,
          signature,
          permit,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Trade failed');
      }

      alert(`Trade submitted successfully! Transaction hash: ${data.hash}`);
    } catch (e: any) {
      console.error(e);
      alert(`Trade failed: ${e.message || e}`);
    }
  };

  const handleSellPosition = async (id: number, isUp: boolean, shares: string) => {
    let activeAccount = account;
    if (!activeAccount) {
      activeAccount = await connectWallet();
      if (!activeAccount) {
        alert("Please connect your MetaMask wallet to sell positions.");
        return;
      }
    }

    const success = await ensureFujiNetwork();
    if (!success) {
      alert("Please switch your wallet to Avalanche Fuji C-Chain to trade.");
      return;
    }

    if (!market) {
      alert("Market info is not loaded.");
      return;
    }

    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No web3 provider detected");
      const activeProvider = new ethers.BrowserProvider(eth);
      const signer = await activeProvider.getSigner();
      const sharesRaw = ethers.parseUnits(shares, 6); // shares uses 6 decimals (TUSDC decimals)

      // Generate a unique nonce
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 mins

      const network = await activeProvider.getNetwork();
      const chainId = Number(network.chainId);

      // Build trade auth message with action: 'sell'
      const authMessage = buildTradeAuthMessage({
        chainId,
        contractAddress: CONTRACT_ADDRESS,
        trader: activeAccount,
        action: 'sell',
        roundId: market.roundId,
        isUp,
        amount: sharesRaw.toString(),
        nonce,
        deadline,
      });

      // Sign the auth message
      const signature = await signer.signMessage(authMessage);

      // POST to /api/trade
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sell',
          trader: activeAccount,
          roundId: market.roundId,
          isUp,
          amountRaw: sharesRaw.toString(),
          deadline,
          nonce,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sell failed');
      }

      alert(`Position sold successfully! Transaction hash: ${data.hash}`);
    } catch (e: any) {
      console.error(e);
      alert(`Sell failed: ${e.message || e}`);
    }
  };

  const handleResolveMarket = async (id: number) => {
    try {
      const res = await fetch('/api/settle', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Settlement failed');
      }
      if (data.submitted) {
        alert(`Round settlement submitted successfully! Tx: ${data.hash}`);
      } else {
        alert("No expired rounds found to settle.");
      }
    } catch (e: any) {
      console.error(e);
      alert(`Settlement failed: ${e.message || e}`);
    }
  };

  const handleClaimWinnings = async (_assetId: number) => {
    let activeAccount = account;
    if (!activeAccount) {
      activeAccount = await connectWallet();
      if (!activeAccount) {
        alert("Please connect your MetaMask wallet to claim winnings.");
        return;
      }
    }

    const success = await ensureFujiNetwork();
    if (!success) {
      alert("Please switch your wallet to Avalanche Fuji C-Chain to claim.");
      return;
    }

    if (!market || !provider || !contract) {
      alert("Market info is not loaded.");
      return;
    }

    const roundId = selectedHistoryRound?.roundId ?? market.roundId;

    try {
      const { hash } = await relayClaimWinnings({
        provider,
        account: activeAccount,
        contract,
        roundId,
      });
      alert(`Claim submitted successfully! Transaction hash: ${hash}`);
    } catch (e: any) {
      console.error(e);
      alert(`Claim failed: ${e.message || e}`);
    }
  };

  const notFound = ready && assetId !== null && !market;

  // Construct display market for archive / live
  const displayMarket = selectedHistoryRound && market
    ? {
        ...market,
        roundId: selectedHistoryRound.roundId,
        roundNumber: selectedHistoryRound.roundNumber,
        startPrice: selectedHistoryRound.startPrice,
        currentPrice: selectedHistoryRound.endPrice,
        resolved: selectedHistoryRound.resolved,
        upPool: selectedHistoryRound.upPool,
        downPool: selectedHistoryRound.downPool,
        totalPool: selectedHistoryRound.collateralPool,
      }
    : market;

  return (
    <>
      <Head>
        <title>{market ? `${market.symbol}/USD · Trade · ClawX` : 'Trade · ClawX'}</title>
        <meta name="description" content="Trade 5-minute UP/DOWN markets on Avalanche Fuji." />
      </Head>
      <AppShell>
        <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto', padding: '20px 24px 0' }}>

          <button
            onClick={() => router.push('/markets')}
            style={{
              marginBottom: 24, background: 'transparent', border: 'none',
              ...MONO, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', color: '#5A554E',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            ← BACK TO MARKETS
          </button>

          {/* Hard error from context (chain RPC failed etc.) */}
          {error && (
            <div style={{
              border: '2px solid #8A1C14', padding: '14px 18px',
              background: 'rgba(138,28,20,0.06)',
              ...MONO, fontSize: 12, color: '#8A1C14', marginBottom: 20,
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Invalid or missing URL param */}
          {assetId === null && (
            <p style={{ ...MONO, fontSize: 12, color: '#888' }}>
              Invalid market URL — no asset ID found.
            </p>
          )}

          {/* Context loading for the first time (usually <3s) */}
          {assetId !== null && !ready && !error && (
            <p style={{ ...MONO, fontSize: 12, color: '#888' }}>
              Connecting to Avalanche Fuji…
            </p>
          )}

          {/* Market with this assetId doesn't exist / no active round */}
          {notFound && !error && (
            <p style={{ ...MONO, fontSize: 12, color: '#888' }}>
              No active round found for asset #{assetId}. It may have resolved or not started yet.
            </p>
          )}


          {/* Left docks + chart + buy/sell ticket */}
          {market && displayMarket && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)',
                gap: 16,
                width: '100%',
                minHeight: 'calc(100vh - 120px)',
                alignItems: 'stretch',
                paddingBottom: 16,
              }}
              className="trade-desk-layout"
            >
              <style dangerouslySetInnerHTML={{ __html: `
                @media (max-width: 900px) {
                  .trade-desk-layout {
                    grid-template-columns: 1fr !important;
                  }
                  .trade-left-rail {
                    flex-direction: row !important;
                    align-items: stretch !important;
                    gap: 10px !important;
                    min-height: auto !important;
                  }
                  .trade-left-rail > * {
                    flex: 1 1 0 !important;
                    max-width: none !important;
                  }
                  .trade-main-stage {
                    flex-direction: column !important;
                  }
                  .trade-ticket-wrap {
                    max-width: none !important;
                    width: 100% !important;
                  }
                }
              `}} />

              {/* Left rail — Overview top, History bottom */}
              <div
                className="trade-left-rail"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 12,
                  minHeight: '100%',
                  position: 'relative',
                }}
              >
                <ActiveMarketsPanel currentAssetId={assetId} />
                <div style={{ marginTop: 'auto' }}>
                  <RoundHistoryPanel
                    assetId={assetId}
                    currentRoundId={market.roundId}
                    selectedRoundId={selectedHistoryRound?.roundId}
                    onSelectRound={(r) => setSelectedHistoryRound(r)}
                  />
                </div>
              </div>

              {/* Main stage — chart + attached Buy/Sell ticket */}
              <div
                className="trade-main-stage"
                style={{
                  display: 'flex',
                  gap: 0,
                  minWidth: 0,
                  alignItems: 'stretch',
                  border: '1px solid #0D0B08',
                  background: '#FAF8F3',
                }}
              >
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <TradingChartv2
                    market={displayMarket}
                    history={history}
                    isHistorical={selectedHistoryRound !== null}
                    onReturnToLive={() => setSelectedHistoryRound(null)}
                  />
                </div>
                <div
                  className="trade-ticket-wrap"
                  style={{
                    flex: '0 0 300px',
                    maxWidth: 320,
                    borderLeft: '1px solid #0D0B08',
                    minHeight: 0,
                  }}
                >
                  <TradeTicketPanel
                    market={displayMarket}
                    onTakePosition={handleTakePosition}
                    onSellPosition={handleSellPosition}
                    onResolveMarket={handleResolveMarket}
                    onClaimWinnings={handleClaimWinnings}
                    tokenSymbol="TUSDC"
                    isHistorical={selectedHistoryRound !== null}
                    onReturnToLive={() => setSelectedHistoryRound(null)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}
