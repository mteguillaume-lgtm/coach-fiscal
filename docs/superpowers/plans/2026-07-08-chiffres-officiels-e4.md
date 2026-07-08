# Chiffres officiels & isolation des sections IA (audit E4) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul moteur de chiffres — le parser n'extrait plus jamais de montants des sections écrites par l'IA, l'enrichissement n'ajoute au profil que les 5 sections narratives whitelistées, et le chat reçoit les chiffres de `computeFoyerSummary` avec l'instruction de les citer, pas de les recalculer.

**Architecture:** Spec validée `docs/superpowers/specs/2026-07-08-chiffres-officiels-e4-design.md`. Nouveau module pur `src/lib/aiSections.js` (strip/extract des blocs IA), parser blindé (`texteDet`), sortie d'enrichissement assainie (`Profile.jsx`), nouveau module `src/lib/chiffresOfficiels.js` injecté via `buildSystemPrompt`, masterPrompt débarrassé de l'instruction « produis la section DONNÉES POUR CALCUL IR FOYER ».

**Tech Stack:** Vitest, modules purs sans dépendance UI.

## Global Constraints

- **Aucun changement de parsing** pour un profil généré pur : `stripAiSections` doit être l'identité dessus (testé).
- `isEnriched`, `_alerts` (🔴🟡🟢) et `_flags` (détecteurs qualitatifs plein-texte) restent sur le **texte complet**.
- `buildSystemPrompt` sans `summary` → sortie strictement identique à aujourd'hui (rétro-compat).
- Montants : `toLocaleString('fr-FR')`. Suite verte à chaque commit (735 au départ). Commits `feat(e4): …`.
- Branche : `git checkout -b chiffres-officiels-e4` (Tâche 1, Step 0).

---

### Task 1: Module `src/lib/aiSections.js` (TDD) + adoption par Rapport

**Files:**
- Create: `src/lib/aiSections.js`
- Modify: `src/pages/Rapport.jsx:76-79` (remplace la constante locale par l'import)
- Test: `src/lib/__tests__/ai-sections.test.js` (create)

**Interfaces:**
- Produces: `AI_TITLES: string[]`, `isAiSection(title): boolean`,
  `stripAiSections(text): string`, `extractAiSections(text): string`.
  Tâches 2 et 3 en dépendent.

- [ ] **Step 0: Branche**

```bash
git checkout -b chiffres-officiels-e4
```

- [ ] **Step 1: Test qui échoue** — créer `src/lib/__tests__/ai-sections.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { AI_TITLES, isAiSection, stripAiSections, extractAiSections } from '../aiSections';
import { buildProfile } from '../profileGenerator';

const PROFIL_POLLUE = `== SITUATION ==
Statut : Célibataire

== DONNÉES POUR CALCUL IR FOYER ==
RNI FOYER TOTAL : 40 000 €
IR net : 4 000 €

== POINTS D'ATTENTION ==
[🔴 CRITIQUE] Fausse alerte IA
IR net : 99 999 €

== OBJECTIFS PRIORITAIRES ==
1. Verser sur le PER

== ÉPARGNE ET PLACEMENTS ==
Livret A : 10 000 €`;

describe('aiSections — découpage des blocs IA', () => {
  it('expose les 5 titres et isAiSection', () => {
    expect(AI_TITLES).toHaveLength(5);
    expect(isAiSection('POINTS D\\'ATTENTION')).toBe(true);
    expect(isAiSection('DONNÉES POUR CALCUL IR FOYER')).toBe(false);
  });

  it('stripAiSections retire les blocs IA, conserve tout le reste (y compris après)', () => {
    const s = stripAiSections(PROFIL_POLLUE);
    expect(s).toContain('RNI FOYER TOTAL : 40 000 €');   // section déterministe conservée
    expect(s).toContain('Livret A : 10 000 €');           // section APRÈS un bloc IA conservée
    expect(s).not.toContain('99 999');
    expect(s).not.toContain('Verser sur le PER');
  });

  it('extractAiSections ne garde que les blocs IA, en-têtes inclus', () => {
    const e = extractAiSections(PROFIL_POLLUE);
    expect(e).toContain("== POINTS D'ATTENTION ==");
    expect(e).toContain('99 999');
    expect(e).toContain('== OBJECTIFS PRIORITAIRES ==');
    expect(e).not.toContain('RNI FOYER TOTAL : 40 000');
    expect(e).not.toContain('Livret A');
  });

  it('INVARIANT : identité sur un profil généré pur (aucune section déterministe strippée)', () => {
    const profile = buildProfile(
      { statut: 'Célibataire', net_imp: '30000', div_2dc: '5000', pv_mob_gain: '2000', livret_a: '10000' },
      {}, {}, [], false,
    );
    expect(stripAiSections(profile)).toBe(profile);
    expect(extractAiSections(profile)).toBe('');
  });

  it('texte vide / sans section : comportement neutre', () => {
    expect(stripAiSections('')).toBe('');
    expect(extractAiSections('juste du texte sans en-tête')).toBe('');
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run src/lib/__tests__/ai-sections.test.js` → FAIL (module inexistant).

- [ ] **Step 3: Implémenter `src/lib/aiSections.js`**

```js
// Sections rédigées par l'IA (enrichissement Profile.jsx) — délimitées par des
// en-têtes « == TITRE == ». Le parser NE DOIT JAMAIS extraire de montant de ces
// blocs (audit E4) : stripAiSections nettoie le texte avant toute regex numérique,
// extractAiSections assainit la sortie d'enrichissement avant l'append au profil.

export const AI_TITLES = [
  'DÉCLARATION', 'ANALYSE DES SITUATIONS', "POINTS D'ATTENTION",
  'OBJECTIFS PRIORITAIRES', 'STRATÉGIE PATRIMONIALE',
];

export const isAiSection = (title) =>
  AI_TITLES.some(k => String(title).toUpperCase().includes(k));

// Découpe le texte en segments : [préambule, bloc1, bloc2…] où chaque bloc
// commence à une ligne d'en-tête « == TITRE == » et court jusqu'au prochain
// en-tête (ou la fin). Retourne [{ title|null, content }].
function segments(text) {
  const out = [];
  const re = /^==\s*(.+?)\s*==\s*$/gm;
  let last = 0, lastTitle = null, m;
  while ((m = re.exec(text)) !== null) {
    out.push({ title: lastTitle, content: text.slice(last, m.index) });
    lastTitle = m[1];
    last = m.index;
  }
  out.push({ title: lastTitle, content: text.slice(last) });
  return out;
}

/** Texte SANS les blocs IA — identité si aucun bloc IA (profil généré pur). */
export function stripAiSections(text) {
  if (!text) return text ?? '';
  const segs = segments(text);
  if (!segs.some(s => s.title && isAiSection(s.title))) return text;
  return segs.filter(s => !(s.title && isAiSection(s.title))).map(s => s.content).join('');
}

/** UNIQUEMENT les blocs IA (en-têtes inclus) — '' si aucun. */
export function extractAiSections(text) {
  if (!text) return '';
  return segments(text)
    .filter(s => s.title && isAiSection(s.title))
    .map(s => s.content.trimEnd())
    .join('\n\n')
    .trim();
}
```

- [ ] **Step 4: Rapport.jsx adopte le module** — remplacer :

```js
const AI_TITLES = ['DÉCLARATION', 'ANALYSE DES SITUATIONS', "POINTS D'ATTENTION", 'OBJECTIFS PRIORITAIRES', 'STRATÉGIE PATRIMONIALE'];
const isAiSection = t => AI_TITLES.some(k => t.toUpperCase().includes(k));
```

par :

```js
import { isAiSection } from '../lib/aiSections';
```

(déplacer la ligne d'import en tête de fichier avec les autres imports `../lib/…`).

- [ ] **Step 5: Vérifier** — `npx vitest run src/lib/__tests__/ai-sections.test.js` → PASS ; `npx vitest run` → tout vert ; `npx eslint src/pages/Rapport.jsx src/lib/aiSections.js` → 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiSections.js src/lib/__tests__/ai-sections.test.js src/pages/Rapport.jsx
git commit -m "feat(e4): module aiSections — strip/extract des sections IA, adopté par Rapport"
```

---

### Task 2: Parser blindé — les regex numériques ignorent les sections IA

**Files:**
- Modify: `src/lib/profileParser.js` (import + corps de `parseProfile`, lignes ~328-359)
- Test: `src/lib/__tests__/ai-sections.test.js` (étendre)

**Interfaces:**
- Consumes: `stripAiSections` (Tâche 1), `section` (déjà importé de profileParserUtils).
- Comportement : champs numériques inchangés pour tout profil pur ; insensibles à la pollution IA.

- [ ] **Step 1: Test qui échoue** — ajouter dans `ai-sections.test.js` :

```js
import { parseProfile } from '../profileParser';

describe('Parser blindé — la pollution IA ne change aucun champ numérique (audit E4)', () => {
  const formData = { statut: 'Célibataire', net_imp: '30000', div_2dc: '5000', pv_mob_gain: '2000', livret_a: '10000' };
  const pur = buildProfile(formData, {}, {}, [], false);
  const pollution = `

== ANALYSE DES SITUATIONS PARTICULIÈRES ==
Le foyer mentionne un DÉCLARANT 2 hypothétique. RNI FOYER TOTAL : 99 999 €

== POINTS D'ATTENTION ==
[🔴 CRITIQUE] IR net : 99 999 € — pénalité possible
[🟡 À CONFIRMER] Plafond PER D1 : 99 999 €
[🟢 OPTIMISATION] Verser 99 999 € sur le PER

== STRATÉGIE PATRIMONIALE ==
Livret A : 99 999 € conseillé. Arbitrage 2OP foyer : PFU 99 999 € | barème 1 € | recommandé : barème | économie 99 998 €`;

  const pParsed  = parseProfile(pur);
  const pPollue  = parseProfile(pur + pollution);

  it('tous les champs numériques sont identiques avec et sans pollution', () => {
    for (const [k, v] of Object.entries(pParsed)) {
      if (typeof v === 'number') {
        expect(pPollue[k], `champ ${k}`).toBe(v);
      }
    }
    expect(pPollue.mode).toBe('solo');   // le « DÉCLARANT 2 » de l'IA ne bascule pas le mode
  });

  it('le qualitatif IA reste lu : isEnriched + alertes 🔴🟡🟢', () => {
    expect(pPollue.isEnriched).toBe(true);
    expect(pParsed.isEnriched).toBe(false);
    expect(pPollue.alertsCritiques.length).toBeGreaterThan(0);
    expect(pPollue.alertsOpportunites.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — au moins `rniFoyer`/`irNet`/`mode` divergent → FAIL.

- [ ] **Step 3: Implémenter** — dans `profileParser.js` :

1. Ajouter l'import : `import { stripAiSections } from './aiSections.js';`
2. Dans `parseProfile`, remplacer le corps entre la garde et le `return` par la version blindée
   (mêmes appels, sur `texteDet` — SEULS `_flags` et `secAttn` gardent `text`) :

```js
export function parseProfile(text) {
  if (!text) return emptyProfile();

  // Blindage E4 : les extractions NUMÉRIQUES ignorent les sections rédigées par
  // l'IA. Le texte complet ne sert qu'au qualitatif : isEnriched + détecteurs
  // plein-texte (_flags) et alertes 🔴🟡🟢 (_alerts, section IA assumée).
  const texteDet = stripAiSections(text);

  const mode = /FOYER 2025|Mode\s*:\s*Déclaration commune|DÉCLARANT 2/i.test(texteDet) ? 'couple' : 'solo';
  const secs = _sections(texteDet, mode);
  // POINTS D'ATTENTION est une section IA : lue sur le texte COMPLET (qualitatif).
  secs.secAttn = section(text, "== POINTS D'ATTENTION ==");

  const pluginData = {};
  for (const p of registry.getAll()) Object.assign(pluginData, p.parser(texteDet, mode));

  const sit      = _situation(texteDet);
  const profil   = _profil(secs.secProfil);

  // Run calculators with parser data + profil context (typeRevenuD1/D2 needed by salaires)
  const calcCtx = { ...pluginData, ...profil };
  for (const p of registry.getAll()) Object.assign(pluginData, p.calculator(calcCtx));

  const pero     = _pero(texteDet);
  const rni      = _rni(pluginData, profil, texteDet);
  const fiscal   = _fiscal(texteDet, rni.rniFoyer, sit.parts, pluginData);
  const per      = _per(texteDet);
  const nonPlug  = _nonPlugRevenues(texteDet);
  const acomptes = _acomptes(texteDet);
  const epD1     = _epargneDecl(secs.secEpD1, 'D1');
  const epD2     = _epargneDecl(secs.secEpD2, 'D2');
  const derivD1  = _epDerived(epD1, 'D1');
  const derivD2  = _epDerived(epD2, 'D2');
  const capacite = _capacite(secs.secCapacite);
  const immo     = _immo(secs.secImmo);
  const flags    = _flags(text, epD1, epD2);
  const transm   = _transmission(secs.secTransmission, texteDet);
  const alerts   = _alerts(secs.secAttn);
  const patrim   = _patrimoine(epD1, epD2, immo, capacite, rni.rniFoyer);
  …(return inchangé)
}
```

⚠️ Vérifier la signature réelle de chaque helper avant substitution (`grep -n "^function _" src/lib/profileParser.js`) — ne remplacer `text` par `texteDet` que là où le plan l'indique.

- [ ] **Step 4: Vérifier** — `npx vitest run` → tout vert (l'invariant identité de la Tâche 1 garantit zéro régression sur les profils purs ; si `profileParser.test.js` casse, STOP et analyser).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profileParser.js src/lib/__tests__/ai-sections.test.js
git commit -m "feat(e4): parser blindé — les montants des sections IA ne sont plus jamais parsés"
```

---

### Task 3: Enrichissement assaini (Profile.jsx)

**Files:**
- Modify: `src/pages/Profile.jsx` (import, `buildEnrichmentPrompt`, bloc append ~lignes 208-212)

- [ ] **Step 1: Interdiction dans le prompt** — dans `buildEnrichmentPrompt`, remplacer la fin :

```
Ne traite que ce qui est réellement présent ou pertinent compte tenu du profil ; n'invente aucun actif.`;
```

par :

```
Ne traite que ce qui est réellement présent ou pertinent compte tenu du profil ; n'invente aucun actif.

RÈGLE STRICTE DE SORTIE : produis UNIQUEMENT les 5 sections ci-dessus, dans ce format exact.
AUCUNE autre section — en particulier PAS de « DONNÉES POUR CALCUL IR FOYER » ni de lignes
de totaux chiffrés (« RNI … TOTAL : X € », « IR net : X € ») hors des 5 sections demandées :
les chiffres officiels sont calculés par l'application et font autorité.`;
```

- [ ] **Step 2: Assainir l'append** — ajouter l'import `import { extractAiSections } from '../lib/aiSections';` puis remplacer :

```js
      if (enrichedText.trim()) {
        const newProfile = state.profile.trimEnd() + '\n\n' + enrichedText.trim();
        dispatch({ type: 'SET_PROFILE', payload: newProfile });
        toast.success('Profil enrichi — données actualisées !');
        setEnriched(true);
      } else {
        toast.error('Réponse vide — réessayez.');
      }
```

par :

```js
      // Assainissement E4 : seules les 5 sections narratives whitelistées entrent
      // dans le profil — jamais de section chiffrée que le parser pourrait lire.
      const sectionsPropres = extractAiSections(enrichedText);
      if (sectionsPropres) {
        const newProfile = state.profile.trimEnd() + '\n\n' + sectionsPropres;
        dispatch({ type: 'SET_PROFILE', payload: newProfile });
        toast.success('Profil enrichi — données actualisées !');
        setEnriched(true);
      } else {
        toast.error('Réponse IA sans section exploitable — profil inchangé, réessayez.');
      }
```

- [ ] **Step 3: Vérifier** — `npx vitest run` → tout vert ; `npx eslint src/pages/Profile.jsx` → 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat(e4): enrichissement assaini — seules les 5 sections whitelistées entrent au profil"
```

---

### Task 4: Chiffres officiels dans le system prompt + masterPrompt réécrit

**Files:**
- Create: `src/lib/chiffresOfficiels.js`
- Modify: `src/lib/skillRouter.js` (`buildSystemPrompt` + import)
- Modify: `src/data/masterPrompt.js` (suppression du bloc « Format de sortie », ajout « Chiffres officiels »)
- Modify: `src/pages/Chat.jsx:272` et `src/pages/Profile.jsx:198` (passage du summary)
- Test: `src/lib/__tests__/chiffres-officiels.test.js` (create)

**Interfaces:**
- Produces: `buildChiffresOfficiels(summary, parsedProfile): string` (bloc Markdown, `''` si summary null) ;
  `buildSystemPrompt({ skills, profile, masterPrompt, model, summary, parsedProfile })` — les 2 nouveaux
  paramètres optionnels (absents → sortie identique à avant).

- [ ] **Step 1: Test qui échoue** — créer `src/lib/__tests__/chiffres-officiels.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { buildChiffresOfficiels } from '../chiffresOfficiels';
import { buildProfile } from '../profileGenerator';
import { parseProfile } from '../profileParser';
import { computeFoyerSummary } from '../taxCalculator';

describe('buildChiffresOfficiels — bloc autorité pour le system prompt (audit E4)', () => {
  const parsed  = parseProfile(buildProfile(
    { statut: 'Célibataire', net_imp: '45000', div_2dc: '5000', pv_mob_gain: '2000' },
    {}, {}, [], false,
  ));
  const summary = computeFoyerSummary(parsed);

  it('contient les montants clés formatés fr-FR et la mention d\\'autorité', () => {
    const bloc = buildChiffresOfficiels(summary, parsed);
    expect(bloc).toContain('CHIFFRES OFFICIELS DU FOYER');
    expect(bloc).toContain('font autorité');
    expect(bloc).toContain(summary.totalDu.toLocaleString('fr-FR'));
    expect(bloc).toContain(`TMI : ${summary.tmi}`);
    expect(bloc).toMatch(/Arbitrage 2OP/);
  });

  it('retourne une chaîne vide sans summary (rétro-compat)', () => {
    expect(buildChiffresOfficiels(null, {})).toBe('');
    expect(buildChiffresOfficiels(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — module inexistant → FAIL.

- [ ] **Step 3: Créer `src/lib/chiffresOfficiels.js`**

```js
// Bloc « chiffres officiels » injecté dans le system prompt (Chat + enrichissement).
// Source : computeFoyerSummary (735+ tests) — Claude CITE ces montants, il ne les
// recalcule jamais (audit E4). Module pur, sans dépendance UI ni skills.

const eur = (v) => `${Math.round(v || 0).toLocaleString('fr-FR')} €`;

/**
 * @param {object|null} summary       - résultat computeFoyerSummary (null → '')
 * @param {object}      [parsedProfile={}] - pour les plafonds PER par déclarant
 * @returns {string} bloc Markdown, '' si pas de summary
 */
export function buildChiffresOfficiels(summary, parsedProfile = {}) {
  if (!summary) return '';
  const p = parsedProfile || {};
  const lignes = [
    '## CHIFFRES OFFICIELS DU FOYER (calculés par l\\'application — font autorité)',
    `RNI foyer : ${eur(summary.rniFoyer)} · Parts fiscales : ${summary.partsFiscales} · TMI : ${summary.tmi} %`,
    `IR net : ${eur(summary.irNet)}${summary.decote > 0 ? ` · Décote : ${eur(summary.decote)}` : ''}${summary.cehr > 0 ? ` · CEHR : ${eur(summary.cehr)}` : ''}`,
    `TOTAL DÛ : ${eur(summary.totalDu)} · PAS prélevé : ${eur(summary.pasTotal)} · Solde : ${eur(Math.abs(summary.solde))} ${summary.solde >= 0 ? 'à payer' : 'de remboursement'}`,
  ];
  if ((p.plafondPerD1 || 0) > 0 || (p.plafondPerD2 || 0) > 0) {
    lignes.push(`Plafond PER disponible : D1 ${eur(p.plafondPerD1)}${(p.plafondPerD2 || 0) > 0 ? ` · D2 ${eur(p.plafondPerD2)}` : ''}`);
  }
  const arb = summary.arbitrageCapital;
  if (arb && (arb.pfu > 0 || arb.bareme > 0)) {
    lignes.push(`Arbitrage 2OP (global div + intérêts + PV) : recommandé ${arb.recommande === 'bareme' ? 'barème' : 'PFU'} · PFU ${eur(arb.pfu)} vs barème ${eur(arb.bareme)} · économie ${eur(arb.economie)}`);
  }
  lignes.push('Ne recalcule JAMAIS ces montants : cite-les tels quels. Tout calcul libre doit être annoncé comme une simulation hypothétique.');
  return lignes.join('\n');
}
```

- [ ] **Step 4: `buildSystemPrompt` accepte le summary** — dans `skillRouter.js` :

1. Import : `import { buildChiffresOfficiels } from './chiffresOfficiels';`
2. Signature : `export function buildSystemPrompt({ skills, profile, masterPrompt, model, summary = null, parsedProfile = {} }) {`
3. Après le bloc `profileBlock`, ajouter :

```js
  const chiffresBloc = buildChiffresOfficiels(summary, parsedProfile);
  const chiffresBlock = chiffresBloc ? `\n\n${chiffresBloc}` : '';
```

4. Retour : `return \`${masterPrompt.trim()}\n\n${skillsBlock}${profileBlock}${chiffresBlock}${modelBlock}\`.trim();`

- [ ] **Step 5: masterPrompt réécrit** — dans `src/data/masterPrompt.js` :

1. **Supprimer intégralement** le bloc depuis `## Format de sortie — section "DONNÉES POUR CALCUL IR FOYER"` jusqu'à la ligne `- Crédit PFU 2CK = montant du PFU 12,8% déjà prélevé à la source sur intérêts mobiliers` incluse.
2. **Insérer à sa place** :

```
## Chiffres officiels
La section « ## CHIFFRES OFFICIELS DU FOYER » (quand elle est présente) contient les montants
calculés et testés par l'application. Ils FONT AUTORITÉ : cite-les tels quels, ne les recalcule
jamais, et ne produis jamais de section de données chiffrées destinée au profil.
Le calcul libre n'est autorisé que pour des scénarios hypothétiques (« que se passerait-il
si… »), en annonçant explicitement qu'il s'agit d'une simulation.
```

3. Dans « ## Comment calculer l'IR », remplacer la phrase d'intro `Les tranches exactes sont dans la section…` par : `Ces règles servent à VÉRIFIER un calcul ou à SIMULER un scénario hypothétique — jamais à remplacer les chiffres officiels. Les tranches exactes sont dans la section **### Données de référence → bareme-ir-2025.json**.`

- [ ] **Step 6: Câbler les appelants**

`src/pages/Chat.jsx` — ajouter `import { computeFoyerSummary } from '../lib/taxCalculator';` puis remplacer :

```js
    const system = buildSystemPrompt({ skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: modelToUse });
```

par :

```js
    const system = buildSystemPrompt({
      skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: modelToUse,
      summary: computeFoyerSummary(state.parsedProfile), parsedProfile: state.parsedProfile,
    });
```

`src/pages/Profile.jsx` — même ajout d'import, puis remplacer :

```js
      const system = buildSystemPrompt({ skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: 'opus' });
```

par :

```js
      const system = buildSystemPrompt({
        skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: 'opus',
        summary: computeFoyerSummary(state.parsedProfile), parsedProfile: state.parsedProfile,
      });
```

- [ ] **Step 7: Vérifier** — `npx vitest run` → tout vert ; `npm run lint` → 0 erreur.
Vérification manuelle rapide (optionnelle) : `npm run dev`, poser une question dans le chat avec un profil chargé → la réponse cite le total dû exact du Dashboard.

- [ ] **Step 8: Commit**

```bash
git add src/lib/chiffresOfficiels.js src/lib/skillRouter.js src/data/masterPrompt.js src/pages/Chat.jsx src/pages/Profile.jsx src/lib/__tests__/chiffres-officiels.test.js
git commit -m "feat(e4): chiffres officiels injectés dans le system prompt, masterPrompt ne fait plus recalculer"
```

---

### Task 5: Traçabilité + vérification finale

**Files:**
- Modify: `docs/audit-2026-07-complet.md` (ligne E4)

- [ ] **Step 1:** Ligne E4 du tableau « Élevée » : `| à planifier |` → `| ✅ {date} (branche chiffres-officiels-e4) |`.
- [ ] **Step 2:** `npx vitest run` (≈ 745+) + `npm run lint` + `npm run build` → verts.
- [ ] **Step 3:** Commit `docs(audit): E4 traité`, puis clôture via finishing-a-development-branch (merge main + push après accord).
