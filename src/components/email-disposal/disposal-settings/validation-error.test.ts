import { describe, expect, it } from 'vitest';
import { firstValidationMessage } from './validation-error';

describe('firstValidationMessage', () => {
  it('finds a message nested under an array field', () => {
    expect(firstValidationMessage([{ message: 'invalidArrayItem' }])).toBe('invalidArrayItem');
  });

  it('finds a message nested under an object field', () => {
    expect(firstValidationMessage({ min_score: { message: 'invalidScore' } })).toBe('invalidScore');
  });

  it('does not traverse RHF DOM refs', () => {
    expect(firstValidationMessage({ ref: { message: 'notAValidationMessage' } })).toBeUndefined();
  });
});
