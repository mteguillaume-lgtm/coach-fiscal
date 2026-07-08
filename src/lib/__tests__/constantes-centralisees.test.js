import { describe, it, expect } from 'vitest';
import {
  PLAFOND_LIVRET_A, PLAFOND_LDDS, PLAFOND_LEP,
  PLAFOND_VERSEMENTS_PEA, TAUX_PS_CAPITAL,
  SEUIL_RFR_LEP_SOLO, SEUIL_RFR_LEP_COUPLE,
  TAUX_PLAFOND_PER, computePlafondPERDeclarant, MIN_PLAFOND_PER,
  AV_ABATTEMENT_8ANS_SOLO, AV_ABATTEMENT_8ANS_COUPLE,
  AV_TAUX_IR_APRES_8ANS, AV_SEUIL_PRIMES_TAUX_REDUIT,
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

  it('assurance-vie rachats : abattements, taux réduit et seuil 150 k en champs machine (audit C4c)', () => {
    expect(AV_ABATTEMENT_8ANS_SOLO).toBe(4_600);
    expect(AV_ABATTEMENT_8ANS_COUPLE).toBe(9_200);
    expect(AV_TAUX_IR_APRES_8ANS).toBe(0.075);
    expect(AV_SEUIL_PRIMES_TAUX_REDUIT).toBe(150_000);
  });

  it('seuils RFR d\'éligibilité LEP lus depuis epargne-reglementee.json (audit E5)', () => {
    expect(SEUIL_RFR_LEP_SOLO).toBe(22_419);
    expect(SEUIL_RFR_LEP_COUPLE).toBe(34_393);
  });

  it('gain Livret+ : parité avec l\'ancienne formule en dur du parser', () => {
    // Ancienne formule : lvPlus × (0.07 − 0.03) × (1 − 0.172) → 10 000 € → 331 €
    expect(Math.round(10_000 * (RDT_LIVRET_PLUS_PROMO - RDT_LIVRET_A) * (1 - TAUX_PS_CAPITAL))).toBe(331);
    expect(GAIN_DIFF_DEFAUT).toBeCloseTo(0.03);
  });
});
