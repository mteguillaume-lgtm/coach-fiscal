import { describe, it, expect } from 'vitest';
import { summary, byBank, byType, byOwner } from '../calculator';

const P = [
  { bank: 'BNP', type: 'checking', value: 3000, owner: 'd1' },
  { bank: 'BNP', type: 'savings',  value: 2000, owner: 'd1' },
  { bank: 'Bourso', type: 'pea',   value: 42000, owner: 'joint' },
  { bank: 'BNP', type: 'loan',     value: -184000, owner: 'd2' },
];

describe('patrimoine/calculator', () => {
  it('summary : actifs, dettes (magnitude), valeur nette', () => {
    expect(summary(P)).toEqual({ netWorth: -137000, assets: 47000, debts: 184000, count: 4 });
  });

  it('summary sur liste vide', () => {
    expect(summary([])).toEqual({ netWorth: 0, assets: 0, debts: 0, count: 0 });
  });

  it('byBank agrège par établissement (dettes incluses en négatif)', () => {
    expect(byBank(P)).toEqual({ BNP: -179000, Bourso: 42000 });
  });

  it('byType agrège par type', () => {
    expect(byType(P)).toEqual({ checking: 3000, savings: 2000, pea: 42000, loan: -184000 });
  });

  it('byOwner répartit d1/d2/joint', () => {
    expect(byOwner(P)).toEqual({ d1: 5000, d2: -184000, joint: 42000 });
  });
});
