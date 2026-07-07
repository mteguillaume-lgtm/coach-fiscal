# Correctifs audit — Lot 1 (critiques + socle CI/sécurité) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éliminer toutes les valeurs fiscales en dur (règle Paperasse-first), ajouter les deux garde-fous utilisateur critiques (PDF scanné, concubinage), et poser le socle CI + sécurité — correctifs C1-C6, E1, E2, E8 de `docs/audit-2026-07-complet.md`.

**Architecture:** Chaque valeur fiscale migre vers son JSON source (`src/data/paperasse/…` avec miroir obligatoire dans `_sources/paperasse/…`, ou JSON app-local `src/data/` pour l'épargne réglementée). `taxCalculator.js` reste l'unique point d'export des constantes. Un test d'architecture verrouille le tout. Les garde-fous UI s'appuient sur des fonctions pures testables extraites dans `src/lib`.

**Tech Stack:** React 19 + Vite 8, Vitest 4 (`npx vitest run`), ESLint 10 flat config, Vercel (SPA), GitHub Actions.

## Global Constraints

- **Paperasse-first** : aucun taux/seuil/plafond fiscal en littéral dans `src/lib` ou `src/plugins` — tout vient d'un JSON.
- **Miroir `_sources/`** : `npm run sync:paperasse` fait un `rsync -a --delete` de `_sources/paperasse/` vers `src/data/paperasse/`. **Toute modification d'un JSON sous `src/data/paperasse/` DOIT être répliquée à l'identique dans `_sources/paperasse/`** sinon elle sera écrasée au prochain sync. (Idéalement : proposer aussi la modification upstream sur romainsimon/paperasse.)
- **Suite verte à chaque commit** : `npx vitest run` → 694 tests (au départ) passent, plus les nouveaux.
- **Montants** : `toLocaleString('fr-FR')`, jamais `.toFixed()`. Regex de parsing : gérer l'espace fine insécable U+202F (`[\s ]`).
- **Commits** : messages en français, style existant `fix(scope): description` / `feat(scope): description` / `test(scope): description`.
- **Comportement numérique inchangé** sauf là où le plan le dit explicitement (Tâche 6 : correction volontaire de l'abattement pensions).
- Exécuter les commandes depuis la racine : `/Users/CFO/Documents/kapio`.

---

### Task 1: CEHR lue depuis le JSON (C1)

Le barème CEHR existe déjà dans `bareme-ir-2025.json` (bloc `cehr`) mais `calcCEHR` code les seuils en dur. On lit le JSON.

**Files:**
- Modify: `src/lib/taxCalculator.js:1060-1083` (bloc CEHR)
- Test: `src/lib/__tests__/cehr.test.js` (create)

**Interfaces:**
- Consumes: `baremeRaw` (déjà chargé en haut de taxCalculator.js), format tranches `{ de, a, taux }` / `{ au_dela, taux }`.
- Produces: `calcCEHR(rfr, isCouple)` (signature inchangée) + nouvel export `CEHR_BAREME` (objet brut du JSON). `computeFoyerSummary` continue d'appeler `calcCEHR` sans modification.

- [ ] **Step 1: Écrire le test qui échoue (sur l'export `CEHR_BAREME`)**

Créer `src/lib/__tests__/cehr.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { calcCEHR, CEHR_BAREME } from '../taxCalculator';

describe('CEHR — barème lu depuis bareme-ir-YYYY.json (paperasse-first)', () => {
  it('expose le barème du JSON (preuve de lecture, pas de valeurs en dur)', () => {
    expect(CEHR_BAREME.seuils_celibataire[0]).toMatchObject({ de: 250000, a: 500000, taux: 0.03 });
    expect(CEHR_BAREME.seuils_couple[0]).toMatchObject({ de: 500000, a: 1000000, taux: 0.03 });
  });

  it('célibataire : 0 sous le seuil, 3 % puis 4 %', () => {
    expect(calcCEHR(200_000, false)).toBe(0);
    expect(calcCEHR(300_000, false)).toBe(1_500);          // 3 % × 50 000
    expect(calcCEHR(600_000, false)).toBe(11_500);         // 7 500 + 4 000
  });

  it('couple : seuils doublés', () => {
    expect(calcCEHR(400_000, true)).toBe(0);
    expect(calcCEHR(600_000, true)).toBe(3_000);           // 3 % × 100 000
    expect(calcCEHR(1_200_000, true)).toBe(23_000);        // 15 000 + 8 000
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/lib/__tests__/cehr.test.js`
Expected: FAIL — `CEHR_BAREME` n'est pas exporté (undefined).

- [ ] **Step 3: Remplacer l'implémentation**

Dans `src/lib/taxCalculator.js`, remplacer intégralement le bloc :

```js
export function calcCEHR(rfr, isCouple = false) {
  if (!rfr || rfr <= 0) return 0;
  if (!isCouple) {
    const t1 = Math.max(0, Math.min(rfr, 500_000) - 250_000) * 0.03;
    const t2 = Math.max(0, rfr - 500_000) * 0.04;
    return Math.round(t1 + t2);
  }
  const t1 = Math.max(0, Math.min(rfr, 1_000_000) - 500_000) * 0.03;
  const t2 = Math.max(0, rfr - 1_000_000) * 0.04;
  return Math.round(t1 + t2);
}
```

par :

```js
// Barème CEHR — source unique : bareme-ir-YYYY.json → cehr (art. 223 sexies CGI).
export const CEHR_BAREME = baremeRaw.cehr;

function _cehrSurTranches(tranches, rfr) {
  let total = 0;
  for (const t of tranches) {
    if (t.au_dela != null) {
      if (rfr > t.au_dela) total += (rfr - t.au_dela) * t.taux;
    } else if (rfr > t.de) {
      total += (Math.min(rfr, t.a) - t.de) * t.taux;
    }
  }
  return total;
}

export function calcCEHR(rfr, isCouple = false) {
  if (!rfr || rfr <= 0) return 0;
  const tranches = isCouple ? CEHR_BAREME.seuils_couple : CEHR_BAREME.seuils_celibataire;
  return Math.round(_cehrSurTranches(tranches, rfr));
}
```

Conserver le JSDoc existant au-dessus de `calcCEHR` (il documente les seuils : remplacer les montants cités par « voir bloc cehr du JSON »).

- [ ] **Step 4: Vérifier que tout passe**

Run: `npx vitest run src/lib/__tests__/cehr.test.js src/lib/__tests__/phase0-socle.test.js`
Expected: PASS (le test existant « CEHR appliquée au-delà du seuil RFR » doit rester vert).

Run: `npx vitest run`
Expected: 694 + 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxCalculator.js src/lib/__tests__/cehr.test.js
git commit -m "fix(paperasse): CEHR lue depuis bareme-ir JSON au lieu de valeurs en dur (audit C1)"
```

---

### Task 2: Taux de décote lu depuis le JSON (C2)

Le taux 0,4525 n'existe dans le JSON que dans une phrase (`formule_celibataire`). On ajoute un champ machine `taux` (dans les DEUX copies du JSON), on le lit, et on protège la mise à jour annuelle.

**Files:**
- Modify: `src/data/paperasse/fiscaliste/data/bareme-ir-2025.json` (bloc `decote`)
- Modify: `_sources/paperasse/fiscaliste/data/bareme-ir-2025.json` (même édition — miroir sync)
- Modify: `src/lib/taxCalculator.js:65` (const DECOTE) et `:1100-1105` (applyDecote)
- Modify: `scripts/update-bareme.js` (fonction `validate` ~ligne 118, template `buildPrompt` ~ligne 157)
- Test: `src/lib/__tests__/decote.test.js` (create)

**Interfaces:**
- Consumes: `DECOTE` (const module existante).
- Produces: `DECOTE.taux` (number). `applyDecote` inchangé en signature (fonction privée).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/__tests__/decote.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { DECOTE, calcIR } from '../taxCalculator';

describe('Décote — taux lu depuis bareme-ir-YYYY.json (paperasse-first)', () => {
  it('expose un champ machine taux (pas seulement la formule en prose)', () => {
    expect(typeof DECOTE.taux).toBe('number');
    expect(DECOTE.taux).toBeGreaterThan(0);
    expect(DECOTE.taux).toBeLessThan(1);
  });

  it('la décote réduit bien l\'IR d\'un petit revenu (non-régression comportementale)', () => {
    // Solo, RNI 20 000 € : IR brut sous le seuil de décote → décote active.
    const avecDecote = calcIR(20_000, 1, false);
    expect(avecDecote).toBeGreaterThan(0);
    // Un revenu élevé n'est pas décoté : l'IR croît plus vite que linéairement en bas de barème.
    expect(calcIR(40_000, 1, false)).toBeGreaterThan(2 * avecDecote);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/lib/__tests__/decote.test.js`
Expected: FAIL — `DECOTE.taux` est `undefined` (typeof = 'undefined').

- [ ] **Step 3: Ajouter le champ aux DEUX JSON**

Dans `src/data/paperasse/fiscaliste/data/bareme-ir-2025.json`, remplacer :

```json
  "decote": {
    "seuil_celibataire": 1982,
```

par :

```json
  "decote": {
    "taux": 0.4525,
    "seuil_celibataire": 1982,
```

Faire **exactement la même édition** dans `_sources/paperasse/fiscaliste/data/bareme-ir-2025.json` (vérifier d'abord que le bloc y est identique : `grep -n '"decote"' _sources/paperasse/fiscaliste/data/bareme-ir-2025.json`).

- [ ] **Step 4: Lire le champ dans taxCalculator.js**

Après la ligne `const DECOTE = baremeRaw.decote;`, ajouter :

```js
if (typeof DECOTE.taux !== 'number') {
  throw new Error('[taxCalculator] decote.taux manquant dans bareme-ir-YYYY.json — ajouter le champ machine (ex. 0.4525).');
}
```

Dans `applyDecote`, remplacer :

```js
  return Math.max(0, Math.round(plafond - 0.4525 * brut));
```

par :

```js
  return Math.max(0, Math.round(plafond - DECOTE.taux * brut));
```

- [ ] **Step 5: Protéger la mise à jour annuelle (scripts/update-bareme.js)**

Dans la fonction `validate(data, year)`, après la ligne `if (!data.decote?.seuil_celibataire) throw new Error('Décote manquante');`, ajouter :

```js
  if (typeof data.decote?.taux !== 'number') throw new Error('decote.taux manquant (champ machine requis)');
```

Dans le template JSON de `buildPrompt` (bloc `"decote"` ~ligne 157), remplacer :

```
  "decote": {
    "seuil_celibataire": XXXX,
```

par :

```
  "decote": {
    "taux": 0.4525,
    "seuil_celibataire": XXXX,
```

(et si la LFI change le taux, l'extracteur mettra la valeur réelle — les lignes `formule_…` du template le documentent déjà).

- [ ] **Step 6: Vérifier**

Run: `npx vitest run`
Expected: tous PASS (les valeurs IR sont inchangées : 0.4525 vient maintenant du JSON).

Run: `npm run update-bareme:dry -- 2>/dev/null | head -5` *(optionnel — nécessite une clé API ; sinon vérifier juste la syntaxe : `node --check scripts/update-bareme.js`)*
Expected: pas d'erreur de syntaxe.

- [ ] **Step 7: Commit**

```bash
git add src/data/paperasse/fiscaliste/data/bareme-ir-2025.json _sources/paperasse/fiscaliste/data/bareme-ir-2025.json src/lib/taxCalculator.js scripts/update-bareme.js src/lib/__tests__/decote.test.js
git commit -m "fix(paperasse): taux de décote en champ machine JSON, plus de 0.4525 en dur (audit C2)"
```

---

### Task 3: Centralisation PS 17,2 %, plafonds épargne et hypothèses de rendement (C4a)

Trois familles de littéraux à éliminer : le taux PS (fiscal → déjà exporté par taxCalculator), les plafonds d'épargne réglementée et PEA (légaux → JSON), les hypothèses de rendement (non fiscales → module dédié commenté).

**Files:**
- Create: `src/data/epargne-reglementee.json`
- Create: `src/lib/hypothesesRendement.js`
- Modify: `src/lib/taxCalculator.js` (imports + 4 exports + `baseIRFoyer:1214`)
- Modify: `src/lib/profileParser.js:1` (import) et `:226-231`
- Modify: `src/lib/opportunitiesDetector.js:4` (import), `:67`, `:372-373`, `:385-416`
- Test: `src/lib/__tests__/constantes-centralisees.test.js` (create)

**Interfaces:**
- Produces (nouveaux exports `taxCalculator.js`) : `PLAFOND_LIVRET_A`, `PLAFOND_LDDS`, `PLAFOND_LEP` (number, depuis epargne-reglementee.json) ; `PLAFOND_VERSEMENTS_PEA` (number, depuis pea-assurance-vie.json → `pea_classique.plafond_versements`).
- Produces (`src/lib/hypothesesRendement.js`) : `RDT_LIVRET_A`, `RDT_LIVRET_PLUS_PROMO`, `GAIN_DIFF_LDDS`, `GAIN_DIFF_LEP`, `GAIN_DIFF_AV_LT`, `GAIN_DIFF_PEA_LT`, `GAIN_DIFF_DEFAUT` (numbers).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/__tests__/constantes-centralisees.test.js` :

```js
import { describe, it, expect } from 'vitest';
import {
  PLAFOND_LIVRET_A, PLAFOND_LDDS, PLAFOND_LEP,
  PLAFOND_VERSEMENTS_PEA, TAUX_PS_CAPITAL,
} from '../taxCalculator';
import { RDT_LIVRET_A, RDT_LIVRET_PLUS_PROMO, GAIN_DIFF_DEFAUT } from '../hypothesesRendement';

describe('Constantes centralisées (audit C4a)', () => {
  it('plafonds épargne réglementée et PEA lus depuis les JSON', () => {
    expect(PLAFOND_LIVRET_A).toBe(22_950);
    expect(PLAFOND_LDDS).toBe(12_000);
    expect(PLAFOND_LEP).toBe(10_000);
    expect(PLAFOND_VERSEMENTS_PEA).toBe(150_000);
  });

  it('gain Livret+ : parité avec l\'ancienne formule en dur du parser', () => {
    // Ancienne formule : lvPlus × (0.07 − 0.03) × (1 − 0.172) → 10 000 € → 331 €
    expect(Math.round(10_000 * (RDT_LIVRET_PLUS_PROMO - RDT_LIVRET_A) * (1 - TAUX_PS_CAPITAL))).toBe(331);
    expect(GAIN_DIFF_DEFAUT).toBeCloseTo(0.03);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/lib/__tests__/constantes-centralisees.test.js`
Expected: FAIL — imports inexistants.

- [ ] **Step 3: Créer `src/data/epargne-reglementee.json`**

```json
{
  "_meta": {
    "description": "Plafonds de versement de l'épargne réglementée (valeurs légales, arrêtés).",
    "source": "https://www.service-public.fr/particuliers/vosdroits/F2365",
    "note": "Fichier app-local — candidat à une bascule dans paperasse upstream (romainsimon/paperasse)."
  },
  "livret_a": { "plafond_versements": 22950 },
  "ldds":     { "plafond_versements": 12000 },
  "lep":      { "plafond_versements": 10000 }
}
```

- [ ] **Step 4: Créer `src/lib/hypothesesRendement.js`**

```js
// Hypothèses de RENDEMENT (non fiscales) utilisées pour chiffrer les gains
// indicatifs des leviers d'épargne (parser + opportunitiesDetector).
// Centralisées ici pour être ajustées en un seul endroit. Ce ne sont PAS des
// paramètres fiscaux : ceux-là vivent dans src/data/paperasse/ (paperasse-first).

export const RDT_LIVRET_A          = 0.03;   // taux Livret A / LDDS
export const RDT_LIVRET_PLUS_PROMO = 0.07;   // livret bancaire « boosté » (promo) — gain différentiel parser

// Gains DIFFÉRENTIELS nets estimés vs livret bancaire ~1,5 % (déjà nettés,
// valeurs historiques du detector — comportement inchangé) :
export const GAIN_DIFF_LDDS   = 0.015;  // 3 % vs ~1,5 %
export const GAIN_DIFF_LEP    = 0.035;  // ~5 % vs ~1,5 %
export const GAIN_DIFF_AV_LT  = 0.028;  // AV multisupport ~4 % net long terme
export const GAIN_DIFF_PEA_LT = 0.045;  // PEA ETF Monde ~6 % long terme, net estimé
export const GAIN_DIFF_DEFAUT = 0.03;   // surplus non alloué (AV/PEA selon profil)
```

- [ ] **Step 5: Exports dans taxCalculator.js**

En haut du fichier, après l'import `transmissionRaw`, ajouter :

```js
import peaAvRaw          from '../data/paperasse/fiscaliste/data/pea-assurance-vie.json';
import epargneRegRaw     from '../data/epargne-reglementee.json';
```

Après le bloc d'exports PASS/PER (~ligne 92), ajouter :

```js
// ─── Plafonds épargne réglementée & PEA (depuis les JSON) ─────────────────────
export const PLAFOND_LIVRET_A       = epargneRegRaw.livret_a.plafond_versements;
export const PLAFOND_LDDS           = epargneRegRaw.ldds.plafond_versements;
export const PLAFOND_LEP            = epargneRegRaw.lep.plafond_versements;
export const PLAFOND_VERSEMENTS_PEA = peaAvRaw.pea_classique.plafond_versements;
```

Dans `baseIRFoyer` (~ligne 1214), remplacer :

```js
  const foncier = (p.revensFonciers || 0) * (p.regimeFoncier === 'reel' ? 1 : 0.70);
```

par :

```js
  const foncier = (p.revensFonciers || 0) * (p.regimeFoncier === 'reel' ? 1 : 1 - ABATTEMENT_MICRO_FONCIER);
```

- [ ] **Step 6: profileParser.js**

Remplacer l'import ligne 2 :

```js
import { getTMI, abattement10Auto } from './taxCalculator';
```

par :

```js
import { getTMI, abattement10Auto, TAUX_PS_CAPITAL, PLAFOND_LIVRET_A, PLAFOND_VERSEMENTS_PEA } from './taxCalculator';
import { RDT_LIVRET_A, RDT_LIVRET_PLUS_PROMO } from './hypothesesRendement';
```

Remplacer (lignes ~226-231) :

```js
    [`peaEspace${sfx}`]:            peaVal > 0 ? Math.max(0, 150_000 - (peaVerse || peaVal)) : 150_000,
    [`livretAExceeds${sfx}`]:       (ep[`livretA${sfx}`] || 0) > 22_950,
    [`livretPlusGainAnnuel${sfx}`]: Math.round(lvPlus * (0.07 - 0.03) * (1 - 0.172)),
```

par :

```js
    [`peaEspace${sfx}`]:            peaVal > 0 ? Math.max(0, PLAFOND_VERSEMENTS_PEA - (peaVerse || peaVal)) : PLAFOND_VERSEMENTS_PEA,
    [`livretAExceeds${sfx}`]:       (ep[`livretA${sfx}`] || 0) > PLAFOND_LIVRET_A,
    [`livretPlusGainAnnuel${sfx}`]: Math.round(lvPlus * (RDT_LIVRET_PLUS_PROMO - RDT_LIVRET_A) * (1 - TAUX_PS_CAPITAL)),
```

- [ ] **Step 7: opportunitiesDetector.js**

Étendre l'import ligne 4 :

```js
import { calcIR, computePerOptimumCascade, arbitragePfuBareme, calcPvMobiliere, calcCrypto, plafonnementNichesDeuxEtages, TAUX_PS_CAPITAL, PLAFOND_LDDS, PLAFOND_LEP } from './taxCalculator';
import { GAIN_DIFF_LDDS, GAIN_DIFF_LEP, GAIN_DIFF_AV_LT, GAIN_DIFF_PEA_LT, GAIN_DIFF_DEFAUT } from './hypothesesRendement';
```

Remplacements (comportement identique) :
- Ligne 67 : `(foncierNet || 0) * 0.172` → `(foncierNet || 0) * TAUX_PS_CAPITAL`
- Ligne 372 : `const PLAF_LDDS = 12_000 * NB;` → `const PLAF_LDDS = PLAFOND_LDDS * NB;`
- Ligne 373 : `const PLAF_LEP  = 10_000 * NB;` → `const PLAF_LEP  = PLAFOND_LEP * NB;`
- Ligne ~388 : `Math.round(move * 0.015)` → `Math.round(move * GAIN_DIFF_LDDS)`
- Ligne ~396 : `Math.round(move * 0.035)` → `Math.round(move * GAIN_DIFF_LEP)`
- Ligne ~403 : `Math.round(move * 0.028)` → `Math.round(move * GAIN_DIFF_AV_LT)`
- Ligne ~410 : `Math.round(move * 0.045)` → `Math.round(move * GAIN_DIFF_PEA_LT)`
- Ligne ~416 : `Math.round(remaining * 0.03)` → `Math.round(remaining * GAIN_DIFF_DEFAUT)`

- [ ] **Step 8: Vérifier**

Run: `npx vitest run`
Expected: tous PASS (aucun changement numérique — pures substitutions).

- [ ] **Step 9: Commit**

```bash
git add src/data/epargne-reglementee.json src/lib/hypothesesRendement.js src/lib/taxCalculator.js src/lib/profileParser.js src/lib/opportunitiesDetector.js src/lib/__tests__/constantes-centralisees.test.js
git commit -m "fix(paperasse): PS 17,2 %, plafonds épargne/PEA et hypothèses de rendement centralisés (audit C4a)"
```

---

### Task 4: Taux du plafond PER depuis per-plafonds.json (C4b)

**Files:**
- Modify: `src/data/paperasse/fiscaliste/data/per-plafonds.json` (bloc `per_individuel`)
- Modify: `_sources/paperasse/fiscaliste/data/per-plafonds.json` (miroir — vérifier son existence : `ls _sources/paperasse/fiscaliste/data/per-plafonds.json`)
- Modify: `src/lib/taxCalculator.js:90-92` (exports PER), `:1258` (`calcPlafondPer`), `:1292` (`computePlafondPERDeclarant`)
- Test: étendre `src/lib/__tests__/constantes-centralisees.test.js`

**Interfaces:**
- Produces: export `TAUX_PLAFOND_PER` (number, 0.10).

- [ ] **Step 1: Test qui échoue** — ajouter dans `constantes-centralisees.test.js` :

```js
import { TAUX_PLAFOND_PER, computePlafondPERDeclarant, MIN_PLAFOND_PER } from '../taxCalculator';

describe('Taux plafond PER depuis per-plafonds.json (audit C4b)', () => {
  it('taux 10 % lu depuis le JSON', () => {
    expect(TAUX_PLAFOND_PER).toBe(0.10);
  });
  it('plafond PER : parité avec l\'ancien calcul ×0,1', () => {
    const r = computePlafondPERDeclarant({ rni: 50_000 });
    expect(r.brut10).toBe(5_000);
    expect(r.plafondBrut).toBe(Math.max(5_000, MIN_PLAFOND_PER));
  });
});
```

Run: `npx vitest run src/lib/__tests__/constantes-centralisees.test.js` → FAIL (`TAUX_PLAFOND_PER` non exporté).

- [ ] **Step 2: Éditer les DEUX JSON** — dans `per-plafonds.json` (les deux copies), dans le bloc `"per_individuel"`, ajouter juste avant `"plancher_euros"` :

```json
    "taux_calcul": 0.10,
```

(clé au même niveau que `plancher_euros` / `plafond_absolu_euros` ; garder un JSON valide — virgules).

- [ ] **Step 3: Lire le champ** — dans `taxCalculator.js`, sous les exports PER existants (~ligne 92), ajouter :

```js
export const TAUX_PLAFOND_PER = perRaw.per_individuel.taux_calcul;   // 10 % du RNI (art. 163 quatervicies)
```

Puis remplacer les deux occurrences :
- ligne ~1258 : `const brut       = base > 0 ? Math.round(base * 0.1) : 0;` → `const brut       = base > 0 ? Math.round(base * TAUX_PLAFOND_PER) : 0;`
- ligne ~1292 : `const brut10      = rni > 0 ? Math.round(rni * 0.1) : 0;` → `const brut10      = rni > 0 ? Math.round(rni * TAUX_PLAFOND_PER) : 0;`

- [ ] **Step 4: Vérifier** — `npx vitest run` → tous PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/paperasse/fiscaliste/data/per-plafonds.json _sources/paperasse/fiscaliste/data/per-plafonds.json src/lib/taxCalculator.js src/lib/__tests__/constantes-centralisees.test.js
git commit -m "fix(paperasse): taux 10 % du plafond PER lu depuis per-plafonds.json (audit C4b)"
```

---

### Task 5: Simulateur d'enveloppes — PFU/PS/abattements AV depuis les JSON (C4c)

`src/lib/simulator/calc.js` code en dur : `0.172` (PS), `0.30` (PFU total), `0.128` (PFU IR), `4_600`/`9_200` (abattements AV 8 ans), `150_000` (seuil primes AV), `0.075` (taux IR réduit AV). Les abattements existent déjà en champs machine dans `pea-assurance-vie.json` ; le taux 7,5 % et le seuil 150 k n'y sont qu'en prose → ajouter des champs machine.

**Files:**
- Modify: `src/data/paperasse/fiscaliste/data/pea-assurance-vie.json` (bloc `assurance_vie_rachats`)
- Modify: `_sources/paperasse/fiscaliste/data/pea-assurance-vie.json` (miroir)
- Modify: `src/lib/taxCalculator.js` (4 nouveaux exports AV)
- Modify: `src/lib/simulator/calc.js` (import + substitutions)
- Test: `src/lib/simulator/calc.test.js` (existant — doit rester vert) + extension `constantes-centralisees.test.js`

**Interfaces:**
- Produces (exports `taxCalculator.js`) : `AV_ABATTEMENT_8ANS_SOLO` (4600), `AV_ABATTEMENT_8ANS_COUPLE` (9200), `AV_TAUX_IR_APRES_8ANS` (0.075), `AV_SEUIL_PRIMES_TAUX_REDUIT` (150000).

- [ ] **Step 1: Test qui échoue** — ajouter dans `constantes-centralisees.test.js` :

```js
import {
  AV_ABATTEMENT_8ANS_SOLO, AV_ABATTEMENT_8ANS_COUPLE,
  AV_TAUX_IR_APRES_8ANS, AV_SEUIL_PRIMES_TAUX_REDUIT,
} from '../taxCalculator';

describe('Assurance-vie rachats depuis pea-assurance-vie.json (audit C4c)', () => {
  it('abattements, taux réduit et seuil 150 k en champs machine', () => {
    expect(AV_ABATTEMENT_8ANS_SOLO).toBe(4_600);
    expect(AV_ABATTEMENT_8ANS_COUPLE).toBe(9_200);
    expect(AV_TAUX_IR_APRES_8ANS).toBe(0.075);
    expect(AV_SEUIL_PRIMES_TAUX_REDUIT).toBe(150_000);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Éditer les DEUX JSON** — dans `pea-assurance-vie.json`, bloc `"assurance_vie_rachats"`, ajouter juste après la ligne d'ouverture du bloc (au même niveau que `abattement_annuel_apres_8_ans`) :

```json
    "taux_ir_pfl_apres_8_ans": 0.075,
    "seuil_primes_nettes_taux_reduit": 150000,
```

- [ ] **Step 3: Exports** — dans `taxCalculator.js`, sous les exports PEA de la Tâche 3 :

```js
export const AV_ABATTEMENT_8ANS_SOLO    = peaAvRaw.assurance_vie_rachats.abattement_annuel_apres_8_ans.celibataire_veuf_divorce;
export const AV_ABATTEMENT_8ANS_COUPLE  = peaAvRaw.assurance_vie_rachats.abattement_annuel_apres_8_ans.couple_imposition_commune;
export const AV_TAUX_IR_APRES_8ANS      = peaAvRaw.assurance_vie_rachats.taux_ir_pfl_apres_8_ans;
export const AV_SEUIL_PRIMES_TAUX_REDUIT = peaAvRaw.assurance_vie_rachats.seuil_primes_nettes_taux_reduit;
```

- [ ] **Step 4: Substitutions dans calc.js**

En tête de `src/lib/simulator/calc.js` :

```js
import {
  TAUX_PS_CAPITAL, PFU_TAUX_IR,
  AV_ABATTEMENT_8ANS_SOLO, AV_ABATTEMENT_8ANS_COUPLE,
  AV_TAUX_IR_APRES_8ANS, AV_SEUIL_PRIMES_TAUX_REDUIT,
} from '../taxCalculator';

// 0.128 + 0.172 = 0.30000000000000004 en flottant → arrondi à 3 décimales pour
// conserver exactement les résultats historiques (0.30).
const PFU_TOTAL = Math.round((PFU_TAUX_IR + TAUX_PS_CAPITAL) * 1000) / 1000;
```

Puis lister TOUTES les occurrences à remplacer : `grep -n "0\.172\|0\.30\|0\.128\|4_600\|9_200\|150_000\|0\.075" src/lib/simulator/calc.js`
Substitutions (dans `envelope()` et toute autre fonction du fichier) :
- `0.172` → `TAUX_PS_CAPITAL`
- `0.30` (taux PFU, PAS le `tmiEntree` d'exemple JSDoc) → `PFU_TOTAL`
- `0.128` → `PFU_TAUX_IR`
- `couple ? 9_200 : 4_600` → `couple ? AV_ABATTEMENT_8ANS_COUPLE : AV_ABATTEMENT_8ANS_SOLO`
- `150_000` → `AV_SEUIL_PRIMES_TAUX_REDUIT`
- `0.075` → `AV_TAUX_IR_APRES_8ANS`

⚠️ Ne PAS toucher aux exemples de JSDoc (`0.30 = 30 %`) ni aux taux de rendement passés en paramètres.

- [ ] **Step 5: Vérifier** — `npx vitest run src/lib/simulator/calc.test.js` puis `npx vitest run` → tous PASS (résultats numériquement identiques grâce à l'arrondi de `PFU_TOTAL`).

- [ ] **Step 6: Commit**

```bash
git add src/data/paperasse/fiscaliste/data/pea-assurance-vie.json _sources/paperasse/fiscaliste/data/pea-assurance-vie.json src/lib/taxCalculator.js src/lib/simulator/calc.js src/lib/__tests__/constantes-centralisees.test.js
git commit -m "fix(paperasse): simulateur d'enveloppes branché sur les JSON PFU/PS/AV (audit C4c)"
```

---

### Task 6: Abattement 10 % pensions sur les rentes 1BS (C3) — **changement de comportement volontaire**

Le parser approxime `rente × 0,9`, ignorant le plancher 450 € et le plafond **4 446 € par foyer** (art. 158-5-a CGI). On applique `abattement10Pension` avec plafond foyer partagé D1→D2. Les valeurs médianes (ex. rente 6 192 € du profil de référence) sont inchangées ; seuls les cas < 4 500 € et > 44 460 € changent (c'est la correction).

**Files:**
- Modify: `src/lib/profileParser.js:2` (import) et `:89-102` (`_rni`)
- Test: `src/lib/__tests__/rente-abattement.test.js` (create)

**Interfaces:**
- Consumes: `abattement10Pension(pension)` → RNI après abattement (existant), `ABT_PENSION.maximum` (4 446).
- Produces: `_rni` inchangé en signature (privé) ; `parsedProfile.rniD1/rniD2/rniFoyer` corrigés aux bornes.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/__tests__/rente-abattement.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseProfile } from '../profileParser';

const REF = readFileSync(
  fileURLToPath(new URL('./fixtures/profil-fiscal-ref.txt', import.meta.url)), 'utf8',
);

// Supprime toutes les lignes "RNI …" du profil pour forcer le parser à
// RECALCULER le RNI depuis les composantes (sinon il lit les totaux du texte).
const sansLignesRni = (t) => t.replace(/^.*\bRNI\b.*$/gm, '');
// Remplace le montant de la rente 1BS (6 192 € dans la fixture, espace normal
// ou fine insécable, avec ou sans décimales).
const avecRente = (montant) =>
  sansLignesRni(REF).replace(/6[\s ]?192(?:,00)?/g, montant);

describe('Abattement 10 % pensions sur rente 1BS — plancher 450 € / plafond 4 446 € foyer (audit C3)', () => {
  it('plafond : rente 60 000 € → contribution RNI 55 554 € (abattement plafonné à 4 446 €)', () => {
    const p0 = parseProfile(avecRente('0'));
    const p6 = parseProfile(avecRente('60 000'));
    expect(p6.rniD2 - p0.rniD2).toBe(55_554);   // ancien code : 54 000 (×0,9)
  });

  it('plancher : rente 3 000 € → contribution RNI 2 550 € (abattement plancher 450 €)', () => {
    const p0 = parseProfile(avecRente('0'));
    const p3 = parseProfile(avecRente('3 000'));
    expect(p3.rniD2 - p0.rniD2).toBe(2_550);    // ancien code : 2 700 (×0,9)
  });

  it('zone médiane : rente 6 192 € → contribution 5 573 € (identique à l\'ancien calcul)', () => {
    const p0 = parseProfile(avecRente('0'));
    const p6 = parseProfile(avecRente('6 192'));
    expect(p6.rniD2 - p0.rniD2).toBe(5_573);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/lib/__tests__/rente-abattement.test.js`
Expected: FAIL sur les cas plafond (54 000 ≠ 55 554) et plancher (2 700 ≠ 2 550) ; le cas médian passe déjà.
*(Si le cas médian échoue aussi, le remplacement regex ne matche pas la fixture — vérifier avec `grep -n "6 192" src/lib/__tests__/fixtures/profil-fiscal-ref.txt` et ajuster la regex, PAS la fixture.)*

- [ ] **Step 3: Corriger le parser**

Dans `src/lib/profileParser.js`, remplacer l'import (déjà modifié en Tâche 3) :

```js
import { getTMI, abattement10Auto, TAUX_PS_CAPITAL, PLAFOND_LIVRET_A, PLAFOND_VERSEMENTS_PEA } from './taxCalculator';
```

par :

```js
import { getTMI, abattement10Auto, abattement10Pension, ABT_PENSION, TAUX_PS_CAPITAL, PLAFOND_LIVRET_A, PLAFOND_VERSEMENTS_PEA } from './taxCalculator';
```

Dans `_rni`, remplacer :

```js
  const renteAbatD1 = Math.round((pd.rente1BsD1 || 0) * 0.9);
  const renteAbatD2 = Math.round((pd.rente1BsD2 || 0) * 0.9);
```

par :

```js
  // Abattement 10 % pensions sur les rentes 1BS : plancher 450 €, plafond
  // 4 446 € PAR FOYER (art. 158-5-a CGI) — paramètres ABT_PENSION (JSON barème).
  // Le plafond foyer est consommé par D1 puis D2 (jamais 2 × 4 446 €).
  // Limite connue : le plafond foyer n'est pas mutualisé avec les pensions 1AS
  // traitées par abattement10Auto (cas mixte rare — voir audit §2.3).
  const renteD1 = pd.rente1BsD1 || 0;
  const renteD2 = pd.rente1BsD2 || 0;
  const abatD1  = renteD1 - abattement10Pension(renteD1);
  const abatD2  = Math.max(0, Math.min(renteD2 - abattement10Pension(renteD2), ABT_PENSION.maximum - abatD1));
  const renteAbatD1 = renteD1 - abatD1;
  const renteAbatD2 = renteD2 - abatD2;
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run src/lib/__tests__/rente-abattement.test.js` → PASS.
Run: `npx vitest run` → tous PASS. *(La fixture de référence utilise 6 192 € — zone médiane, valeurs inchangées : `profileParser.test.js` doit rester vert. S'il casse, STOP : analyser avant de modifier quoi que ce soit.)*

- [ ] **Step 5: Commit**

```bash
git add src/lib/profileParser.js src/lib/__tests__/rente-abattement.test.js
git commit -m "fix(parser): abattement pensions 1BS avec plancher 450 € et plafond foyer 4 446 € (audit C3)"
```

---

### Task 7: Test d'architecture anti-hardcode (E8)

Maintenant que les Tâches 1-6 ont éliminé les littéraux, on verrouille : un test échoue si un littéral fiscal réapparaît dans `src/lib` ou `src/plugins`.

**Files:**
- Test: `src/lib/__tests__/paperasse-first.test.js` (create)

- [ ] **Step 1: Écrire le test (il doit passer immédiatement — c'est un verrou, pas du TDD)**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Règle paperasse-first : aucun littéral fiscal en dur dans le code.
// Les valeurs vivent dans src/data/paperasse/*.json (ou src/data/*.json) et
// sont exposées par taxCalculator.js. Ce test échoue si l'un des littéraux
// ci-dessous réapparaît dans src/lib ou src/plugins.

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOTS = [join(__dir, '..'), join(__dir, '../../plugins')];

// Fichiers exclus : tests, fixtures, et le module d'hypothèses de rendement
// (constantes NON fiscales, documentées comme telles).
const EXCLUDE = /__tests__|\.test\.js$|hypothesesRendement\.js$/;

const FORBIDDEN = [
  { re: /0\.4525/,                    why: 'taux de décote → bareme-ir JSON (decote.taux)' },
  { re: /0\.172\b/,                   why: 'PS capital → TAUX_PS_CAPITAL (pfu-prelevements-sociaux.json)' },
  { re: /\b(?:250_000|500_000|1_000_000)\b/, why: 'seuils CEHR → bareme-ir JSON (cehr)' },
  { re: /\*\s*0\.9\b/,                why: 'abattement pension approximé → abattement10Pension()' },
  { re: /\b22_?950\b/,                why: 'plafond Livret A → PLAFOND_LIVRET_A (epargne-reglementee.json)' },
  { re: /\b150_000\b/,                why: 'plafond PEA / seuil AV → PLAFOND_VERSEMENTS_PEA / AV_SEUIL_PRIMES_TAUX_REDUIT' },
  { re: /\b(?:4_600|9_200)\b/,        why: 'abattements AV 8 ans → AV_ABATTEMENT_8ANS_* (pea-assurance-vie.json)' },
  { re: /\b0\.075\b/,                 why: 'taux IR AV après 8 ans → AV_TAUX_IR_APRES_8ANS' },
];

function jsFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFilesUnder(p));
    else if (p.endsWith('.js') && !EXCLUDE.test(p)) out.push(p);
  }
  return out;
}

describe('Paperasse-first — aucun littéral fiscal en dur (audit E8)', () => {
  const files = ROOTS.flatMap(jsFilesUnder);

  it('scanne bien les sources (sanity check)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const { re, why } of FORBIDDEN) {
    it(`interdit ${re} — ${why}`, () => {
      const hits = files
        .filter(f => re.test(readFileSync(f, 'utf8')))
        .map(f => relative(process.cwd(), f));
      expect(hits, `Littéral fiscal en dur (${why}) dans : ${hits.join(', ')}`).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Exécuter**

Run: `npx vitest run src/lib/__tests__/paperasse-first.test.js`
Expected: PASS. **Si un pattern échoue** : c'est un littéral oublié par les Tâches 1-6 → le corriger (même recette : export depuis taxCalculator), PAS assouplir le test. Exception acceptable : un littéral dans un **commentaire** explicatif — reformuler le commentaire (ex. « 4 446 € » → « plafond foyer ABT_PENSION »).

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/paperasse-first.test.js
git commit -m "test(architecture): verrou anti-hardcode paperasse-first (audit E8)"
```

---

### Task 8: Garde-fou PDF scanné sans couche texte (C5)

Un PDF scanné (image pure) ne donne aucun mot à `extractWordsWithPositions` → rien n'est masqué → le document partirait **en clair** vers l'API vision. On bloque le traitement avec une erreur explicite.

**Files:**
- Modify: `src/lib/anonymizer.js` (nouvelle fonction exportée + appel dans `anonymizePdf` après l'extraction)
- Modify: `src/pages/Anonymize.jsx` (2 blocs `catch` — lignes ~369-373 et ~400-404)
- Test: `src/lib/__tests__/anonymizer-scanned.test.js` (create)

**Interfaces:**
- Produces: `assertTextLayer(pages)` → number (nombre de mots) ; lève `Error` avec `err.code = 'NO_TEXT_LAYER'` si 0 mot. `pages` = sortie de `extractWordsWithPositions` : `Array<{ lines: Array<Array<{text,...}>> }>`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/__tests__/anonymizer-scanned.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { assertTextLayer } from '../anonymizer';

describe('Garde-fou PDF scanné — aucune couche texte (audit C5)', () => {
  it('lève NO_TEXT_LAYER quand aucune page ne contient de mot', () => {
    expect(() => assertTextLayer([{ lines: [] }, { lines: [[]] }])).toThrowError(/scanné/);
    let code = null;
    try { assertTextLayer([{ lines: [] }]); } catch (e) { code = e.code; }
    expect(code).toBe('NO_TEXT_LAYER');
  });

  it('retourne le nombre de mots quand il y a du texte', () => {
    expect(assertTextLayer([
      { lines: [[{ text: 'a' }], [{ text: 'b' }, { text: 'c' }]] },
    ])).toBe(3);
  });
});
```

Run: `npx vitest run src/lib/__tests__/anonymizer-scanned.test.js` → FAIL (fonction inexistante).

- [ ] **Step 2: Implémenter dans anonymizer.js**

Ajouter (au-dessus de `anonymizePdf`) :

```js
/**
 * Garde-fou anti-fuite : un PDF sans couche texte (scan, photo) ne peut pas
 * être anonymisé par détection de zones — rien ne serait masqué et le document
 * partirait EN CLAIR vers l'API vision. On refuse le traitement.
 *
 * @param {Array<{lines: Array<Array<object>>}>} pages - sortie d'extractWordsWithPositions
 * @returns {number} nombre total de mots extraits
 * @throws {Error} err.code = 'NO_TEXT_LAYER' si aucun mot
 */
export function assertTextLayer(pages) {
  const wordCount = (pages || []).reduce(
    (sum, p) => sum + p.lines.reduce((acc, line) => acc + line.length, 0), 0,
  );
  if (wordCount === 0) {
    const err = new Error(
      "Ce PDF ne contient aucun texte extractible (document scanné ou photo). "
      + "L'anonymisation automatique est impossible : le document N'A PAS été traité. "
      + "Utilisez le PDF d'origine téléchargé en ligne (impots.gouv.fr, espace RH…) "
      + "ou caviardez-le manuellement avant de le déposer.",
    );
    err.code = 'NO_TEXT_LAYER';
    throw err;
  }
  return wordCount;
}
```

Dans `anonymizePdf`, juste après `const pages = await extractWordsWithPositions(file);`, ajouter :

```js
  assertTextLayer(pages);
```

- [ ] **Step 3: Afficher l'erreur clairement dans Anonymize.jsx**

Dans le premier bloc catch (~ligne 369), remplacer :

```js
      } catch (err) {
        setFileItems(prev => prev.map(f =>
          f.id === item.id ? { ...f, status: 'error', error: err?.message || 'Erreur' } : f
        ));
        toast.error(`Échec : ${item.name}`);
      }
```

par :

```js
      } catch (err) {
        setFileItems(prev => prev.map(f =>
          f.id === item.id ? { ...f, status: 'error', error: err?.message || 'Erreur' } : f
        ));
        if (err?.code === 'NO_TEXT_LAYER') toast.error(err.message, { duration: 9000 });
        else toast.error(`Échec : ${item.name}`);
      }
```

Repérer le second appel à `anonymizePdf` (changement de type, ~ligne 384 : `grep -n "anonymizePdf" src/pages/Anonymize.jsx`) et appliquer la même logique dans son `catch` (`toast.error('Échec du changement de type')` → même branche `NO_TEXT_LAYER`).

- [ ] **Step 4: Vérifier**

Run: `npx vitest run src/lib/__tests__/anonymizer-scanned.test.js src/lib/__tests__/anonymizer.test.js` → PASS (les tests existants utilisent des PDF avec texte, non affectés).
Run: `npx vitest run` → tous PASS.
Vérification manuelle (optionnelle) : `npm run dev`, déposer une image scannée convertie en PDF sur /anonymize → toast d'erreur explicite, statut rouge.

- [ ] **Step 5: Commit**

```bash
git add src/lib/anonymizer.js src/pages/Anonymize.jsx src/lib/__tests__/anonymizer-scanned.test.js
git commit -m "feat(anonymize): garde-fou PDF scanné sans couche texte, refus explicite (audit C5)"
```

---

### Task 9: Garde-fou concubinage à l'étape 0 (C6)

Le mode « Couple » signifie *imposition commune* (mariage/PACS). Un couple en union libre qui le coche obtient un calcul silencieusement faux. On le dit explicitement au moment du choix.

**Files:**
- Modify: `src/pages/Setup.jsx:17-20` (labels `MODES`) et ~ligne 356 (après la grille `MODES.map`)

- [ ] **Step 1: Préciser les libellés**

Remplacer :

```js
const MODES = [
  { value: 'solo',   label: 'Célibataire', sub: 'Une déclaration', Icon: User },
  { value: 'couple', label: 'Couple',      sub: 'PACS ou mariage', Icon: Users },
];
```

par :

```js
const MODES = [
  { value: 'solo',   label: 'Célibataire', sub: 'Une déclaration (dont concubinage)', Icon: User },
  { value: 'couple', label: 'Couple',      sub: 'Marié·e·s ou pacsé·e·s uniquement',  Icon: Users },
];
```

- [ ] **Step 2: Ajouter la note conditionnelle sous la grille**

Afficher le bloc autour de la grille : `sed -n 355,420p src/pages/Setup.jsx`. Repérer la fermeture du `<div className="grid grid-cols-2 gap-3">` (le `</div>` qui suit la fin du `MODES.map(...)}`). Insérer **immédiatement après ce `</div>`** :

```jsx
              {mode === 'couple' && (
                <p className="mt-3 text-xs text-ink-200 leading-relaxed rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5">
                  <strong className="text-amber-300">« Couple » = marié·e·s ou pacsé·e·s</strong> (déclaration
                  commune). En concubinage (union libre), chaque partenaire fait sa propre
                  déclaration : choisissez « Célibataire » et créez un profil par personne —
                  sinon le calcul d'impôt serait faux.
                </p>
              )}
```

- [ ] **Step 3: Vérifier**

Run: `npx eslint src/pages/Setup.jsx` → pas de nouvelle erreur.
Run: `npm run dev` → sur /setup, sélectionner « Couple » → la note ambre apparaît ; « Célibataire » → elle disparaît.
Run: `npx vitest run` → tous PASS (aucun test UI existant).

- [ ] **Step 4: Commit**

```bash
git add src/pages/Setup.jsx
git commit -m "feat(setup): garde-fou concubinage — couple = imposition commune uniquement (audit C6)"
```

---

### Task 10: Lint vert + CI GitHub Actions (E1)

État actuel : 151 erreurs ESLint, dont ~113 dans `_sources/paperasse/` (dépôt cloné, scripts Node lintés avec globals navigateur) et 31 réelles dans `src/` + `scripts/`. On nettoie, puis on met la CI.

**Files:**
- Modify: `eslint.config.js`
- Modify: fichiers listés par ESLint (~31 erreurs : `scripts/update-bareme.js`, `src/context/AppContext.jsx`, `src/lib/profileParserUtils.js`, pages diverses)
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Ignorer les sources externes et donner les globals Node aux scripts**

Remplacer le contenu de `eslint.config.js` par :

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist = build ; _sources = clones externes (paperasse) non lintés ici.
  globalIgnores(['dist', '_sources']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Scripts d'outillage exécutés par Node (update-bareme, syncs).
    files: ['scripts/**/*.js', 'vitest.setup.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests Vitest : env Node (fs, path, process).
    files: ['src/**/__tests__/**/*.js', 'src/**/*.test.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
])
```

- [ ] **Step 2: Lister puis corriger les erreurs restantes**

Run: `npx eslint . 2>&1 | tail -3` — noter le nombre restant, puis `npx eslint .` pour le détail. Recettes par règle :
- `no-unused-vars` : supprimer la variable/l'import ; si elle est volontairement ignorée (destructuring), la préfixer `_` et ajouter à la config du bloc principal : `rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] }`.
- `no-irregular-whitespace` : ce sont des espaces insécables **voulues** dans des chaînes françaises → NE PAS les retirer ; configurer la règle dans le bloc principal : `rules: { 'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipJSXText: true }] }`.
- `no-useless-assignment` : supprimer l'affectation morte (lire le code avant, vérifier qu'elle est réellement inutile).
- `react-hooks/rules-of-hooks` (1 occurrence) : lire l'erreur — hook appelé conditionnellement. Remonter l'appel du hook avant la condition. **Si le fix n'est pas évident, STOP et demander une revue plutôt que de forcer.**
- `react-refresh/only-export-components` (1) : déplacer l'export non-composant dans un fichier `.js` voisin, ou ajouter la règle en `warn` pour ce fichier si le déplacement casse des imports.
- `no-misleading-character-class` (1) : regex avec caractère combiné — remplacer la classe par l'alternative suggérée par la doc ESLint (lire l'erreur exacte).

Après chaque lot de corrections : `npx vitest run` (les suppressions d'imports peuvent casser du code vivant — les tests le diront).

- [ ] **Step 3: Vérifier lint vert**

Run: `npm run lint`
Expected: exit 0, `✖ 0 problems` (les warnings résiduels type `exhaustive-deps` sont tolérés : ce sont des `warning`, pas des `error`).

- [ ] **Step 4: Créer le workflow CI**

Créer `.github/workflows/test.yml` :

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Installer les dépendances
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Tests unitaires
        run: npx vitest run
```

- [ ] **Step 5: Vérifier localement puis committer et pousser**

Run: `npm run lint && npx vitest run`
Expected: les deux verts.

```bash
git add eslint.config.js .github/workflows/test.yml <fichiers corrigés au Step 2>
git commit -m "chore(ci): lint vert + workflow GitHub Actions lint+tests (audit E1)"
git push
```

Puis vérifier sur GitHub (onglet Actions) que le run passe au vert.

---

### Task 11: Headers de sécurité Vercel + logs gatés en DEV (E2)

Aucune CSP aujourd'hui : une XSS pourrait exfiltrer la clé API et le profil fiscal (localStorage). Et des `console.log` fuient du contenu (texte de PDF, questions utilisateur) en production.

**Files:**
- Modify: `vercel.json`
- Create: `src/lib/debug.js`
- Modify: `src/lib/anonymizer.js`, `src/lib/skillRouter.js`, `src/lib/complexity.js`, `src/pages/Collect.jsx` (console.log → debug)

- [ ] **Step 1: Créer `src/lib/debug.js`**

```js
// Logs de développement — silencieux en production.
// À utiliser pour tout log contenant du CONTENU (texte de document, question
// utilisateur, profil) : en prod ces données ne doivent jamais toucher la console.
const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export const debug     = DEV ? console.log.bind(console)  : () => {};
export const debugWarn = DEV ? console.warn.bind(console) : () => {};
```

- [ ] **Step 2: Remplacer les logs qui fuient du contenu**

Inventaire : `grep -rn "console\.log" src/lib src/pages src/data --include="*.js" --include="*.jsx"`
Dans chaque fichier concerné (`src/lib/anonymizer.js`, `src/lib/skillRouter.js`, `src/lib/complexity.js`, `src/pages/Collect.jsx`) :
1. Ajouter `import { debug } from './debug';` (depuis `src/pages` : `'../lib/debug'`).
2. Remplacer chaque `console.log(` par `debug(`.

NE PAS toucher : les `console.warn` d'AppContext.jsx (avertissements sécurité volontaires, sans donnée), les `console.warn` de fallback de taxCalculator.js, ni `src/lib/_testAnonymizer.js` (outil de dev exclu du bundle ? vérifier : `grep -rn "_testAnonymizer" src --include="*.jsx"` — s'il n'est importé nulle part, le laisser tel quel).

- [ ] **Step 3: Headers de sécurité dans vercel.json**

Remplacer le contenu de `vercel.json` par :

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.anthropic.com https://api.mistral.ai; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

Justification des directives non triviales : `wasm-unsafe-eval` (pdfjs-dist décode certaines images en WASM), `worker-src blob:` (worker pdf.js), `img-src blob: data:` (aperçus de pages rasterisées), `connect-src` limité aux deux API IA.

- [ ] **Step 4: Vérifier**

Run: `npx vitest run && npm run lint` → verts.
Run: `npm run build && npm run preview` → ouvrir localhost:4173, vérifier que /anonymize (pdf.js) et /chat fonctionnent. *(Note : `vite preview` n'applique PAS les headers vercel.json — le test réel de la CSP se fait sur un déploiement preview Vercel : après push, ouvrir l'URL de preview, DevTools → Console : aucune erreur CSP en naviguant Setup → Anonymize → Collect → Chat. Si pdf.js est bloqué, l'erreur console indique la directive à ajuster.)*
Run: `python3 -c "import json; json.load(open('vercel.json')); print('JSON OK')"`

- [ ] **Step 5: Commit**

```bash
git add vercel.json src/lib/debug.js src/lib/anonymizer.js src/lib/skillRouter.js src/lib/complexity.js src/pages/Collect.jsx
git commit -m "sec(deploy): CSP + headers de sécurité, logs de contenu gatés en DEV (audit E2)"
```

---

## Vérification finale du lot

- [ ] `npx vitest run` → ~710 tests verts (694 initiaux + nouveaux)
- [ ] `npm run lint` → 0 erreur
- [ ] `npm run build` → succès
- [ ] GitHub Actions vert sur le push
- [ ] Mettre à jour `docs/audit-2026-07-complet.md` : cocher C1-C6, E1, E2, E8 (ajouter une ligne « ✅ traité le JJ/MM — commit … » sous chaque item)
- [ ] Mémoire projet : noter l'avancement dans la mémoire `audit-kapio-2026-07`

## Hors périmètre de ce lot (plans séparés à venir)

- **E3** — arbitre 2OP global (dividendes + PV) : logique fiscale nouvelle, son propre plan.
- **E4** — chiffres déterministes injectés dans le prompt chat : touche masterPrompt + Chat + Profile.
- **E5** — reformulation CIF-safe des actions du detector (+ validation avocat).
- **E6** — passe accessibilité Collect + useReducedMotion.
- **E7** — lazy-loading des données skills (chunk 2 Mo).
