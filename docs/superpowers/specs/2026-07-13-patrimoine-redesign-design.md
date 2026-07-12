# Refonte visuelle de la page Patrimoine

**Date** : 2026-07-13 · **Approche retenue** : A — restyler en place (validée par l'utilisateur)

## Problème

La page `/patrimoine` et ses 5 composants enfants sont restés en style « prototype » :
boutons `bg-blue-600`, fonds clairs (`bg-red-50`), texte `text-gray-500` illisible sur fond
sombre, couleurs de graphiques hors palette (`#2563eb`). Rien n'utilise le design system
Kapio (`ink`/`kapio`, `card-dark`, `GlowCard`, `AnimatedNumber`, framer-motion).

## Objectif

Aligner la page sur l'expérience du Dashboard : dark, cartes lumineuses, montants animés,
palette teal kapio, animations d'entrée — **sans toucher à la logique métier**.

## Fichiers concernés

| Fichier | Changement |
|---|---|
| `src/components/Layout.jsx` | Ajouter `/patrimoine` à `FULL_WIDTH_PAGES` |
| `src/pages/Patrimoine.jsx` | Refonte du JSX : hero, stat cards, sections, composants UI locaux |
| `src/components/patrimoine/ConnectBankButton.jsx` | Restyle dark + repli derrière un bouton (sauf config initiale) |
| `src/components/patrimoine/ManualPositions.jsx` | Restyle dark + formulaire replié derrière « Ajouter un placement » |
| `src/components/patrimoine/AccountsList.jsx` | Restyle `card-dark`, lignes façon InfoRow |
| `src/components/patrimoine/AllocationDonut.jsx` | Palette kapio, tooltip dark custom, légende |
| `src/components/patrimoine/NetWorthChart.jsx` | Stroke/gradient kapio, axes `ink`, tooltip dark |
| Tests `__tests__/` | ~2 ajustements : cliquer le bouton de dépliage avant de remplir |

## Design

### 1. Structure & hero
- Page pleine largeur (conteneur interne `max-w-7xl mx-auto px-6 py-10`, comme Dashboard).
- En-tête : titre + sous-titre, bouton **Actualiser** ghost (icône `RotateCcw` qui tourne
  pendant `loading`, texte « Actualisation… »).
- Trois cartes : grande `GlowCard` **Patrimoine net** (`AnimatedNumber`, `text-4xl font-bold
  tracking-tight`), cartes **Actifs** (accent `success-400`) et **Dettes** (accent `danger-400`).
- Erreurs de synchro : bandeau `role="alert"` sombre — `border-warning-500/30
  bg-warning-500/10 text-warning-400`.

### 2. Graphiques
- Deux `GlowCard` côte à côte (`grid md:grid-cols-2`).
- Donut : couleurs `['#5ECFAE', '#2EB88A', '#1D9E75', '#F59E0B', '#34D399', '#FBBF24',
  '#F87171', '#71717A']`, tooltip dark (fond `ink-800`, montant `font-mono text-kapio-300`),
  légende sous le graphique.
- Courbe : `stroke #2EB88A`, fill dégradé teal (`linearGradient` SVG), axes `#71717A`
  taille 11, tooltip dark identique.

### 3. Comptes synchronisés
- `card-dark p-6`, titre de section avec icône (`Landmark`), groupe par banque,
  lignes `flex justify-between py-2.5 border-b border-white/[0.04]`, montants
  `font-semibold text-ink-0` à droite, labels `text-ink-100`.

### 4. Formulaires repliés
- Boutons « Connecter une banque » / « Ajouter un placement » → dépliage animé
  (framer-motion, hauteur + opacité, ease `[0.16, 1, 0.3, 1]`).
- Exception : backend non configuré → formulaire de configuration visible directement.
- Inputs/selects dark : `bg-ink-800 border border-white/[0.08] rounded-lg px-3 py-2
  text-ink-0 focus:border-kapio-500/50 focus:ring-1 focus:ring-kapio-500/30 outline-none`.
- Bouton primaire : dégradé kapio (`bg-kapio-gradient` ou `bg-kapio-500 hover:bg-kapio-400`).
- Suppression d'une ligne manuelle : icône `X` `text-ink-300 hover:text-danger-400`.

### 5. Motion & typo
- Entrée de page : sections en `slide-up` échelonné (classes `animate-slide-up`,
  `-d1`, `-d2`, `-d3` existantes) ou framer-motion équivalent.
- Montants animés via `AnimatedNumber` ; hover lift via `GlowCard`.
- Labels de stat : `text-xs uppercase tracking-widest text-ink-100 font-semibold`.
- Tous les montants en `toLocaleString('fr-FR')` (règle CLAUDE.md).

## Invariants (à ne pas casser)

- Logique métier intacte : `refresh()`, stores (`backendConfigStore`, `manualStore`,
  `history`), providers GoCardless, `calculator.js`.
- Libellés des champs inchangés (« URL du backend », « Jeton secret », « Libellé »,
  « Valeur (€) », « Ajouter »…) — les tests les ciblent par texte.
- Mode couple (sélecteur Titulaire) conservé.
- Accessibilité : labels associés, `role="alert"`, `aria-label` sur suppression.
- Les 150+ tests existants restent verts (2 ajustements de dépliage autorisés).

## Validation

- `npx vitest run` vert.
- `npx eslint` propre sur les fichiers touchés.
- Vérification visuelle Playwright (mode démo) : desktop 1280/1440 + mobile 390,
  aucun débordement horizontal, contrastes lisibles.
