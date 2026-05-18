# Audit cartographique — Relation coach-fiscal × paperasse

> Audit en lecture seule réalisé le 2026-05-18.  
> Aucun fichier modifié. Aucun code écrit.

---

## Rectification préliminaire importante

Le dossier référencé dans le prompt d'audit est `/sources/` — **ce répertoire n'existe pas**.  
Le dossier réel s'appelle **`_sources/`** (avec underscore). Toutes les analyses ci-dessous
utilisent `_sources/paperasse/` comme référence paperasse originale.

---

## Section 1 — Inventaire `_sources/paperasse/`

### Structure générale

`_sources/paperasse/` est un **dépôt git complet** (`_sources/paperasse/.git/`), cloné localement.
Il contient 6 skills + un répertoire `data/` commun, du code Python/JS de scripts, et un système d'évals.

### Fichiers SKILL.md (prompts experts)

| Skill | Lignes | Taille | Date `last_updated` | 3 premières lignes significatives |
|---|---|---|---|---|
| `fiscaliste/SKILL.md` | 295 | 14 547 o | 2026-04-19 | `name: fiscaliste` — IR, décote, PER, PEA, plus-values |
| `comptable/SKILL.md` | 316 | 17 590 o | 2026-04-18 | `name: comptable` — TVA, IS, liasse, facturation |
| `notaire/SKILL.md` | 269 | 13 047 o | 2026-03-24 | `name: notaire` — succession, donation, immobilier |
| `controleur-fiscal/SKILL.md` | 287 | (nc) | (nc) | `name: controleur-fiscal` — redressement, prescription |
| `commissaire-aux-comptes/SKILL.md` | 273 | (nc) | (nc) | `name: commissaire-aux-comptes` — NEP, audit légal |
| `syndic/SKILL.md` | 245 | (nc) | (nc) | `name: syndic` — copropriété, AG, loi 1965 |

> **Absent dans paperasse** : aucun skill `gcp` — ce skill est propre à coach-fiscal.

### Fichiers de données structurées (JSON)

| Fichier | Emplacement | Contenu |
|---|---|---|
| `bareme-ir-2025.json` | `fiscaliste/data/` | Tranches IR 2025, décote, abattements salaires/pensions |
| `per-plafonds.json` | `fiscaliste/data/` | PASS 2025 (47 100 €), plancher/plafond PER |
| `pfu-prelevements-sociaux.json` | `fiscaliste/data/` | PFU 30% (12,8% IR + 17,2% PS), arbitrage PFU/barème |
| `regimes-fonciers-lmnp.json` | `fiscaliste/data/` | Seuil micro-foncier (15 000 €), abattement 30%, LMNP |
| `niches-fiscales.json` | `fiscaliste/data/` | Plafonds niches, réductions d'impôt |
| `ifi-bareme.json` | `fiscaliste/data/` | Barème IFI 2025 |
| `pea-assurance-vie.json` | `fiscaliste/data/` | Plafonds PEA (150 000 €), AV |
| `plus-values-immo-abattements.json` | `fiscaliste/data/` | Abattements pour durée de détention |
| `plus-values-mobilieres-crypto.json` | `fiscaliste/data/` | Plus-values mobilières, crypto |
| `equity-salarial.json` | `fiscaliste/data/` | RSU, BSPCE, stock-options |
| `sources.json` | `fiscaliste/data/` | Références légales (BOFiP, CGI) |
| `abattements-succession-donation.json` | `notaire/data/` | Abattements succession par lien de parenté |
| `dmto-departements.json` | `notaire/data/` | DMTO par département |
| `diagnostics-obligatoires.json` | `notaire/data/` | DPE, amiante, etc. |
| `majorites.json` | `syndic/data/` | Majorités articles 24/25/26 |
| `plan-comptable-copro.json` | `syndic/data/` | Plan comptable copropriété |
| `pcg_2026.json` | `data/` (racine paperasse) | Plan comptable général |
| `facturation/mentions-obligatoires.json` | `data/` | Mentions légales factures |

### Code exécutable dans paperasse

| Fichier | Type | Rôle |
|---|---|---|
| `fiscaliste/scripts/calc_ir.py` | Python | Calculateur IR offline (vérification) |
| `fiscaliste/scripts/dgfip_oracle.py` | Python | Scraping DGFiP pour vérification |
| `fiscaliste/scripts/update_data.py` | Python | Mise à jour des JSON data |
| `evals/run_evals.py`, `aggregate_benchmark.py`, `generate_review.py` | Python | Système d'évaluation des skills |
| `integrations/qonto/fetch.js`, `integrations/stripe/fetch.js` | JS | Intégrations bancaires |
| `scripts/calc.js`, `scripts/generate-*.js` | JS | Génération FEC, factures PDF |

**Ces scripts ne sont pas copiés dans `src/`** — ils restent dans `_sources/` comme outils offline.

---

## Section 2 — Inventaire `/src` côté skills

### Architecture réelle dans `src/data/`

Il existe **deux emplacements distincts** pour les données paperasse dans `src/` :

```
src/data/
├── skills/                        ← prompts système (SKILL.md compilés)
│   ├── fiscaliste.md              (295 lignes)
│   ├── comptable.md               (316 lignes)
│   ├── notaire.md                 (269 lignes)
│   ├── controleur-fiscal.md       (287 lignes)
│   ├── commissaire-aux-comptes.md (273 lignes)
│   ├── syndic.md                  (245 lignes)
│   └── gcp.md                     (10 lignes — PLACEHOLDER)
└── paperasse/                     ← données et références (chargées via import.meta.glob)
    ├── fiscaliste/data/*.json      (11 fichiers JSON)
    ├── fiscaliste/references/*.md  (13 fichiers MD)
    ├── comptable/references/*.md   (16 fichiers MD)
    ├── notaire/data/*.json         (3 fichiers JSON)
    ├── notaire/references/*.md     (11 fichiers MD)
    ├── controleur-fiscal/references/*.md (2 fichiers MD)
    ├── commissaire-aux-comptes/references/*.md (2 fichiers MD)
    ├── syndic/data/*.json          (2 fichiers JSON)
    └── syndic/references/*.md      (16 fichiers MD)
```

### Fichiers présents dans `src/data/skills/`

| Fichier | Lignes | Date copie | Origine |
|---|---|---|---|
| `fiscaliste.md` | 295 | 2026-05-11 | Copie de `_sources/paperasse/fiscaliste/SKILL.md` |
| `comptable.md` | 316 | 2026-05-11 | Copie de `_sources/paperasse/comptable/SKILL.md` |
| `notaire.md` | 269 | 2026-05-11 | Copie de `_sources/paperasse/notaire/SKILL.md` |
| `controleur-fiscal.md` | 287 | 2026-05-11 | Copie de `_sources/paperasse/controleur-fiscal/SKILL.md` |
| `commissaire-aux-comptes.md` | 273 | 2026-05-11 | Copie de `_sources/paperasse/commissaire-aux-comptes/SKILL.md` |
| `syndic.md` | 245 | 2026-05-11 | Copie de `_sources/paperasse/syndic/SKILL.md` |
| `gcp.md` | 10 | (nc) | **PLACEHOLDER** — aucun équivalent dans paperasse |

---

## Section 3 — Duplications et divergences

### Résultat du diff systématique

| Catégorie | Identiques | Différents | Commentaire |
|---|---|---|---|
| Fichiers `references/*.md` | **67/67** | 0 | Copie parfaite |
| Fichiers `data/*.json` | **16/16** | 0 | Copie parfaite |
| Fichiers `skills/*.md` vs `*/SKILL.md` | **6/6** | 0 | Copie parfaite |
| **Total fichiers comparables** | **89/89** | **0** | — |

**Aucune divergence dans les fichiers existants des deux côtés.** Les copies dans `src/` sont identiques octet pour octet aux fichiers d'`_sources/paperasse/`.

### Fichiers présents dans `_sources/paperasse/` mais absents de `src/`

Les 74 fichiers absents appartiennent aux catégories suivantes (aucune ne bloque le runtime) :

| Catégorie | Nb | Utile au runtime ? |
|---|---|---|
| `SKILL.md` (les 6 skills) | 6 | Non — l'équivalent est dans `src/data/skills/` |
| `templates/` (notaire, syndic, facturation) | 29 | Non — génération de documents offline |
| `evals/` + `examples/` (jeux de test) | 22 | Non — tests paperasse autonomes |
| `data/` racine (pcg_2026, journal-entries…) | 4 | Partiellement (pcg_2026 pourrait enrichir comptable) |
| `README`, `package.json`, `CONTRIBUTING`, etc. | 6 | Non |
| Scripts Python, intégrations | 7 | Non |

### Quelle version est la plus récente ?

Les fichiers `_sources/` sont datés du **2026-05-10**, les copies dans `src/` du **2026-05-11**.
La copie a été faite le lendemain — `_sources/` est la source d'origine, `src/` la destination.

---

## Section 4 — Règles fiscales en dur dans le code

### `taxCalculator.js` — AUCUNE valeur hardcodée

C'est le module le plus critique. Verdict : **zéro valeur en dur**.

```js
// src/lib/taxCalculator.js (extrait du commentaire d'en-tête)
/**
 * MISE À JOUR ANNUELLE : modifier uniquement les fichiers JSON dans
 *   src/data/paperasse/fiscaliste/data/
 */
import perRaw from '../data/paperasse/fiscaliste/data/per-plafonds.json';
// Auto-sélection du barème le plus récent via import.meta.glob
```

Toutes les constantes fiscales de `taxCalculator.js` sont importées depuis les JSON paperasse :
tranches IR, décote, abattements 10% salaires/pensions, PASS, plancher/plafond PER.

### `foncier-micro.plugin.js` — 3 valeurs hardcodées

| Ligne | Valeur | Règle | Fichier paperasse de référence | Risque |
|---|---|---|---|---|
| 20, 36, 53, 61 | `15000` | Seuil micro-foncier (€) | `regimes-fonciers-lmnp.json` : `"seuil_recettes_brutes": 15000` | ⚠️ Faible (seuil stable) |
| 23, 37, 64 | `0.70` (= 1 − 0,30) | Abattement micro-foncier 30% | `regimes-fonciers-lmnp.json` : `"abattement": 0.30` | ⚠️ Faible |
| 38, 67 | `0.172` | Taux PS 17,2% | `pfu-prelevements-sociaux.json` : `"taux_revenus_capital": 0.172` | 🔴 **Moyen** — LFSS 2026 porte ce taux à 18,6% pour 2026+ |

### `mobiliers.plugin.js` — 1 valeur hardcodée

| Ligne | Valeur | Règle | Fichier paperasse de référence | Risque |
|---|---|---|---|---|
| 57 | `0.172` | Taux PS 17,2% | `pfu-prelevements-sociaux.json` : `"taux_revenus_capital": 0.172` | 🔴 **Moyen** — même risque PS |

### `profileParser.js` — 1 valeur hardcodée (ligne 195)

| Ligne | Expression | Règle | Risque |
|---|---|---|---|
| 195 | `lvPlus * (0.07 - 0.03) * (1 - 0.172)` | Gain net annuel Livret+ : rendement 7% − seuil 3% × (1 − PS 17,2%) | 🔴 **Moyen** — taux 0,07 non documenté dans les JSON paperasse |

> **Note** : Le taux brut du Livret+ (ici 7%) est un exemple ou un taux au moment de l'écriture. Ce taux change plusieurs fois par an (décision BCE/Banque de France). Il n'existe aucun fichier JSON paperasse pour ce taux — c'est la seule lacune métier réelle.

### `profileParser.js` — 1 constante patrimoniale (non fiscale)

| Ligne | Valeur | Règle | Risque |
|---|---|---|---|
| 193 | `150_000` (PEA espace) | Plafond PEA (150 000 €) | Faible — ce plafond est dans `pea-assurance-vie.json` mais non importé |

---

## Section 5 — Comment les skills sont-ils consommés ?

### Mécanisme de chargement (runtime, `src/data/skillsLoader.js`)

Le chargement est **pleinement opérationnel** et correctement architecturé. Le fichier `skillsLoader.js` fait trois choses :

**1. Chargement des prompts système (SKILL.md) :**
```js
import fiscaliste from './skills/fiscaliste.md?raw';
// → idem pour les 6 autres skills
export const SKILLS_MAP = { fiscaliste, notaire, comptable, … };
```

**2. Chargement automatique des données JSON (barèmes, abattements, plafonds) :**
```js
const _dataGlob = import.meta.glob('./paperasse/*/data/**/*.json', { query: '?raw', eager: true });
export const SKILL_DATA = parseSkillFiles(_dataGlob);
```

**3. Chargement automatique de la documentation procédurale :**
```js
const _refsGlob = import.meta.glob('./paperasse/*/references/**/*.md', { query: '?raw', eager: true });
export const SKILL_REFS = parseSkillFiles(_refsGlob);
```

### Construction du system prompt (`src/lib/skillRouter.js`)

Pour chaque tour de conversation :
1. `detectRelevantSkills(userMessage)` → liste de skills pertinents (toujours `gcp` + fallback `fiscaliste`)
2. `buildSystemPrompt({ skills, profile, masterPrompt })` concatène :
   - `masterPrompt.js` (instructions générales)
   - Pour chaque skill activé : `SKILLS_MAP[id]` + `SKILL_DATA[id]` (JSON) + `SKILL_REFS[id]` (refs MD)
   - Le profil fiscal du client

**Résumé : les skills paperasse sont correctement intégrés et chargés au runtime.**

### Le skill `gcp` — cas particulier

`src/data/skills/gcp.md` est un **placeholder** de 10 lignes :
```markdown
<!-- TODO : copier ici le contenu de _sources/gcp.md quand disponible -->
<!-- Ce fichier est un placeholder — skill non encore fourni -->
```
Il n'existe aucun `gcp` dans `_sources/paperasse/`. Ce skill est spécifique à coach-fiscal et doit être rédigé. Il est chargé et injecté dans tous les system prompts (toujours actif), mais son contenu est vide de substance.

---

## Section 6 — Diagnostic et recommandations

### Diagnostic général

Contrairement à l'hypothèse initiale, **paperasse est bien connecté à coach-fiscal**. La relation est :

```
_sources/paperasse/  →  (copie manuelle)  →  src/data/skills/     (SKILL.md)
                    →  (copie manuelle)  →  src/data/paperasse/   (data + references)
                    →  (import runtime)  →  system prompt Claude
```

Il n'y a **pas de déconnexion architecturale** — il y a un **problème de maintenabilité** : la copie est manuelle, sans mécanisme de synchronisation automatique.

---

### Scénario A — Tout repartir de `_sources/paperasse/`

**Principe** : `_sources/paperasse/` devient la source unique. Le code pointe directement vers `_sources/`.

**Avantages** :
- Source unique, pas de duplication
- Les mises à jour paperasse se reflètent immédiatement

**Inconvénients** :
- `_sources/` est hors de l'arborescence `src/` → Vite ne peut pas bundler des fichiers hors `src/` sans configuration spécifique
- Le dossier `_sources/` contient `.git/`, des scripts Python, des fichiers de dev — pas propre à déployer
- L'import `import.meta.glob` ne fonctionne qu'à l'intérieur de `src/` (contrainte Vite)

**Effort** : Moyen — nécessite de reconfigurer Vite pour exposer `_sources/` ou de créer des symlinks.

**Verdict** : ❌ Non recommandé. Vite ne supporte pas les chemins hors `src/` sans hack.

---

### Scénario B — `src/` comme source de vérité (désynchronisation de paperasse)

**Principe** : on considère que `src/data/paperasse/` est la source de vérité, on cesse de suivre paperasse.

**Avantages** :
- Simplicité — un seul endroit à maintenir
- Liberté de modification sans risquer de diverger

**Inconvénients** :
- Perd les évolutions futures de paperasse (nouveaux barèmes, nouveaux skills)
- Oblige à tout maintenir manuellement

**Effort** : Faible (rien à faire maintenant)

**Verdict** : ⚠️ Acceptable à court terme, problématique à moyen terme si paperasse évolue.

---

### Scénario C — Synchronisation propre via script *(recommandé)*

**Principe** : créer un script `scripts/sync-paperasse.sh` qui copie sélectivement `_sources/paperasse/*/data/`, `*/references/`, et `*/SKILL.md` vers `src/data/`. À exécuter manuellement après chaque mise à jour de paperasse.

**Avantages** :
- Conserve l'architecture actuelle qui fonctionne
- La mise à jour reste simple : `git pull` dans `_sources/paperasse/` + `npm run sync-paperasse`
- Permet de filtrer ce qu'on copie (exclure evals, templates, scripts)

**Inconvénients** :
- La synchronisation reste manuelle (risque d'oubli)
- Nécessite de rédiger et maintenir le script

**Effort** : Faible — le script est ~15 lignes bash.

**Exemple de script** :
```bash
#!/bin/bash
# scripts/sync-paperasse.sh
SRC="./_sources/paperasse"
DST="./src/data/paperasse"
for skill in fiscaliste comptable notaire controleur-fiscal commissaire-aux-comptes syndic; do
  rsync -a --delete "$SRC/$skill/data/"    "$DST/$skill/data/"    2>/dev/null || true
  rsync -a --delete "$SRC/$skill/references/" "$DST/$skill/references/" 2>/dev/null || true
done
# NE PAS copier : SKILL.md (géré dans src/data/skills/), evals, templates, scripts
echo "Sync terminé. Vérifiez avec : git diff src/data/paperasse/"
```

**Verdict** : ✅ **Scénario C recommandé.** C'est la solution avec le moins de friction et le plus de valeur.

---

**Action prioritaire indépendante du scénario choisi** :

Rédiger `src/data/skills/gcp.md` — ce fichier est un placeholder vide et est injecté dans 100% des system prompts. C'est une **lacune fonctionnelle immédiate**, pas un problème d'architecture.

---

## Section 7 — Impact sur les plugins Phase 3-B

### Plugins actifs (v1.0.0) — analyse des règles en dur

**Plugin `salaires` et `pensions-rentes`**

Ces plugins importent directement depuis `taxCalculator.js` :
```js
import { abattement10Auto } from '../../lib/taxCalculator.js';
import { abattement10Pension } from '../../lib/taxCalculator.js';
```
`taxCalculator.js` importe lui-même les valeurs depuis les JSON paperasse.
→ **Chaîne complète et correcte. Aucun risque.**

---

**Plugin `foncier-micro`** — 3 valeurs exposées

| Valeur | Règle | JSON paperasse | Risque de divergence |
|---|---|---|---|
| `15000` (lignes 20, 36, 53, 61) | Seuil micro-foncier | `regimes-fonciers-lmnp.json` → `"seuil_recettes_brutes": 15000` | Faible — seuil stable depuis des années |
| `0.70` (lignes 23, 37, 64) | 1 − abattement 30% | `regimes-fonciers-lmnp.json` → `"abattement": 0.30` | Faible — même seuil |
| `0.172` (lignes 38, 67) | Taux PS 17,2% | `pfu-prelevements-sociaux.json` → `"taux_revenus_capital": 0.172` | **Moyen** — LFSS 2026 porte le taux à 18,6% pour les revenus 2026. Le JSON le note explicitement : `"taux_revenus_capital": 0.172 → valable pour revenus 2025 uniquement"`. Pour les revenus 2026, il faudra mettre à jour le JSON **ET** le plugin. |

**Recommandation** : importer `0.172` depuis `pfu-prelevements-sociaux.json` via `taxCalculator.js` pour que la mise à jour annuelle du JSON soit suffisante.

---

**Plugin `mobiliers`** — 1 valeur exposée

| Valeur | Règle | JSON paperasse | Risque |
|---|---|---|---|
| `0.172` (ligne 57) | Taux PS 17,2% | `pfu-prelevements-sociaux.json` | **Moyen** — même risque que foncier-micro |

**Recommandation** : même correction — importer le taux PS depuis `taxCalculator.js`.

---

### Résumé des risques Phase 3-B

| Plugin | Valeurs hardcodées | Risque immédiat (revenus 2025) | Risque 2026 |
|---|---|---|---|
| `salaires` | 0 | ✅ Aucun | ✅ Aucun |
| `pensions-rentes` | 0 | ✅ Aucun | ✅ Aucun |
| `foncier-micro` | 3 (15000, 0.30, 0.172) | ✅ Correct pour 2025 | ⚠️ 0.172 → 0.186 |
| `mobiliers` | 1 (0.172) | ✅ Correct pour 2025 | ⚠️ 0.172 → 0.186 |

**Pour la déclaration 2025 (revenus 2024)** : les plugins sont corrects, aucune urgence.  
**Pour la déclaration 2026 (revenus 2025)** : les JSON sont déjà mis à jour (bareme-ir-2025.json note l'indexation +0,9%). Le taux PS restera à 17,2% pour les revenus 2025 — la LFSS 2026 ne s'applique qu'aux revenus 2026+. Donc **pas de risque pour la déclaration en cours**.

---

## Synthèse exécutive

| Question | Réponse |
|---|---|
| paperasse est-il intégré ? | **Oui** — `skillsLoader.js` charge les 6 SKILL.md, 16 JSON et 67 MD références |
| Y a-t-il des doublons ? | **Oui** — 89 fichiers existent dans `_sources/` ET dans `src/data/` — 100% identiques |
| Y a-t-il des divergences ? | **Non** — 0 fichier différent entre les deux emplacements |
| Claude Code a-t-il réimplémenté les règles ? | **Non** pour `taxCalculator.js` (0 valeur en dur). **Partiellement** pour les plugins foncier et mobiliers (4 valeurs en dur mais correctes) |
| Quel est le vrai problème ? | **Deux** : (1) absence de script de sync → risque de divergence future ; (2) `gcp.md` est un placeholder vide, injecté dans 100% des conversations |
| Action prioritaire | Rédiger `gcp.md` + créer `scripts/sync-paperasse.sh` |
