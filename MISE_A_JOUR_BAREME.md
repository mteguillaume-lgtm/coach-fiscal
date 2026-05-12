# Mise à jour annuelle du barème fiscal

## Ce qui se passe automatiquement

Chaque année, vers le 20 janvier, GitHub lance un script automatique qui :

1. Télécharge le texte officiel depuis BOFIP et service-public.fr
2. Demande à Claude d'extraire les nouvelles tranches, décote, et PASS
3. Génère le fichier `bareme-ir-YYYY.json` dans `src/data/paperasse/fiscaliste/data/`
4. Met à jour `per-plafonds.json` avec le nouveau PASS
5. Crée une Pull Request sur GitHub avec les changements

Dès que tu merges cette PR, Vercel redéploie l'app et **tous les calculs du dashboard, du simulateur, et les conseils de Claude utilisent automatiquement le nouveau barème** — sans toucher une ligne de code.

---

## Configuration initiale (à faire une seule fois)

### 1. Ajouter ta clé API Anthropic sur GitHub

Sur GitHub → ton repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

- Nom : `ANTHROPIC_API_KEY`
- Valeur : ta clé API Anthropic (commence par `sk-ant-...`)

C'est tout. Le script l'utilise pour appeler Claude lors de l'extraction.

### 2. Vérifier que Vercel est connecté à GitHub

Si c'est déjà en place (tu déploies avec `git push`), il n'y a rien à faire de plus.

---

## Chaque janvier : ce que tu dois faire

### Étape 1 — Attendre la Pull Request automatique

Vers le 20 janvier, GitHub t'envoie une notification par email avec une PR intitulée :
**"📊 Nouveau barème IR détecté — à valider"**

### Étape 2 — Valider les chiffres (2 minutes)

Ouvre la PR et vérifie le fichier `bareme-ir-YYYY.json` généré. Compare avec le document officiel de la LFI (Loi de Finances) ou avec :
- [impots.gouv.fr — Barème de l'IR](https://www.impots.gouv.fr/particulier/calcul-de-limpot)
- [service-public.fr — Calcul de l'impôt](https://www.service-public.fr/particuliers/vosdroits/F1419)

Les valeurs à vérifier en priorité :

| Ce qu'il faut vérifier | Où dans le fichier |
|---|---|
| 5 tranches (0%, 11%, 30%, 41%, 45%) avec les bons seuils | `bareme_ir.tranches` |
| Seuil décote célibataire et couple | `decote.seuil_celibataire` / `seuil_couple` |
| Plancher PER (= 10% × PASS) | `per-plafonds.json` → `plancher_euros` |

### Étape 3 — Merger la PR

Si les chiffres sont corrects → bouton **Merge pull request**.

Vercel redéploie automatiquement en 1-2 minutes. C'est fini.

---

## Si le script automatique échoue

Ça peut arriver si BOFIP ou service-public.fr ont changé leur structure HTML. Dans ce cas :

### Option A — Relancer manuellement depuis GitHub

GitHub → ton repo → **Actions** → **Mise à jour barème IR annuelle** → **Run workflow**

Tu peux forcer l'année cible :
- `year` : ex. `2026`
- `dry_run` : cocher pour voir le résultat sans écrire les fichiers

### Option B — Lancer en local

```bash
# Dans le dossier du projet
export ANTHROPIC_API_KEY=sk-ant-...
npm run update-bareme

# Pour voir le résultat sans rien écrire
npm run update-bareme:dry
```

### Option C — Mettre à jour manuellement (dernier recours)

Si tout échoue, copie le fichier de l'année précédente et modifie les valeurs à la main :

```bash
cp src/data/paperasse/fiscaliste/data/bareme-ir-2025.json \
   src/data/paperasse/fiscaliste/data/bareme-ir-2026.json
```

Puis ouvre le nouveau fichier et mets à jour :
- Les 5 seuils de tranches dans `bareme_ir.tranches`
- Les seuils de décote dans `decote`
- L'abattement minimum/maximum dans `abattement_salaires_10pct`
- Le PASS et les plafonds dans `per-plafonds.json`

L'app détecte automatiquement le nouveau fichier grâce à son nom (`bareme-ir-YYYY.json`).

---

## Architecture — comment ça fonctionne

```
src/data/paperasse/fiscaliste/data/
  bareme-ir-2025.json   ← barème actif
  bareme-ir-2026.json   ← sera automatiquement détecté quand créé
  per-plafonds.json     ← PASS, plafonds PER
```

`taxCalculator.js` scanne automatiquement tous les fichiers `bareme-ir-*.json` et prend toujours le plus récent. Quand le fichier 2026 existe, il devient actif sans aucune modification de code.

Le même JSON alimente :
- **Les calculs JS** du Dashboard (répartition fiscale, TMI, plafond PER)
- **Le Simulateur** (plafond PER, TMI, enveloppes)
- **Claude en chat** — via `skillsLoader.js` qui lit les mêmes fichiers

Un seul fichier à jour → toute l'app est à jour.

---

## Dates fiscales clés à retenir

| Date | Événement |
|---|---|
| Décembre | Publication de la Loi de Finances Initiale (LFI) |
| 20 janvier | Script automatique lancé → PR créée |
| Fin janvier | Tu valides et merges la PR |
| Mai-juin | Déclaration des revenus → l'app est à jour |
| Septembre | Solde IR / remboursements |
| 31 décembre | Dernier jour pour versements PER déductibles |
