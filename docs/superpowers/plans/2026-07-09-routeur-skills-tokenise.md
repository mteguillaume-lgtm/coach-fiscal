# Routeur de skills tokenisé — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `detectRelevantSkills` route par mot entier (tokeniseur + sous-séquence) au lieu de sous-chaînes fragiles, avec un lexique defisc dérivé du JSON et les termes manquants (ifi, cehr, holding) — meilleure pertinence des skills injectés dans le prompt chat, couvert par les premiers tests du routeur.

**Architecture:** Spec validée `docs/superpowers/specs/2026-07-09-routeur-skills-tokenise-design.md`. `tokenize()` + `matchesKeyword()` purs dans skillRouter.js, `SKILL_RULES` nettoyées, `deriveDefiscKeywords()` depuis `DEFISC_DISPOSITIFS`. Périmètre strict : moteur de matching + lexiques.

**Tech Stack:** Vitest (env node), aucune dépendance nouvelle.

## Global Constraints

- **Comportement externe préservé** sur les cas légitimes : gcp toujours actif, fallback fiscaliste, tableau de clés (test le vérifie).
- Périmètre limité au matching + lexiques : `buildSystemPrompt`, `loadSkills`, `debug` NON touchés.
- Le lexique defisc est **dérivé de `DEFISC_DISPOSITIFS`** (paperasse-first) — pas de liste figée en dur.
- Suite verte à chaque commit (767 au départ). Branche `routeur-skills`. Commits `feat(router)`.

---

### Task 1: Tokeniseur + matching + lexiques + tests (TDD)

**Files:**
- Modify: `src/lib/skillRouter.js` (tokenize, matchesKeyword, SKILL_RULES nettoyées, deriveDefiscKeywords, detectRelevantSkills)
- Test: `src/lib/__tests__/skill-router.test.js` (create)

**Interfaces:**
- `detectRelevantSkills(userMessage): string[]` — signature inchangée.
- Nouveaux exports (pour test) : `tokenize(str): string[]`, `deriveDefiscKeywords(): string[]`.

- [ ] **Step 0:** `git checkout -b routeur-skills`

- [ ] **Step 1: Tests qui échouent** — créer `src/lib/__tests__/skill-router.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { detectRelevantSkills, tokenize, deriveDefiscKeywords } from '../skillRouter';
import { DEFISC_DISPOSITIFS } from '../taxCalculator';

const has = (msg, skill) => detectRelevantSkills(msg).includes(skill);

describe('tokenize', () => {
  it('minuscules, accents retirés, découpe ponctuation/tirets', () => {
    expect(tokenize("l'IR. et l'assurance-vie")).toEqual(['l', 'ir', 'et', 'l', 'assurance', 'vie']);
    expect(tokenize('Déduction PER ?')).toEqual(['deduction', 'per']);
  });
});

describe('detectRelevantSkills — word boundaries (audit)', () => {
  it('gcp toujours présent', () => {
    expect(detectRelevantSkills('bonjour')).toContain('gcp');
  });

  it('ir matche « mon IR » mais pas « partir »', () => {
    expect(has('comment calculer mon IR ?', 'fiscaliste')).toBe(true);
    // « je dois partir » ne doit PAS activer un skill via un faux « ir » — fiscaliste
    // reste possible par fallback, donc on teste l'absence de faux positif sur comptable :
    expect(detectRelevantSkills('je dois partir demain')).not.toContain('comptable');
  });

  it('is (comptable) matche « l\'IS » mais pas « je suis »', () => {
    expect(has("l'IS de ma société", 'comptable')).toBe(true);
    expect(has('je suis salarié', 'comptable')).toBe(false);
  });

  it('per matche mon PER / PER ? / PER, mais pas hyperactif', () => {
    expect(has('mon PER', 'fiscaliste')).toBe(true);
    expect(has('PER ?', 'fiscaliste')).toBe(true);
    expect(has('je suis hyperactif', 'comptable')).toBe(false);
  });

  it('dispositifs defisc → fiscaliste (dérivés du JSON)', () => {
    expect(has('investir en Pinel', 'fiscaliste')).toBe(true);
    expect(has('souscrire un FCPI', 'fiscaliste')).toBe(true);
    expect(has('un investissement Girardin outre-mer', 'fiscaliste')).toBe(true);
  });

  it('ajouts ifi/cehr → fiscaliste ; holding → comptable', () => {
    expect(has('suis-je redevable de l\'IFI ?', 'fiscaliste')).toBe(true);
    expect(has('la CEHR sur mes revenus', 'fiscaliste')).toBe(true);
    expect(has('créer une holding', 'comptable')).toBe(true);
  });

  it('tiret = espace : assurance-vie et assurance vie routent pareil', () => {
    expect(detectRelevantSkills('mon assurance-vie')).toEqual(detectRelevantSkills('mon assurance vie'));
    expect(has('mon assurance-vie', 'fiscaliste')).toBe(true);
  });

  it('multi-skills : succession + TVA', () => {
    const r = detectRelevantSkills('ma succession et la TVA de mon activité');
    expect(r).toContain('notaire');
    expect(r).toContain('comptable');
    expect(r).toContain('gcp');
  });

  it('charabia → fallback [gcp, fiscaliste]', () => {
    expect(detectRelevantSkills('azerty qwerty').sort()).toEqual(['fiscaliste', 'gcp']);
  });
});

describe('deriveDefiscKeywords', () => {
  it('contient un token par dispositif du JSON (reste synchro)', () => {
    const kw = deriveDefiscKeywords();
    for (const key of Object.keys(DEFISC_DISPOSITIFS)) {
      const parts = key.split('_').filter(t => t.length >= 3 && t !== 'ir');
      expect(parts.some(t => kw.includes(t))).toBe(true);
    }
  });
});
```

⚠️ Avant d'implémenter, vérifier l'export de `DEFISC_DISPOSITIFS` (déjà exporté par taxCalculator)
et ajuster le test « je dois partir » si `partir` produit réellement un token `ir` (il ne le doit
PAS : `tokenize('partir')` = `['partir']`).

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/skill-router.test.js` → FAIL (`tokenize`/`deriveDefiscKeywords` non exportés, comportements KO).

- [ ] **Step 3: Implémenter** — dans `src/lib/skillRouter.js` :

1. Import du barème defisc en tête :

```js
import { DEFISC_DISPOSITIFS } from './taxCalculator';
```

2. Tokeniseur + matching (au-dessus de `SKILL_RULES`) :

```js
/** Minuscules, accents retirés, découpe sur tout non-alphanumérique. */
export function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Un mot-clé (déjà tokenisé) matche s'il apparaît comme sous-séquence contiguë.
function matchesKeyword(msgTokens, kwTokens) {
  if (kwTokens.length === 0) return false;
  if (kwTokens.length === 1) return msgTokens.includes(kwTokens[0]);
  for (let i = 0; i + kwTokens.length <= msgTokens.length; i++) {
    if (kwTokens.every((t, j) => msgTokens[i + j] === t)) return true;
  }
  return false;
}
```

3. Lexique defisc dérivé du JSON :

```js
/** Mots-clés defisc dérivés des clés de DEFISC_DISPOSITIFS (paperasse-first). */
export function deriveDefiscKeywords() {
  const out = new Set();
  for (const key of Object.keys(DEFISC_DISPOSITIFS)) {
    for (const tok of key.split('_')) {
      if (tok === 'ir') continue;           // trop générique (déjà mot-clé fiscaliste)
      if (tok.length >= 3) out.add(tok);    // fcpi, fip, madelin, sofica, pinel, censi, bouvard…
    }
  }
  return [...out];
}
```

4. `SKILL_RULES` nettoyées (retrait paddings/accents, ajouts) — remplacer le tableau par des
listes de mots-clés en clair (le tokeniseur gère accents/tirets ; ne PLUS mettre d'espaces de
padding). Fiscaliste reçoit `ifi`, `cehr` + `...deriveDefiscKeywords()` ; comptable reçoit
`holding` ; retirer le `pas` nu (garder `taux pas`). Conserver les phrases multi-mots telles
quelles (elles seront tokenisées). Exemple pour fiscaliste :

```js
  {
    skill: 'fiscaliste',
    keywords: [
      'impot', 'ir', 'tmi', 'tranche', 'declaration', 'case', 'plafond',
      'per', 'pea', 'assurance vie', 'deduction', "credit d'impot", "reduction d'impot",
      'foncier', 'bic', 'bnc', 'micro', 'regime reel',
      'pfu', 'flat tax', 'prelevement forfaitaire',
      'ps', 'prelevements sociaux', 'taux pas', 'prelevement a la source',
      'deficit foncier', 'lmnp', 'lmp', 'abattement', 'exoneration',
      'frais reels', 'forfait 10', 'quotient familial', 'parts fiscales',
      'ifi', 'cehr',
      ...deriveDefiscKeywords(),
    ],
  },
```

(procéder de même pour les 5 autres skills : retirer accents/paddings, garder les phrases ;
ajouter `holding` à comptable. Les tokens comme `sci`, `ag`, `lot`, `is`, `cac` restent — ils
sont désormais matchés en mot entier, sans risque de faux positif.)

5. Pré-tokeniser les mots-clés une fois, et réécrire `detectRelevantSkills` :

```js
const SKILL_RULES_TOKENIZED = SKILL_RULES.map(r => ({
  skill: r.skill,
  kw: r.keywords.map(tokenize),
}));

export function detectRelevantSkills(userMessage) {
  const msgTokens = tokenize(userMessage);
  const active = new Set(['gcp']);
  for (const rule of SKILL_RULES_TOKENIZED) {
    if (rule.kw.some(kwTokens => matchesKeyword(msgTokens, kwTokens))) active.add(rule.skill);
  }
  if (active.size === 1) active.add('fiscaliste');
  const result = [...active];
  debug('[skillRouter] Skills activés :', result.join(', '), '| Message :', userMessage.slice(0, 80));
  return result;
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/skill-router.test.js` → PASS (ajuster les mots-clés si un cas légitime régresse — jamais assouplir un test de faux positif). Puis `npx vitest run` complet → vert ; `npm run lint` → 0/0.

- [ ] **Step 5:** Commit `feat(router): matching par mot entier (tokeniseur) + lexique defisc dérivé du JSON + ifi/cehr/holding`.

---

### Task 2: Traçabilité + clôture

- [ ] **Step 1:** `docs/audit-2026-07-complet.md`, section « Moyenne » : marquer « Routeur de skills tokenisé + lexiques depuis paperasse » ✅ 09/07/2026 (branche routeur-skills).
- [ ] **Step 2:** `npx vitest run` + `npm run lint` + `npm run build` verts.
- [ ] **Step 3:** Commit docs, clôture via finishing-a-development-branch (merge main + push selon le choix établi), CI surveillée, mémoire projet mise à jour.
