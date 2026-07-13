import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/enableBankingClient.js', () => ({
  listAspsps: vi.fn().mockResolvedValue([{ name: 'BoursoBank', country: 'FR', maximumConsentValidity: 15552000 }]),
}));

import { listAspsps } from '../../_lib/enableBankingClient.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('GET /api/bank/institutions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mappe les aspsps en institutions id PAYS::Nom', async () => {
    const { default: handler } = await import('../institutions.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { country: 'fr' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ institutions: [{ id: 'FR::BoursoBank', name: 'BoursoBank' }] });
    expect(listAspsps).toHaveBeenCalledWith('fr');
  });

  it('erreur Enable Banking → 500 avec message', async () => {
    listAspsps.mockRejectedValueOnce(new Error('Enable Banking 500: down'));
    const { default: handler } = await import('../institutions.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Enable Banking/);
  });
});
