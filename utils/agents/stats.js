import { ethers } from 'ethers';
import { CONTRACT_ABI, CONTRACT_ADDRESS, ERC20_ABI, FUJI_RPC_PUBLIC } from '../contract.ts';
import { AGENTS, getAgentAddress } from './config.js';

const SEED_AUM = {
  'ava-strike': 1240,
  'peak-mind': 1560,
  'frost-logic': 980,
  'subnet-sage': 1105,
};

const SEED_RETURN = {
  'ava-strike': 8.4,
  'peak-mind': 12.7,
  'frost-logic': -2.1,
  'subnet-sage': 4.2,
};

export async function readWalletAum(provider, wallet, contractAddress) {
  const market = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
  const collateralAddr = await market.collateralToken();
  const token = new ethers.Contract(collateralAddr, ERC20_ABI, provider);
  const [dec, bal] = await Promise.all([token.decimals(), token.balanceOf(wallet)]);
  const decimals = Number(dec);
  let aum = bal;

  const assetCount = Number(await market.getAssetCount());
  for (let assetId = 0; assetId < assetCount; assetId += 1) {
    const asset = await market.getAsset(assetId);
    const roundId = Number(asset.currentRoundId);
    if (roundId === 0) continue;
    const [pos, round] = await Promise.all([
      market.getUserPosition(roundId, wallet),
      market.getRoundInfo(roundId),
    ]);
    if (pos.upShares > 0n) {
      try {
        aum += await market.quoteSell(roundId, true, pos.upShares);
      } catch {
        /* ignore */
      }
    }
    if (pos.downShares > 0n) {
      try {
        aum += await market.quoteSell(roundId, false, pos.downShares);
      } catch {
        /* ignore */
      }
    }
    if (!round.resolved && (pos.upShares > 0n || pos.downShares > 0n)) {
      /* position counted via quoteSell */
    }
  }

  return {
    aumRaw: aum,
    aum: Number(ethers.formatUnits(aum, decimals)),
    decimals,
  };
}

export async function readOpenPositions(provider, wallet, contractAddress) {
  const market = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
  const positions = [];
  const assetCount = Number(await market.getAssetCount());

  for (let assetId = 0; assetId < assetCount; assetId += 1) {
    const asset = await market.getAsset(assetId);
    const roundId = Number(asset.currentRoundId);
    if (roundId === 0) continue;
    const [pos, round] = await Promise.all([
      market.getUserPosition(roundId, wallet),
      market.getRoundInfo(roundId),
    ]);
    if (pos.upShares === 0n && pos.downShares === 0n) continue;
    positions.push({
      roundId,
      assetId,
      symbol: String(asset.symbol ?? '').trim(),
      roundNumber: Number(round.roundNumber),
      side: pos.upShares > 0n ? 'UP' : 'DOWN',
      shares: (pos.upShares > 0n ? pos.upShares : pos.downShares).toString(),
      resolved: round.resolved,
      endTime: Number(round.endTime),
    });
  }
  return positions;
}

export async function buildAgentCatalog() {
  const rpc = process.env.FUJI_RPC_URL || FUJI_RPC_PUBLIC;
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const provider = new ethers.JsonRpcProvider(rpc);

  const agents = await Promise.all(
    AGENTS.map(async (agent) => {
      const address = getAgentAddress(agent);
      let aum = SEED_AUM[agent.id] ?? 1000;
      let returnPct = SEED_RETURN[agent.id] ?? 0;
      let openPositions = [];
      let live = false;

      if (address && contractAddress) {
        try {
          const [aumRow, positions] = await Promise.all([
            readWalletAum(provider, address, contractAddress),
            readOpenPositions(provider, address, contractAddress),
          ]);
          aum = aumRow.aum;
          openPositions = positions;
          live = true;
          const enrollmentSeed = Number(process.env[`AGENT_${agent.id.toUpperCase().replace(/-/g, '_')}_SEED`] || 1000);
          returnPct = enrollmentSeed > 0 ? ((aum - enrollmentSeed) / enrollmentSeed) * 100 : 0;
        } catch {
          /* keep seed demo values */
        }
      }

      return {
        ...agent,
        address,
        aum: Math.round(aum * 100) / 100,
        returnPct: Math.round(returnPct * 10) / 10,
        openPositionCount: openPositions.length,
        openPositions: openPositions.slice(0, 3),
        points: Math.max(0, Math.round(50 + returnPct * 3 + openPositions.length * 5)),
        live,
      };
    })
  );

  return agents.sort((a, b) => b.points - a.points);
}
