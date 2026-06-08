import { useAgentStatus, type AgentStatusData, clearAgentStatusCache } from './useAgentStatus';

export type EnrollmentStatus = AgentStatusData;

export { clearAgentStatusCache as clearAgentEnrollmentCache };

export function useAgentEnrollment(pollMs = 5000) {
  const { account, status, enrolled, loading, error, stale, refresh } = useAgentStatus(pollMs);

  return {
    account,
    enrolled,
    status: enrolled ? status : null,
    loading,
    error,
    stale,
    refresh,
  };
}
