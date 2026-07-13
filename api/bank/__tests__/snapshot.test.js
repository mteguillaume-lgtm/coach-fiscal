import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({
  listSessions: vi.fn().mockResolvedValue([{ id: 'sess-1', owner: 'd1', bank: 'BNP' }]),
}));
vi.mock('../../_lib/enableBankingClient.js', () => ({
  getSessionAccounts: vi.fn().mockResolvedValue({ status: 'AUTHORIZED', accountUids: ['acc-1'] }),
  getAccountDetails: vi.fn().mockResolvedValue({ cash_account_type: 'CACC', name: 'CC', account_id: { iban: 'FR760001' } }),
  getAccountBalances: vi.fn().mockResolvedValue([{ balance_type: 'ITAV', balance_amount: { amount: '3000', currency: 'EUR' } }]),
}));

import { getSessionAccounts } from '../../_lib/enableBankingClient.js';
import { listSessions } from '../../_lib/store.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('GET /api/bank/snapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renvoie des positions normalisées', async () => {
    const { default: handler } = await import('../snapshot.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.positions[0]).toMatchObject({ source: 'enablebanking', type: 'checking', value: 3000, bank: 'BNP', owner: 'd1' });
    expect(res.body.errors).toEqual([]);
  });

  it('une session en échec remonte dans errors sans casser la réponse', async () => {
    getSessionAccounts.mockRejectedValueOnce(new Error('Enable Banking 401: consent expired'));
    const { default: handler } = await import('../snapshot.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.positions).toEqual([]);
    expect(res.body.errors[0]).toMatch(/BNP/);
    expect(res.body.errors[0]).toMatch(/reconnectez/i);
  });

  it('une session au consentement expiré est ignorée sans appel à Enable Banking', async () => {
    listSessions.mockResolvedValueOnce([{ id: 'sess-old', owner: 'd1', bank: 'BNP', validUntil: '2020-01-01T00:00:00Z' }]);
    const { default: handler } = await import('../snapshot.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(getSessionAccounts).not.toHaveBeenCalled();
    expect(res.body.errors[0]).toMatch(/consentement expiré/);
    expect(res.body.positions).toEqual([]);
  });
});
