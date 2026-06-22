# Maintenance — Synchronisation avec paperasse

## Contexte

Les données et skills fiscaux de kapio proviennent du dépôt **paperasse**
(cloné dans `_sources/paperasse/`). Deux catégories de fichiers sont synchronisées :

| Catégorie | Source | Destination |
|---|---|---|
| Données JSON (barèmes, seuils) et références MD | `_sources/paperasse/*/data/` et `*/references/` | `src/data/paperasse/` |
| Prompts skills (SKILL.md) | `_sources/paperasse/*/SKILL.md` | `src/data/skills/*.md` |

> **Exception** : `src/data/skills/gcp.md` n'est **jamais** synchronisé —
> il n'a pas d'équivalent dans paperasse. C'est un skill spécifique à kapio.

---

## Workflow de mise à jour

### 1. Mettre à jour paperasse (dépôt source)

```bash
cd _sources/paperasse
git pull
cd ../..
```

### 2. Synchroniser vers src/

```bash
npm run sync:all
# ou séparément :
npm run sync:paperasse   # data/ + references/
npm run sync:skills      # SKILL.md des 6 skills (pas gcp)
```

### 3. Vérifier les changements

```bash
git diff src/data/paperasse/
git diff src/data/skills/
```

Relire les diffs pour identifier :
- Les nouveaux barèmes (ex. bareme-ir-YYYY.json ajouté)
- Les modifications de seuils (PASS, plafonds PER, etc.)
- Les nouveaux fichiers de référence

### 4. Valider les tests

```bash
npm test
```

Tous les tests doivent rester verts. Si un test échoue après sync :
- Un seuil a changé dans les JSON → vérifier les plugins qui l'utilisent
- Un format JSON a changé → vérifier `taxCalculator.js`

### 5. Committer

```bash
git add src/data/
git commit -m "chore(data): sync paperasse — [date ou millésime]"
```

---

## Quand synchroniser

| Événement | Action |
|---|---|
| Nouvelle loi de finances (décembre-janvier) | `npm run sync:all` immédiatement + vérifier les seuils |
| Modification manuelle dans paperasse | `npm run sync:all` |
| Taux livrets révisés (Banque de France, ~semestriel) | Mettre à jour manuellement `src/data/paperasse/fiscaliste/data/` si un JSON référence ces taux |
| Nouveau skill ajouté dans paperasse | Ajouter le skill dans `sync-skills.sh` (variable `SKILL_MAP`) et créer le fichier destination |

---

## Fichiers NOT synchronisés (intentionnel)

Ces fichiers existent dans `_sources/paperasse/` mais ne sont pas copiés
dans `src/` car ils ne sont pas nécessaires au runtime de kapio :

| Catégorie | Exemples |
|---|---|
| `SKILL.md` de chaque skill | Géré séparément via `sync-skills.sh` → `src/data/skills/` |
| `templates/` | Documents Word/PDF notarials, syndic — non utilisés par l'app |
| `evals/` | Jeux de tests paperasse (évaluation autonome) |
| `examples/` | Exemples de foyers fiscaux (foyer-lmnp-foncier.json…) |
| `scripts/` Python/JS | Outils offline (calc_ir.py, update_data.py…) |
| `package.json`, `README.md` | Méta-données dépôt paperasse |

---

## Règle de mise à jour annuelle des barèmes

`taxCalculator.js` auto-sélectionne le fichier `bareme-ir-YYYY.json` le plus récent.
Pour ajouter un nouveau millésime :

1. Ajouter `src/data/paperasse/fiscaliste/data/bareme-ir-2026.json` (depuis paperasse)
2. Vérifier dans `taxCalculator.js` que le glob `bareme-ir-*.json` le détecte
3. `npm test` — les tests de cohérence valideront les nouvelles tranches

**Aucune modification de code nécessaire** si le format JSON est inchangé.
