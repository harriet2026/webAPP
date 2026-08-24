// 处置依据（拦截原因）映射字典 —— 全应用唯一事实源
// 将「策略模块 + 规则名 + 规则ID + 命中值 + 动作」结构化，供列表页/详情页统一渲染。
// 文案在前端按字典 + 变量替换生成，便于 i18n 与列表字数控制；后端只需返回
// policy_key/rule_id/hit_values。
//
// 接口字段采用后端返回的 snake_case 形态（policy_key / rule_name / rule_id /
// action / hit_values / detection_tags / per_recipient），由
// types/email-disposal.ts 的 DisposalBasis 接口定义，此处仅引用之。

import type { DisposalBasis, DisposalBasisGroupSummary } from '@/types/email-disposal';

export type { DisposalBasis };

// DisposalAction/ACTION_LABEL/ACTION_COLOR must cover every raw action value
// disposal_basis.action can actually carry from the backend, not just the
// per-recipient dispose actions (deliver/discard/recall). synthDisposalBasis
// (internal/antispam/milter.go actionSeverity map) stamps disposal_basis with
// the RAW rule/stage action -- which is commonly "audit" (see
// internal/models/outbound.go ActionAudit, content rules'/intent engine's
// audit action) or "reject"/"bounce"/"sideline"/"accept" -- none of which
// were in this map (G4 bug: getActionLabel's `?? action` fallback silently
// rendered the untranslated raw string, e.g. bare "audit", instead of a
// localized label like "隔离").
export type DisposalAction =
  | 'quarantine'
  | 'discard'
  | 'tag'
  | 'deliver'
  | 'recall'
  | 'audit'
  | 'reject'
  | 'bounce'
  | 'sideline'
  | 'accept'
  | 'proceed';

// 命中动态变量集合（大括号变量的实际值），如
//   { source_ip: '203.0.113.5', count: 500, limit: 100 }
// 后端的 hit_values 是 Record<string, string>；这里兼容 string | number 以方便
// 模板内联时直接插数值。
export type HitValues = Record<string, string | number>;

// 4 语言代码（与 webapp/src/i18n/routing.ts 一致）。
export type DisposalLang = 'zh' | 'en' | 'th' | 'ru';

// 阶段 -> 规则配置页路由（详情页点击规则名/ID 跳转）。
// GT-12583：阶段 1/2/3/5 的策略配置统一落在「策略流水线」页（/security/
// pipeline，页内以抽屉承载各阶段策略）；此前写的 /filter-rules/* 是 demo
// 原型的路由，webapp 从未存在过这些页面，点击处置依据规则名直接 404。
// 阶段 4（AI 检测）走智能体中心总览。
const STAGE_ROUTE: Record<number, string> = {
  1: '/security/pipeline',
  2: '/security/pipeline',
  3: '/security/pipeline',
  4: '/agent-center/overview',
  5: '/security/pipeline',
};

// 阶段配色（列表页阶段色点 / 详情页强调）。
const STAGE_COLOR: Record<number, string> = {
  1: 'bg-blue-500',
  2: 'bg-cyan-500',
  3: 'bg-amber-500',
  4: 'bg-rose-500',
  5: 'bg-emerald-500',
};

interface PolicyMeta {
  stage: 1 | 2 | 3 | 4 | 5;
  moduleZh: string;
  moduleEn: string;
  moduleTh: string;
  moduleRu: string;
  idPrefix: string;
  // 列表页命中简述（30-40 字内），返回「模块『规则名』· 简述」中的「简述」部分。
  // 注意：模板文案以中文为主语言（后端默认渲染语言也是中文），其他语言返回
  // 对应的本地化字符串；模板里的变量用 `val()` 取自 HitValues。
  listSummary: (v: HitValues, lang: DisposalLang) => string;
  // 详情页「命中」行描述（变量已替换）。
  hitDetail: (v: HitValues, lang: DisposalLang) => string;
}

const val = (v: HitValues | undefined, k: string, fallback = '-'): string => {
  if (!v) return fallback;
  const x = v[k];
  return x !== undefined && x !== null && x !== '' ? String(x) : fallback;
};

// Optional evidence must stay optional all the way to the sentence. Filling a
// missing backend fact with a fluent-looking default ("static", "display name",
// "phishing", …) turns unknown data into a false conclusion.
const optionalVal = (v: HitValues | undefined, k: string): string | undefined => {
  if (!v) return undefined;
  const x = v[k];
  return x !== undefined && x !== null && x !== '' ? String(x) : undefined;
};

function ipFrequencyTriggerLabel(
  token: string | undefined,
  lang: DisposalLang,
): string | undefined {
  if (!token) return undefined;
  const table: Record<string, Record<DisposalLang, string>> = {
    daily_connections: {
      zh: '日连接数',
      en: 'daily connections',
      th: 'จำนวนการเชื่อมต่อรายวัน',
      ru: 'суточные подключения',
    },
    concurrent_connections: {
      zh: '并发连接数',
      en: 'concurrent connections',
      th: 'จำนวนการเชื่อมต่อพร้อมกัน',
      ru: 'одновременные подключения',
    },
    window_connections: {
      zh: '窗口连接数',
      en: 'window connections',
      th: 'จำนวนการเชื่อมต่อในช่วงเวลา',
      ru: 'подключения за окно',
    },
    hourly_auth_failures: {
      zh: '每小时认证失败数',
      en: 'hourly authentication failures',
      th: 'การยืนยันตัวตนล้มเหลวต่อชั่วโมง',
      ru: 'ошибки аутентификации за час',
    },
    connection_auth_failures: {
      zh: '单连接认证失败数',
      en: 'per-connection authentication failures',
      th: 'การยืนยันตัวตนล้มเหลวต่อการเชื่อมต่อ',
      ru: 'ошибки аутентификации в соединении',
    },
    connection_command_errors: {
      zh: '单连接命令错误数',
      en: 'per-connection command errors',
      th: 'ข้อผิดพลาดคำสั่งต่อการเชื่อมต่อ',
      ru: 'ошибки команд в соединении',
    },
  };
  return table[token]?.[lang] ?? token;
}

function behaviorDimensionLabel(token: string | undefined, lang: DisposalLang): string | undefined {
  if (!token) return undefined;
  const table: Record<string, Record<DisposalLang, string>> = {
    mail_count: {
      zh: '发信量',
      en: 'message count',
      th: 'จำนวนอีเมล',
      ru: 'количество писем',
    },
    ip_count: {
      zh: '发信 IP 数',
      en: 'sender IP count',
      th: 'จำนวน IP ผู้ส่ง',
      ru: 'количество IP отправителя',
    },
    recipient_count: {
      zh: '收件人数',
      en: 'recipient count',
      th: 'จำนวนผู้รับ',
      ru: 'количество получателей',
    },
    attachment_size: {
      zh: '附件大小',
      en: 'attachment size',
      th: 'ขนาดไฟล์แนบ',
      ru: 'размер вложений',
    },
    merged_mail: {
      zh: '合并发信量',
      en: 'merged message count',
      th: 'จำนวนอีเมลรวม',
      ru: 'сводное количество писем',
    },
    merged_recipient: {
      zh: '合并收件人数',
      en: 'merged recipient count',
      th: 'จำนวนผู้รับรวม',
      ru: 'сводное количество получателей',
    },
    merged_ip: {
      zh: '合并发信 IP 数',
      en: 'merged sender IP count',
      th: 'จำนวน IP ผู้ส่งรวม',
      ru: 'сводное количество IP отправителя',
    },
  };
  return table[token]?.[lang] ?? token;
}

function senderMatchTypeLabel(token: string | undefined, lang: DisposalLang): string | undefined {
  if (!token) return undefined;
  const table: Record<string, Record<DisposalLang, string>> = {
    individual: {
      zh: '个人邮箱',
      en: 'individual email address',
      th: 'อีเมลส่วนบุคคล',
      ru: 'индивидуальный адрес',
    },
    email: {
      zh: '个人邮箱',
      en: 'individual email address',
      th: 'อีเมลส่วนบุคคล',
      ru: 'индивидуальный адрес',
    },
    domain: { zh: '域名', en: 'domain', th: 'โดเมน', ru: 'домен' },
    group: {
      zh: '发件人组',
      en: 'sender group',
      th: 'กลุ่มผู้ส่ง',
      ru: 'группа отправителей',
    },
  };
  return table[token]?.[lang] ?? token;
}

function threatRetroTypeLabel(token: string | undefined, lang: DisposalLang): string | undefined {
  if (!token) return undefined;
  const table: Record<string, Record<DisposalLang, string>> = {
    phishing: { zh: '钓鱼', en: 'phishing', th: 'ฟิชชิง', ru: 'фишинг' },
    impersonation: {
      zh: '身份仿冒',
      en: 'identity spoofing',
      th: 'การปลอมแปลงตัวตน',
      ru: 'подмена личности',
    },
    malware: {
      zh: '恶意软件',
      en: 'malware',
      th: 'มัลแวร์',
      ru: 'вредоносное ПО',
    },
    unknown: {
      zh: '未知类型威胁',
      en: 'an unknown threat',
      th: 'ภัยคุกคามที่ไม่ทราบประเภท',
      ru: 'угроза неизвестного типа',
    },
  };
  return table[token]?.[lang] ?? token;
}

// 策略模块字典（对照处置依据映射表整理）。
// GT-12214: 发信人黑白名单共用一个 policy_key，命中的是黑还是白由
// hit_values.list_type 决定（whitelist/allowlist 视为放行名单）。缺失时按黑名单
// 渲染，保持与历史数据兼容。
export function isAllowList(v: HitValues | undefined): boolean {
  const t = String(v?.list_type ?? '').toLowerCase();
  return t === 'whitelist' || t === 'allowlist' || t === 'allow';
}

// 内容规则匹配方式 token → 四语标签。token 由后端产出（keyword/regex/
// content_group），后端只发规范化 token 不发中文，文案映射是前端职责。
function crMethodLabel(token: string, lang: DisposalLang): string {
  const table: Record<string, Record<DisposalLang, string>> = {
    keyword: {
      zh: '关键词',
      en: 'keyword',
      th: 'คำสำคัญ',
      ru: 'ключевому слову',
    },
    regex: {
      zh: '正则表达式',
      en: 'regular expression',
      th: 'นิพจน์ทั่วไป',
      ru: 'регулярному выражению',
    },
    content_group: {
      zh: '内容组',
      en: 'content group',
      th: 'กลุ่มเนื้อหา',
      ru: 'контентной группе',
    },
  };
  return table[token]?.[lang] ?? table[token]?.zh ?? '';
}

// 内容规则命中位置 token → 四语标签，覆盖 internal/api 的 validContentRuleScopes 全部项。
function crPositionLabel(token: string, lang: DisposalLang): string {
  const table: Record<string, Record<DisposalLang, string>> = {
    subject: { zh: '主题', en: 'subject', th: 'หัวเรื่อง', ru: 'тема' },
    header: { zh: '邮件头', en: 'header', th: 'ส่วนหัว', ru: 'заголовок' },
    text_body: {
      zh: '纯文本正文',
      en: 'text body',
      th: 'เนื้อหาข้อความ',
      ru: 'текст письма',
    },
    html_body: {
      zh: 'HTML 正文',
      en: 'HTML body',
      th: 'เนื้อหา HTML',
      ru: 'HTML-текст',
    },
    attachment_names: {
      zh: '附件名称',
      en: 'attachment name',
      th: 'ชื่อไฟล์แนบ',
      ru: 'имя вложения',
    },
    attachment_types: {
      zh: '附件类型',
      en: 'attachment type',
      th: 'ประเภทไฟล์แนบ',
      ru: 'тип вложения',
    },
    attachment_hash: {
      zh: '附件哈希',
      en: 'attachment hash',
      th: 'แฮชไฟล์แนบ',
      ru: 'хеш вложения',
    },
    urls: { zh: '链接', en: 'URL', th: 'ลิงก์', ru: 'ссылка' },
  };
  return table[token]?.[lang] ?? table[token]?.zh ?? token;
}

export const DISPOSAL_POLICY_MAP: Record<string, PolicyMeta> = {
  // ===== 阶段一：IP 策略（连接层）=====
  IPFREQ: {
    stage: 1,
    moduleZh: 'IP频率限制',
    moduleEn: 'IP Rate Limit',
    moduleTh: 'การจำกัดอัตรา IP',
    moduleRu: 'Ограничение частоты IP',
    idPrefix: 'IPFREQ-',
    listSummary: (v, lang) => {
      const ip = val(v, 'source_ip');
      switch (lang) {
        case 'en':
          return `${ip} triggered rate limit`;
        case 'th':
          return `${ip} เรียกใช้ขีดจำกัดอัตรา`;
        case 'ru':
          return `${ip} вызвал ограничение частоты`;
        default:
          return `${ip} 触发频率限制`;
      }
    },
    hitDetail: (v, lang) => {
      const ip = optionalVal(v, 'source_ip');
      const w = optionalVal(v, 'time_window');
      const c = optionalVal(v, 'count');
      const l = optionalVal(v, 'limit');
      const trigger = ipFrequencyTriggerLabel(optionalVal(v, 'trigger_type'), lang);
      if (c && l) {
        const scope = trigger ? `${trigger}: ` : '';
        const window = w ? ` (${w})` : '';
        switch (lang) {
          case 'en':
            return `${ip ? `IP ${ip} ` : ''}${scope}measured ${c}, exceeding limit ${l}${window}`;
          case 'th':
            return `${ip ? `IP ${ip} ` : ''}${scope}วัดได้ ${c} เกินขีดจำกัด ${l}${window}`;
          case 'ru':
            return `${ip ? `IP ${ip}: ` : ''}${scope}${c}, превышает лимит ${l}${window}`;
          default:
            return `${ip ? `IP ${ip} ` : ''}${scope}当前计数 ${c}，超过阈值 ${l}${window}`;
        }
      }
      switch (lang) {
        case 'en':
          return `${ip ? `IP ${ip} hit` : 'Hit'} an IP rate-limit rule`;
        case 'th':
          return `${ip ? `IP ${ip} ` : ''}ตรงกับกฎจำกัดอัตรา IP`;
        case 'ru':
          return `${ip ? `IP ${ip} ` : ''}соответствует правилу ограничения частоты IP`;
        default:
          return `${ip ? `IP ${ip} ` : ''}命中 IP 频率限制规则`;
      }
    },
  },
  IPBL: {
    stage: 1,
    moduleZh: 'IP黑白名单',
    moduleEn: 'IP Allow/Block List',
    moduleTh: 'บัญชีขาว/ดำ IP',
    moduleRu: 'Белый/чёрный список IP',
    idPrefix: 'IPBL-',
    listSummary: (v, lang) => {
      const ip = val(v, 'source_ip');
      const allow = isAllowList(v);
      switch (lang) {
        case 'en':
          return `${ip} hit ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th':
          return `${ip} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}`;
        case 'ru':
          return `${ip} в ${allow ? 'белом' : 'чёрном'} списке`;
        default:
          return `${ip} 命中${allow ? '白名单' : '黑名单'}`;
      }
    },
    hitDetail: (v, lang) => {
      const ip = val(v, 'source_ip');
      const entry = optionalVal(v, 'entry');
      const allow = isAllowList(v);
      switch (lang) {
        case 'en':
          return `IP ${ip} hit the ${allow ? 'allowlist' : 'blocklist'}${entry ? ` entry ${entry}` : ''}`;
        case 'th':
          return `IP ${ip} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}${entry ? ` รายการ ${entry}` : ''}`;
        case 'ru':
          return `IP ${ip} в ${allow ? 'белом' : 'чёрном'} списке${entry ? `, запись ${entry}` : ''}`;
        default:
          return `IP ${ip} 命中${allow ? '白名单' : '黑名单'}${entry ? `条目 ${entry}` : ''}`;
      }
    },
  },
  RBL: {
    stage: 1,
    moduleZh: 'RBL过滤',
    moduleEn: 'RBL Filter',
    moduleTh: 'ตัวกรอง RBL',
    moduleRu: 'Фильтр RBL',
    idPrefix: 'RBL-',
    listSummary: (v, lang) => {
      const ip = val(v, 'source_ip');
      switch (lang) {
        case 'en':
          return `${ip} flagged by RBL`;
        case 'th':
          return `${ip} ถูกทำเครื่องหมายโดย RBL`;
        case 'ru':
          return `${ip} помечен RBL`;
        default:
          return `${ip} 被RBL标记`;
      }
    },
    hitDetail: (v, lang) => {
      const ip = optionalVal(v, 'source_ip');
      switch (lang) {
        case 'en':
          return `${ip ? `IP ${ip} was` : 'Source IP was'} flagged by an RBL rule`;
        case 'th':
          return `${ip ? `IP ${ip}` : 'IP ต้นทาง'} ถูกทำเครื่องหมายโดยกฎ RBL`;
        case 'ru':
          return `${ip ? `IP ${ip}` : 'IP источника'} помечен правилом RBL`;
        default:
          return `${ip ? `IP ${ip}` : '来源 IP'} 命中 RBL 过滤规则`;
      }
    },
  },
  OVERSEAS: {
    stage: 1,
    moduleZh: '境外邮件',
    moduleEn: 'Overseas Mail',
    moduleTh: 'อีเมลจากต่างประเทศ',
    moduleRu: 'Зарубежная почта',
    idPrefix: 'OVERSEAS-',
    listSummary: (v, lang) => {
      const ip = optionalVal(v, 'source_ip');
      switch (lang) {
        case 'en':
          return `${ip ? `${ip} hit` : 'Hit'} overseas-mail rule`;
        case 'th':
          return `${ip ? `${ip} ` : ''}ตรงกับกฎอีเมลต่างประเทศ`;
        case 'ru':
          return `${ip ? `${ip} ` : ''}соответствует правилу зарубежной почты`;
        default:
          return `${ip ? `${ip} ` : ''}命中境外邮件规则`;
      }
    },
    hitDetail: (v, lang) => {
      const ip = optionalVal(v, 'source_ip');
      switch (lang) {
        case 'en':
          return `${ip ? `Source IP ${ip} hit` : 'Hit'} an overseas-mail rule`;
        case 'th':
          return `${ip ? `IP ต้นทาง ${ip} ` : ''}ตรงกับกฎอีเมลต่างประเทศ`;
        case 'ru':
          return `${ip ? `IP источника ${ip} ` : ''}соответствует правилу зарубежной почты`;
        default:
          return `${ip ? `来源 IP ${ip} ` : ''}命中境外邮件规则`;
      }
    },
  },

  // ===== 阶段二：收发信人策略（身份层）=====
  SBL: {
    stage: 2,
    // GT-12214: 该模块同时承载黑名单与白名单，模块名与命中文案必须按
    // hit_values.list_type 区分；此前一律写死 blacklist，命中白名单也显示
    // "命中黑名单"，误导运维与审计。
    moduleZh: '发件人黑白名单',
    moduleEn: 'Sender Allow/Block List',
    moduleTh: 'บัญชีดำ/ขาวผู้ส่ง',
    moduleRu: 'Списки отправителей',
    idPrefix: 'SBL-',
    listSummary: (v, lang) => {
      const s = val(v, 'sender');
      const allow = isAllowList(v);
      switch (lang) {
        case 'en':
          return `${s} hit ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th':
          return `${s} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}`;
        case 'ru':
          return `${s} в ${allow ? 'белом' : 'чёрном'} списке`;
        default:
          return `${s} 命中${allow ? '白名单' : '黑名单'}`;
      }
    },
    hitDetail: (v, lang) => {
      const s = val(v, 'sender');
      const mt = senderMatchTypeLabel(optionalVal(v, 'match_type'), lang);
      const allow = isAllowList(v);
      switch (lang) {
        case 'en':
          return `Sender ${s} matched${mt ? ` ${mt}` : ''} ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th':
          return `ผู้ส่ง ${s} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}${mt ? `ระดับ${mt}` : ''}`;
        case 'ru':
          return mt
            ? `Отправитель ${s}: ${mt}, ${allow ? 'белый' : 'чёрный'} список`
            : `Отправитель ${s} в ${allow ? 'белом' : 'чёрном'} списке`;
        default:
          return `发件人 ${s} 命中${mt ?? ''}${allow ? '白名单' : '黑名单'}`;
      }
    },
  },
  AUTH: {
    stage: 2,
    moduleZh: '认证与仿冒检测',
    moduleEn: 'Auth & Spoofing',
    moduleTh: 'การตรวจสอบและตรวจจับการปลอมแปลง',
    moduleRu: 'Аутентификация и подмена',
    idPrefix: 'AUTH-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Hit authentication or spoofing rule';
        case 'th':
          return 'ตรงกับกฎการยืนยันตัวตนหรือการปลอมแปลง';
        case 'ru':
          return 'Сработало правило аутентификации или подмены';
        default:
          return '命中认证与仿冒检测规则';
      }
    },
    hitDetail: (v, lang) => {
      const sender = optionalVal(v, 'sender');
      switch (lang) {
        case 'en':
          return `${sender ? `Sender ${sender} hit` : 'Hit'} an authentication or spoofing detection rule`;
        case 'th':
          return `${sender ? `ผู้ส่ง ${sender} ` : ''}ตรงกับกฎการยืนยันตัวตนหรือการปลอมแปลง`;
        case 'ru':
          return `${sender ? `Отправитель ${sender} ` : ''}соответствует правилу аутентификации или подмены`;
        default:
          return `${sender ? `发件人 ${sender} ` : ''}命中认证与仿冒检测规则`;
      }
    },
  },
  BEHAVIOR: {
    stage: 2,
    moduleZh: '发送行为管控',
    moduleEn: 'Sending Behavior',
    moduleTh: 'การควบคุมพฤติกรรมการส่ง',
    moduleRu: 'Контроль поведения отправки',
    idPrefix: 'BEHAVIOR-',
    listSummary: (v, lang) => {
      const s = val(v, 'sender');
      switch (lang) {
        case 'en':
          return `${s} abnormal sending behavior`;
        case 'th':
          return `${s} พฤติกรรมการส่งผิดปกติ`;
        case 'ru':
          return `${s} аномальное поведение отправки`;
        default:
          return `${s} 发信行为异常`;
      }
    },
    hitDetail: (v, lang) => {
      const s = optionalVal(v, 'sender');
      const at = behaviorDimensionLabel(optionalVal(v, 'abnormal_type'), lang);
      const count = optionalVal(v, 'count');
      const threshold = optionalVal(v, 'threshold');
      if (at && count && threshold) {
        switch (lang) {
          case 'en':
            return `${s ? `Sender ${s}: ` : ''}${at} count ${count} reached trigger threshold ${threshold}`;
          case 'th':
            return `${s ? `ผู้ส่ง ${s}: ` : ''}${at} ${count} ถึงเกณฑ์ทริกเกอร์ ${threshold}`;
          case 'ru':
            return `${s ? `Отправитель ${s}: ` : ''}${at}: ${count}, достигнут порог срабатывания ${threshold}`;
          default:
            return `${s ? `发件人 ${s} ` : ''}${at}当前计数 ${count}，达到触发阈值 ${threshold}`;
        }
      }
      switch (lang) {
        case 'en':
          return `${s ? `Sender ${s} hit` : 'Hit'} a sending-behavior rule`;
        case 'th':
          return `${s ? `ผู้ส่ง ${s} ` : ''}ตรงกับกฎพฤติกรรมการส่ง`;
        case 'ru':
          return `${s ? `Отправитель ${s} ` : ''}соответствует правилу поведения отправки`;
        default:
          return `${s ? `发件人 ${s} ` : ''}命中发送行为管控规则`;
      }
    },
  },
  RCPT: {
    stage: 2,
    moduleZh: '收件人检测',
    moduleEn: 'Recipient Check',
    moduleTh: 'การตรวจสอบผู้รับ',
    moduleRu: 'Проверка получателей',
    idPrefix: 'RCPT-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Hit recipient-check rule';
        case 'th':
          return 'ตรงกับกฎตรวจสอบผู้รับ';
        case 'ru':
          return 'Сработало правило проверки получателей';
        default:
          return '命中收件人检测规则';
      }
    },
    hitDetail: (v, lang) => {
      const c = optionalVal(v, 'count');
      const l = optionalVal(v, 'limit');
      if (c && l) {
        switch (lang) {
          case 'en':
            return `Recipient count ${c} exceeded limit ${l}`;
          case 'th':
            return `จำนวนผู้รับ ${c} เกินขีดจำกัด ${l}`;
          case 'ru':
            return `Количество получателей ${c} превышает лимит ${l}`;
          default:
            return `收件人数量 ${c} 超过限制 ${l}`;
        }
      }
      switch (lang) {
        case 'en':
          return 'Hit a recipient-check rule';
        case 'th':
          return 'ตรงกับกฎตรวจสอบผู้รับ';
        case 'ru':
          return 'Сработало правило проверки получателей';
        default:
          return '命中收件人检测规则';
      }
    },
  },
  UBL: {
    stage: 2,
    moduleZh: '用户黑白名单',
    moduleEn: 'User Allow/Block List',
    moduleTh: 'บัญชีขาว/ดำผู้ใช้',
    moduleRu: 'Белый/чёрный список пользователей',
    idPrefix: 'UBL-',
    listSummary: (v, lang) => {
      const allow = isAllowList(v);
      switch (lang) {
        case 'en':
          return `Hit user ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th':
          return `ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}ผู้ใช้`;
        case 'ru':
          return `Совпадение с ${allow ? 'белым' : 'чёрным'} списком пользователей`;
        default:
          return `命中用户${allow ? '白名单' : '黑名单'}`;
      }
    },
    hitDetail: (v, lang) => {
      const allow = isAllowList(v);
      switch (lang) {
        case 'en':
          return `Matched a user ${allow ? 'allowlist' : 'blocklist'} rule`;
        case 'th':
          return `ตรงกับกฎ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}ผู้ใช้`;
        case 'ru':
          return `Сработало правило ${allow ? 'белого' : 'чёрного'} списка пользователей`;
        default:
          return `命中用户${allow ? '白名单' : '黑名单'}规则`;
      }
    },
  },

  // ===== 阶段三：内容层 =====
  'ATT-BASIC': {
    stage: 3,
    moduleZh: '附件安全检测',
    moduleEn: 'Attachment Security',
    moduleTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleRu: 'Безопасность вложений',
    idPrefix: 'ATT-BASIC-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Hit attachment-security rule';
        case 'th':
          return 'ตรงกับกฎความปลอดภัยของไฟล์แนบ';
        case 'ru':
          return 'Сработало правило безопасности вложений';
        default:
          return '命中附件安全检测规则';
      }
    },
    hitDetail: (v, lang) => {
      const c = optionalVal(v, 'count');
      const l = optionalVal(v, 'limit');
      if (c && l) {
        switch (lang) {
          case 'en':
            return `Attachment measurement ${c} exceeded configured limit ${l}`;
          case 'th':
            return `ค่าที่วัดได้ของไฟล์แนบ ${c} เกินขีดจำกัด ${l}`;
          case 'ru':
            return `Показатель вложения ${c} превышает лимит ${l}`;
          default:
            return `附件检测值 ${c} 超过配置限制 ${l}`;
        }
      }
      switch (lang) {
        case 'en':
          return 'Hit an attachment-security rule';
        case 'th':
          return 'ตรงกับกฎความปลอดภัยของไฟล์แนบ';
        case 'ru':
          return 'Сработало правило безопасности вложений';
        default:
          return '命中附件安全检测规则';
      }
    },
  },
  'ATT-AV': {
    stage: 3,
    moduleZh: '反病毒引擎',
    moduleEn: 'Anti-Virus Engine',
    moduleTh: 'เอนจินป้องกันไวรัส',
    moduleRu: 'Антивирусный движок',
    idPrefix: 'ATT-AV-',
    listSummary: (v, lang) => {
      const vn = optionalVal(v, 'virus_name');
      switch (lang) {
        case 'en':
          return vn ? `Detected ${vn}` : 'Antivirus detection hit';
        case 'th':
          return vn ? `ตรวจพบ ${vn}` : 'ตรงกับการตรวจจับไวรัส';
        case 'ru':
          return vn ? `Обнаружено: ${vn}` : 'Сработало антивирусное обнаружение';
        default:
          return vn ? `检出 ${vn}` : '反病毒检测命中';
      }
    },
    hitDetail: (v, lang) => {
      const vn = optionalVal(v, 'virus_name');
      switch (lang) {
        case 'en':
          return vn ? `Antivirus engine detected ${vn}` : 'Antivirus detection hit';
        case 'th':
          return vn ? `เอนจินป้องกันไวรัสตรวจพบ ${vn}` : 'ตรงกับการตรวจจับไวรัส';
        case 'ru':
          return vn ? `Антивирус обнаружил ${vn}` : 'Сработало антивирусное обнаружение';
        default:
          return vn ? `反病毒引擎检出 ${vn}` : '反病毒检测命中';
      }
    },
  },
  'ATT-QR': {
    stage: 3,
    moduleZh: '附件安全检测',
    moduleEn: 'Attachment Security',
    moduleTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleRu: 'Безопасность вложений',
    idPrefix: 'ATT-QR-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'QR code detected';
        case 'th':
          return 'ตรวจพบ QR code';
        case 'ru':
          return 'Обнаружен QR-код';
        default:
          return '检测到二维码';
      }
    },
    hitDetail: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'QR code detected in attachment image (typical phishing carrier)';
        case 'th':
          return 'ตรวจพบ QR code ในภาพไฟล์แนบ (พาหะฟิชชิงทั่วไป)';
        case 'ru':
          return 'В изображении вложения обнаружен QR-код (типичный носитель фишинга)';
        default:
          return '附件图片中检测到二维码（钓鱼邮件典型载体）';
      }
    },
  },
  'ATT-ENC': {
    stage: 3,
    moduleZh: '附件安全检测',
    moduleEn: 'Attachment Security',
    moduleTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleRu: 'Безопасность вложений',
    idPrefix: 'ATT-ENC-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Encrypted attachment cannot be decrypted';
        case 'th':
          return 'ไฟล์แนบเข้ารหัสไม่สามารถถอดรหัสได้';
        case 'ru':
          return 'Зашифрованное вложение не удаётся расшифровать';
        default:
          return '加密附件无法解密';
      }
    },
    hitDetail: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'An encrypted attachment could not be decrypted, so its content could not be inspected';
        case 'th':
          return 'ไม่สามารถถอดรหัสไฟล์แนบที่เข้ารหัสได้ จึงไม่สามารถตรวจสอบเนื้อหา';
        case 'ru':
          return 'Зашифрованное вложение не удалось расшифровать, поэтому содержимое не проверено';
        default:
          return '检测到无法解密的加密附件，内容不可检测';
      }
    },
  },
  URL: {
    stage: 3,
    moduleZh: 'URL防护',
    moduleEn: 'URL Protection',
    moduleTh: 'การป้องกัน URL',
    moduleRu: 'Защита URL',
    idPrefix: 'URL-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Hit link protection';
        case 'th':
          return 'ตรงกับการป้องกันลิงก์';
        case 'ru':
          return 'Сработала защита ссылок';
        default:
          return '命中链接保护';
      }
    },
    hitDetail: (v, lang) => {
      const url = optionalVal(v, 'url');
      const mt = optionalVal(v, 'match_type');
      if (!url) {
        switch (lang) {
          case 'en':
            return 'Hit a URL-protection rule';
          case 'th':
            return 'ตรงกับกฎการป้องกัน URL';
          case 'ru':
            return 'Сработало правило защиты URL';
          default:
            return '命中 URL 防护规则';
        }
      }
      switch (lang) {
        case 'en':
          return `Link ${url} matched${mt ? ` ${mt}` : ''} URL rule`;
        case 'th':
          return `ลิงก์ ${url} ตรงกับกฎ URL${mt ? ` ${mt}` : ''}`;
        case 'ru':
          return `Ссылка ${url} совпала с правилом URL${mt ? ` (${mt})` : ''}`;
        default:
          return `链接 ${url} 命中${mt ? ` ${mt}` : ''} URL 规则`;
      }
    },
  },
  CR: {
    stage: 3,
    moduleZh: '内容规则',
    moduleEn: 'Content Rule',
    moduleTh: 'กฎเนื้อหา',
    moduleRu: 'Контентное правило',
    idPrefix: 'CR-',
    listSummary: (v, lang) => {
      const mm = crMethodLabel(val(v, 'match_method', ''), lang);
      if (!mm) {
        switch (lang) {
          case 'en':
            return 'Matched content rule';
          case 'th':
            return 'ตรงกับกฎเนื้อหา';
          case 'ru':
            return 'Совпадение с контентным правилом';
          default:
            return '命中内容规则';
        }
      }
      switch (lang) {
        case 'en':
          return `Matched ${mm}`;
        case 'th':
          return `ตรงกับ${mm}`;
        case 'ru':
          return `Совпадение по ${mm}`;
        default:
          return `命中 ${mm}`;
      }
    },
    hitDetail: (v, lang) => {
      const method = val(v, 'match_method', '');
      const content = val(v, 'match_content', '');
      // content_group 编译成 rcpttags/hasTag，没有邮件内容意义上的命中位置，
      // 走独立文案，不套"邮件 {位置} 匹配 {方式} {内容}"模板。
      if (method === 'content_group') {
        switch (lang) {
          case 'en':
            return `Mail matched content group "${content}"`;
          case 'th':
            return `อีเมลตรงกับกลุ่มเนื้อหา "${content}"`;
          case 'ru':
            return `Письмо совпало с контентной группой "${content}"`;
          default:
            return `邮件命中内容组 “${content}”`;
        }
      }

      const mm = crMethodLabel(method, lang);
      const positions = val(v, 'match_position', '').split(',').filter(Boolean);
      const snippets = val(v, 'matched_content', '').split(' | ');

      // GT-12727 §7.10.4：match_content 缺失时不得渲染出空引号（`匹配 关键词 ""`）
      // —— 空洞占位与本工单要消灭的"可读的错误结论"同类。有内容才带引号。
      const quoted = content ? (lang === 'zh' ? `“${content}”` : `"${content}"`) : '';
      const withQuoted = (prefix: string) => (quoted ? `${prefix} ${quoted}` : prefix);

      // 缺字段时不编造 —— 兜底成"正文/关键词/-"正是 GT-12727 这个 bug 的放大器。
      if (positions.length === 0) {
        if (!mm) {
          switch (lang) {
            case 'en':
              return 'Matched content rule';
            case 'th':
              return 'ตรงกับกฎเนื้อหา';
            case 'ru':
              return 'Совпадение с контентным правилом';
            default:
              return '命中内容规则';
          }
        }
        switch (lang) {
          case 'en':
            return withQuoted(`Mail matched ${mm}`);
          case 'th':
            return withQuoted(`อีเมลตรงกับ${mm}`);
          case 'ru':
            return withQuoted(`Письмо совпало с ${mm}`);
          default:
            return withQuoted(`邮件匹配 ${mm}`);
        }
      }

      const posLabels = positions.map((p) => crPositionLabel(p, lang));
      const detail = positions
        .map((p, i) => (snippets[i] ? `${crPositionLabel(p, lang)}“${snippets[i]}”` : ''))
        .filter(Boolean)
        .join(lang === 'zh' ? '；' : '; ');

      let head: string;
      switch (lang) {
        case 'en':
          head = withQuoted(`Mail ${posLabels.join(', ')} matched ${mm}`);
          break;
        case 'th':
          head = withQuoted(`อีเมล ${posLabels.join('、')} ตรงกับ${mm}`);
          break;
        case 'ru':
          head = withQuoted(`${posLabels.join(', ')} письма совпало с ${mm}`);
          break;
        default:
          head = withQuoted(`邮件 ${posLabels.join('、')} 匹配 ${mm}`);
      }
      if (!detail) return head;
      switch (lang) {
        case 'en':
          return `${head}\nMatched: ${detail}`;
        case 'th':
          return `${head}\nที่ตรงกัน: ${detail}`;
        case 'ru':
          return `${head}\nСовпадение: ${detail}`;
        default:
          return `${head}\n实际命中：${detail}`;
      }
    },
  },
  INTENT: {
    stage: 3,
    moduleZh: '意图引擎',
    moduleEn: 'Intent Engine',
    moduleTh: 'เอนจินเจตนา',
    moduleRu: 'Движок намерений',
    idPrefix: 'INTENT-',
    listSummary: (v, lang) => {
      const tl = val(v, 'tag_label', lang === 'zh' ? '垃圾邮件' : 'spam');
      switch (lang) {
        case 'en':
          return `Classified as ${tl}`;
        case 'th':
          return `จัดประเภทเป็น${tl}`;
        case 'ru':
          return `Классифицировано как ${tl}`;
        default:
          return `判定为${tl}`;
      }
    },
    hitDetail: (v, lang) => {
      const ti = val(v, 'tag_id', 'Tag3');
      const tl = val(v, 'tag_label', lang === 'zh' ? '垃圾邮件' : 'spam');
      const rawConfidence = v.confidence;
      const hasConfidence =
        rawConfidence !== undefined && rawConfidence !== null && rawConfidence !== '';
      const cf = hasConfidence ? String(rawConfidence) : '';
      switch (lang) {
        case 'en':
          return `${ti} classified as ${tl}${hasConfidence ? ` (confidence: ${cf}%)` : ''}`;
        case 'th':
          return `${ti} จัดประเภทเป็น${tl}${hasConfidence ? ` (ความมั่นใจ: ${cf}%)` : ''}`;
        case 'ru':
          return `${ti} классифицировано как ${tl}${hasConfidence ? ` (уверенность: ${cf}%)` : ''}`;
        default:
          return `${ti} 判定为${tl}${hasConfidence ? `（置信度：${cf}%）` : ''}`;
      }
    },
  },

  // ===== 阶段四：智能分析层（AI 形态）=====
  'AI-PHISH': {
    stage: 4,
    moduleZh: '钓鱼邮件检测智能体',
    moduleEn: 'Phishing AI Agent',
    moduleTh: 'เอเจนต์ AI ตรวจจับฟิชชิง',
    moduleRu: 'AI-агент обнаружения фишинга',
    idPrefix: 'AI-PHISH-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Classified as phishing';
        case 'th':
          return 'จัดประเภทเป็นฟิชชิง';
        case 'ru':
          return 'Классифицировано как фишинг';
        default:
          return '判定为钓鱼邮件';
      }
    },
    hitDetail: (v, lang) => {
      const cf = optionalVal(v, 'confidence');
      switch (lang) {
        case 'en':
          return `AI classified the message as phishing${cf ? ` (confidence: ${cf}%)` : ''}`;
        case 'th':
          return `AI จัดประเภทอีเมลเป็นฟิชชิง${cf ? ` (ความมั่นใจ: ${cf}%)` : ''}`;
        case 'ru':
          return `AI классифицировал письмо как фишинг${cf ? ` (уверенность: ${cf}%)` : ''}`;
        default:
          return `AI 判定为钓鱼邮件${cf ? `（置信度：${cf}%）` : ''}`;
      }
    },
  },
  'AI-SPOOF': {
    stage: 4,
    moduleZh: '仿冒邮件检测智能体',
    moduleEn: 'Spoofing AI Agent',
    moduleTh: 'เอเจนต์ AI ตรวจจับการปลอมแปลง',
    moduleRu: 'AI-агент обнаружения подмены',
    idPrefix: 'AI-SPOOF-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Classified as identity spoofing';
        case 'th':
          return 'จัดประเภทเป็นการปลอมแปลงตัวตน';
        case 'ru':
          return 'Классифицировано как подмена личности';
        default:
          return '判定为身份仿冒';
      }
    },
    hitDetail: (v, lang) => {
      const cf = optionalVal(v, 'confidence');
      switch (lang) {
        case 'en':
          return `AI classified the message as identity spoofing${cf ? ` (confidence: ${cf}%)` : ''}`;
        case 'th':
          return `AI จัดประเภทอีเมลเป็นการปลอมแปลงตัวตน${cf ? ` (ความมั่นใจ: ${cf}%)` : ''}`;
        case 'ru':
          return `AI классифицировал письмо как подмену личности${cf ? ` (уверенность: ${cf}%)` : ''}`;
        default:
          return `AI 判定为身份仿冒邮件${cf ? `（置信度：${cf}%）` : ''}`;
      }
    },
  },
  'AI-TRACE': {
    stage: 4,
    moduleZh: '威胁回溯智能体',
    moduleEn: 'Threat Trace Agent',
    moduleTh: 'เอเจนต์ AI ติดตามภัยคุกคาม',
    moduleRu: 'AI-агент отслеживания угроз',
    idPrefix: 'AI-TRACE-',
    listSummary: (v, lang) => {
      const threatType = threatRetroTypeLabel(optionalVal(v, 'threat_type'), lang);
      switch (lang) {
        case 'en':
          return threatType ? `Traceback found ${threatType}` : 'Threat found during traceback';
        case 'th':
          return threatType ? `การติดตามพบ${threatType}` : 'พบภัยคุกคามระหว่างการติดตาม';
        case 'ru':
          return threatType
            ? `При ретроспективном анализе обнаружено: ${threatType}`
            : 'При ретроспективном анализе обнаружена угроза';
        default:
          return threatType ? `回溯发现${threatType}风险` : '回溯发现威胁';
      }
    },
    hitDetail: (v, lang) => {
      const threatType = threatRetroTypeLabel(optionalVal(v, 'threat_type'), lang);
      const confidence = optionalVal(v, 'confidence');
      switch (lang) {
        case 'en':
          return `Threat traceback found ${threatType ? `${threatType} risk` : 'a risk'} in previously delivered mail${confidence ? ` (confidence: ${confidence}%)` : ''}`;
        case 'th':
          return `การติดตามภัยคุกคามพบ${threatType ? `ความเสี่ยง${threatType}` : 'ความเสี่ยง'}ในอีเมลที่ส่งแล้ว${confidence ? ` (ความมั่นใจ: ${confidence}%)` : ''}`;
        case 'ru':
          return `Ретроспективный анализ выявил ${threatType ? `риск «${threatType}»` : 'риск'} в ранее доставленном письме${confidence ? ` (уверенность: ${confidence}%)` : ''}`;
        default:
          return `威胁回溯发现已投递邮件存在${threatType ? `${threatType}风险` : '风险'}${confidence ? `（置信度：${confidence}%）` : ''}`;
      }
    },
  },

  // ===== 阶段五：综合策略 =====
  SIM: {
    stage: 5,
    moduleZh: '相似邮件检测',
    moduleEn: 'Similar Mail',
    moduleTh: 'การตรวจจับอีเมลที่คล้ายกัน',
    moduleRu: 'Похожие письма',
    idPrefix: 'SIM-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Highly similar to known mail';
        case 'th':
          return 'คล้ายกับอีเมลที่รู้จักอย่างมาก';
        case 'ru':
          return 'Очень похоже на известное письмо';
        default:
          return '与已知邮件高度相似';
      }
    },
    hitDetail: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Hit a similar-mail detection rule';
        case 'th':
          return 'ตรงกับกฎตรวจจับอีเมลที่คล้ายกัน';
        case 'ru':
          return 'Сработало правило обнаружения похожих писем';
        default:
          return '命中相似邮件检测规则';
      }
    },
  },
  ACF: {
    stage: 5,
    // GT-12192: align the mail-disposal module label with the canonical
    // pipeline name (pipeline.advancedRules) — "高级过滤规则", not the legacy
    // demo "高级内容过滤".
    moduleZh: '高级过滤规则',
    moduleEn: 'Advanced Filter Rules',
    moduleTh: 'กฎการกรองขั้นสูง',
    moduleRu: 'Расширенные правила фильтрации',
    idPrefix: 'ACF-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Rule matched';
        case 'th':
          return 'ตรงกับกฎ';
        case 'ru':
          return 'Совпадение правила';
        default:
          return '命中规则';
      }
    },
    hitDetail: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Advanced-filter condition matched';
        case 'th':
          return 'ตรงกับเงื่อนไขตัวกรองขั้นสูง';
        case 'ru':
          return 'Условие расширенного фильтра выполнено';
        default:
          return '高级过滤规则条件命中';
      }
    },
  },
  'MAIL-MARK': {
    stage: 5,
    moduleZh: '邮件标记与声明',
    moduleEn: 'Mail Marking & Disclaimer',
    moduleTh: 'การทำเครื่องหมายและข้อจำกัดความรับผิดของอีเมล',
    moduleRu: 'Маркировка писем и дисклеймер',
    idPrefix: 'MAIL-MARK-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'Mail-marking rule executed';
        case 'th':
          return 'ดำเนินการกฎการทำเครื่องหมายอีเมล';
        case 'ru':
          return 'Выполнено правило маркировки письма';
        default:
          return '邮件标记规则已执行';
      }
    },
    hitDetail: (_v, lang) => {
      switch (lang) {
        case 'en':
          return 'The matched rule applied its configured mark or disclaimer';
        case 'th':
          return 'กฎที่ตรงกันใช้เครื่องหมายหรือข้อจำกัดความรับผิดตามที่กำหนด';
        case 'ru':
          return 'Совпавшее правило применило настроенную маркировку или дисклеймер';
        default:
          return '命中规则已按配置应用邮件标记或免责声明';
      }
    },
  },
};

// 动作四语言文案。
const ACTION_LABEL: Record<DisposalAction, Record<DisposalLang, string>> = {
  quarantine: { zh: '隔离', en: 'Quarantine', th: 'กักกัน', ru: 'Карантин' },
  discard: { zh: '丢弃', en: 'Discard', th: 'ทิ้ง', ru: 'Удалить' },
  tag: { zh: '标记', en: 'Tag', th: 'ทำเครื่องหมาย', ru: 'Метка' },
  deliver: { zh: '投递', en: 'Deliver', th: 'จัดส่ง', ru: 'Доставить' },
  recall: { zh: '召回', en: 'Recall', th: 'เรียกคืน', ru: 'Отозвать' },
  audit: { zh: '审核', en: 'Audit', th: 'ตรวจสอบ', ru: 'Аудит' },
  reject: { zh: '拒收', en: 'Reject', th: 'ปฏิเสธ', ru: 'Отклонить' },
  bounce: { zh: '退信', en: 'Bounce', th: 'ตีกลับ', ru: 'Отказ' },
  sideline: { zh: '旁路', en: 'Sideline', th: 'เบี่ยงเบน', ru: 'Обход' },
  accept: { zh: '放行', en: 'Accept', th: 'อนุญาต', ru: 'Принять' },
  proceed: {
    zh: '进行下一步',
    en: 'Proceed',
    th: 'ดำเนินการต่อ',
    ru: 'Продолжить',
  },
};

// 动作分色（Badge）。
const ACTION_COLOR: Record<DisposalAction, string> = {
  quarantine: 'bg-orange-100 text-orange-700',
  discard: 'bg-red-100 text-red-700',
  tag: 'bg-blue-100 text-blue-700',
  deliver: 'bg-green-100 text-green-700',
  recall: 'bg-purple-100 text-purple-700',
  audit: 'bg-amber-100 text-amber-700',
  reject: 'bg-red-100 text-red-700',
  bounce: 'bg-red-100 text-red-700',
  sideline: 'bg-orange-100 text-orange-700',
  accept: 'bg-green-100 text-green-700',
  proceed: 'bg-blue-100 text-blue-700',
};

function moduleOf(meta: PolicyMeta, lang: DisposalLang): string {
  switch (lang) {
    case 'en':
      return meta.moduleEn;
    case 'th':
      return meta.moduleTh;
    case 'ru':
      return meta.moduleRu;
    default:
      return meta.moduleZh;
  }
}

export function getPolicyMeta(policyKey: string): PolicyMeta | undefined {
  return DISPOSAL_POLICY_MAP[policyKey];
}

// 判断 policy_key 是否属于阶段1（连接层/IP策略）。
// 用于多租户产品形态下租户管理员视角的处置依据模糊化展示：
// 阶段1策略为平台级，租户无权查看/配置，展示"平台策略"而非内部模块细节。
export function isStage1Policy(policyKey?: string): boolean {
  if (!policyKey) return false;
  const meta = DISPOSAL_POLICY_MAP[policyKey];
  return meta?.stage === 1;
}

export function getActionLabel(action: string, lang: DisposalLang = 'zh'): string {
  return ACTION_LABEL[action as DisposalAction]?.[lang] ?? action;
}

export function getActionColor(action: string): string {
  return ACTION_COLOR[action as DisposalAction] ?? 'bg-gray-100 text-gray-700';
}

export function getStageColor(stage: number): string {
  return STAGE_COLOR[stage] ?? 'bg-gray-400';
}

export function getPolicyRoute(policyKey: string): string | undefined {
  const meta = DISPOSAL_POLICY_MAP[policyKey];
  return meta ? STAGE_ROUTE[meta.stage] : undefined;
}

// 将后端返回的 hit_values (Record<string, string>) 转换为模板使用的 HitValues。
function toHitValues(v?: Record<string, string>): HitValues | undefined {
  if (!v) return undefined;
  return v as HitValues;
}

// 列表页文案：模块「规则名」· 命中简述
export function formatListReason(basis: DisposalBasis, lang: DisposalLang = 'zh'): string {
  if (!basis?.policy_key) return '';
  const meta = DISPOSAL_POLICY_MAP[basis.policy_key];
  if (!meta) return '';
  const moduleName = moduleOf(meta, lang);
  const hv = toHitValues(basis.hit_values) ?? {};
  const summary = meta.listSummary(hv, lang);
  const ruleName = basis.rule_name ?? '';
  return `${moduleName}「${ruleName}」· ${summary}`;
}

// 详情页「命中」描述（变量已替换）。
export function formatHitDetail(basis: DisposalBasis, lang: DisposalLang = 'zh'): string {
  if (!basis?.policy_key) return '';
  const meta = DISPOSAL_POLICY_MAP[basis.policy_key];
  if (!meta) return '';
  const hv = toHitValues(basis.hit_values) ?? {};
  const detail = meta.hitDetail(hv, lang);
  // ACF tags are a top-level Basis field, not hit_values. Keep that schema
  // boundary explicit so a missing hit_values.detection_tags can never render
  // as a fabricated "-" value.
  if (basis.policy_key === 'ACF' && basis.detection_tags?.length) {
    const tags = basis.detection_tags.join('、');
    switch (lang) {
      case 'en':
        return `${detail}; related detection tags: ${tags}`;
      case 'th':
        return `${detail}; แท็กการตรวจจับที่เกี่ยวข้อง: ${tags}`;
      case 'ru':
        return `${detail}; связанные теги обнаружения: ${tags}`;
      default:
        return `${detail}，关联检测标签：${tags}`;
    }
  }
  return detail;
}

// GT-12727 spec §7.10.3：命中模块清单的**唯一**取数口径，兼容两种行格式。
//
//   新行：basis.modules 非空 —— 每条带 recipients / effective_for。
//   老行：只有 basis.per_recipient —— 逐收件人各存一份（含 N 份重复），
//         且**没有** effective_for。老的 per_recipient 全是各收件人的胜出者，
//         若按 [] 处理会把每条都标成"命中但未生效"，直接违反 §7.9
//         「两种行都渲染正确」。所以这里保持 effective_for 为 undefined
//         （= 无归属信息，前端不打任何徽标），并按 (policy_key, rule_id, action)
//         去重。
export function resolveHitModules(basis?: DisposalBasis): DisposalBasis[] {
  if (!basis) return [];
  if (Array.isArray(basis.modules) && basis.modules.length > 0) {
    return basis.modules;
  }
  const legacy = Array.isArray(basis.per_recipient) ? basis.per_recipient : [];
  const seen = new Set<string>();
  const out: DisposalBasis[] = [];
  for (const item of legacy) {
    if (!item) continue;
    // 去重键必须带 rule_name：未映射页（如 ip_frequency）的 policy_key 与显示态
    // rule_id **都是空串**，只用 (policy_key, rule_id, action) 会把两条不同的规则
    // 坍缩成一条 —— 与后端 MF-3 同一个坑。前端拿不到数值 id，rule_name 是这里
    // 唯一还能区分它们的字段。
    const key = JSON.stringify([
      item.policy_key ?? '',
      item.rule_id ?? '',
      item.action ?? '',
      item.rule_name ?? '',
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    // 显式剥掉 recipients/effective_for：老格式没有归属信息，不得伪造。
    const { recipients: _r, effective_for: _e, ...rest } = item;
    void _r;
    void _e;
    out.push(rest);
  }
  return out;
}

// 详情页模块名。
export function getModuleName(policyKey: string, lang: DisposalLang = 'zh'): string {
  const meta = DISPOSAL_POLICY_MAP[policyKey];
  if (!meta) return '';
  return moduleOf(meta, lang);
}

// GT-12236: 处置依据模块筛选按模块语义展示——原型要求附件安全检测作为单一
// 模块出现一次，但后端 policy_key 把它拆成 ATT-BASIC/ATT-QR/ATT-ENC 三个
// key。这里把同一阶段内同名模块的 key 分组合并：UI 只渲染一项，勾选时展开
// 为全部 key（后端 disposal_policy_keys 是多 key OR 语义，查询语义不变）。
export interface DisposalModuleGroup {
  stage: number;
  moduleName: string;
  keys: string[];
}

export function groupDisposalModulesByStage(lang: DisposalLang = 'zh'): DisposalModuleGroup[] {
  const groups: DisposalModuleGroup[] = [];
  for (const [key, meta] of Object.entries(DISPOSAL_POLICY_MAP)) {
    const moduleName = moduleOf(meta, lang);
    const existing = groups.find((g) => g.stage === meta.stage && g.moduleName === moduleName);
    if (existing) {
      existing.keys.push(key);
    } else {
      groups.push({ stage: meta.stage, moduleName, keys: [key] });
    }
  }
  return groups;
}

// ============================================================================
// GT-12935：群发邮件多处置依据分组（modules[] 为事实源）
// ============================================================================

export interface DisposalBasisRecipientGroup {
  policyKey: string;
  entries: DisposalBasis[];
  recipientCount: number;
  effectiveCount: number;
  effectiveKnown: boolean;
  matchesRootBasis: boolean;
}

function normalizedRecipient(value: string): string {
  return value.trim().toLowerCase();
}

export function recipientsOfBasisEntry(entry: DisposalBasis): string[] {
  if (entry.recipients?.length) return entry.recipients;
  return entry.recipient ? [entry.recipient] : [];
}

export type DisposalBasisRecipientState = 'effective' | 'hitOnly' | 'unknown';

export function recipientBasisState(
  entry: DisposalBasis,
  recipient: string,
): DisposalBasisRecipientState {
  if (entry.effective_for === undefined) return 'unknown';
  const normalized = normalizedRecipient(recipient);
  return entry.effective_for.some((item) => normalizedRecipient(item) === normalized)
    ? 'effective'
    : 'hitOnly';
}

export function groupRecipientBasisByPolicy(
  basis: DisposalBasis | undefined,
): DisposalBasisRecipientGroup[] {
  if (!basis) return [];
  // 列表单元格还要兼容只有根处置依据的历史行；详情页的“命中模块清单”则
  // 必须继续只认 modules/per_recipient，不能把根依据伪装成一条模块明细。
  const resolved = resolveHitModules(basis);
  const entries = resolved.length > 0 ? resolved : basis.policy_key ? [basis] : [];
  const groups: DisposalBasisRecipientGroup[] = [];
  for (const entry of entries) {
    if (!entry.policy_key) continue;
    let group = groups.find((candidate) => candidate.policyKey === entry.policy_key);
    if (!group) {
      group = {
        policyKey: entry.policy_key,
        entries: [],
        recipientCount: 0,
        effectiveCount: 0,
        effectiveKnown: false,
        matchesRootBasis: false,
      };
      groups.push(group);
    }
    group.entries.push(entry);
  }

  for (const group of groups) {
    const recipients = new Set<string>();
    const effective = new Set<string>();
    for (const entry of group.entries) {
      for (const recipient of recipientsOfBasisEntry(entry)) {
        const normalized = normalizedRecipient(recipient);
        if (normalized) recipients.add(normalized);
      }
      if (entry.effective_for !== undefined) {
        group.effectiveKnown = true;
        for (const recipient of entry.effective_for) {
          const normalized = normalizedRecipient(recipient);
          if (!normalized) continue;
          effective.add(normalized);
          recipients.add(normalized);
        }
      }
    }
    group.recipientCount = recipients.size;
    group.effectiveCount = effective.size;
    group.matchesRootBasis = group.entries.some(
      (entry) =>
        entry.policy_key === basis.policy_key &&
        (!basis.rule_id || entry.rule_id === basis.rule_id),
    );
  }
  return groups;
}

export interface DisposalBasisRuleRecipientGroup {
  policyKey: string;
  entry: DisposalBasis;
  recipients: string[];
}

// 详情页群发分叉使用“最终生效依据”而不是所有命中模块：新数据只纳入
// effective_for 非空的规则；明确未生效（[]）的模块仍保留在命中模块清单，
// 但不能被描述成某个收件人的最终处置依据。旧数据没有归属三态，只能按历史
// recipients/recipient 保守回落，并由规格明确标记边界。
export function groupEffectiveRecipientBasisByRule(
  basis: DisposalBasis | undefined,
): DisposalBasisRuleRecipientGroup[] {
  if (!basis) return [];
  const hasModules = Array.isArray(basis.modules) && basis.modules.length > 0;
  const hasLegacyEntries =
    !hasModules && Array.isArray(basis.per_recipient) && basis.per_recipient.length > 0;
  const modules = resolveHitModules(basis);
  const groups: DisposalBasisRuleRecipientGroup[] = [];
  const indexes = new Map<string, number>();

  for (const entry of modules) {
    if (!entry.policy_key) continue;
    // modules[] is the new hit ledger: only a non-empty effective_for proves
    // that this rule produced a final disposition. recipients alone means hit.
    // Legacy per_recipient[] predates effective_for and contains winners.
    const recipients = hasModules ? (entry.effective_for ?? []) : recipientsOfBasisEntry(entry);
    if (entry.action === 'proceed' || recipients.length === 0) continue;
    const key = JSON.stringify([
      entry.policy_key,
      entry.rule_id ?? '',
      entry.action ?? '',
      entry.rule_name ?? '',
    ]);
    const existingIndex = indexes.get(key);
    if (existingIndex !== undefined) {
      const existing = groups[existingIndex];
      const seen = new Set(existing.recipients.map(normalizedRecipient));
      for (const recipient of recipients) {
        if (!seen.has(normalizedRecipient(recipient))) {
          seen.add(normalizedRecipient(recipient));
          existing.recipients.push(recipient);
        }
      }
      continue;
    }
    indexes.set(key, groups.length);
    groups.push({
      policyKey: entry.policy_key,
      entry,
      recipients: [...recipients],
    });
  }

  // Early onconnect/MAIL rejection happens before recipients exist, so its
  // matching module cannot carry effective_for. Keep the authoritative root
  // only for a matching recipientless module. Never apply this fallback to a
  // module that names recipients: that shape proves a hit, not final ownership.
  if (groups.length === 0 && hasModules && basis.policy_key && basis.action !== 'proceed') {
    const matchesRecipientlessFinal = basis.modules!.some(
      (entry) =>
        entry.effective_for === undefined &&
        recipientsOfBasisEntry(entry).length === 0 &&
        entry.policy_key === basis.policy_key &&
        entry.action?.toLowerCase() === basis.action?.toLowerCase() &&
        (!basis.rule_id || entry.rule_id === basis.rule_id),
    );
    if (matchesRecipientlessFinal) {
      groups.push({
        policyKey: basis.policy_key,
        entry: basis,
        recipients: [],
      });
    }
  }

  if (
    groups.length === 0 &&
    !hasModules &&
    !hasLegacyEntries &&
    basis.policy_key &&
    basis.action !== 'proceed'
  ) {
    groups.push({
      policyKey: basis.policy_key,
      entry: basis,
      recipients: recipientsOfBasisEntry(basis),
    });
  }
  return groups;
}

// List/tooltip grouping for the product concept “处置依据”. It is deliberately
// derived from final rule groups, not from resolveHitModules (the hit ledger).
export function groupDispositionBasisByPolicy(
  basis: DisposalBasis | undefined,
): DisposalBasisRecipientGroup[] {
  if (!basis) return [];
  const ruleGroups = groupEffectiveRecipientBasisByRule(basis);
  const groups: DisposalBasisRecipientGroup[] = [];
  const recipientSets = new Map<string, Set<string>>();
  for (const ruleGroup of ruleGroups) {
    let group = groups.find((candidate) => candidate.policyKey === ruleGroup.policyKey);
    if (!group) {
      group = {
        policyKey: ruleGroup.policyKey,
        entries: [],
        recipientCount: 0,
        effectiveCount: 0,
        effectiveKnown: false,
        matchesRootBasis: false,
      };
      groups.push(group);
      recipientSets.set(ruleGroup.policyKey, new Set<string>());
    }
    group.entries.push(ruleGroup.entry);
    const recipients = recipientSets.get(ruleGroup.policyKey)!;
    for (const recipient of ruleGroup.recipients) {
      const normalized = normalizedRecipient(recipient);
      if (normalized) recipients.add(normalized);
    }
    group.recipientCount = recipients.size;
    group.effectiveCount = recipients.size;
    group.effectiveKnown = group.effectiveKnown || ruleGroup.entry.effective_for !== undefined;
    group.matchesRootBasis =
      group.matchesRootBasis ||
      (ruleGroup.entry.policy_key === basis.policy_key &&
        (!basis.rule_id || ruleGroup.entry.rule_id === basis.rule_id));
  }
  return groups;
}

export function hasStructuredBasisFacts(basis: DisposalBasis | undefined): boolean {
  return Boolean(
    basis && (basis.policy_key || basis.modules?.length || basis.per_recipient?.length),
  );
}

export function groupsFromSummaries(
  basis: DisposalBasis | undefined,
  summaries: DisposalBasisGroupSummary[] | undefined,
): DisposalBasisRecipientGroup[] {
  if (!summaries?.length) return groupDispositionBasisByPolicy(basis);
  return summaries.flatMap((summary) => {
    const entries = summary.entries.filter(
      (entry) =>
        !(
          entry.action === 'proceed' ||
          (entry.effective_known && entry.effective_count === 0) ||
          (summary.policy_key === 'AUTH' &&
            entry.action === 'accept' &&
            !entry.effective_known &&
            entry.effective_count === 0)
        ),
    );
    if (entries.length === 0) return [];
    const filtered = entries.length !== summary.entries.length;
    const recipientCount = filtered
      ? entries.reduce((total, entry) => total + entry.recipient_count, 0)
      : summary.recipient_count;
    const effectiveCount = filtered
      ? entries.reduce((total, entry) => total + entry.effective_count, 0)
      : summary.effective_count;
    const effectiveKnown = filtered
      ? entries.some((entry) => entry.effective_known)
      : summary.effective_known;
    return [
      {
        policyKey: summary.policy_key,
        entries: entries.map((entry) => ({
          policy_key: summary.policy_key,
          rule_name: entry.rule_name,
          rule_id: entry.rule_id,
          action: entry.action,
          hit_values: entry.hit_values,
          detection_tags: entry.detection_tags,
        })),
        recipientCount,
        effectiveCount,
        effectiveKnown,
        matchesRootBasis: entries.some(
          (entry) =>
            summary.policy_key === basis?.policy_key &&
            (!basis?.rule_id || entry.rule_id === basis.rule_id),
        ),
      },
    ];
  });
}

function groupMatchesHighlight(
  group: DisposalBasisRecipientGroup,
  highlightPolicyKeys?: string[],
  highlightRuleIds?: string[],
): boolean {
  return Boolean(
    highlightPolicyKeys?.includes(group.policyKey) ||
    group.entries.some((entry) =>
      Boolean(entry.rule_id && highlightRuleIds?.includes(entry.rule_id)),
    ),
  );
}

export function pickPrimaryBasisGroup(
  groups: DisposalBasisRecipientGroup[],
  highlightPolicyKeys?: string[],
  highlightRuleIds?: string[],
): DisposalBasisRecipientGroup | undefined {
  if (groups.length === 0) return undefined;
  if (highlightPolicyKeys?.length || highlightRuleIds?.length) {
    const highlighted = groups.find((group) =>
      groupMatchesHighlight(group, highlightPolicyKeys, highlightRuleIds),
    );
    if (highlighted) return highlighted;
  }
  return (
    groups.find((group) => group.effectiveCount > 0) ??
    groups.find((group) => group.matchesRootBasis) ??
    groups[0]
  );
}

export function sortBasisGroupsForTooltip(
  groups: DisposalBasisRecipientGroup[],
  highlightPolicyKeys?: string[],
  highlightRuleIds?: string[],
): DisposalBasisRecipientGroup[] {
  if (!highlightPolicyKeys?.length && !highlightRuleIds?.length) return groups;
  const highlighted = groups.filter((group) =>
    groupMatchesHighlight(group, highlightPolicyKeys, highlightRuleIds),
  );
  const rest = groups.filter(
    (group) => !groupMatchesHighlight(group, highlightPolicyKeys, highlightRuleIds),
  );
  return [...highlighted, ...rest];
}

export function formatMultiBasisListReason(
  groups: DisposalBasisRecipientGroup[],
  lang: DisposalLang = 'zh',
  highlightPolicyKeys?: string[],
  highlightRuleIds?: string[],
): string {
  const primary = pickPrimaryBasisGroup(groups, highlightPolicyKeys, highlightRuleIds);
  if (!primary?.entries.length) return '';
  const highlightedEntry = highlightRuleIds?.length
    ? primary.entries.find((entry) =>
        Boolean(entry.rule_id && highlightRuleIds.includes(entry.rule_id)),
      )
    : undefined;
  const primaryText = formatListReason(highlightedEntry ?? primary.entries[0], lang);
  if (groups.length <= 1) return primaryText;
  const suffix: Record<DisposalLang, (count: number) => string> = {
    zh: (count) => `等 ${count} 项`,
    en: (count) => `and ${count} more`,
    th: (count) => `และอีก ${count} รายการ`,
    ru: (count) => `и еще ${count}`,
  };
  return `${primaryText} ${suffix[lang](groups.length)}`;
}
