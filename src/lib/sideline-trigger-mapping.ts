// Mapping from sideline-stage fields to prerequisite trigger conditions

export interface SimpleCondition {
  type: 'condition'
  field: string
  operator: string
  value?: string
}

export interface GroupCondition {
  type: 'AND' | 'OR'
  children: TriggerCondition[]
}

export type TriggerCondition = SimpleCondition | GroupCondition

// Maps sideline-stage field names to the trigger condition a prerequisite rule should have
export const SIDELINE_TRIGGER_MAP: Record<string, TriggerCondition> = {
  short_link_expanded: { type: 'condition', field: 'url_count', operator: 'gt', value: '0' },
  image_qr_code_result: {
    type: 'AND',
    children: [
      { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
      { type: 'condition', field: 'attachment_types', operator: 'contain', value: 'image/' },
    ],
  },
  qr_code_count: {
    type: 'AND',
    children: [
      { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
      { type: 'condition', field: 'attachment_types', operator: 'contain', value: 'image/' },
    ],
  },
  is_zip_bomb: {
    type: 'AND',
    children: [
      { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
      {
        type: 'condition',
        field: 'attachment_types',
        operator: 'within',
        value: 'application/zip,application/x-rar-compressed,application/x-7z-compressed',
      },
    ],
  },
  nested_zip_level: {
    type: 'AND',
    children: [
      { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
      {
        type: 'condition',
        field: 'attachment_types',
        operator: 'within',
        value: 'application/zip,application/x-rar-compressed,application/x-7z-compressed',
      },
    ],
  },
  nested_file_count: {
    type: 'AND',
    children: [
      { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
      {
        type: 'condition',
        field: 'attachment_types',
        operator: 'within',
        value: 'application/zip,application/x-rar-compressed,application/x-7z-compressed',
      },
    ],
  },
  attachment_md5: { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
  is_encrypted_attachment: { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
  virus_scan_result: { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
  doccontent: {
    type: 'AND',
    children: [
      { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' },
      {
        type: 'condition',
        field: 'attachment_types',
        operator: 'within',
        value: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ],
  },
}

// All known sideline-stage field names
const SIDELINE_STAGE_FIELDS = new Set([
  ...Object.keys(SIDELINE_TRIGGER_MAP),
])

export function fieldIsSidelineStage(fieldName: string): boolean {
  if (SIDELINE_STAGE_FIELDS.has(fieldName)) return true
  if (fieldName.startsWith('sideline_phish_')) return true
  if (fieldName.startsWith('similar_detection_')) return true
  return false
}

// Recursively collect sideline-stage field names from a condition tree
export function collectSidelineFields(node: any): string[] {
  if (!node) return []
  if (node.type === 'condition') {
    return fieldIsSidelineStage(node.field) ? [node.field] : []
  }
  if (Array.isArray(node.children)) {
    return [...new Set(node.children.flatMap((child: any) => collectSidelineFields(child)))] as string[]
  }
  return []
}

// Generate companion trigger rule payload for a sideline rule
export function generateCompanionRule(
  sourceRule: { id?: number; priority?: number; metadata?: any },
  referencedSidelineFields: string[]
): any {
  const conditions: TriggerCondition[] = []
  const seen = new Set<string>()

  for (const field of referencedSidelineFields) {
    const cond = SIDELINE_TRIGGER_MAP[field]
    if (cond) {
      const key = JSON.stringify(cond)
      if (!seen.has(key)) {
        seen.add(key)
        conditions.push(cond)
      }
    } else {
      const fallback: SimpleCondition = { type: 'condition', field: 'has_attachment', operator: 'eq', value: 'true' }
      const key = JSON.stringify(fallback)
      if (!seen.has(key)) {
        seen.add(key)
        conditions.push(fallback)
      }
    }
  }

  const conditionTree: TriggerCondition =
    conditions.length === 1 ? conditions[0] : { type: 'OR', children: conditions }

  return {
    name: `[前置触发] ${sourceRule.metadata?.name ?? 'sideline trigger'}`,
    rule_class: 'action',
    stage: 'data',
    is_active: true,
    priority: Math.min((sourceRule.priority ?? 1000) + 1, 9999),
    condition_tree: conditionTree,
    metadata: {
      feature: 'advanced_rules',
      scope: sourceRule.metadata?.scope ?? ['incoming'],
      primary_action: 'sideline',
      primary_action_params: {},
      addons: [],
      companion_rule_id: sourceRule.id,
    },
  }
}
