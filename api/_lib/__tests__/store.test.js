import { describe, it, expect, vi, beforeEach } from 'vitest';

const mem = new Map();
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k) => (mem.has(k) ? mem.get(k) : null),
      set: async (k, v) => { mem.set(k, v); },
      del: async (k) => { mem.delete(k); },
    }),
  },
}));

import { listSessions, saveSession } from '../store.js';

describe('store.saveSession', () => {
  beforeEach(() => mem.clear());

  it('remplace la session précédente du même couple owner/bank (reconnexion)', async () => {
    await saveSession({ id: 'sess-1', owner: 'd1', bank: 'BNP', validUntil: '2026-01-01T00:00:00Z' });
    await saveSession({ id: 'sess-2', owner: 'd1', bank: 'BNP', validUntil: '2027-01-01T00:00:00Z' });
    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('sess-2');
  });

  it('conserve les sessions des autres banques et des autres titulaires', async () => {
    await saveSession({ id: 'sess-1', owner: 'd1', bank: 'BNP', validUntil: null });
    await saveSession({ id: 'sess-2', owner: 'd2', bank: 'BNP', validUntil: null });
    await saveSession({ id: 'sess-3', owner: 'd1', bank: 'BoursoBank', validUntil: null });
    expect(await listSessions()).toHaveLength(3);
  });
});
