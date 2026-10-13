import type { AssessmentResultFields, AssessmentSource } from '@/types/agent-assessment';
import type { UrlFinding } from '@/types/phishing-detection';

type Fields = Record<string, unknown>;
interface Observation { tool: string; query: Fields; fields: Fields; source: AssessmentSource }
export interface UrlEvidence {
  analyze?: Fields;
  dns?: Fields;
  domainAge?: Fields;
  fetch?: Fields;
  intel?: Fields;
  cert?: Fields;
  rbl?: Fields;
  sources: AssessmentSource[];
}
const object = (value: unknown): Fields | null => value != null && typeof value === 'object' && !Array.isArray(value) ? value as Fields : null;
function urlIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
const domainIdentity = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim().toLowerCase().replace(/\.$/, '') : null;

// A source retains its own query and outcome. Never spread the first tool step
// over all URL findings, and never use page text/redirect claims as identity.
export function urlEvidence(finding: UrlFinding, result?: AssessmentResultFields): UrlEvidence {
  const evidence: UrlEvidence = { sources: [] };
  const report = result?.assessment_report;
  if (result?.assessment_report_status !== 'available' || !report || ![1, 2].includes(report.schema_version)) return evidence;
  const target = urlIdentity(finding.url || finding.final_url);
  if (!target) return evidence;
  const host = domainIdentity(new URL(target).hostname);
  const observations: Observation[] = [];
  for (const source of report.sources ?? []) {
    if (source.kind !== 'tool_observation' || !source.content) continue;
    try {
      const content = object(JSON.parse(source.content));
      const fields = object(content?.observation);
      const query = object(content?.query) ?? {};
      if (!fields || typeof content?.tool !== 'string' || content.tool !== source.target) continue;
      observations.push({ tool: content.tool, query, fields, source });
    } catch { /* Truncated or historical text remains available in the report. */ }
  }
  const matches = (observation: Observation, domain: boolean) => {
    const { query, fields, tool } = observation;
    const values = domain ? [query.domain, fields.domain, ...(tool === 'check_rbl_blocklist' ? [query.target, fields.target] : [])]
      : [query.url, tool === 'analyze_url' ? fields.normalized_url : fields.url];
    const present = values.filter((value) => value !== undefined && value !== null);
    const identity = domain ? domainIdentity : urlIdentity;
    return present.length > 0 && present.every((value) => identity(value) === (domain ? host : target));
  };
  const select = (tool: string, domain = false): Fields | undefined => {
    const candidates = observations.filter((observation) => observation.tool === tool && matches(observation, domain));
    evidence.sources.push(...candidates.map(({ source }) => source));
    if (!candidates.length) return undefined;
    // A newer failed, partial or conflicting observation must not silently turn
    // an older result into the conclusion for this URL. Keep all sources readable.
    if (candidates.some(({ source, fields }) => {
      // capture.go records successful negative intelligence/RBL lookups as
      // not_found. Require their explicit negative fact, not just the status.
      const completedNegative = source.outcome === 'not_found' && (
        (tool === 'check_url_threat_intel' && fields.threat_type === 'SAFE') ||
        (tool === 'check_rbl_blocklist' && fields.listed === false)
      );
      return (source.outcome !== 'observed' && !completedNegative) || source.truncated || source.captured_truncated || source.extraction;
    })) return undefined;
    if (new Set(candidates.map(({ fields }) => JSON.stringify(fields))).size !== 1) return undefined;
    return candidates[0].fields;
  };
  evidence.analyze = select('analyze_url');
  evidence.dns = select('dig', true);
  evidence.domainAge = select('lookup_domain_age', true);
  evidence.fetch = select('web_fetch');
  evidence.intel = select('check_url_threat_intel');
  evidence.cert = select('inspect_tls_cert');
  evidence.rbl = select('check_rbl_blocklist', true);
  return evidence;
}
