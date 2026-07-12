import { describe, it, expect, beforeEach } from 'vitest';
import { listManual, addManual, updateManual, removeManual, MANUAL_KEY } from '../manualStore';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('patrimoine/manualStore', () => {
  let s;
  beforeEach(() => { s = memStorage(); });

  it('listManual vide par défaut', () => {
    expect(listManual(s)).toEqual([]);
  });

  it('addManual force source/manual et persiste', () => {
    const list = addManual({ bank: 'Bourso', type: 'pea', label: 'PEA', value: 42000, owner: 'd1' }, s);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ source: 'manual', manual: true, type: 'pea', value: 42000 });
    expect(JSON.parse(s.getItem(MANUAL_KEY))).toHaveLength(1);
  });

  it('updateManual modifie par id', () => {
    const [p] = addManual({ type: 'pea', value: 1000 }, s);
    const list = updateManual(p.id, { value: 1500 }, s);
    expect(list[0].value).toBe(1500);
    expect(list[0].updatedAt).not.toBe(p.updatedAt);
  });

  it('removeManual supprime par id', () => {
    const [p] = addManual({ type: 'pea', value: 1000 }, s);
    expect(removeManual(p.id, s)).toEqual([]);
  });

  it('listManual ignore un JSON corrompu', () => {
    s.setItem(MANUAL_KEY, '{oops');
    expect(listManual(s)).toEqual([]);
  });
});
