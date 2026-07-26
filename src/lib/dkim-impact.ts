// DKIM impact detection for advanced filter rules editor

export type PrimaryAction = 'block' | 'quarantine' | 'review' | 'accept' | 'discard' | 'tagDeliver' | 'sideline'
export type AddonKey = 'detailedLog' | 'emailTag' | 'disclaimer' | 'modifyHeader' | 'adminNotify' | 'deleteAttachment' | 'forwardServer' | 'externalReminder'

const DKIM_IMPACTING_ACTIONS: Set<PrimaryAction> = new Set(['tagDeliver'])
const DKIM_IMPACTING_ADDONS: Set<AddonKey> = new Set(['deleteAttachment', 'disclaimer', 'externalReminder', 'emailTag', 'modifyHeader'])

export interface DkimImpactForm {
  primaryAction: PrimaryAction
  addons: Set<AddonKey>
}

export function getDkimImpactingItems(form: DkimImpactForm): string[] {
  const items: string[] = []
  if (DKIM_IMPACTING_ACTIONS.has(form.primaryAction)) {
    items.push(form.primaryAction)
  }
  for (const addon of form.addons) {
    if (DKIM_IMPACTING_ADDONS.has(addon)) {
      items.push(addon)
    }
  }
  return items
}
