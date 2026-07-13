import { describe, it, expect, vi } from 'vitest';
import * as eb from '../enablebanking';

const cfg = { url: 'https://back.vercel.app', secret: 's3cr3t' };

describe('bank/enablebanking (client)', () => {
  it('getPositions appelle /api/bank/snapshot et renvoie positions + errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ positions: [{ id: 'eb-1', value: 100 }], errors: ['BNP : expiré'] }),
    });
    const out = await eb.getPositions(cfg, fetchMock);
    expect(out).toEqual({ positions: [{ id: 'eb-1', value: 100 }], errors: ['BNP : expiré'] });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://back.vercel.app/api/bank/snapshot');
    expect(opts.headers['x-kapio-secret']).toBe('s3cr3t');
  });

  it('getPositions lève sur réponse non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'nope' });
    await expect(eb.getPositions(cfg, fetchMock)).rejects.toThrow(/401/);
  });

  it('startConnect POST institution + owner et renvoie le lien', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: 'https://bank/consent' }) });
    const out = await eb.startConnect({ ...cfg, institutionId: 'FR::BoursoBank', institutionName: 'BoursoBank', owner: 'd2' }, fetchMock);
    expect(out).toEqual({ link: 'https://bank/consent' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ institutionId: 'FR::BoursoBank', institutionName: 'BoursoBank', owner: 'd2' });
  });

  it('completeConnect POST code + state sur /api/bank/callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, bank: 'BoursoBank' }) });
    const out = await eb.completeConnect({ ...cfg, code: 'c-1', state: 'st-1' }, fetchMock);
    expect(out).toEqual({ ok: true, bank: 'BoursoBank' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://back.vercel.app/api/bank/callback');
    expect(JSON.parse(opts.body)).toEqual({ code: 'c-1', state: 'st-1' });
  });
});
