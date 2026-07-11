import { describe, it, expect } from 'vitest';
import * as manual from '../manual';

function memStorage(list) {
  const m = new Map([['kapio.patrimoine.manual', JSON.stringify(list)]]);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: () => {}, removeItem: () => {} };
}

describe('bank/manual', () => {
  it('getPositions renvoie les postes manuels stockés', () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
    expect(manual.getPositions(s)).toEqual([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
  });
});
