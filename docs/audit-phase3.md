# Audit Phase 3 — kapio

> Généré le 2026-05-17. Basé sur l'état exact du dépôt après les commits PR3 (`49a1d5b`) et PR4 (`bd678b1`).
>
> **⚠️ AVERTISSEMENT PRÉLIMINAIRE — À LIRE AVANT TOUT**
>
> L'audit demandé porte sur une "Phase 3" dotée d'un système de plugins, d'un schéma versionné v2, d'un registre central, et d'une documentation d'architecture. **Ces artefacts n'ont jamais été implémentés ni commités.** Ils n'existent pas dans le dépôt.
>
> Ce qui a réellement été livré sous les étiquettes "PR3" et "PR4" est décrit dans la section 5 (Tests). Toutes les autres sections répondent avec la vérité factuelle : **ABSENT**.
>
> Un commit ne peut pas être préparé pour une Phase 3 qui n'a pas été codée.

---

## 1. Schéma de données versionné

| Question | Réponse |
|---|---|
| Chemin `schemas/profile-v2.schema.json` | **FICHIER ABSENT** — le répertoire `schemas/` n'existe pas |
| Format JSON Schema | **N/A** |
| Champs racine du schéma | **N/A** |
| Sous-objets et cardinalité | **N/A** |
| Migrateur v1 → v2 | **ABSENT** |
| Le profil `profil-fiscal-2026-05-17.txt` migre-t-il sans perte ? | **NON — la migration n'existe pas** |
| Champs perdus | N/A (pas de migration) |
| Diff JSON v1 → v2 | **N/A** |

**Contenu réel de `src/`** : `App.jsx`, `components/`, `context/`, `data/`, `lib/`, `pages/`. Aucun répertoire `schemas/`, `plugins/`, `migrations/`.

---

## 2. Plugins extraits

**Le répertoire `plugins/income/` n'existe pas.**

Il n'y a aucun plugin au sens d'un module autonome avec interface `{ id, label, fields, parser, generator, validator, calculator, declarativeCases }`. La logique est entièrement centralisée dans :

- `src/lib/profileParser.js` — parsing monolithique (~530 lignes)
- `src/lib/profileGenerator.js` — génération monolithique (~380 lignes)
- `src/pages/Collect.jsx` — formulaire monolithique (~650 lignes)

**Couverture des cas PR1+PR2 dans les fichiers existants :**

| Cas | Parser | Generator | Collect form |
|---|---|---|---|
| Salaires 1AJ/1BJ | OUI | OUI | OUI |
| IJ CPAM (PR2) | OUI | OUI | OUI |
| Pensions/rentes 1AS/1BS (PR2) | OUI | OUI | OUI |
| Foncier micro 4BE | OUI | OUI | OUI |

Ces cas sont couverts dans le code monolithique existant — ils ne sont pas "extraits en plugins".

---

## 3. Plugins stubs

**Aucun stub de plugin n'a été créé.** Le répertoire `plugins/` n'existe pas.

Réponses aux 12 catégories demandées :

| Catégorie | Stub créé ? |
|---|---|
| foncier-reel | NON |
| lmnp-micro | NON |
| lmnp-reel | NON |
| plus-values-mobilieres | NON |
| plus-values-immo | NON |
| crypto-avance | NON |
| bic-bnc-ba | NON |
| revenus-etrangers | NON |
| chomage-france-travail | NON |
| dividendes | NON |
| reductions-credits | NON |
| ifi | NON |

> Peux-tu les créer maintenant en stubs vides ?
>
> **Non, pas dans ce rapport.** La règle de la demande est explicite : "Ne code rien". Et surtout, ces stubs n'auraient aucune utilité sans le registre et l'interface plugin qui n'existent pas non plus.

---

## 4. Registre central

| Question | Réponse |
|---|---|
| Chemin `plugins/registry.js` | **ABSENT** |
| Comment `Collect.jsx` itère sur le registre | **N/A — pas de registre** |
| `profileParser.js` branché au registre | **NON** |
| `profileGenerator.js` branché au registre | **NON** |
| Test de discovery automatique | **NON** — tout ajout de logique de revenu nécessite de modifier manuellement les 3 fichiers monolithiques |

---

## 5. Tests

**C'est la seule section où il y a des livrables réels.**

### Fichiers créés ou modifiés

| Fichier | Action | Détail |
|---|---|---|
| `src/lib/__tests__/fixtures/profil-fiscal-ref.txt` | **Créé** (PR3) | Copie du profil v4 depuis `~/Downloads/` — fixture locale stable pour CI |
| `src/lib/__tests__/profileParser.test.js` | **Modifié** (PR3 + PR4) | +74 lignes nettes |
| `src/lib/profileGenerator.js` | **Modifié** (PR3) | Ajout 2BH = 2TR dans `== REVENUS DU FOYER ==` |
| `src/lib/profileParser.js` | **Modifié** (PR4) | Helper `signed()`, champ `irBrut`, fix `solde` |
| `src/data/masterPrompt.js` | **Modifié** (PR4) | Section format TOTAL DÛ / DÉDUCTIONS / MONTANT RESTANT |

### Profils-types dans `tests/fixtures/profiles/`

**Ce répertoire n'existe pas.** Il n'y a qu'un seul fichier de fixture :
`src/lib/__tests__/fixtures/profil-fiscal-ref.txt` (profil foyer pacsé, 2 déclarants, enrichi IA).

### Round-trip parse → generate → parse

- **OUI, ils passent** — 6 tests dans `describe('round-trip…')` (PR3)
- Sur **1 profil** (le profil de référence v4)
- Valeurs vérifiées : 2TR=527, 2CK=68, 8HW=12, 8IW=12, 8HX=24, 8IX=18

### Tests de non-régression PR1+PR2

**OUI** — les 41 tests PR1+PR2 (dont les 31 du profil de référence, autrefois conditionnels/skippés) passent toujours. Le passage de `describe.skip` conditionnel à `describe` fixe les a rendus obligatoires.

### Total tests

```
50 tests / 1 fichier / 5 describe blocks — tous verts
  ├── profil de référence v4    : 31 tests  (PR1+PR2, maintenant garantis)
  ├── profil vide / null        :  2 tests
  ├── format solo minimal       :  7 tests  (PR1)
  ├── round-trip (PR3)          :  6 tests  (nouveaux)
  └── intégration PR4           :  3 tests  (nouveaux)
```

### Couverture estimée

Impossible à mesurer précisément sans `c8`/`istanbul` configuré. Aucune configuration de couverture n'a été ajoutée. Estimation indicative : le parser (~530 lignes) est couvert à ~60-70 % par les 31 tests de référence + 7 tests solo, le générateur à ~30-40 % (seulement testé via round-trip indirect).

---

## 6. Documentation

| Artefact | Existe ? | Contenu |
|---|---|---|
| `docs/architecture.md` | **NON** | — |
| `docs/adding-a-plugin.md` | **NON** | — |
| `README.md` mis à jour | **N/A** (non vérifié, hors périmètre PR3/PR4) | — |

Le répertoire `docs/` contient uniquement :
- `audit-PR1-PR2.md` (généré avant cette session)
- `audit-phase3.md` (ce fichier, généré maintenant)

---

## 7. Risques et décisions arbitraires

### Régressions potentielles suite à PR3+PR4

| Zone | Risque | Niveau |
|---|---|---|
| **`solde` dans le parser** | Avant PR4 : `pasTotal − totalDu`. Après PR4 : `MONTANT RESTANT À PAYER` en priorité (signé). Les profils pré-enrichissement IA (sans la ligne MONTANT RESTANT À PAYER) tombent sur le fallback inchangé → pas de régression. Les profils enrichis IA dont le solde était consommé avec le signe positif-refund pourraient voir un changement de signe. | Moyen — à vérifier dans Dashboard/Simulateur |
| **`2BH` dans le générateur** | Ligne supplémentaire dans `== REVENUS DU FOYER ==`. Si un parser externe ou l'IA utilise cette section, le nouveau champ est additionnel et non perturbateur. | Faible |
| **`irBrut` nouveau champ** | Ajout pur — aucune régression possible. | Nul |
| **Fixture locale** | Les tests ne dépendent plus de `~/Downloads/` — gain pour CI, mais le fichier v4 est maintenant commité (72 Ko) dans le dépôt. | Structurel — acceptable |

### Décisions prises sans `coverage.md`

- Le helper `signed()` utilise `−` (−, minus Unicode) mais pas `–` (–, en-dash) ni `—` (—, em-dash). Si l'IA enrichie produit d'autres variantes de tiret, la regex échouera silencieusement et tombera sur le fallback.
- La regex `irBrut` capture le dernier nombre avant `€` sur la ligne `IR brut foyer … = X €` — elle suppose que le format est toujours `[calcul] = [résultat] €`. Un format sans `=` est géré en fallback mais non testé.

### Stubs non créés faute de liste cible

Aucun stub n'a été créé. La session originale demandait PR3 (revenus mobiliers / acomptes) et PR4 (enrichissement IA) — aucun système de plugins n'était dans le périmètre. La "Phase 3" avec plugin architecture est un périmètre distinct qui n'a pas été assigné.

### Dépendances npm ajoutées en PR3+PR4

**Aucune.** `package.json` et `package-lock.json` sont inchangés depuis PR2.

---

## Synthèse — Critères de succès de l'audit

| Critère | Résultat |
|---|---|
| Le schéma v2 existe et migre le profil sans perte | ❌ **ABSENT** |
| Les 4 plugins sont extraits et complets | ❌ **ABSENT** (architecture plugin non implémentée) |
| Au moins 8 stubs pour futurs sprints | ❌ **ABSENT** |
| Le registre découvre automatiquement les plugins | ❌ **ABSENT** |
| Tous les tests PR1+PR2 passent toujours | ✅ **OUI** (50/50, dont 41 de PR1+PR2) |
| `docs/architecture.md` existe avec schéma de flux | ❌ **ABSENT** |

**Bilan : 1 critère sur 6 est satisfait.** Les 5 autres concernent une Phase 3 (plugin architecture) qui n'a pas été implémentée dans cette session.

---

## Ce qui a réellement été commité

```
49a1d5b  feat(PR3): round-trip tests + 2BH auto-calculé (47 tests verts)
bd678b1  feat(PR4): enrichissement IA réconcilié + irBrut/solde signés (50 tests verts)
```

Ces deux commits correspondent exactement au périmètre de la mission précédente (PR3 et PR4 tels que définis dans le fichier `docs/audit-PR1-PR2.md` section "Hors périmètre PR1/PR2 — à traiter dans PR3+"). La Phase 3 plugin/schéma/registre est un périmètre différent, non assigné, non commencé.
