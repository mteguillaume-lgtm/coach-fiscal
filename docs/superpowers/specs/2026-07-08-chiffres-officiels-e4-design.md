# Chiffres officiels & sections IA isolées (audit E4) — Design

> Statut : validé par Guillaume le 2026-07-08 (blindage parser + assainissement + injection).
> Réf. audit : `docs/audit-2026-07-complet.md` §1.2 (élevée E4).

## Problème

Deux moteurs de calcul coexistent :

1. **En chat**, `masterPrompt.js` ordonne à Claude de recalculer l'IR et de « produire
   obligatoirement » une section « DONNÉES POUR CALCUL IR FOYER » au format exact
   « (le parser en dépend) » — alors que `computeFoyerSummary` est la source de vérité
   testée (735 tests). Chiffres potentiellement divergents entre le Dashboard et le chat.
2. **À l'enrichissement** (`Profile.jsx`), la réponse de Claude est concaténée **brute** au
   profil TXT. Le system prompt de l'enrichissement étant le masterPrompt complet, Claude
   peut y écrire « IR net : X € », « RNI FOYER TOTAL : X € »… — lignes que le parser lit
   par regex sur **tout le texte** (`profileParser.js:147` et autres). Un chiffre halluciné
   peut devenir celui de l'application.

Constats de l'exploration :

- Le générateur n'émet **aucune** section `== … ==` dont le titre matche les 5 titres IA
  (le `## ⚠️ POINTS D'ATTENTION` de certains profils est un titre markdown, pas une section).
- `secAttn` (section `== POINTS D'ATTENTION ==`) n'alimente que `_alerts()` : des listes
  **qualitatives** 🔴🟡🟢 pour l'affichage — aucun montant. C'est un usage IA assumé.
- `AI_TITLES`/`isAiSection` sont aujourd'hui définis localement dans `Rapport.jsx:78`.
- Le prompt d'enrichissement demande exactement 5 sections : `== DÉCLARATION — CASES
  FORMULAIRE 2042 ==`, `== ANALYSE DES SITUATIONS PARTICULIÈRES ==`,
  `== POINTS D'ATTENTION ==`, `== OBJECTIFS PRIORITAIRES ==`, `== STRATÉGIE PATRIMONIALE ==`.

## Décisions (approches validées)

- **Défense en profondeur** : blindage au niveau du parser (protège aussi les profils déjà
  pollués) **et** assainissement de la sortie d'enrichissement.
- **Injection des chiffres officiels** dans le system prompt du chat (sans les chiffres sous
  les yeux, Claude recalculerait quand même).

## Architecture

### 1. Module partagé `src/lib/aiSections.js` (pur, testable)

```js
export const AI_TITLES = ['DÉCLARATION', 'ANALYSE DES SITUATIONS', "POINTS D'ATTENTION",
                          'OBJECTIFS PRIORITAIRES', 'STRATÉGIE PATRIMONIALE'];
export const isAiSection = (title) => AI_TITLES.some(k => title.toUpperCase().includes(k));
export function stripAiSections(text)    // texte SANS les blocs == TITRE IA ==
export function extractAiSections(text)  // UNIQUEMENT les blocs IA (en-têtes inclus)
```

- Un « bloc » = la ligne d'en-tête `== TITRE ==` jusqu'à la ligne précédant le prochain
  en-tête `== … ==` (ou la fin du texte).
- **Invariant testé** : `stripAiSections(buildProfile(…))` est l'**identité** sur un profil
  généré pur (aucune section déterministe n'est jamais strippée).
- `Rapport.jsx` importe ce module et supprime sa constante locale (déduplication).

### 2. Parser blindé (`profileParser.js`)

Dans `parseProfile(text)` :

- `const texteDeterministe = stripAiSections(text);`
- **Toutes les extractions numériques** (parsers de plugins, `_situation`, `_profil`,
  `_sections` hors secAttn, `_pero`, `_rni`, épargne, immo, capacité, transmission, mode
  solo/couple) passent sur `texteDeterministe`.
- Restent sur le texte **complet** : `isEnriched` (détecte la présence des sections IA) et
  `secAttn` → `_alerts` (contenu qualitatif IA assumé). `secAttn` sort de `_sections` et se
  lit séparément sur le texte complet.
- Effet de bord bienvenu : la détection de mode (`/DÉCLARANT 2/`) ne peut plus être faussée
  par une mention de l'IA.

### 3. Enrichissement assaini (`Profile.jsx`)

- La réponse est filtrée : `const propre = extractAiSections(enrichedText);`
  - `propre` non vide → append de `propre` (au lieu du texte brut) ;
  - vide → toast d'erreur « Réponse IA sans section exploitable — profil inchangé », rien
    n'est ajouté.
- `buildEnrichmentPrompt` ajoute l'interdiction explicite : ne produire AUCUNE autre
  section que les 5 attendues, en particulier PAS de « DONNÉES POUR CALCUL IR FOYER » ni
  de lignes de type « RNI … TOTAL : X € » hors des sections demandées.

### 4. Chiffres officiels dans le system prompt

- Nouvelle fonction pure dans `skillRouter.js` :
  `buildChiffresOfficiels(summary, parsedProfile)` → bloc Markdown
  « ## CHIFFRES OFFICIELS DU FOYER (calculés par l'application — font autorité) » avec :
  RNI foyer, parts, TMI, IR net, décote, CEHR, total dû, PAS prélevé, solde (sens explicité),
  plafonds PER D1/D2 (+ reports), verdict arbitrage 2OP (recommandé + économie), montants
  `toLocaleString('fr-FR')`. Champs absents/nuls omis proprement. Retourne `''` si
  `summary` est null.
- `buildSystemPrompt({ skills, profile, masterPrompt, model, summary })` : nouveau paramètre
  optionnel ; le bloc est inséré APRÈS le profil client. Rétro-compatible (absent → prompt
  identique à aujourd'hui).
- Appelants : `Chat.jsx` (handleSend) et `Profile.jsx` (enrichissement) passent
  `summary: computeFoyerSummary(state.parsedProfile)`.

### 5. masterPrompt réécrit

- **Supprimé** : tout le bloc « ## Format de sortie — section "DONNÉES POUR CALCUL IR
  FOYER" » (l'instruction de produire la section, le format, les définitions TOTAL DÛ /
  MONTANT RESTANT).
- **Ajouté** :

```
## Chiffres officiels
La section « ## CHIFFRES OFFICIELS DU FOYER » (quand elle est présente) contient les
montants calculés et testés par l'application. Ils FONT AUTORITÉ : cite-les tels quels,
ne les recalcule jamais, ne produis jamais de section de données chiffrées destinée au
profil. Le calcul libre n'est autorisé que pour des scénarios hypothétiques
(« que se passerait-il si… »), en annonçant explicitement qu'il s'agit d'une simulation.
```

- Le bloc « ## Comment calculer l'IR » est conservé mais reformulé : il sert à VÉRIFIER ou
  à SIMULER (scénarios), pas à établir les chiffres du foyer.

## Rétro-compatibilité

- Anciens profils enrichis : toujours affichés (Rapport lit les sections IA comme avant) ;
  leurs chiffres IA cessent d'influencer les calculs — c'est le but.
- Anciens profils non enrichis : `stripAiSections` = identité → parsing strictement inchangé.
- `buildSystemPrompt` sans `summary` → sortie identique à aujourd'hui.

## Tests

1. `aiSections` : extraction/strip des 5 blocs, bloc en fin de texte, texte sans section IA
   (identité), **invariant no-op sur profil généré pur**.
2. Parser blindé : un profil généré + fausse section IA contenant « IR net : 99 999 € »,
   « RNI FOYER TOTAL : 99 999 € », « DÉCLARANT 2 » → **aucun champ numérique ne change**
   (comparaison champ à champ avec le parse du profil pur) ; `isEnriched === true` ;
   `_alerts` remplis depuis la section POINTS D'ATTENTION IA.
3. Enrichissement : `extractAiSections` sur une réponse avec préambule et section parasite
   « DONNÉES POUR CALCUL IR FOYER » → seules les 5 sections whitelistées ressortent.
4. Prompt : `buildChiffresOfficiels` contient totalDu/TMI/solde formatés ; `buildSystemPrompt`
   avec summary contient le bloc, sans summary en est exempt (rétro-compat).
5. Suite existante (735) verte.

## Hors périmètre

- Reformulation CIF-safe des textes (E5).
- Troncature de l'historique chat (priorité moyenne, séparée).
- Le rendu UI des sections IA dans Rapport (inchangé).
