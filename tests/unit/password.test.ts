import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/admin/password';
import { commandInput } from '../../src/lib/admin/contracts';
describe('administrator secrets and input boundaries', () => {
  it('uses salted hashes and rejects wrong or corrupt credentials', async () => {
    const hash = await hashPassword('test-only-password-123');
    const other = await hashPassword('test-only-password-123');
    expect(hash).not.toBe(other);
    expect(hash).not.toContain('test-only-password');
    expect(await verifyPassword('test-only-password-123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('anything', 'invalid')).toBe(false);
  });
  it('rejects weak bootstrap passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
  });
  it('rejects reserved group links and unexpected mutation fields', () => {
    expect(
      commandInput.safeParse({ action: 'addAudience', key: 'screen', label: 'Group' }).success,
    ).toBe(false);
    expect(
      commandInput.safeParse({ action: 'archive', archived: true, passwordHash: 'injected' })
        .success,
    ).toBe(false);
  });
});
