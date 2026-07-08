# Arbitre 2OP global (audit E3) — Design

> Statut : validé par Guillaume le 2026-07-08 (approche A + levier actionnable).
> Réf. audit : `docs/audit-2026-07-complet.md` §2.2 (élevée E3).

## Problème

L'option pour le barème progressif (case **2OP**) est **globale et annuelle** : elle s'applique
d'un bloc aux dividendes, intérêts ET plus-values mobilières de l'année (source :
`plus-values-mobilieres-crypto.json` → « option_bareme : Possible, globale pour tous revenus
du capital »). Or KAPIO émet aujourd'hui des recommandations **indépendantes par catégorie** :

- `arbitragePfuBareme()` (dividendes + intérêts seuls) → levier `arbitrage_pfu_bareme` du detector
  et champ `arbitrageCapital` de `computeFoyerSummary` ;
- `calcPvMobiliere().recommande` (PV seules) → note « ℹ️ Option barème (2OP) potentiellement plus
  avantageuse pour les PV » émise par `profileGenerator._capitalGainsBlock` (ligne ~320).

Ces deux verdicts peuvent se contredire (ex. barème pour les dividendes, PFU pour les PV) —
combinaison **impossible à déclarer**. Risque : conseil erroné.

**Hors périmètre 2OP (règle fiscale)** : la crypto (3AN) dispose de sa **propre** option barème,
distincte et indépendante de 2OP (depuis revenus 2023 — LFI 2022, cf. JSON crypto). Son arbitrage
`calcCrypto.recommande` est conservé tel quel, avec mention « option distincte de la case 2OP ».

## Contrainte structurante (pourquoi l'approche A)

Les données nécessaires à l'arbitrage **exact** (durée de détention, antériorité 2018,
moins-values reportées, type d'abattement) n'existent que dans le **formData au moment de la
génération** du profil. Le TXT n'expose en aval que des montants consolidés. Recalculer
l'arbitrage en aval (approche B) recréerait un second moteur approximatif ; enrichir le TXT de
toutes les données brutes (approche C) alourdirait le parser regex (zone fragile, audit §1.3).

**Décision : approche A** — l'arbitrage est calculé UNE fois à la génération, écrit dans le TXT
(source de vérité), et tout l'aval le lit.

## Décision produit

Quand la recommandation diffère de l'option déjà déclarée par l'utilisateur (dans **les deux
sens**, y compris « vous avez coché 2OP mais le PFU serait meilleur »), KAPIO affiche un
**levier chiffré actionnable** (carte Opportunités, seuil existant : économie ≥ 50 €), avec
rappel explicite que l'option est globale, annuelle, et couvre dividendes + intérêts + PV.

## Architecture

### 1. `arbitrage2OP()` — nouvelle fonction pure (taxCalculator.js)

```js
arbitrage2OP({
  dividendes = 0,        // 2DC bruts
  interets = 0,          // 2TR bruts
  pvNetImposable = 0,    // PV après imputation des moins-values (gainImposable de calcPvMobiliere)
  pvBaseIRBareme = 0,    // PV après MV ET abattements durée pré-2018 (baseIRBareme de calcPvMobiliere)
  rniFoyer = 0, parts = 1, isCouple = false,
}) => { pfu, bareme, recommande: 'pfu'|'bareme', economie, detail }
```

- **Scénario PFU** : IR = `PFU_TAUX_IR × (dividendes + interets + pvNetImposable)`.
- **Scénario barème** : IR marginal = `calcIR(rniFoyer + base2OP) − calcIR(rniFoyer)` où
  `base2OP = dividendes × (1 − abattement 40 %) + interets + pvBaseIRBareme − CSG déductible`.
  CSG déductible = `dont_csg_deductible_si_bareme (6,8 %) × (dividendes + interets + pvNetImposable)`.
- **PS 17,2 %** : identiques dans les deux scénarios (assiette pleine, sans abattement) —
  inclus dans `pfu`/`bareme` pour l'affichage, neutres pour la décision.
- Tous les taux depuis les exports JSON existants (`PFU_TAUX_IR`, `TAUX_PS_CAPITAL`,
  `DIV_ABATTEMENT_BAREME`, `pfuRaw.prelevements_sociaux.dont_csg_deductible_si_bareme`).
  Aucun littéral (verrou paperasse-first).
- **Approximation documentée** (héritée de `arbitragePfuBareme`) : la CSG déductible s'impute
  légalement l'année suivante ; elle est approximée la même année pour l'arbitrage indicatif.
  La déductibilité réduite de la CSG sur PV avec abattement durée n'est pas modélisée (même
  niveau d'approximation que l'existant, mentionné dans le JSDoc).
- `arbitragePfuBareme` et `calcPvMobiliere` **inchangés** (briques internes conservées).

### 2. Génération → TXT (profileGenerator.js, `_capitalGainsBlock`)

`_capitalGainsBlock` reçoit déjà `rniFoyer, parts, isCouple` et calcule `calcPvMobiliere`.
Ajouts :

- Passer `d.div_2dc` et `d.int_mob_2tr` (déjà dans le formData `d`).
- **Si `hasPvMob`** (PV mobilières présentes) : appeler `arbitrage2OP` et émettre, dans la
  section « PLUS-VALUES & CAPITAL » :
  *(Sans PV, le fallback aval — `arbitragePfuBareme` sur dividendes + intérêts — est déjà
  l'arbitrage global exact : PV = 0. Les lignes TXT ne sont donc émises que lorsque les PV
  rendent l'arbitrage partiel potentiellement faux.)*

```
Arbitrage 2OP foyer : PFU {X} € | barème {Y} € | recommandé : {PFU|barème} | économie {Z} €
Option 2OP déclarée : {Oui|Non}
```

  (montants via `fmtN` — espaces fines insécables ; le parser matche avec `[\s ]`.)
- La note PV isolée existante (« ℹ️ Option barème (2OP) potentiellement plus avantageuse pour
  les PV mobilières… ») est **supprimée**, remplacée si pertinent par :

```
ℹ️ Arbitrage 2OP : l'option {barème|PFU} serait plus avantageuse (~{Z} € d'écart) — option GLOBALE et annuelle (dividendes + intérêts + PV)
```

- La note crypto existante gagne la précision « (option distincte de la case 2OP) ».
- `Option 2OP déclarée` = `d.pv_mob_option_bareme === 'Oui'` (seul champ 2OP du formulaire).
  Le libellé du champ dans Collect.jsx (ligne ~229) est précisé :
  « Option barème global 2OP (dividendes + intérêts + PV) ? ».

### 3. Parsing (plugin `plus-values-mobilieres.plugin.js`)

Le parser du plugin lit les nouvelles lignes et expose dans parsedProfile :

| Champ | Type | Source TXT |
|---|---|---|
| `arb2opPfu` | number | `Arbitrage 2OP foyer : PFU X €` |
| `arb2opBareme` | number | `… barème Y €` |
| `arb2opRecommande` | `'pfu'\|'bareme'\|null` | `… recommandé : …` |
| `arb2opEconomie` | number | `… économie Z €` |
| `option2opDeclaree` | boolean | `Option 2OP déclarée : Oui` |

### 4. Consommation aval

- **`computeFoyerSummary`** : `arbitrageCapital` devient
  `{ pfu, bareme, recommande, economie, source: '2op' }` construit depuis les champs `arb2op*`
  si `arb2opRecommande` est présent ; **sinon fallback** sur l'appel actuel
  `arbitragePfuBareme(dividendes2DC, intMob2TR)` avec `source: 'fallback'`.
  Forme du champ inchangée pour les consommateurs (aucun usage UI direct constaté à ce jour).
- **`opportunitiesDetector`** : le levier `arbitrage_pfu_bareme` est réécrit :
  - si `arb2opRecommande` présent : déclenché quand `recommande` ≠ option déclarée et
    `arb2opEconomie ≥ 50` — **dans les deux sens** ; textes mis à jour (globalité, PV incluses) ;
  - sinon : comportement actuel conservé (div + intérêts, barème seulement).
  - **Aucune reco PV isolée** n'est plus émise nulle part.

### 5. Rétro-compatibilité & cas limites

- Ancien profil (sans lignes `Arbitrage 2OP`) → fallback = comportement actuel, jamais pire.
- Aucun revenu du capital → pas de ligne, pas de levier.
- PV seule (sans dividendes/intérêts) → l'arbitrage global couvre ce cas (angle mort actuel).
- Crypto seule → pas de ligne 2OP (crypto hors périmètre) ; arbitrage crypto inchangé.

## Tests

1. **Unitaires `arbitrage2OP`** : PFU gagnant (TMI ≥ 30 %), barème gagnant (TMI 11 % avec
   dividendes), PV pré-2018 avec abattement 65 % qui inverse la décision vs dividendes seuls,
   PV seule, tout à zéro (retour neutre).
2. **Anti-contradiction (cœur d'E3)** : sur un même profil généré, la recommandation du TXT,
   de `computeFoyerSummary.arbitrageCapital` et du levier detector est identique.
3. **Chaîne complète** : formData → `generateProfile` → `parseProfile` → summary (pattern
   phase 4 existant), incluant le cas « option déclarée ≠ optimum » → levier présent, et
   « option déclarée = optimum » → pas de levier.
4. **Fallback** : profil sans lignes 2OP → `arbitrageCapital.source === 'fallback'` et
   comportement identique à l'actuel.
5. Suite existante (718) verte ; verrou paperasse-first vert (aucun littéral nouveau).

## Hors périmètre (explicitement)

- Reformulation CIF-safe des textes de leviers → E5.
- Prise en compte de la CSG déductible en N+1 réel (projection pluriannuelle) → amélioration
  future, même niveau d'approximation que l'existant conservé.
- Arbitrage crypto (déjà correct, option distincte) — seule la mention est précisée.
