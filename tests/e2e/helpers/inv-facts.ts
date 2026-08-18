/**
 * 研判域事实(delivery_facts)的共享播种 SQL 构造器 —— Playwright 侧。
 *
 * 背景:`investigation_tasks` / `investigation_actions` 两张表已从全部 backend 的
 * init.sql 删除,研判域改为事件溯源到既有的 `delivery_facts` 表。一个研判任务 =
 *
 *   - 一条 `inv_created` 事实(必有):kind='inv_created'、
 *     event_source=任务类型(phish_analysis / spoof_analysis / threat_traceback)、
 *     event_type=task_id、event_result=run_mode(realtime|observe,可空)、
 *     source_ref=溯源键('sideline_item:<id>' / 'threat_retro_run:<runID>' /
 *     'inline_spoof_fallback:<mid>')、message_uuid=关联邮件 uuid;
 *     payload 承载身份字段(tenant_id / trigger_type / source_type / source_id /
 *     target_type / target_ids_json / prompt / created_by / config_snapshot_json)。
 *   - 可选一条 `inv_done` 终态事实:event_result=completed|failed|cancelled|
 *     enqueue_failed,其余定位列继承 created;payload 承载分析字段
 *     (summary / risk_level / confidence / result_json / steps_json /
 *      recommended_actions_json / error_message)。
 *     **result_json / steps_json / recommended_actions_json 在 payload 里是
 *     JSON 编码后的字符串,不是嵌套对象。**
 *   - 没有 `inv_done` 事实 = pending / running。
 *
 * 权威形态见 internal/storage/repo_investigation_facts.go 与
 * internal/models/delivery_facts.go 的 ComputeFactUID。
 *
 * 本模块只产出 SQL 文本,由各 spec 用自己的 seedSQL/cleanupSQL 执行
 * (phishing-detection.spec.ts 有自己的一份 seedSQL,故这里不耦合执行器)。
 *
 * fact_uid:产品侧是 sha256({kind, task_id});用例种子用可读的
 * `seed-<kind>-<taskId>`,同样"同 task_id 唯一且稳定",由用例自己清理。
 */

export const INV_KIND_CREATED = 'inv_created';
export const INV_KIND_DONE = 'inv_done';
export const INV_KIND_PATCH = 'inv_patch';

/** delivery_facts.node NOT NULL;非投递路径的事实统一落 'unknown'。 */
const NODE_UNKNOWN = 'unknown';

/** 转义单引号 SQL 字符串字面量的内容部分(不含外层引号)。 */
export function sqlStr(s: string): string {
  return String(s).replace(/'/g, "''");
}

function quoted(s: string): string {
  return `'${sqlStr(s)}'`;
}

function nullableQuoted(s: string | null | undefined): string {
  return s === null || s === undefined ? 'NULL' : quoted(s);
}

/** 复刻 models.InvestigationSourceRef 的 (source_type, source_id) → source_ref。 */
export function invSourceRef(sourceType: string, sourceId: string): string {
  const t = (sourceType ?? '').trim();
  const i = (sourceId ?? '').trim();
  if (!t || !i) return '';
  return `${t}:${i}`;
}

/** 旁路 item 的研判溯源键。 */
export function sidelineRef(itemId: string): string {
  return `sideline_item:${itemId}`;
}

/** 威胁回溯 run 的研判溯源键。 */
export function threatRetroRunRef(runId: string): string {
  return `threat_retro_run:${runId}`;
}

/** 丢掉空值键(与 Go 的 omitempty 对齐),序列化为 jsonb 字面量。 */
function payloadLiteral(payload: Record<string, unknown>): string {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || v === undefined || v === '') continue;
    cleaned[k] = v;
  }
  return `${quoted(JSON.stringify(cleaned))}::jsonb`;
}

/** 传对象则序列化,传字符串按已序列化文本处理,传空则不落该键。 */
function asJsonText(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export interface InvCreatedOpts {
  invType?: string;
  /** null / undefined = 系统域(payload 不落 tenant_id)。TENANT_ID 常量是字符串,'NULL' 视为未知。 */
  tenantId?: number | string | null;
  sourceType?: string;
  sourceId?: string;
  messageUuid?: string | null;
  runMode?: string;
  triggerType?: string;
  targetType?: string;
  targetIdsJson?: string;
  prompt?: string;
  createdBy?: string;
  configSnapshot?: Record<string, unknown> | unknown[] | string | null;
  eventTimeSQL?: string;
}

/** 构造一条 inv_created 事实的 INSERT。 */
export function invCreatedSQL(taskId: string, opts: InvCreatedOpts = {}): string {
  const {
    invType = 'phish_analysis',
    tenantId = null,
    sourceType = '',
    sourceId = '',
    messageUuid = null,
    runMode = '',
    triggerType = 'api',
    targetType = 'mail',
    targetIdsJson = '[]',
    prompt = '',
    createdBy = 'pw-test',
    configSnapshot = null,
    eventTimeSQL = 'NOW()',
  } = opts;
  const tenantVal =
    tenantId === null || tenantId === undefined || tenantId === 'NULL'
      ? null
      : Number(tenantId);
  const payload = {
    tenant_id: tenantVal,
    trigger_type: triggerType,
    source_type: sourceType,
    source_id: sourceId,
    target_type: targetType,
    target_ids_json: targetIdsJson,
    prompt,
    created_by: createdBy,
    config_snapshot_json: asJsonText(configSnapshot),
  };
  return (
    `INSERT INTO delivery_facts ` +
    `(fact_uid, kind, node, message_uuid, event_source, event_type, ` +
    `event_result, source_ref, event_time, payload) VALUES (` +
    `${quoted(`seed-${INV_KIND_CREATED}-${taskId}`)}, '${INV_KIND_CREATED}', '${NODE_UNKNOWN}', ` +
    `${nullableQuoted(messageUuid)}, ${quoted(invType)}, ${quoted(taskId)}, ` +
    `${quoted(runMode)}, ${quoted(invSourceRef(sourceType, sourceId))}, ` +
    `${eventTimeSQL}, ${payloadLiteral(payload)})`
  );
}

export interface InvDoneOpts {
  status?: string;
  invType?: string;
  sourceType?: string;
  sourceId?: string;
  messageUuid?: string | null;
  summary?: string;
  riskLevel?: string | null;
  confidence?: number | null;
  result?: Record<string, unknown> | unknown[] | string | null;
  steps?: Record<string, unknown>[] | unknown[] | string | null;
  recommendedActions?: unknown[] | string | null;
  errorMessage?: string;
  eventTimeSQL?: string;
}

/**
 * 构造一条 inv_done 终态事实的 INSERT。定位列(event_source / source_ref /
 * message_uuid)必须与 created 事实一致 —— 折叠与 run 级取数按它们单谓词命中。
 */
export function invDoneSQL(taskId: string, opts: InvDoneOpts = {}): string {
  const {
    status = 'completed',
    invType = 'phish_analysis',
    sourceType = '',
    sourceId = '',
    messageUuid = null,
    summary = '',
    riskLevel = null,
    confidence = null,
    result = null,
    steps = null,
    recommendedActions = null,
    errorMessage = '',
    eventTimeSQL = 'NOW()',
  } = opts;
  const payload = {
    summary,
    risk_level: riskLevel,
    confidence,
    result_json: asJsonText(result),
    steps_json: asJsonText(steps),
    recommended_actions_json: asJsonText(recommendedActions),
    error_message: errorMessage,
  };
  return (
    `INSERT INTO delivery_facts ` +
    `(fact_uid, kind, node, message_uuid, event_source, event_type, ` +
    `event_result, source_ref, event_time, payload) VALUES (` +
    `${quoted(`seed-${INV_KIND_DONE}-${taskId}`)}, '${INV_KIND_DONE}', '${NODE_UNKNOWN}', ` +
    `${nullableQuoted(messageUuid)}, ${quoted(invType)}, ${quoted(taskId)}, ` +
    `${quoted(status)}, ${quoted(invSourceRef(sourceType, sourceId))}, ` +
    `${eventTimeSQL}, ${payloadLiteral(payload)})`
  );
}

const ALL_INV_KINDS = `('${INV_KIND_CREATED}', '${INV_KIND_DONE}', '${INV_KIND_PATCH}')`;

/** 删除一个任务的 created/done/patch 全部事实(旧 DELETE … WHERE id=…)。 */
export function deleteInvByTaskSQL(taskId: string): string {
  return (
    `DELETE FROM delivery_facts WHERE kind IN ${ALL_INV_KINDS} ` +
    `AND event_type = ${quoted(taskId)}`
  );
}

/** 按溯源键删除(旧 DELETE … WHERE source_type=… AND source_id=…)。 */
export function deleteInvBySourceRefSQL(ref: string): string {
  return (
    `DELETE FROM delivery_facts WHERE kind IN ${ALL_INV_KINDS} ` +
    `AND source_ref = ${quoted(ref)}`
  );
}

export function deleteInvBySidelineSQL(itemId: string): string {
  return deleteInvBySourceRefSQL(sidelineRef(itemId));
}
