import { describe, it, expect } from 'vitest';
import {
  calcReductionDons, calcReductionScolarite, calcCreditEmploiDomicile,
  calcCreditGarde, calcCreditSyndicales, calcDeductionsRevenu,
  arbitragePfuBareme, computeFoyerSummary,
} from '../taxCalculator.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';
import { detectOpportunities } from '../opportunitiesDetector.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Helpers réductions / crédits (sources : niches-fiscales.json)
// ════════════════════════════════════════════════════════════════════════════

describe('Réductions / crédits — helpers (art. 199/200 CGI)', () => {
  it('dons aide aux personnes : 75 % jusqu\'à 1 000 €', () => {
    expect(calcReductionDons(1000, 0, 50_000)).toBe(750); // 1000 × 75 %
  });

  it('dons : 75 % sur 1 000 € + 66 % au-delà et dons généraux', () => {
    // aide 1500 → 1000×0,75=750 ; reste 500 + général 500 = 1000 × 66 % = 660
    expect(calcReductionDons(1500, 500, 50_000)).toBe(1410);
  });

  it('dons généraux plafonnés à 20 % du revenu imposable', () => {
    // 30 000 € de dons, RNI 50 000 → plafond 66 % = 10 000 → 6 600
    expect(calcReductionDons(0, 30_000, 50_000)).toBe(6_600);
  });

  it('emploi à domicile : crédit 50 %, plafond 12 000 € + 1 500 €/personne', () => {
    expect(calcCreditEmploiDomicile(20_000, 0)).toBe(6_000);   // plafond 12 000 → 6 000
    expect(calcCreditEmploiDomicile(15_000, 1)).toBe(6_750);   // plafond 13 500 → 6 750
    expect(calcCreditEmploiDomicile(20_000, 3)).toBe(7_500);   // plafond plafonné à 15 000 → 7 500
  });

  it('garde d\'enfant < 6 ans : crédit 50 %, plafond 3 500 €/enfant', () => {
    expect(calcCreditGarde(5_000, 1)).toBe(1_750);             // plafond 3 500 → 1 750
    expect(calcCreditGarde(2_000, 1)).toBe(1_000);             // dépense < plafond → 50 %
    expect(calcCreditGarde(5_000, 0, 1)).toBe(875);            // alternée : plafond 1 750 → 875
  });

  it('frais de scolarité : forfaits 61 / 153 / 183 €', () => {
    expect(calcReductionScolarite({ college: 1, lycee: 1, sup: 1 })).toBe(397);
    expect(calcReductionScolarite({ college: 2 })).toBe(122);
  });

  it('cotisations syndicales : crédit 66 %, plafond 1 % du revenu brut', () => {
    expect(calcCreditSyndicales(200, 30_000)).toBe(132);       // 200 × 66 % (< plafond 300)
    expect(calcCreditSyndicales(500, 30_000)).toBe(198);       // plafonné à 300 → 198
  });
});

describe('Déductions du revenu — pension alimentaire & frais d\'accueil', () => {
  it('pension enfant majeur plafonnée à 6 855 €/enfant', () => {
    const r = calcDeductionsRevenu({ pensionVersee: 8_000, pensionBenef: 'Enfant majeur', pensionNb: 1 });
    expect(r.pensionDeduc).toBe(6_855);
  });

  it('pension enfant majeur — plafond × nb de bénéficiaires', () => {
    const r = calcDeductionsRevenu({ pensionVersee: 20_000, pensionBenef: 'Enfant majeur', pensionNb: 2 });
    expect(r.pensionDeduc).toBe(13_710); // 6 855 × 2
  });

  it('pension ascendant : montant réel, sans plafond', () => {
    const r = calcDeductionsRevenu({ pensionVersee: 9_000, pensionBenef: 'Ascendant' });
    expect(r.pensionDeduc).toBe(9_000);
  });

  it('frais d\'accueil personne âgée plafonnés à 4 075 €', () => {
    const r = calcDeductionsRevenu({ fraisAccueil: 5_000 });
    expect(r.fraisAccueilDeduc).toBe(4_075);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Arbitrage PFU 30 % vs option barème (gcp.md + pfu-prelevements-sociaux.json)
// ════════════════════════════════════════════════════════════════════════════

describe('arbitragePfuBareme — dividendes/intérêts CTO', () => {
  it('TMI élevée (30 %) : PFU avantageux sur dividendes', () => {
    // dividendes 10 000, RNI 40 000 (1 part) : barème marginal ≈ 35 % > PFU 30 %
    const r = arbitragePfuBareme({ dividendes: 10_000, interets: 0, rniFoyer: 40_000, parts: 1, isCouple: false });
    expect(r.pfu).toBe(3_000);
    expect(r.recommande).toBe('pfu');
  });

  it('TMI faible (11 %) : option barème avantageuse', () => {
    // dividendes 10 000, RNI 20 000 (1 part) : abattement 40 % + CSG déductible → barème < PFU
    const r = arbitragePfuBareme({ dividendes: 10_000, interets: 0, rniFoyer: 20_000, parts: 1, isCouple: false });
    expect(r.pfu).toBe(3_000);
    expect(r.recommande).toBe('bareme');
    expect(r.bareme).toBeLessThan(r.pfu);
    expect(r.economie).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Intégration computeFoyerSummary (réductions / crédits)
// ════════════════════════════════════════════════════════════════════════════

describe('computeFoyerSummary — réductions & crédits intégrés', () => {
  it('dons réduisent l\'IR net (réduction hors plafond)', () => {
    // RNI 40 000 → IR 5 104 ; don général 1 000 → réduction 660 → irNet 4 444
    const s = computeFoyerSummary({ mode: 'solo', parts: 1, rniFoyer: 40_000, donsGeneral: 1_000 });
    expect(s.reductionDons).toBe(660);
    expect(s.irNet).toBe(4_444);
  });

  it('crédit emploi à domicile remboursable → imputé au solde, pas à l\'irNet', () => {
    const s = computeFoyerSummary({
      mode: 'solo', parts: 1, rniFoyer: 40_000, emploiDomicileDepense: 10_000, pasTotal: 0,
    });
    expect(s.irNet).toBe(5_104);                 // crédit n'affecte pas l'irNet
    expect(s.creditEmploiDomicile).toBe(5_000);  // 10 000 × 50 %
    expect(s.creditsRemboursables).toBe(5_000);
    expect(s.soldeApresCredits).toBe(s.solde - 5_000);
  });

  it('non-régression : profil sans réduction/crédit inchangé', () => {
    const s = computeFoyerSummary({ mode: 'solo', parts: 1, rniFoyer: 40_000 });
    expect(s.irNet).toBe(5_104);
    expect(s.reductionDons).toBe(0);
    expect(s.creditsRemboursables).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Chaîne complète : pension alimentaire déduite du RNI
// ════════════════════════════════════════════════════════════════════════════

describe('Pension alimentaire — chaîne complète (déduction du RNI)', () => {
  it('pension ascendant 5 000 € : RNI net = RNI brut − 5 000', () => {
    // net_imp 50 000 → abattement 10 % → 45 000 ; pension 5 000 → RNI 40 000
    const txt = buildProfile(
      { statut: 'Célibataire', net_imp: '50000', pension: '5000', pension_benef: 'Ascendant' },
      {}, {}, [], false,
    );
    expect(txt).toMatch(/Pension alimentaire versée \(déductible\)\s*:\s*5\s?000\s*€/);
    const p = parseProfile(txt);
    expect(p.deductionsRevenu).toBe(5_000);
    expect(p.rniFoyer).toBe(40_000);
  });

  it('pension reçue (1AO) : ajoutée au RNI', () => {
    const txt = buildProfile(
      { statut: 'Célibataire', net_imp: '50000', pension_recue: '6000' },
      {}, {}, [], false,
    );
    expect(txt).toMatch(/Pension alimentaire reçue \(1AO\)\s*:\s*6\s?000\s*€/);
    const p = parseProfile(txt);
    expect(p.pensionAlimRecue).toBe(6_000);
    expect(p.rniFoyer).toBe(51_000); // 45 000 + 6 000
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Chaîne complète : réductions/crédits & dividendes parsés
// ════════════════════════════════════════════════════════════════════════════

describe('Réductions/crédits & dividendes — chaîne complète', () => {
  it('dons, emploi domicile, scolarité, dividendes 2DC générés et parsés', () => {
    const txt = buildProfile(
      {
        statut: 'Célibataire', net_imp: '60000',
        dons: '300', dons_aide: '500', domicile: '4000',
        scol_college: '1', scol_lycee: '2',
        divid: '5000', div_2dc: '5000',
      },
      {}, {}, [], false,
    );
    const p = parseProfile(txt);
    expect(p.donsGeneral).toBe(300);
    expect(p.donsAidePersonnes).toBe(500);
    expect(p.emploiDomicileDepense).toBe(4_000);
    expect(p.scolCollege).toBe(1);
    expect(p.scolLycee).toBe(2);
    expect(p.dividendes2DC).toBe(5_000);

    const s = computeFoyerSummary(p);
    expect(s.creditEmploiDomicile).toBe(2_000);    // 4 000 × 50 %
    expect(s.reductionScolarite).toBe(61 + 2 * 153); // 367
    expect(s.reductionDons).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Détecteur : leviers chiffrés
// ════════════════════════════════════════════════════════════════════════════

describe('opportunitiesDetector — leviers PHASE 1', () => {
  it('arbitrage PFU/barème proposé quand le barème est avantageux', () => {
    const opps = detectOpportunities({
      mode: 'solo', parts: 1, rniFoyer: 20_000, dividendes2DC: 10_000,
    });
    const arb = opps.find(o => o.id === 'arbitrage_pfu_bareme');
    expect(arb).toBeTruthy();
    expect(arb.impactEuros).toBeGreaterThan(0);
  });

  it('pas d\'arbitrage proposé si PFU avantageux (TMI élevée)', () => {
    const opps = detectOpportunities({
      mode: 'solo', parts: 1, rniFoyer: 90_000, dividendes2DC: 10_000,
    });
    expect(opps.find(o => o.id === 'arbitrage_pfu_bareme')).toBeFalsy();
  });

  it('levier dons proposé quand IR > 0 et aucun don déclaré', () => {
    const opps = detectOpportunities({ mode: 'solo', parts: 1, rniFoyer: 40_000 });
    expect(opps.find(o => o.id === 'levier_dons')).toBeTruthy();
  });
});
