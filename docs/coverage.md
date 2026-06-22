# Couverture des cas fiscaux — kapio

Dernière MAJ : 2026-06-02 — **PHASE 1** : charges déductibles (pensions alim., frais accueil) + réductions/crédits grand public (dons, emploi domicile, garde, scolarité, syndicales) + dividendes CTO & arbitrage PFU/barème + leviers détecteur
PHASE 0 (socle) : CTO + moteur IR complet (plafonnement QF case T/L/invalidité, step niches, CEHR) + situation familiale dérivée (calcParts)
Historique : Sprint A — PR A1 (multi-employeurs) + PR A2 (chômage) + PR A3 (apprentissage) + PR A4 (heures supp) + PR A5 (frais réels) + PR A6 (licenciement + PPV)

Légende : ✅ couvert | 🟡 partiel | ❌ non couvert | 🚫 hors scope V1

---

## Revenus salariés et assimilés

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Salaires simple-employeur | 1AJ/1BJ | ✅ | Initial |
| Multi-employeurs cumul sur l'année | 1AJ/1BJ | ✅ | A — PR A1 |
| IJ CPAM maladie | 1AJ/1BJ | ✅ | PR1 |
| IJ CPAM maternité/paternité | 1AJ/1BJ | 🟡 | B |
| Allocations chômage France Travail | 1AP/1BP | ✅ | A — PR A2 |
| Apprentissage (abattement spécifique) | 1AJ/1BJ | ✅ | A — PR A3 |
| Stage gratification | 1AJ/1BJ | ❌ | B |
| Heures supplémentaires défiscalisées | 1GH/1HH | ✅ | A — PR A4 |
| Frais réels assistant calcul | 1AK/1BK | ✅ | A — PR A5 |
| Indemnité de licenciement | 1AJ/1BJ + 1AD/1BD | ✅ | A — PR A6 |
| Prime de partage de la valeur (PPV) | 1AJ/1BJ | ✅ | A — PR A6 |

## Pensions, retraites, rentes

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Pension retraite régime de base | 1AS/1BS | ✅ | PR2 |
| Pension retraite complémentaire AGIRC-ARRCO | 1AS/1BS | ✅ | PR2 |
| Rente viagère de réversion | 1AS/1BS | ✅ | PR2 |
| Pension d'invalidité | 1AS/1BS | 🟡 | A |
| Rentes viagères à titre onéreux (PER capital) | 1AW/1BW | ❌ | B |
| Pensions alimentaires reçues | 1AO/1BO | ✅ | 1 — ajoutées au RNI |

## Revenus de capitaux mobiliers

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Intérêts livret bancaire fiscalisé | 2TR | ✅ | PR3 |
| PFU 12,8% déjà prélevé | 2CK | ✅ | PR3 |
| CSG déductible (option barème) | 2BH | ✅ | PR3 |
| Dividendes actions françaises | 2DC | ✅ | 1 |
| Dividendes avec abattement 40% (option barème) | 2DC + 2OP | ✅ | 1 — arbitragePfuBareme |
| Option globale barème vs PFU simulateur | 2OP | ✅ | 1 — levier détecteur chiffré |
| Coupons obligations | 2TR | 🟡 | B |
| Produits d'AV < 8 ans rachat | 2CH | ❌ | B |
| Produits d'AV > 8 ans rachat avec abattement | 2CH/2BH | ❌ | B |
| Crédit d'impôt sur dividendes étrangers | 2AB | ❌ | — |

## Plus-values mobilières et crypto

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Plus-values mobilières simples (PFU 12,8% + 17,2% PS) | 3VG | ✅ | PHASE 4 |
| Moins-values reportables 10 ans (imputées sur PV même nature) | 3VH | ✅ | PHASE 4 |
| Option barème + arbitrage PFU/barème (levier détecteur) | 2OP | ✅ | PHASE 4 |
| Abattement durée détention (titres < 2018, droit commun 50/65%) | — | ✅ | PHASE 4 (option barème, IR seul) |
| Abattement durée détention renforcé PME (50/65/85%) | — | ✅ | PHASE 4 |
| Abattement dirigeant retraite 500 000€ | — | 🟡 | PHASE 4 (→ avocat fiscaliste) |
| Formulaire 2074 multi-cessions | 2074 | 🟡 | PHASE 4 (gain net saisi) |
| Crypto détention compte étranger | 8UU + 3916bis | ✅ | Initial |
| Crypto plus-value (PFU 12,8% + 17,2% PS) | 3AN | ✅ | PHASE 4 |
| Crypto > 305€ de cessions seuil imposition (exonération ≤ 305€) | — | ✅ | PHASE 4 |
| Crypto cessions multiples PAMC | 2086 + 3AN | 🟡 | PHASE 4 (PV nette saisie) |

## Revenus fonciers

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Micro-foncier < 15 000€ | 4BE | ✅ | Initial |
| Régime réel formulaire 2044 | 2044 / 4BA | ✅ | PHASE 3 |
| Déficit foncier reportable 10 ans | 4BB/4BC/4BD | ✅ | PHASE 3 |
| Déficit foncier 10 700€ imputable revenu global | 4BC | ✅ | PHASE 3 |
| Travaux énergétiques double plafond (21 400€) | 4BC | ✅ | PHASE 3 |
| Intérêts d'emprunt non imputables sur revenu global | — | ✅ | PHASE 3 |
| Revenus SCPI | 4BE ou 2044 | 🟡 | PHASE 3 (via foncier réel/micro) |
| Revenus SCI à l'IR (transparence) | 2044 | ✅ | PHASE 3 (quote-part nette) |
| Indivision quote-part | 4BE ou 2044 | 🟡 | C1 |
| Démembrement nu-propriétaire | — | 🟡 | C1 (→ notaire) |
| Démembrement usufruitier | 4BE ou 2044 | 🟡 | C1 (→ notaire) |

## Location meublée (LMNP / LMP)

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| LMNP micro-BIC longue durée < 77 700€ (abat. 50%) | 5ND/5OD | ✅ | PHASE 3 |
| LMNP micro-BIC meublé tourisme classé (abat. 50%) | 5NG/5OG | ✅ | PHASE 3 |
| LMNP micro-BIC tourisme non classé < 15 000€ (abat. 30%, loi Le Meur) | 5ND/5OD | ✅ | PHASE 3 |
| LMNP régime réel formulaire 2031 (résultat saisi) | 2031 / 5NA | 🟡 | PHASE 3 (→ expert-comptable) |
| LMNP amortissements | 2033-A | 🟡 | PHASE 3 (→ expert-comptable) |
| Bascule LMP (recettes > 23 000€ ET > 50%) | 5KC/5LC | ✅ | PHASE 3 (détection + routage) |
| Déficit LMNP reportable 10 ans (BIC, non imputable global) | — | ✅ | PHASE 3 |

## Plus-values immobilières

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Plus-value cession résidence secondaire (estimation IR 19% + 17,2% PS) | 3VZ | ✅ | PHASE 4 (→ notaire, hors solde annuel) |
| Abattement durée détention IR (exonération 22 ans) | — | ✅ | PHASE 4 |
| Abattement durée détention PS (exonération 30 ans) | — | ✅ | PHASE 4 |
| Prix d'acquisition majoré (forfait 7,5% frais + 15% travaux) | — | ✅ | PHASE 4 |
| Exonération résidence principale | — | ✅ | PHASE 4 |
| Exonération petit prix ≤ 15 000€ | — | ✅ | PHASE 4 |
| Exonération première cession non-RP (remploi) | — | 🟡 | PHASE 4 (→ notaire) |
| Surtaxe PV > 50 000€ (barème lissé art. 1609 nonies G) | — | ✅ | PHASE 4 |

## BIC / BNC / BA (indépendants)

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Micro-BIC commerce | 5KO/5LO | 🚫 V2 | — |
| Micro-BIC services | 5KP/5LP | 🚫 V2 | — |
| Micro-BNC professions libérales | 5HQ/5IQ | 🚫 V2 | — |
| Régime réel BIC/BNC | 2031/2035 | 🚫 V2 | — |
| Bénéfices agricoles | 5HC à 5JG | 🚫 V2 | — |
| Auto-entrepreneur versement libératoire | 5TA/5UA | 🚫 V2 | — |

## Revenus étrangers

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Méthode du taux effectif (exemption avec progressivité) | 8TI | ✅ | PHASE 6 — `calcTauxEffectif`, IR mondial proraté |
| Crédit d'impôt étranger (imputation) | 8TK | ✅ | PHASE 6 — `calcCreditImpotEtranger`, plafonné quote-part FR |
| Salaires étrangers convention fiscale | 1AF/1BF/1AG/1BG | ✅ | PHASE 6 (via taux effectif / crédit selon convention) |
| Pensions étrangères | 1AL/1BL | ✅ | PHASE 6 (via taux effectif / crédit) |
| Frontaliers Suisse/Belgique/Luxembourg | 1AF/1BF ou 8TI | ✅ | PHASE 6 (méthode selon accord frontalier) |
| Revenus fonciers étrangers | 4BL | 🟡 | PHASE 6 (via 8TI/8TK saisi ; cas complexes → avocat fiscaliste) |
| Non-résident — taux minimum 20/30% | — | 🟡 | PHASE 6 (détection + routage avocat fiscaliste) |
| Impatriés (art. 155 B) | — | 🟡 | PHASE 6 (détection + routage) |
| Exit tax (art. 167 bis) | — | 🟡 | PHASE 6 (détection + routage) |

## Charges déductibles du revenu

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Versements PER individuel | 6NS/6NT | ✅ | Initial |
| Cotisations PERO obligatoires (déjà déduites) | 6QS/6QT | ✅ | Initial |
| Abondement PERCO employeur | 6QU | 🟡 | Initial |
| Plafond PER mutualisé couple | — | ✅ | Initial |
| Plafonds PER N-3 reportables | — | ❌ | B |
| Pension alimentaire versée enfant majeur | 6EL/6EM | ✅ | 1 — plafond 6 855 €/enfant, déduit du RNI |
| Pension alimentaire versée ascendant | 6GU/6GI | ✅ | 1 — montant réel déduit du RNI |
| CSG déductible sur revenus du patrimoine | 6DE | 🟡 | B |
| Frais d'accueil personne âgée | 6EU | ✅ | 1 — plafond 4 075 €/personne |

## Réductions et crédits d'impôt

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Dons associations 66% | 7UF | ✅ | 1 |
| Dons organismes aide aux personnes 75% | 7UD | ✅ | 1 — 75 % jusqu'à 1 000 € puis 66 % |
| Cotisations syndicales 66% | 7AC/7AE/7AG | ✅ | 1 — plafond 1 % revenu brut |
| Emploi salarié à domicile | 7DB/7DF | ✅ | 1 — crédit 50 %, plafond 12 000 €+ |
| Garde enfants < 6 ans hors domicile | 7GA-7GG | ✅ | 1 — crédit 50 %, plafond 3 500 €/enfant |
| Scolarité collège/lycée/sup | 7EA-7EG | ✅ | 1 — réduction 61/153/183 € |
| Investissement Pinel | 7QA-7QZ | ✅ | PHASE 5 (report ; fermé acquisitions 31/12/2024 + flag) |
| Investissement Denormandie | 7QY/7QZ | ✅ | PHASE 5 (report ; fermé 31/12/2024) |
| Loi Malraux | 7NA-7ND | ✅ | PHASE 5 (22/30 %, hors plafond global) |
| FCPI/FIP | 7GQ-7FQ | ✅ | PHASE 5 (18 %, plafond versement 12 000/24 000 €) |
| SOFICA | 7GN | ✅ | PHASE 5 (30 %, plafond majoré 18 000 €) |
| IR-PME Madelin / souscription au capital | 7CF/7CH | ✅ | PHASE 5 (18 %, plafond 50 000/100 000 €) |
| Censi-Bouvard | 7II/7IJ | ✅ | PHASE 5 (report ; fermé 31/12/2022) |
| Girardin outre-mer | 7UM | 🟡 | PHASE 5 (report saisi, plafond 18 000 € → CGP) |
| MaPrimeRénov (déclaratif info) | — | ❌ | D |
| CITE résiduel | — | 🚫 | — |
| Intérêts emprunt étudiant | 7UK | ❌ | D |
| Plafonnement global niches 10 000€ | — | ✅ | 1 — `plafonnementNiches` câblé ; dons/scolarité hors plafond, crédits remboursables au solde |
| Plafonnement spécifique 18 000€ (outre-mer/SOFICA) | — | ✅ | PHASE 5 — `plafonnementNichesDeuxEtages` (base 10k + part SOFICA/OM jusqu'à 18k) |

## Situations familiales

| Cas | État | Sprint cible |
|---|---|---|
| Célibataire | ✅ | Initial |
| Marié·e | ✅ | Initial |
| Pacsé·e | ✅ | Initial |
| Divorcé·e | ✅ | Initial |
| Veuf·ve | 🟡 | E |
| Année du mariage/PACS — option séparée vs commune | ❌ | E |
| Année du divorce — déclaration séparée | ❌ | E |
| Enfant à charge mineur | ✅ | 0 |
| Enfant majeur rattaché < 21 ans | 🟡 | 0 — parts OK ; arbitrage pension vs rattachement en E |
| Enfant majeur rattaché étudiant < 25 ans | 🟡 | 0 — parts OK ; arbitrage en E |
| Garde alternée — demi-parts partagées | ✅ | 0 |
| Pension alimentaire vs rattachement (simulateur) | ❌ | E |
| Parent isolé case T | ✅ | 0 — plafond 4 262 € sourcé |
| Invalidité contribuable case P | ✅ | 0 |
| Invalidité conjoint case F | ✅ | 0 |
| Plafonnement quotient familial 1 807€/demi-part | ✅ | 0 — + plafonds case T (4 262 €) / case L / invalidité (1 079 €) |
| Décote IR | ✅ | Initial |
| Contribution exceptionnelle haut revenus | ✅ | 0 — `calcCEHR` intégré au pipeline `computeFoyerSummary` |

## Patrimoine et IFI

| Cas | État | Sprint cible |
|---|---|---|
| Suivi résidence principale + crédit | ✅ | Initial |
| Suivi immobilier locatif | 🟡 | C |
| PEA antériorité 5 ans | ✅ | Initial |
| PEA-PME antériorité | ❌ | B |
| CTO (compte-titres ordinaire) — bilan + allocation | ✅ | 0 — flag 3916 si courtier étranger ; revenus chiffrés en phases 1 & 4 |
| Assurance-vie multi-supports | 🟡 | B |
| Antériorité AV 8 ans abattement 4 600€/9 200€ | ❌ | B |
| PER individuel suivi capital | ✅ | Initial |
| PERCO/PERECO | 🟡 | Initial |
| Livrets réglementés (A/LDDS/LEP) | ✅ | Initial |
| PEL antériorité fiscale | ✅ | Initial |
| Crypto wallets multi-plateformes | 🟡 | B |
| IFI > 1,3 M€ formulaire 2042-IFI | ✅ | PHASE 5 — `calcIFI` (barème dès 800k€, décote 1,3-1,4M€) |
| Abattement IFI résidence principale 30% | ✅ | PHASE 5 |
| Dettes/passif déductibles IFI | ✅ | PHASE 5 (emprunts, travaux, impôts afférents) |
| Décote IFI 1,3–1,4 M€ (lissage) | ✅ | PHASE 5 |
| Plafonnement IFI à 75 % des revenus | 🟡 | PHASE 5 (signalé → CGP) |
| Exonération biens professionnels | 🟡 | PHASE 5 (signalé → CGP) |
| SCI à l'IFI quote-part | 🟡 | PHASE 5 (via patrimoine brut saisi) |
| Démembrement nu-propriété (hors IFI) | ✅ | Initial |
| Indivision successorale | 🟡 | Initial |
| Donations antérieures suivi (rappel fiscal 15 ans) | ❌ | — V2 |

## Cas particuliers et conformité

| Cas | État | Sprint cible |
|---|---|---|
| Non-résident fiscal | 🟡 | PHASE 6 — détection + routage avocat fiscaliste |
| Résident depuis < 1 an | 🚫 V2 | — |
| Déménagement mi-année | ❌ | — V2 |
| Décès du conjoint dans l'année | ❌ | E |
| Naissance/adoption | ❌ | E |
| Compte à l'étranger 3916/3916bis | ✅ | Initial |
| Trust à l'étranger | 🚫 V2 | — |
| Régime impatriés (art. 155 B CGI) | 🟡 | PHASE 6 — détection + routage avocat fiscaliste |

## Conseil universel & garde-fous (PHASE 7)

| Cas | État | Sprint cible |
|---|---|---|
| Synthèse patrimoniale rédigée (sans/avec action, chiffrée €) | ✅ | PHASE 7 — `conseilPatrimonial.genererSynthese` |
| Agrégation des leviers de toutes les phases (gain total) | ✅ | PHASE 7 |
| Détecteur de zones non couvertes → orientation pro | ✅ | PHASE 7 — `detectZonesNonCouvertes` (international, LMNP/TNS réel, IFI, défisc fermé, PV immo) |
| Disclaimer global permanent + renvoi impots.gouv.fr | ✅ | PHASE 7 — `DisclaimerBanner` sur Opportunités/Rapport/Dashboard |
| Robustesse panneau leviers (types info/alerte, urgence à étudier) | ✅ | PHASE 7 — fallbacks défensifs `OpportunitiesPanel` |

---

## Synthèse rapide

| État | Nombre de cas |
|---|---|
| ✅ Couvert | ~55 |
| 🟡 Partiel | ~12 |
| ❌ Non couvert (V1) | ~52 |
| 🚫 Hors scope V1 | ~15 |

**Objectif fin V1 (Sprint F terminé)** : 100+ cas en ✅, < 10 en 🟡.

---

## Règle de mise à jour

Ce fichier est mis à jour **à la fin de chaque PR** d'un sprint fonctionnel.
Chaque case passant de ❌/🟡 à ✅ doit être committée avec la PR
correspondante (dans le même commit ou un commit dédié).

Lors des sprints, **toujours joindre ce fichier** au prompt Claude Code
pour qu'il sache exactement ce qui est attendu et ce qui est déjà fait.