import { describe, it, expect, vi } from 'vitest';
import { getConsolidatedSnapshot } from '../index';

function memStorage(list) {
  const m = new Map([['kapio.patrimoine.manual', JSON.stringify(list)]]);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: () => {}, removeItem: () => {} };
}

describe('bank/index.getConsolidatedSnapshot', () => {
  it('fusionne Enable Banking + manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
    const enablebanking = { getPositions: vi.fn().mockResolvedValue({ positions: [{ id: 'eb-1', source: 'enablebanking', type: 'checking', value: 3000 }], errors: [] }) };
    const snap = await getConsolidatedSnapshot(
      { config: { url: 'u', secret: 's' }, storage: s },
      { enablebanking },
    );
    expect(snap.positions).toHaveLength(2);
    expect(snap.positions.map((p) => p.source).sort()).toEqual(['enablebanking', 'manual']);
    expect(typeof snap.generatedAt).toBe('string');
  });

  it('sans config valide : renvoie seulement le manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const enablebanking = { getPositions: vi.fn() };
    const snap = await getConsolidatedSnapshot({ config: { url: '', secret: '' }, storage: s }, { enablebanking });
    expect(enablebanking.getPositions).not.toHaveBeenCalled();
    expect(snap.positions).toHaveLength(1);
  });

  it('erreur Enable Banking : conserve le manuel + remonte errors', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const enablebanking = { getPositions: vi.fn().mockRejectedValue(new Error('boom')) };
    const snap = await getConsolidatedSnapshot({ config: { url: 'u', secret: 's' }, storage: s }, { enablebanking });
    expect(snap.positions).toHaveLength(1);
    expect(snap.errors[0]).toMatch(/boom/);
  });

  it('erreurs par banque du backend : remontées sans perdre ni manuel ni positions', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const enablebanking = {
      getPositions: vi.fn().mockResolvedValue({
        positions: [{ id: 'eb-1', source: 'enablebanking', value: 100 }],
        errors: ['BNP : consentement expiré'],
      }),
    };
    const snap = await getConsolidatedSnapshot({ config: { url: 'u', secret: 's' }, storage: s }, { enablebanking });
    expect(snap.positions).toHaveLength(2);
    expect(snap.errors).toEqual(['BNP : consentement expiré']);
  });
});
