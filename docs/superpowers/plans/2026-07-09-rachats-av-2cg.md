# Rachats d'assurance-vie (cases 2CG / 2BH) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un rachat d'assurance-vie saisi (part de gains fournie par l'assureur) est fiscalisé de bout en bout — abattement 4 600/9 200 € après 8 ans, 7,5 %/12,8 % IR + 17,2 % PS, arbitrage barème (2BH) — intégré au total dû, affiché au rapport, avec opportunité CIF-safe. Cases 2CG/2BH (référentiel projet).

**Architecture:** Spec validée `docs/superpowers/specs/2026-07-09-rachats-av-2cg-design.md`. `calcRachatAV()` pur dans taxCalculator (exports E5, zéro littéral) → bloc générateur `_avRachatBlock` → plugin `assurance-vie-rachat` → `computeFoyerSummary` (totalDu) → Collect + Rapport + opportunité.

**Tech Stack:** Vitest, plugin auto-découvert (`import.meta.glob`), format TXT `fmtN` (espaces fines).

## Global Constraints

- **Paperasse-first** : aucun taux/seuil en littéral — `AV_ABATTEMENT_8ANS_SOLO/COUPLE`, `AV_TAUX_IR_APRES_8ANS`, `PFU_TAUX_IR`, `TAUX_PS_CAPITAL`, `AV_SEUIL_PRIMES_TAUX_REDUIT`. Verrou `paperasse-first.test.js` vert.
- **Cases 2042 = référentiel** : 2CG (PFU) / 2BH (barème). Pas « 2CH ».
- Regex TXT : montants `fmtN` (espaces fines U+202F) → matcher `[\d\s ]`.
- Comportement des profils SANS rachat AV inchangé (av_rachat_gains absent → aucun effet).
- Verrou cif-safe : l'opportunité est formulée « à étudier », pas d'impératif décisionnel.
- Suite verte à chaque commit (778 au départ). Branche `rachats-av`. Commits `feat(av)`.

---

### Task 1: `calcRachatAV()` (TDD, pur)

**Files:**
- Modify: `src/lib/taxCalculator.js` (après `calcCrypto`, zone PHASE 4)
- Test: `src/lib/__tests__/rachat-av.test.js` (create)

**Interfaces:**
- Produces: `calcRachatAV({ gainsRachat, contratHuitAns, primesNettesFoyer, rniFoyer, parts, isCouple }) → { gainsRachat, abattement, baseIR, ir, ps, total, tauxIR, case2042, bareme:{ir,total,recommande,economie}, flags:{primesSuperieur150k} }`. Tâches 2-4 en dépendent.

- [ ] **Step 0:** `git checkout -b rachats-av`

- [ ] **Step 1: Tests qui échouent** — créer `src/lib/__tests__/rachat-av.test.js` :

```js
import { describe, it, expect } from 'vitest';
import {
  calcRachatAV, AV_ABATTEMENT_8ANS_SOLO, AV_ABATTEMENT_8ANS_COUPLE,
  AV_TAUX_IR_APRES_8ANS, PFU_TAUX_IR, TAUX_PS_CAPITAL,
} from '../taxCalculator';

describe('calcRachatAV — rachats AV (cases 2CG/2BH)', () => {
  it('≥ 8 ans, gains sous l\'abattement solo : IR nul, PS sur les gains pleins', () => {
    const r = calcRachatAV({ gainsRachat: 3_000, contratHuitAns: true, rniFoyer: 40_000, parts: 1 });
    expect(r.abattement).toBe(AV_ABATTEMENT_8ANS_SOLO);      // 4 600
    expect(r.baseIR).toBe(0);
    expect(r.ir).toBe(0);
    expect(r.ps).toBe(Math.round(3_000 * TAUX_PS_CAPITAL));
    expect(r.case2042).toBe('2CG');
  });

  it('≥ 8 ans, gains au-dessus de l\'abattement : IR = (gains − abatt) × 7,5 %', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: true, rniFoyer: 40_000, parts: 1 });
    expect(r.baseIR).toBe(10_000 - AV_ABATTEMENT_8ANS_SOLO);         // 5 400
    expect(r.ir).toBe(Math.round(5_400 * AV_TAUX_IR_APRES_8ANS));    // 405
    expect(r.total).toBe(r.ir + r.ps);
  });

  it('couple : abattement 9 200 €', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: true, isCouple: true, rniFoyer: 60_000, parts: 2 });
    expect(r.abattement).toBe(AV_ABATTEMENT_8ANS_COUPLE);
    expect(r.baseIR).toBe(800);
  });

  it('< 8 ans : PFU 12,8 % sans abattement', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: false, rniFoyer: 40_000, parts: 1 });
    expect(r.abattement).toBe(0);
    expect(r.ir).toBe(Math.round(10_000 * PFU_TAUX_IR));    // 1 280
    expect(r.tauxIR).toBe(PFU_TAUX_IR);
  });

  it('arbitrage barème gagnant à TMI faible (RNI 12 000, ≥ 8 ans)', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: true, rniFoyer: 12_000, parts: 1 });
    expect(r.bareme.recommande).toBe('bareme');
    expect(r.bareme.total).toBeLessThanOrEqual(r.total);
  });

  it('flag > 150 000 € de versements foyer', () => {
    const r = calcRachatAV({ gainsRachat: 5_000, contratHuitAns: true, primesNettesFoyer: 200_000, rniFoyer: 40_000, parts: 1 });
    expect(r.flags.primesSuperieur150k).toBe(true);
  });

  it('gains 0 → tout nul', () => {
    const r = calcRachatAV({ gainsRachat: 0, contratHuitAns: true });
    expect(r.total).toBe(0);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/rachat-av.test.js` → FAIL (`calcRachatAV` non exporté).

- [ ] **Step 3: Implémenter** dans `taxCalculator.js` (après `calcCrypto`) :

```js
/**
 * Fiscalité d'un rachat d'assurance-vie (de vivant) — art. 125-0 A CGI.
 * Cases 2042 : 2CG (gains au PFU) / 2BH (gains au barème sur option).
 * Entrée = part de produits imposable fournie par l'assureur (pas de recalcul de
 * proportionnalité). Millésime 2025 : un contrat pré-27/09/2017 est ≥ 8 ans → le
 * régime ne dépend que de l'ancienneté :
 *   ≥ 8 ans : abattement (4 600/9 200 €, IR uniquement) puis 7,5 % ; PS 17,2 % pleins.
 *   < 8 ans : PFU 12,8 % sans abattement ; PS 17,2 %.
 * Fraction de versements > 150 000 € (12,8 % sur l'excédent) : signalée (flag), non calculée.
 *
 * @param {object} o
 * @param {number}  o.gainsRachat        - part de produits imposable (assureur)
 * @param {boolean} o.contratHuitAns     - contrat ≥ 8 ans
 * @param {number}  [o.primesNettesFoyer=0] - total versements nets foyer (flag 150 k)
 * @param {number}  [o.rniFoyer=0] @param {number} [o.parts=1] @param {boolean} [o.isCouple=false]
 */
export function calcRachatAV({
  gainsRachat = 0, contratHuitAns = false, primesNettesFoyer = 0,
  rniFoyer = 0, parts = 1, isCouple = false,
} = {}) {
  const gains = Math.max(0, gainsRachat || 0);
  const abattement = contratHuitAns
    ? (isCouple ? AV_ABATTEMENT_8ANS_COUPLE : AV_ABATTEMENT_8ANS_SOLO)
    : 0;
  const baseIR = Math.max(0, gains - abattement);
  const tauxIR = contratHuitAns ? AV_TAUX_IR_APRES_8ANS : PFU_TAUX_IR;
  const ir = _round(baseIR * tauxIR);
  const ps = _round(gains * TAUX_PS_CAPITAL);
  const total = ir + ps;

  // Arbitrage barème (case 2BH) — informatif : IR marginal sur la base après abattement.
  const irBareme = gains > 0
    ? Math.max(0, calcIR(rniFoyer + baseIR, parts, isCouple) - calcIR(rniFoyer, parts, isCouple))
    : 0;
  const totalBareme = irBareme + ps;

  return {
    gainsRachat: gains, abattement, baseIR, ir, ps, total, tauxIR,
    case2042: '2CG',
    bareme: {
      ir: irBareme, total: totalBareme,
      recommande: totalBareme <= total ? 'bareme' : 'pfu',
      economie: Math.abs(total - totalBareme),
    },
    flags: { primesSuperieur150k: (primesNettesFoyer || 0) > AV_SEUIL_PRIMES_TAUX_REDUIT },
  };
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/rachat-av.test.js src/lib/__tests__/paperasse-first.test.js` → PASS. Puis `npx vitest run` complet → vert.

- [ ] **Step 5:** Commit `feat(av): calcRachatAV — fiscalité des rachats d'assurance-vie (2CG/2BH)`.

---

### Task 2: Générateur + plugin + computeFoyerSummary (chaîne complète, chain test)

**Files:**
- Modify: `src/lib/profileGenerator.js` (`_avRachatBlock` + appels solo/couple + insertion section + import `calcRachatAV`)
- Create: `src/plugins/income/assurance-vie-rachat.plugin.js`
- Modify: `src/lib/taxCalculator.js` (`computeFoyerSummary` : totalDu + hasCapitalBase + exposition)
- Test: `src/lib/__tests__/rachat-av.test.js` (étendre — chaîne complète)

**Interfaces:**
- parsedProfile expose : `avRachatIR`, `avRachatPsBase`, `avRachatGains`, `avRachat8ans` (bool), `avRachatBaremeEco`.
- summary : `totalDu` inclut `avRachatIR + avRachatPS` (`avRachatPS = round(avRachatPsBase × TAUX_PS_CAPITAL)`).

- [ ] **Step 1: Chain test qui échoue** — ajouter dans `rachat-av.test.js` :

```js
import { buildProfile } from '../profileGenerator';
import { parseProfile } from '../profileParser';
import { computeFoyerSummary } from '../taxCalculator';

describe('Rachat AV — chaîne complète form → summary', () => {
  it('≥ 8 ans : IR + PS du rachat entrent dans le total dû + cases 2CG/2BH', () => {
    const profile = buildProfile(
      { statut: 'Célibataire', net_imp: '40000', av: '80000', av_rachat_gains: '10000', av_rachat_8ans: 'Oui' },
      {}, {}, [], false,
    );
    expect(profile).toContain('Rachat AV');
    const parsed = parseProfile(profile);
    expect(parsed.avRachatGains).toBe(10_000);
    expect(parsed.avRachat8ans).toBe(true);
    expect(parsed.avRachatIR).toBeGreaterThan(0);
    const s = computeFoyerSummary(parsed);
    // total dû inclut IR rachat (405) + PS rachat (round(10000×0.172)=1720)
    const psRachat = Math.round(10_000 * TAUX_PS_CAPITAL);
    expect(s.totalDu).toBe(s.irNet + s.cehr + s.psFoncier + s.psImmo + s.pvCapitalIR + s.psCapital + parsed.avRachatIR + psRachat);
  });

  it('sans rachat : aucun champ av rachat, comportement inchangé', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '40000' }, {}, {}, [], false));
    expect(parsed.avRachatIR ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2:** Run → FAIL (lignes/champs absents).

- [ ] **Step 3: Générateur** — dans `profileGenerator.js` :
  1. Import : ajouter `calcRachatAV` à l'import taxCalculator existant.
  2. Nouveau bloc (près de `_capitalGainsBlock`) :

```js
// Rachat d'assurance-vie (2CG/2BH) — fiscalité de vivant. Consolide avRachatIR
// (régime PFU par défaut) + avRachatPsBase (= gains) au foyer, comme _capitalGainsBlock.
function _avRachatBlock(d, rniFoyer = 0, parts = 1, isCouple = false) {
  const gains = parseFloat(d.av_rachat_gains || 0);
  if (!(gains > 0)) return { section: '', avRachatIR: 0, avRachatPsBase: 0 };
  const huitAns = d.av_rachat_8ans === 'Oui';
  const primesFoyer = parseFloat(d.av_verse || 0);
  const r = calcRachatAV({ gainsRachat: gains, contratHuitAns: huitAns, primesNettesFoyer: primesFoyer, rniFoyer, parts, isCouple });

  const lignes = [
    `Rachat AV — part de gains imposable : ${fmtN(r.gainsRachat)} | contrat : ${huitAns ? '≥ 8 ans' : '< 8 ans'}`,
    `Rachat AV — abattement appliqué : ${fmtN(r.abattement)} | base IR : ${fmtN(r.baseIR)}`,
    `Rachat AV — IR (case ${r.case2042}) : ${fmtN(r.ir)} | base PS : ${fmtN(r.gainsRachat)} | régime : ${huitAns ? 'PFL 7,5 %' : 'PFU 12,8 %'}`,
    `Rachat AV — IR foyer : ${fmtN(r.ir)}`,
    `Rachat AV — base PS foyer : ${fmtN(r.gainsRachat)}`,
  ];
  if (r.bareme.recommande === 'bareme' && r.bareme.economie > 0) {
    lignes.push(`ℹ️ Rachat AV : option barème (2BH) plus avantageuse (~${fmtN(r.bareme.economie)} d'écart) — option globale et irrévocable`);
  }
  if (r.flags.primesSuperieur150k) {
    lignes.push(`⚠️ Versements foyer > 150 000 € : la fraction au-delà est imposée à 12,8 % (non calculée ici) — vérifier avec l'assureur`);
  }
  return { section: `\n${lignes.join('\n')}`, avRachatIR: r.ir, avRachatPsBase: r.gainsRachat };
}
```

  3. Appels : dans la branche solo (près de `const cap = _capitalGainsBlock(d, [{ decl: d }], rniTotal, parts, false);`) ajouter `const avr = _avRachatBlock(d, rniTotal, parts, false);` ; dans la branche couple (près de `const cap = _capitalGainsBlock(…, true);`) ajouter `const avr = _avRachatBlock(d, rniFoyer, parts, true);`. Insérer `${avr.section}` juste après chaque `${cap.section}` (lignes ~589 et ~779).

- [ ] **Step 4: Plugin** — créer `src/plugins/income/assurance-vie-rachat.plugin.js` :

```js
import { n } from '../../lib/profileParserUtils.js';

/**
 * Rachats d'assurance-vie de vivant (cases 2CG / 2BH). Le calcul vit dans
 * taxCalculator.calcRachatAV ; le générateur (_avRachatBlock) consolide IR/PS au
 * foyer. Ce plugin lit les lignes émises et déclare les cases 2042.
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'assurance-vie-rachat',
  label: 'Rachat assurance-vie (2CG/2BH)',
  version: '1.0.0',
  fields: [],   // collecte en section AV (Collect.jsx), émission par profileGenerator

  parser(text) {
    const avRachatIR      = n(text, /Rachat AV — IR foyer[^:\n]*:\s*([\d\s ,]+)\s*€/i);
    const avRachatPsBase  = n(text, /Rachat AV — base PS foyer[^:\n]*:\s*([\d\s ,]+)\s*€/i);
    const avRachatGains   = n(text, /Rachat AV — part de gains imposable\s*:\s*([\d\s ,]+)\s*€/i);
    const avRachatBaremeEco = n(text, /option barème \(2BH\) plus avantageuse \(~([\d\s ,]+)\s*/i);
    const avRachat8ans    = /Rachat AV — part de gains imposable[^\n]*contrat\s*:\s*≥ 8 ans/i.test(text);
    return { avRachatIR, avRachatPsBase, avRachatGains, avRachat8ans, avRachatBaremeEco };
  },

  generator() { return ''; },
  validator(formData) {
    const errors = [];
    const v = parseFloat(formData?.av_rachat_gains);
    if (formData?.av_rachat_gains && (isNaN(v) || v < 0)) {
      errors.push({ field: 'av_rachat_gains', message: 'Part de gains invalide (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },
  calculator() { return {}; },
  declarativeCases() {
    return [
      { caseCode: '2CG', label: 'Gains de rachat AV imposables au PFU', declarant: 'foyer', required: false },
      { caseCode: '2BH', label: 'Gains de rachat AV imposables au barème (option)', declarant: 'foyer', required: false },
    ];
  },
};
```

- [ ] **Step 5: computeFoyerSummary** — dans `taxCalculator.js` :
  - `hasCapitalBase` : ajouter `|| (profile.avRachatIR || 0) > 0`.
  - Avant `totalDu` : `const avRachatIR = profile.avRachatIR || 0; const avRachatPS = Math.round((profile.avRachatPsBase || 0) * TAUX_PS_CAPITAL);`
  - `totalDu = irNet + cehr + psFoncier + psImmo + pvCapitalIR + psCapital + avRachatIR + avRachatPS;`
  - Exposer dans le retour : `avRachatIR, avRachatPS, avRachatPsBase: profile.avRachatPsBase || 0`.

- [ ] **Step 6:** `npx vitest run` → tout vert (dont registry.test/architecture.test qui valident le nouveau plugin) ; `npm run lint` → 0/0.

- [ ] **Step 7:** Commit `feat(av): chaîne rachat AV — générateur + plugin 2CG/2BH + intégration total dû`.

---

### Task 3: Collecte (Collect.jsx)

**Files:**
- Modify: `src/pages/Collect.jsx` (nouveau `AV_RACHAT_FIELDS` + 2 spreads)

- [ ] **Step 1:** Après la définition de `PV_FIELDS` (~ligne 246), ajouter :

```js
// Rachat d'assurance-vie (2CG/2BH) — part de gains fournie par l'assureur. Champs foyer.
const AV_RACHAT_FIELDS = [
  { key: 'av_rachat_gains', label: 'Rachat AV — part de gains imposable (fournie par l\'assureur) (€)', type: 'number', ph: '0', requires: 'assuranceVie', advanced: true,
    hint: 'Montant des produits/gains imposables de votre rachat, tel qu\'indiqué sur le relevé/IFU de l\'assureur (pas le montant total racheté).' },
  { key: 'av_rachat_8ans', label: 'Contrat ≥ 8 ans ?', type: 'select', opts: ['Non', 'Oui'], requires: 'assuranceVie', advanced: true,
    dependsOn: { key: 'av_rachat_gains', check: v => parseFloat(v || 0) > 0 },
    hint: 'Ancienneté du CONTRAT (pas des versements). ≥ 8 ans : abattement 4 600 €/9 200 € + taux 7,5 %. Sinon PFU 12,8 %.' },
];
```

- [ ] **Step 2:** Aux deux emplacements où `...PV_FIELDS,` est spread (~lignes 418 et 526), ajouter `...AV_RACHAT_FIELDS,` juste après.

- [ ] **Step 3:** `npx vitest run` (inchangé) + `npm run lint` → 0/0. Vérif manuelle : `npm run dev` → /collect, module assurance-vie → les 2 champs apparaissent en mode avancé.

- [ ] **Step 4:** Commit `feat(av): champs de collecte du rachat AV (part de gains + ancienneté)`.

---

### Task 4: Opportunité CIF-safe + affichage Rapport

**Files:**
- Modify: `src/lib/opportunitiesDetector.js` (levier `arbitrage_av_rachat`)
- Modify: `src/pages/Rapport.jsx` (ligne rachat AV dans la section capital)
- Test: `src/lib/__tests__/rachat-av.test.js` (étendre — opportunité)

- [ ] **Step 1: Test** — ajouter :

```js
import { detectOpportunities } from '../opportunitiesDetector';

describe('Opportunité rachat AV', () => {
  it('option barème 2BH signalée à TMI faible, formulée « à étudier »', () => {
    const parsed = parseProfile(buildProfile(
      { statut: 'Célibataire', net_imp: '12000', av: '80000', av_rachat_gains: '10000', av_rachat_8ans: 'Oui' },
      {}, {}, [], false,
    ));
    const opps = detectOpportunities(parsed).filter(o => o.id === 'arbitrage_av_rachat');
    expect(opps).toHaveLength(1);
    expect(opps[0].action.toLowerCase()).toContain('à étudier');
  });
});
```

- [ ] **Step 2: Détecteur** — ajouter un levier (près des autres leviers capital) :

```js
  // Rachat AV : option barème (2BH) avantageuse à TMI faible (levier informatif CIF-safe).
  const _avEco = parsedProfile.avRachatBaremeEco || 0;
  if (_avEco >= 50) {
    opps.push({
      id: 'arbitrage_av_rachat',
      type: 'gain',
      urgence: 'avant_declaration',
      titre: '💡 Rachat AV : l\'option barème (2BH) pourrait être plus avantageuse',
      description: `Sur votre rachat d'assurance-vie, l'imposition au barème (case 2BH) serait moins coûteuse que le PFU d'environ ${fmt(_avEco)} € — typique à tranche marginale faible. L'option barème est globale et irrévocable pour l'année.`,
      impact: `Économie estimée : ${fmt(_avEco)} € au barème`,
      impactEuros: _avEco,
      action: 'À étudier : cocher l\'option barème (2BH) si votre TMI est faible ; et fractionner les rachats sur plusieurs années pour rester sous l\'abattement annuel renouvelable (4 600 €/9 200 €).',
      questionChat: `Mon rachat d'assurance-vie : l'option barème (2BH) est-elle plus avantageuse que le PFU compte tenu de ma TMI ? Peux-tu m'expliquer l'abattement annuel et l'intérêt de fractionner mes rachats ?`,
    });
  }
```

  ⚠️ Le verrou cif-safe interdit un `action` commençant par un verbe décisionnel — « À étudier : … » est conforme (vérifié par le test cif-safe existant).

- [ ] **Step 3: Rapport** — dans la section capital de Rapport.jsx (près de l'affichage pvCapital), ajouter une ligne conditionnelle si `p.avRachatGains > 0` : « Rachat assurance-vie — IR (2CG) {e0(p.avRachatIR)} + PS {e0(round(avRachatPsBase×0.172))} ». (Repérer la table capital ; à défaut, une ligne dans la synthèse capital. Garder minimal.)

- [ ] **Step 4:** `npx vitest run` → tout vert (dont cif-safe) ; `npm run lint` → 0/0 ; `npm run build` → succès.

- [ ] **Step 5:** Commit `feat(av): opportunité barème 2BH (CIF-safe) + ligne rachat AV au rapport`.

---

### Task 5: Traçabilité + clôture

- [ ] **Step 1:** `docs/audit-2026-07-complet.md` section « Moyenne » : marquer « Rachats AV 2CH » ✅ 09/07/2026 (branche rachats-av) — préciser cases réelles 2CG/2BH (le titre audit « 2CH » était imprécis) + `docs/coverage.md` : passer les lignes rachats AV de ❌ à ✅.
- [ ] **Step 2:** `npx vitest run` + `npm run lint` + `npm run build` verts.
- [ ] **Step 3:** Commit docs, clôture via finishing-a-development-branch (merge main + push selon le choix établi), CI surveillée, mémoire projet mise à jour.
