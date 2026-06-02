# Sources fiscales — barèmes, seuils et plafonds

Livrable transverse (roadmap « Généralisation profil français »). Chaque valeur
chiffrée utilisée par le moteur provient de **Paperasse** (source unique
d'autorité) ; ce fichier en récapitule l'origine officielle et la date de
vérification, pour le point de contrôle annuel.

> **Règle** : la logique ne contient aucun chiffre en dur. Tout taux / seuil /
> barème est lu dans `src/data/paperasse/fiscaliste/data/*.json`. Un chiffre sans
> source = bug bloquant.

## Revenus 2025 (déclaration 2026)

| Donnée | Valeur | Fichier Paperasse | Source officielle | Vérifié le |
|--------|--------|-------------------|-------------------|-----------|
| Barème IR (5 tranches, +0,9 %) | 0 / 11 600 / 29 579 / 84 577 / 181 917 | `bareme-ir-2025.json` → `bareme_ir` | LFI 2026 n°2026-103, art. 4 ; ACTU-2026-00022 | 2026-06-01 |
| Décote célibataire / couple | 897 € / 1 483 € (seuils 1 982 / 3 277) | `bareme-ir-2025.json` → `decote` | BOI-IR-LIQ-20-20-30 | 2026-06-01 |
| Abattement 10 % salaires | min 509 € / max 14 555 € | `bareme-ir-2025.json` | art. 83-3° CGI | 2026-06-01 |
| Abattement 10 % pensions | min 450 € / max 4 446 € | `bareme-ir-2025.json` | art. 158-5-a CGI | 2026-06-01 |
| Plafond QF par demi-part | 1 807 € | `bareme-ir-2025.json` → `quotient_familial` | BOI-IR-LIQ-20-20-20 | 2026-06-01 |
| Plafond QF part entière 1er enfant (parent isolé, case T) | **4 262 €** (soit 2 131 €/demi-part) | `quotient_familial.plafond_gain_parent_isole` | BOI-IR-LIQ-20-20-20 ; economie.gouv.fr (quotient familial) ; art. 194-II CGI | 2026-06-01 |
| Plafond QF demi-part case L | **1 079 €** | `quotient_familial.plafond_gain_case_L` | art. 195-1 CGI ; BOI-IR-LIQ-20-20-20 | 2026-06-01 |
| Plafond QF demi-part invalidité (P/F/G/S/W) | **1 079 €** | `quotient_familial.plafond_gain_invalidite` | art. 195 CGI ; BOI-IR-LIQ-20-20-20 | 2026-06-01 |
| Règles de parts (base + majorations enfants) | 1 / 2 ; +0,5 / +0,5 / +1 | `quotient_familial.parts` | art. 194-195 CGI ; BOI-IR-LIQ-10-10 | 2026-06-01 |
| Plafonnement global des niches | 10 000 € (métropole) / 18 000 € (outre-mer, SOFICA) | `niches-fiscales.json` → `plafonnement_global` | art. 200-0 A CGI ; BOI-IR-LIQ-20-20-10 | 2026-06-01 |
| CEHR — seuils & taux | 3 % / 4 % (250k-500k / >500k solo ; 500k-1M / >1M couple) | `bareme-ir-2025.json` → `cehr` | art. 223 sexies CGI | 2026-06-01 |
| Prélèvements sociaux capital | 17,2 % | `pfu-prelevements-sociaux.json` | art. 235 ter CGI | (existant) |

## PHASE 1 — Charges déductibles & réductions/crédits (revenus 2025)

| Donnée | Valeur | Fichier Paperasse | Source officielle | Vérifié le |
|--------|--------|-------------------|-------------------|-----------|
| Pension alim. enfant majeur — forfait | 4 075 €/enfant (×2 si chargé de famille) | `charges-deductibles.json` | art. 156-II CGI ; economie.gouv.fr | 2026-06-01 |
| Pension alim. enfant majeur — plafond réel | 6 855 €/enfant (×2 si chargé de famille) | `charges-deductibles.json` | Brochure IR 2026 ; economie.gouv.fr | 2026-06-01 |
| Pension alim. ascendant | montant réel justifié (sans plafond) | `charges-deductibles.json` | art. 156-II-2° CGI | 2026-06-01 |
| Frais d'accueil personne âgée > 75 ans (6EU) | 4 075 €/personne | `charges-deductibles.json` | art. 156-II-2° ter CGI ; Brochure IR 2026 | 2026-06-01 |
| Emploi à domicile (7DB/7DF) | crédit 50 %, plafond 12 000 € + 1 500 €/pers. (max 15 000 ; 18 000 1re année ; 20 000 invalidité) | `niches-fiscales.json` | art. 199 sexdecies CGI | 2026-06-01 |
| Garde enfant < 6 ans (7GA-7GG) | crédit 50 %, plafond 3 500 €/enfant (1 750 € alternée) | `niches-fiscales.json` | art. 200 quater B CGI | 2026-06-01 |
| Frais de scolarité (7EA-7EF) | réduction 61 / 153 / 183 € (collège / lycée / sup) | `niches-fiscales.json` | art. 199 quater F CGI | 2026-06-01 |
| Dons (7UD / 7UF) | 75 % jusqu'à 1 000 €, puis 66 % (plafond 20 % du revenu imposable) | `niches-fiscales.json` | art. 200 CGI | 2026-06-01 |
| Cotisations syndicales (7AC/7AE/7AG) | crédit 66 %, plafond 1 % du revenu brut | `niches-fiscales.json` | art. 199 quater C CGI | 2026-06-01 |
| PFU / option barème dividendes | abattement 40 % + CSG déductible 6,8 % | `pfu-prelevements-sociaux.json` | art. 200 A CGI ; gcp.md | (existant) |

### Valeurs enrichies en PHASE 0

Les plafonds **case T (4 262 €)**, **case L (1 079 €)** et **invalidité
(1 079 €)** étaient `null` dans `bareme-ir-2025.json` (« à vérifier »). Ils ont
été renseignés à partir des sources ci-dessus (BOFiP BOI-IR-LIQ-20-20-20 +
economie.gouv.fr, indexation LFI 2026 +0,9 %) et bloc `_meta_sources_plafonds`
documenté dans le JSON. La réduction d'impôt complémentaire invalidité (1 801 €)
est notée pour usage ultérieur.

## PHASE 3 — Immobilier locatif (revenus 2025)

| Donnée | Valeur | Fichier Paperasse | Source officielle | Vérifié le |
|--------|--------|-------------------|-------------------|-----------|
| Micro-foncier (location nue) — seuil / abattement | 15 000 € / 30 % (case 4BE) | `regimes-fonciers-lmnp.json` → `micro_foncier` | art. 32 CGI ; BOI-RFPI | 2026-06-02 |
| Déficit foncier — imputation revenu global | 10 700 €/an (cases 4BB/4BC/4BD) | `regimes-fonciers-lmnp.json` → `regime_reel_foncier.deficit_foncier` | art. 156-I-3° CGI | 2026-06-02 |
| Déficit foncier — plafond rénovation énergétique | 21 400 €/an (temporaire) | `regimes-fonciers-lmnp.json` → `regime_reel_foncier.deficit_foncier` | art. 156-I-3° CGI (loi climat) | 2026-06-02 |
| Déficit foncier — report sur revenus fonciers | 10 ans ; intérêts JAMAIS imputables sur revenu global | `regimes-fonciers-lmnp.json` → `regime_reel_foncier.deficit_foncier` | art. 156-I-3° CGI ; BOI-RFPI-BASE-30 | 2026-06-02 |
| LMNP micro-BIC longue durée — seuil / abattement | 77 700 € / 50 % (5ND/5OD/5PD) | `regimes-fonciers-lmnp.json` → `micro_bic_lmnp.lmnp_longue_duree` | art. 50-0 CGI ; BOI-BIC-CHAMP-40 | 2026-06-02 |
| LMNP meublé tourisme classé — seuil / abattement | 77 700 € / 50 % (5NG/5OG/5PG) | `regimes-fonciers-lmnp.json` → `micro_bic_lmnp.meuble_tourisme_classe` | loi Le Meur (nov. 2024) ; BOI-BIC-CHAMP-40 | 2026-06-02 |
| LMNP meublé tourisme non classé — seuil / abattement | 15 000 € / 30 % | `regimes-fonciers-lmnp.json` → `micro_bic_lmnp.meuble_tourisme_non_classe` | loi Le Meur (nov. 2024) ; BOI-BIC-CHAMP-40 | 2026-06-02 |
| Abattement micro-BIC LMNP — plancher | 305 € | `regimes-fonciers-lmnp.json` → `micro_bic_lmnp.abattement_minimum_euros` | art. 50-0 CGI | 2026-06-02 |
| LMNP réel — résultat BIC net (saisi) | cases 5NA/5OA/5PA ; amortissements → expert-comptable | `regimes-fonciers-lmnp.json` → `lmnp_reel` | art. 39 C CGI ; liasse 2031/2033-A | 2026-06-02 |
| Bascule LMP — seuils cumulatifs | recettes > 23 000 € **ET** > 50 % des revenus pro du foyer | `regimes-fonciers-lmnp.json` → `lmp_vs_lmnp.seuils_cumulatifs` | art. 155-IV CGI | 2026-06-02 |
| SCI à l'IR — transparence | revenus fonciers (micro/réel) au prorata des parts ; pas d'amortissement | `regimes-fonciers-lmnp.json` → `sci_ir` | art. 8 CGI | 2026-06-02 |
| PS sur foncier / LMNP | 17,2 % (non dupliqué — voir `pfu-prelevements-sociaux.json`) | `pfu-prelevements-sociaux.json` | art. 235 ter CGI | (existant) |

> **Manque comblé en PHASE 3** : les n° de cases déclaratives (4BA-4BE, 5ND/5OD,
> 5NG/5OG, 5NA/5OA) et les plafonds numériques (10 700 / 21 400 / 305 €, seuils
> de bascule LMP 23 000 € et 50 %) n'étaient présents que dans le `.md` de
> référence ; ils ont été structurés dans `regimes-fonciers-lmnp.json` (champs
> `cases*`, `deficit_foncier.*`, `lmp_vs_lmnp.seuils_cumulatifs.*`) pour rester
> lisibles par le moteur, sans chiffre en dur.

## Rituel annuel de bascule d'année (procédure — à NE PAS exécuter ici)

Chaque janvier, après publication de la Loi de finances :

1. **Dupliquer** `src/data/paperasse/fiscaliste/data/bareme-ir-<N>.json` en
   `bareme-ir-<N+1>.json`. Le moteur (`taxCalculator.js`, auto-sélection par
   glob) active automatiquement le millésime le plus récent — aucune modif de code.
2. **Recroiser CHAQUE valeur** avec Paperasse mis à jour (barème IR, PASS,
   plafonds QF, décote, abattements, plafonds PER, niches, CEHR).
3. **Marquer explicitement les écarts** et la date de vérification (mettre à jour
   ce tableau + les blocs `_meta` / `_meta_sources_plafonds` des JSON).
4. **Relancer la suite de tests** : les cas vérifiés à la main contre
   impots.gouv.fr (`src/lib/__tests__/phase0-socle.test.js` — 3 profils IR de
   référence) doivent être re-validés pour la nouvelle année.

> Disclaimer permanent : outil d'aide, ne se substitue pas à un conseil
> professionnel ; vérifiez sur impots.gouv.fr.
