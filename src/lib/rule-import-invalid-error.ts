export type ImportInvalidError =
  | { kind: 'scope-mismatch' }
  | { kind: 'invalid-ip'; value: string }
  | { kind: 'invalid-cidr'; value: string }
  | { kind: 'duplicate-in-file' }
  | { kind: 'tenant-missing' }
  | { kind: 'permission-denied' }
  | { kind: 'invalid-rule' };

export function classifyImportInvalidError(error: string | undefined): ImportInvalidError {
  const raw = error?.trim();
  if (!raw) return { kind: 'invalid-rule' };

  if (/^rule does not match scope(?:=.*)?$/i.test(raw)) {
    return { kind: 'scope-mismatch' };
  }

  const invalidIP = raw.match(/invalid IP address:\s*(.+)$/i);
  if (invalidIP) return { kind: 'invalid-ip', value: invalidIP[1].trim() };

  const invalidCIDR = raw.match(/invalid CIDR:\s*(.+)$/i);
  if (invalidCIDR) return { kind: 'invalid-cidr', value: invalidCIDR[1].trim() };

  if (/^duplicate .* rule in import file(?::|$)/i.test(raw)) {
    return { kind: 'duplicate-in-file' };
  }

  if (/(?:tenant_id|required for import_to_selected_tenant).*(?:required|non-null)|requires? a non-null tenant_id/i.test(raw)) {
    return { kind: 'tenant-missing' };
  }

  if (/tenant admins cannot import/i.test(raw)) {
    return { kind: 'permission-denied' };
  }

  return { kind: 'invalid-rule' };
}
