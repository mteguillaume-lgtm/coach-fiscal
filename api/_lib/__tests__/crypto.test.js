import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64); // 32 octets en hex
});

describe('crypto', () => {
  it('encrypt/decrypt fait un aller-retour', async () => {
    const { encrypt, decrypt } = await import('../crypto');
    const token = encrypt('secret-token');
    expect(token).not.toContain('secret-token');
    expect(decrypt(token)).toBe('secret-token');
  });
});
