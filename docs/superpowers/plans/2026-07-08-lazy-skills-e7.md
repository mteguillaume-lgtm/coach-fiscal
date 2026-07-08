# Chargement à la demande des skills (audit E7) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le chunk `masterPrompt` passe de ~2 Mo à < 50 kB : les contenus de skills/paperasse ne sont téléchargés qu'à la première question, pour les seuls skills activés par le routeur — sortie du system prompt identique au caractère près.

**Architecture:** Spec validée `docs/superpowers/specs/2026-07-08-lazy-skills-e7-design.md`. `loadSkills(ids)` asynchrone avec cache dans skillsLoader (globs non-eager), `buildSystemPrompt` pur (paramètre `skillsContent`), câblage `await` dans Chat/Profile.

**Tech Stack:** Vitest (env node — les dynamic imports passent par le même pipeline vite), rolldown code-splitting.

## Global Constraints

- **Sortie du prompt inchangée au caractère près** pour un même contenu (test de parité sur contenu factice).
- Suite verte à chaque commit (754 au départ). Branche `lazy-skills-e7`. Commits `feat(e7)/perf(e7)`.
- Échec de chargement → message d'erreur clair remonté par les catch existants (pas de crash silencieux).

---

### Task 1: `loadSkills` asynchrone (TDD)

**Files:**
- Modify: `src/data/skillsLoader.js` (réécriture complète)
- Test: `src/lib/__tests__/skills-loader.test.js` (create)

**Interfaces:**
- Produces: `loadSkills(ids: string[]) => Promise<Array<{ id, content, data, refs }>>` (formes de la spec). Plus AUCUN export eager (`ALL_SKILLS`, `SKILLS_MAP`, `SKILL_DATA`, `SKILL_REFS` supprimés).

- [ ] **Step 0:** `git checkout -b lazy-skills-e7`
- [ ] **Step 1: Tests qui échouent** — créer `src/lib/__tests__/skills-loader.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { loadSkills } from '../../data/skillsLoader';

describe('loadSkills — chargement à la demande (audit E7)', () => {
  it('charge le contenu, les données et les références du skill demandé', async () => {
    const [fisc] = await loadSkills(['fiscaliste']);
    expect(fisc.id).toBe('fiscaliste');
    expect(fisc.content.length).toBeGreaterThan(500);
    expect(Object.keys(fisc.data)).toContain('bareme-ir-2025.json');
    expect(Object.keys(fisc.refs).length).toBeGreaterThan(0);
  });

  it('id inconnu → entrée neutre ignorée par le builder', async () => {
    const [inconnu] = await loadSkills(['inexistant']);
    expect(inconnu).toEqual({ id: 'inexistant', content: '', data: {}, refs: {} });
  });

  it('cache : deux appels renvoient le même objet (pas de rechargement)', async () => {
    const [a] = await loadSkills(['gcp']);
    const [b] = await loadSkills(['gcp']);
    expect(b).toBe(a);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/skills-loader.test.js` → FAIL (`loadSkills` inexistant).
- [ ] **Step 3: Réécrire `src/data/skillsLoader.js`** (remplacement complet du fichier) :

```js
// Chargement À LA DEMANDE des skills et de leurs référentiels (audit E7).
// Globs NON-eager : chaque .md / .json devient un chunk séparé, téléchargé à la
// première question pour les seuls skills activés par le routeur — le bundle
// initial ne porte plus les 2 Mo de contenus bruts.
// Les JSON fiscaux restent importés PARSÉS par taxCalculator (calculs) — seule
// la copie ?raw destinée aux prompts est lazy.

const _skillsGlob = import.meta.glob('./skills/*.md',                     { query: '?raw', import: 'default' });
const _dataGlob   = import.meta.glob('./paperasse/*/data/**/*.json',      { query: '?raw', import: 'default' });
const _refsGlob   = import.meta.glob('./paperasse/*/references/**/*.md',  { query: '?raw', import: 'default' });

// Nom de fichier relatif après data/ ou references/ (aligné sur l'ancien parseSkillFiles).
const _relName = (path) => path.split(/\/(?:data|references)\//)[1];

async function _loadFamily(glob, id, kind) {
  const prefix = `./paperasse/${id}/${kind}/`;
  const entries = Object.entries(glob).filter(([path]) => path.startsWith(prefix));
  const out = {};
  for (const [path, load] of entries) out[_relName(path)] = String(await load() ?? '');
  return out;
}

const _cache = new Map();   // id → Promise<{ id, content, data, refs }>

function _loadOne(id) {
  if (_cache.has(id)) return _cache.get(id);
  const p = (async () => {
    const skillPath = `./skills/${id}.md`;
    const content = _skillsGlob[skillPath] ? String(await _skillsGlob[skillPath]() ?? '') : '';
    const [data, refs] = await Promise.all([
      _loadFamily(_dataGlob, id, 'data'),
      _loadFamily(_refsGlob, id, 'references'),
    ]);
    return { id, content, data, refs };
  })().catch((cause) => {
    _cache.delete(id);   // ne pas mettre l'échec en cache
    throw new Error('Connexion requise pour charger les référentiels fiscaux — réessayez.', { cause });
  });
  _cache.set(id, p);
  return p;
}

/**
 * Charge le contenu des skills demandés (SKILL.md + données JSON + références MD).
 * @param {string[]} ids
 * @returns {Promise<Array<{ id:string, content:string, data:Object, refs:Object }>>}
 */
export function loadSkills(ids = []) {
  return Promise.all(ids.map(_loadOne));
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/skills-loader.test.js` → PASS. La suite complète casse encore (skillRouter importe les anciens exports) — c'est attendu, la Tâche 2 suit immédiatement. NE PAS committer avant Tâche 2 verte.

---

### Task 2: `buildSystemPrompt` pur + tests de parité

**Files:**
- Modify: `src/lib/skillRouter.js` (import supprimé, signature + boucle)
- Test: `src/lib/__tests__/system-prompt.test.js` (create)

**Interfaces:**
- Produces: `buildSystemPrompt({ skills, skillsContent = [], profile, masterPrompt, model, summary, parsedProfile })` — sortie identique à l'existant pour contenu équivalent.

- [ ] **Step 1:** Dans `skillRouter.js` :
  1. Supprimer `import { SKILLS_MAP, SKILL_DATA, SKILL_REFS } from '../data/skillsLoader';`
  2. Signature : ajouter `skillsContent = []` ; remplacer la boucle :

```js
  const byId = new Map(skillsContent.map(s => [s.id, s]));
  const skillsBlock = skills
    .map(id => {
      const sc = byId.get(id);
      const content = sc?.content;
      if (!content) return '';

      const lines = [`## SKILL : ${SKILL_LABELS[id] ?? id}`, content.trim()];

      // Données chiffrées (JSON) — barèmes, abattements, plafonds, etc.
      const dataEntries = Object.entries(sc.data ?? {});
      if (dataEntries.length > 0) {
        lines.push('\n### Données de référence');
        for (const [name, raw] of dataEntries) {
          lines.push(`#### ${name}\n\`\`\`json\n${raw.trim()}\n\`\`\``);
        }
      }

      // Documentation procédurale (Markdown)
      const refEntries = Object.entries(sc.refs ?? {});
      if (refEntries.length > 0) {
        lines.push('\n### Documentation procédurale');
        for (const [name, raw] of refEntries) {
          lines.push(`#### ${name}\n${raw.trim()}`);
        }
      }

      debug(`[skillRouter] ${id} : ${dataEntries.length} data, ${refEntries.length} refs`);

      return lines.join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');
```

(le reste — profileBlock, chiffresBlock, modelBlock, return — inchangé.)

- [ ] **Step 2: Tests** — créer `src/lib/__tests__/system-prompt.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../skillRouter';

const CONTENU = [{
  id: 'fiscaliste',
  content: 'Règles IR de test.',
  data: { 'bareme-test.json': '{"tranche": 0.11}' },
  refs: { 'workflow.md': 'Étapes de test.' },
}];

describe('buildSystemPrompt — pur, alimenté par loadSkills (audit E7)', () => {
  it('rend le bloc skill avec données et références', () => {
    const out = buildSystemPrompt({
      skills: ['fiscaliste'], skillsContent: CONTENU,
      profile: 'RNI : 40 000 €', masterPrompt: 'MASTER', model: 'sonnet',
    });
    expect(out).toContain('## SKILL : Fiscaliste');
    expect(out).toContain('Règles IR de test.');
    expect(out).toContain('### Données de référence');
    expect(out).toContain('bareme-test.json');
    expect(out).toContain('### Documentation procédurale');
    expect(out).toContain('## PROFIL FISCAL CLIENT');
  });

  it('sans skillsContent : prompt dégradé propre (pas de bloc skill), rétro-compat E4 summary', () => {
    const sans = buildSystemPrompt({ skills: ['fiscaliste'], profile: '', masterPrompt: 'MASTER', model: 'haiku' });
    expect(sans).not.toContain('## SKILL :');
    const avec = buildSystemPrompt({
      skills: [], skillsContent: [], profile: '', masterPrompt: 'MASTER', model: 'haiku',
      summary: { rniFoyer: 40_000, partsFiscales: 1, tmi: 30, irNet: 5_104, decote: 0, cehr: 0, totalDu: 5_104, pasTotal: 4_000, solde: 1_104 },
      parsedProfile: {},
    });
    expect(avec).toContain('CHIFFRES OFFICIELS DU FOYER');
  });
});
```

- [ ] **Step 3:** `npx vitest run src/lib/__tests__/skills-loader.test.js src/lib/__tests__/system-prompt.test.js` → PASS ; la suite complète casse encore si Chat/Profile importent les anciens usages — vérifier avec `npx vitest run` (les pages ne sont pas testées directement hors smoke Rapport, qui n'ouvre pas le chat → devrait être vert). `npm run lint` signalera les usages cassés dans Chat/Profile → Tâche 3.
- [ ] **Step 4:** Commit (Tâches 1+2 ensemble) : `feat(e7): loadSkills asynchrone + buildSystemPrompt pur — plus d'import eager des 2 Mo`.

---

### Task 3: Câblage Chat + Profile

**Files:**
- Modify: `src/pages/Chat.jsx` (~ligne 272) et `src/pages/Profile.jsx` (~ligne 198)

- [ ] **Step 1:** Dans les deux fichiers, ajouter l'import : `import { loadSkills } from '../data/skillsLoader';`
- [ ] **Step 2: Chat.jsx** — dans `handleSend`, remplacer :

```js
    const system = buildSystemPrompt({
      skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: modelToUse,
      summary: computeFoyerSummary(state.parsedProfile), parsedProfile: state.parsedProfile,
    });
```

par :

```js
    const skillsContent = await loadSkills(skills);
    const system = buildSystemPrompt({
      skills, skillsContent, profile: state.profile, masterPrompt: MASTER_PROMPT, model: modelToUse,
      summary: computeFoyerSummary(state.parsedProfile), parsedProfile: state.parsedProfile,
    });
```

⚠️ Vérifier que l'appel est bien DANS le bloc `try` existant (l'erreur « Connexion requise… » doit atterrir dans le catch → message affiché). Si le buildSystemPrompt actuel est hors du try, déplacer les deux lignes dedans.

- [ ] **Step 3: Profile.jsx** — même transformation dans le bloc d'enrichissement (déjà dans un `try`).
- [ ] **Step 4:** `npx vitest run` → tout vert ; `npm run lint` → 0/0. Vérif manuelle : `npm run dev`, poser une question dans le chat (onglet Réseau : les chunks skills se chargent au premier envoi, pas à l'ouverture de la page).
- [ ] **Step 5:** Commit `feat(e7): Chat et Profile chargent les skills à la demande`.

---

### Task 4: Vérification bundle + traçabilité + clôture

- [ ] **Step 1:** `npm run build 2>&1 | grep -E "masterPrompt|skillRouter"` → le chunk contenant masterPrompt/skillRouter doit être **< 50 kB** (vs 1,99 Mo). Coller le tableau des chunks dans le commit de traçabilité.
- [ ] **Step 2:** Ligne E7 de `docs/audit-2026-07-complet.md` → `✅ {date} (branche lazy-skills-e7) — chunk masterPrompt {ancienne} → {nouvelle taille}`.
- [ ] **Step 3:** `npx vitest run` + `npm run lint` + build verts → commit docs, clôture via finishing-a-development-branch (merge main + push selon le choix établi), CI surveillée, mémoire projet mise à jour (audit niveau « élevée » intégralement soldé).
