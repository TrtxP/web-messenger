import { describe, expect, it } from '@jest/globals';
import { isStrongPassword } from '../src/auth/password';

describe('Password Strength Validator', () => {
  it('validates password strength according to SPEC criteria', () => {
    expect(isStrongPassword('Strong!123')).toBe(true);
    expect(isStrongPassword('weak')).toBe(false);
    expect(isStrongPassword('NoSpecial123')).toBe(false);
    expect(isStrongPassword('NOLOWER123!')).toBe(false);
    expect(isStrongPassword('noupper123!')).toBe(false);
  });
});

