# Scénarios PER + sensibilité TMI de sortie — Design

> Statut : validé par Guillaume le 2026-07-09 (module pur + TMI résiduelle + sensibilité 0/11/30 %).
> Réf. audit : `docs/audit-2026-07-complet.md` §3 (priorité moyenne — scénarios A/B/C + risque législatif long terme).

## Problème

Le gap audit « pas de scénarios A/B/C » est **partiellement périmé** : `Rapport.jsx` contient déjà
un `PerScenariosTable` (A statu quo / B optimum / C intermédiaire / D plafond max, avec versement,
IR après, économie, effort net, rendement, badge « Optimal »). Mais :

1. La logique est **inline dans la page** — non testable, non réutilisable (Opportunités, chat),
   duplique `calcScen`/`stopRate` et `getEffectivePlafondsWithReports`.
2. **Aucune TMI résiduelle** par scénario : on ne voit pas que le versement fait descendre de tranche.
3. **Aucun bloc de sensibilité** à la TMI de sortie — le gap « risque législatif long terme »
   (que devient l'avantage PER si les règles / la TMI retraite changent dans 5-10 ans ?) reste ouvert.

## Principe

Extraire un **module déterministe pur** (aucun appel API — conforme au principe non-négociable
« déterministe où ça compte »), y ajouter la TMI résiduelle et la sensibilité, puis faire consommer
ce module par les composants existants. Parité stricte des scénarios actuels (test de non-régression).

## Architecture

### 1. `src/lib/perScenarios.js` (nouveau, pur)

Déplace `getEffectivePlafondsWithReports(p)` depuis Rapport.jsx (utilisé par `PerScenariosTable`
ET `PerZonesBlock` → dédup). Réutilise `calcIR`, `getTMI`, `computePerOptimumCascade`, `TRANCHES`
de taxCalculator. Aucun nouveau paramètre fiscal.

```js
// Plafonds PER effectifs (reports N-1/N-2/N-3 pro-ratés par RNI) — inchangé, déplacé ici.
export function getEffectivePlafondsWithReports(p) => { plafondD1, plafondD2 }

// Scénarios de versement PER, chiffrés sur le barème réel.
export function buildPerScenarios({
  rniFoyer, parts, isCouple, plafondD1, plafondD2, rniD1, rniD2, stopRate, irAvant,
}) => {
  scenarios: Array<{
    id: 'statu_quo'|'optimum'|'optimum_couple'|'partiel'|'plafond_max',
    label: string, desc: string,
    versement: number, irApres: number, economie: number, effort: number,
    rendement: number,          // economie / versement, %
    tmiResiduelle: number,      // getTMI(rniFoyer − versement, parts) — NOUVEAU
  }>,
  recommendedId: string,        // meilleure économie parmi B/C/D (logique bestScen actuelle)
  optimum: object,              // computePerOptimumCascade brut (déjà consommé ailleurs)
}

// Sensibilité de l'avantage NET du scénario recommandé à la TMI de sortie.
export function buildTmiSortieSensitivity({ versement, economie, stopRate }) => {
  versement, economie,
  points: Array<{ tmiSortie: number, avantageNet: number, estTmiDeclaree: boolean }>,
}
```

- **Scénarios** : reproduisent EXACTEMENT ceux affichés aujourd'hui (mêmes branches couple/solo,
  mêmes montants : optimum cascade, optimum prioritaire, partiel 75 %, plafond max). Test de parité.
- **`tmiResiduelle`** : `getTMI(Math.max(0, rniFoyer − versement), parts)`.
- **Sensibilité** :
  - Taux de sortie = les trois rates distincts les plus bas de `TRANCHES`
    (`[...new Set(TRANCHES.map(t => t[2]))].sort((a,b)=>a-b).slice(0, 3)` → 0, 0,11, 0,30) —
    dérivés du JSON barème, **aucun littéral 0.11/0.30** (verrou paperasse-first).
  - `avantageNet(tmiSortie) = economie − Math.round(versement × tmiSortie)`.
  - Modèle : avantage fiscal net à la sortie, **capitalisation de l'économie d'entrée ignorée**
    (hypothèse prudente, joue en faveur de l'épargnant) et **hors PFU sur les gains** — étiqueté
    comme estimation dans l'UI. C'est le pendant « report d'imposition » du différentiel TMI.
  - `estTmiDeclaree` = `Math.round(tmiSortie * 100) === Math.round(stopRate * 100)`.
  - Ancré sur le scénario **recommandé** (`versement`/`economie` de `recommendedId`).

### 2. `PerScenariosTable` (Rapport.jsx) — consomme le module

- Supprime `calcScen`, la construction `scenarios`, `getEffectivePlafondsWithReports` inline.
- Appelle `buildPerScenarios(...)` puis rend le tableau existant + **colonne « TMI après »**
  (`e0`-style : `${tmiResiduelle} %`).
- Sous le tableau, **mini-bloc sensibilité** (rendu depuis `buildTmiSortieSensitivity`) :
  phrase pédagogique « Le PER est un report d'imposition : l'avantage net dépend de votre taux
  d'imposition à la retraite » + 3 cellules 0/11/30 % avec l'avantage net ; la cellule
  `estTmiDeclaree` surlignée ; signal `text-red` si `avantageNet ≤ 0` (« PER neutre/perdant à
  cette TMI de sortie »). Footer d'estimation (capitalisation/PFU ignorés).
- Le composant reste sous MotionConfig/E6 (aucun hook conditionnel introduit).

### 3. `PerZonesBlock` (Rapport.jsx)

Importe `getEffectivePlafondsWithReports` depuis le module au lieu du helper local (dédup ;
comportement identique).

## Tests (`src/lib/__tests__/per-scenarios.test.js`)

1. **Parité** : profil solo TMI 30 % connu → `buildPerScenarios` produit les mêmes versements et
   économies que le tableau actuel (valeurs figées).
2. **TMI résiduelle** : un versement qui ramène le quotient sous une borne de tranche → `tmiResiduelle`
   strictement inférieure à la TMI de départ.
3. **Sensibilité** : `avantageNet` strictement décroissant quand `tmiSortie` croît ; = `economie`
   à tmiSortie 0 ; passe ≤ 0 dès que `tmiSortie ≥ rendement/100` (cohérence report d'imposition).
4. **Paperasse-first** : les taux de sortie sont exactement les 3 rates les plus bas de `TRANCHES`
   (test dérive la valeur attendue du barème, pas de littéral) ; verrou `paperasse-first.test.js`
   reste vert.
5. **Couple** : `recommendedId` pointe le scénario à meilleure économie ; `getEffectivePlafondsWithReports`
   inclut bien les reports pro-ratés.
6. Smoke test Rapport (E6) et suite complète verts.

## Hors périmètre

- Projection de capitalisation long terme (déjà `simulator/calc.js`, envelope 'per').
- Levier `per_optimal` du détecteur (inchangé — il pointe déjà vers l'optimum cascade).
- Actualisation/discount des flux futurs (le modèle de sensibilité est volontairement
  non actualisé et transparent).
