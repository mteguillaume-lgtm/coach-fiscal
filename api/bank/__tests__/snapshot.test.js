import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({
  listRequisitions: vi.fn().mockResolvedValue([{ id: 'req-1', owner: 'd1', bank: 'BNP' }]),
}));
vi.mock('../../_lib/gocardlessClient.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('tok'),
  getRequisitionAccounts: vi.fn().mockResolvedValue(['acc-1']),
  getAccountDetails: vi.fn().mockResolvedValue({ cashAccountType: 'CACC', name: 'CC', iban: 'FR760001' }),
  getAccountBalance: vi.fn().mockResolvedValue({ amount: '3000', currency: 'EUR' }),
}));

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
    expect(res.body.positions[0]).toMatchObject({ source: 'gocardless', type: 'checking', value: 3000, bank: 'BNP', owner: 'd1' });
  });
});
