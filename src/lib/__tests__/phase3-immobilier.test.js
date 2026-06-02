import { describe, it, expect } from 'vitest';
import {
  calcFoncierReel, calcDeficitFoncier, calcLmnpMicro, detectLmp,
  calcIR, computeFoyerSummary, TAUX_PS_CAPITAL,
} from '../taxCalculator.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Immobilier locatif
// Sources : regimes-fonciers-lmnp.json (micro-foncier, déficit foncier, LMNP
// micro-BIC loi Le Meur, bascule LMP, SCI à l'IR)
// ════════════════════════════════════════════════════════════════════════════

describe('calcFoncierReel — revenu foncier net / déficit (location nue, 2044)', () => {
  it('net positif : recettes − charges − intérêts', () => {
    const r = calcFoncierReel({ recettes: 20_000, charges: 5_000, interets: 3_000 });
    expect(r.net).toBe(12_000);
    expect(r.deficit).toBe(0);
  });

  it('déficit dû aux autres charges (intérêts couverts par les recettes)', () => {
    // recettes 10 000 ; charges 18 000 ; intérêts 4 000 → déficit 12 000, 100 % autres charges
    const r = calcFoncierReel({ recettes: 10_000, charges: 18_000, interets: 4_000 });
    expect(r.net).toBe(-12_000);
    expect(r.deficit).toBe(12_000);
    expect(r.deficitInterets).toBe(0);          // intérêts (4 000) < recettes (10 000)
    expect(r.deficitAutresCharges).toBe(12_000);
  });

  it('déficit avec fraction intérêts non couverte', () => {
    // recettes 5 000 ; charges 2 000 ; intérêts 8 000 → déficit 5 000, dont 3 000 d\'intérêts
    const r = calcFoncierReel({ recettes: 5_000, charges: 2_000, interets: 8_000 });
    expect(r.deficit).toBe(5_000);
    expect(r.deficitInterets).toBe(3_000);      // 8 000 − 5 000 de recettes
    expect(r.deficitAutresCharges).toBe(2_000);
  });
});

describe('calcDeficitFoncier — imputation 10 700 € / report 10 ans', () => {
  it('imputation plafonnée à 10 700 €, excédent reportable', () => {
    const d = calcDeficitFoncier({ deficitAutresCharges: 12_000, deficitInterets: 0 });
    expect(d.imputableRevenuGlobal).toBe(10_700);
    expect(d.reportableRevenusFonciers).toBe(1_300);   // 12 000 − 10 700
  });

  it('les intérêts ne sont jamais imputables sur le revenu global → report', () => {
    const d = calcDeficitFoncier({ deficitAutresCharges: 2_000, deficitInterets: 3_000 });
    expect(d.imputableRevenuGlobal).toBe(2_000);
    expect(d.reportableRevenusFonciers).toBe(3_000);   // la fraction intérêts part en report
  });

  it('plafond doublé à 21 400 € pour rénovation énergétique globale', () => {
    const d = calcDeficitFoncier({ deficitAutresCharges: 25_000, deficitInterets: 0, renovationEnergetique: true });
    expect(d.imputableRevenuGlobal).toBe(21_400);
    expect(d.reportableRevenusFonciers).toBe(3_600);
  });
});

describe('calcLmnpMicro — LMNP micro-BIC (réforme loi Le Meur)', () => {
  it('longue durée : abattement 50 %, seuil 77 700 €', () => {
    const r = calcLmnpMicro({ type: 'lmnp_longue_duree', recettes: 60_000 });
    expect(r.abattementEuros).toBe(30_000);
    expect(r.beneficeImposable).toBe(30_000);
    expect(r.depassementSeuil).toBe(false);
  });

  it('meublé de tourisme classé : abattement 50 %, seuil 77 700 €', () => {
    expect(calcLmnpMicro({ type: 'meuble_tourisme_classe', recettes: 40_000 }).beneficeImposable).toBe(20_000);
  });

  it('meublé de tourisme non classé : abattement 30 %, seuil 15 000 € (dépassement)', () => {
    const r = calcLmnpMicro({ type: 'meuble_tourisme_non_classe', recettes: 20_000 });
    expect(r.abattementEuros).toBe(6_000);            // 30 %
    expect(r.beneficeImposable).toBe(14_000);
    expect(r.depassementSeuil).toBe(true);            // 20 000 > 15 000
  });

  it('type inconnu → null', () => {
    expect(calcLmnpMicro({ type: 'meuble_xxx', recettes: 10_000 })).toBeNull();
  });
});

describe('detectLmp — bascule LMNP → LMP (conditions cumulatives)', () => {
  it('LMP : recettes > 23 000 € ET > 50 % des revenus pro', () => {
    expect(detectLmp({ recettesMeublees: 30_000, revenusProFoyer: 40_000 }).estLMP).toBe(true);
  });

  it('non LMP si recettes < 50 % des revenus pro', () => {
    const r = detectLmp({ recettesMeublees: 30_000, revenusProFoyer: 80_000 });
    expect(r.depasseSeuil).toBe(true);
    expect(r.depassePart).toBe(false);
    expect(r.estLMP).toBe(false);
  });

  it('non LMP si recettes ≤ 23 000 €', () => {
    expect(detectLmp({ recettesMeublees: 20_000, revenusProFoyer: 10_000 }).estLMP).toBe(false);
  });
});

// ─── Chaîne complète ──────────────────────────────────────────────────────────

describe('Chaîne complète — LMNP micro longue durée (solo)', () => {
  const formData = {
    statut: 'Célibataire',
    net_imp: '0',
    lmnp_type: 'lmnp_longue_duree',
    lmnp_recettes: '60000',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('émet la section immobilier avec la case 5ND', () => {
    expect(profile).toContain('REVENUS IMMOBILIER LOCATIF');
    expect(profile).toContain('5ND');
    expect(profile).toContain('Bénéfice LMNP micro-BIC foyer : 30');
  });

  it('le bénéfice LMNP (30 000 €) est réintégré au RNI du foyer', () => {
    expect(parsed.lmnpMicroBenefice).toBe(30_000);
    expect(parsed.immoDeltaRni).toBe(30_000);
    expect(parsed.rniFoyer).toBe(30_000);
  });

  // Cas IR vérifié À LA MAIN (barème 2025, 1 part) :
  //   tranche 11 % : (29 579 − 11 600) × 11 % = 1 977,69
  //   tranche 30 % : (30 000 − 29 579) × 30 % =   126,30
  //   IR brut = 2 103,99 ≈ 2 104 € (> seuil décote 1 982 € → pas de décote)
  it('IR foyer cohérent avec le barème (RNI 30 000 € → ~2 104 €)', () => {
    const summary = computeFoyerSummary(parsed);
    expect(summary.irBrut).toBe(calcIR(30_000, 1, false));
    expect(summary.irBrut).toBeGreaterThanOrEqual(2_100);
    expect(summary.irBrut).toBeLessThanOrEqual(2_108);
  });

  it('PS 17,2 % sur le bénéfice LMNP', () => {
    const summary = computeFoyerSummary(parsed);
    expect(summary.psImmoBase).toBe(30_000);
    expect(summary.psImmo).toBe(Math.round(30_000 * TAUX_PS_CAPITAL));   // 5 160 €
  });
});

describe('Chaîne complète — déficit foncier imputé sur le revenu global (solo)', () => {
  const formData = {
    statut: 'Célibataire',
    net_imp: '30000',                  // RNI salaire = 27 000 € après abattement 10 %
    foncier_reel_recettes: '10000',
    foncier_reel_charges: '18000',
    foncier_reel_interets: '4000',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('déficit imputé 10 700 € (plafond) + report 1 300 €', () => {
    expect(parsed.foncierDeficitImputeGlobal).toBe(10_700);
    expect(parsed.foncierDeficitReporte).toBe(1_300);
    expect(parsed.immoDeltaRni).toBe(-10_700);
  });

  it('RNI foyer réduit par le déficit imputé (27 000 − 10 700 = 16 300 €)', () => {
    expect(parsed.rniFoyer).toBe(16_300);
  });

  it('pas de PS sur un foncier déficitaire', () => {
    expect(computeFoyerSummary(parsed).psImmoBase).toBe(0);
  });
});

describe('Couple — foncier réel net + LMNP micro (foyer)', () => {
  const formData = {
    statut: 'Marié(e)',
    foncier_reel_recettes: '20000',
    foncier_reel_charges: '5000',
    foncier_reel_interets: '3000',     // foncier réel net = 12 000 €
    lmnp_type: 'meuble_tourisme_classe',
    lmnp_recettes: '40000',            // bénéfice LMNP = 20 000 €
  };
  const d1 = { net_imp: '40000' };     // RNI D1 = 36 000 €
  const profile = buildProfile(formData, d1, {}, [], true);
  const parsed  = parseProfile(profile);

  it('revenus immobiliers consolidés réintégrés au RNI', () => {
    expect(parsed.foncierReelNet).toBe(12_000);
    expect(parsed.lmnpMicroBenefice).toBe(20_000);
    expect(parsed.immoDeltaRni).toBe(32_000);              // 12 000 + 20 000
    expect(parsed.rniFoyer).toBe(68_000);                  // 36 000 + 32 000
  });

  it('base PS immobilier = foncier net + bénéfice LMNP', () => {
    expect(computeFoyerSummary(parsed).psImmoBase).toBe(32_000);
  });
});
