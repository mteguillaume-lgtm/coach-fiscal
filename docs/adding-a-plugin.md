# Ajouter un plugin de revenu — guide pratique

> Ce guide est autonome : vous n'avez pas besoin de lire le reste du code pour l'appliquer.  
> Prérequis : connaître l'interface `IncomePlugin` (voir `docs/architecture.md`, Section 2).

---

## Étape 1 — Créer le fichier

Créez `src/plugins/income/mon-plugin.plugin.js`. Le nommage en kebab-case est obligatoire ; l'extension `.plugin.js` est le critère de découverte automatique.

Voici un plugin complet et commenté, fictif mais valide, pour des "revenus de jeux vidéo compétitifs" :

```js
// src/plugins/income/esport.plugin.js
import { n, s } from '../../lib/profileParserUtils.js';

/** @type {import('../types.js').IncomePlugin} */
export default {
  // ── Identité ──────────────────────────────────────────────────────────────
  id: 'esport',                              // unique, kebab-case, jamais modifié
  label: 'Revenus e-sport (BNC assimilés)',  // libellé lisible, affiché dans les logs
  version: '1.0.0',                          // 0.0.1 pour un stub, 1.0.0 pour actif

  // ── Champs formulaire ─────────────────────────────────────────────────────
  // Décrits ici, affichés dans Collect.jsx via pluginFields(['esport'])
  fields: [
    {
      key: 'esport_brut',          // clé dans formData
      label: 'Gains e-sport bruts (€)',
      type: 'number',
      required: false,
      declarant: 'D1',             // 'D1' | 'D2' | 'foyer' | null
    },
    {
      key: 'esport_charges',
      label: 'Charges déductibles (€)',
      type: 'number',
      required: false,
      declarant: 'D1',
    },
  ],

  // ── Parser : TXT → objet partiel v1 ──────────────────────────────────────
  parser(text, mode) {
    // Toujours extraire depuis la bonne section (voir Étape 2)
    const sec = mode === 'couple'
      ? text.match(/== REVENUS E-SPORT — DÉCLARANT 1 ==([\s\S]*?)(?:==|$)/)?.[1] ?? ''
      : text.match(/== REVENUS E-SPORT ==([\s\S]*?)(?:==|$)/)?.[1] ?? '';

    return {
      esportBrutD1:    n(sec, /Gains e-sport bruts\s*:\s*([\d\s,]+)\s*€/i),
      esportChargesD1: n(sec, /Charges déductibles\s*:\s*([\d\s,]+)\s*€/i),
    };
  },

  // ── Generator : formData → fragment TXT ──────────────────────────────────
  generator(formData, d1Data /*, d2Data, mode */) {
    const d1 = d1Data || {};
    const brut = parseFloat(d1.esport_brut || 0);
    if (!brut) return '';                     // retourner '' si rien à écrire
    const charges = parseFloat(d1.esport_charges || 0);
    const net = Math.max(0, brut - charges);
    return [
      '== REVENUS E-SPORT ==',               // en-tête de section
      `Gains e-sport bruts : ${brut.toLocaleString('fr-FR')} €`,
      `Charges déductibles : ${charges.toLocaleString('fr-FR')} €`,
      `Net imposable e-sport : ${net.toLocaleString('fr-FR')} €`,
    ].join('\n');
  },

  // ── Validator : vérifications avant génération ────────────────────────────
  validator(formData) {
    const errors = [];
    const brut = parseFloat(formData?.esport_brut);
    if (formData?.esport_brut && (isNaN(brut) || brut < 0)) {
      errors.push({ field: 'esport_brut', message: 'Montant invalide (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },

  // ── Calculator : v1 → grandeurs dérivées ─────────────────────────────────
  calculator(v1) {
    const brut    = v1.esportBrutD1 || 0;
    const charges = v1.esportChargesD1 || 0;
    const net     = Math.max(0, brut - charges);
    return {
      esportNetD1: net,
      esportPsD1:  Math.round(net * 0.172),  // prélèvements sociaux 17,2 %
    };
  },

  // ── Cases déclaratives 2042 ───────────────────────────────────────────────
  declarativeCases() {
    return [
      { caseCode: '5HQ', label: 'BNC e-sport D1', declarant: 'D1', required: false },
    ];
  },
};
```

---

## Étape 2 — Parser : lire les sections TXT

### Convention de nommage des sections

Le TXT profil délimite les sections avec `==` :

```
== REVENUS 2025 — DÉCLARANT 1 ==
Net imposable annuel (1AJ — case déclaration) : 45 162 €

== REVENUS 2025 — DÉCLARANT 2 ==
Net imposable annuel (1BJ — case déclaration) : 29 283 €
```

Utilisez le helper `section()` de `profileParserUtils.js` pour extraire une section :

```js
import { n, f, s, section } from '../../lib/profileParserUtils.js';

const sec = section(text, '== REVENUS E-SPORT ==');
const brut = n(sec, /Gains e-sport bruts\s*:\s*([\d\s,]+)\s*€/i);
```

### Gestion des espaces insécables

Les fichiers profil peuvent contenir des espaces insécables (` `, U+202F) dans les montants : `45 162 €`. Les helpers `n()`, `f()` les gèrent automatiquement. Dans vos regex personnalisées, remplacez `\s` par `[\s ]` si vous parsez manuellement.

### Helpers disponibles dans `profileParserUtils.js`

| Helper | Usage |
|---|---|
| `n(text, regex)` | Extrait un entier (retire espaces/virgules, `parseInt`) |
| `f(text, regex)` | Extrait un flottant (`parseFloat`, virgule → point) |
| `s(text, regex)` | Extrait une chaîne (`.trim()`) |
| `oui(text, regex)` | Retourne `true` si la capture contient "oui" |
| `signed(text, regex)` | Entier pouvant être négatif |
| `section(text, header)` | Extrait le bloc après `header` jusqu'au prochain `==` |

---

## Étape 3 — Generator : produire le TXT

### Règles de format

- Chaque section commence par `== NOM SECTION ==` (majuscules, espaces autour des `==`).
- Les montants s'écrivent `X €` avec le séparateur milliers français : `1 234 €`.
- Les cases fiscales s'écrivent `Case 1AJ : X €` (majuscules, espace avant `:`).
- Retournez `''` (chaîne vide) si le plugin n'a rien à écrire — ne retournez jamais `null` ou `undefined`.

### Exemple de sortie correcte

```
== REVENUS E-SPORT ==
Gains e-sport bruts : 3 500 €
Charges déductibles : 800 €
Net imposable e-sport : 2 700 €
Case 5HQ : 2 700 €
```

---

## Étape 4 — Calculator : accès au contexte global

Le `calculator` reçoit l'objet v1 complet (profil parsé), pas seulement les champs du plugin. Vous pouvez accéder au contexte fiscal global :

```js
calculator(v1) {
  const tmi    = v1.tmi || 0;           // tranche marginale d'imposition (11, 30, 41, 45)
  const parts  = v1.parts || 1;         // quotient familial
  const rni    = v1.rniFoyer || 0;      // revenu net imposable du foyer
  const net    = v1.esportNetD1 || 0;

  // Exemple : calculer l'impact marginal au TMI
  const impactIr = Math.round(net * (tmi / 100));
  return { esportImpactIr: impactIr };
},
```

Pour les calculs complexes (barèmes IR, abattements), importez `taxCalculator.js` :

```js
import { abattement10Auto, getTMI } from '../../lib/taxCalculator.js';
```

---

## Étape 5 — Tester

Créez `src/plugins/income/__tests__/esport.test.js` en suivant ce template :

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../esport.plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));
// Utilisez le profil de référence OU créez un TXT minimal pour votre plugin
const REF = readFileSync(
  resolve(__dir, '../../../lib/__tests__/fixtures/profil-fiscal-ref.txt'),
  'utf-8'
);

describe('esport.plugin — parser', () => {
  it('retourne 0 si le profil de référence ne contient pas de revenus e-sport', () => {
    const result = plugin.parser(REF, 'couple');
    expect(result.esportBrutD1).toBe(0);
  });

  it('parse correctement un TXT minimal', () => {
    const txt = '== REVENUS E-SPORT ==\nGains e-sport bruts : 3 500 €\n';
    const result = plugin.parser(txt, 'solo');
    expect(result.esportBrutD1).toBe(3500);
  });
});

describe('esport.plugin — calculator', () => {
  it('PS = round(net × 17,2%)', () => {
    const result = plugin.calculator({ esportBrutD1: 3500, esportChargesD1: 800 });
    // esportNetD1 = 2700, ps = round(2700 × 0.172) = 464
    expect(result.esportPsD1).toBe(464);
  });
});

describe('esport.plugin — round-trip (obligatoire)', () => {
  it('generator → parser → mêmes valeurs', () => {
    const formData = {};
    const d1Data   = { esport_brut: '3500', esport_charges: '800' };
    const txt      = plugin.generator(formData, d1Data);
    const parsed   = plugin.parser(txt, 'solo');
    expect(parsed.esportBrutD1).toBe(3500);
    expect(parsed.esportChargesD1).toBe(800);
  });
});

describe('esport.plugin — validator', () => {
  it('valid = true si vide (champ facultatif)', () => {
    expect(plugin.validator({}).valid).toBe(true);
  });

  it('valid = false si montant négatif', () => {
    expect(plugin.validator({ esport_brut: '-100' }).valid).toBe(false);
  });
});

describe('esport.plugin — declarativeCases', () => {
  it('contient 5HQ', () => {
    const codes = plugin.declarativeCases().map(c => c.caseCode);
    expect(codes).toContain('5HQ');
  });
});
```

---

## Checklist finale (à reproduire dans chaque PR de sprint)

Avant de soumettre un nouveau plugin :

- [ ] `id` unique vérifié contre `registry.getAll().map(p => p.id)`
- [ ] Interface complète : 8 propriétés (`id`, `label`, `version`, `fields`, `parser`, `generator`, `validator`, `calculator`, `declarativeCases`)
- [ ] `version` à `1.0.0` (pas `0.0.1`)
- [ ] Round-trip test qui passe : `generator → parser → mêmes valeurs`
- [ ] `validator` couvre au minimum : montant négatif, champ manquant si `required: true`
- [ ] `declarativeCases()` liste toutes les cases 2042 gérées
- [ ] `docs/coverage.md` mis à jour avec le nouveau revenu couvert
- [ ] `docs/baremes-2025.md` enrichi si le plugin utilise de nouveaux seuils (plafonds, taux, abattements)
- [ ] `npm test -- --run` → 0 régression sur les tests existants
