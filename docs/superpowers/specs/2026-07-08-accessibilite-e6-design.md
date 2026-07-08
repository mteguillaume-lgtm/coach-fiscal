# Accessibilité + hygiène React (audit E6, périmètre complet) — Design

> Statut : validé par Guillaume le 2026-07-08 (« tout E6 d'un coup » + infra tests composants).
> Réf. audit : `docs/audit-2026-07-complet.md` §5.1 (élevée E6).

## Problème

- **Formulaire fiscal inaccessible** : dans `FieldRow` (Collect.jsx), le `<label>` n'est pas
  associé au champ (pas de `htmlFor`/`id`) — un lecteur d'écran annonce « édition, vide » sans
  dire quoi remplir, sur tous les champs. Hints non liés (`aria-describedby` absent), boutons
  Oui/Non sans sémantique de groupe, accordéons sans `aria-expanded`.
- **Animations imposées** : framer-motion (boxShadow infinies, transitions) et boucles rAF
  (SpotlightCursor) ignorent `prefers-reduced-motion`.
- **25 warnings React Compiler** laissés en warn au lot 1 : 15 `static-components` (= 3
  composants définis dans le rendu de Rapport.jsx : `Row` l.305, `Tab` l.2027, `Horizon`
  l.2379 — les 15 warnings sont leurs sites d'usage), 2 `set-state-in-effect`
  (AuroraBackground l.13, Home l.208), 8 `exhaustive-deps` (Collect 1383, Dashboard 744×2,
  Rapport 2991×3, Simulator 394, Profile 155 = directive inutile).
- **Découverte au cadrage** : deux fallbacks `Math.round(p.rente1Bs* × 0.9)` dans Rapport.jsx
  (≈ l.342/345) — l'approximation pension corrigée en C3 côté parser subsiste côté affichage
  (le verrou paperasse-first ne scanne pas `src/pages`).

## Décisions validées

- Périmètre complet en un lot, avec **infra de tests de composants comme filet**.
- Sortie : `npm run lint` à **0 problème** (les règles React Compiler repassent au niveau
  d'origine — suppression des downgrades `warn` du lot 1).

## Architecture

### 1. Infra tests composants

- `npm i -D @testing-library/react @testing-library/jest-dom jsdom`.
- Environnement **par fichier** via pragma `// @vitest-environment jsdom` (les 748 tests node
  existants ne changent pas d'environnement ni de vitesse). Matchers : import
  `@testing-library/jest-dom/vitest` dans chaque fichier de test UI.

### 2. FieldRow accessible — extrait dans `src/components/FieldRow.jsx`

- **Extraction** : `FieldRow` (et ses helpers privés s'ils ne servent qu'à lui :
  `_fieldVisible`, `isMoneyField`, `isYesNo`…) sort de Collect.jsx (1 835 lignes) vers un
  fichier dédié — testable isolément, conforme au principe « fichiers focalisés ».
  Collect.jsx l'importe ; comportement identique.
- **A11y** :
  - `const inputId = \`field-${f.key}\``, `const hintId` / `labelId` dérivés ;
  - `<label htmlFor={inputId} id={labelId}>` ; input/select/champ montant : `id={inputId}`,
    `aria-describedby={hintId}` quand un hint existe ; le hint `<p id={hintId}>` ;
  - groupe Oui/Non : conteneur `role="group" aria-labelledby={labelId}`, chaque bouton
    `aria-pressed={active}` ;
  - `computedInfo` : annoncé via `aria-live="polite"` (retour de calcul dynamique).
- **Tests (les premiers tests de composant du projet)** : pour chaque type de champ
  (texte, montant, select, Oui/Non), `getByLabelText(label)` retourne le contrôle ;
  le hint est exposé via `aria-describedby` ; `aria-pressed` suit la sélection Oui/Non.

### 3. Accordéons `AccSection`

- Bouton d'en-tête : `aria-expanded={open}`, `aria-controls={contentId}` ;
  corps repliable : `id={contentId}`, `role="region"`, `aria-labelledby` du bouton.

### 4. Mouvement respectueux

- `<MotionConfig reducedMotion="user">` à la racine (App.jsx, sous AppProvider) — toutes les
  animations framer-motion (transform/layout) respectent la préférence système.
- `SpotlightCursor` : `useReducedMotion()` → rend `null` si réduit (décoratif pur).
- `Grain` : texture statique (feTurbulence sans animation) → rien à faire, documenté.
- `AuroraBackground` : couvert par MotionConfig (motion divs).

### 5. Warnings faciles (10)

- `set-state-in-effect` ×2 : `setIsTouch`/`setSessionActive` appelés en effet au mount →
  **initialisation paresseuse** `useState(() => …)` (SPA : window disponible au premier
  rendu ; le commentaire StrictMode devient caduc, remplacé).
- `exhaustive-deps` ×8 :
  - fallbacks recréés à chaque rendu (`state.x || {}` / `|| []`) → constantes module
    `const VIDE = {}` / `const VIDE_ARR = []` (Collect 1383, Dashboard 744, Rapport 2991) ;
  - Simulator 394 : dépendance `versementD2` inutile → retirée ;
  - Profile 155 : directive `eslint-disable` orpheline → supprimée.
  - Chaque fix vérifié : la sémantique voulue est « même valeur ⇒ même référence », aucun
    effet ne doit se déclencher plus ou moins qu'avant.

### 6. Restructuration Rapport (15 warnings → 3 hoists) — protégée par un smoke test

- **D'abord le filet** : test jsdom qui rend la page Rapport complète (MemoryRouter +
  AppProvider hydraté avec `fixtures/profil-fiscal-ref.txt` via localStorage) et vérifie la
  présence des blocs clés (titre, table revenus, synthèse). Écrit AVANT la restructuration.
- Puis hoists au niveau module avec closures converties en props :
  - `Row` (l.305, closure `d.isCouple`) → prop `isCouple` — ~12 usages dans RevenusTable ;
  - `Tab` (l.2027, closure `view`/`setView`) → props `active`, `onSelect` ;
  - `Horizon` (l.2379, autonome) → hoist direct.
- **Drive-by fiscal** : les deux fallbacks `× 0.9` remplacés par
  `p.rniRente* || abattement10Pension(p.rente1Bs*)` (import taxCalculator) — aligné C3.

### 7. Fin de dette

- `eslint.config.js` : suppression des downgrades `'react-hooks/static-components': 'warn'`
  et `'react-hooks/set-state-in-effect': 'warn'` (retour au niveau d'origine du plugin).
- Critère de sortie : `npm run lint` → **0 erreur, 0 warning**.

## Tests

1. Composant FieldRow : labels associés (`getByLabelText`), hint (`aria-describedby`),
   Oui/Non (`role=group`, `aria-pressed`).
2. Smoke Rapport : rendu complet avec profil de référence, avant ET après hoists.
3. Suite node existante (748) inchangée et verte ; verrous (paperasse-first, cif-safe) verts.
4. Vérification manuelle guidée : parcours clavier de /collect (Tab/Entrée), VoiceOver
   (Cmd+F5) sur 3 champs, préférence « réduire les animations » de macOS activée → plus
   d'aurora/spotlight animés.

## Hors périmètre

- Refonte plus large de Collect.jsx/Rapport.jsx (extraction logique métier — item « moyenne »
  de l'audit) ; on n'extrait ici que FieldRow.
- Audit WCAG formel/contrastes de couleurs (piste future, nécessite un outillage dédié).
