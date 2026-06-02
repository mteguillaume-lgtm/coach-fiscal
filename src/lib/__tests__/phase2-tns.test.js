import { describe, it, expect } from 'vitest';
import {
  calcMicroTns, estimCotisationsMicro, calcIR, computeFoyerSummary,
  MICRO_TNS_TYPES,
} from '../taxCalculator.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Revenus des indépendants (TNS) au régime micro
// Sources : micro-tns.json (seuils, abattements, VL, micro-social)
// ════════════════════════════════════════════════════════════════════════════

describe('calcMicroTns — bénéfice imposable (abattement forfaitaire)', () => {
  it('micro-BIC vente : abattement 71 %', () => {
    const r = calcMicroTns({ type: 'micro_bic_vente', recettes: 100_000 });
    expect(r.abattementEuros).toBe(71_000);
    expect(r.beneficeImposable).toBe(29_000);
  });

  it('micro-BIC service : abattement 50 %', () => {
    expect(calcMicroTns({ type: 'micro_bic_service', recettes: 40_000 }).beneficeImposable).toBe(20_000);
  });

  it('micro-BNC : abattement 34 %', () => {
    const r = calcMicroTns({ type: 'micro_bnc', recettes: 50_000 });
    expect(r.abattementEuros).toBe(17_000);
    expect(r.beneficeImposable).toBe(33_000);
  });

  it('micro-BA : abattement 87 %', () => {
    expect(calcMicroTns({ type: 'micro_ba', recettes: 30_000 }).beneficeImposable).toBe(3_900);
  });

  it('abattement plancher de 305 € sur les petites recettes', () => {
    // 200 € de recettes BNC → abattement 34 % = 68 € < plancher 305 €, mais ≤ recettes.
    const r = calcMicroTns({ type: 'micro_bnc', recettes: 200 });
    expect(r.abattementEuros).toBe(200);          // plafonné aux recettes
    expect(r.beneficeImposable).toBe(0);
  });

  it('flag dépassement de seuil', () => {
    expect(calcMicroTns({ type: 'micro_bic_service', recettes: 80_000 }).depassementSeuil).toBe(true);
    expect(calcMicroTns({ type: 'micro_bic_service', recettes: 70_000 }).depassementSeuil).toBe(false);
  });

  it('type inconnu → null', () => {
    expect(calcMicroTns({ type: 'micro_xxx', recettes: 10_000 })).toBeNull();
  });
});

describe('estimCotisationsMicro — cotisations URSSAF + versement libératoire', () => {
  it('cotisations BIC service 21,2 %', () => {
    expect(estimCotisationsMicro({ type: 'micro_bic_service', recettes: 40_000 }).cotisations).toBe(8_480);
  });

  it('versement libératoire BNC 2,2 % uniquement si option choisie', () => {
    const sans = estimCotisationsMicro({ type: 'micro_bnc', recettes: 50_000 });
    const avec = estimCotisationsMicro({ type: 'micro_bnc', recettes: 50_000, versementLiberatoire: true });
    expect(sans.versementLiberatoire).toBe(0);
    expect(avec.versementLiberatoire).toBe(1_100);   // 50 000 × 2,2 %
  });

  it('tous les types de régime sont exposés', () => {
    expect(MICRO_TNS_TYPES).toEqual(
      expect.arrayContaining(['micro_bic_vente', 'micro_bic_service', 'micro_bnc', 'micro_ba']),
    );
  });
});

describe('Chaîne complète collecte → générateur → parser (micro-BNC solo)', () => {
  const formData = {
    statut: 'Célibataire',
    net_imp: '0',
    tns_type: 'micro_bnc',
    tns_recettes: '50000',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('émet la section TNS avec la bonne case 5HQ', () => {
    expect(profile).toContain('REVENUS INDÉPENDANTS (TNS)');
    expect(profile).toContain('5HQ');
    expect(profile).toContain('Bénéfice imposable D1 : 33');
  });

  it('le bénéfice micro est réintégré au RNI du foyer', () => {
    expect(parsed.beneficeTnsImposable).toBe(33_000);
    expect(parsed.rniFoyer).toBe(33_000);
  });

  it('IR foyer cohérent avec le barème (RNI 33 000 € → ~3 004 €)', () => {
    const summary = computeFoyerSummary(parsed);
    const irAttendu = calcIR(33_000, 1, false);
    expect(summary.irBrut).toBe(irAttendu);
    expect(irAttendu).toBeGreaterThan(2_990);
    expect(irAttendu).toBeLessThan(3_020);
  });
});

describe('Couple : TNS par déclarant (D1 micro-BIC service, D2 micro-BNC en VL)', () => {
  const d1 = { net_imp: '30000', tns_type: 'micro_bic_service', tns_recettes: '40000' };
  const d2 = { net_imp: '0', tns_type: 'micro_bnc', tns_recettes: '50000', tns_vl: 'Oui' };
  const profile = buildProfile({ statut: 'Marié(e)' }, d1, d2, [], true);
  const parsed  = parseProfile(profile);

  it('seul le bénéfice hors VL est réintégré au RNI (D1 = 20 000 €, D2 en VL exclu)', () => {
    expect(parsed.beneficeTnsImposable).toBe(20_000);
    expect(parsed.recettesTnsD1).toBe(40_000);
    expect(parsed.recettesTnsD2).toBe(50_000);
  });

  it('RNI foyer = salaire D1 (27 000 €) + bénéfice TNS D1 (20 000 €)', () => {
    expect(parsed.rniFoyer).toBe(47_000);   // abattement 10 % sur 30 000 = 27 000, + 20 000
  });
});

describe('Versement libératoire : revenu hors barème', () => {
  it('le bénéfice n\'est PAS réintégré au RNI quand le VL est choisi', () => {
    const profile = buildProfile(
      { statut: 'Célibataire', net_imp: '0', tns_type: 'micro_bnc', tns_recettes: '50000', tns_vl: 'Oui' },
      {}, {}, [], false,
    );
    const parsed = parseProfile(profile);
    expect(parsed.beneficeTnsImposable).toBe(0);
    expect(profile).toContain('Versement libératoire IR D1 : Oui');
  });
});
