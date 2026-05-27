# Audit PER 2026 — État actuel et plan d'exécution

> Produit le 2026-05-27. Aucune modification de code à ce stade — document de cadrage uniquement.

---

## 1. Référence légale

### Texte de référence

**Art. 163 quatervicies CGI** (rédaction issue de la loi PACTE 2019) + **BOI-IR-BASE-20-50-20**.

### Formule officielle (versements 2025, déclaration 2026)

```
Plafond PER brut = MAX(
    10 % × revenus professionnels nets N-1,       ← salaires après abattement forfaitaire 10 %
                                                      (ou frais réels si option exercée)
                                                      + BNC/BIC nets de charges
    10 % × PASS N-1                               ← plancher garanti même sans revenus
)
capped à                10 % × 8 × PASS N-1       ← plafond absolu

Plafond disponible = Plafond brut
    − cotisations PERO obligatoires N-1            ← cases 6QS/6QT/6QU
    − abondement employeur PEE/PERCO N-1           ← fraction > participation/intéressement
    + reports plafonds non utilisés N-3, N-2, N-1  ← ordre FIFO (art. 163 quat. I-2°)
```

### Paramètres 2025 (PASS 2025 = 47 100 €)

| Borne | Montant | Base |
|---|---|---|
| Plancher | **4 710 €** | 10 % × 47 100 € |
| Plafond absolu | **37 680 €** | 10 % × 8 × 47 100 € |

### Cases 2042 concernées

| Case | Usage |
|---|---|
| **6NS** | Versements PER volontaires Déclarant 1 |
| **6NT** | Versements PER volontaires Déclarant 2 |
| **6NU** | Versements PER volontaires (usage interne DGFiP) |
| **6QR** | Case à cocher : mutualisation plafonds époux/pacsés |
| **6QS** | Cotisations PERO obligatoires D1 (part salariale) |
| **6QT** | Cotisations PERO obligatoires — compartiment patronal |
| **6QU** | Autres cotisations retraite supplémentaire |

### Rappel : PERO vs PER individuel

- **PERO** (ex-art. 83) : cotisations déduites **avant** le calcul du net imposable 1AJ → aucune déduction supplémentaire sur la 2042. Cases 6QS/6QT/6QU servent **uniquement** à informer la DGFiP pour réduire le plafond PER de l'année suivante.
- **PER individuel** : versements à renseigner cases 6NS/6NT → déduction du RNI de l'année.

---

## 2. Cartographie — Où le PER est-il calculé ?

| Fichier | Fonction / Composant | Inputs utilisés | Formule appliquée | Résultat produit |
|---|---|---|---|---|
| `src/data/paperasse/fiscaliste/data/per-plafonds.json` | Données de référence | PASS 2024/2025/2026, sources BOFiP | N/A — JSON statique | `plancher_euros = 4 710`, `plafond_absolu_euros = 37 680`, ordres reports, mutualisation couple |
| `src/data/paperasse/fiscaliste/references/per.md` | Documentation chat | — | N/A — Markdown narratif | Skill injecté dans le système prompt Claude |
| `src/lib/taxCalculator.js` :289–294 | `calcPlafondPer(netImpSalaire, peroEmployeur)` | `netImpSalaire` (1AJ), `peroEmployeur` | `max(min(10%×abatt10(1AJ), MAX), MIN) − pero` | Plafond net D1 ou D2 (pas les reports) |
| `src/lib/taxCalculator.js` :318–383 | `computePerOptimumCascade(rniFoyer, parts, plafondD1, plafondD2, …)` | RNI foyer, plafonds D1/D2, TMI stop rate | Cascade descendante par tranche : effacement depuis TMI jusqu'à `stopRate` | `optimumTotal`, `optimumD1/D2`, `economieOptimum`, `effortNet`, `zones[]` |
| `src/lib/profileGenerator.js` :19–27 | `fmtPlafondPer(netImp, pero)` | `netImp` (1AJ), `pero` | **Idem `calcPlafondPer`** — code dupliqué | `{ brut10, plafond, dispo }` — écrit dans le TXT |
| `src/lib/profileGenerator.js` :106–111 (solo), :292–307 (couple) | `_buildSolo`, `_buildCouple` | Résultat `fmtPlafondPer`, reportables N-1/N-2/N-3 | Affichage dans la section `== PLAFOND(S) PER 2026 ==` | Lignes TXT : `PLAFOND DISPONIBLE [D1/D2]`, `Plafond reportable N-x` |
| `src/lib/profileParser.js` :132–148 | `_per(text)` | TXT brut — regex sur lignes `PLAFOND DISPONIBLE` et `Plafond reportable N-x` | Lecture passive (pas de calcul) | `plafondPerD1`, `plafondPerD2`, `plafondPerTotal`, `perReportableN1/N2/N3`, `perReportableTotal` |
| `src/pages/Simulator.jsx` :1774–1807 | `profileData` (mode profil) | `parsedProfile.rniD1/D2`, `peroD1/D2`, `perReportableTotal` | `max(min(10%×rniD1, MAX), MIN) − pero + report_pro_rata` | `perCalcD1/D2.plafondWithReports` — borne max des curseurs |
| `src/pages/Simulator.jsx` :1748–1756 | `perCalc` (mode manuel) | `rni`, `pero`, `anterieurs` (saisis manuellement) | `max(10%×rni, MIN) − pero + anterieurs` | `plafondTotal` — borne curseur en mode manuel |
| `src/pages/Simulator.jsx` :348–357 | `SimPER` — `useState` init | `plafondD1/D2`, `computePerOptimumCascade` | Initialisation des curseurs sur l'optimum fiscal | Valeur initiale `versementD1/D2` |
| `src/pages/Simulator.jsx` :382–395 | `SimPER` — `res` useMemo | `versementD1/D2`, `rniFoyer`, `parts` | `calcIR(rni, parts) - calcIR(rni - versement, parts)` | Économie IR réelle, effort net, TMI résiduelle |
| `src/pages/Rapport.jsx` :945–1082 | `PerZonesBlock({ p, d })` | `p.plafondPerD1/D2` (parsedProfile), `d.rniFoyer` | `computePerOptimumCascade` sans reports | Zones prioritaires affichées dans le rapport |
| `src/lib/opportunitiesDetector.js` :67–101 | `detectOpportunities` — bloc PER | `parsedProfile.plafondPerD1/D2`, `rniFoyer` | `computePerOptimumCascade` sans reports | Opportunité `per_optimal` |
| `src/pages/DeclarationGuide.jsx` :456–479 | `StepPER` | `parsedProfile.peroD1` → `per6QS` | Affichage passif, case 6QS | Guide case 6QS seulement (PERO) |

---

## 3. Incohérences détectées

### INC-01 🔴 — Abondement PEE/PERCO non déduit du plafond

**Fichiers : tous** (taxCalculator.js, profileGenerator.js, Simulator.jsx, opportunitiesDetector.js, Rapport.jsx)

**Code actuel :**
```js
// taxCalculator.js:289–294
export function calcPlafondPer(netImpSalaire, peroEmployeur = 0) {
  const base    = abattement10(netImpSalaire || 0);
  const brut    = base > 0 ? Math.round(base * 0.1) : 0;
  const plafond = Math.min(Math.max(brut, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  return Math.max(0, plafond - (peroEmployeur || 0));  // ← seul le PERO est déduit
}
```

**Problème :** La formule légale impose de déduire aussi l'**abondement employeur PEE/PERCO** de l'année N-1. La variable `percoAbondD1` est parsée (profileParser.js:191) et stockée dans parsedProfile, mais elle n'est **jamais soustraite** du plafond dans aucun des points de calcul.

**Impact utilisateur :** Plafond surestimé pour tout salarié bénéficiant d'abondement employeur. Cas concret : abondement 3 770 € → plafond annoncé de 14 710 € au lieu de 10 940 €. L'utilisateur risque de verser au-delà de la déductibilité réelle.

**Sévérité :** 🔴 Calcul légal incorrect.

**Fix proposé :**
1. Modifier la signature de `calcPlafondPer(netImpSalaire, peroEmployeur = 0, abondementPEEPERCO = 0)` dans `taxCalculator.js`
2. Ajouter un champ de saisie "Abondement employeur PEE/PERCO 2025" dans `Collect.jsx` (module `epargneSalariale`)
3. Parser ce champ dans `profileParser._epargneDecl` (regex sur `percoAbond{sfx}` — déjà parsé ! ligne 191)
4. Propager dans profileGenerator et Simulator
5. Ajouter dans DeclarationGuide une note explicative

---

### INC-02 🟡 — `fmtPlafondPer` duplique `calcPlafondPer`

**Fichier :** `src/lib/profileGenerator.js` :19–27  
**Référence parallèle :** `src/lib/taxCalculator.js` :289–294

**Code actuel :**
```js
// profileGenerator.js:19–27 — copie identique
function fmtPlafondPer(netImp, pero) {
  const base    = abattement10(netImpN);
  const brut10  = base > 0 ? Math.round(base * 0.10) : 0;
  const plafond = Math.min(Math.max(brut10, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  const dispo   = Math.max(0, plafond - peroN);
  return { brut10, plafond, dispo };
}
```

**Problème :** Toute correction de `calcPlafondPer` dans `taxCalculator.js` (p.ex. INC-01) devra être dupliquée manuellement dans `profileGenerator.js`. Risque de divergence silencieuse.

**Sévérité :** 🟡 DRY violation, risque de dérive.

**Fix proposé :**  
Remplacer `fmtPlafondPer` par un appel direct à `calcPlafondPer` (déjà importé dans le fichier ligne 1). Adapter pour retourner `{ brut10, plafond, dispo }`.

---

### INC-03 🟡 — Reports FIFO présents dans Simulator, absents d'opportunitiesDetector et Rapport.PerZonesBlock

**Fichier A (correct) :** `src/pages/Simulator.jsx` :1782–1793  
**Fichiers B (manquants) :** `src/lib/opportunitiesDetector.js` :69, `src/pages/Rapport.jsx` :948–954

**Code actuel — Simulator (correct) :**
```js
// Simulator.jsx:1782–1789
const reportTotal = (pp.perReportableTotal || 0);
const reportD1    = isCouple ? Math.round(reportTotal * (rniD1 / rniTot)) : reportTotal;
const plafondWithReportsD1 = plafondNetD1 + reportD1;
```

**Code actuel — opportunitiesDetector (manquant) :**
```js
// opportunitiesDetector.js:69
const opt = computePerOptimumCascade(
  rniFoyer, nbParts,
  plafondPerD1 || 0,   // ← plafond net seul, sans reports
  plafondPerD2 || 0,
  ...
);
```

**Code actuel — Rapport.PerZonesBlock (manquant) :**
```js
// Rapport.jsx:948–953
const plafondD1 = p.plafondPerD1 || 0;   // ← plafond net seul
const plafondD2 = p.plafondPerD2 || 0;
const opt = useMemo(
  () => computePerOptimumCascade(d.rniFoyer, parts, plafondD1, plafondD2, ...),
  ...
);
```

**Problème :** Un utilisateur avec 10 000 € de reports N-1/N-2/N-3 verra dans le Simulateur un plafond de, par exemple, 14 710 € (4 710 + 10 000), mais dans le Rapport et les Opportunités un plafond de seulement 4 710 €. L'économie IR optimale affichée est donc **sous-estimée** dans ces deux pages.

**Sévérité :** 🟡 Incohérence inter-pages, minore potentiellement l'optimum conseillé.

**Fix proposé :**  
Créer une fonction helper `computePlafondAvecReports(p, declarant)` dans `taxCalculator.js` qui factorise le calcul Simulator:1774–1807. L'appeler depuis opportunitiesDetector et Rapport.PerZonesBlock.

---

### INC-04 🟡 — MAX_PLAFOND_PER non appliqué en mode manuel (Simulator)

**Fichier :** `src/pages/Simulator.jsx` :1748–1756  

**Code actuel :**
```js
// Simulator.jsx:1748–1756 — mode manuel
const plafondBrut = Math.max(Math.round(rni * 0.1), MIN_PLAFOND);
// ↑ Math.min(..., MAX_PLAFOND_PER) ABSENT
const plafondNet  = Math.max(0, plafondBrut - pero);
const plafondTotal = plafondNet + anterieurs;
```

**Cas incriminé :** Pour un RNI manuel saisi à 400 000 €, le plafond calculé serait 40 000 € au lieu de 37 680 € (plafond absolu légal). Slider PER alors borné à une valeur illégale.

**Sévérité :** 🟡 Rare (RNI > 376 800 € requis), mais calcul illégal affiché.

**Fix proposé :** 1 ligne — ajouter `Math.min(plafondBrut, MAX_PLAFOND_PER)` :
```js
const plafondBrut = Math.min(Math.max(Math.round(rni * 0.1), MIN_PLAFOND), MAX_PLAFOND_PER);
```

---

### INC-05 🟡 — Frais réels non pris en compte dans le calcul du plafond PER

**Fichiers :** `src/lib/taxCalculator.js` :289–294, `src/lib/profileGenerator.js` :19–27, `src/pages/Simulator.jsx` :1777

**Code actuel :**
```js
// taxCalculator.js:290 — l'abattement forfaitaire 10% est TOUJOURS appliqué
const base = abattement10(netImpSalaire || 0);
```

**Problème :** Si un utilisateur a opté pour les frais réels supérieurs à l'abattement forfaitaire, son RNI réel est `1AJ − frais réels` (non `1AJ − abattement10`). Le plafond PER doit être `10 % × RNI réel`. Le code applique systématiquement `abattement10()` donc **surestime le plafond** pour les profils en frais réels.

**Impact :** Profils concernés : ceux ayant saisi des frais réels dans la collecte. La valeur de `fraisReels` est collectée et inscrite dans le TXT mais elle n'est pas stockée dans `parsedProfile` comme champ numérique utilisable dans le calcul du plafond.

**Sévérité :** 🟡 Cas non marginal (salariés avec trajet long, double résidence, etc.).

**Fix proposé :**  
- Ajouter `fraisReelsD1` / `fraisReelsD2` dans `parsedProfile` (extraire depuis le TXT)
- Dans `calcPlafondPer`, si `fraisReels > abattement10(1AJ)`, utiliser `1AJ − fraisReels` comme base

---

### INC-06 🟢 — `percoD1/D2` mal nommé (contient les versements PER volontaires, pas l'abondement)

**Fichier :** `src/lib/profileParser.js` :184

**Code actuel :**
```js
// profileParser.js:184
[`perco${sfx}`]: n(sec, /PER versements 2025\s*:\s*([\d\s,]+)\s*€/),
```

**Problème :** La regex capture la ligne "PER versements 2025" du profil, qui correspond aux **versements volontaires PER individuel** de l'utilisateur (cases 6NS/6NT). La variable est nommée `percoD1` ce qui suggère l'abondement PERCO collectif — c'est l'inverse. `percoAbondD1` (ligne 191) capture lui l'abondement réel.

**Utilisation downstream :** `percoD1` est sommé dans `epargneLongTerme` (profileParser.js:278) — c'est utilisé pour l'allocation patrimoniale sur le Dashboard, pas dans le calcul de plafond PER. Pas d'impact fiscal immédiat.

**Sévérité :** 🟢 Confusant mais non bloquant pour les calculs fiscaux. Risque de mauvaise lecture du code lors des évolutions futures.

**Fix proposé :** Renommer `percoD1/D2` → `versementPerD1/D2` dans parser, emptyProfile, et toutes les pages qui lisent cette variable.

---

### INC-07 🟢 — DeclarationGuide ne couvre pas les cases 6NS/6NT (versements PER volontaires)

**Fichier :** `src/pages/DeclarationGuide.jsx` :456–479

**Code actuel :**
```js
// DeclarationGuide.jsx:213
{ id: 's_per', icon: '🏛️', title: 'PER / PERO', itemIds: ['done_6qs'], show: parsed.hasPER },
// hasPER = pp.peroD1 > 0 || pp.peroD2 > 0 || pp.percoD1 > 0
```

L'étape PER est uniquement déclenchée si `peroD1 > 0 || peroD2 > 0 || percoD1 > 0`. Elle guide **uniquement la case 6QS** (cotisations PERO). Un utilisateur qui verse sur un PER individuel (case 6NS) ne voit pas cette étape.

**Sévérité :** 🟢 Trou fonctionnel visible par les utilisateurs qui ont versé sur un PER volontaire.

---

### INC-08 🟢 — Case 6QR (mutualisation couple) absente de toute la chaîne

**Impact :** Aucun champ de collecte, aucun calcul de mutualisation, aucun guide dans DeclarationGuide. Un couple où D2 n'a aucun revenu laisse son plafond plancher (4 710 €) inutilisé — sauf si D1 l'utilise via 6QR.

**Sévérité :** 🟢 Manque fonctionnel mineur — la mutualisation n'est que rarement avantageuse (D2 sans revenus).

---

## 4. Trous fonctionnels

| Trou | Description | Impact |
|---|---|---|
| **TF-01** | Abondement PEE/PERCO employeur N-1 non collecté, non déduit du plafond | Plafond surestimé pour salariés avec abondement |
| **TF-02** | Case 6QR (mutualisation couple) absente — collecte, calcul, guide | Couples D1/D2 asymétriques ne voient pas l'opportunité |
| **TF-03** | Cases 6NS/6NT absentes du DeclarationGuide | Utilisateurs avec PER volontaire non guidés |
| **TF-04** | Ordre FIFO des reports non implémenté — tout est additionné | Plafond légèrement inexact si reports ont des millésimes différents (en pratique : impact nul sur le montant total utilisable) |
| **TF-05** | Frais réels non propagés dans le calcul du plafond PER | Plafond surestimé pour salariés en frais réels |

---

## 5. Plan d'exécution séquentiel

Chaque étape est conçue pour laisser le code en état **tests verts + build OK**.

---

### Étape 1 — Corriger MAX_PLAFOND en mode manuel (Simulator)

**Priorité :** Haute — bug légal, 1 ligne  
**Fichier :** `src/pages/Simulator.jsx` :1752  
**Effort :** ~5 min, 1 ligne modifiée  
**Test de non-régression :** Simulateur mode manuel, RNI = 500 000 € → plafond affiché = 37 680 €

```js
// Avant
const plafondBrut = Math.max(Math.round(rni * 0.1), MIN_PLAFOND);
// Après
const plafondBrut = Math.min(Math.max(Math.round(rni * 0.1), MIN_PLAFOND), MAX_PLAFOND_PER);
```

**Risque :** Nul.

---

### Étape 2 — Éliminer la duplication `fmtPlafondPer` → `calcPlafondPer`

**Priorité :** Haute — prérequis aux étapes suivantes pour ne modifier qu'un seul endroit  
**Fichier :** `src/lib/profileGenerator.js` :19–27, :46, :209  
**Effort :** ~30 min, ~15 lignes modifiées  

Remplacer `fmtPlafondPer()` par un appel à `calcPlafondPer()` (déjà importé). Adapter pour retourner le `brut10` dont la section TXT a besoin.

```js
// Avant (profileGenerator.js)
function fmtPlafondPer(netImp, pero) { ... }

// Après — wrapper minimaliste
function fmtPlafondPer(netImp, pero) {
  const netImpN = parseFloat(netImp || 0);
  const peroN   = parseFloat(pero   || 0);
  const base    = abattement10(netImpN);
  const brut10  = base > 0 ? Math.round(base * 0.10) : 0;
  const dispo   = calcPlafondPer(netImpN, peroN);
  const plafond = Math.min(Math.max(brut10, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  return { brut10, plafond, dispo };
}
```

**Test :** `npm run build` vert. Comparer TXT profil généré avant/après sur la fixture `profil-fiscal-ref.txt` (aucune différence attendue).

**Risque :** Faible.

---

### Étape 3 — Factoriser `computePlafondPERDeclarant` dans taxCalculator

**Priorité :** Haute — prérequis INC-03  
**Fichier :** `src/lib/taxCalculator.js`  
**Effort :** ~45 min, ~40 lignes ajoutées  

Extraire la logique de calcul de plafond + report qui existe dans `Simulator.jsx:1774–1807` en une fonction exportée :

```js
/**
 * Calcule le plafond PER disponible pour un déclarant,
 * reports FIFO inclus, abondement PEE/PERCO déduit.
 * Source de vérité unique pour Simulator, Rapport et opportunitiesDetector.
 *
 * @param {object} opts
 * @param {number} opts.rni              - RNI individuel (post-abattement 10%)
 * @param {number} [opts.pero=0]         - Cotisations PERO obligatoires N-1
 * @param {number} [opts.abondPEEPERCO=0] - Abondement employeur PEE/PERCO N-1
 * @param {number} [opts.reportN1=0]     - Plafond reportable N-1
 * @param {number} [opts.reportN2=0]     - Plafond reportable N-2
 * @param {number} [opts.reportN3=0]     - Plafond reportable N-3
 * @returns {{ plafondBrut, plafondNet, plafondWithReports, reportTotal }}
 */
export function computePlafondPERDeclarant({ rni, pero = 0, abondPEEPERCO = 0, reportN1 = 0, reportN2 = 0, reportN3 = 0 }) { ... }
```

**Test :** Ajouter des tests unitaires dans `taxCalculator.test.js` couvrant :
- Plancher (rni = 0 → 4 710 €)
- Plafond absolu (rni = 500 000 → 37 680 €)
- Déduction PERO
- Reports additionnés

**Risque :** Moyen — nouvelle API publique, doit être rétrocompatible.

---

### Étape 4 — Migrer Simulator, Rapport, opportunitiesDetector vers la nouvelle fonction

**Priorité :** Haute (suite INC-03)  
**Fichiers :** `src/pages/Simulator.jsx` (~25 lignes), `src/pages/Rapport.jsx` (~10 lignes), `src/lib/opportunitiesDetector.js` (~5 lignes)  
**Effort :** ~1h  

Remplacer le calcul inline Simulator.jsx:1774–1807 par des appels à `computePlafondPERDeclarant()`.

**Test :** Charger le profil fixture dans le Simulateur, vérifier que les plafonds D1/D2 sont identiques avant/après. Vérifier que Rapport et Opportunités affichent les mêmes plafonds que le Simulateur.

**Risque :** Moyen — changement dans 3 pages critiques.

---

### Étape 5 — Ajouter l'abondement PEE/PERCO dans le plafond (INC-01)

**Priorité :** Haute — correction légale  
**Fichiers :** `src/pages/Collect.jsx` (champ saisie), `src/lib/profileGenerator.js` (section TXT), `src/lib/profileParser.js` (regex), `src/lib/taxCalculator.js` (signature `computePlafondPERDeclarant`)  
**Effort :** ~2h  

1. Ajouter champ `abond_pee_d1` / `abond_pee_d2` dans Collect.jsx (module `epargneSalariale`, côté `advanced`)
2. Écrire la ligne dans le TXT dans profileGenerator
3. Parser dans `_epargneDecl` (une regex sur la nouvelle ligne TXT)
4. Passer dans `computePlafondPERDeclarant({ ..., abondPEEPERCO: percoAbondD1 })`

**Test :** Ajouter un test : abondement 3 770 €, RNI 60 000 € → plafond = `max(6000, 4710) − 3 770 = 2 230 €`. Vérifier sur fixture que profil sans abondement n'est pas affecté.

**Risque :** Élevé — changement de schéma TXT + migration de profils existants (voir §6).

---

### Étape 6 — Frais réels dans le calcul du plafond PER (INC-05)

**Priorité :** Moyenne  
**Fichiers :** `src/lib/profileParser.js`, `src/lib/taxCalculator.js`  
**Effort :** ~1h  

1. Parser `fraisReelsD1/D2` depuis le TXT (ligne "Frais réels : X € (à comparer forfait 10%)")
2. Dans `computePlafondPERDeclarant`, si `fraisReels > abattement10(netImp)`, utiliser `netImp − fraisReels` comme base
3. Ajouter `fraisReelsD1` / `fraisReelsD2` dans `emptyProfile()`

**Test :** Frais réels = 20 000 €, 1AJ = 80 000 € → base = 60 000 € → plafond = max(6 000, 4 710) = 6 000 €. Sans frais réels même profil : base = abatt10(80 000) = 72 000 € → plafond = 7 200 €.

**Risque :** Faible — les frais réels sont déjà parsés comme texte.

---

### Étape 7 — Cases 6NS/6NT dans DeclarationGuide (TF-03)

**Priorité :** Moyenne  
**Fichier :** `src/pages/DeclarationGuide.jsx`  
**Effort :** ~1h, ~60 lignes ajoutées  

1. Modifier `hasPER` dans `adaptParsedProfile` pour inclure `percoD1 > 0` (versements PER volontaires)
2. Ajouter une `CaseRow` pour 6NS et 6NT dans `StepPER`
3. Exposer le champ `percoD1` via `per6NS: orNull(pp.percoD1)` (renommage cohérent avec INC-06 si fait avant)

**Risque :** Faible.

---

### Étape 8 — Case 6QR mutualisation couple (TF-02)

**Priorité :** Basse  
**Fichier :** `src/pages/DeclarationGuide.jsx`, `src/pages/Collect.jsx`  
**Effort :** ~45 min  

Ajouter dans StepPER une mention de la case 6QR avec logique : si couple et plafondD2 > 0 et versementD1 > plafondD1 → suggérer 6QR.

**Risque :** Faible.

---

### Étape 9 — Renommer `percoD1` → `versementPerD1` (INC-06)

**Priorité :** Basse — refactor de lisibilité  
**Fichiers :** `profileParser.js`, `profileGenerator.js`, `emptyProfile()`, Dashboard, Rapport, opportunitiesDetector  
**Effort :** ~1h (grep + remplacement + tests)  
**Risque :** Faible mais large surface.

---

## 6. Risques de régression

### 6.1 Profils localStorage existants

**Impact des étapes 5 et 9 uniquement.**

- L'étape 5 ajoute une nouvelle clé `abondPEEPERCO` dans le profil TXT. Les profils existants sans cette ligne calculeront `abondPEEPERCO = 0` — comportement rétrocompatible (pas de déduction supplémentaire). ✅ Pas de migration nécessaire.
- L'étape 9 renomme `percoD1/D2` dans parsedProfile. `emptyProfile()` doit être mis à jour, et les composants qui lisent `p.percoD1` doivent utiliser le nouveau nom. **Risque** : oubli d'une occurrence dans un composant non listé → valeur silencieusement `undefined`. Faire une passe grep exhaustive avant de merger.

**Mitigation :** Tester avec la fixture `profil-fiscal-ref.txt` via DevFixtures (`/dev/fixtures`) après chaque étape.

### 6.2 TXT profil généré — format stable

La section `== PLAFOND(S) PER 2026 ==` est écrite par `profileGenerator` et lue par `profileParser._per()`. La regex du parser utilise des patterns suffisamment souples pour absorber de légères variations de libellé. Les nouvelles lignes (abondement) seront ajoutées à la fin de la section — non-breaking pour les regex existantes.

### 6.3 Skills chat

`per.md` et `per-plafonds.json` sont injectés dans le système prompt de Claude via `skillsLoader.js`. Si `per-plafonds.json` est modifié (étape 3 pour ajouter des clés), le chat chargera automatiquement la version à jour — pas de changement de code `skillsLoader` nécessaire.

### 6.4 Tests existants

Les 122 tests actuels ne couvrent pas directement `calcPlafondPer`. Les risques de régression sur les tests existants sont limités à :
- `taxCalculator.test.js` : vérifier que `calcIR`, `baseIRFoyer`, etc. restent stables
- `profileParser.test.js` : vérifier que les nouvelles regex n'entrent pas en conflit
- `simulator/calc.test.js` : le PER test (ligne 50–56) utilise `envelope('per', ...)` — non affecté par les calculs de plafond

---

## 7. Critères de validation finaux

- [ ] **INC-01** : Pour un profil avec abondement PEE 2 000 €, PERO 1 000 €, RNI 60 000 € → plafond affiché dans Simulator = `max(6 000, 4 710) − 1 000 − 2 000 = 3 000 €` (au lieu de 5 000 € avant le fix)
- [ ] **INC-02** : Aucun fichier `fmtPlafondPer` dupliqué — un seul point de vérité dans `taxCalculator.js`
- [ ] **INC-03** : Plafond affiché dans Rapport.PerZonesBlock = plafond affiché dans Simulator, pour le même profil avec reports
- [ ] **INC-03** : Opportunité `per_optimal` utilise le même plafond (avec reports) que le Simulator
- [ ] **INC-04** : Mode manuel Simulator, RNI 500 000 € → plafond = 37 680 € (pas 50 000 €)
- [ ] **INC-05** : Profil avec frais réels = 20 000 €, 1AJ = 80 000 € → plafond PER calculé sur base 60 000 €
- [ ] **INC-06** (si fait) : Grep `percoD1` / `percoD2` dans tout le src → zéro occurrences
- [ ] **INC-07** : Utilisateur avec PER versements 2025 > 0 → l'étape PER s'affiche dans DeclarationGuide avec cases 6NS/6NT
- [ ] **INC-08** (si fait) : Couple avec D2 sans revenus → mention case 6QR dans DeclarationGuide
- [ ] **Build** : `npm run build` vert après chaque étape
- [ ] **Tests** : `npx vitest run` — 122/122 verts après chaque étape
- [ ] **Fixtures** : Les deux profils `src/lib/__tests__/fixtures/*.txt` chargés via DevFixtures (`/dev/fixtures`) affichent des plafonds cohérents entre Simulator / Rapport / Opportunités

---

## 8. Hors-scope explicite

Ce chantier **ne traite PAS** :

- **PERO Madelin / TNS** : déduction spécifique aux indépendants (art. 154 bis CGI) — formule différente (15 % + 15 % de la fraction > 1 PASS)
- **Transferts inter-PER** : migration d'un ancien Madelin vers PER — hors périmètre
- **Sortie en rente** : fiscalité des rentes viagères (abattement 10 % pensions, PS 9,1 %) — déjà partiellement géré dans profileParser pour les rentes 1BS existantes
- **Versements PER non déduits** (option choix de non-déduction à la souscription) — cas très rare, aucune demande utilisateur
- **FCPE / PERECO côté entreprise** : les abondements collectifs déjà versés en intéressement/participation ne réduisent pas le plafond — seule la fraction abondement pur le fait
- **Régime fiscal de sortie en capital** : bien que documenté dans `per.md`, aucun simulateur de sortie n'est prévu dans ce chantier
- **Plafond TNS** : formule 10 % (bénéfice + cotisations obligatoires) + 15 % de la fraction bénéfice > 1 PASS
- **Historique des plafonds > 3 ans** : les plafonds N-4 et antérieurs sont définitivement perdus — pas de gestion

---

## Annexe — Résumé des fichiers impactés par étape

| Étape | Fichiers touchés | Lignes estimées |
|---|---|---|
| 1 — MAX_PLAFOND mode manuel | `Simulator.jsx` | 1 |
| 2 — Déduplication fmtPlafondPer | `profileGenerator.js` | ~15 |
| 3 — computePlafondPERDeclarant | `taxCalculator.js`, `taxCalculator.test.js` | ~50 |
| 4 — Migration Simulator/Rapport/Opport. | `Simulator.jsx`, `Rapport.jsx`, `opportunitiesDetector.js` | ~40 |
| 5 — Abondement PEE/PERCO | `Collect.jsx`, `profileGenerator.js`, `profileParser.js`, `taxCalculator.js` | ~60 |
| 6 — Frais réels dans plafond | `profileParser.js`, `taxCalculator.js` | ~25 |
| 7 — 6NS/6NT DeclarationGuide | `DeclarationGuide.jsx` | ~60 |
| 8 — 6QR mutualisation | `DeclarationGuide.jsx`, `Collect.jsx` | ~40 |
| 9 — Renommage percoD1 | `profileParser.js`, `emptyProfile`, toutes pages | ~30 |
| **Total** | | **~321 lignes** |

---

*Document produit par lecture exhaustive des sources. Aucune modification de code n'a été effectuée.*
