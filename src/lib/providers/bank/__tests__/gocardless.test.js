import { describe, it, expect, vi } from 'vitest';
import * as gc from '../gocardless';

const cfg = { url: 'https://back.vercel.app', secret: 's3cr3t' };

describe('bank/gocardless (client)', () => {
  it('getPositions appelle /api/bank/snapshot avec le header secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ positions: [{ id: 'gc-1', value: 100 }] }),
    });
    const out = await gc.getPositions(cfg, fetchMock);
    expect(out).toEqual([{ id: 'gc-1', value: 100 }]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://back.vercel.app/api/bank/snapshot');
    expect(opts.headers['x-kapio-secret']).toBe('s3cr3t');
  });

  it('getPositions lève sur réponse non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'nope' });
    await expect(gc.getPositions(cfg, fetchMock)).rejects.toThrow(/401/);
  });

  it('startConnect POST institution + owner et renvoie le lien', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: 'https://bank/consent' }) });
    const out = await gc.startConnect({ ...cfg, institutionId: 'BNP_FR', owner: 'd2' }, fetchMock);
    expect(out).toEqual({ link: 'https://bank/consent' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ institutionId: 'BNP_FR', owner: 'd2' });
  });
});
