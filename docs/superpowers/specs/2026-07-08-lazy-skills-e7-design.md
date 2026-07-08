# Chargement à la demande des skills (audit E7) — Design

> Statut : validé par Guillaume le 2026-07-08 (approche A : loader asynchrone + builder pur).
> Réf. audit : `docs/audit-2026-07-complet.md` §7.2 (élevée E7).

## Problème

`src/data/skillsLoader.js` importe en **eager** les 7 skills `.md` (120 K) et tout
`src/data/paperasse/` en `?raw` (2 Mo — JSON + références MD embarqués en chaînes brutes).
Résultat : un chunk `masterPrompt-*.js` de **1,99 Mo (317 kB gzip)** téléchargé dès
l'ouverture de Chat ou Profile, alors que l'activation sélective des skills (principe
non-négociable du projet) ne met que 2-3 skills dans chaque prompt.

État des lieux (exploration) :
- `skillRouter.js` est l'**unique** consommateur du loader ; `Chat.jsx` et `Profile.jsx`
  les uniques consommateurs du routeur.
- `ALL_SKILLS` n'est utilisé nulle part — code mort.
- Les JSON fiscaux restent importés **parsés** par `taxCalculator.js` pour les calculs
  (hors périmètre) — seule la copie `?raw` destinée aux prompts devient lazy.

## Architecture

### 1. `skillsLoader.js` réécrit — API asynchrone

```js
// Globs NON-eager : chaque fichier devient un chunk chargé à la demande.
const _skillsGlob = import.meta.glob('./skills/*.md',                    { query: '?raw', import: 'default' });
const _dataGlob   = import.meta.glob('./paperasse/*/data/**/*.json',    { query: '?raw', import: 'default' });
const _refsGlob   = import.meta.glob('./paperasse/*/references/**/*.md',{ query: '?raw', import: 'default' });

export async function loadSkills(ids) => Promise<Array<{
  id: string,
  content: string,              // SKILL.md ('' si id inconnu → ignoré par le builder)
  data: Record<string,string>,  // nom de fichier relatif → JSON brut
  refs: Record<string,string>,  // nom de fichier relatif → MD brut
}>>
```

- Résolution par id : `./skills/${id}.md` ; data/refs filtrés sur `/paperasse/${id}/…`,
  clé = chemin relatif après `data/` ou `references/` (identique à l'actuel `parseSkillFiles`).
- **Cache** `Map` par id (promesse mémoïsée) — les tours suivants ne rechargent rien.
- **Échec réseau** → `Error('Connexion requise pour charger les référentiels fiscaux — réessayez.')`,
  remontée par les `catch` existants de Chat/Profile (toast).
- Exports supprimés : `ALL_SKILLS` (mort), `SKILLS_MAP`, `SKILL_DATA`, `SKILL_REFS`
  (remplacés par `loadSkills`).

### 2. `buildSystemPrompt` devient pur

Signature : `buildSystemPrompt({ skills, skillsContent, profile, masterPrompt, model, summary, parsedProfile })`
— `skillsContent` = résultat de `loadSkills(skills)`. Sortie **identique au caractère près**
à l'actuel (même ordre : masterPrompt → blocs skills [contenu + ### Données de référence +
### Documentation procédurale] → profil → chiffres officiels → identité modèle).
`skillRouter.js` n'importe plus `skillsLoader` (découplage complet, testable sans données).

### 3. Câblage

Chat (`handleSend`) et Profile (enrichissement) :

```js
const skillsContent = await loadSkills(skills);
const system = buildSystemPrompt({ skills, skillsContent, … });
```

Le premier tour télécharge les chunks des skills actifs (masqué par la latence API,
états « streaming »/« enriching » existants) ; ensuite cache.

## Résultat attendu (vérifié au build)

- Chunk `masterPrompt-*.js` : ~2 Mo → **< 50 kB**.
- Les `.md`/`.json` paperasse deviennent des petits chunks chargés à la première question.

## Tests

1. `loadSkills` (env node, même pipeline vite) : contenu `fiscaliste` non vide et `data`
   contenant `bareme-ir-2025.json` ; id inconnu → entrée neutre `{ content: '' }` ;
   deux appels → même contenu (cache).
2. `buildSystemPrompt` pur sur contenu factice : bloc skill + données + refs rendus ;
   avec/sans `summary` (garanties E4 conservées) ; sans `skillsContent` → prompt sans blocs
   skills (dégradé propre).
3. Suite complète verte ; vérification build manuelle scriptée (taille du chunk).

## Hors périmètre

- Préchargement anticipé (idle prefetch) de gcp+fiscaliste — optimisation future si le
  premier tour paraît lent en conditions réelles.
- Les imports JSON parsés de taxCalculator (nécessaires aux calculs, déjà tree-shakés).
