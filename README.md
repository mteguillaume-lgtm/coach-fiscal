# Coach Fiscal

![Tests](https://img.shields.io/badge/tests-150%20✅-brightgreen)
![Plugins](https://img.shields.io/badge/plugins-16%20(4%20actifs)-blue)
![Version](https://img.shields.io/badge/phase-3--C-informational)

Votre bilan fiscal personnalisé en 30 minutes, 100 % privé.

Un assistant fiscal personnel qui tourne entièrement dans votre navigateur.
Vos PDF ne quittent jamais votre appareil — seul votre profil fiscal synthétique
est transmis à l'API Claude (Anthropic) lors du conseil expert.

> **Captures d'écran**
> *(à ajouter après déploiement)*

---

## Architecture

Coach Fiscal repose sur une architecture en pipeline avec un registre de plugins de revenus :

```
Collect.jsx → profileGenerator → TXT → profileParser → v1 → migrateur → v2 → Claude
```

Les plugins de revenus (`src/plugins/income/`) sont découverts automatiquement — ajouter un fichier `*.plugin.js` suffit.

- [Architecture complète](docs/architecture.md) — flux de données, schéma v2, décisions techniques
- [Contribuer un plugin](docs/adding-a-plugin.md) — guide pas-à-pas avec exemple complet
- [Couverture fiscale](docs/coverage.md) — revenus couverts par les 16 plugins

---

## Fonctionnement — 4 étapes

| Étape | Page | Description |
|-------|------|-------------|
| 0 | `/setup` | Clé API Anthropic + situation du foyer (célibataire / couple) |
| 1 | `/anonymize` | Dépôt de vos PDF → extraction locale → fichiers anonymisés |
| 2 | `/collect` | Formulaire guidé pré-rempli par les données extraites |
| 3 | `/profile` | Profil fiscal synthétique généré localement |
| 4 | `/chat` | Conseil expert IA (Claude) avec 7 skills fiscaux actifs |

---

## Lancer en local

```bash
# Prérequis : Node.js 20+
git clone https://github.com/<votre-pseudo>/coach-fiscal.git
cd coach-fiscal
npm install
npm run dev
# → http://localhost:5173
```

## Compiler pour la production

```bash
npm run build      # génère dist/
npm run preview    # prévisualise le build sur http://localhost:4173
```

---

## Données & vie privée

**Stocké uniquement dans votre navigateur (localStorage) :**
- Clé API Anthropic (`coachFiscal.apiKey`)
- Formulaire de collecte, profil fiscal généré, historique de conversation (`coachFiscal.state`)

**Envoyé à `api.anthropic.com` uniquement lors du conseil (étape 4) :**
- Votre profil fiscal synthétique (texte généré à l'étape 3)
- Vos messages et l'historique de conversation
- Le system prompt (skills fiscaux actifs, barèmes, références)

**Jamais envoyé :**
- Vos fichiers PDF originaux
- Votre nom, adresse, numéro fiscal
- Les données brutes des formulaires

Vérifiable en temps réel dans **DevTools → Network → `anthropic.com`**.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| UI | React 19 + Vite 8 |
| Style | Tailwind CSS v3 (palette teal custom) |
| Routing | React Router v7 |
| Lecture PDF | pdf.js (Mozilla) v5 |
| Manipulation PDF | pdf-lib |
| Rendu Markdown | react-markdown + remark-gfm |
| Toasts | react-hot-toast |
| Icônes | lucide-react |
| API IA | Anthropic API (claude-sonnet-4-5 / claude-opus-4-5) |
| Hébergement | Vercel (SPA, free tier) |

---

## Skills fiscaux actifs

Les 7 skills chargés dynamiquement selon la question :

| Skill | Domaine |
|-------|---------|
| `fiscaliste` | IR, déclaration 2042, PFU, PEA, AV, LMNP, IFI, PER, crypto |
| `notaire` | Succession, donation, démembrement, SCI, immobilier |
| `comptable` | TVA, IS, liasse fiscale, facturation, FEC |
| `controleur-fiscal` | Redressement, prescription, pénalités DGFiP |
| `commissaire-aux-comptes` | Audit légal, NEP, certification |
| `syndic` | Copropriété, AG, charges, loi 1965 |
| `gcp` | Patrimoine global, allocation d'épargne |

Données de référence bundlées : barèmes IR 2025, plafonds PER, abattements succession,
plus-values mobilières/immobilières, régimes fonciers, niches fiscales.

---

## Crédits

- **[Paperasse](https://github.com/romainsimon/paperasse)** par [@romainsimon](https://github.com/romainsimon) —
  base de skills fiscaux, données de référence (barèmes, abattements, plafonds) et documentation procédurale. Licence MIT.
- **[pdf.js](https://mozilla.github.io/pdf.js/)** (Mozilla) — extraction du texte PDF dans le navigateur.
- **[pdf-lib](https://pdf-lib.js.org/)** (Andrew Dillon) — manipulation et anonymisation des PDF.

---

## Déploiement Vercel

```bash
# Avec gh CLI et vercel CLI
gh repo create coach-fiscal --public --source=. --remote=origin --push
vercel --prod
```

Ou via l'interface Vercel :
1. `vercel.com/new` → importer le dépôt GitHub
2. Framework : **Vite** (détecté automatiquement)
3. Build command : `npm run build`
4. Output directory : `dist`
5. Deploy

Le fichier `vercel.json` configure le rewrite SPA pour React Router.

---

## Licence

[MIT](LICENSE) — libre d'utilisation, de modification et de redistribution.
