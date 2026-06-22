# Audit PER 2026 — Rapport de correction

> Généré le 2026-05-27 — Kapio

## Résumé

Audit complet de la chaîne de calcul PER (Plan d'Épargne Retraite) dans Kapio. Huit incohérences identifiées et corrigées. La formule officielle est désormais implémentée de bout en bout : générateur → profil TXT → parseur → calculateur → UI (Simulator, Rapport, Opportunités) → chat (masterPrompt, skills).

**Tests :** 425/425 ✅ — **Build :** ✓ propre ✅

---

## Formule officielle implémentée

```
Plafond PER individuel N (versements volontaires déductibles)
  = MAX( 10% × revenus pro nets N-1 ; 10% × PASS N-1 )
    capped à 10% × 8 × PASS N-1
  − cotisations PERO obligatoires N-1 (cases 6QS/6QT/6QU)
  − abondement employeur PEE/PERCO N-1  [art. 163 quatervicies I-a CGI]
  + reports plafonds non utilisés N-3, N-2, N-1  [FIFO — le plus ancien s'utilise en premier]
```

**PASS 2025 = 47 100 €** → plancher = 4 710 €, plafond absolu = 37 680 €

**Référence légale :** art. 163 quatervicies CGI — BOI-IR-BASE-20-50-20

---

## Bugs corrigés

### INC-04 — MAX_PLAFOND_PER manquant en mode manuel (Simulator)

**Fichier :** `src/pages/Simulator.jsx` (~ligne 1752)

**Avant :**
```js
const plafondBrut = Math.max(Math.round(rni * 0.1), MIN_PLAFOND);
// BUG : pas de cap à MAX_PLAFOND_PER (37 680 €) — plafond illimité
```

**Après :**
```js
const plafondBrut = Math.min(Math.max(Math.round(rni * 0.1), MIN_PLAFOND), MAX_PLAFOND_PER);
```

---

### INC-01 — Abondement PEE/PERCO non déduit du plafond PER

**Base légale :** BOI-IR-BASE-20-50-20, art. 163 quatervicies I-a CGI

**Fichiers modifiés :**
- `src/lib/taxCalculator.js` — `calcPlafondPer(netImp, pero, abondPEEPERCO = 0)` : 3e paramètre ajouté
- `src/lib/profileGenerator.js` — lecture `abond_pee` depuis formData, ligne TXT "PERCO — abondement employeur 2025 : X €" écrite
- `src/pages/Collect.jsx` — champ `abond_pee` ajouté (solo D1 + couple D1/D2)

**Chaîne complète :**
```
Collect.jsx (abond_pee) → profileGenerator (ligne TXT "PERCO — abondement")
  → profileParser (percoAbondD1/D2 — regex déjà en place)
  → calcPlafondPer(netImp, pero, abondPEEPERCO)
```

---

### INC-02 — Duplication calcul plafond PER (profileGenerator ≠ taxCalculator)

**Fichier :** `src/lib/profileGenerator.js`

`fmtPlafondPer` délègue maintenant le calcul de `dispo` à `calcPlafondPer` — source unique de vérité.

---

### INC-03 — Reports N-1/N-2/N-3 ignorés (Rapport, opportunitiesDetector)

**Fichiers modifiés :**
- `src/lib/opportunitiesDetector.js` — reports pro-ratés par RNI, ajoutés aux plafonds avant `computePerOptimumCascade`
- `src/pages/Rapport.jsx` — helper `getEffectivePlafondsWithReports(p)` ajouté, utilisé dans 6 composants : `PerZonesBlock`, `PerScenariosTable`, `PerCalendarBlock`, `PerPlafondsModule`, `DiagnosticFiscalModule`, `FeuilleRouteModule`, `RecapModule`, `VigilancesModule`

**Pro-ration couple :** reports foyer-level → pro-ratés par `rniD1/(rniD1+rniD2)` en mode couple.

**Affichage :** `PerPlafondsModule` affiche désormais une ligne dédiée "+ Reports plafonds N-1/N-2/N-3" et une ligne "Plafond total disponible (avec reports)" quand des reports existent.

---

### TF-03 — DeclarationGuide incomplet (6NS/6NT manquants, hasPER trop restrictif)

**Fichier :** `src/pages/DeclarationGuide.jsx`

**hasPER élargi :**
```js
// Avant : seulement PERO
hasPER: pp.peroD1 > 0 || pp.peroD2 > 0 || pp.percoD1 > 0

// Après : inclut PER volontaires
hasPER: pp.peroD1 > 0 || pp.peroD2 > 0 || pp.percoD1 > 0 || pp.percoD2 > 0
     || pp.plafondPerD1 > 0 || pp.plafondPerD2 > 0
```

**StepPER enrichi :**
- Case 6QS (PERO D1) + 6QT (PERO D2) — avec note PERO ≠ déduction 2042
- Case 6NS (PER volontaires D1) + 6NT (D2) — avec plafond indicatif
- Mention 6QR (mutualisation couple) — explication art. 163 quatervicies III
- makeSteps inclut dynamiquement done_6ns/done_6nt si plafond > 0

---

### Bug 6 — Description per-plafonds.json trompeuse (PASS / millésime)

**Fichier :** `src/data/paperasse/fiscaliste/data/per-plafonds.json`

Description mise à jour pour clarifier : "versements 2026 (base : revenus 2025, PASS 2025 = 47 100 €)". Ajout section `reductions_plafond` (PERO + abondement) et mise à jour `mutualisation_couple` avec référence case 6QR.

---

### Bug TF-02 (partiel) — Mention 6QR absente

Corrigé dans `DeclarationGuide.jsx` (StepPER) et `per.md` (section déclaration + mutualisation). La case 6QR est maintenant documentée et expliquée dans le guide pas-à-pas.

---

### INC-GCP — Données erronées dans gcp.md (chat)

**Fichier :** `src/data/skills/gcp.md`

| Champ | Avant (erroné) | Après (corrigé) |
|-------|----------------|-----------------|
| PASS 2025 | 46 368 € (= PASS 2024) | **47 100 €** |
| Barème IR | Revenus 2024 (seuils 2025) | **LFI 2026 — revenus 2025** |
| Tranche 30% | 29 315 → 83 823 € | **29 579 → 84 577 €** |
| Tranche 41% | 83 823 → 180 294 € | **84 577 → 181 917 €** |
| Plafond QF | 1 759 € | **1 807 €** |
| Plafond max PER | ~37 094 € | **37 680 €** |

---

### Chat — per.md enrichi

**Fichier :** `src/data/paperasse/fiscaliste/references/per.md`

- Formule complète avec PERO + abondement + reports (section "Formule complète")
- Case 6QR documentée avec explication détaillée (section "Mutualisation couple")
- Tableau déclaratif complet 6NS/6NT/6QS/6QT/6QU/6QR
- Mention plafond officiel DGFIP (avis d'imposition)

---

### Chat — masterPrompt.js : section PER ajoutée

**Fichier :** `src/data/masterPrompt.js`

Nouvelle section "PER — Instructions spécifiques" :
1. Lire PLAFOND DISPONIBLE depuis le profil TXT (source de vérité)
2. Formule officielle avec PERO + abondement + reports
3. Tableau cases 6NS/6NT/6QS/6QT/6QU/6QR
4. Pièges à signaler systématiquement (PERO ≠ déduction, abondement réduit plafond, reports perdus après N+3)

---

## Nouvelle architecture de calcul

### `computePlafondPERDeclarant` — source unique de vérité UI

```js
export function computePlafondPERDeclarant({
  rni = 0, pero = 0, abondPEEPERCO = 0,
  reportN1 = 0, reportN2 = 0, reportN3 = 0,
} = {}) → {
  brut10, plafondBrut, reductions, plafondNet, reportTotal, plafondWithReports
}
```

Appellants cibles : Simulator (profile mode), Rapport.PerZonesBlock, opportunitiesDetector.

### `calcPlafondPer` (signature étendue, rétrocompatible)

```js
export function calcPlafondPer(netImpSalaire, peroEmployeur = 0, abondPEEPERCO = 0)
```

Utilisé par profileGenerator.fmtPlafondPer (source TXT). Signature publique maintenue.

---

## Exemple chiffré

**Profil :** Salarié, salaire net imposable 60 000 €, PERO 1 500 €/an, abondement PEE 2 000 €, report N-2 = 3 000 €

```
RNI post-abattement 10% : 54 000 €
10% × 54 000 = 5 400 €   (> plancher 4 710 €)
Plafond brut retenu : 5 400 €
  − PERO 1 500 €
  − Abondement PEE 2 000 €
= Plafond net : 1 900 €
+ Report N-2 : 3 000 €
= Plafond total disponible : 4 900 €

Sans la correction INC-01 : plafond affiché = 3 900 € (abondement ignoré → surestimé de 2 000 €)
Sans la correction INC-03 : plafond affiché = 1 900 € (reports ignorés → sous-estimé de 3 000 €)
```

---

## Ce qui reste à faire (hors scope de cet audit)

| Ref | Description | Complexité |
|-----|-------------|------------|
| INC-05 | Frais réels : base plafond PER = net - frais si frais > abattement 10% | Moyenne |
| INC-06 | Renommer `percoD1` → `versementPerD1` dans profileParser + tous les appelants | Élevée (migration) |
| TF-02 | Toggle UI case 6QR dans Collect.jsx + propagation profileGenerator | Moyenne |
| Bug 7 | Extractor.js : extraire plafond officiel DGFiP depuis avis d'imposition (PDF) | Élevée |

---

## Fichiers modifiés

| Fichier | Nature | Changement |
|---------|--------|------------|
| `src/lib/taxCalculator.js` | Core | `calcPlafondPer` +abondPEEPERCO ; `computePlafondPERDeclarant` ajouté |
| `src/lib/profileGenerator.js` | TXT gen | `fmtPlafondPer` délègue à calcPlafondPer ; ligne PERCO abondement ; champ abond_pee |
| `src/pages/Simulator.jsx` | UI | MAX_PLAFOND_PER cap mode manuel |
| `src/pages/Rapport.jsx` | UI | `getEffectivePlafondsWithReports` + 8 composants corrigés |
| `src/lib/opportunitiesDetector.js` | Logic | reports pro-ratés → plafonds effectifs |
| `src/pages/Collect.jsx` | Form | champ `abond_pee` D1+D2 |
| `src/pages/DeclarationGuide.jsx` | Guide | hasPER, 6NS/6NT/6QR dans StepPER |
| `src/data/skills/gcp.md` | Chat | PASS, barème 2026, QF plafond corrigés |
| `src/data/paperasse/fiscaliste/references/per.md` | Chat | formule, 6QR, tableau cases |
| `src/data/masterPrompt.js` | Chat | section PER instructions spécifiques |
| `src/data/paperasse/fiscaliste/data/per-plafonds.json` | Ref | description, reductions_plafond, 6QR |
| `src/lib/__tests__/taxCalculator.test.js` | Tests | +13 tests computePlafondPERDeclarant et calcPlafondPer |
