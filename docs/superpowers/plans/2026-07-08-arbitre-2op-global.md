# Arbitre 2OP global (audit E3) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une recommandation PFU vs barème (case 2OP) **unique et globale** — dividendes + intérêts + PV mobilières ensemble — calculée une fois à la génération du profil, écrite dans le TXT, consommée partout ; fin des recommandations par catégorie potentiellement contradictoires.

**Architecture:** Approche A validée (spec `docs/superpowers/specs/2026-07-08-arbitre-2op-global-design.md`) : fonction pure `arbitrage2OP()` dans taxCalculator → appelée par `profileGenerator._capitalGainsBlock` quand il y a des PV → lignes TXT parsables → plugin `plus-values-mobilieres` les lit → `computeFoyerSummary` et `opportunitiesDetector` consomment (fallback = comportement actuel pour les anciens profils ou sans PV). Crypto hors 2OP (option fiscale distincte).

**Tech Stack:** Vitest (`npx vitest run`), fonctions pures taxCalculator, format TXT `fmtN` (espaces fines + « € »).

## Global Constraints

- **Paperasse-first** : aucun taux en littéral — utiliser `PFU_TAUX_IR`, `TAUX_PS_CAPITAL`, `pfuRaw.dividendes_option_bareme.abattement`, `pfuRaw.prelevements_sociaux.dont_csg_deductible_si_bareme`. Le test verrou `paperasse-first.test.js` doit rester vert.
- **Regex TXT** : montants avec espaces fines insécables → matcher avec `[\d\s ]` (U+202F dans la classe).
- **Aucun changement de comportement** pour : profils sans PV mobilières, anciens profils, crypto.
- Suite verte à chaque commit (~730 tests) ; commits `feat(2op): …` / `test(2op): …`.
- Travailler sur une branche : `git checkout -b arbitre-2op-global` (créée en Tâche 1, Step 0).

---

### Task 1: Fonction pure `arbitrage2OP()` (TDD)

**Files:**
- Modify: `src/lib/taxCalculator.js` (après `arbitragePfuBareme`, ~ligne 715)
- Test: `src/lib/__tests__/arbitrage-2op.test.js` (create)

**Interfaces:**
- Consumes: `calcIR`, `PFU_TAUX_IR`, `TAUX_PS_CAPITAL`, `pfuRaw` (déjà dans le module), `_round`.
- Produces: `arbitrage2OP({ dividendes, interets, pvNetImposable, pvBaseIRBareme, rniFoyer, parts, isCouple })` → `{ pfu, bareme, recommande: 'pfu'|'bareme', economie, detail }`. Tâches 2 et 4 en dépendent.

- [ ] **Step 0: Créer la branche**

```bash
git checkout -b arbitre-2op-global
```

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/lib/__tests__/arbitrage-2op.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { arbitrage2OP, PFU_TAUX_IR, TAUX_PS_CAPITAL } from '../taxCalculator';

describe('arbitrage2OP — option barème globale (dividendes + intérêts + PV)', () => {
  it('tout à zéro → neutre, aucune économie', () => {
    const r = arbitrage2OP({});
    expect(r.pfu).toBe(0);
    expect(r.bareme).toBe(0);
    expect(r.economie).toBe(0);
  });

  it('PFU exact : 12,8 % IR + 17,2 % PS sur la base globale', () => {
    // TMI 45 % (RNI 200 000, 1 part) : le PFU gagne largement sur des dividendes.
    const r = arbitrage2OP({ dividendes: 10_000, rniFoyer: 200_000, parts: 1 });
    expect(r.pfu).toBe(Math.round(10_000 * (PFU_TAUX_IR + TAUX_PS_CAPITAL))); // 3 000
    expect(r.recommande).toBe('pfu');
    expect(r.economie).toBe(Math.abs(r.pfu - r.bareme));
  });

  it('TMI 11 % + dividendes → barème gagnant (abattement 40 % + CSG déductible)', () => {
    const r = arbitrage2OP({ dividendes: 10_000, rniFoyer: 15_000, parts: 1 });
    expect(r.recommande).toBe('bareme');
    expect(r.bareme).toBeLessThan(r.pfu);
  });

  it('PV pré-2018 avec abattement durée 65 % : inversion à TMI 30 %', () => {
    // Dividendes seuls à TMI 30 % → PFU gagne. Mais une PV dont la base barème est
    // réduite de 65 % (titres < 2018, ≥ 8 ans) fait basculer l'arbitrage GLOBAL.
    const divSeuls = arbitrage2OP({ dividendes: 5_000, rniFoyer: 60_000, parts: 1 });
    expect(divSeuls.recommande).toBe('pfu');

    const avecPv = arbitrage2OP({
      dividendes: 0, interets: 0,
      pvNetImposable: 20_000, pvBaseIRBareme: 7_000,   // abattement 65 %
      rniFoyer: 60_000, parts: 1,
    });
    expect(avecPv.pfu).toBe(Math.round(20_000 * (PFU_TAUX_IR + TAUX_PS_CAPITAL))); // 6 000
    expect(avecPv.recommande).toBe('bareme');
  });

  it('PV seule sans dividendes/intérêts : l\'arbitrage fonctionne (angle mort de l\'existant)', () => {
    const r = arbitrage2OP({ pvNetImposable: 20_000, rniFoyer: 200_000, parts: 1 });
    expect(r.recommande).toBe('pfu');   // TMI 45 % sans abattement → PFU
    expect(r.pfu).toBe(6_000);
  });

  it('les PS sont identiques dans les deux scénarios (assiette pleine)', () => {
    const r = arbitrage2OP({ dividendes: 10_000, pvNetImposable: 5_000, rniFoyer: 40_000, parts: 1 });
    expect(r.detail.ps).toBe(Math.round(15_000 * TAUX_PS_CAPITAL));
    expect(r.pfu - r.detail.irPfu).toBe(r.detail.ps);
    expect(r.bareme - r.detail.irBareme).toBe(r.detail.ps);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/lib/__tests__/arbitrage-2op.test.js`
Expected: FAIL — `arbitrage2OP` n'est pas exporté.

- [ ] **Step 3: Implémenter dans taxCalculator.js** (juste après `arbitragePfuBareme`)

```js
/**
 * Arbitrage GLOBAL de l'option barème (case 2OP) — art. 200 A 2 CGI.
 * L'option 2OP est globale et annuelle : elle couvre d'un bloc les dividendes
 * (2DC), intérêts (2TR) ET plus-values mobilières (3VG). Cette fonction compare
 * les deux SEULS scénarios déclarables : tout PFU vs tout barème.
 * NB : la crypto (3AN) a sa propre option, distincte de 2OP → hors périmètre.
 *
 * Approximation (héritée d'arbitragePfuBareme, documentée) : la CSG déductible
 * 6,8 % s'impute légalement en N+1 ; elle est approximée la même année. La
 * déductibilité réduite de la CSG sur PV abattues n'est pas modélisée.
 *
 * @param {object} o
 * @param {number} o.dividendes       - dividendes bruts (2DC)
 * @param {number} o.interets         - intérêts bruts (2TR)
 * @param {number} o.pvNetImposable   - PV après moins-values (gainImposable de calcPvMobiliere)
 * @param {number} o.pvBaseIRBareme   - PV après MV et abattements durée (baseIRBareme) — défaut : pvNetImposable
 * @param {number} o.rniFoyer @param {number} o.parts @param {boolean} o.isCouple
 * @returns {{ pfu:number, bareme:number, recommande:'pfu'|'bareme', economie:number, detail:object }}
 */
export function arbitrage2OP({
  dividendes = 0, interets = 0,
  pvNetImposable = 0, pvBaseIRBareme = 0,
  rniFoyer = 0, parts = 1, isCouple = false,
} = {}) {
  const div = Math.max(0, dividendes);
  const int = Math.max(0, interets);
  const pv  = Math.max(0, pvNetImposable);
  const pvBareme = Math.min(pv, Math.max(0, pvBaseIRBareme) || pv);
  const base = div + int + pv;
  if (base <= 0) {
    return { pfu: 0, bareme: 0, recommande: 'pfu', economie: 0, detail: { base: 0, irPfu: 0, irBareme: 0, ps: 0 } };
  }
  const ps    = _round(base * TAUX_PS_CAPITAL);   // identique dans les deux scénarios
  const irPfu = _round(base * PFU_TAUX_IR);

  const abatt    = pfuRaw.dividendes_option_bareme.abattement;
  const csgDeduc = _round(base * pfuRaw.prelevements_sociaux.dont_csg_deductible_si_bareme);
  const baseBareme = Math.max(0, _round(div * (1 - abatt) + int + pvBareme - csgDeduc));
  const irBareme = Math.max(0, calcIR(rniFoyer + baseBareme, parts, isCouple) - calcIR(rniFoyer, parts, isCouple));

  const pfu    = irPfu + ps;
  const bareme = irBareme + ps;
  return {
    pfu, bareme,
    recommande: bareme <= pfu ? 'bareme' : 'pfu',
    economie: Math.abs(pfu - bareme),
    detail: { base, baseBareme, csgDeduc, irPfu, irBareme, ps },
  };
}
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run src/lib/__tests__/arbitrage-2op.test.js src/lib/__tests__/paperasse-first.test.js`
Expected: PASS. Puis `npx vitest run` → tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxCalculator.js src/lib/__tests__/arbitrage-2op.test.js
git commit -m "feat(2op): arbitrage2OP — arbitrage global PFU vs barème (div + intérêts + PV) (audit E3)"
```

---

### Task 2: Générateur — lignes TXT d'arbitrage (remplace la note PV isolée)

**Files:**
- Modify: `src/lib/profileGenerator.js` — import + bloc `hasPvMob` de `_capitalGainsBlock` (~lignes 306-323) + note crypto (~ligne 338)
- Test: `src/lib/__tests__/arbitrage-2op.test.js` (étendre)

**Interfaces:**
- Consumes: `arbitrage2OP` (Tâche 1), `pm` (résultat `calcPvMobiliere` local), `d.div_2dc`, `d.int_mob_2tr`, `pvMobBareme`, `fmtN`.
- Produces (lignes TXT, format exact — la Tâche 3 les parse) :
  - `Arbitrage 2OP foyer : PFU {fmtN} | barème {fmtN} | recommandé : {PFU|barème} | économie {fmtN}`
  - `Option 2OP déclarée : {Oui|Non}`

- [ ] **Step 1: Test qui échoue** — ajouter dans `arbitrage-2op.test.js` :

```js
import { buildProfile } from '../profileGenerator';

describe('Générateur — lignes TXT Arbitrage 2OP (émises seulement avec des PV)', () => {
  it('avec PV : émet l\'arbitrage global et l\'option déclarée', () => {
    const profile = buildProfile(
      { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000', pv_mob_gain: '1000' },
      {}, {}, [], false,
    );
    expect(profile).toMatch(/Arbitrage 2OP foyer\s*:\s*PFU\s[\d\s ]+€\s*\|\s*barème\s[\d\s ]+€\s*\|\s*recommandé\s*:\s*(PFU|barème)\s*\|\s*économie\s[\d\s ]+€/);
    expect(profile).toContain('Option 2OP déclarée : Non');
    // L'ancienne note PV isolée a disparu
    expect(profile).not.toContain('avantageuse pour les PV mobilières');
  });

  it('sans PV : aucune ligne 2OP (le fallback aval est déjà exact)', () => {
    const profile = buildProfile(
      { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000' },
      {}, {}, [], false,
    );
    expect(profile).not.toContain('Arbitrage 2OP foyer');
  });

  it('option déclarée ≠ optimum → note ℹ️ globale ; option = optimum → pas de note', () => {
    // TMI 11 % + dividendes + petite PV → barème optimal (cf. tests unitaires).
    const base = { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000', pv_mob_gain: '1000' };
    const pNon = buildProfile({ ...base, pv_mob_option_bareme: 'Non' }, {}, {}, [], false);
    expect(pNon).toContain('option GLOBALE et annuelle');
    const pOui = buildProfile({ ...base, pv_mob_option_bareme: 'Oui' }, {}, {}, [], false);
    expect(pOui).toContain('Option 2OP déclarée : Oui');
    expect(pOui).not.toContain('option GLOBALE et annuelle');
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run src/lib/__tests__/arbitrage-2op.test.js` → FAIL (lignes absentes).

- [ ] **Step 3: Implémenter** — dans `profileGenerator.js` :

1. Ajouter `arbitrage2OP` à l'import existant depuis `./taxCalculator`.
2. Dans `_capitalGainsBlock`, remplacer le bloc :

```js
    if (pm.recommande === 'bareme' && !pvMobBareme && pm.economie > 0) {
      lignes.push(`ℹ️ Option barème (2OP) potentiellement plus avantageuse pour les PV mobilières (~${fmtN(pm.economie)} € d'écart) — option globale capital`);
      baremeFlag = true;
    }
```

par :

```js
    // Arbitrage GLOBAL 2OP (div + intérêts + PV) — source de vérité écrite au TXT,
    // consommée par le parser → summary → detector (jamais recalculée en aval).
    const arb = arbitrage2OP({
      dividendes: parseFloat(d.div_2dc || 0),
      interets:   parseFloat(d.int_mob_2tr || 0),
      pvNetImposable: pm.gainImposable,
      pvBaseIRBareme: pm.baseIRBareme,
      rniFoyer, parts, isCouple,
    });
    const recoLabel = arb.recommande === 'bareme' ? 'barème' : 'PFU';
    lignes.push(`Arbitrage 2OP foyer : PFU ${fmtN(arb.pfu)} | barème ${fmtN(arb.bareme)} | recommandé : ${recoLabel} | économie ${fmtN(arb.economie)}`);
    lignes.push(`Option 2OP déclarée : ${pvMobBareme ? 'Oui' : 'Non'}`);
    if ((arb.recommande === 'bareme') !== pvMobBareme && arb.economie > 0) {
      lignes.push(`ℹ️ Arbitrage 2OP : l'option ${recoLabel} serait plus avantageuse (~${fmtN(arb.economie)} d'écart) — option GLOBALE et annuelle (dividendes + intérêts + PV)`);
      baremeFlag = true;
    }
```

3. Note crypto (~ligne 338) : remplacer

```js
        lignes.push(`ℹ️ Option barème potentiellement plus avantageuse pour la crypto (~${fmtN(cp.economie)} € d'écart)`);
```

par :

```js
        lignes.push(`ℹ️ Option barème potentiellement plus avantageuse pour la crypto (~${fmtN(cp.economie)} d'écart — option distincte de la case 2OP)`);
```

⚠️ `fmtN` inclut déjà « € » — ne pas doubler le symbole.

- [ ] **Step 4: Vérifier** — `npx vitest run` → tout vert (les tests phase 4 existants n'assertent pas l'ancienne note ; si l'un casse sur le texte exact, adapter SON attendu à la nouvelle note, pas l'inverse).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profileGenerator.js src/lib/__tests__/arbitrage-2op.test.js
git commit -m "feat(2op): le générateur écrit l'arbitrage 2OP global dans le profil TXT (audit E3)"
```

---

### Task 3: Parser — lecture des lignes 2OP (plugin plus-values-mobilieres)

**Files:**
- Modify: `src/plugins/income/plus-values-mobilieres.plugin.js` (parser, ~lignes 21-33)
- Test: `src/lib/__tests__/arbitrage-2op.test.js` (étendre)

**Interfaces:**
- Produces (parsedProfile) : `arb2opPfu:number`, `arb2opBareme:number`, `arb2opRecommande:'pfu'|'bareme'|null`, `arb2opEconomie:number`, `option2opDeclaree:boolean`. Tâches 4-5 en dépendent.

- [ ] **Step 1: Test qui échoue** — ajouter dans `arbitrage-2op.test.js` :

```js
import { parseProfile } from '../profileParser';

describe('Parser — champs arb2op* depuis le TXT', () => {
  const profile = buildProfile(
    { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000', pv_mob_gain: '1000' },
    {}, {}, [], false,
  );
  const parsed = parseProfile(profile);

  it('lit le verdict, les montants et l\'option déclarée', () => {
    expect(['pfu', 'bareme']).toContain(parsed.arb2opRecommande);
    expect(parsed.arb2opPfu).toBeGreaterThan(0);
    expect(parsed.arb2opBareme).toBeGreaterThan(0);
    expect(parsed.arb2opEconomie).toBeGreaterThanOrEqual(0);
    expect(parsed.option2opDeclaree).toBe(false);
  });

  it('profil sans PV : champs absents/null (fallback aval)', () => {
    const sansPv = parseProfile(buildProfile(
      { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000' }, {}, {}, [], false,
    ));
    expect(sansPv.arb2opRecommande ?? null).toBe(null);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — champs undefined → FAIL.

- [ ] **Step 3: Implémenter** — dans le `parser(text)` du plugin, avant le `return` :

```js
    // Arbitrage 2OP global écrit par le générateur (une seule ligne, 4 groupes).
    // [\s ] : espaces fines insécables des montants fmtN.
    const mArb = text.match(
      /Arbitrage 2OP foyer\s*:\s*PFU\s*([\d\s ]+)€\s*\|\s*barème\s*([\d\s ]+)€\s*\|\s*recommandé\s*:\s*(PFU|barème)\s*\|\s*économie\s*([\d\s ]+)€/i,
    );
    const toInt = (s) => parseInt(String(s).replace(/[\s ]/g, ''), 10) || 0;
    const arb2opPfu        = mArb ? toInt(mArb[1]) : 0;
    const arb2opBareme     = mArb ? toInt(mArb[2]) : 0;
    const arb2opRecommande = mArb ? (/barème/i.test(mArb[3]) ? 'bareme' : 'pfu') : null;
    const arb2opEconomie   = mArb ? toInt(mArb[4]) : 0;
    const option2opDeclaree = /Option 2OP déclarée\s*:\s*Oui/i.test(text);
```

et les ajouter à l'objet retourné :

```js
      arb2opPfu, arb2opBareme, arb2opRecommande, arb2opEconomie, option2opDeclaree,
```

- [ ] **Step 4: Vérifier** — `npx vitest run` → tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/income/plus-values-mobilieres.plugin.js src/lib/__tests__/arbitrage-2op.test.js
git commit -m "feat(2op): le parser expose l'arbitrage 2OP global (arb2op*) (audit E3)"
```

---

### Task 4: computeFoyerSummary — consommer l'arbitrage écrit (fallback sinon)

**Files:**
- Modify: `src/lib/taxCalculator.js` (bloc `arbitrageCapital` de `computeFoyerSummary`, ~ligne 1503)
- Test: `src/lib/__tests__/arbitrage-2op.test.js` (étendre)

**Interfaces:**
- Produces: `summary.arbitrageCapital = { pfu, bareme, recommande, economie, source: '2op'|'fallback', … }` — même forme qu'avant + `source`.

- [ ] **Step 1: Test qui échoue** :

```js
import { computeFoyerSummary } from '../taxCalculator';

describe('computeFoyerSummary — arbitrageCapital unifié', () => {
  it('profil avec PV : consomme l\'arbitrage du TXT (source 2op), sans recalcul', () => {
    const parsed = parseProfile(buildProfile(
      { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000', pv_mob_gain: '1000' },
      {}, {}, [], false,
    ));
    const s = computeFoyerSummary(parsed);
    expect(s.arbitrageCapital.source).toBe('2op');
    expect(s.arbitrageCapital.recommande).toBe(parsed.arb2opRecommande);
    expect(s.arbitrageCapital.pfu).toBe(parsed.arb2opPfu);
  });

  it('profil sans lignes 2OP : fallback identique à l\'existant', () => {
    const parsed = parseProfile(buildProfile(
      { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000' }, {}, {}, [], false,
    ));
    const s = computeFoyerSummary(parsed);
    expect(s.arbitrageCapital.source).toBe('fallback');
    expect(['pfu', 'bareme']).toContain(s.arbitrageCapital.recommande);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `source` undefined → FAIL.

- [ ] **Step 3: Implémenter** — remplacer dans `computeFoyerSummary` :

```js
  // Arbitrage PFU 30 % vs option barème sur les revenus du capital (dividendes/intérêts CTO).
  const arbitrageCapital = arbitragePfuBareme({
    dividendes: profile.dividendes2DC || 0,
    interets:   profile.intMob2TR || 0,
    rniFoyer, parts, isCouple,
  });
```

par :

```js
  // Arbitrage 2OP — verdict GLOBAL (div + intérêts + PV) écrit au TXT par le
  // générateur (source '2op'). Fallback anciens profils / sans PV : arbitrage
  // partiel div + intérêts (exact quand PV = 0).
  const arbitrageCapital = profile.arb2opRecommande
    ? {
        pfu:        profile.arb2opPfu || 0,
        bareme:     profile.arb2opBareme || 0,
        recommande: profile.arb2opRecommande,
        economie:   profile.arb2opEconomie || 0,
        source:     '2op',
      }
    : {
        ...arbitragePfuBareme({
          dividendes: profile.dividendes2DC || 0,
          interets:   profile.intMob2TR || 0,
          rniFoyer, parts, isCouple,
        }),
        source: 'fallback',
      };
```

- [ ] **Step 4: Vérifier** — `npx vitest run` → tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxCalculator.js src/lib/__tests__/arbitrage-2op.test.js
git commit -m "feat(2op): computeFoyerSummary consomme l'arbitrage 2OP du profil, fallback préservé (audit E3)"
```

---

### Task 5: Détecteur — levier bidirectionnel unique

**Files:**
- Modify: `src/lib/opportunitiesDetector.js` (bloc `arbitrage_pfu_bareme`, lignes ~113-135)
- Test: `src/lib/__tests__/arbitrage-2op.test.js` (étendre)

- [ ] **Step 1: Tests qui échouent** :

```js
import { detectOpportunities } from '../opportunitiesDetector';

describe('Détecteur — levier 2OP unique et bidirectionnel', () => {
  const build = (extra) => parseProfile(buildProfile(
    { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000', pv_mob_gain: '1000', ...extra },
    {}, {}, [], false,
  ));

  it('option déclarée ≠ optimum → un seul levier, cohérent avec le summary', () => {
    const parsed = build({ pv_mob_option_bareme: 'Non' });   // optimum attendu : barème (TMI 11 %)
    const opps = detectOpportunities(parsed).filter(o => o.id === 'arbitrage_pfu_bareme');
    expect(opps).toHaveLength(1);
    const s = computeFoyerSummary(parsed);
    // Anti-contradiction (cœur E3) : le levier recommande la même option que le summary.
    const attendu = s.arbitrageCapital.recommande === 'bareme' ? /barème/i : /PFU/i;
    expect(opps[0].titre + opps[0].action).toMatch(attendu);
  });

  it('option déclarée = optimum → aucun levier', () => {
    const parsed = build({ pv_mob_option_bareme: 'Oui' });   // barème déjà coché
    expect(detectOpportunities(parsed).filter(o => o.id === 'arbitrage_pfu_bareme')).toHaveLength(0);
  });

  it('sens inverse : 2OP coché mais PFU optimal → levier « repasser au PFU »', () => {
    // TMI 45 % : le PFU gagne → avoir coché barème coûte de l'argent.
    const parsed = parseProfile(buildProfile(
      { statut: 'Célibataire', net_imp: '250000', div_2dc: '10000', pv_mob_gain: '5000', pv_mob_option_bareme: 'Oui' },
      {}, {}, [], false,
    ));
    const opps = detectOpportunities(parsed).filter(o => o.id === 'arbitrage_pfu_bareme');
    expect(opps).toHaveLength(1);
    expect(opps[0].action).toMatch(/PFU/);
  });

  it('ancien profil (fallback) : comportement actuel conservé', () => {
    const parsed = parseProfile(buildProfile(
      { statut: 'Célibataire', net_imp: '15000', div_2dc: '10000' }, {}, {}, [], false,
    ));
    const opps = detectOpportunities(parsed).filter(o => o.id === 'arbitrage_pfu_bareme');
    expect(opps.length).toBeLessThanOrEqual(1);   // levier barème seulement si économie ≥ 50 €
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — le test « sens inverse » échoue (aucun levier émis quand 2OP coché aujourd'hui).

- [ ] **Step 3: Implémenter** — remplacer le bloc actuel (`const _div2DC …` jusqu'à la fin du `if (_div2DC + _int2TR > 0) { … }`) par :

```js
  // Arbitrage 2OP — verdict GLOBAL (div + intérêts + PV) lu du profil quand
  // disponible ; levier BIDIRECTIONNEL dès que l'option déclarée n'est pas
  // l'optimum. Fallback anciens profils : arbitrage div + intérêts (exact
  // quand PV = 0), barème seulement (comportement historique).
  const _div2DC = parsedProfile.dividendes2DC || 0;
  const _int2TR = parsedProfile.intMob2TR || 0;
  if (parsedProfile.arb2opRecommande) {
    const reco    = parsedProfile.arb2opRecommande;                       // 'pfu' | 'bareme'
    const declare = parsedProfile.option2opDeclaree ? 'bareme' : 'pfu';
    const eco     = parsedProfile.arb2opEconomie || 0;
    if (reco !== declare && eco >= 50) {
      const versBareme = reco === 'bareme';
      opps.push({
        id: 'arbitrage_pfu_bareme',
        type: 'gain',
        urgence: 'avant_declaration',
        titre: versBareme
          ? '💡 Option barème (2OP) avantageuse sur l\'ensemble de vos revenus du capital'
          : '💡 Le PFU serait plus avantageux que votre option barème (2OP)',
        description: `Arbitrage GLOBAL (dividendes + intérêts + plus-values ensemble — la case 2OP couvre tout d'un bloc) : PFU ${fmt(parsedProfile.arb2opPfu)} € vs barème ${fmt(parsedProfile.arb2opBareme)} €. Votre option actuelle (${declare === 'bareme' ? 'barème' : 'PFU'}) n'est pas l'optimum.`,
        impact: `Économie estimée : ${fmt(eco)} € en ${versBareme ? 'cochant' : 'décochant'} la case 2OP`,
        impactEuros: eco,
        action: versBareme
          ? 'Cocher la case 2OP lors de la déclaration — l\'option est GLOBALE (dividendes + intérêts + PV), annuelle et irrévocable pour l\'année.'
          : 'Ne pas cocher la case 2OP cette année : le PFU 30 % est plus avantageux sur l\'ensemble de vos revenus du capital.',
        questionChat: `Mon arbitrage 2OP global : PFU ${fmt(parsedProfile.arb2opPfu)} € vs barème ${fmt(parsedProfile.arb2opBareme)} € (économie ${fmt(eco)} € en optant pour ${versBareme ? 'le barème' : 'le PFU'}). Peux-tu vérifier ce choix compte tenu de mon TMI, de l'abattement 40 % sur dividendes, des abattements durée sur PV et de la CSG déductible ?`,
      });
    }
  } else if (_div2DC + _int2TR > 0) {
    const arb = arbitragePfuBareme({
      dividendes: _div2DC, interets: _int2TR,
      rniFoyer: rniFoyer || 0, parts: parts || (isCouple ? 2 : 1), isCouple,
    });
    if (arb.recommande === 'bareme' && arb.economie >= 50) {
      opps.push({
        id: 'arbitrage_pfu_bareme',
        type: 'gain',
        urgence: 'avant_declaration',
        titre: '💡 Option barème avantageuse sur vos revenus du capital',
        description: `Vos dividendes/intérêts (${fmt(_div2DC + _int2TR)} €) seraient moins taxés au barème (${fmt(arb.bareme)} €) qu'au PFU 30 % (${fmt(arb.pfu)} €) — grâce à l'abattement 40 % sur dividendes et à la CSG déductible (6,8 %).`,
        impact: `Économie estimée : ${fmt(arb.economie)} € en optant pour le barème (case 2OP)`,
        impactEuros: arb.economie,
        action: 'Cocher la case 2OP (imposition au barème) lors de la déclaration — attention : l\'option est GLOBALE pour tous les revenus du capital de l\'année et irrévocable.',
        questionChat: `Mes revenus du capital (dividendes ${fmt(_div2DC)} €, intérêts ${fmt(_int2TR)} €) : l'option barème (2OP) semble plus avantageuse que le PFU 30 % (économie ~${fmt(arb.economie)} €). Peux-tu confirmer l'arbitrage compte tenu de mon TMI et m'expliquer l'effet de la CSG déductible l'année suivante ?`,
      });
    }
  }
```

*(La branche fallback est le bloc actuel inchangé — copié tel quel.)*

- [ ] **Step 4: Vérifier** — `npx vitest run` → tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/lib/opportunitiesDetector.js src/lib/__tests__/arbitrage-2op.test.js
git commit -m "feat(2op): levier détecteur unique et bidirectionnel, fini les recos contradictoires (audit E3)"
```

---

### Task 6: Libellé Collect + traçabilité audit

**Files:**
- Modify: `src/pages/Collect.jsx:229` (libellé du champ option)
- Modify: `docs/audit-2026-07-complet.md` (ligne E3 du tableau)

- [ ] **Step 1: Préciser le libellé** — remplacer :

```js
  { key: 'pv_mob_option_bareme', label: 'Option barème progressif (2OP) ?', type: 'select', opts: ['Non', 'Oui'], requires: 'capitauxMobiliers', advanced: true,
```

par :

```js
  { key: 'pv_mob_option_bareme', label: 'Option barème global 2OP (dividendes + intérêts + PV) ?', type: 'select', opts: ['Non', 'Oui'], requires: 'capitauxMobiliers', advanced: true,
```

- [ ] **Step 2: Marquer E3 traité** — dans `docs/audit-2026-07-complet.md`, ligne E3 du tableau « Élevée » : remplacer `| à planifier |` par `| ✅ {date} ({commit}) |`.

- [ ] **Step 3: Vérification finale du lot**

Run: `npx vitest run` → tout vert (≈ 735 tests) ; `npm run lint` → 0 erreur ; `npm run build` → OK.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Collect.jsx docs/audit-2026-07-complet.md
git commit -m "feat(2op): libellé Collect explicite sur la globalité de l'option (audit E3)"
```

---

## Vérification finale

- [ ] Suite complète verte + lint 0 erreur + build OK
- [ ] Verrou paperasse-first vert (aucun littéral fiscal introduit)
- [ ] Anti-contradiction démontrée par test : TXT = summary = detector sur le même profil
- [ ] Mémoire projet : noter E3 terminé dans `audit-kapio-2026-07`
- [ ] Clôture de branche via finishing-a-development-branch (merge main + push après accord)
