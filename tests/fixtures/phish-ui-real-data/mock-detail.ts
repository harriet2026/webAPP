import type { DetectionLogDetail } from '@/types/phishing-detection';
import analysis from './raw/cli-mail8-success.analysis.json';
import { cliReportPropsZh, cliSummaryZh, serviceMail8Zh } from './zh';

const stepMessagesZh: Record<string, string> = {
  analyze_url: 'URL 初筛未发现结构性规避特征，风险评分为 0（minimal）；未匹配受信任域名。',
  check_url_threat_intel: '信誉服务对该 URL 返回 SAFE（未命中）；未命中不代表其正常。',
  lookup_domain_age: '域名注册于 2025-01-01，已有 615 天，并非新注册域名。',
  dig: 'A 记录解析到 185.254.74.196；权威域名服务器为 Cloudflare（algin.ns.cloudflare.com）。',
  inspect_tls_cert: 'ECDSA 证书信任链有效、主机名匹配且非自签名；观察时已签发 8 天。',
  web_fetch: '落地页是收集 Email 和 Password 的 SakuraCat VPN 商店登录页面；没有 Microsoft 品牌标识，没有重定向链；由于没有存储节点，截图不可用。',
  get_sender_history: '发件人 cs@core.cn 首次出现于 2026-09-09（距今 0 天），共有 4 封邮件。',
  get_attachment_findings: '返回两条附件扫描记录，但没有判定或发现详情；没有明确的附件威胁证据。',
  search_similar_messages: '找到 3 封发件人、主题相同且共享 URL 主机 sakura-cat3.com 的历史邮件，表明存在成批发送活动；其中一封已隔离，两封已投递。',
};

// Native CLI results use numeric protobuf risk values and top-level findings.
// Project those real observations into the existing webapp API shape.
const riskLabels: Record<number, string> = { 0: 'unknown', 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };
const urlFindings = analysis.url_findings.map((finding) => ({
  ...finding,
  agent: { verdict: finding.verdict, risk_level: riskLabels[finding.risk] ?? 'unknown' },
}));
const timestamp = (value: { seconds: number; nanos: number }) => new Date(value.seconds * 1000 + Math.floor(value.nanos / 1e6)).toISOString();

// The model result is real. This separate envelope is a user-authorized UI mock,
// not a historical service response. Never change the captures in raw/.
export const cliMockDetail: DetectionLogDetail = {
  summary: {
    sideline_id: 'mock-cli-mail8',
    message_id: serviceMail8Zh.summary.message_id,
    sender: serviceMail8Zh.summary.sender,
    subject: `【Mock 定级/处置】${serviceMail8Zh.summary.subject}`,
    recipients: [...serviceMail8Zh.summary.recipients],
    direction: 'inbound',
    status: 'success',
    sidelined_at: serviceMail8Zh.summary.sidelined_at,
    investigation_id: 'mock-cli-investigation',
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    risk_level: 'medium',
    policy_disposition: 'quarantine',
    task_status: 'completed',
    failure_reason: null,
    mail_log_id: 800008,
    display_statuses: [{ status: 'quarantine_pending', count: 1 }],
    disposition_actions: ['quarantine'],
    recipient_dispositions: [{
      recipient: serviceMail8Zh.summary.recipients[0],
      original_action: 'sideline',
      final_action: 'quarantine',
      status: 'quarantined',
      object_kind: 'quarantine',
      object_id: 'mock-cli-quarantine',
    }],
    disposition: 'quarantine',
    detection_mode: 'realtime',
    recall_status: 'none',
    // This CLI run's summary.json records usage.model_call_count = 2.
    agent_rounds: 2,
    url_summary: { total: urlFindings.length, phishing: 0, suspicious: 0, normal: 0 },
    result_truncated: false,
  },
  investigation: {
    id: 'mock-cli-investigation',
    status: 'completed',
    summary: cliSummaryZh,
    steps: analysis.steps.map((step) => ({
      name: step.name,
      status: step.status,
      message: stepMessagesZh[step.name] ?? step.message,
      data: { cli_data: structuredClone(step.data) },
      started_at: timestamp(step.started_at),
      finished_at: timestamp(step.finished_at),
    })),
    result: {
      ...cliReportPropsZh.result,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      summary: cliSummaryZh,
      details: { url_findings: urlFindings },
    },
  },
  config_snapshot: {
    preview_note: '模型摘要和判断依据来自真实 CLI 复跑；定级、策略、收件人处置及其业务标识为 UI Mock。不是历史服务端检测结果。',
    engine_config: {
      risk_policy: {
        investigation_type: 'phish_risk_policy',
        params: JSON.stringify({
          cutoffs: { low: 40, medium: 70, high: 90 },
          policies: {
            suspicious: { base_disposition: 'proceed' },
            low: { base_disposition: 'proceed' },
            medium: { base_disposition: 'quarantine' },
            high: { base_disposition: 'quarantine' },
          },
        }),
      },
    },
  },
};
