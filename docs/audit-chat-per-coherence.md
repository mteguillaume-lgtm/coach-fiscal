# Audit cohérence PER — Couche chat (skillsLoader + masterPrompt)

> **Périmètre** : uniquement la cohérence entre le contexte injecté dans le chat Claude et les calculs réalisés par l'app (Simulator, Rapport, opportunitiesDetector).  
> **Méthode** : lecture statique du code — aucune exécution de l'API Claude n'est réalisée ici.  
> **Date** : 2026-05-27

---

## 1. Contenu effectivement injecté dans le contexte Claude

### 1.1 Pipeline d'assemblage (traçage complet)

```
Chat.jsx::handleSend(text)
  │
  ├─ detectRelevantSkills(text)           → string[] de skills actifs
  │    [skillRouter.js:79]
  │    Toujours : ['gcp']
  │    + 'fiscaliste' si "per", "plafond", "déduction", "retraite", etc.
  │    + fallback fiscaliste si seul gcp
  │
  ├─ detectComplexity(text, skills)       → { model }
  │
  └─ buildSystemPrompt({ skills, profile: state.profile, masterPrompt, model })
       [skillRouter.js:124]
       │
       ├─ MASTER_PROMPT                   src/data/masterPrompt.js       ~3 000 oct.
       ├─ Pour chaque skill actif :
       │   ├─ SKILLS_MAP[id]              src/data/skills/*.md
       │   │   ├─ gcp.md                                                ~29 000 oct.
       │   │   └─ fiscaliste.md                                         ~14 500 oct.
       │   ├─ SKILL_DATA[id]              paperasse/*/data/**/*.json
       │   │   └─ (gcp : aucun fichier)
       │   │   └─ (fiscaliste : 14 fichiers JSON)                       ~47 000 oct.
       │   └─ SKILL_REFS[id]             paperasse/*/references/**/*.md
       │       └─ (gcp : aucun fichier)
       │       └─ (fiscaliste : 11 fichiers MD dont per.md)             ~98 000 oct.
       ├─ PROFIL FISCAL CLIENT = state.profile (TXT brut, pas parsedProfile)  ~27 000 oct.
       └─ IDENTITÉ + modèle              ~500 oct.
```

**Total estimé pour une question PER type : ≈ 220 000 octets ≈ 55 000 tokens.**

### 1.2 Ce que le chat reçoit — extraction exacte pour une question PER

Pour la question `« Quel est mon plafond PER 2026 ? »` avec le profil de référence (`profil-fiscal-ref.txt`), le system prompt contient (résumé des sections PER) :

**Depuis `gcp.md` (toujours injecté, section "PER") :**
```
| PASS 2025 | 46 368 € → plafond max ≈ 37 094 € |   ← ⚠️ PASS 2024, valeur incorrecte
| Plafond non utilisé | Reportable 3 ans |
Cases déclaration : 6NS (titulaire), 6NT (conjoint)
```

**Depuis `fiscaliste.md` (activé par "per" / "plafond") :**
```
PER (versements 2025)
  Plancher de déduction : 4 710 €  (10 % × PASS 2025 = 47 100 €)
  Plafond de déduction : 37 680 €  (10 % × 8 × PASS 2025)
  Report : plafonds non utilisés des 3 années précédentes mobilisables (FIFO ancien en premier)
  Mutualisation couple : case à cocher sur 2042
Rappels Obligatoires → Pour un PER :
  Priorité : saturer l'abondement employeur PEE/PERCO avant PER
```

**Depuis `per-plafonds.json` (données chiffrées, section "### Données de référence") :**
```json
{
  "per_individuel": {
    "plancher_euros": 4710,
    "plancher_base": "10% × PASS 2025 (47 100 €)",
    "plafond_absolu_euros": 37680,
    "plafond_absolu_base": "10% × 8 × PASS 2025",
    "report": { "ordre": "plafond N en premier, puis N-3, N-2, N-1 (FIFO)" },
    "mutualisation_couple": "case à cocher sur 2042"
  }
}
```

**Depuis `per.md` (référence procédurale, section "### Documentation procédurale") :**
```
Formule : Plafond = 10% des revenus professionnels nets de l'année N-1
  (salaires après abattement 10%, BNC, BIC — pas les revenus du capital)
Bornes : Plancher 4 710 € / Plafond absolu 37 680 €
Reports FIFO : N-3, N-2, N-1
Mutualisation couple : "case à cocher sur 2042" (sans nommer 6QR)
Déclaration : case 6NS (D1) / 6NT (D2) sur la 2042
PERO : cases 6QS/6QT/6QU
```

**Depuis le profil TXT (section PROFIL FISCAL CLIENT) :**
```
== PLAFONDS PER 2026 ==
  Plafond retenu : 4 710 €
  PERO D1 déduit : 1 260 €
  PLAFOND DISPONIBLE D1 : 3 450 €
  Plafond retenu : 4 710 €
  PERO D2 déduit : Néant
  PLAFOND DISPONIBLE D2 : 4 710 €
Plafond cumulé mutualisable : 8 160 €
PER versements 2025 : Néant
PERO D1 — cotisations 2025 : 1 260 € → case 6QS/6QT/6QU (déjà inclus dans 1AJ)
```

> **Observation clé** : le profil TXT contient `PLAFOND DISPONIBLE D1/D2` (plafond de base, après déduction PERO), mais **sans additionner les reports N-1/N-2/N-3** — ils sont listés séparément si renseignés, avec un `Plafond reportable total (3 ans) : X €`. Claude doit donc les sommer lui-même pour obtenir le plafond total utilisable, ce qui n'est pas explicitement requis nulle part dans le prompt.

---

## 2. Cartographie des références PER dans les skills

| Source | Section PER | Cohérent avec `per-plafonds.json` ? | Problèmes |
|--------|-------------|--------------------------------------|-----------|
| `masterPrompt.js` | Mentionne "PER" dans la liste des skills Fiscaliste. Section "Comment calculer l'IR" uniquement. Pas de règle PER dédiée. | N/A | Aucune instruction pour lire le plafond depuis le profil TXT |
| `skills/fiscaliste.md` | Plafonds corrects : 4 710 €/37 680 €, PASS 47 100 €, reports FIFO, cases 6NS/6NT, PERO 6QS/T/U. Rappel "saturer PEE/PERCO avant PER". | ✅ Cohérent | Pas de mention explicite de case 6QR |
| **`skills/gcp.md`** | **PASS 2025 = 46 368 € → plafond max ≈ 37 094 €**. Cases 6NS/6NT uniquement. Barème IR 2025 (revenus 2024) avec avertissement. | ❌ **PASS périmé (PASS 2024)** | INC-CHAT-01, INC-CHAT-02, INC-CHAT-03 |
| `paperasse/fiscaliste/data/per-plafonds.json` | PASS 47 100 €, plancher 4 710 €, plafond 37 680 €, reports FIFO, mutualisation. PASS 2024 = 46 368 € aussi présent (pour référence). | ✅ Source de vérité | — |
| `paperasse/fiscaliste/references/per.md` | Formule principale sans abondement PEE/PERCO. Cases 6NS/6NT, PERO 6QS/T/U. Mutualisation : "case à cocher" sans nommer 6QR. | 🟡 Partiel | INC-CHAT-04 (abondement absent), INC-CHAT-05 (case 6QR absente) |

**Note d'injection** : le GCP skill est **toujours** présent dans le contexte (même pour les questions fiscales pures). Il est positionné **avant** le skill Fiscaliste dans le prompt. En cas de conflit de valeurs, Claude peut se fier à la première valeur lue.

---

## 3. Réponses test — Chat vs App

> Les valeurs "App" sont calculées depuis le profil de référence `profil-fiscal-ref.txt`.  
> Couple pacsé, D1 : 45 162 € net imposable 1AJ, PERO 1 260 €, D2 : 14 000 € net imposable.  
> Aucun report de plafond dans cette fixture (d'où les valeurs simples).

| # | Question | Valeur calculée par l'app | Comportement probable du chat | Cohérent ? | Cause racine si non |
|---|----------|--------------------------|-------------------------------|------------|---------------------|
| Q1 | « Quel est mon plafond PER 2026 ? » | D1 : 3 450 € · D2 : 4 710 € · Cumulé : 8 160 € | Lit `PLAFOND DISPONIBLE D1/D2` du profil TXT = **correct**. Mais si reports présents, risque de ne pas les additionner. | 🟡 Correct sans reports, risque avec reports | Absence d'instruction dans masterPrompt de sommer `PLAFOND DISPONIBLE + reportable total` |
| Q2 | « Si je verse 5 000 € sur mon PER, quelle économie d'impôt ? » | ~1 500 € (TMI 30%, foyer avec RNI ≈ 50 000 €) | Lit TMI depuis profil TXT (« TMI : 30 % »), calcule 5 000 × 30 % = 1 500 €. **Correct si TMI lue depuis profil.** Risque : recalcul avec barème GCP (revenus 2024) → écart marginal sur les seuils | 🟡 Probablement correct | Si Claude recalcule : barème GCP décalé d'un an (INC-CHAT-02) |
| Q3 | « Puis-je mutualiser nos plafonds avec mon conjoint ? » | Oui — Simulator affiche "Plafond cumulé mutualisable" + gestion case 6QR | Explique correctement le mécanisme (per.md) mais **ne cite pas la case 6QR** | 🟠 Mécanisme correct, case absente | INC-CHAT-05 : case 6QR non documentée dans per.md |
| Q4 | « Mon plafond est de 4 710 €, c'est normal ? » | Oui — 4 710 € = plancher PASS (10% × 47 100 €), D1 avec peu de revenus ou PERO qui réduit | Explique correctement : plancher garanti = 4 710 € même sans revenus (per.md, section "Plancher garanti"). Mentionne la réduction par PERO. | ✅ Correct | — |
| Q5 | « Comment fonctionnent mes reports N-3/N-2/N-1 ? » | FIFO : plafond N d'abord, puis N-3, N-2, N-1 (le plus ancien en premier) | per.md et per-plafonds.json sont cohérents sur le FIFO et l'ordre. Réponse attendue correcte. | ✅ Correct | — |

**Synthèse** : 2 questions sur 5 sont pleinement correctes (Q4, Q5). Q1 et Q2 sont probablement correctes dans le cas simple mais présentent un risque de divergence dès qu'il y a des reports (Q1) ou un recalcul de TMI (Q2). Q3 est partiellement correcte (mécanisme oui, case manquante).

---

## 4. Incohérences détectées

### INC-CHAT-01 🔴 — `gcp.md` : PASS 2025 incorrect (= 46 368 € = PASS 2024)

**Fichier** : `src/data/skills/gcp.md`, ligne 263  
**Code actuel** :
```markdown
| PASS 2025 | 46 368 € → plafond max ≈ 37 094 € |
```
**Correct** :
```
PASS 2025 = 47 100 €  →  plancher = 4 710 €  ·  plafond absolu = 37 680 €
```
**Pourquoi c'est grave** : le GCP skill est injecté **avant** le skill Fiscaliste dans le system prompt. Si Claude traite une question patrimoniale (allocation, stratégie retraite), il peut se baser sur la valeur GCP sans valider contre Fiscaliste. Pour le profil de référence, l'écart sur le plafond est de 586 € (37 680 − 37 094). En cas de versement PER proche du plafond absolu, la réponse sera erronée.

---

### INC-CHAT-02 🔴 — `gcp.md` : Barème IR décalé d'un an (revenus 2024 au lieu de 2025)

**Fichier** : `src/data/skills/gcp.md`, lignes 141-152  
**Code actuel** :
```markdown
### Barème IR 2025 (revenus 2024, déclarés en 2025)
| Jusqu'à 11 497 € | 0 % |
| De 11 497 € à 29 315 € | 11 % |
| De 29 315 € à 83 823 € | 30 % |
...
⚠️ Vérifier le barème 2026 (revenus 2025) sur impots.gouv.fr
```
**Correct (fiscaliste.md)** :
```markdown
### Barème IR (revenus 2025, déclaration 2026)
| 0 € à 11 600 € | 0 % |
| 11 600 € à 29 579 € | 11 % |
| 29 579 € à 84 577 € | 30 % |
| 84 577 € à 181 917 € | 41 % |
```
**Impact sur PER** : si Claude recalcule la TMI au lieu de la lire dans le profil TXT, les seuils de tranche sont décalés. Exemple : un RNI/part à 29 400 € → barème GCP = TMI 11 %, barème correct = TMI 30 %. Erreur sur l'économie PER : 5 000 € × 11 % = 550 € au lieu de 5 000 € × 30 % = 1 500 €.

---

### INC-CHAT-03 🟡 — `gcp.md` : Plafond QF = 1 759 € (LFI 2025) au lieu de 1 807 € (LFI 2026)

**Fichier** : `src/data/skills/gcp.md`, ligne 158  
**Code actuel** : `(1 759 € par demi-part supplémentaire en 2025, à vérifier)`  
**Correct (fiscaliste.md)** : `1 807 €`  
**Impact sur PER** : indirect — affecte le calcul du TMI et du gain QF quand le versement PER fait basculer un foyer sous le seuil de plafonnement. Faible si la TMI est lue depuis le profil TXT, significatif sinon.

---

### INC-CHAT-04 🟡 — `per.md` : Formule plafond incomplète — abondement PEE/PERCO N-1 absent

**Fichier** : `src/data/paperasse/fiscaliste/references/per.md`, section "Formule"  
**Code actuel** :
```
Plafond = 10% des revenus professionnels nets de l'année N-1
```
**Formule légale complète** :
```
MAX(10% × revenus_pro_nets_N-1 ; 10% × PASS_N-1)
  − cotisations_PERO_N-1
  − abondement_PEE/PERCO_N-1
  + reports_FIFO (plafonds non utilisés N-3, N-2, N-1)
```
**Impact** : `per.md` mentionne l'abondement PEE/PERCO dans la section "Priorité absolue" et dans la description du compartiment 2, mais **pas dans la formule de calcul du plafond**. Si un client a de l'abondement PERCO, Claude peut calculer un plafond surévalué. Note : ce bug est en amont (INC-01 de l'audit général) — la valeur dans le profil TXT est elle-même incorrecte car `profileGenerator.js` ne déduit pas non plus l'abondement PERCO. La correction de `per.md` seule ne suffit pas.

---

### INC-CHAT-05 🟡 — `per.md` : Case 6QR (mutualisation des plafonds époux/pacsés) absente

**Fichier** : `src/data/paperasse/fiscaliste/references/per.md`, section "Mutualisation couple"  
**Code actuel** : `"case à cocher sur 2042"` sans nommer 6QR  
**Correct** : case **6QR** de la 2042 C (cochée par le couple pour autoriser l'utilisation du plafond non employé du conjoint)  
**Impact** : pour Q3, Claude explique le mécanisme correctement mais ne peut pas guider l'utilisateur vers la case exacte. Risque d'oubli lors de la saisie sur impots.gouv.fr.

---

### INC-CHAT-06 🟠 — `masterPrompt.js` : Pas d'instruction explicite pour lire le plafond PER depuis le profil TXT

**Fichier** : `src/data/masterPrompt.js`  
**Code actuel** : `"Si le client a un profil chargé, utilise ses valeurs."` (générique)  
**Manque** : une instruction spécifique PER du type :
```
Pour le plafond PER, toujours lire directement depuis le profil TXT :
  - La valeur "PLAFOND DISPONIBLE D1/D2" (plafond de base)
  - Additionner "Plafond reportable total" si présent
  - Ne jamais recalculer ce plafond à partir des revenus bruts
```
**Impact** : sans cette instruction, Claude peut tenter de recalculer le plafond (avec le risque INC-CHAT-01/02 si barème GCP utilisé, et INC-CHAT-04 si formule incomplète). Avec l'instruction, Claude lit la valeur pré-calculée dans le TXT — sauf qu'elle est elle-même incorrecte si abondement PERCO (INC-01 du premier audit).

---

### INC-CHAT-07 🟡 — Reports FIFO non ventilés D1/D2 dans le profil TXT (mode couple)

**Fichier** : `src/lib/profileGenerator.js`, fonction `_perReportables(d)`  
**Code actuel** : les reports `per_n1/per_n2/per_n3` sont des champs partagés du foyer (non séparés D1/D2). En mode couple, `_perReportables(d)` est appelé une seule fois après `PLAFOND DISPONIBLE D2`.  
**Conséquence dans le TXT** :
```
== PLAFONDS PER 2026 ==
  PLAFOND DISPONIBLE D1 : 3 450 €
  PLAFOND DISPONIBLE D2 : 4 710 €
Plafond cumulé mutualisable : 8 160 €
Plafond reportable N-1 : 2 000 €   ← foyer entier, pas ventilé
Plafond reportable total (3 ans) : 2 000 €
```
**Impact** : pour Q1 en mode couple ("quel est mon plafond total D1 avec reports ?"), Claude ne peut pas attribuer précisément les reports à D1 ou D2. Il répondra vraisemblablement avec le total foyer, ce qui peut différer de la valeur affichée dans le Simulator (qui applique les reports sur le déclarant ayant le versement PER).

---

## 5. Corrections nécessaires

> Scope : uniquement la cohérence chat/skills. Pas de refactor du moteur de calcul.  
> Les modifications sont toutes dans des fichiers `.md` ou `.js` de données — aucun composant React.

### CORR-01 — `gcp.md` : Mettre à jour la section PER (PASS, barème, QF plafond)

**Fichier** : `src/data/skills/gcp.md`

**Changement 1 — PASS 2025 :**
```diff
-| PASS 2025 | 46 368 € → plafond max ≈ 37 094 € |
+| PASS 2025 | 47 100 € → plancher 4 710 € · plafond max 37 680 € |
```

**Changement 2 — Barème IR (remplacer l'entête et les tranches) :**
```diff
-### Barème IR 2025 (revenus 2024, déclarés en 2025)
-> ⚠️ Vérifier le barème 2026 (revenus 2025) sur impots.gouv.fr
-| Jusqu'à 11 497 € | 0 % |
-| De 11 497 € à 29 315 € | 11 % |
-| De 29 315 € à 83 823 € | 30 % |
-| De 83 823 € à 180 294 € | 41 % |
-| Au-delà de 180 294 € | 45 % |
+### Barème IR 2026 (revenus 2025, déclarés en 2026)
+> Source : art. 197 CGI — LFI 2026 (indexation +0,9 %).
+| Jusqu'à 11 600 € | 0 % |
+| De 11 600 € à 29 579 € | 11 % |
+| De 29 579 € à 84 577 € | 30 % |
+| De 84 577 € à 181 917 € | 41 % |
+| Au-delà de 181 917 € | 45 % |
```

**Changement 3 — QF plafond :**
```diff
-- **1 759 €** par demi-part supplémentaire en 2025, à vérifier
++ **1 807 €** par demi-part supplémentaire (LFI 2026, revenus 2025)
```

---

### CORR-02 — `per.md` : Ajouter case 6QR dans la section Mutualisation

**Fichier** : `src/data/paperasse/fiscaliste/references/per.md`

```diff
-Les époux/pacsés soumis à imposition commune peuvent **mutualiser leurs plafonds** (case à cocher sur 2042). Un conjoint sans revenu pro peut bénéficier du plafond inemployé de l'autre.
+Les époux/pacsés soumis à imposition commune peuvent **mutualiser leurs plafonds** — **case 6QR** sur la 2042 C. Un conjoint sans revenu pro peut bénéficier du plafond inemployé de l'autre.
```

Et dans la section "Mécanique pratique" / "Déclaration" :
```diff
-- Versements : case 6NS (déclarant 1) / 6NT (déclarant 2) sur la 2042
+- Versements : case **6NS** (déclarant 1) / **6NT** (déclarant 2) sur la 2042 C
+- Mutualisation des plafonds époux/pacsés : case **6QR** sur la 2042 C (à cocher)
```

---

### CORR-03 — `per.md` : Compléter la formule du plafond avec l'abondement PEE/PERCO

**Fichier** : `src/data/paperasse/fiscaliste/references/per.md`

> ⚠️ Cette correction est conditionnelle à CORR-CALC-01 (fix du profileGenerator/taxCalculator pour déduire l'abondement PERCO — INC-01 de l'audit général). Sans ce fix applicatif, le profil TXT ne contient pas l'abondement PERCO dans le calcul du `PLAFOND DISPONIBLE`, donc corriger `per.md` seul créerait une incohérence entre la doc et le profil.

**À ajouter après résolution de INC-01 :**
```diff
-**Plafond = 10% des revenus professionnels nets** de l'année N-1 (salaires après abattement 10%, BNC, BIC — pas les revenus du capital).
+**Plafond disponible** = `MAX(10% × rev_pro_nets_N-1 ; 10% × PASS_N-1) − PERO_N-1 − abondement_PEE/PERCO_N-1`
+
+Où :
+- `rev_pro_nets_N-1` = salaires après abattement 10% (ou frais réels), BNC, BIC
+- `PERO_N-1` = cotisations retraite obligatoire employeur (cases 6QS/6QT/6QU de l'avis N-1)
+- `abondement_PEE/PERCO_N-1` = abondement employeur versé sur PEE/PERCO en N-1
+
+Ce plafond disponible peut ensuite être augmenté des reports FIFO des 3 années précédentes (voir ci-dessous).
```

---

### CORR-04 — `masterPrompt.js` : Ajouter une section PER dédiée

**Fichier** : `src/data/masterPrompt.js`

Ajouter après la section `## Comment calculer l'IR` :

```diff
+## Comment répondre à une question PER
+
+**Ne jamais recalculer le plafond PER à partir des revenus bruts** si un profil est chargé.
+
+Étapes dans l'ordre :
+1. Chercher la section `== PLAFOND PER 2026 ==` (solo) ou `== PLAFONDS PER 2026 ==` (couple) dans le profil.
+2. Lire `PLAFOND DISPONIBLE D1` (et `D2` si couple).
+3. Si `Plafond reportable total` est présent, **l'additionner** au plafond disponible pour obtenir le plafond total mobilisable.
+4. Pour l'économie fiscale : `versement × TMI` où TMI est lue dans la ligne `TMI :` du profil.
+5. Pour la mutualisation époux/pacsés : case **6QR** sur la 2042 C.
+
+**Référence cases 2042 C :**
+- `6NS` / `6NT` : versements PER volontaires D1 / D2 (déductibles)
+- `6QR` : case à cocher pour mutualiser les plafonds entre conjoints
+- `6QS` / `6QT` / `6QU` : PERO obligatoire (informatif uniquement — ne réduit pas l'IR directement)
```

---

## Critères de validation post-corrections

- [ ] `gcp.md` ligne PASS 2025 = **47 100 €**, plafond max = **37 680 €**
- [ ] `gcp.md` barème IR = tranches LFI 2026 (11 600 / 29 579 / 84 577 / 181 917 €)
- [ ] `gcp.md` QF plafond = **1 807 €**
- [ ] `per.md` case **6QR** présente dans la section mutualisation et la section Déclaration
- [ ] `masterPrompt.js` contient une instruction explicite de lecture `PLAFOND DISPONIBLE + Plafond reportable total`
- [ ] `masterPrompt.js` liste les 5 cases PER : 6NS / 6NT / 6QR / 6QS / 6QT
- [ ] Pour Q1 (profil avec reports), le chat cite `PLAFOND DISPONIBLE + reportable total`
- [ ] Pour Q2, la TMI utilisée correspond à celle du profil TXT (pas recalculée)
- [ ] Pour Q3, le chat cite explicitement "case 6QR"

---

## Hors périmètre

- Fix du moteur de calcul (abondement PEE/PERCO non déduit dans `profileGenerator.js` / `taxCalculator.js`) → INC-01 de `docs/audit-per-2026-plan.md`
- Refactoring de `_perReportables` pour ventilation D1/D2 (INC-CHAT-07) → impact modéré, dépend du fix INC-01
- Mise à jour des autres barèmes dans `gcp.md` (IFI, donations, PEA…) — hors scope PER

---

## Annexe — Ordre de priorité des corrections

| Priorité | Correction | Effort | Impact |
|----------|------------|--------|--------|
| 🔴 P1 | CORR-01 (gcp.md — PASS + barème + QF) | 15 min | Élimine risque de réponse PER erronée sur le plafond absolu et la TMI |
| 🔴 P2 | CORR-04 (masterPrompt — section PER dédiée) | 20 min | Force Claude à lire les valeurs depuis le profil TXT, élimine les recalculs |
| 🟡 P3 | CORR-02 (per.md — case 6QR) | 5 min | Q3 cite la bonne case |
| 🟡 P4 | CORR-03 (per.md — formule abondement) | 30 min | Conditionnel à INC-01 du premier audit |
