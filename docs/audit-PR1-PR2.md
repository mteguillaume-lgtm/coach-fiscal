# Audit PR1 + PR2 — kapio

> Généré le 2026-05-17. Basé sur l'état exact des fichiers après PR1 (commit `0411e9d`) + PR2 (non commité, 4 fichiers modifiés).
> PR1 commité sur `main`. PR2 : modifications non encore commitées.

---

## Fichiers modifiés ou créés

### PR1 (commit `0411e9d`) — 7 fichiers, +657 lignes nettes

| Chemin | Δ lignes | Nature |
|---|---|---|
| `src/lib/profileParser.js` | +37 / −0 | Extraction statut, 2TR/2CK, acomptes 8HW–8IX, fix regex TMI |
| `src/lib/profileGenerator.js` | +10 / −0 | Émission lignes 2TR/2CK et acomptes 8HW–8IX |
| `src/pages/Collect.jsx` | +219 / −98 | Champs form 2TR/2CK/acomptes, mapping import complet |
| `src/lib/__tests__/profileParser.test.js` | +212 / −0 | **Créé** — 35 tests Vitest |
| `vite.config.js` | +4 / −0 | Config Vitest (env node, include pattern) |
| `package.json` | +7 / −1 | Scripts `test`/`test:watch`, vitest devDep |
| `package-lock.json` | +364 / −0 | Lock vitest v4.1.6 |

> Note : `src/pages/DeclarationGuide.jsx` avait été modifié dans le commit précédent (`dd9579f`) pour câbler `state.parsedProfile` via `adaptParsedProfile()`. Ce correctif (bug onglet Déclaration) n'est pas dans PR1 mais est un prérequis.

### PR2 (non commité) — 4 fichiers, +128 lignes nettes

| Chemin | Δ lignes | Nature |
|---|---|---|
| `src/lib/profileParser.js` | +39 / −4 | IJ CPAM, rente 1BS, fix rniD2 regex |
| `src/lib/profileGenerator.js` | +33 / −4 | Annotation IJ CPAM, blocs rente 1BS solo+couple |
| `src/pages/Collect.jsx` | +42 / −0 | 6 champs rente/IJ dans REV_FIELDS + SECTION_REV_SOLO + import |
| `src/lib/__tests__/profileParser.test.js` | +30 / −0 | +6 tests IJ CPAM + rente 1BS |

---

## Champs supportés en collecte

> **Légende :** ⬤ existait avant PR1 · **PR1** ajouté en PR1 · **PR2** ajouté en PR2
> Mode **couple** : les champs par-déclarant (REV_FIELDS / EP_INDIV / PROFIL_INDIV) sont saisis deux fois (D1 et D2).

### Situation du foyer — `SECTION_SIT` (foyer/solo)
| Clé | Label | Note |
|---|---|---|
| `statut` ⬤ | Situation familiale | select : Célibataire/Marié(e)/Pacsé(e)/Divorcé(e)/Veuf-Veuve |
| `parts` ⬤ | Parts fiscales | number |
| `enfants` ⬤ | Enfants à charge | number |
| `dept` ⬤ | Département | text |

### Revenus par déclarant — `REV_FIELDS` (couple) / intégrés dans `SECTION_REV_SOLO`
| Clé | Label | Note |
|---|---|---|
| `brut` ⬤ | Brut imposable annuel (€) | |
| `net_imp` ⬤ | Net imposable annuel (€) | 1AJ ou 1BJ |
| `taux_pas` ⬤ | Taux PAS (%) | |
| `pas_tot` ⬤ | PAS prélevé 2025 (€) | |
| `frais_r` ⬤ | Frais réels (€) | vide = forfait 10% |
| `ij_cpam` **PR2** | IJ CPAM dans net imposable (€) | informatif, déjà dans net_imp |
| `ij_cpam_org` **PR2** | IJ CPAM — attestation (CPAM) | visible si ij_cpam > 0 |
| `rente_1bs_montant` **PR2** | Rente viagère — case 1BS (€) | montant net CSG déductible |
| `rente_1bs_pas` **PR2** | PAS sur rente 1BS (€) | visible si rente_1bs_montant > 0 |
| `rente_1bs_organisme` **PR2** | Rente 1BS — organisme | visible si rente_1bs_montant > 0 |
| `rente_1bs_recurrent` **PR2** | Rente 1BS — récurrente ? | select Oui/Non |

### Épargne par déclarant — `EP_INDIV_FIELDS` (couple) / `SECTION_EP_SOLO`
| Clé | Note |
|---|---|
| `livret_a`, `ldd`, `lep`, `livret_plus` ⬤ | soldes livrets réglementés |
| `pel`, `pel_date` ⬤ | avec compute antériorité fiscale |
| `pea`, `pea_date`, `pea_verse` ⬤ | avec compute antériorité + espace restant |
| `per` ⬤ | versements PER 2025 |
| `av`, `av_date`, `av_verse` ⬤ | assurance-vie |
| `crypto_wallet`, `crypto_plateforme` ⬤ | plateforme : import câblé en PR1 |
| `crypto_cessions`, `crypto_montant_cede`, `crypto_pv` ⬤ | cessions : import câblé en PR1 |

### Profil & Retraite par déclarant — `PROFIL_INDIV_FIELDS` (couple) / `SECTION_PROFIL_SOLO`
| Clé | Note |
|---|---|
| `age` / `age_d1` ⬤ | |
| `retraite` / `retraite_d1` ⬤ | |
| `tmi_retraite` / `tmi_retraite_d1` ⬤ | |
| `type_revenu` / `type_revenu_d1` ⬤ | import câblé en PR1 |
| `pension_net_imp` / `pension_net_imp_d1` ⬤ | visible si Mixte |

### Revenus du foyer — `SECTION_REV_FOYER` (couple) / intégrés dans `SECTION_REV_SOLO`
| Clé | Note |
|---|---|
| `foncier` ⬤ | revenus fonciers bruts |
| `divid` ⬤ | dividendes/intérêts |
| `crypto` ⬤ | revenus crypto |
| `int_mob_2tr` **PR1** | intérêts mobiliers case 2TR |
| `int_mob_2ck` **PR1** | PFU 12,8% prélevé case 2CK (visible si 2TR > 0) |

### Déductions — `SECTION_DED` (couple) / `SECTION_DED_SOLO`
| Clé | Note |
|---|---|
| `dons`, `garde`, `domicile`, `travaux` ⬤ | |
| `pero_d1`, `pero_d2` ⬤ | cotisations PERO |
| `pension`, `syndicat` ⬤ | |
| `per_n1`, `per_n2`, `per_n3` ⬤ | plafonds reportables |
| `acompte_8hw` **PR1** | acompte IR D1 (solo et couple) |
| `acompte_8iw` **PR1** | acompte IR D2 (couple uniquement) |
| `acompte_8hx` **PR1** | acompte PS D1 (solo et couple) |
| `acompte_8ix` **PR1** | acompte PS D2 (couple uniquement) |
| `frais_r` ⬤ | frais réels (solo uniquement dans DED) |

### Immobilier — `SECTION_IMMO`
`proprio`, `rp_valeur`, `credit_en_cours`, `credit_crd`, `credit_taux`, `credit_mensualite`, `credit_duree`, `taxe_fonciere`, `locatif`, `rev_loc` ⬤

### Capacité d'épargne (calculée + foyer)
`charges_fixes`, `credit_rp`, `autres_credits`, `charges_perso_d1`, `charges_perso_d2`, `objectif_patrimonial` ⬤

---

## Champs supportés en import TXT

> `profileParser.js` — tous les patterns ci-dessous sont extraits par regex depuis le profil `.txt`. Le helper `n()` retourne un entier (Math.round), `f()` un flottant, `s()` une chaîne.

### Situation
| Champ parsé | Exemple de ligne TXT |
|---|---|
| `mode` | `FOYER 2025` / `Mode : Déclaration commune` / `DÉCLARANT 2` → `'couple'` |
| `statut` | `Statut : Pacsé(e)` |
| `parts` | `Parts fiscales : 2` |
| `departement` | `Département : 75` |

### Profil & Retraite (D1 et D2)
| Champ | Exemple |
|---|---|
| `ageD1` | `Âge D1 : 38 ans` ou `Âge : 38 ans` |
| `retraiteD1` | `Âge retraite D1 : 63 ans` |
| `horizonD1` | calculé : `retraiteD1 − ageD1` |
| `tmiRetraiteD1` | `TMI retraite D1 : 11%` |
| `typeRevenuD1` **PR1** | `Type de revenu D1 : Salarié(e)` |
| `pensionNetImpD1` | `Pension nette imposable 1AS D1 : 18 000 €` |
| *(idem D2)* | |

### Revenus D1 / D2
| Champ | Exemple |
|---|---|
| `salaireNetImposableD1` | `Net imposable annuel (1AJ — case déclaration) : 45 162 €` |
| `salairesBrutImposableD1` | `Brut imposable annuel : 56 000 €` |
| `pasD1` | `PAS prélevé 2025 : 4 609 €` |
| `tauxPasD1` | `Taux PAS : 11.80%` |
| `peroD1` | `PERO D1 — cotisations 2025 : 1 260 €` |
| `ijCpamD1` **PR2** | `(dont 1 598,80 € IJ CPAM — attestation Maine-et-Loire)` (annotation dans la ligne net imposable) |
| `ijCpamOrgD1` **PR2** | idem — groupe 2 : `Maine-et-Loire` |
| `rente1BsD1` **PR2** | `Montant déclaré en 1BS (net de CSG déductible) : 6 192,00 €` |
| `pasRente1BsD1` **PR2** | `PAS rente 1BS : 0 €` ou `PAS prélevé par Crédit Agricole : 0 €` |
| `orgRente1BsD1` **PR2** | `Organisme : Crédit Agricole Assurance — contrat PrédiAgri` |
| `recurrentRente1BsD1` **PR2** | `Récurrent : Non` ou `Ce revenu est NON RÉCURRENT` → `false` |
| *(idem D2)* | |

### Revenus foyer
| Champ | Exemple |
|---|---|
| `revensFonciers` | `Revenus fonciers bruts : 705 €` |
| `dividendes` | `Dividendes/intérêts : 200 €` |
| `revenusLoc` | `Revenus locatifs 2025 : 1 200 €` |
| `revenusCrypto` | `Revenus crypto : 500 €` |
| `intMob2TR` **PR1** | `Intérêts mobiliers bruts (case 2TR) : 527 €` ou `Intérêts Livret+ D2 (case 2TR) : 527 €` |
| `intMob2CK` **PR1** | `PFU 12,8% prélevé (case 2CK) : 68 €` |

### RNI et fiscal
| Champ | Exemple / logique |
|---|---|
| `rniD1` | `RNI D1 (après abat. salaires) : 40 646 €` → fallback calcul abattement10Auto |
| `rniD2` **PR2 fix** | `RNI D2 TOTAL : 31 928 €` (prioritaire) → sinon `RNI D2 (après abat.) : …` → sinon calcul |
| `rniFoyer` | `RNI FOYER TOTAL : 73 067 €` → fallback `rniD1 + rniD2 + foncierNet` |
| `tmi` **PR1 fix** | `TMI : 30%` (ancré début de ligne, évite `TMI retraite D1 : 11%`) → fallback `getTMI()` |
| `pasTotal` | `PAS total foyer 2025 : 6 350 €` → fallback `pasD1 + pasD2` |
| `irNet` | `IR net : 8 202 €` (post-enrichissement IA) |
| `totalDu` | `TOTAL DÛ : 8 202 €` |
| `solde` | calculé : `pasTotal − totalDu` ou `remboursement` |
| `acompte8HW` **PR1** | `Acompte IR D1 (8HW) : 12 €` ou `8HW : **12 €**` (format IA bold) |
| `acompte8IW` **PR1** | `Acompte IR D2 (8IW) : 12 €` |
| `acompte8HX` **PR1** | `Acompte PS D1 (8HX) : 24 €` |
| `acompte8IX` **PR1** | `Acompte PS D2 (8IX) : 18 €` |

### Plafonds PER
| Champ | Exemple |
|---|---|
| `plafondPerD1` | `PLAFOND DISPONIBLE D1 : 3 450 €` |
| `plafondPerD2` | `PLAFOND DISPONIBLE D2 : 4 710 €` |
| `perReportableN1/N2/N3` | `Plafond reportable N-1 : 2 000 €` |

### Épargne D1 / D2
`livretAD1`, `lddsD1`, `lepD1`, `livretPlusD1`, `pelD1`, `pelDateD1`, `peaD1`, `peaDateD1`, `peaVerseD1`, `avD1`, `avDateD1`, `avVerseD1` **PR1**, `cryptoD1`, `percoD1`, `cryptoPlateformeD1` **PR1**, `cryptoCessionsD1` **PR1**, `cryptoMontantCedeD1`, `cryptoPvD1` (idem D2).

### Foncier
`foncierNet`, `regimeFoncier` (micro / réel détecté par mot-clé)

### Capacité d'épargne
`chargesFixes`, `creditRp`, `autresCredits`, `chargesPersoD1`, `chargesPersoD2`, `capaciteEpargneD1/D2/Foyer`, `objectifPatrimonial`

### Immobilier
`rpValeur`, `creditCrd`, `creditTaux`, `creditMensualite`, `taxeFonciere`

### Transmission / alertes / autres
`beneficiairesAvD1/D2`, `donationsRecues`, `hasNuPropriete`, `indivisionValeur`, `alertsCritiques`, `alertsAVerifier`, `alertsOpportunites`, `isEnriched`

### Flags booléens calculés
`hasCrypto`, `hasCompteEtranger`, `hasIndivision`, `hasTestamentManquant`, `hasPelAncien`, `hasChangementEmployeur`, `hasMultipleEmployeurs`

### Antériorités calculées
`avAnterioriteD1/D2`, `peaAnterioriteD1/D2`, `pelAnterioriteD1/D2`, `pelFiscalD1/D2` (`'imposable'` ou `'exonéré'`), `peaEspaceD1/D2`

---

## Champs supportés en export/génération TXT

> `profileGenerator.js` → `buildProfile(formData, d1Data, d2Data, docs, isCouple)`. Deux templates distincts.

### Mode solo — `== PROFIL FISCAL PERSONNEL 2025 ==`
1. `== SITUATION PERSONNELLE ==` — statut, parts, enfants, département
2. `== PROFIL & RETRAITE ==` — âge, retraite, horizon, TMI retraite, type revenu, pension 1AS
3. `== REVENUS 2025 ==` — brut, net 1AJ + annotation IJ CPAM **PR2**, RNI abat. 10%, taux PAS, PAS, frais réels, bloc rente 1BS **PR2**, foncier (brut/net/PS/régime), dividendes, crypto, 2TR/2CK **PR1**
4. `== DONNÉES POUR CALCUL IR ==` — RNI total, parts, PAS, acomptes 8HW/8HX **PR1**
5. `== PLAFOND PER 2026 ==` — calcul 10% RNI, plancher PASS, plafond retenu, PERO déduit, PLAFOND DISPONIBLE, reportables N-1/N-2/N-3
6. `== ÉPARGNE ET PLACEMENTS ==` — tous les livrets, PEL, PEA, PER, AV, crypto
7. `== DÉDUCTIONS ==` — dons, garde, domicile, travaux, PERO, pension, syndicat
8. `== CAPACITÉ D'ÉPARGNE ==` — charges, revenu mensuel, capacité calculée
9. `== IMMOBILIER ==` — RP, crédit, taxe foncière, locatif
10. `== DONNÉES BRUTES EXTRAITES PAR IA ==` *(conditionnel — si docs uploadés)*

### Mode couple — `== PROFIL FISCAL FOYER 2025 ==`
1. `== SITUATION DU FOYER ==`
2. `== PROFIL & RETRAITE ==` — D1 et D2
3. `== REVENUS 2025 — DÉCLARANT 1 ==` — brut, net 1AJ + IJ CPAM **PR2**, RNI, PAS, frais réels, rente 1BS **PR2**
4. `== REVENUS 2025 — DÉCLARANT 2 ==` — idem D2 (label `1BJ` au lieu de `1AJ`) **PR2**
5. `== REVENUS DU FOYER ==` — foncier, dividendes, crypto, locatif, 2TR/2CK **PR1**
6. `== DONNÉES POUR CALCUL IR FOYER ==` — RNI D1/D2/FOYER, quotient familial, PAS D1/D2/foyer, acomptes 8HW/8IW/8HX/8IX **PR1**
7. `== PLAFONDS PER 2026 ==` — D1 et D2 séparés + mutualisable
8. `== ÉPARGNE — DÉCLARANT 1 ==`
9. `== ÉPARGNE — DÉCLARANT 2 ==`
10. `== DÉDUCTIONS DU FOYER ==`
11. `== CAPACITÉ D'ÉPARGNE ==` — D1/D2 séparés + foyer
12. `== IMMOBILIER ==`
13. `== DONNÉES BRUTES EXTRAITES PAR IA ==` *(conditionnel)*

---

## Calculs et logique métier

> Implémentés dans `taxCalculator.js` (librairie) et utilisés par `profileParser.js` + `profileGenerator.js`.

| Règle | Implémentation | Paramètres (2025) |
|---|---|---|
| Abattement 10% salaires (1AJ) | `abattement10(salaire)` | min 509 €, max 14 555 € |
| Abattement 10% pensions (1AS/1BS) | `abattement10Pension(pension)` | min 450 €, max 4 321 € |
| Abattement mixte (salaire + pension) | `abattement10Auto(montant, type, pensionPart)` | dispatche selon `type_revenu` |
| Abattement 10% rente 1BS **PR2** | `Math.round(rente1Bs * 0.9)` dans fallback rniD1/D2 | identique pension |
| Foncier micro-foncier | `calcFoncier(brut)` : abat. 30% si brut ≤ 15 000 € | art. 32 CGI |
| Foncier réel | pas d'abattement (brut = net) | — |
| Prélèvements sociaux foncier | 17,2% sur foncier net | — |
| Plafond PER individuel | `fmtPlafondPer(netImp, pero)` : 10% RNI, plancher 4 710 €, plafond 37 680 €, déduit PERO | PASS 2025 = 47 100 € |
| Capacité d'épargne solo | `RNI/12 − charges_fixes` | — |
| Capacité d'épargne couple | `RNI_Dx/12 − charges_fixes/2 − charges_perso_Dx` | — |
| Antériorité enveloppes | `anteriorite(dateStr)` : années entières depuis la date | formats DD/MM/YYYY, MM/YYYY, YYYY |
| PEL fiscal | `'imposable'` si antériorité ≥ 12 ans (post-2017) | sinon `'exonéré'` |
| PEA espace versement restant | `max(0, 150 000 − peaVerse)` | plafond 150 000 € |
| Livret+ gain si réallocation PEA | `livretPlus × (7%−3%) × (1−17,2%)` | hypothèse 7% PEA vs 3% livret |
| TMI foyer | `getTMI(rniFoyer, parts)` depuis barème JSON | fallback si non trouvé dans texte |
| TMI regex **PR1 fix** | anchré `^\s*TMI\s*:` pour éviter capture de `TMI retraite D1` | — |
| rniD2 fix regex **PR2** | priorité à `RNI D2 TOTAL` sur `RNI D2 salaires` | — |
| Détection `isEnriched` | regex sur `DÉCLARATION.*CASES\|OBJECTIFS PRIORITAIRES` | — |
| Solde PAS | `pasTotal − totalDu` ou `remboursement` si présent | — |

---

## Tests

> Fichier : `src/lib/__tests__/profileParser.test.js` — 41 tests, 1 suite, 3 blocs `describe`.
> Le bloc référence saute (`describe.skip`) si le fichier `profil-fiscal-2026-05-17 v4.txt` est absent de `~/Downloads/`.

### Bloc 1 — `profil de référence v4` (31 tests, skippés si fichier absent)

| Test | Ce qu'il vérifie |
|---|---|
| parse sans erreur | `parseProfile(REF)` retourne truthy |
| mode couple | `pp.mode === 'couple'` |
| statut Pacsé(e) | `pp.statut` match `/Pacsé/i` |
| salaireNetImposableD1 = 45 162 € | extraction ligne 1AJ D1 |
| salaireNetImposableD2 ≈ 29 283 € | extraction ligne 1BJ D2 (avec annotation IJ CPAM) |
| pasD1 = 4 609 € | PAS prélevé D1 |
| pasD2 = 1 741 € | PAS prélevé D2 |
| rniFoyer = 73 067 € | lu depuis `RNI FOYER TOTAL` dans le texte |
| tmi = 30 % | regex ancré `^\s*TMI\s*:` **PR1 fix** |
| intMob2TR = 527 € **PR1** | extraction case 2TR |
| intMob2CK = 68 € **PR1** | extraction case 2CK |
| acompte8HW = 12 € **PR1** | case 8HW |
| acompte8IW = 12 € **PR1** | case 8IW |
| acompte8HX = 24 € **PR1** | case 8HX |
| acompte8IX = 18 € **PR1** | case 8IX |
| peroD1 = 1 260 € | PERO D1 |
| revensFonciers = 705 € | revenus fonciers bruts |
| typeRevenuD1 = Salarié(e) **PR1** | extraction depuis PROFIL & RETRAITE |
| typeRevenuD2 = Salarié(e) **PR1** | idem D2 |
| cryptoPlateformeD1 = Binance **PR1** | extraction depuis ÉPARGNE D1 |
| avVerseD1 = 300 **PR1** | AV versements D1 |
| avVerseD2 = 300 **PR1** | AV versements D2 |
| plafondPerD1 = 3 450 € | PLAFOND DISPONIBLE D1 (après PERO) |
| plafondPerD2 = 4 710 € | PLAFOND DISPONIBLE D2 (pas de PERO) |
| ijCpamD2 ≈ 1 599 € **PR2** | annotation `(dont 1 598,80 € IJ CPAM…)` dans ligne 1BJ |
| ijCpamOrgD2 = Maine-et-Loire **PR2** | organisme attestation IJ CPAM |
| rente1BsD2 = 6 192 € **PR2** | `Montant déclaré en 1BS` |
| pasRente1BsD2 = 0 € **PR2** | `PAS prélevé par Crédit Agricole : 0 €` |
| orgRente1BsD2 contient Crédit Agricole **PR2** | `Organisme :` dans bloc rente |
| recurrentRente1BsD2 = false **PR2** | `NON RÉCURRENT` dans texte → `false` |
| calcul IR : irNet ≈ 8 202 € (± 5) | conditionnel (post-enrichissement IA seulement) |
| calcul IR : totalDu présent | conditionnel |

### Bloc 2 — `profil vide / null` (2 tests)

| Test | Ce qu'il vérifie |
|---|---|
| retourne mode solo par défaut | `parseProfile('')` → `mode === 'solo'`, `salaireNetImposableD1 === 0` |
| null ne lève pas d'erreur | `parseProfile(null)` ne throw pas |

### Bloc 3 — `format solo minimal` (7 tests)

Profile inline minimal avec 1AJ, PAS, 2TR, 2CK, 8HW, 8HX.

| Test | Ce qu'il vérifie |
|---|---|
| mode solo | `parseProfile(SOLO).mode === 'solo'` |
| statut Célibataire | `pp.statut === 'Célibataire'` |
| net imposable D1 = 45 000 | `salaireNetImposableD1 === 45000` |
| intMob2TR = 200 **PR1** | |
| intMob2CK = 26 **PR1** | |
| acompte8HW = 10 **PR1** | |
| acompte8HX = 15 **PR1** | |

---

## Limitations connues et points non traités

### Hors périmètre PR1/PR2 — à traiter dans PR3+

| Point | Statut |
|---|---|
| **IJ CPAM D1** : aucun test ni exemple dans le profil de référence — seul D2 est couvert | Extractions présentes dans le code, non testées |
| **Rente 1BS D1** : idem | Extractions présentes dans le code, non testées |
| **Rente à titre onéreux (1AL)** : abattement variable par âge (30–70%) — non différencié de la rente 1BS | Le code applique 10% systématiquement (correct pour 1BS réversion/retraite, incorrect pour 1AL viagère) |
| **Multi-PAS** (taux différent entre D1 et D2 avec changement employeur) | Déféré — pas de champ form dédié |
| **Bloc IJ CPAM dynamique (Partie 2.1 spec)** : saisie de plusieurs périodes IJ avec dates | Champs fixes uniquement (1 montant + organisme) |
| **Bloc rente dynamique (Partie 2.2 spec)** : plusieurs rentes par déclarant | Champs fixes uniquement (1 rente par déclarant) |
| **Solde réconcilié (Partie 3 spec)** : formule précise `PAS_total + acomptes − IR_net − PS_mobilier` émise dans le profil et vérifiable | Non implémenté — délégué à l'IA enrichissement |
| **Détection d'incohérences (Partie 3 spec)** : PAS ≠ TMI × RNI, taux PAS trop faible, etc. | Non implémenté |
| **Flag récurrent/unique sur revenus (Partie 3 spec)** | Champ `rente_1bs_recurrent` seulement — pas de flag global |
| **Méthode du célibataire couple (Partie 3 spec)** | Délégué à l'IA |
| **Tests générateur (Partie 4 spec)** : vérifier que `buildProfile()` produit les bonnes lignes | Aucun test du générateur — seulement le parser est testé |
| **Tests import round-trip (Partie 4 spec)** : generate → parse → compare | Non implémenté |
| **Tests Collect.jsx / handleImportProfile (Partie 4 spec)** | Non implémenté |
| **Documentation utilisateur (Partie 5 spec)** | Seul ce fichier d'audit existe |
| **`ij_cpam_org` absent de SECTION_REV_SOLO** : le champ est dans REV_FIELDS (couple) et SECTION_REV_SOLO (solo) mais vérifier qu'il est bien présent dans les deux | À vérifier manuellement |
| **Champ `frais_r` doublon** | Présent dans REV_FIELDS ET dans SECTION_DED_SOLO — pas un bug fonctionnel mais une redondance d'affichage en mode solo |
| **DeclarationGuide.jsx** : `adaptParsedProfile()` n'expose pas `intMob2TR`, `intMob2CK`, acomptes, rente 1BS, IJ CPAM — ces champs ne s'affichent pas dans l'onglet Déclaration | Limitation pré-PR3 |

---

## Dépendances ajoutées

| Package | Version | Usage |
|---|---|---|
| `vitest` | `^4.1.6` (devDep) | Runner de tests unitaires |

Aucune dépendance de production ajoutée dans PR1 ou PR2.

---

## Risques de régression identifiés

| Zone | Risque | Niveau |
|---|---|---|
| **`rniD2` regex modifié (PR2)** | La priorité `RNI D2 TOTAL` avant `RNI D2 (après abat.)` change la valeur de `rniD2` pour les profils enrichis ayant une rente. Impact sur `rniFoyer` fallback et tout ce qui consomme `rniD2` (Dashboard, Simulateur, Rapport). | Moyen — corrige un bug, mais change un comportement existant |
| **`rniD1` fallback modifié (PR2)** | Ajout de `+ Math.round(rente1BsD1 * 0.9)` au calcul fallback. Si `rente1BsD1 = 0` (cas courant), aucun impact. Impact si profil D1 a une rente et n'est pas encore enrichi. | Faible |
| **`REV_FIELDS` allongé (PR2)** | 6 nouveaux champs ajoutés au tableau partagé D1/D2 couple. Compte total champs visible dans `DeclarantBlock` augmente → barre de progression impactée. | Faible |
| **`SECTION_REV_SOLO` allongée (PR2)** | Idem en mode solo. | Faible |
| **Regex 2TR/2CK (PR1)** | La regex `Intérêts mobiliers bruts[^:\n]*:` est large — pourrait capturer une ligne imprévue si le profil enrichi IA reformule ce libellé. | Faible — deux patterns en cascade (générateur + IA) |
| **`buildProfile` couple D2** | Le label de la ligne net imposable est passé de `1AJ` à `1BJ` (PR2). Si le parser attendait `1AJ` pour D2, il ne captera plus. Vérifié : le parser utilise la même regex `Net imposable annuel[^:]*:` sans distinction AJ/BJ → pas de régression. | Nul |
| **Tests conditionnels (describe.skip)** | Le bloc de 31 tests est silencieusement ignoré si `profil-fiscal-2026-05-17 v4.txt` est absent de `~/Downloads/`. Les 10 tests restants passent toujours. CI sans ce fichier = fausse confiance. | Structurel — à corriger en PR4 (fixture locale) |
