import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({
  takePending: vi.fn(),
  saveSession: vi.fn().mockResolvedValue(),
}));
vi.mock('../../_lib/enableBankingClient.js', () => ({
  createSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1', accounts: [], validUntil: '2027-01-09T00:00:00Z' }),
}));

import { takePending, saveSession } from '../../_lib/store.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('POST /api/bank/callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('échange le code et sauvegarde la session avec owner/bank du pending', async () => {
    takePending.mockResolvedValue({ owner: 'd2', bank: 'BoursoBank' });
    const { default: handler } = await import('../callback.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { code: 'code-xyz', state: 'st-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, bank: 'BoursoBank' });
    expect(saveSession).toHaveBeenCalledWith({ id: 'sess-1', owner: 'd2', bank: 'BoursoBank', validUntil: '2027-01-09T00:00:00Z' });
  });

  it('404 si le state est inconnu ou expiré', async () => {
    takePending.mockResolvedValue(null);
    const { default: handler } = await import('../callback.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { code: 'c', state: 'inconnu' } }, res);
    expect(res.statusCode).toBe(404);
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('400 si code ou state manquant', async () => {
    const { default: handler } = await import('../callback.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { code: 'c' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
