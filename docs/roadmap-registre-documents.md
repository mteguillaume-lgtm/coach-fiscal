# Roadmap — Registre de types de documents & refonte Anonymisation → Collecte

> **But de ce fichier** : permettre de reprendre ce chantier à froid dans une autre session.
> État au moment de l'écriture : **exploration faite + plan validé. AUCUN code écrit.**
> Prochaine action : **implémenter la Phase A**.

---

## 0. Objectif

Faire pivoter le parcours **Anonymisation → Collecte** autour d'une notion centrale : le
**TYPE DE DOCUMENT**. Chaque type « sait » ce qu'il faut **masquer** dessus et ce qu'il faut
en **extraire**. En parallèle, corriger une faiblesse de séquençage : aujourd'hui rien ne
guide l'utilisateur vers les bons documents AVANT le dépôt, et rien ne détecte un document
MANQUANT.

### Séparer (A) la situation et (B) les montants
- **(A) Situation** (qualitatif, ~8 questions binaires) → doit remonter **AVANT** l'anonymisation.
- **(B) Montants & détails** → reste en aval, désormais **pré-rempli par l'extraction**.

### Flux cible
```
Étape 0 — Situation (léger)        ← détaché du questionnaire de collecte
   ↓ produit des flags : couple, foncier, perVolontaire, crypto…
   ↓ stockés dans collectProfile.modules, JAMAIS redemandés ensuite
Étape 1 — Anonymisation
   • checklist de documents PERSONNALISÉE (filtrée par les flags étape 0)
   • dépôt + détection auto du type (Couche 2)
   • extraction LOCALE des données AVANT masquage (Couche 3) → remplit formData
   • contrôle de cohérence "déclaré vs détecté" (livrable D)
Étape 2 — Collecte
   • questionnaire PRÉ-REMPLI par l'extraction
   • étapes filtrées par les flags DÉJÀ connus (zéro double saisie)
```

---

## 1. Contraintes IMPÉRATIVES

1. **100 % LOCAL à l'anonymisation.** Aucune donnée personnelle ne part vers une IA.
   Détection + masquage + **extraction** = navigateur uniquement, zéro réseau.
   → L'extraction se fait par **regex locales sur le texte pdf.js**, PAS via l'API Claude.
   → Le pipeline IA existant (`extractor.js` / `analyzeDoc`) est **rétrogradé en
     enrichissement optionnel côté `/collect`** et n'est **jamais** déclenché à l'anonymisation.
2. **Registre = JSON DE DONNÉES PUR**, agnostique du framework. Pas de logique JS dedans,
   regex simples sous forme de **chaînes** (compilées au chargement). Objectif : un futur
   loader Python pourra relire le même fichier. NE PAS coupler avec l'appli Python/Flask
   (produit séparé) — concevoir proprement sans implémenter ce partage maintenant.
3. **RÉUTILISER l'existant** : pattern `requires`/`condition`, structure D1/D2/`target`,
   champs de formulaire actuels, `buildPatterns()`, `detectPeriod()`. Ne rien réinventer.
4. **EXTENSIBILITÉ** : ajouter un type = **une entrée de registre**, zéro modif ailleurs.
5. **VERSIONING** : `version` interne dans le JSON, ré-exportée et vérifiée par un test
   (même esprit que `bareme-ir-YYYY.json`).

---

## 2. État actuel du code (résumé de l'exploration)

### Ordre des écrans
`/setup → /anonymize (Étape 1/4) → /collect → /profile → …`
L'anonymisation arrive AVANT toute connaissance de la situation → à corriger.

### Le bloc « situation » existe déjà
C'est `src/components/OnboardingWizard.jsx` (wizard **8 étapes**) rendu **en tête de
`Collect.jsx`**. Sa fonction `computeModules()` produit les flags de contexte :
```js
{ salaires, tns, foncier, immobilier, capitauxMobiliers, crypto,
  epargneSalariale, perVolontaire, pensionsAlimentaires, creditsImpot,
  investissementsLocatifs, international }
```
Stockés dans `state.collectProfile.modules` (AppContext, persisté localStorage).

### Le pattern `condition` = le champ `requires`
Dans `Collect.jsx`, chaque descripteur de champ peut porter `requires: 'crypto'`.
Le gating se fait via `_moduleVisible(f, modules, expertMode)` (Collect.jsx:597).
Déjà de la divulgation progressive — mais appliquée **aux champs**, jamais à une
**checklist de documents** (qui n'existe pas).

### Les 3 fonctions aujourd'hui dispersées
| Fonction | Où | Détail |
|---|---|---|
| Guider | inexistant | Aucune checklist. Texte statique dans la dropzone. |
| Détecter type | `anonymizer.js` → `detectPeriod()` | 5 types par mots-clés inline, sert juste à **nommer le fichier**. Pas de routage. |
| Anonymiser | `patterns.js` → `buildPatterns()` | Patterns regex **globaux** (groupes : identite, employeur, nss, admin, adresse, banque, salaire). Pas par type. `salaire` désactivé par défaut (préserve les montants utiles). |
| Extraire | `extractor.js` → `analyzeDoc()` + `mapExtracted()` | **IA distante (Claude Haiku)** ⇒ VIOLE le 100% local. N'extrait que 5 champs. |

### Deux pipelines PDF parallèles, jamais reliés
- `/anonymize` : `pdfReader.extractWordsWithPositions()` (local, positions) → `findZones()`
  → noircit → `SET_ANONYMIZED_FILES` (Blobs session-only).
- `/collect` : `handleFiles()` → `analyzeDoc()` (IA) → `mapExtracted()` → pré-remplit
  `formData`/`d1Data`/`d2Data` avec marqueur `autoFilled` (badge ✨).
→ Le texte déjà extrait localement à l'anonymisation est **jeté**, puis le PDF est renvoyé
  à l'IA. C'est le gisement de la Couche 3 (lire en local AVANT de masquer).

### D1/D2 déjà câblés
`d1Data`/`d2Data` + `target: 'solo'|'d1'|'d2'` propagés de bout en bout
(dropzones séparées en couple, routage des Blobs vers le bon déclarant). Réutilisable tel quel.

### Points de réutilisation
- Flags : `computeModules()` + `collectProfile.modules` (à **hisser en amont**, pas recréer).
- `requires` + `_moduleVisible()` → filtrage checklist.
- `detectPeriod()` → embryon Couche 2.
- `buildPatterns()` groupes `label`/`group` → référencés par le registre.
- `state.extractedDocs` : champ **déjà présent** dans AppContext (initialState + reducer
  `SET_EXTRACTED_DOCS`), aujourd'hui **inutilisé** → à réutiliser pour stocker l'extraction locale.

---

## 3. Décisions d'architecture (verrouillées)

- **Étape 0 détachée** : `OnboardingWizard` sort de `Collect.jsx` et devient le **gate de
  `/anonymize`** (rendu si `!onboardingDone && !expertMode`, sinon checklist+dépôt).
  `Collect.jsx` ne fait plus que **lire** `collectProfile.modules`.
- **Extraction = regex locale** (voie principale, sans clé API). IA = enrichissement optionnel.
- **Emplacement du registre** :
  ```
  src/data/documentTypes/
    registry.json   ← DONNÉES PURES : { version, documents:[…] }
    index.js        ← loader fin : compile detect→RegExp, helpers
  ```
- **`anonymizeGroups`** dans le registre mappe sur la **taxonomie existante** de
  `patterns.js` (`identite/employeur/nss/admin/adresse/banque/salaire`) → réutilise
  `buildPatterns()` via un helper `labelsForGroups(groups)`.
- **`condition`** sert à la fois (1) au filtrage de la checklist et (2) au contrôle de
  cohérence (un doc dont `condition` = un flag « prouve » ce flag).

### Forme d'une entrée du registre
```jsonc
{
  "id": "avis_ir",
  "label": "Avis d'imposition",
  "tier": "socle",                         // socle | enveloppes | immobilier | specifique
  "condition": null,                        // null = toujours ; sinon flag étape 0 (= 'requires')
  "detect": ["AVIS D'IMP[OÔ]T", "revenu fiscal de référence"], // strings → RegExp(p,'i')
  "anonymizeGroups": ["identite","adresse","admin","nss"],     // groupes patterns.js
  "extract": ["rfr","nbParts","tmi","tauxPAS","plafondPER"]    // ids sémantiques (Couche 3)
}
```

---

## 4. Cartographie des documents à intégrer au registre

> Note : **dates d'ouverture** (AV/PEA/PEL) et **plafond PER** = cibles d'extraction à
> forte valeur, souvent mal saisies à la main → fiabiliser. Relevés d'enveloppes = formats
> TRÈS hétérogènes selon l'établissement → prévoir une **saisie semi-assistée** en repli
> quand l'extraction échoue.

### SOCLE (`condition: null` — toujours)
- **Avis d'imposition** N-1/N-2 → RFR, parts, TMI, taux PAS, plafond PER, reports
- **Bulletins de salaire de DÉCEMBRE** (D1 + D2) → net imposable cumul, PAS cumul, cotisations PERO
  — **PRINCIPE STRICT : cumul de décembre, jamais mensuel**
- **IFU (2561)** → dividendes 2DC, intérêts 2TR, PV 3VG/3VH, crédits d'impôt

### ENVELOPPES (`condition`: patrimoine financier)
- Relevé **assurance-vie** → encours, **DATE D'OUVERTURE** (horloge 8 ans), versements, €/UC
- Relevé **PEA/PEA-PME** → valo, **DATE D'OUVERTURE** (horloge 5 ans), PV latentes
- Relevés **PER** (PERin/PERO/PERECO) → encours par compartiment, versements, abondement
- **Attestation PERO employeur** → cotisations obligatoires (consomment le plafond PER)
- **Attestation versement PER individuel** → 6NS/6NT
- Relevés **livrets** (A/LDDS/LEP/CEL) + **PEL** → soldes ; PEL : date d'ouverture + taux
- Relevé **CTO** → valo + IFU associé

### IMMOBILIER (`condition`: foncier / immobilier)
- Avis de **taxe foncière** → biens détenus, commune, valeur locative cadastrale
- **Tableau d'amortissement crédit** → CRD, mensualité, taux, assurance, échéance
- **Baux + quittances / récap gestionnaire** → loyers, charges, nu vs meublé
- **2044 / 2031 N-1** → régime réel, déficit foncier reportable
- **Acte de vente / 2048-IMM** → PV immo, durée de détention

### SPÉCIFIQUES (`condition`: flags dédiés)
- **Export transactions crypto** → cessions, PAMC (3AN/2086, 3916 bis)
- **Relevés comptes/courtiers étrangers** → existence (3916)
- **Liasse TNS/BNC-BIC** → résultat, cotisations
- **Statuts + 2072 SCI** → quote-part, résultat foncier
- **Donations antérieures** → montant, date (horloge 15 ans)
- **Justificatifs réductions** (CESU/URSSAF, dons, garde, scolarité) → 7DB/7UD/7GA…

---

## 5. Plan d'implémentation par phases

> Livraison **phase par phase**, chacune testée et autonome. Valider chaque phase avant la suivante.

### ▢ Phase A — Registre + Couche 3 (socle technique)
**Nouveaux fichiers**
- `src/data/documentTypes/registry.json` — toutes les entrées (§4).
- `src/data/documentTypes/index.js` — `getType(id)`, `detectType(text)→{id,confidence}`,
  `documentsForFlags(modules)→entries[]`, `VERSION`.
- `src/lib/docExtract.js` — extraction **LOCALE** :
  - `EXTRACTORS` : `{ semanticId → { regex, parse } }` (le « comment », en JS).
  - `EXTRACT_MAP` : `{ semanticId → { formKey, declarantScoped } }` vers les champs existants
    (`tauxPAS→taux_pas`, `netImposable→net_imp`, `pasAnnuel→pas_tot`, `avDate→av_date`,
    `peaDate→pea_date`, `pelDate→pel_date`, `plafondPER→per_n1`…). `rfr`/`nbParts`/`tmi` →
    cohérence/affichage.
  - `extractFields(text, typeId) → { semanticId: value }`.
  - Regex bulletin = **cumul décembre** (`Cumul` / `depuis le 01/01`), jamais mensuel.

**Fichiers modifiés**
- `src/lib/patterns.js` — patterns fiscaux manquants (n° fiscal, référence avis ; IBAN/BIC
  déjà là) + helper `labelsForGroups(groups)`.

**Tests** : `src/lib/__tests__/documentRegistry.test.js`, `src/lib/__tests__/docExtract.test.js`.

### ▢ Phase B — Couche 2 (détection au dépôt)
**Fichiers modifiés**
- `src/lib/anonymizer.js` — la détection de type délègue à `detectType()` du registre (garder
  le parsing mois/année). `anonymizePdf()` : extrait texte → `detectType()` → `extractFields()`
  **AVANT** masquage → masque avec `labelsForGroups(entry.anonymizeGroups)` → retourne
  `{ blob, typeId, extracted, … }`.
- `src/pages/Anonymize.jsx` — chaque ligne fichier affiche le **type détecté** + **correction
  en 1 clic** (liste du registre) ; la correction relance masquage + extraction.
- `src/context/AppContext.jsx` — **réutiliser `extractedDocs`** : `SET_EXTRACTED_DOCS` reçoit
  `[{ target, typeId, extracted }]`. `SET_ANONYMIZED_FILES` gagne `typeId`.

### ▢ Phase C — Couche 1 (étape 0 détachée + checklist filtrée)
**Fichiers modifiés**
- `src/pages/Anonymize.jsx` — gate `OnboardingWizard` (si `!onboardingDone && !expertMode`),
  sinon **checklist personnalisée + dépôt**. Garder l'échappatoire « mode expert ».
- `src/pages/Collect.jsx` — **retirer** le rendu inline du wizard (`showWizard`,
  `handleWizardComplete/Skip`) ; si `!onboardingDone`, renvoi vers `/anonymize` (fallback :
  rendu inline conservé en secours pour imports de profil / fixtures). Pré-remplissage depuis
  `state.extractedDocs` (mapping `EXTRACT_MAP`). IA `analyzeDoc` = enrichissement optionnel,
  jamais à l'anonymisation.

**Nouveau fichier**
- `src/components/DocumentChecklist.jsx` — `documentsForFlags(modules)` → socle (toujours) +
  situationnel (révélé par flags). Coche auto les types déjà détectés (Couche 2). Divulgation progressive.

### ▢ Phase D — Cohérence « déclaré vs détecté »
**Nouveaux fichiers**
- `src/lib/coherenceCheck.js` — `compare(modules, detectedTypeIds) → alerts[]` :
  - **manque** : flag déclaré mais aucun type détecté dont `condition` = ce flag.
  - **non déclaré** : type détecté dont `condition` n'est pas activée.
  - **socle attendu** : avis d'imposition / bulletin décembre absent → rappel doux.
- `src/components/CoherenceAlerts.jsx` — bannières **non bloquantes** + actions
  (« Ajouter ce document » / « Activer ce module » → `SET_COLLECT_PROFILE`).

**Fichiers modifiés** : `src/pages/Anonymize.jsx` (rend les alertes sous le dépôt).
**Tests** : `src/lib/__tests__/coherenceCheck.test.js`.

### Récap fichiers
| Phase | Nouveaux | Modifiés |
|---|---|---|
| A | `registry.json`, `documentTypes/index.js`, `docExtract.js`, 2 tests | `patterns.js` |
| B | — | `anonymizer.js`, `Anonymize.jsx`, `AppContext.jsx` |
| C | `DocumentChecklist.jsx` | `Anonymize.jsx`, `Collect.jsx` |
| D | `coherenceCheck.js`, `CoherenceAlerts.jsx`, 1 test | `Anonymize.jsx` |

---

## 6. Détachement de l'étape 0 sans casser l'état
- `collectProfile` / `mode` déjà globaux + persistés → **aucune migration**.
- Contournements préservés : import de profil, fixtures, `hasExistingData`, mode expert.
- `/anonymize` reste « optionnelle » pour le **dépôt**, mais l'**étape 0 devient le gate**
  (le bouton « passer » ne saute que le dépôt, pas la situation — sauf mode expert).
- Pas de changement de routes ; ordre inchangé.

---

## 7. Fichiers clés (pour reprise rapide)
- `src/pages/Anonymize.jsx` — page anonymisation (dropzones, patterns UI).
- `src/lib/anonymizer.js` — `anonymizePdf()`, `detectPeriod()`, `findZones()`.
- `src/lib/pdfReader.js` — `extractWordsWithPositions()`, `extractRawText()` (local, pdf.js).
- `src/lib/patterns.js` — `buildPatterns()`, `applyEnabledLabels()`, groupes.
- `src/lib/extractor.js` — `analyzeDoc()` (IA, à rétrograder), `mapExtracted()`.
- `src/components/OnboardingWizard.jsx` — wizard situation, `computeModules()`.
- `src/pages/Collect.jsx` — formulaire, `_moduleVisible()`, `requires`, intégration wizard.
- `src/context/AppContext.jsx` — `collectProfile`, `modules`, `extractedDocs`, `SET_*`.

## 8. Commandes
```bash
npm run dev          # localhost:5173
npm test             # Vitest single run
npx vitest run src/lib/__tests__/documentRegistry.test.js   # test ciblé
npm run lint
```

---

## 9. Suivi d'avancement
- [x] Exploration + résumé
- [x] Plan validé (extraction 100% locale confirmée)
- [x] **Phase A — Registre + Couche 3** (registry.json + index.js + docExtract.js + patterns.labelsForGroups ; 22 tests verts, suite complète 624 verts)
- [x] **Phase B — Détection au dépôt** (anonymizer.js : detectType + extractFields AVANT masquage + masquage PAR TYPE via labelsForGroups, retourne {typeId,typeLabel,confidence,extracted} ; Anonymize.jsx : type détecté affiché + correction 1-clic (forcedTypeId) + dispatch SET_EXTRACTED_DOCS/typeId ; logo masqué seulement si groupe employeur. Build OK, lint propre, 624 tests verts)
- [x] **Phase C — Étape 0 détachée + checklist** (OnboardingWizard = gate de /anonymize quand !onboardingDone && !expertMode && !hasExistingData ; DocumentChecklist.jsx filtrée par modules + auto-coche les types détectés ; Collect.jsx : wizard retiré → `<Navigate to="/anonymize">` si situation manquante (reconfigure y renvoie), pré-remplissage depuis extractedDocs via mapExtractToForm (1 fois, ne remplace jamais une saisie). Build OK, 624 tests verts. NB : warning lint préexistant `anonymizedFiles`/useMemo hors périmètre)
- [x] **Phase D — Cohérence déclaré vs détecté** (coherenceCheck.js : 3 familles d'écarts — socle absent / flag déclaré sans doc détecté / doc détecté hors situation ; CoherenceAlerts.jsx non bloquantes + action « Ajouter à ma situation » (enableModule) ; intégré dans Anonymize.jsx sous le résumé, affiché dès qu'un doc est traité. 9 tests dédiés, suite complète 633 verts, build OK, lint propre)

**CHANTIER TERMINÉ (A→D).** Tout le flux cible est opérationnel : situation (gate) → checklist filtrée → dépôt + détection + extraction locale → cohérence → collecte pré-remplie. 100 % local, zéro donnée perso vers l'IA.
