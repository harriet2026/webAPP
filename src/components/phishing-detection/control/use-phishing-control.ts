'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { getPhishingControl, putPhishingControl } from '@/lib/api/phishing-control';
import { listAdmissionRules } from '@/lib/api/phishing-admission-rules';
import { usePhishingAccess } from '../access';
import { phishingQueryKeys } from '../phishing-query-keys';

export function usePhishingControl() {
  const t = useTranslations('phishingDetection.control');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit, readOnly } = usePhishingAccess();
  const queryClient = useQueryClient();

  const controlQuery = useQuery({
    queryKey: phishingQueryKeys.control(effectiveTenantId),
    queryFn: () => getPhishingControl(apiRequest),
  });
  const admissionQuery = useQuery({
    queryKey: phishingQueryKeys.admissionRules(effectiveTenantId),
    queryFn: () => listAdmissionRules(apiRequest),
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => putPhishingControl({
      enabled,
      expected_revision: controlQuery.data!.revision,
      operation_id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined,
    }, apiRequest),
    onSuccess: (next) => {
      queryClient.setQueryData(phishingQueryKeys.control(effectiveTenantId), next);
      queryClient.invalidateQueries({ queryKey: ['agent-center-overview'] });
      toast.success(t('updateSuccess'));
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('updateError'))),
  });

  const enabled = controlQuery.data?.enabled ?? false;
  const admissionReady = admissionQuery.data?.some((rule) => rule.enabled) ?? false;
  const readinessUnknown = !controlQuery.data
    || (!enabled && (admissionQuery.isLoading || admissionQuery.isError));
  const errorMessage = controlQuery.isError
    ? apiErrorMessage(controlQuery.error, t('updateError'))
    : null;

  return {
    canEdit,
    readOnly,
    control: controlQuery.data,
    enabled,
    admissionReady,
    readinessUnknown,
    errorMessage,
    isLoading: controlQuery.isLoading,
    isPending: mutation.isPending,
    checkAdmissionReady: async () => {
      const latest = await admissionQuery.refetch();
      return latest.data?.some((rule) => rule.enabled) ?? false;
    },
    update: (next: boolean) => mutation.mutate(next),
  };
}
