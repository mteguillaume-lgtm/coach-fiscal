import { describe, it, expect } from 'vitest';
import { makePosition, isAsset, isDebt, POSITION_TYPES } from '../model';

describe('patrimoine/model', () => {
  it('makePosition applique les défauts et un id', () => {
    const p = makePosition({ bank: 'BNP', type: 'checking', label: 'CC', value: 100 });
    expect(p.id).toMatch(/^pos-/);
    expect(p).toMatchObject({ source: 'manual', owner: 'd1', manual: true, currency: 'EUR' });
    expect(typeof p.updatedAt).toBe('string');
  });

  it('makePosition conserve les valeurs fournies', () => {
    const p = makePosition({ id: 'x', source: 'gocardless', owner: 'joint', manual: false, value: -5, type: 'loan', bank: 'X', label: 'P' });
    expect(p).toMatchObject({ id: 'x', source: 'gocardless', owner: 'joint', manual: false });
  });

  it('isAsset/isDebt suivent le signe de value', () => {
    expect(isAsset(makePosition({ value: 10 }))).toBe(true);
    expect(isDebt(makePosition({ value: -10 }))).toBe(true);
    expect(isDebt(makePosition({ value: 0 }))).toBe(false);
  });

  it('POSITION_TYPES couvre les 8 types du contrat', () => {
    expect(POSITION_TYPES).toEqual(
      expect.arrayContaining(['checking','savings','life_insurance','pea','securities','per','loan','real_estate']),
    );
  });
});
