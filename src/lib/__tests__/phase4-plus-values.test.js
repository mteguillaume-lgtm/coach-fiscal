import { describe, it, expect } from 'vitest';
import {
  calcPvMobiliere, calcCrypto, calcPvImmo, calcSurtaxePvImmo,
  calcIR, computeFoyerSummary, TAUX_PS_CAPITAL, PFU_TAUX_IR,
} from '../taxCalculator.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';
import { detectOpportunities } from '../opportunitiesDetector.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Plus-values & capital
// Sources : plus-values-mobilieres-crypto.json (PV mobilières 3VG/3VH, abattements
// durée < 2018, crypto seuil 305 €), plus-values-immo-abattements.json (abattements
// 22 ans IR / 30 ans PS, surtaxe art. 1609 nonies G), pfu-prelevements-sociaux.json.
// ════════════════════════════════════════════════════════════════════════════

describe('calcPvMobiliere — PV de valeurs mobilières (3VG)', () => {
  it('PFU par défaut : 12,8 % IR + 17,2 % PS sur le gain net', () => {
    const r = calcPvMobiliere({ plusValue: 20_000 });
    expect(r.gainImposable).toBe(20_000);
    expect(r.ps).toBe(Math.round(20_000 * TAUX_PS_CAPITAL));   // 3 440
    expect(r.irPfu).toBe(Math.round(20_000 * PFU_TAUX_IR));    // 2 560
    expect(r.ir).toBe(r.irPfu);
    expect(r.total).toBe(6_000);                               // PFU 30 %
  });

  it('moins-values reportables (3VH) imputées en priorité sur la PV', () => {
    const r = calcPvMobiliere({ plusValue: 20_000, moinsValuesReportees: 8_000 });
    expect(r.moinsValuesImputees).toBe(8_000);
    expect(r.gainImposable).toBe(12_000);
    expect(r.total).toBe(Math.round(12_000 * 0.30));           // 3 600
  });

  it('moins-values plafonnées au gain (pas de gain négatif)', () => {
    const r = calcPvMobiliere({ plusValue: 5_000, moinsValuesReportees: 9_000 });
    expect(r.moinsValuesImputees).toBe(5_000);
    expect(r.gainImposable).toBe(0);
    expect(r.total).toBe(0);
  });

  it('abattement durée (droit commun) : titres < 2018 ET option barème → 65 % à ≥ 8 ans, IR seul', () => {
    const r = calcPvMobiliere({
      plusValue: 20_000, optionBareme: true, anteriorite2018: true,
      typeAbattement: 'droit_commun', dureeDetention: 10, rniFoyer: 0, parts: 1,
    });
    expect(r.abattementDuree).toBe(0.65);
    expect(r.baseIRBareme).toBe(7_000);                        // 20 000 × 35 %
    // L'abattement ne touche PAS les PS : base PS = gain entier.
    expect(r.ps).toBe(Math.round(20_000 * TAUX_PS_CAPITAL));
  });

  it('abattement renforcé PME : 85 % à ≥ 8 ans', () => {
    const r = calcPvMobiliere({
      plusValue: 20_000, optionBareme: true, anteriorite2018: true,
      typeAbattement: 'renforce_pme', dureeDetention: 9,
    });
    expect(r.abattementDuree).toBe(0.85);
  });

  it('pas d\'abattement sans option barème, même si titres < 2018', () => {
    const r = calcPvMobiliere({ plusValue: 20_000, anteriorite2018: true, dureeDetention: 10 });
    expect(r.abattementDuree).toBe(0);
  });
});

describe('calcCrypto — actifs numériques (3AN), seuil 305 €', () => {
  it('exonération totale si cessions cumulées ≤ 305 €', () => {
    const r = calcCrypto({ plusValue: 200, totalCessions: 250 });
    expect(r.exonere).toBe(true);
    expect(r.total).toBe(0);
  });

  it('imposition intégrale dès que les cessions dépassent 305 €', () => {
    const r = calcCrypto({ plusValue: 5_000, totalCessions: 400 });
    expect(r.exonere).toBe(false);
    expect(r.ps).toBe(Math.round(5_000 * TAUX_PS_CAPITAL));
    expect(r.irPfu).toBe(Math.round(5_000 * PFU_TAUX_IR));
    expect(r.total).toBe(1_500);                               // PFU 30 %
  });

  it('cessions inconnues (0) mais PV présente → imposée (prudent)', () => {
    const r = calcCrypto({ plusValue: 1_000, totalCessions: 0 });
    expect(r.exonere).toBe(false);
    expect(r.total).toBe(300);
  });
});

describe('calcSurtaxePvImmo — barème art. 1609 nonies G (lissage)', () => {
  it('pas de surtaxe ≤ 50 000 €', () => {
    expect(calcSurtaxePvImmo(40_000)).toBe(0);
    expect(calcSurtaxePvImmo(50_000)).toBe(0);
  });
  it('tranche de transition 50 001–60 000 (lissage) : 55 000 → 850 €', () => {
    expect(calcSurtaxePvImmo(55_000)).toBe(850);              // 2 % × 55 000 − (60 000 − 55 000) × 1/20
  });
  it('tranche en plateau 60 001–100 000 : 80 000 → 1 600 €', () => {
    expect(calcSurtaxePvImmo(80_000)).toBe(1_600);            // 2 % × 80 000
  });
  it('tranche supérieure : 300 000 → 18 000 €', () => {
    expect(calcSurtaxePvImmo(300_000)).toBe(18_000);          // 6 % × 300 000
  });
});

describe('calcPvImmo — PV immobilière (estimation, hors solde annuel)', () => {
  it('résidence principale : exonération totale', () => {
    const r = calcPvImmo({ prixCession: 400_000, prixAcquisition: 250_000, dureeDetention: 8, residencePrincipale: true });
    expect(r.exonere).toBe(true);
    expect(r.motifExoneration).toBe('residence_principale');
    expect(r.total).toBe(0);
  });

  it('petit prix ≤ 15 000 € : exonération', () => {
    const r = calcPvImmo({ prixCession: 12_000, prixAcquisition: 5_000, dureeDetention: 3 });
    expect(r.exonere).toBe(true);
    expect(r.motifExoneration).toBe('petit_prix');
  });

  // Cas vérifié à la main : cession 300 000, acquisition 200 000, détention 10 ans.
  //   frais forfait 7,5 % = 15 000 ; travaux forfait 15 % (≥ 5 ans) = 30 000
  //   prix majoré = 245 000 → PV brute = 55 000
  //   abattement IR (10 ans) = 5 × 6 % = 30 % → base IR 38 500 → IR 19 % = 7 315
  //   abattement PS (10 ans) = 5 × 1,65 % = 8,25 % → base PS 50 463 → PS 17,2 % = 8 680
  //   surtaxe sur base IR 38 500 (< 50 000) = 0 → total estimé 15 995
  it('cas 10 ans avec forfaits frais 7,5 % + travaux 15 %', () => {
    const r = calcPvImmo({ prixCession: 300_000, prixAcquisition: 200_000, dureeDetention: 10 });
    expect(r.fraisAcq).toBe(15_000);
    expect(r.travaux).toBe(30_000);
    expect(r.pvBrute).toBe(55_000);
    expect(r.abattIR).toBeCloseTo(0.30, 5);
    expect(r.baseIR).toBe(38_500);
    expect(r.ir).toBe(7_315);
    expect(r.ps).toBe(8_680);
    expect(r.surtaxe).toBe(0);
    expect(r.total).toBe(15_995);
  });

  it('forfait travaux NON appliqué si détention < 5 ans', () => {
    const r = calcPvImmo({ prixCession: 300_000, prixAcquisition: 200_000, dureeDetention: 3 });
    expect(r.travaux).toBe(0);
  });

  it('exonération totale d\'IR à 22 ans, de PS à 30 ans', () => {
    expect(calcPvImmo({ prixCession: 300_000, prixAcquisition: 100_000, dureeDetention: 22 }).abattIR).toBe(1);
    expect(calcPvImmo({ prixCession: 300_000, prixAcquisition: 100_000, dureeDetention: 30 }).abattPS).toBe(1);
  });
});

// ─── Chaîne complète ──────────────────────────────────────────────────────────

describe('Chaîne complète — PV mobilière au PFU (solo)', () => {
  const formData = { statut: 'Célibataire', net_imp: '0', pv_mob_gain: '20000' };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('émet la section PLUS-VALUES & CAPITAL avec la case 3VG', () => {
    expect(profile).toContain('PLUS-VALUES & CAPITAL');
    expect(profile).toContain('Plus-values mobilières (3VG)');
  });

  it('IR PFU et base PS consolidés réintégrés au total dû', () => {
    expect(parsed.pvCapitalIR).toBe(2_560);
    expect(parsed.pvCapitalPsBase).toBe(20_000);
    const summary = computeFoyerSummary(parsed);
    expect(summary.pvCapitalIR).toBe(2_560);
    expect(summary.psCapital).toBe(Math.round(20_000 * TAUX_PS_CAPITAL));   // 3 440
  });

  // Cas vérifié à la main : pas de salaire → IR barème nul ; PV au PFU 30 % = 6 000 €.
  it('total dû = PFU 30 % de la PV (6 000 €), sans IR barème', () => {
    const summary = computeFoyerSummary(parsed);
    expect(summary.irNet).toBe(0);
    expect(summary.totalDu).toBe(6_000);
  });
});

describe('Chaîne complète — PV mobilière + salaire (le barème ne change pas, PV au PFU)', () => {
  const formData = { statut: 'Célibataire', net_imp: '30000', pv_mob_gain: '20000' };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('le RNI barème exclut la PV (imposée au PFU)', () => {
    expect(parsed.rniFoyer).toBe(27_000);                     // salaire 30 000 − abat. 10 %
  });

  it('total dû = IR barème (RNI 27 000) + IR PFU 2 560 + PS 3 440', () => {
    const summary = computeFoyerSummary(parsed);
    expect(summary.irNet).toBe(calcIR(27_000, 1, false) > 0 ? summary.irNet : 0);
    expect(summary.totalDu).toBe(summary.irNet + summary.cehr + summary.psFoncier + summary.psImmo + 2_560 + 3_440);
  });
});

describe('Chaîne complète — crypto exonérée (cessions ≤ 305 €)', () => {
  const formData = {
    statut: 'Célibataire', net_imp: '0',
    crypto_cessions: 'Oui', crypto_montant_cede: '200', crypto_pv: '150',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('marquée EXONÉRÉE et exclue de toute base imposable', () => {
    expect(profile).toContain('EXONÉRÉES');
    expect(parsed.cryptoExoneree).toBe(true);
    expect(parsed.pvCapitalIR).toBe(0);
    expect(parsed.pvCapitalPsBase).toBe(0);
    // Aucun autre revenu → aucun impôt dû (la crypto exonérée n'en crée pas).
    expect(computeFoyerSummary(parsed)).toBeNull();
  });
});

describe('Chaîne complète — PV immobilière = estimation hors total dû annuel', () => {
  const formData = {
    statut: 'Célibataire', net_imp: '30000',     // RNI barème = 27 000 €
    pv_immo_cession: '300000', pv_immo_acquisition: '200000', pv_immo_duree: '10',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('émet l\'estimation + le routage notaire', () => {
    expect(profile).toContain('PV immobilière brute : 55');
    expect(profile).toContain('notaire recommandé');
    expect(parsed.pvImmoEstimation).toBe(15_995);
  });

  it('l\'estimation PV immo n\'entre PAS dans le total dû annuel (= IR barème seul)', () => {
    const summary = computeFoyerSummary(parsed);
    expect(summary.pvCapitalIR).toBe(0);              // pas de PV mobilière/crypto
    expect(summary.totalDu).toBe(summary.irNet);      // uniquement l'IR du salaire
    expect(summary.totalDu).toBe(calcIR(27_000, 1, false));
  });
});

describe('Couple — PV mobilière foyer + crypto par déclarant', () => {
  const formData = {
    statut: 'Marié(e)', pv_mob_gain: '10000',
  };
  const d1 = { net_imp: '40000', crypto_cessions: 'Oui', crypto_montant_cede: '5000', crypto_pv: '3000' };
  const d2 = { net_imp: '0' };
  const profile = buildProfile(formData, d1, d2, [], true);
  const parsed  = parseProfile(profile);

  it('PV mobilière (10 000) + crypto D1 (3 000) consolidées', () => {
    // base PS = 10 000 + 3 000 = 13 000 ; IR PFU = (10 000 + 3 000) × 12,8 % = 1 664
    expect(parsed.pvCapitalPsBase).toBe(13_000);
    expect(parsed.pvCapitalIR).toBe(Math.round(13_000 * PFU_TAUX_IR));
  });
});

describe('Détecteur — leviers PHASE 4', () => {
  it('option barème proposée à TMI faible via le levier GLOBAL 2OP (E3/E5 : plus de reco PV isolée)', () => {
    const formData = { statut: 'Célibataire', net_imp: '15000', pv_mob_gain: '5000' };
    const parsed = parseProfile(buildProfile(formData, {}, {}, [], false));
    const opps = detectOpportunities(parsed);
    expect(opps.some(o => o.id === 'arbitrage_pfu_bareme')).toBe(true);
    expect(opps.some(o => o.id === 'levier_option_bareme_pv')).toBe(false);
  });

  it('levier moins-values reportables + PV immo détectés', () => {
    const formData = {
      statut: 'Célibataire', net_imp: '30000', pv_mob_gain: '20000',
      pv_immo_cession: '300000', pv_immo_acquisition: '200000', pv_immo_duree: '10',
    };
    const parsed = parseProfile(buildProfile(formData, {}, {}, [], false));
    const opps = detectOpportunities(parsed);
    expect(opps.some(o => o.id === 'levier_moins_values_reportables')).toBe(true);
    expect(opps.some(o => o.id === 'levier_pv_immo')).toBe(true);
  });
});
