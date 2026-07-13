import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({ savePending: vi.fn().mockResolvedValue() }));
vi.mock('../../_lib/enableBankingClient.js', () => ({
  listAspsps: vi.fn().mockResolvedValue([{ name: 'BoursoBank', country: 'FR', maximumConsentValidity: 15552000 }]),
  startAuthorization: vi.fn().mockResolvedValue({ url: 'https://auth.enablebanking.com/start' }),
}));

import { savePending } from '../../_lib/store.js';
import { startAuthorization } from '../../_lib/enableBankingClient.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('POST /api/bank/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ORIGIN = 'https://kapio.app';
  });

  it('crée l autorisation et mémorise le pending (owner + banque)', async () => {
    const { default: handler } = await import('../connect.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { institutionId: 'FR::BoursoBank', institutionName: 'BoursoBank', owner: 'd2' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ link: 'https://auth.enablebanking.com/start' });
    const authArgs = startAuthorization.mock.calls[0][0];
    expect(authArgs.aspsp).toEqual({ name: 'BoursoBank', country: 'FR' });
    expect(authArgs.redirectUrl).toBe('https://kapio.app/patrimoine');
    expect(authArgs.state).toBeTruthy();
    expect(savePending).toHaveBeenCalledWith(authArgs.state, { owner: 'd2', bank: 'BoursoBank' });
  });

  it('400 si institutionId manquant ou mal formé', async () => {
    const { default: handler } = await import('../connect.js');
    let res = mockRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
    res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { institutionId: 'SansSeparateur' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 si la banque est inconnue d Enable Banking', async () => {
    const { default: handler } = await import('../connect.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { institutionId: 'FR::Inconnue' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Inconnue/);
  });
});
