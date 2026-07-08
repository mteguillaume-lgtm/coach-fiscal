# Audit complet KAPIO — juillet 2026

> Audit produit / architecture / fiscal réalisé le 2026-07-07 (Claude Code).
> Périmètre : tout le codebase (`src/`, données paperasse, tests, build, déploiement).
> État au moment de l'audit : 694 tests verts (33 fichiers), build OK.

**Verdict global** : le codebase est nettement plus avancé et plus sain que sa description ne le laisse penser. Plusieurs « gaps connus » sont en réalité **déjà implémentés et testés**. Les vrais problèmes sont ailleurs : une dizaine de **violations de la Paperasse-first rule** dans `taxCalculator.js` et `profileParser.js`, un **risque d'incohérence entre les chiffres déterministes et ceux que Claude recalcule en chat**, une **absence totale de CI de tests et de headers de sécurité**, un **chunk de 2 Mo** (skills) et une **accessibilité quasi nulle**.

---

## 0. Recalage préalable : les « gaps connus » périmés

Vérifié dans le code — à corriger dans le backlog avant toute planification :

| Gap « connu » | État réel |
|---|---|
| Plafonnement QF double-calc manquant | ✅ Fait — `plafonnementQF()` (taxCalculator.js:1123), double calcul DGFIP avec plafonds distincts case T/L/invalidité, ordre barème → QF → décote respecté |
| TNS stubs seulement | ✅ Micro BIC/BNC/BA complet (`calcMicroTns`, `estimCotisationsMicro`, plugin `bic-bnc-ba`, tests phase2) ; le réel est routé vers expert-comptable — choix de périmètre assumé |
| LMNP / régimes locatifs | ✅ Micro-foncier, foncier réel + déficit (art. 156-I-3°), LMNP micro 3 régimes loi Le Meur, détection LMP, plugins dédiés, tests phase3 |
| Capital gains | ✅ PV mobilières (abattements pré-2018), crypto (seuil 305 €), PV immo (grilles IR 22 ans / PS 30 ans, surtaxe avec lissage), tests phase4 |
| IFI | ✅ `calcIFI` avec décote 1,3–1,4 M€, abattement RP 30 %, plugin, routage CGP pour plafonnement 75 % |
| Situations internationales | ✅ Taux effectif (8TI), crédit d'impôt étranger (8TK), routage avocat fiscaliste, tests phase6 |
| `@vitejs/plugin-react-swc` | Le repo utilise `@vitejs/plugin-react` v6 avec Vite 8 (rolldown) — le workaround SWC n'existe plus |

---

## 1. Architecture & Patterns

### 1.1 Violations Paperasse-first — **CRITIQUE**

`taxCalculator.js` annonce « aucune valeur hardcodée ici » mais en contient plusieurs :

1. **CEHR entièrement en dur** (`taxCalculator.js:1073-1083`) : seuils 250 k/500 k/1 M et taux 3 %/4 % codés en dur **alors que `bareme-ir-2025.json` contient déjà un bloc `cehr` machine-readable** qui n'est lu nulle part. → Correctif : **small**, lire `baremeRaw.cehr`.
2. **Taux de décote 0,4525 en dur** (`taxCalculator.js:1104`). Le JSON ne l'expose que dans une chaîne de prose (`formule_celibataire`). → **small** : ajouter un champ `taux` au bloc `decote` du JSON + au script `update-bareme.js`, et le lire.
3. **Abattement micro-foncier 0,70 en dur** dans `baseIRFoyer` (`taxCalculator.js:1214`) alors que `ABATTEMENT_MICRO_FONCIER` existe dans le même fichier. → **small**.
4. **Taux PER 10 % en dur** (`taxCalculator.js:1258` et `:1292` — `rni * 0.1`). → **small** (ajouter `taux_calcul` à `per-plafonds.json`).
5. **`profileParser.js:94-95`** : `rente × 0.9` — ignore le plancher 450 € et le **plafond 4 446 € par foyer** de l'abattement pensions, alors que `abattement10Pension()` existe. Sur une grosse pension, RNI sous-estimé ; en couple, risque de doubler le plafond foyer. → **small/medium** avec test de non-régression.
6. **`profileParser.js:231`** : `lvPlus * (0.07 - 0.03) * (1 - 0.172)` — **taux PS 17,2 % en dur dans le parser** + hypothèses de rendement. Idem `opportunitiesDetector.js:67` (`foncierNet * 0.172`) et `:416` (`remaining * 0.03`). → **small** : `TAUX_PS_CAPITAL` + constantes nommées centralisées.
7. Mineur : `PLAFOND_LICENCIEMENT_MAX = 5 * PASS` — multiplicateur 5 en dur (`taxCalculator.js:125`).

**Amélioration structurelle (medium)** : test d'architecture qui greppe `src/lib` et `src/plugins` pour les littéraux fiscaux connus (`0.172`, `0.4525`, `0.03`…) hors JSON et hors tests.

### 1.2 Double source de vérité déterministe vs Claude — **ÉLEVÉE**

`computeFoyerSummary()` est la source de vérité UI. Mais `masterPrompt.js` demande à Claude de **recalculer lui-même l'IR** et de produire une section « DONNÉES POUR CALCUL IR FOYER » que le parser consomme. Deux moteurs coexistent : le déterministe (testé) et un LLM (non déterministe). Risque : chiffres divergents Dashboard vs chat ; pire, l'enrichissement IA (`Profile.jsx:199-206`) peut réinjecter un chiffre faux dans le profil TXT.

**Correctif (medium)** : injecter le résultat de `computeFoyerSummary()` dans le system prompt (« chiffres officiels calculés par l'application — ne pas recalculer, les citer »), et restreindre l'enrichissement IA aux sections narratives (`AI_TITLES`) — jamais aux sections que le parser consomme pour le calcul.

### 1.3 Le profil TXT + regex : la vraie limite architecturale

Le parser accumule des variantes de format (3 alias pour `== TRANSMISSION ==`, 2-3 regex de fallback par champ, garde-fou « écart < 100 € »). Robuste aujourd'hui, mais coût marginal croissant. **Amélioration (large, non urgente)** : faire du profil v2 JSON le store canonique persisté, le TXT devenant une *vue générée* (pour l'humain et le prompt Claude). Seul refactor de fond recommandé.

### 1.4 Activation sélective des skills — bon principe, routage fragile

`skillRouter.js` : bonne conception (gcp toujours actif, fallback fiscaliste, données JSON par skill). Faiblesses : matching par sous-chaîne avec hacks (`'per '`, `' per,'`), mots-clés manquants : `ifi`, `cehr`, `girardin`, `madelin`, `fcpi`, `sofica`, `pinel`, `denormandie`, `holding`. **Correctif (small)** : tokeniser + word-boundary, compléter les lexiques depuis les clés de `DEFISC_DISPOSITIFS`. **Amélioration (medium)** : logger localement les questions en fallback.

### 1.5 Testabilité

694 tests sur `src/lib` et plugins — excellent métier. Mais **zéro test de composant**, alors que `Rapport.jsx` fait 3 361 lignes, `Simulator.jsx` 2 113, `Collect.jsx` 1 835 avec logique métier inline. `.claude/rules/rapport-patrimonial.md` note déjà que `computeData()` de Rapport reparse le profil brut. **Correctif (medium)** : extraire la logique vers `src/lib`, composants < 500 lignes. Suite de tests : 246 s d'import cumulé à cause des globs eager — mocker `skillsLoader` en test (small).

---

## 2. Logique métier fiscale

### 2.1 Solide
Barème auto-sélectionné par millésime, ordre de liquidation correct, plafonds QF par catégorie, niches 2 étages, PER cascade avec `stopRate` paramétrable, crédits remboursables séparés du solde, PV immo hors total dû, IFI hors total IR.

### 2.2 Incohérence potentielle option barème 2OP — **ÉLEVÉE**

La case 2OP est **globale** (dividendes + intérêts + PV mobilières). Or `arbitragePfuBareme()` et `calcPvMobiliere().recommande` rendent des recommandations **indépendantes** → l'outil peut recommander une combinaison impossible à déclarer. **Correctif (medium)** : un arbitre foyer `arbitrage2OP()` comparant les deux scénarios globaux, seule recommandation surfacée.

### 2.3 Autres points métier

- **Mutualisation PER couple (6QR)** : mentionnée dans le masterPrompt mais non modélisée dans `computePerOptimumCascade`. → **medium**.
- **CSG déductible approximée la même année** dans `arbitragePfuBareme` : à signaler comme estimation dans l'UI (**small**).
- **Concubinage / année de mariage-PACS** : modèle binaire solo/couple. Un concubin qui coche « couple » a un calcul faux, silencieusement. → garde-fou à l'étape 0 (**small, urgent**).
- **Rachats AV (2CH)** : le manque le plus fréquent pour la cible (abattement 4 600/9 200 € après 8 ans, taux 7,5 %/12,8 %). → tête de roadmap métier (**medium**), paramètres en JSON paperasse.

---

## 3. Conseil patrimonial & sophistication

**Solide** : `lifeStage.js` exemplaire (module pur, seuils d'âge paperasse, mode dégradé explicite). `conseilPatrimonial.js` : synthèse « sans action / avec action » + `detectZonesNonCouvertes()` route vers EC/notaire/CGP/avocat. Disclaimer global partout.

**Gaps** :
1. **Pas de scénarios A/B/C** : pour le PER, 3 scénarios calculables avec les briques existantes (0 € / optimum cascade / plafond max). → **medium**, gros gain de crédibilité.
2. **Trade-off liquidité PER sous-exposé** dans l'opportunité `per_optimal` (« Verser X € avant le 31/12 » sans rappel du blocage jusqu'à la retraite). → **small**.
3. **Risque législatif long terme** : rien. Ajouter un bloc « sensibilité » (économie PER si TMI de sortie 11 % → 30 %, simple recalcul avec autre `stopRate`). → **medium**.
4. Injecter la phase `lifeStage` dérivée dans le system prompt du chat (**small**).

---

## 4. Collecte documentaire & détection

**Solide** : Étape 0 (gate situation, `Anonymize.jsx:257`) → dépôt → `detectType` → `checkCoherence` (3 familles d'alertes avec actions correctives). Registre JSON (22 types, versionné) réellement portable.

**Risques résiduels d'anonymisation** :
1. **PDF scanné sans couche texte** : rien n'est extrait → rien n'est masqué → le document part **entièrement en clair** vers l'API vision. → **Correctif ÉLEVÉ (small)** : avertissement bloquant si 0 mot extrait.
2. **Détection par ligne** : un nom/adresse sur deux lignes passe à travers. → corpus de test réel, fenêtre 2 lignes (**medium**).
3. **`LOGO_ZONE` fixe** : bulletins non standards gardent le logo → inviter à vérifier l'aperçu.
4. `detectPeriod` fallback date du jour → noms de fichiers potentiellement faux (mineur).

Positif : `docExtract` local avant masquage, `EXTRACT_PROMPT` interdit les PII en sortie, chaîne rasterisation → PDF image-only correcte.

---

## 5. UX

1. **Accessibilité : point le plus faible.** 0 `aria-`/`role` dans Dashboard et Rapport, 3 dans Collect (1 835 lignes de formulaire). `prefers-reduced-motion` en CSS mais les animations Framer (SpotlightCursor, Grain…) ne consultent pas `useReducedMotion`. → **ÉLEVÉE (medium)** : passe a11y sur Collect d'abord.
2. **Friction Collect** : instrumenter *localement* (compteur d'étapes dans localStorage, visible dans DevFixtures) — pas d'analytics externe (**small**).
3. **Chat** : historique complet envoyé à chaque tour sans troncature (`Chat.jsx:273`). → fenêtre glissante (**small**).
4. Le format deux temps du masterPrompt (réponse courte + approfondissements numérotés) est une très bonne mécanique produit.

---

## 6. Regulatory & compliance

1. **Frontière CIF — ÉLEVÉE (juridique)** : opportunités à l'impératif (« Verser 4 200 € sur votre PER avant le 31/12 ») = recommandation personnalisée d'investissement, zone grise CIF/AMF. Aucune mention CIF/ORIAS dans `gcp.md` ni le masterPrompt. → (a) validation avocat avant commercialisation, (b) en attendant, reformuler les `action` en « Piste à étudier : … » (**small** côté code).
2. **Sécurité navigateur — ÉLEVÉE (small)** : clé API en clair dans localStorage + profil fiscal dans localStorage + **aucune CSP** (`index.html` et `vercel.json` sans headers). → CSP stricte (`connect-src 'self' https://api.anthropic.com https://api.mistral.ai`, `script-src 'self'`), `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` dans `vercel.json`. **Meilleur ratio impact/effort de l'audit.**
3. **Fuites console** : `detectPeriod` logge 300 caractères du PDF, `skillRouter` logge la question utilisateur. → gater derrière `import.meta.env.DEV` (**small**).
4. **RGPD** : page Privacy remarquablement honnête. Ajouter la politique de rétention côté fournisseur (**small**).

---

## 7. Performance & DevOps

1. **Aucune CI de tests — ÉLEVÉE (small)** : `.github/workflows/` ne contient que `update-bareme.yml`. → workflow lint + vitest sur push/PR.
2. **Bundle** : code-splitting par route OK, mais :
   - `masterPrompt-*.js` : **1,99 Mo (317 kB gzip)** — `skillsLoader.js` importe tous les .md + tous les JSON/MD paperasse en eager `?raw`. → globs **lazy**, chargement par skill actif (**medium**).
   - `docExtract-*.js` : 843 kB (301 kB gzip) — vraisemblablement pdfjs-dist dans le graphe ; vérifier qu'il n'est chargé que sur /anonymize (**small à diagnostiquer**).
3. **Vitest coverage** (v8) à configurer pour objectiver les gaps code (**small**).
4. **Documentation** : au-dessus de la moyenne. Rien à redire.

---

## Priorisation consolidée

### Critique (correctifs fiscaux / légaux / intégrité des principes)

| # | Item | Scope | État |
|---|---|---|---|
| C1 | CEHR : lire le bloc `cehr` du JSON au lieu des valeurs en dur | small | ✅ 08/07/2026 (8b19824) |
| C2 | Taux décote 0,4525 → champ JSON + update-bareme | small | ✅ 08/07/2026 (1738afb) |
| C3 | Abattement pensions dans `profileParser` (plafond 4 446 €/foyer, via `abattement10Pension`) | small | ✅ 08/07/2026 (ad9b39d) |
| C4 | PS 17,2 %, micro-foncier 0,70, taux PER 10 %, plafonds PEA/AV/livrets, simulateur → constantes JSON | small | ✅ 08/07/2026 (3b2a953, caa6d44, dcfe745) |
| C5 | Garde-fou anonymisation : PDF sans couche texte = avertissement bloquant avant envoi API | small | ✅ 08/07/2026 (e799849) |
| C6 | Garde-fou étape 0 : « couple » = marié/pacsé uniquement (concubinage → 2 déclarations) | small | ✅ 08/07/2026 (2cace04) |

> ⚠️ Les champs machine ajoutés aux JSON paperasse (`decote.taux`, `per_individuel.taux_calcul`, `assurance_vie_rachats.taux_ir_pfl_apres_8_ans` + `seuil_primes_nettes_taux_reduit`) ont été répliqués dans `_sources/paperasse/` (gitignoré) — **à proposer upstream sur romainsimon/paperasse** pour survivre à un re-clone.

### Élevée

| # | Item | Scope | État |
|---|---|---|---|
| E1 | CI GitHub Actions : lint + vitest sur PR | small | ✅ 08/07/2026 (ab2ba14) — inclut fix rules-of-hooks Rapport.jsx |
| E2 | CSP + security headers dans `vercel.json` ; console.log gatés en DEV | small | ✅ 08/07/2026 (7a13645) — CSP à valider sur un déploiement preview Vercel |
| E3 | Arbitre 2OP global (dividendes + PV ensemble) remplaçant les 2 recommandations indépendantes | medium | ✅ 08/07/2026 (branche arbitre-2op-global) — spec + plan dans docs/superpowers/ |
| E4 | Chiffres `computeFoyerSummary` injectés dans le system prompt (Claude cite, ne recalcule pas) ; enrichissement IA restreint aux sections narratives | medium | ✅ 08/07/2026 (branche chiffres-officiels-e4) — inclut blindage parser (bug latent « DÉCLARANT 2 » corrigé) |
| E5 | Reformulation CIF-safe des `action` du detector + validation avocat avant commercialisation | small (code) | à planifier |
| E6 | Passe accessibilité sur Collect (labels, focus, aria) + `useReducedMotion` — inclut les 25 warnings React Compiler laissés en warn | medium | à planifier |
| E7 | Lazy-loading des données skills (chunk 2 Mo → chargement par skill actif) | medium | à planifier |
| E8 | Test d'architecture anti-hardcode (grep des littéraux fiscaux) | small | ✅ 08/07/2026 (52a3cc5) |

### Moyenne

- Scénarios A/B/C PER + bloc sensibilité TMI sortie (medium)
- Mutualisation 6QR dans la cascade (medium)
- Rachats AV 2CH (medium)
- Routeur de skills tokenisé + lexiques depuis paperasse (small)
- Troncature historique chat (small)
- Extraction logique métier hors de Rapport/Simulator/Collect + premiers tests composants (medium)
- Avertissement PER-blocage dans l'opportunité `per_optimal` (small)
- Zones multi-lignes dans l'anonymiseur (medium)
- Vitest coverage (small)

### Basse

- Multiplicateur 5×PASS en JSON
- Typo `revensFonciers` (rename mécanique)
- Alias de sections TXT à consolider lors du passage v2-canonique
- Diagnostic chunk docExtract
- Mention rétention Anthropic sur la page Privacy

### Refactor de fond (unique, non urgent)

Faire du profil v2 JSON le store canonique et du TXT une vue générée (**large**). Tout le reste de l'architecture — plugins auto-découverts, paperasse-first (une fois les fuites corrigées), conseil déterministe, registre documentaire — est sain et mérite d'être poursuivi tel quel.
