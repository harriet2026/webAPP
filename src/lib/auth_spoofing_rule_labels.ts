// Built-in auth/spoofing rule names are stable backend identities, not
// administrator-facing copy. Keep one mapping for every UI that renders those
// identities so mail disposal and rule-effectiveness reports cannot drift.
export const AUTH_RULE_LABEL_KEYS = {
  spf_fail: ['protocolChecks.spf', 'protocolChecks.spf_fail'],
  spf_softfail: ['protocolChecks.spf', 'protocolChecks.spf_softfail'],
  spf_permerror: ['protocolChecks.spf', 'protocolChecks.spf_permerror'],
  spf_none: ['protocolChecks.spf', 'protocolChecks.spf_none'],
  spf_temperror: ['protocolChecks.spf', 'protocolChecks.spf_temperror'],
  dkim_fail: ['protocolChecks.dkim', 'protocolChecks.dkim_fail'],
  dkim_neutral: ['protocolChecks.dkim', 'protocolChecks.dkim_neutral'],
  dkim_none: ['protocolChecks.dkim', 'protocolChecks.dkim_none'],
  dkim_temperror: ['protocolChecks.dkim', 'protocolChecks.dkim_temperror'],
  dkim_permerror: ['protocolChecks.dkim', 'protocolChecks.dkim_permerror'],
  dkim_partial: ['protocolChecks.dkim', 'protocolChecks.dkim_partial'],
  dmarc_reject: ['protocolChecks.dmarc', 'protocolChecks.dmarc_reject'],
  dmarc_quarantine: ['protocolChecks.dmarc', 'protocolChecks.dmarc_quarantine'],
  dmarc_none: ['protocolChecks.dmarc', 'protocolChecks.dmarc_none'],
  dmarc_no_record: ['protocolChecks.dmarc', 'protocolChecks.dmarc_no_record'],
  dmarc_query_fail: ['protocolChecks.dmarc', 'protocolChecks.dmarc_query_fail'],
  ptr_nomatch: ['protocolChecks.ptr', 'protocolChecks.ptr_nomatch'],
  ptr_noptr: ['protocolChecks.ptr', 'protocolChecks.ptr_noptr'],
  ptr_ehlo_mismatch: ['protocolChecks.ptr', 'protocolChecks.ptr_ehlo_mismatch'],
  format_mailfrom_empty: ['formatChecks.title', 'formatChecks.mailFromEmpty'],
  format_mailfrom_invalid: ['formatChecks.title', 'formatChecks.mailFromInvalid'],
  format_envelope_header_mismatch: ['formatChecks.title', 'formatChecks.envelopeHeaderMismatch'],
  display_name_inbound: ['displayNameSpoof.title', 'displayNameSpoof.inbound'],
  display_name_outbound: ['displayNameSpoof.title', 'displayNameSpoof.outbound'],
  display_name_internal: ['displayNameSpoof.title', 'displayNameSpoof.internal'],
  similar_domain: ['similarDomain.title'],
} as const satisfies Record<string, readonly string[]>;

export function authSpoofingRuleLabelKeys(ruleKey: string): readonly string[] | undefined {
  if (!Object.hasOwn(AUTH_RULE_LABEL_KEYS, ruleKey)) return undefined;
  return AUTH_RULE_LABEL_KEYS[ruleKey as keyof typeof AUTH_RULE_LABEL_KEYS];
}
