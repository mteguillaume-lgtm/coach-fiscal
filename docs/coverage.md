# Couverture des cas fiscaux — coach-fiscal

Dernière MAJ : 2026-05-18 — Sprint A — PR A1 (multi-employeurs) + PR A2 (chômage) + PR A3 (apprentissage) + PR A4 (heures supp) + PR A5 (frais réels) + PR A6 (licenciement + PPV)

Légende : ✅ couvert | 🟡 partiel | ❌ non couvert | 🚫 hors scope V1

---

## Revenus salariés et assimilés

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Salaires simple-employeur | 1AJ/1BJ | ✅ | Initial |
| Multi-employeurs cumul sur l'année | 1AJ/1BJ | ✅ | A — PR A1 |
| IJ CPAM maladie | 1AJ/1BJ | ✅ | PR1 |
| IJ CPAM maternité/paternité | 1AJ/1BJ | 🟡 | A |
| Allocations chômage France Travail | 1AP/1BP | ✅ | A — PR A2 |
| Apprentissage (abattement spécifique) | 1AJ/1BJ | ✅ | A — PR A3 |
| Stage gratification | 1AJ/1BJ | ❌ | A |
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
| Pensions alimentaires reçues | 1AO/1BO | ❌ | E |

## Revenus de capitaux mobiliers

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Intérêts livret bancaire fiscalisé | 2TR | ✅ | PR3 |
| PFU 12,8% déjà prélevé | 2CK | ✅ | PR3 |
| CSG déductible (option barème) | 2BH | ✅ | PR3 |
| Dividendes actions françaises | 2DC | ❌ | B |
| Dividendes avec abattement 40% (option barème) | 2DC + 2OP | ❌ | B |
| Option globale barème vs PFU simulateur | 2OP | ❌ | B |
| Coupons obligations | 2TR | 🟡 | B |
| Produits d'AV < 8 ans rachat | 2CH | ❌ | B |
| Produits d'AV > 8 ans rachat avec abattement | 2CH/2BH | ❌ | B |
| Crédit d'impôt sur dividendes étrangers | 2AB | ❌ | — |

## Plus-values mobilières et crypto

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Plus-values mobilières simples | 3VG | ❌ | B |
| Moins-values reportables 10 ans | 3VH | ❌ | B |
| Formulaire 2074 multi-cessions | 2074 | ❌ | B |
| Abattement durée détention (titres < 2018) | 3SG | ❌ | B |
| Crypto détention compte étranger | 8UU + 3916bis | ✅ | Initial |
| Crypto cession unique 2025 | 3AN | 🟡 | B |
| Crypto cessions multiples PAMC | 2086 + 3AN | ❌ | B |
| Crypto > 305€ de cessions seuil imposition | — | 🟡 | B |

## Revenus fonciers

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Micro-foncier < 15 000€ | 4BE | ✅ | Initial |
| Régime réel formulaire 2044 | 2044 | ❌ | C1 |
| Déficit foncier reportable 10 ans | 4BB/4BC/4BD | ❌ | C1 |
| Déficit foncier 10 700€ imputable revenu global | — | ❌ | C1 |
| Travaux énergétiques double plafond | 4BC | ❌ | C1 |
| Revenus SCPI | 4BE ou 2044 | ❌ | C1 |
| Revenus SCI à l'IR (transparence) | 2044 | ❌ | C1 |
| Indivision quote-part | 4BE ou 2044 | 🟡 | C1 |
| Démembrement nu-propriétaire | — | 🟡 | C1 |
| Démembrement usufruitier | 4BE ou 2044 | ❌ | C1 |

## Location meublée (LMNP / LMP)

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| LMNP micro-BIC < 77 700€ | 5ND/5OD | ❌ | C2 |
| LMNP micro-BIC meublé tourisme classé | 5NG/5OG | ❌ | C2 |
| LMNP régime réel formulaire 2031 | 2031 | ❌ | C2 |
| LMNP amortissements | 2033-A | ❌ | C2 |
| Bascule LMP (recettes > 23 000€ + 50%) | 5KC/5LC | ❌ | C2 |
| Déficit LMNP reportable 10 ans (BIC) | — | ❌ | C2 |

## Plus-values immobilières

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Plus-value cession résidence secondaire | 3VZ | ❌ | C1 |
| Abattement durée détention IR (22 ans) | — | ❌ | C1 |
| Abattement durée détention PS (30 ans) | — | ❌ | C1 |
| Exonération résidence principale | — | ❌ | C1 |
| Exonération première cession non-RP | — | ❌ | C1 |
| Surtaxe PV > 50 000€ | — | ❌ | C1 |

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
| Salaires étrangers convention fiscale | 1AF/1BF ou 8TI | 🚫 V2 | — |
| Pensions étrangères | 1AL/1BL | 🚫 V2 | — |
| Revenus fonciers étrangers | 4BL | 🚫 V2 | — |
| Crédit d'impôt étranger | 8TK | 🚫 V2 | — |
| Frontaliers Suisse/Belgique/Luxembourg | 1AF/1BF | 🚫 V2 | — |

## Charges déductibles du revenu

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Versements PER individuel | 6NS/6NT | ✅ | Initial |
| Cotisations PERO obligatoires (déjà déduites) | 6QS/6QT | ✅ | Initial |
| Abondement PERCO employeur | 6QU | 🟡 | Initial |
| Plafond PER mutualisé couple | — | ✅ | Initial |
| Plafonds PER N-3 reportables | — | ❌ | B |
| Pension alimentaire versée enfant majeur | 6EL/6EM | ❌ | E |
| Pension alimentaire versée ascendant | 6GU/6GI | ❌ | E |
| CSG déductible sur revenus du patrimoine | 6DE | 🟡 | B |
| Frais d'accueil personne âgée | 6EU | ❌ | E |

## Réductions et crédits d'impôt

| Cas | Cases | État | Sprint cible |
|---|---|---|---|
| Dons associations 66% | 7UF | ❌ | D |
| Dons organismes aide aux personnes 75% | 7UD | ❌ | D |
| Cotisations syndicales 66% | 7AC/7AE/7AG | ❌ | D |
| Emploi salarié à domicile | 7DB/7DF | ❌ | D |
| Garde enfants < 6 ans hors domicile | 7GA-7GG | ❌ | D |
| Scolarité collège/lycée/sup | 7EA-7EG | ❌ | D |
| Investissement Pinel | 7QA-7QZ | ❌ | C2 |
| Investissement Denormandie | 7QY/7QZ | ❌ | C2 |
| Loi Malraux | 7NA-7ND | ❌ | C2 |
| FCPI/FIP | 7GQ-7FQ | ❌ | D |
| SOFICA | 7GN | ❌ | D |
| IR-PME Madelin / souscription au capital | 7CF/7CH | ❌ | D |
| Censi-Bouvard | 7II/7IJ | ❌ | C2 |
| MaPrimeRénov (déclaratif info) | — | ❌ | D |
| CITE résiduel | — | 🚫 | — |
| Intérêts emprunt étudiant | 7UK | ❌ | D |
| Plafonnement global niches 10 000€ | — | ❌ | D |
| Plafonnement spécifique 18 000€ (outre-mer/SOFICA) | — | ❌ | D |

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
| Enfant à charge mineur | 🟡 | E |
| Enfant majeur rattaché < 21 ans | ❌ | E |
| Enfant majeur rattaché étudiant < 25 ans | ❌ | E |
| Garde alternée — demi-parts partagées | ❌ | E |
| Pension alimentaire vs rattachement (simulateur) | ❌ | E |
| Parent isolé case T | ❌ | E |
| Invalidité contribuable case P | ❌ | E |
| Invalidité conjoint case F | ❌ | E |
| Plafonnement quotient familial 1 759€/demi-part | ❌ | E |
| Décote IR | ✅ | Initial |
| Contribution exceptionnelle haut revenus | ❌ | F |

## Patrimoine et IFI

| Cas | État | Sprint cible |
|---|---|---|
| Suivi résidence principale + crédit | ✅ | Initial |
| Suivi immobilier locatif | 🟡 | C |
| PEA antériorité 5 ans | ✅ | Initial |
| PEA-PME antériorité | ❌ | B |
| Assurance-vie multi-supports | 🟡 | B |
| Antériorité AV 8 ans abattement 4 600€/9 200€ | ❌ | B |
| PER individuel suivi capital | ✅ | Initial |
| PERCO/PERECO | 🟡 | Initial |
| Livrets réglementés (A/LDDS/LEP) | ✅ | Initial |
| PEL antériorité fiscale | ✅ | Initial |
| Crypto wallets multi-plateformes | 🟡 | B |
| IFI > 1,3 M€ formulaire 2042-IFI | ❌ | F |
| Décote IFI résidence principale 30% | ❌ | F |
| Dettes déductibles IFI | ❌ | F |
| SCI à l'IFI quote-part | ❌ | F |
| Démembrement nu-propriété (hors IFI) | ✅ | Initial |
| Indivision successorale | 🟡 | Initial |
| Donations antérieures suivi (rappel fiscal 15 ans) | ❌ | — V2 |

## Cas particuliers et conformité

| Cas | État | Sprint cible |
|---|---|---|
| Non-résident fiscal | 🚫 V2 | — |
| Résident depuis < 1 an | 🚫 V2 | — |
| Déménagement mi-année | ❌ | — V2 |
| Décès du conjoint dans l'année | ❌ | E |
| Naissance/adoption | ❌ | E |
| Compte à l'étranger 3916/3916bis | ✅ | Initial |
| Trust à l'étranger | 🚫 V2 | — |
| Régime impatriés (art. 155 B CGI) | 🚫 V2 | — |

---

## Synthèse rapide

| État | Nombre de cas |
|---|---|
| ✅ Couvert | ~32 |
| 🟡 Partiel | ~11 |
| ❌ Non couvert (V1) | ~76 |
| 🚫 Hors scope V1 | ~15 |

**Objectif fin V1 (Sprint F terminé)** : 100+ cas en ✅, < 10 en 🟡.

---

## Règle de mise à jour

Ce fichier est mis à jour **à la fin de chaque PR** d'un sprint fonctionnel.
Chaque case passant de ❌/🟡 à ✅ doit être committée avec la PR
correspondante (dans le même commit ou un commit dédié).

Lors des sprints, **toujours joindre ce fichier** au prompt Claude Code
pour qu'il sache exactement ce qui est attendu et ce qui est déjà fait.