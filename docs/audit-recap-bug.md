# Audit — Bug IR Récapitulatif de la déclaration

Date : 2026-05-19  
Commit de référence : `edf3ac7` (fix(recap): correct IR calculation using foyer parts)  
Profil de référence : `src/lib/__tests__/fixtures/profil-fiscal-ref.txt`

---

## 1. Localisation exacte du composant Récapitulatif

**Fichier** : `src/pages/DeclarationGuide.jsx`  
**Composant** : `StepRecap` — lignes 523–671  
**Rendu depuis** : `renderStepContent()` ligne 755, déclenché par le stepper à l'étape `s_recap`

Dépendances de calcul directes :
- `adaptParsedProfile(pp)` — lignes 24–43, transforme `state.parsedProfile` en objet simplifié `parsed`
- `calcIR(base, parts, isCouple)` — importé de `src/lib/taxCalculator.js`
- `state.parsedProfile` — alimenté par `parseProfile(text)` de `src/lib/profileParser.js`
- `state.mode` — depuis `AppContext`, initialisé à `'solo'`, mis à jour lors de la collecte

---

## 2. Quelle fonction calcule l'IR dans le Récapitulatif

**Après commit `edf3ac7`** (version actuelle) :

```js
// StepRecap, ligne ~527
const irTotal = parsed.rni ? calcIR(parsed.rni, parts, isCouple) : null;
```

`calcIR` est la source de vérité de `taxCalculator.js` (barème JSON 2025, décote couples/célibataires).

**Avant edf3ac7** (version buguée en production) :

```js
// Fonction locale — barème 2024 hardcodé, 1 part fiscale implicite
function computeIR(rni) {
  const SLICES = [
    [0, 11_497, 0], [11_497, 29_315, 0.11], [29_315, 83_823, 0.30], ...
  ];
  return Math.round(SLICES.reduce((ir, [lo, hi, r]) => rni > lo ? ir + (Math.min(rni, hi) - lo) * r : ir, 0));
}
// → appelait computeIR(parsed.rni) — sans parts, barème 2024, IR = 15 086 € au lieu de 8 128 €
```

Le commit `edf3ac7` a corrigé les deux erreurs de Dimension 1 : barème 2024 et parts=1 implicite.

---

## 3. Comment `foyer.partsFiscales` est-il consommé

**Chaîne de lecture** :

```
profileParser.js → _situation(text) → parts: f(text, /Parts fiscales\s*:\s*([\d,\.]+)/) || 1
  ↓
parsedProfile.parts = 2  (pour le profil de référence "Parts fiscales : 2")
  ↓
adaptParsedProfile(pp) → parts: pp.parts || (pp.mode === 'couple' ? 2 : 1)
  ↓
StepRecap → const parts = parsed.parts || (mode === 'couple' ? 2 : 1)
  ↓
calcIR(parsed.rni, parts, isCouple)  ← parts=2 ✓ (après edf3ac7)
```

Le champ `foyer.partsFiscales` n'existe pas en tant que tel — c'est `parsedProfile.parts` issu du texte brut. Le mécanisme est correct APRÈS edf3ac7, à condition que le profil texte contienne la ligne `Parts fiscales : X`. Si ce n'est pas le cas (profil non enrichi sans cette ligne), le fallback est `pp.mode === 'couple' ? 2 : 1` ce qui est correct.

---

## 4. Sources de revenus agrégées dans la base de calcul du Récapitulatif

`parsed.rni` = `pp.rniFoyer` (depuis `adaptParsedProfile`) = `parsedProfile.rniFoyer`.

Pour un profil **enrichi**, `rniFoyer` est parsé depuis la ligne `"RNI FOYER TOTAL : 73 067 €"` par `profileParser._rni()`. Elle agrège :
- Salaires D1 après abattement 10 % : 40 646 €
- Salaires D2 après abattement 10 % : 26 355 €
- Rente 1BS D2 après abattement 10 % pension : 5 573 €
- Foncier net micro-foncier (après abat. 30 %) : 493 €
- **Total : 73 067 €** ✓

Pour un profil **non enrichi**, le fallback est :
```js
(rniD1 + rniD2 + (pd.foncierNet || 0)) || rniD1
```
où `rniD1/rniD2` sont calculés par les plugins (salaires, pensions, etc.). Si un plugin n'est pas actif ou que la source n'est pas reconnue, la base peut être sous-estimée.

---

## 5. Sources ignorées dans le Récapitulatif vs Rapport fiscal (Rapport.jsx)

### 5a. psFoncier — ABSENT du Récapitulatif (bug critique)

**Rapport** (Rapport.jsx:120–121) :
```js
const psFoncier = foncierNet * 0.172;
const totalDu   = irNetFoyer + psFoncier;  // 8 128 + 85 = 8 213 €
```

**Récapitulatif** (DeclarationGuide.jsx:527) :
```js
const irTotal = calcIR(parsed.rni, parts, isCouple);  // 8 128 € — sans psFoncier
```

→ `irTotal` est sous-estimé de 85 € sur ce profil.

### 5b. Formule de solde inversée — SENS OPPOSÉ (bug critique)

**Rapport** :
```js
const solde = pasTotal - totalDu;  // 6 350 − 8 213 = −1 863 € (négatif = remboursement)
```

**Récapitulatif** :
```js
const solde = irTotal - pasTotal;  // 8 128 − 6 350 = +1 778 € (positif = supplément affiché)
```

Résultat affiché : **"Supplément estimé : 1 778 €"** au lieu de **"Remboursement : 1 863 €"**.  
L'erreur est double : mauvais signe ET psFoncier manquant.

### 5c. Acomptes IR et PS — ABSENTS du solde

Le Récapitulatif ne déduit pas les acomptes déjà prélevés en cours d'année :
- `acompte8HW` + `acompte8IW` : acomptes IR D1+D2 (profil réf. : 24 €)
- `acompte8HX` + `acompte8IX` : acomptes PS D1+D2 (profil réf. : 42 €)

Ces champs existent dans `parsedProfile` (alimentation par `profileParser._acomptes()`).

Le Rapport fiscal lui-même ne les intègre pas non plus dans son `solde` (seul `pasD1 + pasD2` est déduit). C'est donc une anomalie partagée des deux pages — à corriger dans la même PR.

### 5d. Crédit PFU 2CK — ABSENT du solde

`parsedProfile.intMob2CK` existe (ex. : 68 € pour ce profil) mais n'est déduit ni dans le Récapitulatif ni dans le Rapport.

### 5e. Sources PAS non exhaustives (risque latent)

`parsed.pas8HV = pp.pasD1` et `parsed.pas8IV = pp.pasD2` proviennent du **plugin salaires** (parseuses des sections `REVENUS D1/D2`). Ils n'incluent PAS :
- PAS ARE / France Travail (plugin `chomage-france-travail` → champ `pasAreD1/D2`)
- PAS rente assureur 1BS (plugin `pensions-rentes` → champ `pasRente1BsD1/D2`)
- PAS CPAM IJ (souvent 0 ou déjà inclus dans le PAS employeur, mais non garanti)

Pour le profil de référence, l'écart est nul (`pasRente1BsD2 = 0 €`, IJ CPAM intégré dans le bulletin D2). Pour d'autres profils (chômage partiel, rente avec PAS), le pasTotal serait **sous-estimé** dans le Récapitulatif.

La source correcte serait `pp.pasTotal` (depuis `profileParser._fiscal()`), qui lit la ligne `"PAS total foyer 2025 : 6 350 €"` en priorité ou agrège `pasD1 + pasD2` en fallback.

---

## 6. PAS prélevé affiché — sources incluses

**Actuel** : `pasTotal = pp.pasD1 + pp.pasD2`  
→ Employer PAS D1 (4 609 €) + employer PAS D2 (1 741 €) = **6 350 €** ✓ pour ce profil

**Manque** sur d'autres profils :
- ARE (PAS France Travail, prélevé mensuellement)
- Rente assureur / CPAM avec PAS (surtout si assureur != 0)
- Acomptes 8HW/8IW/8HX/8IX (ne sont pas du PAS stricto sensu mais réduisent bien le solde final)

La bonne source serait `pp.pasTotal` (field `_fiscal`) qui consolide toutes ces sources, en complétant par les champs spécifiques de chaque plugin.

---

## 7. Autres anomalies identifiées (hors calcul IR)

### 7a. Date 2025 au lieu de 2026
**Fichier** : DeclarationGuide.jsx ligne ~625  
```js
'Ce montant sera prélevé progressivement via votre PAS à partir de septembre 2025.'
```
→ Doit afficher **septembre 2026** (l'avis impôts 2025 arrive à l'automne 2026).

### 7b. Seuil d'alerte orange
**Actuel** (après edf3ac7) :
```js
const smallSolde = solde != null && solde >= 0 && solde < 300;  // gris si solde < 300 €
```
**Spec** : seuil à **1 500 €** (orange si solde ≥ 1 500 €, neutre si 0 ≤ solde < 1 500 €).

### 7c. Remboursement — couleur et libellé
**Actuel** : bloc teal pour `solde < 0` (remboursement). Correct.  
**Actuel** : pas de distinction si remboursement grâce à crédit 2CK vs pur excédent PAS.  
Aucune correction requise dans cette PR (cosmétique).

---

## 8. Recommandation — computeFoyerSummary()

**Verdict : Oui, créer une fonction unique.**

Les deux pages partagent la même logique mais avec des implémentations divergentes :

| Critère | Rapport.jsx `computeData()` | Récapitulatif `StepRecap` |
|---|---|---|
| Source rniFoyer | `p.rniFoyer` ou re-parsing texte | `pp.rniFoyer` via `adaptParsedProfile` |
| psFoncier | ✓ `foncierNet * 0.172` | ✗ absent |
| Formule solde | `pasTotal − totalDu` ✓ | `irTotal − pasTotal` ✗ (inversé) |
| Acomptes | ✗ | ✗ |
| Crédit 2CK | ✗ | ✗ |
| PAS sources | texte profil (D1+D2 employeur) | parsedProfile.pasD1+D2 (employeur) |

**Plan recommandé** : créer `computeFoyerSummary(p)` dans `taxCalculator.js` retournant :

```js
{
  rniFoyer,          // depuis p.rniFoyer
  parts,             // depuis p.parts
  quotient,          // rniFoyer / parts
  tmi,               // getTMI(rniFoyer, parts)
  irBrut,            // barème
  irNet,             // après décote
  psFoncier,         // 17,2% × p.foncierNet (ou p.revensFonciers × 0.70 × 0.172 si micro)
  totalDu,           // irNet + psFoncier
  pasTotal,          // p.pasTotal (consolidé tous plugins) ou pasD1 + pasD2
  acomptes,          // acompte8HW + acompte8IW + acompte8HX + acompte8IX
  creditPFU,         // p.intMob2CK
  solde,             // pasTotal + acomptes + creditPFU - totalDu (positif = remboursement)
}
```

- Le Rapport consomme cette fonction (refactor `computeData` pour déléguer le calcul IR+solde)
- Le Récapitulatif consomme cette fonction (remplace la logique inline de `StepRecap`)

---

## Résumé des bugs restants après edf3ac7

| # | Sévérité | Bug | Impact chiffré (profil réf.) |
|---|---|---|---|
| 1 | **Critique** | psFoncier absent de `irTotal` | −85 € sur totalDu |
| 2 | **Critique** | Formule solde inversée (`ir−pas` vs `pas−totalDu`) | +3 641 € d'erreur sur le solde (affiche +1 778 € au lieu de −1 863 €) |
| 3 | Mineur | Acomptes IR+PS non déduits du solde | −66 € (même bug dans Rapport) |
| 4 | Mineur | Crédit PFU 2CK non déduit | −68 € (même bug dans Rapport) |
| 5 | Latent | PAS sources employer seulement (manque ARE, rente) | 0 € sur profil réf., variable sur autres |
| 6 | UX | Date "septembre 2025" → 2026 | Libellé incorrect |
| 7 | UX | Seuil orange 300 € → 1 500 € | Alerte sur trop de cas |

**Bugs 1 + 2 doivent être corrigés ensemble dans la même PR.**  
Bugs 3 et 4 peuvent être inclus si `computeFoyerSummary()` les couvre, ou reportés dans une PR dédiée.

---

## Bugs hors-scope (à lister, ne pas corriger dans cette PR)

- **Rapport.jsx** : `computeData()` reparsed le texte brut du profil au lieu de `parsedProfile` → duplication, source de désynchronisation future. Refactor à prévoir.
- **Dashboard.jsx** : `ContributionTable` utilise `calcIR(rniD1, 1, false)` et `calcIR(rniD2, 1, false)` pour les IR solos de comparaison — correct par design (simulation célibataire).
- **Rapport.jsx** : acomptes 8HW/8IW/8HX/8IX non intégrés dans le solde affiché → légère différence avec l'avis impôts réel.
