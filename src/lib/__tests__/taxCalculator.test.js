import { describe, it, expect } from 'vitest';
import { baseIRFoyer, abattement10, calcIR, computeFoyerSummary, calcPlafondPer, computePlafondPERDeclarant } from '../taxCalculator.js';

describe('baseIRFoyer — agrégation multi-plugins Sprint A', () => {
  it('salaires seuls (cas de base, rétrocompatibilité)', () => {
    const p = { salaireNetImposableD1: 50000 };
    expect(baseIRFoyer(p)).toBe(abattement10(50000));
  });

  it('profil multi-employeurs : ARE + licenciement inclus dans la base', () => {
    // multi-employeurs.txt :
    //   sal=32 400 → abattement10=29 160
    //   ARE nette=2 660 → imposable à 100 % (aucun abattement)
    //   apprentissage brut=20 000 < plafond 21 622 → imposable=0
    //   licenciement tot=100 000, légale=20 000, remun=35 000
    //     exo=max(20000,70000,50000)=70000 → imp=30000
    //   PPV=2 500, remun 40 000 < seuil, accord=NON, <50 sal, PEE=NON → exonéré → imp=0
    const p = {
      salaireNetImposableD1: 32400,
      rniAreD1:           2660,
      rniApprentissageD1: 0,
      rniLicenciementD1:  30000,
      rniPpvD1:           0,
    };
    expect(baseIRFoyer(p)).toBe(61820); // 29160+2660+30000
    // Régression : ARE doit être dans la base (bug corrigé)
    expect(baseIRFoyer(p)).toBeGreaterThan(abattement10(32400) + 30000);
  });

  it('profil complexe : salaires + ARE + apprentissage excédent + PPV imposable', () => {
    // Foyer fictif : D1 sal=50 000, ARE=10 000, app excédent=5 000, PPV imposable=2 000
    const p = {
      salaireNetImposableD1: 50000,
      rniAreD1:           10000,
      rniApprentissageD1: 5000,
      rniPpvD1:           2000,
    };
    expect(baseIRFoyer(p)).toBe(62000); // 45000+10000+5000+2000
  });

  it('couple : D1 + D2 tous revenus additionnés', () => {
    const p = {
      salaireNetImposableD1: 40000,
      salaireNetImposableD2: 30000,
      rniAreD1:           5000,
      rniAreD2:           3000,
      rniLicenciementD1:  10000,
      rniLicenciementD2:  0,
      rniApprentissageD1: 0,
      rniApprentissageD2: 0,
      rniPpvD1:           0,
      rniPpvD2:           0,
    };
    const expected = abattement10(40000) + abattement10(30000) + 5000 + 3000 + 10000;
    expect(baseIRFoyer(p)).toBe(expected);
  });

  it('champs absents → traités comme 0 (pas d\'exception)', () => {
    expect(() => baseIRFoyer({})).not.toThrow();
    expect(baseIRFoyer({})).toBe(0);
  });
});

describe('calcIR — correction bug Récapitulatif (1 part → N parts)', () => {
  it('profil-fiscal-ref : RNI 73 067 €, 2 parts couple → ~8 128 € (pas 15 024 € à 1 part)', () => {
    // Avant le fix : computeIR(73067) avec 1 part et barème 2024 → ≈ 15 086 €
    // Après le fix : calcIR(73067, 2, true) avec barème 2025 → 8 128 €
    const ir = calcIR(73_067, 2, true);
    expect(ir).toBeCloseTo(8_128, -1); // ±5
    expect(ir).toBeLessThan(9_000);    // jamais confondu avec la valeur à 1 part (≈15 000)
  });

  it('solo 1 part — barème 2025 (régression : seuils 11 600 et 29 579, pas 11 497/29 315)', () => {
    // Vérifie que taxCalculator utilise bien le barème 2025 (JSON)
    const ir = calcIR(40_000, 1, false);
    // QF = 40 000 ; (29579-11600)*11% + (40000-29579)*30% = 1977.69 + 3126.3 = 5104
    expect(ir).toBeCloseTo(5_104, -1);
  });

  it('calcIR avec 0 ou base nulle → 0, pas null (cohérence avec StepRecap)', () => {
    expect(calcIR(0, 2, true)).toBe(0);
    expect(calcIR(null, 1, false)).toBe(0);
  });
});

describe('computeFoyerSummary — source de vérité IR+solde foyer', () => {
  it('profil-fiscal-ref : valeurs attendues (couple PACS, 2 parts, 73 067 € RNI)', () => {
    // Profil de référence : src/lib/__tests__/fixtures/profil-fiscal-ref.txt
    const profile = {
      mode:           'couple',
      parts:          2,
      rniFoyer:       73_067,
      revensFonciers: 705,
      foncierNet:     493,
      regimeFoncier:  'micro',
      pasTotal:       6_350,
      pasD1:          4_609,
      pasD2:          1_741,
      acompte8HW:     12,
      acompte8IW:     12,
      acompte8HX:     24,
      acompte8IX:     18,
      intMob2CK:      68,
    };
    const s = computeFoyerSummary(profile);
    expect(s).not.toBeNull();
    expect(s.rniFoyer).toBe(73_067);
    expect(s.partsFiscales).toBe(2);
    expect(s.irBrut).toBeCloseTo(8_128, -1);
    expect(s.decote).toBe(0);                    // 8 128 > seuil décote couple
    expect(s.irNet).toBeCloseTo(8_128, -1);
    expect(s.psFoncier).toBe(85);                // round(493 × 17,2%) = 85
    expect(s.totalDu).toBeCloseTo(8_213, -1);    // 8 128 + 85
    expect(s.pasTotal).toBe(6_350);              // pasTotal consolidé prioritaire
    expect(s.solde).toBeCloseTo(1_863, -1);      // 8 213 − 6 350 (positif = à payer)
    expect(s.tmi).toBe(30);
    expect(s.acomptesIR).toBe(24);               // 12 + 12
    expect(s.acomptesPS).toBe(42);               // 24 + 18
    expect(s.creditsImpot).toBe(68);
    expect(s.isCouple).toBe(true);
  });

  it('calcul psFoncier via revensFonciers+régime quand foncierNet absent', () => {
    // foncierNet non fourni → micro : 705 × (1 − 0.30) = 494 (arrondi) → PS = round(494×17,2%) = 85
    const profile = {
      mode: 'couple', parts: 2, rniFoyer: 73_067,
      revensFonciers: 705, regimeFoncier: 'micro',
      pasD1: 4_609, pasD2: 1_741,
    };
    const s = computeFoyerSummary(profile);
    // psFoncier doit être non nul et cohérent
    expect(s.psFoncier).toBeGreaterThan(0);
    expect(s.psFoncier).toBeLessThan(150);
  });

  it('pasTotal fallback sur pasD1+pasD2+arePas quand pasTotal absent', () => {
    const profile = {
      mode: 'solo', parts: 1, rniFoyer: 40_000,
      pasD1: 3_000, arePasD1: 500,
    };
    const s = computeFoyerSummary(profile);
    expect(s.pasTotal).toBe(3_500);
  });

  it('profil multi-sources PAS : arePas + pasRente1Bs agrégés', () => {
    const profile = {
      mode: 'couple', parts: 2, rniFoyer: 80_000,
      pasD1: 4_000, pasD2: 2_000,
      arePasD1: 300, pasRente1BsD2: 150,
    };
    const s = computeFoyerSummary(profile);
    expect(s.pasTotal).toBe(6_450);
  });

  it('retourne null si rniFoyer absent ou nul', () => {
    expect(computeFoyerSummary(null)).toBeNull();
    expect(computeFoyerSummary({})).toBeNull();
    expect(computeFoyerSummary({ mode: 'solo', rniFoyer: 0 })).toBeNull();
  });

  it('solde négatif → remboursement (PAS > totalDu)', () => {
    const profile = {
      mode: 'solo', parts: 1, rniFoyer: 20_000,
      pasD1: 5_000,
    };
    const s = computeFoyerSummary(profile);
    expect(s.solde).toBeLessThan(0);             // remboursement
    expect(s.pasTotal).toBe(5_000);
  });
});

describe('calcPlafondPer — abondPEEPERCO (3e paramètre, INC-01)', () => {
  it('sans réductions : plafond = 10% × abattement10(sal)', () => {
    // sal = 50 000, abattement10 = 45 000, 10% = 4 500 → plancher 4 710 s'applique
    expect(calcPlafondPer(50_000)).toBe(4_710);
  });

  it('avec PERO uniquement : plafond − pero', () => {
    // sal = 100 000, abattement10 = 90 000, brut = 9 000, plafond = 9 000
    // pero = 1 500 → 7 500
    expect(calcPlafondPer(100_000, 1_500)).toBe(7_500);
  });

  it('avec abondPEEPERCO uniquement : plafond − abond', () => {
    // sal = 100 000, plafond brut = 9 000, abond = 2 000 → 7 000
    expect(calcPlafondPer(100_000, 0, 2_000)).toBe(7_000);
  });

  it('cumul PERO + abondement : déduits ensemble', () => {
    // sal = 100 000, plafond brut = 9 000, pero = 1 000, abond = 2 000 → 6 000
    expect(calcPlafondPer(100_000, 1_000, 2_000)).toBe(6_000);
  });

  it('réductions > plafond brut → plancher 0 (pas négatif)', () => {
    // sal = 50 000, plafond brut = 4 710, pero = 3 000, abond = 3 000 = 6 000 > 4 710 → 0
    expect(calcPlafondPer(50_000, 3_000, 3_000)).toBe(0);
  });
});

describe('computePlafondPERDeclarant — source de vérité UI (INC-01 à INC-03)', () => {
  it('rni = 0 → brut10 = 0, plancher s\'applique, plafondBrut = 4 710', () => {
    const r = computePlafondPERDeclarant({ rni: 0 });
    expect(r.brut10).toBe(0);
    expect(r.plafondBrut).toBe(4_710);
    expect(r.reductions).toBe(0);
    expect(r.plafondNet).toBe(4_710);
    expect(r.reportTotal).toBe(0);
    expect(r.plafondWithReports).toBe(4_710);
  });

  it('appel sans paramètre (défauts) → idem rni=0', () => {
    const r = computePlafondPERDeclarant();
    expect(r.plafondBrut).toBe(4_710);
    expect(r.plafondNet).toBe(4_710);
  });

  it('plafond absolu : rni = 500 000 → plafondBrut = 37 680', () => {
    // brut10 = 50 000 → capped à MAX_PLAFOND_PER = 37 680
    const r = computePlafondPERDeclarant({ rni: 500_000 });
    expect(r.brut10).toBe(50_000);
    expect(r.plafondBrut).toBe(37_680);
    expect(r.plafondNet).toBe(37_680);
  });

  it('déduction PERO : rni = 60 000, pero = 1 000 → plafondNet = 5 000', () => {
    // brut10 = 6 000, plafondBrut = 6 000, reductions = 1 000, net = 5 000
    const r = computePlafondPERDeclarant({ rni: 60_000, pero: 1_000 });
    expect(r.brut10).toBe(6_000);
    expect(r.plafondBrut).toBe(6_000);
    expect(r.reductions).toBe(1_000);
    expect(r.plafondNet).toBe(5_000);
  });

  it('déduction PERO + abondement PEE : rni = 60 000, pero = 1 000, abond = 2 000 → plafondNet = 3 000', () => {
    const r = computePlafondPERDeclarant({ rni: 60_000, pero: 1_000, abondPEEPERCO: 2_000 });
    expect(r.reductions).toBe(3_000);
    expect(r.plafondNet).toBe(3_000);
    expect(r.plafondWithReports).toBe(3_000);  // sans reports
  });

  it('reports FIFO agrégés dans plafondWithReports', () => {
    // rni = 47 100, brut10 = 4 710 = plancher exact
    // pas de réductions, reportN3 = 2 000 → plafondWithReports = 6 710
    const r = computePlafondPERDeclarant({ rni: 47_100, reportN3: 2_000 });
    expect(r.plafondNet).toBe(4_710);
    expect(r.reportTotal).toBe(2_000);
    expect(r.plafondWithReports).toBe(6_710);
  });

  it('reports multi-années agrégés (N-1 + N-2 + N-3)', () => {
    const r = computePlafondPERDeclarant({
      rni: 100_000, reportN1: 1_000, reportN2: 2_000, reportN3: 3_000,
    });
    // plafondNet = 10 000, reportTotal = 6 000
    expect(r.plafondNet).toBe(10_000);
    expect(r.reportTotal).toBe(6_000);
    expect(r.plafondWithReports).toBe(16_000);
  });

  it('réductions > plafondBrut → plafondNet = 0 (jamais négatif)', () => {
    const r = computePlafondPERDeclarant({ rni: 50_000, pero: 3_000, abondPEEPERCO: 3_000 });
    // brut10 = 5 000, plafondBrut = max(5000, 4710) = 5 000, reductions = 6 000 → net = 0
    expect(r.plafondNet).toBe(0);
    expect(r.plafondWithReports).toBe(0);
  });

  it('profil-fiscal-ref : RNI D1 ≈ 46 500 → plafondBrut ≈ 4 650 (plancher si < 4 710)', () => {
    // rni = 46 500, brut10 = 4 650 < 4 710 → plancher
    const r = computePlafondPERDeclarant({ rni: 46_500 });
    expect(r.brut10).toBe(4_650);
    expect(r.plafondBrut).toBe(4_710);  // plancher
  });
});
