import { describe, it, expect } from 'vitest';
import {
  PLAFOND_LIVRET_A, PLAFOND_LDDS, PLAFOND_LEP,
  PLAFOND_VERSEMENTS_PEA, TAUX_PS_CAPITAL,
  TAUX_PLAFOND_PER, computePlafondPERDeclarant, MIN_PLAFOND_PER,
} from '../taxCalculator';
import { RDT_LIVRET_A, RDT_LIVRET_PLUS_PROMO, GAIN_DIFF_DEFAUT } from '../hypothesesRendement';

describe('Constantes centralisées (audit C4a)', () => {
  it('plafonds épargne réglementée et PEA lus depuis les JSON', () => {
    expect(PLAFOND_LIVRET_A).toBe(22_950);
    expect(PLAFOND_LDDS).toBe(12_000);
    expect(PLAFOND_LEP).toBe(10_000);
    expect(PLAFOND_VERSEMENTS_PEA).toBe(150_000);
  });

  it('taux plafond PER 10 % lu depuis per-plafonds.json (audit C4b)', () => {
    expect(TAUX_PLAFOND_PER).toBe(0.10);
  });

  it('plafond PER : parité avec l\'ancien calcul ×0,1 (audit C4b)', () => {
    const r = computePlafondPERDeclarant({ rni: 50_000 });
    expect(r.brut10).toBe(5_000);
    expect(r.plafondBrut).toBe(Math.max(5_000, MIN_PLAFOND_PER));
  });

  it('gain Livret+ : parité avec l\'ancienne formule en dur du parser', () => {
    // Ancienne formule : lvPlus × (0.07 − 0.03) × (1 − 0.172) → 10 000 € → 331 €
    expect(Math.round(10_000 * (RDT_LIVRET_PLUS_PROMO - RDT_LIVRET_A) * (1 - TAUX_PS_CAPITAL))).toBe(331);
    expect(GAIN_DIFF_DEFAUT).toBeCloseTo(0.03);
  });
});
