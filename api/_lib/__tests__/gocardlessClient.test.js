import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccessToken, createRequisition } from '../gocardlessClient';

beforeEach(() => {
  process.env.GOCARDLESS_SECRET_ID = 'sid';
  process.env.GOCARDLESS_SECRET_KEY = 'skey';
});

describe('gocardlessClient', () => {
  it('getAccessToken poste les secrets et renvoie access', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access: 'tok-123' }) });
    const tok = await getAccessToken(fetchMock);
    expect(tok).toBe('tok-123');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ secret_id: 'sid', secret_key: 'skey' });
  });

  it('createRequisition renvoie id + link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'req-1', link: 'https://consent' }) });
    const out = await createRequisition({ institutionId: 'BNP', redirect: 'https://app', reference: 'd1:BNP' }, 'tok', fetchMock);
    expect(out).toEqual({ id: 'req-1', link: 'https://consent' });
  });
});
