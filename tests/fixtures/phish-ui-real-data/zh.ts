import type { AssessmentResultFields } from '@/types/agent-assessment';
import type { DetectionLogDetail } from '@/types/phishing-detection';
import mail7 from './raw/service-mail7-budget-exceeded.detail.json';
import mail8 from './raw/service-mail8-reference-invalid.detail.json';
import cliProps from './raw/cli-mail8-success.report-props.json';

// Presentation translations only. Captured source bytes, hashes, IDs, ordering,
// scores, policy decisions and disposal facts remain those of each original run.
// The successful CLI report is never grafted onto a historical service detail.
const summaries = {
  mail7: '来自 cs@core.cn 的邮件冒充 Microsoft 365 支持团队，催促用户在 24 小时内登录完成账户验证，否则将失去 Outlook、Teams 和 OneDrive 的访问权限。邮件中的唯一链接 https://sakura-cat3.com/ 与 Microsoft 无关，实际为收集邮箱和密码的 SakuraCat VPN 登录页面，与邮件叙述存在明显的品牌冲突。同一发件人此前发送过两封相同邮件（mail_log_id 为 3 和 6），构成一个小规模活动；该发件人今天首次出现，SPF、DKIM 和 DMARC 认证均缺失。威胁情报和 RBL 均未命中，域名已有 615 天，这些因素略微降低了判断的确定性，但身份冒充、收集凭据的落地页以及成批发送的模式仍支持钓鱼判断。',
  mail8: '邮件冒充 Microsoft 365 支持团队（发件人为 cs@core.cn，SPF、DKIM 和 DMARC 均为 none），催促用户在 24 小时内前往 sakura-cat3.com 登录“验证”。链接指向收集邮箱和密码的 SakuraCat VPN 商店登录页面，没有 Microsoft 品牌标识，与邮件叙述存在落地页品牌和流程冲突。此前有三封邮件使用相同发件人、主题和 URL 主机（两封已投递，一封已隔离），且发件人今天才首次出现，表明该活动正在进行。反向信号包括：域名已有 615 天，TLS 证书的信任链有效且与主机匹配，威胁情报返回 SAFE，URL 分析器评分为 minimal。邮件诱导内容、收集凭据的目标页面以及成批发送模式支持钓鱼判断。',
};

function translateServiceDetail(raw: unknown, text: string): DetectionLogDetail {
  const detail = structuredClone(raw) as DetectionLogDetail;
  if (detail.investigation) {
    detail.investigation.summary = text;
    if (detail.investigation.result) detail.investigation.result.summary = text;
  }
  return detail;
}

export const serviceMail7Zh = translateServiceDetail(mail7, summaries.mail7);
export const serviceMail8Zh = translateServiceDetail(mail8, summaries.mail8);

export const cliSummaryZh = '疑似针对 Microsoft 365 的凭据钓鱼。来自 cs@core.cn 的邮件冒充 Microsoft 365 支持团队，发信域名与 Microsoft 无关，SPF、DKIM 和 DMARC 均为 none。邮件以保留 Outlook、Teams 和 OneDrive 访问权限为由，要求在 24 小时内登录“验证”，唯一链接为 https://sakura-cat3.com/。该页面是收集邮箱和密码的 SakuraCat VPN 商店登录页，没有 Microsoft 品牌标识，与邮件叙述存在明显的品牌冲突。发件人今天首次出现，共有 4 封使用相同 URL 主机的相同邮件（两封已投递，一封已隔离），表明存在成批发送活动。反向信号包括：威胁情报返回 SAFE、域名已有 615 天、URL 结构未见异常、TLS 有效。邮件层面的诱导内容和成批发送证据在判断中占主导。';

const factorTranslations = [
  [
    '主题为“Microsoft 365：请登录完成账户访问验证”。',
    '以服务商名义要求登录验证账户，是典型的凭据钓鱼目标；被冒充的品牌为 Microsoft 365。',
    '仅凭主题无法保留正文中的诱导内容、紧迫期限或链接目的地；mail.text_body、mail.html_body 和 mail.url.0 已从保留证据中省略。',
  ],
  [
    'From 和信封发件人均为 cs@core.cn；保留的身份字段中没有出现与 Microsoft 关联的发信域名。',
    'Microsoft 365 账户通知由无关的第三方域名发出，与正常的服务商通知流程不符，支持发件身份与邮件叙述冲突的判断。',
    '是否与 Microsoft 关联是根据域名身份推断的，未进行权威的品牌所有权核验。',
  ],
  [
    'SPF、DKIM 和 DMARC 的结果均记录为 none。',
    '该邮件没有经过认证的发件身份，与未经验证或伪造来源的情况一致；仅作为辅助背景信息。',
    '仅凭认证失败不能认定邮件是钓鱼邮件。',
  ],
  [
    'search_similar_messages 返回了 3 封历史匹配邮件（mail_log_id 为 7、6、3），发件人均为 cs@core.cn，主题相同，并共享 URL 主机 sakura-cat3.com；其中一封已隔离，两封已投递。',
    '多封相关邮件使用相同诱导内容和目的地，表明存在协同活动，比单封邮件提供更强的钓鱼证据。',
    '匹配邮件的正文未被保留；匹配依赖发件人、主题和共享的 URL 主机。',
  ],
  [
    'get_sender_history 显示 cs@core.cn 首次出现于 2026-09-09T02:49:57Z（距今 0 天），共有 4 封邮件。',
    '发件人今天首次出现，同时集中发送相同的诱导邮件，符合钓鱼活动的行为模式。',
    '历史查询窗口有限且较短；缺少更早的历史记录不能证明存在恶意。',
  ],
  [
    'web_fetch 抓取 https://sakura-cat3.com/ 后返回名为“SakuraCat”的网络加速商店页面，包含 Email 和 Password 登录字段，以及忘记密码和注册链接；未观察到 Microsoft 品牌标识或重定向链。',
    '页面收集邮箱和密码，而其品牌与邮件中的 Microsoft 365 登录叙述冲突；收件人沿“登录 Microsoft 365”链接进入后，会向无关服务的登录页面提交凭据。',
    '由于没有存储节点，截图不可用；该页面是通用服务登录页，并非仿制的 Microsoft 页面，因此尚未确认页面层面的品牌冒充。',
  ],
  [
    'check_url_threat_intel 对 https://sakura-cat3.com/ 返回 threat_type=SAFE，detail 为空（记录的 outcome 为 not_found）。',
    '信誉查询未命中，减少了用于证明该 URL 已知恶意的外部佐证。',
    '未命中不能证明其正常；新出现的活动通常会早于信誉系统的检测。',
  ],
  [
    'lookup_domain_age 显示 sakura-cat3.com 注册于 2025-01-01T05:47:43Z，域名已有 615 天。',
    '该域名并非新注册域名，削弱了一项常见的钓鱼基础设施信号。',
    '域名年龄本身不能证明其正常；老域名也可能被滥用。',
  ],
  [
    'analyze_url 将该 URL 评为 minimal（风险评分为 0），未发现可疑的主机名、路径或查询参数信号，也未匹配受信任域名。',
    '未发现 IP 字面量、短链接、Punycode 或 userinfo 等结构性规避模式，无法据此为 URL 滥用提供佐证。',
    '初筛评分用于排序，不能作为支持任一结论的证明。',
  ],
  [
    'inspect_tls_cert 显示 sakura-cat3.com 使用 ECDSA-256 证书，信任链有效、主机名匹配且非自签名；证书在观察前 8 天签发，距离过期还有 81 天。',
    '未出现自签名、SAN 不匹配或信任链不受信任等 TLS 钓鱼信号；证书仅签发 8 天这一点只有较弱的提示意义。',
    '正常网站和钓鱼网站都普遍使用有效的 TLS。',
  ],
  [
    'get_attachment_findings 返回两条扫描记录（scan_id 为 4103d471-af02-5a14-b544-ab4d7321d9f4 和 9246441c-242f-5d69-8306-5e3923eed3ff），但没有判定或发现详情。',
    '没有明确的附件威胁证据可用于佐证或反驳邮件层面的判断。',
    '有限的检测结果缺少判定；没有详情不能作为附件安全的证据。',
  ],
] as const;

export const cliReportPropsZh: { result: AssessmentResultFields } = structuredClone(cliProps);
const report = cliReportPropsZh.result.assessment_report!;
report.subjects![0].label = '本次调查邮件';
report.factors!.forEach((factor, index) => {
  const [observation, relevance, limitation] = factorTranslations[index];
  Object.assign(factor, { observation, relevance, limitation });
});

const gapLabels: Record<string, string> = {
  'mail.text_body': '邮件纯文本正文',
  'mail.html_body': '邮件 HTML 正文',
  'mail.url.0': '邮件中的第一个 URL',
  'mail.recipients': '收件人',
  'mail.direction': '邮件方向',
  'mail.ptr_result': 'PTR 查询结果',
  'mail.artifact_available': '原始邮件可用性',
  'check_rbl_blocklist': 'RBL 黑名单查询',
};
report.gaps!.forEach((gap) => {
  if (gap.detail && gapLabels[gap.detail]) gap.detail = `${gapLabels[gap.detail]}（${gap.detail}）`;
});
