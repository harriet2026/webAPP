// 处置依据（拦截原因）映射字典 —— 全应用唯一事实源
// 将「策略模块 + 规则名 + 规则ID + 命中值 + 动作」结构化，供列表页/详情页统一渲染。
// 文案在前端按字典 + 变量替换生成，便于 i18n 与列表字数控制；后端只需返回
// policy_key/rule_id/hit_values。
//
// 接口字段采用后端返回的 snake_case 形态（policy_key / rule_name / rule_id /
// action / hit_values / detection_tags / per_recipient），由
// types/email-disposal.ts 的 DisposalBasis 接口定义，此处仅引用之。

import type { DisposalBasis } from '@/types/email-disposal';

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
  | 'quarantine' | 'discard' | 'tag' | 'deliver' | 'recall'
  | 'audit' | 'reject' | 'bounce' | 'sideline' | 'accept';

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

// 阶段 3（内容层）下有多个检测引擎共用同一「策略流水线」路由，仅靠 STAGE_ROUTE
// 无法定位到具体应打开哪个抽屉、抽屉内又应停在哪个页签。这里按 policy_key 追加
// 更精确的查询参数：PolicyPipelinePage 读取 stage3/stage3Tab 后自动展开对应
// 抽屉（如「附件安全检测」）并切到对应页签（如「附件沙箱检测」）。未覆盖的
// policy_key 仍落回 STAGE_ROUTE 的通用路由，行为不变。
const POLICY_ROUTE_OVERRIDE: Record<string, string> = {
  'ATT-SANDBOX': '/security/pipeline?stage3=attachment&stage3Tab=sandboxRules',
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
  // 父级能力分组名（可选）。当子引擎（如"附件沙箱检测""反病毒引擎"）归属于同一
  // 个更大的能力大类（如"附件安全检测"）时填写，用于在处置依据/检测流程等结果
  // 展示场景里渲染"父级 › 子级"面包屑，避免子引擎名字裸露展示导致管理员看不出
  // 归属关系。未填写时展示逻辑退回到只显示 moduleZh 本身（不受影响）。
  moduleGroupZh?: string;
  moduleGroupEn?: string;
  moduleGroupTh?: string;
  moduleGroupRu?: string;
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

// 策略模块字典（对照处置依据映射表整理）。
// GT-12214: 发信人黑白名单共用一个 policy_key，命中的是黑还是白由
// hit_values.list_type 决定（whitelist/allowlist 视为放行名单）。缺失时按黑名单
// 渲染，保持与历史数据兼容。
export function isAllowList(v: HitValues | undefined): boolean {
  const t = String(v?.list_type ?? '').toLowerCase();
  return t === 'whitelist' || t === 'allowlist' || t === 'allow';
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
        case 'en': return `${ip} exceeds rate limit`;
        case 'th': return `${ip} เกินขีดจำกัดอัตรา`;
        case 'ru': return `${ip} превышает лимит частоты`;
        default: return `${ip} 发信频率超限`;
      }
    },
    hitDetail: (v, lang) => {
      const ip = val(v, 'source_ip');
      const w = val(v, 'time_window');
      const c = val(v, 'count');
      const l = val(v, 'limit');
      switch (lang) {
        case 'en': return `IP ${ip} sent ${c} messages within ${w}, exceeding the threshold ${l}`;
        case 'th': return `IP ${ip} ส่ง ${c} ฉบับภายใน ${w} เกินขีดจำกัด ${l}`;
        case 'ru': return `IP ${ip} отправил ${c} писем за ${w}, превышая порог ${l}`;
        default: return `IP ${ip} 在 ${w} 内发送 ${c} 封，超过阈值 ${l}`;
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
        case 'en': return `${ip} hit ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th': return `${ip} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}`;
        case 'ru': return `${ip} в ${allow ? 'белом' : 'чёрном'} списке`;
        default: return `${ip} 命中${allow ? '白名单' : '黑名单'}`;
      }
    },
    hitDetail: (v, lang) => {
      const ip = val(v, 'source_ip');
      const entry = val(v, 'entry');
      const type = val(v, 'entry_type', '静态');
      const allow = isAllowList(v);
      switch (lang) {
        case 'en': return `IP ${ip} hit ${allow ? 'allowlist' : 'blocklist'} entry ${entry} (type: ${type})`;
        case 'th': return `IP ${ip} ตรงกับรายการ${allow ? 'บัญชีขาว' : 'บัญชีดำ'} ${entry} (ประเภท: ${type})`;
        case 'ru': return `IP ${ip} в записи ${allow ? 'белого' : 'чёрного'} списка ${entry} (тип: ${type})`;
        default: return `IP ${ip} 命中${allow ? '白名单' : '黑名单'}条目 ${entry}（类型：${type}）`;
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
        case 'en': return `${ip} flagged by RBL`;
        case 'th': return `${ip} ถูกทำเครื่องหมายโดย RBL`;
        case 'ru': return `${ip} помечен RBL`;
        default: return `${ip} 被RBL标记`;
      }
    },
    hitDetail: (v, lang) => {
      const ip = val(v, 'source_ip');
      const src = val(v, 'rbl_source');
      const cat = val(v, 'category');
      switch (lang) {
        case 'en': return `IP ${ip} was flagged as ${cat} by ${src}`;
        case 'th': return `IP ${ip} ถูกทำเครื่องหมายเป็น ${cat} โดย ${src}`;
        case 'ru': return `IP ${ip} помечен как ${cat} сервисом ${src}`;
        default: return `IP ${ip} 被 ${src} 标记为 ${cat}`;
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
      const c = val(v, 'country');
      switch (lang) {
        case 'en': return `Origin ${c}`;
        case 'th': return `แหล่งที่มา ${c}`;
        case 'ru': return `Источник ${c}`;
        default: return `来源地 ${c}`;
      }
    },
    hitDetail: (v, lang) => {
      const c = val(v, 'country');
      const ip = val(v, 'source_ip');
      switch (lang) {
        case 'en': return `Country/region of origin ${c} (IP: ${ip})`;
        case 'th': return `ประเทศ/ภูมิภาคต้นทาง ${c} (IP: ${ip})`;
        case 'ru': return `Страна/регион источника ${c} (IP: ${ip})`;
        default: return `来源国家/地区 ${c}（IP: ${ip}）`;
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
        case 'en': return `${s} hit ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th': return `${s} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}`;
        case 'ru': return `${s} в ${allow ? 'белом' : 'чёрном'} списке`;
        default: return `${s} 命中${allow ? '白名单' : '黑名单'}`;
      }
    },
    hitDetail: (v, lang) => {
      const s = val(v, 'sender');
      const mt = val(v, 'match_type', lang === 'zh' ? '域名' : 'domain');
      const allow = isAllowList(v);
      switch (lang) {
        case 'en': return `Sender ${s} matched ${mt} ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th': return `ผู้ส่ง ${s} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}ระดับ${mt}`;
        case 'ru': return `Отправитель ${s} в ${mt} ${allow ? 'белом' : 'чёрном'} списке`;
        default: return `发件人 ${s} 命中 ${mt} ${allow ? '白名单' : '黑名单'}`;
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
    listSummary: (v, lang) => {
      if (v?.protocol) {
        const p = val(v, 'protocol');
        switch (lang) {
          case 'en': return `${p} verification failed`;
          case 'th': return `การตรวจสอบ ${p} ล้มเหลว`;
          case 'ru': return `Проверка ${p} не пройдена`;
          default: return `${p} 验证失败`;
        }
      }
      switch (lang) {
        case 'en': return 'Sender format anomaly';
        case 'th': return 'รูปแบบผู้ส่งผิดปกติ';
        case 'ru': return 'Аномалия формата отправителя';
        default: return '发件人格式异常';
      }
    },
    hitDetail: (v, lang) => {
      const s = val(v, 'sender');
      if (v?.protocol) {
        const p = val(v, 'protocol');
        const d = val(v, 'detail');
        switch (lang) {
          case 'en': return `Sender ${s}'s ${p} verification hard-failed (reason: ${d})`;
          case 'th': return `การตรวจสอบ ${p} ของผู้ส่ง ${s} ล้มเหลว (เหตุผล: ${d})`;
          case 'ru': return `Проверка ${p} отправителя ${s} жёстко не пройдена (причина: ${d})`;
          default: return `发件人 ${s} 的 ${p} 验证硬失败（失败原因：${d}）`;
        }
      }
      if (v?.feature_type) {
        const ft = val(v, 'feature_type');
        const sc = val(v, 'score');
        switch (lang) {
          case 'en': return `Matched ${ft} feature (sender: ${s}, similarity: ${sc}%)`;
          case 'th': return `ตรงกับลักษณะ ${ft} (ผู้ส่ง: ${s}, ความคล้าย: ${sc}%)`;
          case 'ru': return `Совпадение с признаком ${ft} (отправитель: ${s}, сходство: ${sc}%)`;
          default: return `命中 ${ft} 特征（发件人：${s}，相似度：${sc}%）`;
        }
      }
      const mf = val(v, 'mail_from');
      const hf = val(v, 'header_from');
      switch (lang) {
        case 'en': return `MAIL FROM empty/illegal or envelope/header mismatch (envelope: ${mf}, header: ${hf})`;
        case 'th': return `MAIL FROM ว่าง/ผิดรูปแบบ หรือซอง/ส่วนหัวไม่ตรงกัน (ซอง: ${mf}, ส่วนหัว: ${hf})`;
        case 'ru': return `MAIL FROM пуст/некорректен или конверт/заголовок не совпадают (конверт: ${mf}, заголовок: ${hf})`;
        default: return `MAIL FROM 为空/格式非法/信封信头不一致（信封：${mf}，信头：${hf}）`;
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
        case 'en': return `${s} abnormal sending behavior`;
        case 'th': return `${s} พฤติกรรมการส่งผิดปกติ`;
        case 'ru': return `${s} аномальное поведение отправки`;
        default: return `${s} 发信行为异常`;
      }
    },
    hitDetail: (v, lang) => {
      const s = val(v, 'sender');
      const at = val(v, 'abnormal_type', lang === 'zh' ? '频率' : 'frequency');
      const d = val(v, 'detail');
      switch (lang) {
        case 'en': return `Sender ${s} has abnormal ${at} (${d})`;
        case 'th': return `ผู้ส่ง ${s} มี${at}ผิดปกติ (${d})`;
        case 'ru': return `У отправителя ${s} аномальная ${at} (${d})`;
        default: return `发件人 ${s} ${at} 异常（${d}）`;
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
    listSummary: (v, lang) => {
      if (v?.rcpt) {
        switch (lang) {
          case 'en': return 'Recipient verification failed';
          case 'th': return 'การตรวจสอบผู้รับล้มเหลว';
          case 'ru': return 'Проверка получателя не пройдена';
          default: return '收件人验证失败';
        }
      }
      switch (lang) {
        case 'en': return 'Recipient count exceeded';
        case 'th': return 'จำนวนผู้รับเกินขีดจำกัด';
        case 'ru': return 'Количество получателей превышено';
        default: return '收件人数量超限';
      }
    },
    hitDetail: (v, lang) => {
      const rcpt = val(v, 'rcpt');
      if (v?.rcpt) {
        switch (lang) {
          case 'en': return `Recipient ${rcpt} verification failed`;
          case 'th': return `การตรวจสอบผู้รับ ${rcpt} ล้มเหลว`;
          case 'ru': return `Проверка получателя ${rcpt} не пройдена`;
          default: return `收件人 ${rcpt} 验证失败`;
        }
      }
      const c = val(v, 'count');
      const l = val(v, 'limit');
      switch (lang) {
        case 'en': return `Recipient count ${c} exceeds limit ${l}`;
        case 'th': return `จำนวนผู้รับ ${c} เกินขีดจำกัด ${l}`;
        case 'ru': return `Количество получателей ${c} превышает лимит ${l}`;
        default: return `收件人数量 ${c} 超过限制 ${l}`;
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
      const u = val(v, 'user');
      const allow = isAllowList(v);
      switch (lang) {
        case 'en': return `${u} hit ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th': return `${u} ตรงกับ${allow ? 'บัญชีขาว' : 'บัญชีดำ'}`;
        case 'ru': return `${u} в ${allow ? 'белом' : 'чёрном'} списке`;
        default: return `${u} 命中${allow ? '白名单' : '黑名单'}`;
      }
    },
    hitDetail: (v, lang) => {
      const u = val(v, 'user');
      const allow = isAllowList(v);
      switch (lang) {
        case 'en': return `User ${u} is on the ${allow ? 'allowlist' : 'blocklist'}`;
        case 'th': return `ผู้ใช้ ${u} อยู่ใน${allow ? 'บัญชีขาว' : 'บัญชีดำ'}`;
        case 'ru': return `Пользователь ${u} в ${allow ? 'белом' : 'чёрном'} списке`;
        default: return `用户 ${u} 命中${allow ? '白名单' : '黑名单'}`;
      }
    },
  },

  // ===== 阶段三：内容层 =====
  'ATT-BASIC': {
    stage: 3,
    moduleZh: '基础限制',
    moduleEn: 'Basic Limits',
    moduleTh: 'ข้อจำกัดพื้นฐาน',
    moduleRu: 'Базовые ограничения',
    // 父级归属："基础限制"是"附件安全检测"大类下的一个子引擎（附件数量/大小/
    // 嵌套层数限制），与反病毒/沙箱/图片识别/加密附件平级，因此补上父级分组名，
    // 与其余四个子引擎在处置依据/检测流程展示上保持一致的层级语言。此前该
    // policy_key 的 moduleZh 直接写成"附件安全检测"本身，会与父级大类同名，
    // 导致面包屑退化成"附件安全检测 › 附件安全检测"；现拆开为子引擎自己的名字
    // "基础限制" + 父级分组"附件安全检测"两层，语义更准确。
    moduleGroupZh: '附件安全检测',
    moduleGroupEn: 'Attachment Security',
    moduleGroupTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleGroupRu: 'Безопасность вложений',
    idPrefix: 'ATT-BASIC-',
    listSummary: (v, lang) => {
      if (v?.timeout) {
        switch (lang) {
          case 'en': return 'Scan timed out';
          case 'th': return 'การสแกนหมดเวลา';
          case 'ru': return 'Тайм-аут сканирования';
          default: return '扫描超时';
        }
      }
      const lt = val(v, 'limit_type', lang === 'zh' ? '大小' : 'size');
      switch (lang) {
        case 'en': return `Attachment ${lt} exceeded`;
        case 'th': return `ไฟล์แนบ${lt}เกินขีดจำกัด`;
        case 'ru': return `${lt} вложения превышен`;
        default: return `附件${lt}超限`;
      }
    },
    hitDetail: (v, lang) => {
      if (v?.timeout) {
        switch (lang) {
          case 'en': return 'Attachment scan timed out (configured to quarantine), safety unknown';
          case 'th': return 'การสแกนไฟล์แนบหมดเวลา (กำหนดให้กักกัน) ความปลอดภัยไม่ทราบ';
          case 'ru': return 'Тайм-аут сканирования вложения (настроено на карантин), безопасность неизвестна';
          default: return '附件扫描超时（配置为隔离），安全性未知';
        }
      }
      const c = val(v, 'count');
      const sz = val(v, 'size');
      const lv = val(v, 'level');
      const l = val(v, 'limit');
      switch (lang) {
        case 'en': return `Attachments ${c} / size ${sz} / nesting ${lv} levels exceed limit ${l}`;
        case 'th': return `ไฟล์แนบ ${c} รายการ / ขนาด ${sz} / ซ้อน ${lv} ระดับ เกินขีดจำกัด ${l}`;
        case 'ru': return `Вложений ${c} / размер ${sz} / вложенность ${lv} превышает лимит ${l}`;
        default: return `附件 ${c} 个 / 大小 ${sz} / 嵌套 ${lv} 层超过限制 ${l}`;
      }
    },
  },
  'ATT-AV': {
    stage: 3,
    moduleZh: '反病毒引擎',
    moduleEn: 'Anti-Virus Engine',
    moduleTh: 'เอนจินป้องกันไวรัส',
    moduleRu: 'Антивирусный движок',
    // 父级归属："反病毒引擎"是"附件安全检测"大类下的子引擎，与基础限制/沙箱/
    // 图片识别/加密附件平级，补上父级分组名用于面包屑展示。
    moduleGroupZh: '附件安全检测',
    moduleGroupEn: 'Attachment Security',
    moduleGroupTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleGroupRu: 'Безопасность вложений',
    idPrefix: 'ATT-AV-',
    listSummary: (v, lang) => {
      if (v?.timeout) {
        switch (lang) {
          case 'en': return 'Scan timed out';
          case 'th': return 'การสแกนหมดเวลา';
          case 'ru': return 'Тайм-аут сканирования';
          default: return '扫描超时';
        }
      }
      const fn = val(v, 'filename');
      const vn = val(v, 'virus_name');
      switch (lang) {
        case 'en': return `${fn} detected ${vn}`;
        case 'th': return `${fn} ตรวจพบ ${vn}`;
        case 'ru': return `${fn} обнаружен ${vn}`;
        default: return `${fn} 检出 ${vn}`;
      }
    },
    hitDetail: (v, lang) => {
      if (v?.timeout) {
        switch (lang) {
          case 'en': return 'Antivirus scan timed out (configured to quarantine), safety unknown';
          case 'th': return 'การสแกนป้องกันไวรัสหมดเวลา (กำหนดให้กักกัน) ความปลอดภัยไม่ทราบ';
          case 'ru': return 'Тайм-аут антивирусного сканирования (настроено на карантин), безопасность неизвестна';
          default: return '反病毒扫描超时（配置为隔离），安全性未知';
        }
      }
      const fn = val(v, 'filename');
      const vn = val(v, 'virus_name');
      const e = val(v, 'engine');
      const ver = val(v, 'version');
      switch (lang) {
        case 'en': return `Attachment ${fn} detected ${vn} (engine: ${e}, version: ${ver})`;
        case 'th': return `ไฟล์แนบ ${fn} ตรวจพบ ${vn} (เอนจิน: ${e}, เวอร์ชัน: ${ver})`;
        case 'ru': return `Вложение ${fn}: обнаружено ${vn} (движок: ${e}, версия: ${ver})`;
        default: return `附件 ${fn} 检出 ${vn}（引擎：${e}，版本：${ver}）`;
      }
    },
  },
  'ATT-SANDBOX': {
    stage: 3,
    moduleZh: '附件沙箱检测',
    moduleEn: 'Attachment Sandbox',
    moduleTh: 'แซนด์บ็อกซ์ไฟล์แนบ',
    moduleRu: 'Песочница для вложений',
    // 父级归属：与其余四个子引擎共享同一个"附件安全检测"父级分组名，
    // 用于面包屑展示；不影响筛选器仍按子引擎（moduleZh）独立分组。
    moduleGroupZh: '附件安全检测',
    moduleGroupEn: 'Attachment Security',
    moduleGroupTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleGroupRu: 'Безопасность вложений',
    idPrefix: 'ATT-SANDBOX-',
    listSummary: (v, lang) => {
      if (v?.timeout) {
        switch (lang) {
          case 'en': return 'Scan timed out';
          case 'th': return 'การสแกนหมดเวลา';
          case 'ru': return 'Тайм-аут сканирования';
          default: return '扫描超时';
        }
      }
      const rl = val(v, 'risk_level', lang === 'zh' ? '高危' : 'high');
      switch (lang) {
        case 'en': return `High-risk behavior detected (${rl})`;
        case 'th': return `ตรวจพบพฤติกรรมที่มีความเสี่ยงสูง (${rl})`;
        case 'ru': return `Обнаружено высокорисковое поведение (${rl})`;
        default: return `检出高危行为（${rl}）`;
      }
    },
    hitDetail: (v, lang) => {
      if (v?.timeout) {
        switch (lang) {
          case 'en': return 'Attachment sandbox scan timed out (configured to quarantine), safety unknown';
          case 'th': return 'การสแกนแซนด์บ็อกซ์ไฟล์แนบหมดเวลา (กำหนดให้กักกัน) ความปลอดภัยไม่ทราบ';
          case 'ru': return 'Тайм-аут сканирования в песочнице вложений (настроено на карантин), безопасность неизвестна';
          default: return '附件沙箱扫描超时（配置为隔离），安全性未知';
        }
      }
      const fn = val(v, 'filename');
      const bh = val(v, 'behavior');
      const rl = val(v, 'risk_level');
      switch (lang) {
        case 'en': return `Attachment ${fn} sandbox analysis detected high-risk behavior: ${bh} (risk level: ${rl})`;
        case 'th': return `ไฟล์แนบ ${fn} วิเคราะห์ในแซนด์บ็อกซ์พบพฤติกรรมที่มีความเสี่ยงสูง: ${bh} (ระดับความเสี่ยง: ${rl})`;
        case 'ru': return `Анализ вложения ${fn} в песочнице выявил высокорисковое поведение: ${bh} (уровень риска: ${rl})`;
        default: return `附件 ${fn} 沙箱分析检出高危行为：${bh}（风险等级：${rl}）`;
      }
    },
  },
  'ATT-QR': {
    stage: 3,
    // 细化命名：此前该 policy_key 的 moduleZh 直接写死为大类名"附件安全检测"，
    // 与反病毒引擎/附件沙箱检测等子引擎裸露展示在同一层级里，管理员看不出
    // 这是四个子引擎中的哪一个。现按其实际检测能力命名为"图片识别"（附件
    // 图片中的二维码识别，钓鱼邮件典型载体），并通过 moduleGroupZh 挂回
    // "附件安全检测"父级分组，形成"附件安全检测 › 图片识别"两层面包屑。
    moduleZh: '图片识别',
    moduleEn: 'Image Recognition',
    moduleTh: 'การรู้จำภาพ',
    moduleRu: 'Распознавание изображений',
    moduleGroupZh: '附件安全检测',
    moduleGroupEn: 'Attachment Security',
    moduleGroupTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleGroupRu: 'Безопасность вложений',
    idPrefix: 'ATT-QR-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en': return 'QR code detected';
        case 'th': return 'ตรวจพบ QR code';
        case 'ru': return 'Обнаружен QR-код';
        default: return '检测到二维码';
      }
    },
    hitDetail: (_v, lang) => {
      switch (lang) {
        case 'en': return 'QR code detected in attachment image (typical phishing carrier)';
        case 'th': return 'ตรวจพบ QR code ในภาพไฟล์แนบ (พาหะฟิชชิงทั่วไป)';
        case 'ru': return 'В изображении вложения обнаружен QR-код (типичный носитель фишинга)';
        default: return '附件图片中检测到二维码（钓鱼邮件典型载体）';
      }
    },
  },
  'ATT-ENC': {
    stage: 3,
    // 细化命名：同 ATT-QR，此前 moduleZh 直接写死为大类名，现按实际检测能力
    // 命名为"加密附件"，并通过 moduleGroupZh 挂回"附件安全检测"父级分组。
    moduleZh: '加密附件',
    moduleEn: 'Encrypted Attachment',
    moduleTh: 'ไฟล์แนบเข้ารหัส',
    moduleRu: 'Зашифрованное вложение',
    moduleGroupZh: '附件安全检测',
    moduleGroupEn: 'Attachment Security',
    moduleGroupTh: 'การตรวจสอบความปลอดภัยของไฟล์แนบ',
    moduleGroupRu: 'Безопасность вложений',
    idPrefix: 'ATT-ENC-',
    listSummary: (_v, lang) => {
      switch (lang) {
        case 'en': return 'Encrypted attachment cannot be decrypted';
        case 'th': return 'ไฟล์แนบเข้ารหัสไม่สามารถถอดรหัสได้';
        case 'ru': return 'Зашифрованное вложение не удаётся расшифровать';
        default: return '加密附件无法解密';
      }
    },
    hitDetail: (v, lang) => {
      const fn = val(v, 'filename');
      switch (lang) {
        case 'en': return `Encrypted attachment ${fn} cannot be decrypted, content uninspectable`;
        case 'th': return `ไฟล์แนบเข้ารหัส ${fn} ไม่สามารถถอดรหัสได้ ไม่สามารถตรวจสอบเนื้อหา`;
        case 'ru': return `Зашифрованное вложение ${fn} не удаётся расшифровать, содержимое недоступно для проверки`;
        default: return `检测到加密附件 ${fn} 且无法解密，内容不可检测`;
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
    listSummary: (v, lang) => {
      if (v?.type) {
        switch (lang) {
          case 'en': return 'Malicious link detected';
          case 'th': return 'ตรวจพบลิงก์ที่เป็นอันตราย';
          case 'ru': return 'Обнаружена вредоносная ссылка';
          default: return '检测到恶意链接';
        }
      }
      switch (lang) {
        case 'en': return 'Hit link protection';
        case 'th': return 'ตรงกับการป้องกันลิงก์';
        case 'ru': return 'Сработала защита ссылок';
        default: return '命中链接保护';
      }
    },
    hitDetail: (v, lang) => {
      const url = val(v, 'url');
      if (v?.type) {
        const ty = val(v, 'type');
        switch (lang) {
          case 'en': return `Link ${url} verified as malicious by sandbox (threat type: ${ty})`;
          case 'th': return `ลิงก์ ${url} ถูกตรวจสอบโดยแซนด์บ็อกซ์ว่าเป็นอันตราย (ประเภทภัยคุกคาม: ${ty})`;
          case 'ru': return `Ссылка ${url} проверена песочницей и признана вредоносной (тип угрозы: ${ty})`;
          default: return `链接 ${url} 经沙箱检测为恶意（威胁类型：${ty}）`;
        }
      }
      const mt = val(v, 'match_type', lang === 'zh' ? '未知' : 'unknown');
      switch (lang) {
        case 'en': return `Link ${url} matched ${mt} URL rule`;
        case 'th': return `ลิงก์ ${url} ตรงกับกฎ URL ${mt}`;
        case 'ru': return `Ссылка ${url} совпала с ${mt} правилом URL`;
        default: return `链接 ${url} 命中 ${mt} URL 规则`;
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
      const mm = val(v, 'match_method', lang === 'zh' ? '关键词' : 'keyword');
      switch (lang) {
        case 'en': return `Matched ${mm}`;
        case 'th': return `ตรงกับ${mm}`;
        case 'ru': return `Совпадение по ${mm}`;
        default: return `命中 ${mm}`;
      }
    },
    hitDetail: (v, lang) => {
      const mp = val(v, 'match_position', lang === 'zh' ? '正文' : 'body');
      const mm = val(v, 'match_method', lang === 'zh' ? '关键词' : 'keyword');
      const mc = val(v, 'matched_content');
      switch (lang) {
        case 'en': return `Mail ${mp} matched ${mm} ${mc}`;
        case 'th': return `อีเมล${mp}ตรงกับ${mm} ${mc}`;
        case 'ru': return `${mp} письма совпало с ${mm} ${mc}`;
        default: return `邮件 ${mp} 匹配 ${mm} ${mc}`;
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
        case 'en': return `Classified as ${tl}`;
        case 'th': return `จัดประเภทเป็น${tl}`;
        case 'ru': return `Классифицировано как ${tl}`;
        default: return `判定为${tl}`;
      }
    },
    hitDetail: (v, lang) => {
      const ti = val(v, 'tag_id', 'Tag3');
      const tl = val(v, 'tag_label', lang === 'zh' ? '垃圾邮件' : 'spam');
      const cf = val(v, 'confidence');
      switch (lang) {
        case 'en': return `${ti} classified as ${tl} (confidence: ${cf}%)`;
        case 'th': return `${ti} จัดประเภทเป็น${tl} (ความมั่นใจ: ${cf}%)`;
        case 'ru': return `${ti} классифицировано как ${tl} (уверенность: ${cf}%)`;
        default: return `${ti} 判定为${tl}（置信度：${cf}%）`;
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
        case 'en': return 'Classified as phishing';
        case 'th': return 'จัดประเภทเป็นฟิชชิง';
        case 'ru': return 'Классифицировано как фишинг';
        default: return '判定为钓鱼邮件';
      }
    },
    hitDetail: (v, lang) => {
      const cf = val(v, 'confidence');
      const bec = val(v, 'bec', lang === 'zh' ? '否' : 'no');
      switch (lang) {
        case 'en': return `AI classified as phishing (confidence: ${cf}%, BEC: ${bec})`;
        case 'th': return `AI จัดประเภทเป็นฟิชชิง (ความมั่นใจ: ${cf}%, BEC: ${bec})`;
        case 'ru': return `AI классифицировал как фишинг (уверенность: ${cf}%, BEC: ${bec})`;
        default: return `AI 判定为钓鱼邮件（置信度：${cf}%，BEC：${bec}）`;
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
        case 'en': return 'Classified as identity spoofing';
        case 'th': return 'จัดประเภทเป็นการปลอมแปลงตัวตน';
        case 'ru': return 'Классифицировано как подмена личности';
        default: return '判定为身份仿冒';
      }
    },
    hitDetail: (v, lang) => {
      const st = val(v, 'spoof_type', lang === 'zh' ? '显示名' : 'display name');
      const cf = val(v, 'confidence');
      switch (lang) {
        case 'en': return `AI classified as ${st} spoofing (confidence: ${cf}%)`;
        case 'th': return `AI จัดประเภทเป็นการปลอมแปลง${st} (ความมั่นใจ: ${cf}%)`;
        case 'ru': return `AI классифицировал как подмену «${st}» (уверенность: ${cf}%)`;
        default: return `AI 判定为 ${st} 仿冒（置信度：${cf}%）`;
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
      const tt = val(v, 'threat_type', lang === 'zh' ? '威胁' : 'threat');
      switch (lang) {
        case 'en': return `Traceback found ${tt}`;
        case 'th': return `การติดตามพบ${tt}`;
        case 'ru': return `При отслеживании обнаружено: ${tt}`;
        default: return `回溯发现 ${tt}`;
      }
    },
    hitDetail: (v, lang) => {
      const tt = val(v, 'threat_type', lang === 'zh' ? '威胁' : 'threat');
      const cap = val(v, 'capability');
      switch (lang) {
        case 'en': return `Traceback of delivered mail found ${tt} (capability: ${cap})`;
        case 'th': return `การติดตามอีเมลที่ส่งแล้วพบ${tt} (ความสามารถ: ${cap})`;
        case 'ru': return `При отслеживании доставленных писем обнаружено: ${tt} (возможность: ${cap})`;
        default: return `回溯已投递邮件发现 ${tt}（回溯能力：${cap}）`;
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
    listSummary: (v, lang) => {
      if (v?.subject_same) {
        switch (lang) {
          case 'en': return 'Batch identical subjects';
          case 'th': return 'หัวข้อเดียวกันเป็นชุด';
          case 'ru': return 'Пакет одинаковых тем';
          default: return '批量相同主题';
        }
      }
      switch (lang) {
        case 'en': return 'Highly similar to known mail';
        case 'th': return 'คล้ายกับอีเมลที่รู้จักอย่างมาก';
        case 'ru': return 'Очень похоже на известное письмо';
        default: return '与已知邮件高度相似';
      }
    },
    hitDetail: (v, lang) => {
      const sm = val(v, 'similarity');
      if (v?.subject_same) {
        switch (lang) {
          case 'en': return `Subject identical to known spam (similarity ${sm}%)`;
          case 'th': return `หัวข้อเหมือนกับสแปมที่รู้จัก (ความคล้าย ${sm}%)`;
          case 'ru': return `Тема идентична известному спаму (сходство ${sm}%)`;
          default: return `主题与已知垃圾邮件相同（相似度 ${sm}%）`;
        }
      }
      const st = val(v, 'similar_type', lang === 'zh' ? '钓鱼' : 'phishing');
      const dim = val(v, 'dimension', lang === 'zh' ? '内容' : 'content');
      switch (lang) {
        case 'en': return `Similarity to known ${st} mail ${sm}% (dimension: ${dim})`;
        case 'th': return `ความคล้ายกับอีเมล${st}ที่รู้จัก ${sm}% (มิติ: ${dim})`;
        case 'ru': return `Сходство с известным ${st} письмом ${sm}% (измерение: ${dim})`;
        default: return `与已知 ${st} 邮件相似度 ${sm}%（相似维度：${dim}）`;
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
        case 'en': return 'Rule matched';
        case 'th': return 'ตรงกับกฎ';
        case 'ru': return 'Совпадение правила';
        default: return '命中规则';
      }
    },
    hitDetail: (v, lang) => {
      const tags = val(v, 'detection_tags');
      switch (lang) {
        case 'en': return `Condition matched, related detection tags: ${tags}`;
        case 'th': return `เงื่อนไขตรง, แท็กการตรวจจับที่เกี่ยวข้อง: ${tags}`;
        case 'ru': return `Условие выполнено, связанные теги обнаружения: ${tags}`;
        default: return `条件命中，关联检测标签：${tags}`;
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
};

function moduleOf(meta: PolicyMeta, lang: DisposalLang): string {
  switch (lang) {
    case 'en': return meta.moduleEn;
    case 'th': return meta.moduleTh;
    case 'ru': return meta.moduleRu;
    default: return meta.moduleZh;
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
  if (!meta) return undefined;
  return POLICY_ROUTE_OVERRIDE[policyKey] ?? STAGE_ROUTE[meta.stage];
  }

// 将后端返回的 hit_values (Record<string, string>) 转换为模板使用的 HitValues。
function toHitValues(v?: Record<string, string>): HitValues | undefined {
  if (!v) return undefined;
  return v as HitValues;
}

// 列表页文案：父级分组 › 模块「规则名」· 命中简述
// GT-附件安全分层：附件安全检测下的子引擎（基础限制/反病毒引擎/附件沙箱检测/
// 图片识别/加密附件）此前在列表上直接展示子引擎名字，管理员看不出它们同属
// "附件安全检测"大类。这里在模块名前补一层"父级 › "面包屑前缀（仅当该
// policy_key 填写了 moduleGroup* 时才会出现，未填写的模块不受影响，展示
// 逻辑保持原样）。
export function formatListReason(basis: DisposalBasis, lang: DisposalLang = 'zh'): string {
  if (!basis?.policy_key) return '';
  const meta = DISPOSAL_POLICY_MAP[basis.policy_key];
  if (!meta) return '';
  const moduleName = moduleOf(meta, lang);
  const groupName = getModuleGroupName(basis.policy_key, lang);
  const hv = toHitValues(basis.hit_values) ?? {};
  const summary = meta.listSummary(hv, lang);
  const ruleName = basis.rule_name ?? '';
  const groupPrefix = groupName ? `${groupName} › ` : '';
  return `${groupPrefix}${moduleName}「${ruleName}」· ${summary}`;
}

// 详情页「命中」描述（变量已替换）。
export function formatHitDetail(basis: DisposalBasis, lang: DisposalLang = 'zh'): string {
  if (!basis?.policy_key) return '';
  const meta = DISPOSAL_POLICY_MAP[basis.policy_key];
  if (!meta) return '';
  const hv = toHitValues(basis.hit_values) ?? {};
  return meta.hitDetail(hv, lang);
}

// 详情页模块名。
export function getModuleName(policyKey: string, lang: DisposalLang = 'zh'): string {
  const meta = DISPOSAL_POLICY_MAP[policyKey];
  if (!meta) return '';
  return moduleOf(meta, lang);
}

// 父级能力分组名（如"附件安全检测"）。仅在 PolicyMeta 填写了 moduleGroup* 时
// 才有值；未填写（多数模块本身就是独立能力，没有更上层的分组）时返回
// undefined，调用方据此判断是否渲染"父级 › 子级"面包屑，否则仍只展示
// getModuleName 单层名字，行为不变。
export function getModuleGroupName(policyKey: string, lang: DisposalLang = 'zh'): string | undefined {
  const meta = DISPOSAL_POLICY_MAP[policyKey];
  if (!meta) return undefined;
  switch (lang) {
    case 'en': return meta.moduleGroupEn;
    case 'th': return meta.moduleGroupTh;
    case 'ru': return meta.moduleGroupRu;
    default: return meta.moduleGroupZh;
  }
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
    const existing = groups.find(
      (g) => g.stage === meta.stage && g.moduleName === moduleName,
    );
    if (existing) {
      existing.keys.push(key);
    } else {
      groups.push({ stage: meta.stage, moduleName, keys: [key] });
    }
  }
  return groups;
}
