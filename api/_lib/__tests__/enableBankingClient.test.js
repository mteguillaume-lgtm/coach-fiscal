import { describe, it, expect, vi, beforeAll } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';

let publicKey;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKey = pair.publicKey;
  process.env.ENABLE_BANKING_APP_ID = 'app-123';
  process.env.ENABLE_BANKING_PRIVATE_KEY = Buffer.from(pair.privateKey).toString('base64');
});

describe('enableBankingClient', () => {
  it('makeJwt produit un JWT RS256 vérifiable avec kid/aud/exp corrects', async () => {
    const { makeJwt } = await import('../enableBankingClient.js');
    const token = makeJwt(1_700_000_000_000);
    const [h, p, sig] = token.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(header).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-123' });
    expect(payload.iss).toBe('enablebanking.com');
    expect(payload.aud).toBe('api.enablebanking.com');
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.exp).toBe(1_700_000_000 + 3600);
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).end()
      .verify(publicKey, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });

  it('makeJwt échoue avec un message clair si les env vars ne sont pas configurées', async () => {
    const { makeJwt } = await import('../enableBankingClient.js');
    const appId = process.env.ENABLE_BANKING_APP_ID;
    const privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
    delete process.env.ENABLE_BANKING_APP_ID;
    delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    try {
      expect(() => makeJwt()).toThrow(/non configurés/);
    } finally {
      process.env.ENABLE_BANKING_APP_ID = appId;
      process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    }
  });

  it('listAspsps appelle /aspsps avec Bearer JWT et mappe la réponse', async () => {
    const { listAspsps } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ aspsps: [{ name: 'BoursoBank', country: 'FR', maximum_consent_validity: 15552000 }] }),
    });
    const out = await listAspsps('fr', fetchMock);
    expect(out).toEqual([{ name: 'BoursoBank', country: 'FR', maximumConsentValidity: 15552000 }]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.enablebanking.com/aspsps?country=FR');
    expect(opts.headers.Authorization).toMatch(/^Bearer /);
  });

  it('startAuthorization POST /auth avec le corps attendu', async () => {
    const { startAuthorization } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://auth.enablebanking.com/start' }) });
    const out = await startAuthorization({
      aspsp: { name: 'BoursoBank', country: 'FR' },
      redirectUrl: 'https://kapio.app/patrimoine',
      state: 'st-1',
      validUntil: '2027-01-09T00:00:00.000Z',
    }, fetchMock);
    expect(out).toEqual({ url: 'https://auth.enablebanking.com/start' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      aspsp: { name: 'BoursoBank', country: 'FR' },
      redirect_url: 'https://kapio.app/patrimoine',
      state: 'st-1',
      access: { valid_until: '2027-01-09T00:00:00.000Z' },
      psu_type: 'personal',
    });
  });

  it('createSession échange le code et mappe session_id/valid_until', async () => {
    const { createSession } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'sess-1', accounts: [{ uid: 'acc-1' }], access: { valid_until: '2027-01-09T00:00:00Z' } }),
    });
    const out = await createSession('code-xyz', fetchMock);
    expect(out).toEqual({ sessionId: 'sess-1', accounts: [{ uid: 'acc-1' }], validUntil: '2027-01-09T00:00:00Z' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: 'code-xyz' });
  });

  it('getSessionAccounts renvoie status et uids', async () => {
    const { getSessionAccounts } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: 'AUTHORIZED', accounts: ['acc-1', 'acc-2'] }),
    });
    const out = await getSessionAccounts('sess-1', fetchMock);
    expect(out).toEqual({ status: 'AUTHORIZED', accountUids: ['acc-1', 'acc-2'] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.enablebanking.com/sessions/sess-1');
  });

  it('getAccountBalances renvoie le tableau balances', async () => {
    const { getAccountBalances } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ balances: [{ name: 'Booked', balance_amount: { currency: 'EUR', amount: '12.5' }, balance_type: 'CLBD' }] }),
    });
    const out = await getAccountBalances('acc-1', fetchMock);
    expect(out).toEqual([{ name: 'Booked', balance_amount: { currency: 'EUR', amount: '12.5' }, balance_type: 'CLBD' }]);
  });

  it('propage les erreurs HTTP avec le statut', async () => {
    const { listAspsps } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad jwt' });
    await expect(listAspsps('fr', fetchMock)).rejects.toThrow(/Enable Banking 401/);
  });
});
