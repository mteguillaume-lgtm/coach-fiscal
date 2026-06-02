import { describe, it, expect } from 'vitest';
import {
  calcTauxEffectif, calcCreditImpotEtranger, calcIR, computeFoyerSummary,
} from '../taxCalculator.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';
import { detectOpportunities } from '../opportunitiesDetector.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 6 — Fiscalité internationale (conventions, 2047)
// Source : fiscalite-internationale.json (taux effectif 8TI, crédit 8TK ;
// non-résident/impatrié/exit tax → routage avocat fiscaliste).
// ════════════════════════════════════════════════════════════════════════════

describe('calcTauxEffectif — exemption avec progressivité (8TI)', () => {
  // Cas vérifié à la main : 40 000 € français + 20 000 € étrangers exonérés, 1 part.
  //   IR(60 000) au barème puis × 40 000/60 000.
  it('IR mondial proraté revenus français / mondial', () => {
    const r = calcTauxEffectif({ revenusFrancais: 40_000, revenusEtrangersExoneres: 20_000, parts: 1 });
    expect(r.revenuMondial).toBe(60_000);
    expect(r.coef).toBeCloseTo(2 / 3, 5);
    expect(r.irMondial).toBe(calcIR(60_000, 1, false));
    expect(r.irFrancais).toBe(Math.round(calcIR(60_000, 1, false) * (40_000 / 60_000)));
  });

  it('sans revenu étranger → IR inchangé (coef 1)', () => {
    const r = calcTauxEffectif({ revenusFrancais: 40_000, revenusEtrangersExoneres: 0, parts: 1 });
    expect(r.coef).toBe(1);
    expect(r.irFrancais).toBe(calcIR(40_000, 1, false));
  });

  it('le taux effectif augmente le taux moyen (français seul < mondial proraté serait > IR(40 000) ? non — exonération réelle)', () => {
    // L'effet : l'IR français est calculé au taux moyen du mondial, supérieur au taux
    // qu'aurait 40 000 € seul → irFrancais > IR(40 000).
    const r = calcTauxEffectif({ revenusFrancais: 40_000, revenusEtrangersExoneres: 20_000, parts: 1 });
    expect(r.irFrancais).toBeGreaterThan(calcIR(40_000, 1, false));
  });
});

describe('calcCreditImpotEtranger — imputation plafonnée (8TK)', () => {
  it('crédit = montant 8TK si sous le plafond', () => {
    const r = calcCreditImpotEtranger({ montant8TK: 1_500, quotePartIRFrancais: 2_000 });
    expect(r.credit).toBe(1_500);
  });

  it('crédit plafonné à la quote-part d\'IR français', () => {
    const r = calcCreditImpotEtranger({ montant8TK: 3_000, quotePartIRFrancais: 1_800 });
    expect(r.credit).toBe(1_800);
  });
});

// ─── Chaîne complète ──────────────────────────────────────────────────────────

describe('Chaîne complète — taux effectif (solo)', () => {
  const formData = {
    statut: 'Célibataire', net_imp: '44444',      // RNI ≈ 40 000 € après abattement 10 %
    intl_statut_residence: 'resident',
    intl_rev_etrangers_exoneres: '20000',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('émet la section internationale + 8TI', () => {
    expect(profile).toContain('FISCALITÉ INTERNATIONALE');
    expect(profile).toContain('taux effectif');
    expect(parsed.revEtrTauxEffectif).toBe(20_000);
  });

  it('IR proraté au taux du revenu mondial (revenu étranger exonéré mais retenu pour le taux)', () => {
    const summary = computeFoyerSummary(parsed);
    const fr = parsed.rniFoyer;
    const expected = Math.round(calcIR(fr + 20_000, 1, false) * (fr / (fr + 20_000)));
    expect(summary.totalDu).toBe(expected);
    expect(summary.totalDu).toBeGreaterThan(calcIR(fr, 1, false));   // effet du taux effectif
    expect(summary.tauxEffectifCoef).toBeCloseTo(fr / (fr + 20_000), 4);
  });
});

describe('Chaîne complète — crédit d\'impôt étranger 8TK (solo)', () => {
  const formData = {
    statut: 'Célibataire', net_imp: '55556',      // RNI ≈ 50 000 €
    intl_statut_residence: 'resident',
    intl_rev_etrangers_imputation: '10000',
    intl_credit_8tk: '1500',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('crédit 8TK parsé', () => {
    expect(parsed.creditImpotEtranger8TK).toBe(1_500);
    expect(parsed.revEtrImputation).toBe(10_000);
  });

  it('le crédit 8TK réduit l\'IR (plafonné à la quote-part française)', () => {
    const summary = computeFoyerSummary(parsed);
    const fr = parsed.rniFoyer;
    const irAvant = calcIR(fr, 1, false);                       // pas de taux effectif ici
    const quotePart = Math.round(irAvant * Math.min(1, 10_000 / fr));
    const credit = Math.min(1_500, quotePart);
    expect(summary.creditImpotEtranger).toBe(credit);
    expect(summary.totalDu).toBe(irAvant - credit);
  });
});

describe('Chaîne complète — routage (non-résident, exit tax)', () => {
  it('non-résident → flag de routage + aucune automatisation', () => {
    const formData = { statut: 'Célibataire', net_imp: '50000', intl_statut_residence: 'non_resident' };
    const profile = buildProfile(formData, {}, {}, [], false);
    const parsed  = parseProfile(profile);
    expect(profile).toContain('avocat fiscaliste recommandé');
    expect(parsed.intlRoutage).toBe(true);
  });

  it('exit tax → flag de routage', () => {
    const formData = { statut: 'Célibataire', net_imp: '50000', intl_exit_tax: 'Oui' };
    const parsed = parseProfile(buildProfile(formData, {}, {}, [], false));
    expect(parsed.intlRoutage).toBe(true);
  });
});

describe('Détecteur — leviers PHASE 6', () => {
  it('levier international (info) pour taux effectif / crédit 8TK', () => {
    const formData = { statut: 'Célibataire', net_imp: '55556', intl_rev_etrangers_exoneres: '15000' };
    const parsed = parseProfile(buildProfile(formData, {}, {}, [], false));
    const opps = detectOpportunities(parsed);
    expect(opps.some(o => o.id === 'levier_international')).toBe(true);
  });

  it('levier routage international (alerte) pour non-résident', () => {
    const formData = { statut: 'Célibataire', net_imp: '50000', intl_statut_residence: 'non_resident' };
    const parsed = parseProfile(buildProfile(formData, {}, {}, [], false));
    const opps = detectOpportunities(parsed);
    expect(opps.some(o => o.id === 'levier_routage_international')).toBe(true);
  });
});
