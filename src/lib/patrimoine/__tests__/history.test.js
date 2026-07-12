import { describe, it, expect, beforeEach } from 'vitest';
import { appendSnapshot, HISTORY_KEY } from '../history';

function memStorage(init) {
  const m = new Map(init ? [[HISTORY_KEY, init]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('patrimoine/history', () => {
  let s;
  beforeEach(() => { s = memStorage(); });

  it('appendSnapshot ajoute un point daté', () => {
    const h = appendSnapshot({ netWorth: 100, assets: 100, debts: 0 }, s, new Date('2026-07-10T09:00:00Z'));
    expect(h).toEqual([{ date: '2026-07-10', netWorth: 100, assets: 100, debts: 0 }]);
  });

  it('remplace le point du même jour au lieu de dupliquer', () => {
    appendSnapshot({ netWorth: 100, assets: 100, debts: 0 }, s, new Date('2026-07-10T09:00:00Z'));
    const h = appendSnapshot({ netWorth: 150, assets: 150, debts: 0 }, s, new Date('2026-07-10T18:00:00Z'));
    expect(h).toHaveLength(1);
    expect(h[0].netWorth).toBe(150);
  });

  it('conserve les jours distincts, triés', () => {
    appendSnapshot({ netWorth: 1, assets: 1, debts: 0 }, s, new Date('2026-07-09T09:00:00Z'));
    const h = appendSnapshot({ netWorth: 2, assets: 2, debts: 0 }, s, new Date('2026-07-10T09:00:00Z'));
    expect(h.map((p) => p.date)).toEqual(['2026-07-09', '2026-07-10']);
  });
});
