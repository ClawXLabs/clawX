/**
 * Canonical wallet population counts for public stats + admin overview.
 *
 * Populations (LOWER(wallet), DISTINCT):
 * - tradingWallets: wallets that appear in trade_log
 * - enrollmentWallets: wallets with an enrollments row (agent enrolled)
 * - profileWallets: wallets with a wallet_profiles row
 * - accessWallets: wallets explicitly allowlisted (wallet_access status=allowed)
 * - enrolledWallets: enrollments ∪ profiles ∪ access(allowed) — landing "Wallets Enrolled"
 * - totalWallets: enrollments ∪ profiles ∪ trade_log ∪ access(allowed)
 */

export const WALLET_POPULATION_SQL = `
  SELECT
    (SELECT COUNT(DISTINCT LOWER(wallet))::int FROM trade_log) AS trading_wallets,
    (SELECT COUNT(DISTINCT LOWER(wallet))::int FROM enrollments) AS enrollment_wallets,
    (SELECT COUNT(*)::int FROM wallet_profiles) AS profile_wallets,
    (SELECT COUNT(*)::int FROM wallet_access WHERE status = 'allowed') AS access_wallets,
    (SELECT COUNT(*)::int FROM (
       SELECT LOWER(wallet) AS w FROM enrollments
       UNION
       SELECT LOWER(wallet) FROM wallet_profiles
       UNION
       SELECT LOWER(wallet) FROM wallet_access WHERE status = 'allowed'
     ) enrolled) AS enrolled_wallets,
    (SELECT COUNT(*)::int FROM (
       SELECT LOWER(wallet) AS w FROM enrollments
       UNION
       SELECT LOWER(wallet) FROM wallet_profiles
       UNION
       SELECT LOWER(wallet) FROM trade_log
       UNION
       SELECT LOWER(wallet) FROM wallet_access WHERE status = 'allowed'
     ) u) AS total_wallets
`;

export function mapWalletPopulationRow(row = {}) {
  return {
    tradingWallets: row.trading_wallets ?? 0,
    enrollmentWallets: row.enrollment_wallets ?? 0,
    profileWallets: row.profile_wallets ?? 0,
    accessWallets: row.access_wallets ?? 0,
    enrolledWallets: row.enrolled_wallets ?? 0,
    totalWallets: row.total_wallets ?? 0,
  };
}

export async function fetchWalletPopulationStats(queryFn) {
  const result = await queryFn(WALLET_POPULATION_SQL);
  return mapWalletPopulationRow(result.rows?.[0] || {});
}
