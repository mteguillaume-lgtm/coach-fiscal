import { describe, it, expect } from 'vitest';
import {
  calcIFI, calcReductionDefisc, plafonnementNichesDeuxEtages,
  calcIR, computeFoyerSummary,
} from '../taxCalculator.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';
import { detectOpportunities } from '../opportunitiesDetector.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Patrimoine (IFI) & dispositifs de défiscalisation
// Sources : ifi-bareme.json (barème, seuil 1,3 M€, décote 1,3-1,4 M€, abattement
// 30 % RP), defiscalisation.json (FCPI/FIP/SOFICA/Malraux/Madelin/Pinel),
// niches-fiscales.json (plafond global 10 000 € / majoré 18 000 €).
// ════════════════════════════════════════════════════════════════════════════

describe('calcIFI — barème, décote, abattement 30 % RP', () => {
  it('non assujetti si assiette nette < 1,3 M€', () => {
    const r = calcIFI({ patrimoineImmoBrut: 1_200_000 });
    expect(r.assujetti).toBe(false);
    expect(r.ifi).toBe(0);
  });

  // Cas vérifié à la main : assiette 1 500 000 €.
  //   tranche 800k–1,3M : 500 000 × 0,5 % = 2 500
  //   tranche 1,3M–2,57M : 200 000 × 0,7 % = 1 400 → IFI 3 900 (> 1,4M, pas de décote)
  it('assiette 1,5 M€ → IFI 3 900 €', () => {
    const r = calcIFI({ patrimoineImmoBrut: 1_500_000 });
    expect(r.assujetti).toBe(true);
    expect(r.ifiBrut).toBe(3_900);
    expect(r.decote).toBe(0);
    expect(r.ifi).toBe(3_900);
  });

  // Abattement 30 % RP : brut 1,8 M€ dont RP 500 k€ → assiette 1 650 000 € → IFI 4 950 €.
  it('abattement 30 % RP réduit l\'assiette (brut 1,8 M€, RP 500 k€ → 4 950 €)', () => {
    const r = calcIFI({ patrimoineImmoBrut: 1_800_000, valeurRP: 500_000 });
    expect(r.abattementRP).toBe(150_000);
    expect(r.assietteNette).toBe(1_650_000);
    expect(r.ifi).toBe(4_950);
  });

  // Décote de lissage : assiette 1 350 000 € → brut 2 850, décote 17 500 − 1,25 % × 1,35M = 625 → 2 225.
  it('décote de lissage entre 1,3 et 1,4 M€ (assiette 1,35 M€ → 2 225 €)', () => {
    const r = calcIFI({ patrimoineImmoBrut: 1_350_000 });
    expect(r.ifiBrut).toBe(2_850);
    expect(r.decote).toBe(625);
    expect(r.ifi).toBe(2_225);
  });

  it('passif déductible réduit l\'assiette', () => {
    const r = calcIFI({ patrimoineImmoBrut: 1_600_000, passif: 400_000 });
    expect(r.assietteNette).toBe(1_200_000);
    expect(r.assujetti).toBe(false);   // repassé sous le seuil
  });
});

describe('calcReductionDefisc — réduction = taux × min(versement, plafond)', () => {
  it('FCPI 18 %, versement plafonné à 12 000 €', () => {
    const r = calcReductionDefisc({ dispositif: 'fcpi', versement: 15_000 });
    expect(r.versementRetenu).toBe(12_000);
    expect(r.reduction).toBe(2_160);          // 12 000 × 18 %
    expect(r.categoriePlafond).toBe('global_10k');
  });

  it('FCPI plafond couple 24 000 €', () => {
    const r = calcReductionDefisc({ dispositif: 'fcpi', versement: 20_000, isCouple: true });
    expect(r.versementRetenu).toBe(20_000);
    expect(r.reduction).toBe(3_600);          // 20 000 × 18 %
  });

  it('SOFICA 30 %, catégorie plafond majoré 18 000 €', () => {
    const r = calcReductionDefisc({ dispositif: 'sofica', versement: 5_000 });
    expect(r.reduction).toBe(1_500);
    expect(r.categoriePlafond).toBe('specifique_18k');
  });

  it('Malraux 22 %, hors plafond global', () => {
    const r = calcReductionDefisc({ dispositif: 'malraux', versement: 50_000 });
    expect(r.reduction).toBe(11_000);
    expect(r.categoriePlafond).toBe('hors_plafond');
  });

  it('Pinel (mode report) : non calculé depuis un versement, marqué fermé', () => {
    const r = calcReductionDefisc({ dispositif: 'pinel', versement: 50_000 });
    expect(r.reduction).toBe(0);
    expect(r.ferme).toBe(true);
  });
});

describe('plafonnementNichesDeuxEtages — base 10 000 € / majoré 18 000 €', () => {
  it('part globale plafonnée à 10 000 €, excédent perdu', () => {
    const r = plafonnementNichesDeuxEtages({ global: 12_000 });
    expect(r.avantageRetenu).toBe(10_000);
    expect(r.exces).toBe(2_000);
    expect(r.actif).toBe(true);
  });

  it('SOFICA/OM ouvre le plafond majoré 18 000 € (global 8 000 + spécifique 12 000)', () => {
    const r = plafonnementNichesDeuxEtages({ global: 8_000, specifique: 12_000 });
    expect(r.partGlobale).toBe(8_000);
    expect(r.partSpecifique).toBe(10_000);    // solde jusqu'à 18 000
    expect(r.avantageRetenu).toBe(18_000);
    expect(r.exces).toBe(2_000);
  });

  it('spécifique seul plafonné à 18 000 €', () => {
    const r = plafonnementNichesDeuxEtages({ global: 0, specifique: 20_000 });
    expect(r.avantageRetenu).toBe(18_000);
    expect(r.plafondEffectif).toBe(18_000);
  });

  it('sous les plafonds → tout retenu, inactif', () => {
    const r = plafonnementNichesDeuxEtages({ global: 5_000, specifique: 2_000 });
    expect(r.avantageRetenu).toBe(7_000);
    expect(r.actif).toBe(false);
  });
});

// ─── Chaîne complète ──────────────────────────────────────────────────────────

describe('Chaîne complète — IFI (impôt distinct, hors total dû IR)', () => {
  const formData = {
    statut: 'Célibataire', net_imp: '60000',
    ifi_patrimoine_brut: '1800000', ifi_valeur_rp: '500000',
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('émet la section IFI + le routage CGP', () => {
    expect(profile).toContain('PATRIMOINE — IFI');
    expect(profile).toContain('CGP recommandé');
    expect(parsed.ifiDu).toBe(4_950);
    expect(parsed.ifiAssiette).toBe(1_650_000);
  });

  it('l\'IFI est exposé séparément et N\'entre PAS dans le total dû IR', () => {
    const summary = computeFoyerSummary(parsed);
    expect(summary.ifi).toBe(4_950);
    expect(summary.totalDu).toBe(summary.irNet);   // IFI hors total dû IR
  });
});

describe('Chaîne complète — défiscalisation (réduction au barème, plafonnée)', () => {
  const formData = {
    statut: 'Célibataire', net_imp: '60000',          // RNI = 54 000 €
    defisc_fcpi_versement: '12000',                     // 18 % → 2 160 € (global)
    defisc_sofica_versement: '5000',                    // 30 % → 1 500 € (spécifique 18k)
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('réductions ventilées dans les bonnes enveloppes', () => {
    expect(parsed.reductionsNichesSoumises).toBe(2_160);
    expect(parsed.reductionsNichesSpecifiques).toBe(1_500);
  });

  it('réductions retenues (sous plafonds) réduisent l\'IR net', () => {
    const summary = computeFoyerSummary(parsed);
    expect(summary.reductionsRetenues).toBe(3_660);    // 2 160 + 1 500, sous les plafonds
    expect(summary.irNet).toBe(Math.max(0, calcIR(54_000, 1, false) - 3_660));
  });
});

describe('Chaîne complète — plafonnement des niches dépassé + Pinel fermé', () => {
  const formData = {
    statut: 'Célibataire', net_imp: '90000',
    defisc_fcpi_versement: '12000',          // 2 160 €
    defisc_pinel_reduction: '9000',          // report engagement antérieur (fermé)
  };
  const profile = buildProfile(formData, {}, {}, [], false);
  const parsed  = parseProfile(profile);

  it('Pinel marqué fermé (report)', () => {
    expect(profile).toContain('dispositif fermé aux nouvelles acquisitions');
    expect(parsed.defiscFerme).toBe(true);
  });

  it('plafond global dépassé : retenu 10 000 €, excédent perdu', () => {
    // global = 9 000 (Pinel) + 2 160 (FCPI) = 11 160 → retenu 10 000, excès 1 160
    expect(parsed.reductionsNichesSoumises).toBe(11_160);
    const summary = computeFoyerSummary(parsed);
    expect(summary.plafonnementNichesActif).toBe(true);
    expect(summary.reductionsRetenues).toBe(10_000);
    expect(summary.nichesExces).toBe(1_160);
  });
});

describe('Couple — IFI foyer', () => {
  const formData = { statut: 'Marié(e)', ifi_patrimoine_brut: '2000000', ifi_valeur_rp: '600000' };
  const d1 = { net_imp: '50000' };
  const profile = buildProfile(formData, d1, {}, [], true);
  const parsed  = parseProfile(profile);

  it('assiette = brut − 30 % RP', () => {
    // 2 000 000 − 180 000 = 1 820 000 €
    expect(parsed.ifiAssiette).toBe(1_820_000);
    expect(parsed.ifiDu).toBeGreaterThan(0);
  });
});

describe('Détecteur — leviers PHASE 5', () => {
  it('levier IFI détecté pour un foyer assujetti', () => {
    const formData = { statut: 'Célibataire', net_imp: '80000', ifi_patrimoine_brut: '1800000', ifi_valeur_rp: '400000' };
    const parsed = parseProfile(buildProfile(formData, {}, {}, [], false));
    const opps = detectOpportunities(parsed);
    expect(opps.some(o => o.id === 'levier_ifi')).toBe(true);
  });

  it('levier plafonnement niches + Pinel fermé détectés', () => {
    const formData = { statut: 'Célibataire', net_imp: '90000', defisc_fcpi_versement: '12000', defisc_pinel_reduction: '9000' };
    const parsed = parseProfile(buildProfile(formData, {}, {}, [], false));
    const opps = detectOpportunities(parsed);
    expect(opps.some(o => o.id === 'levier_plafonnement_niches')).toBe(true);
    expect(opps.some(o => o.id === 'levier_defisc_ferme')).toBe(true);
  });
});
