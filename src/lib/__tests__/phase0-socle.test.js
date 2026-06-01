import { describe, it, expect } from 'vitest';
import {
  calcParts, plafonnementNiches, plafonnementQF, calcIR,
  computeFoyerSummary, QF_PLAFONDS,
} from '../taxCalculator.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';
import { extractProfileData } from '../checklistGenerator.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 0.c — calcParts (dérivation des parts depuis la composition familiale)
// Source des règles : src/data/paperasse/fiscaliste/references/quotient-familial.md
//                     + bareme-ir-2025.json → quotient_familial.parts (art. 194-195 CGI)
// ════════════════════════════════════════════════════════════════════════════

describe('calcParts — règles de parts art. 194-195 CGI', () => {
  it('célibataire sans enfant → 1 part', () => {
    const r = calcParts({ isCouple: false });
    expect(r.parts).toBe(1);
    expect(r.partsBase).toBe(1);
    expect(r.nbDemiPartsT).toBe(0);
  });

  it('marié/pacsé sans enfant → 2 parts', () => {
    expect(calcParts({ isCouple: true }).parts).toBe(2);
  });

  it('marié 2 enfants → 3 parts (2 + 0,5 + 0,5)', () => {
    const r = calcParts({ isCouple: true, nbEnfants: 2 });
    expect(r.parts).toBe(3);
    expect(r.nbDemiPartsClassiques).toBe(2);
    expect(r.nbDemiPartsT).toBe(0);
  });

  it('marié 3 enfants → 4 parts (2 + 0,5 + 0,5 + 1)', () => {
    expect(calcParts({ isCouple: true, nbEnfants: 3 }).parts).toBe(4);
  });

  it('marié 1 enfant + 1 en résidence alternée → 2,75 parts (2 + 0,5 + 0,25)', () => {
    // exemple quotient-familial.md
    const r = calcParts({ isCouple: true, nbEnfants: 1, nbEnfantsAlternes: 1 });
    expect(r.parts).toBe(2.75);
  });

  it('parent isolé (case T) 1 enfant → 2 parts (1 + 0,5 enfant + 0,5 case T)', () => {
    const r = calcParts({ isCouple: false, nbEnfants: 1, parentIsole: true });
    expect(r.parts).toBe(2);
    expect(r.nbDemiPartsT).toBe(2);          // 1er enfant = part entière (plafond 4 262 €)
    expect(r.nbDemiPartsClassiques).toBe(0); // tout est en case T
  });

  it('parent isolé 2 enfants → 2,5 parts ; T=2 demi-parts, classiques=1', () => {
    const r = calcParts({ isCouple: false, nbEnfants: 2, parentIsole: true });
    expect(r.parts).toBe(2.5);
    expect(r.nbDemiPartsT).toBe(2);
    expect(r.nbDemiPartsClassiques).toBe(1); // 2e enfant = demi-part classique
  });

  it('case T sans enfant → ignorée (pas de majoration)', () => {
    const r = calcParts({ isCouple: false, parentIsole: true });
    expect(r.parts).toBe(1);
    expect(r.nbDemiPartsT).toBe(0);
  });

  it('enfant invalide → +0,5 part, demi-part à plafond invalidité', () => {
    // célibataire 1 enfant invalide : 1 + 0,5 (rang) + 0,5 (invalidité) = 2
    const r = calcParts({ isCouple: false, nbEnfants: 1, nbEnfantsInvalides: 1 });
    expect(r.parts).toBe(2);
    expect(r.nbDemiPartsInvalidite).toBe(1);
    expect(r.nbDemiPartsClassiques).toBe(1); // demi-part de rang
  });

  it('invalidité déclarant (case P) → +0,5 part', () => {
    const r = calcParts({ isCouple: false, nbDemiPartsInvalidite: 1 });
    expect(r.parts).toBe(1.5);
    expect(r.nbDemiPartsInvalidite).toBe(1);
  });

  it('veuf avec enfant → base 2 parts (+ parts enfants)', () => {
    const r = calcParts({ isCouple: false, veuf: true, nbEnfants: 1 });
    expect(r.partsBase).toBe(2);
    expect(r.parts).toBe(2.5);
  });

  it('enfant majeur rattaché compté comme enfant à charge', () => {
    const r = calcParts({ isCouple: true, nbEnfantsRattaches: 1 });
    expect(r.parts).toBe(2.5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 0.c — plafonnement QF case T (plafond parent isolé 4 262 €)
// ════════════════════════════════════════════════════════════════════════════

describe('plafonnementQF — case T (parent isolé, plafond 4 262 €)', () => {
  it('parent isolé 1 enfant, RNI 70 000 : plafond case T = 2×2131 = 4 262', () => {
    // partsReel=2, base=1, nbDemiPartsSupp=2 ; nbT=2 → avantageMax = 2×2131 = 4262
    const r = plafonnementQF(70_000, 2, 1, QF_PLAFONDS, { nbDemiPartsT: 2 });
    expect(r.avantageMax).toBe(4_262);
    expect(r.plafonnementActif).toBe(true); // avantageReel 6896 > 4262
    expect(r.irPlafonne).toBe(9_842);       // irBase(70k,1p)=14104 − 4262
  });

  it('demi-part invalidité plafonnée à 1 079 € (≠ 1 807 €)', () => {
    // célibataire avec une demi-part invalidité, RNI élevé pour activer le plafond
    const r = plafonnementQF(60_000, 1.5, 1, QF_PLAFONDS, { nbDemiPartsInvalidite: 1 });
    expect(r.avantageMax).toBe(1_079);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 0.b — plafonnement global des niches fiscales (art. 200-0 A CGI)
// Source : src/data/paperasse/fiscaliste/data/niches-fiscales.json
// ════════════════════════════════════════════════════════════════════════════

describe('plafonnementNiches — plafond global 10 000 € / 18 000 €', () => {
  it('sous le plafond → tout retenu, inactif', () => {
    const r = plafonnementNiches(6_000);
    expect(r.avantageRetenu).toBe(6_000);
    expect(r.exces).toBe(0);
    expect(r.actif).toBe(false);
    expect(r.plafond).toBe(10_000);
  });

  it('au-dessus du plafond métropole → excédent perdu', () => {
    const r = plafonnementNiches(12_500);
    expect(r.avantageRetenu).toBe(10_000);
    expect(r.exces).toBe(2_500);
    expect(r.actif).toBe(true);
  });

  it('plafond majoré outre-mer/SOFICA → 18 000 €', () => {
    const r = plafonnementNiches(15_000, true);
    expect(r.plafond).toBe(18_000);
    expect(r.avantageRetenu).toBe(15_000);
    expect(r.actif).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 0.b — 3 profils IR de référence (vérifiés À LA MAIN sur le barème 2025)
// Barème revenus 2025 (déclaration 2026) — bareme-ir-2025.json :
//   0–11 600 : 0 % | 11 600–29 579 : 11 % | 29 579–84 577 : 30 %
//   84 577–181 917 : 41 % | > 181 917 : 45 %
// Méthode = simulateur officiel impots.gouv.fr 2026 (modèle complet) :
//   barème → plafonnement QF → décote → IR net.
// ════════════════════════════════════════════════════════════════════════════

describe('Profils IR de référence — barème 2025 (vérif. manuelle simulateur 2026)', () => {
  it('1. Célibataire, 0 enfant, RNI 40 000 € (1 part) → IR 5 104 €', () => {
    // quotient = 40 000 ; (29579−11600)×11 % + (40000−29579)×30 % = 1977,69 + 3126,3 = 5104
    // décote : 5104 ≥ seuil 1982 → 0
    const s = computeFoyerSummary({ mode: 'solo', parts: 1, rniFoyer: 40_000 });
    expect(s.irBrut).toBe(5_104);
    expect(s.decote).toBe(0);
    expect(s.irNet).toBe(5_104);
    expect(s.cehr).toBe(0);
    expect(s.totalDu).toBe(5_104);
    expect(s.tmi).toBe(30);
  });

  it('2. Couple marié, 2 enfants, RNI 120 000 € (3 parts) → IR 18 594 € (plafonnement QF actif)', () => {
    // irSelon(3p) : quotient 40 000 → 5104 ×3 = 15 312
    // irBase(2p)  : quotient 60 000 → 11103,99 ×2 = 22 208
    // avantageReel 6896 > avantageMax 2×1807=3614 → irPlafonne = 22208 − 3614 = 18 594
    const s = computeFoyerSummary({
      mode: 'couple', parts: 3, rniFoyer: 120_000, nbDemiPartsT: 0,
    });
    expect(s.plafonnementQFActif).toBe(true);
    expect(s.avantageQFMax).toBe(3_614);
    expect(s.irPlafonne).toBe(18_594);
    expect(s.decote).toBe(0);
    expect(s.irNet).toBe(18_594);
    expect(s.totalDu).toBe(18_594);
  });

  it('3. Parent isolé (case T), 1 enfant, RNI 70 000 € (2 parts) → IR 9 842 € (plafond case T)', () => {
    // irSelon(2p) : quotient 35 000 → 3603,99 ×2 = 7 208
    // irBase(1p)  : quotient 70 000 → 14 104
    // avantageReel 6896 > avantageMax 2×2131=4262 → irPlafonne = 14104 − 4262 = 9 842
    const s = computeFoyerSummary({
      mode: 'solo', parts: 2, rniFoyer: 70_000, nbDemiPartsT: 2,
    });
    expect(s.partsFiscales).toBe(2);
    expect(s.plafonnementQFActif).toBe(true);
    expect(s.avantageQFMax).toBe(4_262);
    expect(s.irPlafonne).toBe(9_842);
    expect(s.irNet).toBe(9_842);
    expect(s.totalDu).toBe(9_842);
  });
});

describe('computeFoyerSummary — étapes pipeline exposées (niches, CEHR)', () => {
  it('réductions niches plafonnées réduisent l\'IR net (jamais < 0)', () => {
    // RNI 40 000 → IR 5 104 ; réductions soumises 12 000 → retenues 10 000 → irNet 0
    const s = computeFoyerSummary({
      mode: 'solo', parts: 1, rniFoyer: 40_000, reductionsNichesSoumises: 12_000,
    });
    expect(s.plafonnementNichesActif).toBe(true);
    expect(s.reductionsRetenues).toBe(10_000);
    expect(s.irNet).toBe(0); // 5104 − 10000 borné à 0
  });

  it('CEHR appliquée au-delà du seuil RFR (célibataire 300 000 €)', () => {
    // 3 % sur (300 000 − 250 000) = 1 500
    const s = computeFoyerSummary({ mode: 'solo', parts: 1, rniFoyer: 300_000, rfr: 300_000 });
    expect(s.cehr).toBe(1_500);
    expect(s.totalDu).toBe(s.irNet + 1_500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 0.a — CTO : chaîne complète form → generator → parser → bilan/allocation
// ════════════════════════════════════════════════════════════════════════════

describe('CTO — chaîne complète (PHASE 0.a)', () => {
  it('solo : CTO généré, parsé, agrégé au bilan (epargneLongTerme)', () => {
    const formData = {
      statut: 'Célibataire', net_imp: '40000', cto: '25000',
      cto_courtier: 'Courtier français', pea: '10000',
    };
    const txt = buildProfile(formData, {}, {}, [], false);
    expect(txt).toMatch(/CTO \(compte-titres ordinaire\)\s*:\s*OUI\s*~\s*25\s?000\s*€/);

    const p = parseProfile(txt);
    expect(p.ctoD1).toBe(25_000);
    // bilan patrimonial : CTO regroupé avec les actifs investis
    expect(p.epargneLongTerme).toBeGreaterThanOrEqual(35_000); // PEA 10k + CTO 25k
  });

  it('CTO chez courtier étranger → flag déclaratif 3916', () => {
    const formData = { statut: 'Célibataire', net_imp: '40000', cto: '30000', cto_courtier: 'Interactive Brokers' };
    const txt = buildProfile(formData, {}, {}, [], false);
    expect(txt).toMatch(/courtier étranger → 3916/);

    const p = parseProfile(txt);
    const detected = extractProfileData(p);
    expect(detected.courtier_etranger).toBe(true);
  });

  it('CTO néant → aucune ligne courtier, pas de flag', () => {
    const txt = buildProfile({ statut: 'Célibataire', net_imp: '40000' }, {}, {}, [], false);
    const p = parseProfile(txt);
    expect(p.ctoD1).toBe(0);
    expect(extractProfileData(p).courtier_etranger).toBeFalsy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 0.c — chaîne familiale : form → generator (parts dérivées) → parser
// ════════════════════════════════════════════════════════════════════════════

describe('Situation familiale — chaîne complète (PHASE 0.c)', () => {
  it('couple 2 enfants : parts dérivées (3) sans saisie manuelle', () => {
    const txt = buildProfile(
      { statut: 'Marié(e)', enfants: '2', net_imp: '60000' },
      { net_imp: '60000' }, { net_imp: '0' }, [], true,
    );
    expect(txt).toMatch(/Parts fiscales\s*:\s*3\s*\(calculées\)/);
    const p = parseProfile(txt);
    expect(p.parts).toBe(3);
    expect(p.nbEnfants).toBe(2);
  });

  it('parent isolé 1 enfant : parts 2 + ligne case T parsée', () => {
    const txt = buildProfile(
      { statut: 'Célibataire', enfants: '1', parent_isole: 'Oui', net_imp: '70000' },
      {}, {}, [], false,
    );
    expect(txt).toMatch(/Parent isolé \(case T\)\s*:\s*Oui/);
    expect(txt).toMatch(/Demi-parts case T\s*:\s*2/);
    const p = parseProfile(txt);
    expect(p.parts).toBe(2);
    expect(p.parentIsole).toBe(true);
    expect(p.nbDemiPartsT).toBe(2);
  });

  it('override manuel des parts respecté', () => {
    const txt = buildProfile(
      { statut: 'Célibataire', enfants: '0', parts: '1.5', net_imp: '40000' },
      {}, {}, [], false,
    );
    expect(txt).toMatch(/Parts fiscales\s*:\s*1\.5\s*\(saisie manuelle\)/);
    expect(parseProfile(txt).parts).toBe(1.5);
  });
});
