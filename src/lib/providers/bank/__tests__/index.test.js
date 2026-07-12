import { describe, it, expect, vi } from 'vitest';
import { getConsolidatedSnapshot } from '../index';

function memStorage(list) {
  const m = new Map([['kapio.patrimoine.manual', JSON.stringify(list)]]);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: () => {}, removeItem: () => {} };
}

describe('bank/index.getConsolidatedSnapshot', () => {
  it('fusionne GoCardless + manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
    const gocardless = { getPositions: vi.fn().mockResolvedValue([{ id: 'gc-1', source: 'gocardless', type: 'checking', value: 3000 }]) };
    const snap = await getConsolidatedSnapshot(
      { config: { url: 'u', secret: 's' }, storage: s },
      { gocardless },
    );
    expect(snap.positions).toHaveLength(2);
    expect(snap.positions.map((p) => p.source).sort()).toEqual(['gocardless', 'manual']);
    expect(typeof snap.generatedAt).toBe('string');
  });

  it('sans config valide : renvoie seulement le manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const gocardless = { getPositions: vi.fn() };
    const snap = await getConsolidatedSnapshot({ config: { url: '', secret: '' }, storage: s }, { gocardless });
    expect(gocardless.getPositions).not.toHaveBeenCalled();
    expect(snap.positions).toHaveLength(1);
  });

  it('erreur GoCardless : conserve le manuel + remonte errors', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const gocardless = { getPositions: vi.fn().mockRejectedValue(new Error('boom')) };
    const snap = await getConsolidatedSnapshot({ config: { url: 'u', secret: 's' }, storage: s }, { gocardless });
    expect(snap.positions).toHaveLength(1);
    expect(snap.errors[0]).toMatch(/boom/);
  });
});
