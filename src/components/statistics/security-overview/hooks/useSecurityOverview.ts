import { useQuery } from '@tanstack/react-query';
import {
  getSecurityOverview,
  getGeoDistribution,
  getTimeDistribution,
  getDrillDown,
  getEscapeList,
  type Direction,
  type DrillDownParams,
} from '@/lib/api/security-overview';
import { useSecurityScope } from './useSecurityScope';

export function useSecurityOverview(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  comparePreviousPeriod?: boolean;
  scopeTenantId: number | null;
}) {
  const { scopedRequest, resolvedScopeTenant, scopeResolved } = useSecurityScope(params.scopeTenantId);
  return useQuery({
    queryKey: ['security-overview', resolvedScopeTenant, params.startDate, params.endDate, params.direction, params.comparePreviousPeriod],
    queryFn: () => getSecurityOverview(params, scopedRequest),
    enabled: scopeResolved && !!params.startDate && !!params.endDate,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useGeoDistribution(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  threatFilter?: string;
  country?: string;
  scopeTenantId: number | null;
}) {
  const { scopedRequest, resolvedScopeTenant, scopeResolved } = useSecurityScope(params.scopeTenantId);
  return useQuery({
    queryKey: ['security-overview-geo', resolvedScopeTenant, params.startDate, params.endDate, params.direction, params.threatFilter, params.country],
    queryFn: () => getGeoDistribution(params, scopedRequest),
    enabled: scopeResolved && !!params.startDate && !!params.endDate,
    placeholderData: (previousData) => previousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useTimeDistribution(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  threatFilter?: string;
  mode: 'daily' | 'weekly';
  scopeTenantId: number | null;
}) {
  const { scopedRequest, resolvedScopeTenant, scopeResolved } = useSecurityScope(params.scopeTenantId);
  return useQuery({
    queryKey: ['security-overview-time', resolvedScopeTenant, params.startDate, params.endDate, params.direction, params.threatFilter, params.mode],
    queryFn: () => getTimeDistribution(params, scopedRequest),
    enabled: scopeResolved && !!params.startDate && !!params.endDate,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDrillDown(params: DrillDownParams | null, scopeTenantId: number | null) {
  const { scopedRequest, resolvedScopeTenant, scopeResolved } = useSecurityScope(scopeTenantId);
  return useQuery({
    queryKey: ['security-overview-drill', resolvedScopeTenant, params?.date, params?.viewBy, params?.series, params?.dimension, params?.direction, params?.limit],
    queryFn: () => getDrillDown(params!, scopedRequest),
    enabled: scopeResolved && !!params,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useEscapeList(
  params: { startDate: string; endDate: string; direction: Direction; page?: number; pageSize?: number },
  scopeTenantId: number | null,
) {
  const { scopedRequest, resolvedScopeTenant, scopeResolved } = useSecurityScope(scopeTenantId);
  return useQuery({
    queryKey: ['security-overview-escapes', resolvedScopeTenant, params.startDate, params.endDate, params.direction, params.page, params.pageSize],
    queryFn: () => getEscapeList(params, scopedRequest),
    enabled: scopeResolved && !!params.startDate && !!params.endDate,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
