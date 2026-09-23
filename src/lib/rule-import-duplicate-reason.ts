export type DuplicateReasonMessageKey = 'exactMatch' | 'uniqueKeyConflict' | 'duplicate';

export function duplicateReasonMessageKey(reason: string | undefined): DuplicateReasonMessageKey {
  switch (reason) {
    case 'exact_match':
      return 'exactMatch';
    case 'unique_key_conflict':
      return 'uniqueKeyConflict';
    default:
      return 'duplicate';
  }
}
