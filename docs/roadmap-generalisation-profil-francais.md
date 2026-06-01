# MISSION — Généraliser l'outil fiscal à tous les profils français courants

Tu vas faire évoluer cet outil (chaîne : collecte → generator TXT → parser →
calculator → opportunitiesDetector → rapport → conseilPatrimonial) d'un
périmètre actuel « salarié-investisseur » vers une couverture des situations
COURANTES ET INTERMÉDIAIRES du contribuable français, avec routage propre des
cas hors périmètre vers le bon professionnel.

Objectif réaliste : viser ~95 % des foyers (pas l'exhaustivité absolue). Tout
cas trop complexe ou trop risqué à automatiser doit être DÉTECTÉ puis ROUTÉ vers
un professionnel, jamais approximé.

⚠️ MÉTHODE DE TRAVAIL : n'implémente PAS tout d'un coup. C'est une feuille de
route en phases. Fais UNE phase, fais passer les tests, mets à jour
docs/coverage.md, commit (une phase = une PR), PUIS arrête-toi et demande ma
validation avant la phase suivante. Commence par la PHASE 0 seule.

═══════════════════════════════════════════════════════════
RÈGLES NON NÉGOCIABLES — s'appliquent à CHAQUE phase
═══════════════════════════════════════════════════════════

1. PAPERASSE D'ABORD, TOUJOURS. La source d'autorité de toute règle fiscale
   (taux, seuil, abattement, barème, régime, formulaire, n° de case) est le
   contenu Paperasse embarqué dans le repo, dans cet ordre de priorité :
     a. src/data/paperasse/<domaine>/data/*.json   (chiffres structurés sourcés)
     b. src/data/paperasse/<domaine>/references/*.md
     c. src/data/skills/*.md  (gcp, comptable, controleur-fiscal, notaire, syndic)
   Avant d'écrire une règle, CHERCHE-la dans Paperasse et cite le fichier source.
   Tu ne vas chercher ailleurs (impots.gouv.fr / BOFiP / CGI) QUE si la règle est
   réellement absente de Paperasse. Dans ce cas :
     - signale le manque explicitement dans la PR ;
     - ENRICHIS le fichier Paperasse correspondant (data/*.json + references/*.md)
       avec le chiffre, sa source officielle et la date de vérification, pour que
       Paperasse reste la source unique réutilisable l'an prochain ;
     - ne code jamais la règle « en dur » dans la logique.
   Chaque phase DÉMARRE par un audit Paperasse : « qu'ai-je déjà en référence
   pour ce domaine ? » — avant tout calcul.

2. ZÉRO CHIFFRE EN DUR, TOUT SOURCÉ ET DATÉ. La logique LIT des fichiers de
   référence ; elle ne contient aucun taux/seuil/barème littéral. Les fichiers
   src/data/baremes/<annee>/*.json sont alimentés À PARTIR de Paperasse (jamais
   de ta mémoire ni du web générique). Chaque entrée reprend le motif
   _meta.sources déjà utilisé dans paperasse/fiscaliste/data/pea-assurance-vie.json
   (références BOFiP/CGI + date). Un chiffre sans source = bug bloquant.

3. NE JAMAIS INVENTER une donnée de profil absente. Donnée manquante →
   hypothèse explicite OU champ laissé vide OU routage. Jamais de valeur fictive.

4. CHAÎNE COMPLÈTE. Une fonctionnalité n'est « finie » que de bout en bout :
   champ de collecte → generator → parser → calculator → detector → section
   rapport → mention dans le conseil. Aucun parser orphelin.

5. TESTS OBLIGATOIRES. Pour chaque cas : fixture TXT réaliste + test vitest
   vérifiant le calcul. Pour tout calcul d'IR, au moins un cas vérifié À LA MAIN
   contre le simulateur officiel impots.gouv.fr, avec la référence notée dans le
   test.

6. ROUTAGE & DISCLAIMERS. Tout régime complexe (réel BIC/BNC, SCI à l'IS, LMNP
   réel/amortissements, international) affiche une recommandation explicite
   « expert-comptable / notaire / avocat fiscaliste / CGP recommandé » plutôt
   qu'un calcul approximatif. Disclaimer global permanent : « outil d'aide,
   ne se substitue pas à un conseil professionnel ; vérifiez sur impots.gouv.fr ».

7. RÉUTILISER l'architecture existante : système de plugins (docs/adding-a-plugin.md),
   helpers de parsing (profileParserUtils.js : n, f, s, oui, signed, section),
   fonctions de taxCalculator.js. N'introduis pas de second moteur parallèle.

═══════════════════════════════════════════════════════════
PHASE 0 — SOCLE
═══════════════════════════════════════════════════════════

0.a  TÂCHE PRÉALABLE — Compte-Titres Ordinaire (CTO) :
  - Champs ctoD1 / ctoD2 (valeur). PAS de date ni d'antériorité (le CTO n'a aucun
    compteur fiscal ; l'abattement durée de détention ne vise que les titres
    acquis avant 2018 → traité en Phase 4).
  - Chaîne complète : collecte (section Épargne, à côté de PEA/AV) → generator →
    parser → bilan patrimonial (regrouper avec les actifs investis / epargneLongTerme)
    → pyramide d'allocation du conseil (niveau « actions CTO » déjà décrit dans gcp.md).
  - Revenus du CTO (dividendes 2DC/2BH, intérêts 2TR/2CK, PV 3VG/3VH, PFU vs barème) :
    NE PAS les chiffrer ici → renvoi Phase 1 (mobilier) et Phase 4 (plus-values).
  - Ajouter le flag déclaratif si CTO chez un courtier étranger → 3916
    (logique déjà présente dans checklistGenerator.js).
  - Tests : un profil avec CTO apparaît au bilan et dans l'allocation.

0.b  MOTEUR IR COMPLET + données de référence :
  - Créer src/data/baremes/2025/ : ir.json, ps.json, quotient-familial.json
    (plafond de l'avantage par demi-part), decote.json, plafonnement-niches.json
    (global 10 000 € + spécifique 18 000 €), cehr.json — alimentés depuis Paperasse,
    chaque entrée sourcée et datée.
  - Refondre le pipeline IR de taxCalculator.js dans l'ordre, en exposant chaque
    étape (pour affichage transparent dans le rapport) :
    revenus catégoriels → RNI → quotient familial AVEC PLAFONNEMENT de l'avantage
    par demi-part → IR brut → décote → réductions/crédits (avec plafonnement
    global des niches) → CEHR → prélèvements sociaux → total dû.

0.c  SITUATION FAMILIALE complète (schema + collecte + generator + parser +
     calculator) : nb d'enfants, garde alternée, parent isolé (case T),
     invalidité (demi-parts supplémentaires), rattachement d'enfants majeurs.

  Tests : 3 profils (célibataire ; couple 2 enfants ; parent isolé 1 enfant)
  vérifiés contre le simulateur officiel. MAJ docs/coverage.md. Commit. STOP.

═══════════════════════════════════════════════════════════
PHASE 1 — Charges déductibles & crédits/réductions grand public
═══════════════════════════════════════════════════════════
Plugins + données + intégration calculator/rapport/conseil :
  - Pensions alimentaires versées (enfant majeur 6EL/6EM, ascendant 6GU/6GI),
    reçues ; frais d'accueil personne âgée (6EU).
  - Emploi salarié à domicile (7DB/7DF), garde enfants < 6 ans (7GA-7GG),
    scolarité (7EA-7EG), dons 66 % (7UF) et 75 % (7UD), cotisations syndicales.
  - Revenus mobiliers du CTO : dividendes (2DC/2BH), intérêts (2TR/2CK), avec
    simulation PFU 30 % vs option barème (cf. levier « PFU vs barème » de gcp.md).
  - Appliquer le plafonnement global des niches (10 000 €).
  - Detector : proposer ces leviers chiffrés en € quand le profil s'y prête.
  Tests + coverage.md + commit + STOP.

═══════════════════════════════════════════════════════════
PHASE 2 — Revenus des indépendants (TNS)
═══════════════════════════════════════════════════════════
Compléter les plugins stubs (bic-bnc-ba) et créer : micro-BIC commerce (5KO/5LO),
micro-BIC services (5KP/5LP), micro-BNC (5HQ/5IQ), BA, auto-entrepreneur
versement libératoire (5TA/5UA).
  - Parser + generator + calculator (abattements micro 71/50/34 %).
  - Estimation INDICATIVE des cotisations sociales TNS/URSSAF + flags de risque
    de requalification.
  - Régime réel (2031/2035) → routage vers skill comptable + expert-comptable
    recommandé (pas de calcul de liasse ici).
  Tests + coverage.md + commit + STOP.

═══════════════════════════════════════════════════════════
PHASE 3 — Immobilier locatif
═══════════════════════════════════════════════════════════
  - Foncier réel (2044), déficit foncier (4BB/4BC/4BD, imputation 10 700 €,
    report 10 ans), SCPI, SCI à l'IR (transparence), démembrement
    (usufruitier / nu-propriétaire).
  - LMNP/LMP : micro-BIC (5ND/5OD ; tourisme classé 5NG/5OG ; réforme Le Meur),
    réel + amortissements (router 2031/2033-A → expert-comptable), détection de
    bascule LMP (recettes > 23 000 € ET > 50 % des revenus pro).
  - S'appuyer sur Paperasse : paperasse/fiscaliste/data/regimes-fonciers-lmnp.json
    et references/revenus-fonciers-lmnp.md (déjà présents).
  Tests + coverage.md + commit + STOP.

═══════════════════════════════════════════════════════════
PHASE 4 — Plus-values & capital
═══════════════════════════════════════════════════════════
  - PV mobilières (3VG), moins-values reportables 10 ans (3VH), 2074 multi-cessions,
    abattement durée de détention (titres acquis avant 2018, 3SG).
  - Crypto cessions multiples (2086 + 3AN), seuil d'imposition 305 €.
  - PV immobilières : abattements durée (22 ans IR / 30 ans PS), exonération RP,
    exonération première cession non-RP, surtaxe > 50 000 €.
  Tests + coverage.md + commit + STOP.

═══════════════════════════════════════════════════════════
PHASE 5 — Patrimoine & dispositifs de défiscalisation
═══════════════════════════════════════════════════════════
  - Calcul IFI séparé : barème IFI, abattement 30 % résidence principale,
    plafonnement, seuil 1,3 M€ → baremes/2025/ifi.json (sourcé).
  - Investissements défiscalisants : Pinel/Denormandie (7QA-7QZ ; rappeler la
    fermeture Pinel aux acquisitions depuis le 31/12/2024, cf. gcp.md), Malraux
    (7NA-7ND), Censi-Bouvard, FCPI/FIP (7GQ-7FQ), SOFICA (7GN), IR-PME Madelin
    (7CF/7CH) ; plafonnement spécifique 18 000 €.
  Tests + coverage.md + commit + STOP.

═══════════════════════════════════════════════════════════
PHASE 6 — International (avancé)
═══════════════════════════════════════════════════════════
  - Salaires étrangers/convention (1AF/1BF, 8TI), pensions étrangères (1AL/1BL),
    fonciers étrangers (4BL), crédit d'impôt étranger (8TK), frontaliers,
    non-résidents, impatriés.
  - Vu la complexité conventionnelle : privilégier la DÉTECTION + le routage vers
    un avocat fiscaliste plutôt que le calcul automatique.
  Tests + coverage.md + commit + STOP.

═══════════════════════════════════════════════════════════
PHASE 7 — Conseil universel & garde-fous
═══════════════════════════════════════════════════════════
  - Généraliser src/lib/conseilPatrimonial.js pour couvrir les leviers de toutes
    les phases ci-dessus (synthèse rédigée, 3e personne, accessible, chiffrée en €,
    analyse comparée « sans action vs avec action » par levier).
  - Détecteur de « zones non couvertes » : si le profil comporte un signal hors
    périmètre, afficher une orientation claire vers le bon professionnel au lieu
    de rester muet.
  - Disclaimer global + invitation systématique à vérifier sur impots.gouv.fr.
  Tests + coverage.md + commit.

═══════════════════════════════════════════════════════════
LIVRABLES TRANSVERSES (à tenir à jour à chaque phase)
═══════════════════════════════════════════════════════════
  - docs/coverage.md : tableau de bord vivant (✅ / 🟡 / ❌ par cas).
  - docs/sources-fiscales.md : chaque barème/seuil avec sa source officielle et
    sa date de vérification (point de contrôle annuel).

RITUEL ANNUEL DE BASCULE D'ANNÉE (procédure à documenter, à NE PAS exécuter
maintenant — la décrire dans docs/sources-fiscales.md) :
  1. dupliquer src/data/baremes/<N>/ en <N+1>/ ;
  2. recroiser CHAQUE valeur avec Paperasse mis à jour (barème IR, PASS, plafonds,
     décote…) ;
  3. marquer explicitement les écarts et la date de vérification ;
  4. lancer la suite de tests (les cas vérifiés contre impots.gouv.fr doivent être
     re-validés pour la nouvelle année).

═══════════════════════════════════════════════════════════
COMMENCE PAR LA PHASE 0 UNIQUEMENT. Ne passe pas à la phase 1 sans mon accord.
═══════════════════════════════════════════════════════════