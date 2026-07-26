// Monitor endpoints now return HTTP 200 with a `degraded`/`degraded_code`
// envelope (instead of 500) when their data source — the TSDB or the Database
// tab's business-DB provider — is unavailable. This maps the machine-readable
// `degraded_code` to a localized operator-facing message. The three codes are
// mirrored in the `infrastructure` and `mailflow` i18n namespaces, so pass the
// namespace's translator (`useTranslations('infrastructure' | 'mailflow')`).

export type DegradeCode =
  | 'metrics_backend_unavailable'
  | 'metrics_not_initialized'
  | 'metrics_db_unavailable';

/**
 * degradeMessage resolves a `degraded_code` to a localized banner message.
 * Unknown/undefined codes fall back to the generic backend-unavailable copy.
 */
export function degradeMessage(
  code: string | undefined,
  t: (key: string) => string,
): string {
  switch (code) {
    case 'metrics_not_initialized':
      return t('degradeNotInitialized');
    case 'metrics_db_unavailable':
      return t('degradeDbUnavailable');
    case 'metrics_backend_unavailable':
    default:
      return t('degradeBackendUnavailable');
  }
}
