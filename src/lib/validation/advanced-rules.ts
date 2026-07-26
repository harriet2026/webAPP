// Front-end validation for advanced filter rule form

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AdvancedRuleFormForValidation {
  name: string
  priority: number
  conditionTree: any
  scope: string[]
  primaryAction: string
  reviewParams?: { reviewers?: string }
  forwardServerParams?: { serverAddress?: string }
}

// Returns array of error messages (empty = valid)
export function validateAdvancedRuleForm(form: AdvancedRuleFormForValidation): string[] {
  const errors: string[] = []

  if (!form.name || form.name.trim() === '') {
    errors.push('Rule name is required')
  }

  if (!form.priority || form.priority < 1 || form.priority > 10000) {
    errors.push('Priority must be between 1 and 10000')
  }

  if (!form.conditionTree) {
    errors.push('Condition is required')
  }

  if (!form.scope || form.scope.length === 0) {
    errors.push('Scope is required')
  }

  if (form.primaryAction === 'review' && form.reviewParams?.reviewers) {
    const emails = form.reviewParams.reviewers.split(/[,;\s]+/).filter(Boolean)
    for (const email of emails) {
      if (!EMAIL_RE.test(email)) {
        errors.push(`Invalid reviewer email: ${email}`)
      }
    }
  }

  return errors
}
