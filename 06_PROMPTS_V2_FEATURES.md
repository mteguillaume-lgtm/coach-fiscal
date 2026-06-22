# 🚀 Prompts V2 — Features Kapio

> **Avant de commencer** : fais un commit de sauvegarde de ta V1 stable :
> ```
> git add . && git commit -m "V1 stable avant features V2"
> ```
> Puis implémente les features dans l'ordre, une par une.

---

## 📍 FEATURE 1 — Checklist fiscale universelle et personnalisée

> **Objectif** : fonctionner pour N'IMPORTE QUEL particulier français,
> pas seulement notre foyer de test. La checklist s'adapte à chaque situation.

```
Crée src/pages/Checklist.jsx (route /checklist) avec un système
en 2 étapes : questionnaire de filtrage → checklist personnalisée.

═══════════════════════════════
ÉTAPE 0 — QUESTIONNAIRE DE FILTRAGE
═══════════════════════════════

Avant d'afficher la checklist, affiche un écran de questions
rapides oui/non pour filtrer les items pertinents.

Si l'utilisateur a déjà un profil (state.profile) :
→ pré-cocher automatiquement les cases détectables depuis le profil
→ laisser l'utilisateur ajuster

Structure du questionnaire (groupé par thème) :

SITUATION
  □ Je suis marié(e) ou pacsé(e)
  □ J'ai des enfants à charge
  □ J'ai eu un changement de situation en 2025 
    (mariage, divorce, naissance, décès, séparation)
  □ J'ai déménagé en cours d'année 2025
  □ J'ai travaillé à l'étranger ou j'ai des revenus étrangers

REVENUS SALARIAUX
  □ J'ai changé d'employeur en 2025
  □ J'ai eu plusieurs employeurs simultanément
  □ J'ai perçu des indemnités de rupture (licenciement, rupture conventionnelle)
  □ J'ai des avantages en nature (véhicule, logement)
  □ J'ai un PERO / article 83 chez mon employeur
  □ J'ai participé à une augmentation de capital réservée aux salariés (PEE/PERECO)

REVENUS FONCIERS
  □ Je perçois des loyers nus (appartement, maison, local commercial)
  □ Je perçois des loyers meublés (LMNP, Airbnb, résidence services)
  □ Je perçois un fermage (terres agricoles)
  □ Je suis associé d'une SCI à l'IR
  □ Je suis en indivision sur un bien qui génère des revenus
  □ J'ai vendu un bien immobilier en 2025

REVENUS MOBILIERS
  □ J'ai perçu des dividendes ou coupons (compte-titres)
  □ J'ai vendu des actions, ETF, obligations en 2025 (plus-values)
  □ J'ai cédé des cryptomonnaies en 2025
  □ J'ai une assurance-vie avec des rachats en 2025
  □ J'ai un PEA avec des retraits en 2025
  □ J'ai des intérêts sur livrets non exonérés

REVENUS DIVERS
  □ J'ai une activité secondaire (auto-entrepreneur, freelance, BNC/BIC)
  □ J'ai perçu des pensions alimentaires
  □ J'ai perçu des rentes viagères
  □ J'ai des droits d'auteur ou redevances
  □ J'ai reçu des allocations chômage

DÉDUCTIONS ET RÉDUCTIONS
  □ Je verse une pension alimentaire (enfants majeurs, parents)
  □ J'ai un enfant en garde alternée
  □ J'emploie quelqu'un à domicile (ménage, jardinage, garde d'enfants)
  □ J'ai des frais de garde d'enfants < 6 ans
  □ J'ai fait des dons à des associations en 2025
  □ J'ai réalisé des travaux de rénovation énergétique (MaPrimeRénov)
  □ Je paie des cotisations syndicales
  □ J'ai des enfants scolarisés (collège, lycée, supérieur)
  □ J'ai investi dans des FCPI, FIP, SOFICA
  □ J'ai versé sur un PER individuel volontairement

COMPTES À DÉCLARER (formulaire 3916/3916bis)
  □ J'ai un compte bancaire à l'étranger 
    (Revolut UK, N26, Wise, Bunq, compte étranger...)
  □ J'ai un compte de courtage à l'étranger
    (Interactive Brokers, Trading212, Degiro, Saxo, Schwab...)
  □ J'ai un compte crypto sur exchange
    (Binance, Kraken, Coinbase, Bitpanda, Bybit...)
  □ J'ai une assurance-vie étrangère
  □ J'ai un compte PayPal avec solde significatif
  □ J'ai tout autre compte, contrat ou placement hors de France

SITUATIONS SPÉCIALES
  □ Je suis primo-accédant / j'ai acheté ma résidence principale en 2025
  □ J'ai un PEL ouvert avant 2018
  □ Je suis propriétaire en nu-propriété
  □ J'ai reçu une donation ou un héritage en 2025
  □ Je suis non-résident ou impatrié

═══════════════════════════════
ÉTAPE 1 — GÉNÉRATION DE LA CHECKLIST
═══════════════════════════════

Crée src/lib/checklistGenerator.js :

Structure d'un item :
{
  id: string,
  priorite: "critique" | "attention" | "info",
  categorie: string,
  case: string | null,        // ex: "4BE", "3916 bis"
  titre: string,
  description: string,        // explication courte
  detail: string,             // explication longue
  valeurAttendue: string | null, // extraite du profil si dispo
  condition: string[],        // quelles cases du questionnaire l'activent
  lienImpots: string | null,  // lien direct impots.gouv si pertinent
  questionChat: string        // question suggérée pour le chat
}

CATALOGUE COMPLET DES ITEMS (à implémenter) :

── TOUJOURS AFFICHÉS ──

  [critique] Case 1AJ — Salaires D1
  Vérifier que le préremplissage correspond au cumul décembre
  (pas novembre). Valeur extraite du profil si disponible.
  condition: toujours

  [critique] Case 8HV — PAS D1 prélevé
  Vérifier que le total annuel PAS est bien repris.
  condition: toujours

  [info] Taux PAS 2026
  Après dépôt de la déclaration, votre taux PAS sera mis à jour
  en septembre 2026. Vérifiez qu'il correspond à votre situation.
  condition: toujours

── SI COUPLE ──

  [critique] Case 1BJ — Salaires D2
  Vérifier le cumul annuel D2 (tous employeurs).
  condition: marie_pacse

  [critique] Case 8IV — PAS D2
  Si D2 a changé d'employeur : vérifier que les 2 cumuls sont
  bien repris (risque d'oubli du 1er employeur).
  condition: marie_pacse

── SI CHANGEMENT EMPLOYEUR ──

  [critique] Cumul PAS multi-employeurs
  Si vous avez eu plusieurs employeurs en 2025, le préremplissage
  peut n'afficher que le dernier. Additionnez manuellement tous
  les PAS des différents bulletins de décembre.
  condition: changement_employeur

  [attention] Indemnités de rupture
  Les indemnités de licenciement sont exonérées dans certaines
  limites. Vérifiez le traitement fiscal sur votre solde de tout compte.
  condition: indemnites_rupture

── SI PERO / ARTICLE 83 ──

  [attention] Case 6QS — Cotisations PERO obligatoires
  Reporter le montant indiqué sur votre attestation fiscale
  employeur (courrier mars-avril). Vérifier la ventilation
  6QS / 6QT / 6QU selon l'attestation.
  condition: pero

── REVENUS FONCIERS ──

  [critique] Case 4BE — Revenus fonciers bruts (micro-foncier)
  Si total revenus fonciers < 15 000€ → micro-foncier de plein droit.
  Abattement 30% automatique. Reporter le total brut en 4BE.
  S'applique à : loyers nus, fermage, quote-part SCI/indivision.
  condition: loyers_nus | fermage | sci_ir | indivision_revenus

  [attention] Choix régime réel vs micro-foncier
  Si charges réelles > 30% des loyers bruts → le régime réel
  peut être plus avantageux. À simuler avant de choisir.
  condition: loyers_nus

  [critique] Cases 4BA/4BB/4BC — Régime réel foncier
  Si vous avez opté pour le réel : reporter revenus bruts (4BA),
  charges déductibles (4BB), intérêts d'emprunt (4BC).
  condition: loyers_nus

  [critique] Location meublée LMNP — Cases 5ND/5OD
  Les revenus de location meublée ne sont PAS en 4BE mais en BIC
  (cases 5ND micro-BIC ou liasse 2031 si réel).
  condition: loyers_meubles

  [attention] Plus-value immobilière
  Si vente d'un bien en 2025 (hors résidence principale) :
  formulaire 2048-IMM obligatoire, taxe due à la source via notaire.
  Vérifier l'abattement pour durée de détention.
  condition: vente_immo

── REVENUS MOBILIERS ──

  [critique] Cases 2DC/2BH — Dividendes et intérêts
  Reporter les revenus de capitaux mobiliers du IFU (imprimé fiscal
  unique) envoyé par votre banque/courtier. PFU 30% par défaut.
  condition: dividendes

  [attention] Option barème dividendes
  Si votre TMI est 0% ou 11% : l'option barème peut être plus
  favorable que le PFU 30%. À simuler avec votre TMI réel.
  condition: dividendes

  [critique] Cases 3VG/3VH — Plus-values mobilières
  Reporter les cessions d'actions/ETF/obligations du IFU.
  Moins-values imputables sur 10 ans (case 3VH).
  condition: plus_values_mobilieres

  [critique] Case 3AN — Plus-values crypto
  Si cessions crypto en 2025 > 305€ au total : imposition
  obligatoire. PFU 30%. Calcul : (prix cession - prix acquisition
  × portefeuille cédé / portefeuille total).
  Formulaire 2086 si nombreuses cessions.
  condition: cessions_crypto

  [attention] PEA — Vérifier les retraits
  Retrait avant 5 ans : imposition au PFU 30%.
  Retrait après 5 ans : PS 17,2% seulement.
  condition: pea_retraits

── COMPTES À DÉCLARER (3916 / 3916 bis) ──

  [critique] Formulaire 3916 — Comptes bancaires étrangers
  OBLIGATOIRE pour chaque compte détenu à l'étranger au 01/01 ou
  en cours d'année 2025. Pénalité : 1 500€ par compte non déclaré
  (10 000€ si pays non coopératif). À refaire chaque année.
  S'applique à : Revolut (UK), N26 (Allemagne), Wise, Bunq,
  tout compte dans une banque étrangère.
  condition: compte_bancaire_etranger

  [critique] Formulaire 3916 bis — Comptes crypto
  OBLIGATOIRE pour chaque exchange crypto non établi en France.
  Pénalité : 1 500€ par compte non déclaré.
  S'applique à : Binance, Kraken, Coinbase, Bybit, Bitpanda...
  condition: compte_crypto

  [critique] Formulaire 3916 — Courtiers étrangers
  Comptes Interactive Brokers, Trading212, Degiro, Saxo...
  Même obligation que les comptes bancaires étrangers.
  condition: courtier_etranger

  [critique] Formulaire 3916 — Assurance-vie étrangère
  Toute assurance-vie souscrite auprès d'un assureur étranger
  doit être déclarée, même sans rachat.
  condition: av_etrangere

── DÉDUCTIONS ET RÉDUCTIONS ──

  [attention] Case 6NS/6NT — Versements PER volontaires
  Si vous avez versé sur un PER individuel en 2025 :
  reporter en 6NS (D1) ou 6NT (D2). Déduction du revenu imposable
  dans la limite du plafond disponible.
  condition: per_volontaire

  [attention] Cases 7DB/7DD — Emploi à domicile
  50% de crédit d'impôt sur les dépenses (plafond 12 000€ + 1 500€
  par enfant). Reporter le total des salaires + charges payés.
  condition: emploi_domicile

  [attention] Case 7GA/7GB/7GC — Garde d'enfants < 6 ans
  50% de crédit d'impôt (plafond 3 500€ par enfant).
  condition: garde_enfants

  [attention] Cases 7UD/7UF — Dons associations
  66% de réduction d'impôt (75% pour associations d'aide aux
  personnes en difficulté, dans la limite de 1 000€).
  Conserver les reçus fiscaux.
  condition: dons

  [attention] Case 7DQ — Pension alimentaire versée
  Déductible du revenu imposable si enfant majeur non rattaché
  (plafond 6 368€ par enfant en 2025).
  condition: pension_versee

  [info] Cases 7EA/7EC/7EF — Frais de scolarité
  Réduction d'impôt : 61€ collège, 153€ lycée, 183€ enseignement
  supérieur par enfant à charge.
  condition: enfants_scolarises

  [attention] Cases 7WF/7WH — Travaux rénovation énergétique
  MaPrimeRénov : vérifier les attestations reçues.
  Certains travaux restent en crédit d'impôt selon leur nature.
  condition: travaux_renovation

  [info] Case 7AC — Cotisations syndicales
  66% de réduction d'impôt sur les cotisations versées.
  Reporter le montant indiqué sur le certificat de l'organisation.
  condition: cotisations_syndicales

── SITUATIONS SPÉCIALES ──

  [attention] PEL ouvert avant 2018
  Les intérêts sont exonérés d'IR pendant les 12 premières années.
  Après 12 ans → imposition au PFU. Vérifier la date d'ouverture.
  condition: pel_avant_2018

  [info] Donation / héritage reçu en 2025
  Les donations et successions ne sont pas à déclarer à l'IR
  (déclaration séparée 2705-SD). Mais vérifier si des revenus
  générés par les biens reçus sont à déclarer (loyers, dividendes...).
  condition: donation_heritage

  [attention] Impatrié / non-résident rentrant en France
  Des régimes spéciaux existent (exonération partielle 8 ans,
  régime des impatriés art. 155B CGI). Vérifier l'éligibilité.
  condition: impatrie

  [critique] Changement de situation en 2025
  Mariage, PACS, divorce, séparation, naissance, décès du conjoint :
  déclarer le changement sur impots.gouv rubrique "Gérer mon profil".
  Cela peut modifier le nombre de parts et le calcul de l'impôt.
  condition: changement_situation

═══════════════════════════════
LOGIQUE D'EXTRACTION DU PROFIL
═══════════════════════════════

Dans checklistGenerator.js, la fonction extractProfileData(profile)
analyse le texte du profil pour pré-remplir :
- Mode couple : chercher "Pacsé" ou "Couple" ou "D2"
- Salaire D1 : regex sur "Net imposable.*?(\d[\d\s]*€)" ou "1AJ.*?(\d+)"
- Salaire D2 : idem pour D2
- PAS D1/D2 : regex sur "PAS prélevé.*?(\d+)"
- PERO : regex sur "6QS.*?(\d+)" ou "PERO.*?(\d+)"
- Fermage : regex sur "4BE.*?(\d+)" ou "fermage.*?(\d+)"
- Crypto : regex sur "Binance|crypto|3916 bis"
- Plafond PER : regex sur "PLAFOND DISPONIBLE.*?(\d+)"
- TMI : regex sur "TMI.*?(\d+)%"

Ces valeurs extraites sont affichées comme "valeurAttendue"
dans les items de checklist correspondants.

═══════════════════════════════
UI — Checklist.jsx
═══════════════════════════════

ÉCRAN 1 — Questionnaire (si pas encore rempli)
  - Titre "Personnalisez votre checklist"
  - Groupes de questions avec checkboxes
  - Pré-cochage automatique depuis le profil
  - Bouton "Générer ma checklist →"
  - Lien "Passer et voir la checklist complète" (affiche tout)

ÉCRAN 2 — Checklist générée
  Layout :
  1. Header : "Ma checklist fiscale 2026"
     Sous-titre : "X points à vérifier · Y critiques"
  2. Barre de progression : "X / Y points traités" (barre teal)
  3. Filtres : Tous | 🔴 Critiques | 🟠 Attention | 🔵 Info
  4. Chaque item :
     - Checkbox (coché = traité, sauvegardé localStorage)
     - Badge priorité coloré (rouge / orange / bleu)
     - Badge numéro de case si applicable (ex: "Case 4BE")
     - Titre en gras
     - Description courte
     - Accordéon "En savoir plus" → detail complet
     - Si valeur attendue extraite du profil :
       → Affichée en grand en teal avec bouton "📋 Copier"
     - Bouton "💬 Discuter" → ouvre /chat avec question pré-remplie
  5. Bouton "🔄 Modifier mes réponses" → retour questionnaire
  6. Bouton "💾 Exporter en .txt"

Ajouter /checklist dans le menu principal et dans Profile.jsx.
```

**Comment tester** :
- Teste avec profil vide + questionnaire coché "tout" → checklist complète
- Teste avec profil fiscal complet → cases pré-remplies automatiquement
- Teste avec juste "compte crypto coché" → item 3916 bis en critique, rien d'autre

**Commit** : `git commit -am "Feature : checklist fiscale universelle et personnalisée"`

---

## 📍 FEATURE 2 — Alertes et opportunités détectées

```
Crée src/lib/opportunitiesDetector.js et une nouvelle section
"Opportunités" visible depuis le Dashboard (qu'on créera après).

═══════════════════════════════
LOGIQUE MÉTIER
═══════════════════════════════

Fonction detectOpportunities(profile) qui analyse le profil
et retourne un array d'opportunités détectées :

{
  id: string,
  type: "gain" | "risque" | "action",
  urgence: "immediate" | "avant_decembre" | "long_terme",
  titre: string,
  description: string,
  impact: string,        // ex: "Économie estimée : 1 035 €"
  impactEuros: number,   // pour trier par impact
  action: string,        // ce que l'utilisateur doit faire
  questionChat: string   // question suggérée pour le chat
}

Détections à implémenter (basées sur patterns du profil) :

GAINS FISCAUX :
  - Si plafond PER disponible > 0 et TMI = 30% :
    → "💡 Versement PER optimal détecté"
    → Impact : plafond × 30% = économie IR
    → Action : "Verser X€ sur votre PER avant le 31/12"

  - Si Livret+ > 10 000€ et taux < 2% :
    → "💡 Épargne mal rémunérée détectée"
    → Impact : gain potentiel annuel vs LDDS/AV
    → Action : "Transférer vers LDDS ou AV"

  - Si PEA non ouvert :
    → "💡 PEA non ouvert — horloge fiscale non démarrée"
    → Action : "Ouvrir un PEA même avec 1€ pour faire partir les 5 ans"

  - Si LEP non ouvert et RFR éligible :
    → "💡 LEP accessible — meilleur taux garanti"
    → Impact : taux 5% vs Livret A 3%

RISQUES :
  - Si crypto > 305€ et 3916 bis non mentionné :
    → "🔴 Obligation déclarative crypto non remplie"
    → Impact : "Amende 1 500€ par compte non déclaré"

  - Si pacsé sans testament mentionné :
    → "🔴 Testament manquant — partenaire non protégé"
    → Impact : "En cas de décès, votre partenaire n'hérite pas automatiquement"

  - Si indivision sans acte mentionné :
    → "🟠 Indivision non sécurisée"
    → Action : "Consulter un notaire pour sécuriser vos droits"

  - Si taux PAS sous-estimé (PAS effectif < TMI réel) :
    → "🟠 Taux PAS probablement trop bas"
    → Impact : risque de solde à payer en septembre

ACTIONS RAPIDES :
  - Si remboursement IR prévu :
    → "🔵 Remboursement IR prévu : X€ en septembre"
  - Si déclaration bientôt (si date dans le profil)
    → "🔵 Deadline déclaration dans X jours"

═══════════════════════════════
UI — Composant OpportunitiesPanel
═══════════════════════════════

Crée src/components/OpportunitiesPanel.jsx :

Layout :
1. Titre "Opportunités détectées" + badge nombre total
2. Tri par défaut : par impactEuros décroissant
3. Filtres : Tous | 💡 Gains | 🔴 Risques | 🔵 Actions
4. Chaque carte opportunité :
   - Icône + badge type (gain vert / risque rouge / action bleu)
   - Titre en gras
   - Description courte
   - Badge impact en euros (vert si gain, rouge si risque)
   - Urgence : "À faire avant le 31/12" / "Long terme"
   - Bouton "💬 En discuter avec Kapio" 
     → ouvre /chat avec questionChat pré-remplie
5. Total des gains potentiels détectés en haut : 
   "💰 Gains potentiels identifiés : X €"

Intègre OpportunitiesPanel dans Profile.jsx juste après 
l'aperçu du profil, et crée une route /opportunites dédiée.
```

**Commit** : `git commit -am "Feature : détection opportunités et alertes"`

---

## 📍 FEATURE 3 — Simulateur fiscal interactif

```
Crée src/pages/Simulator.jsx (route /simulator) avec des
simulateurs interactifs à sliders pour visualiser l'impact
fiscal en temps réel.

═══════════════════════════════
SIMULATEUR 1 — Versement PER
═══════════════════════════════

Données pré-remplies depuis le profil (state.profile) :
- RNI foyer
- TMI actuel
- Plafond PER disponible D1 + D2

Slider : montant à verser (0 → plafond max disponible)

Affichage en temps réel :
┌─────────────────────────────────────┐
│  Versement PER : [====●====] 3 449€ │
├─────────────────────────────────────┤
│  Économie IR immédiate : 1 035 €    │
│  Effort réel net : 2 414 €          │
│  Nouveau RNI : 62 606 €             │
│  Nouveau TMI : 30% → 11%  ✨        │
│  Rendement immédiat : 30%           │
└─────────────────────────────────────┘

Formule : economie = versement × (TMI / 100)
Si versement > seuil tranche → recalculer le TMI

═══════════════════════════════
SIMULATEUR 2 — Comparateur enveloppes
═══════════════════════════════

Slider : montant à investir (1 000 → 100 000€)
Toggle : durée (5 / 10 / 20 / 30 ans)
Toggle : taux de rendement annuel (3% / 5% / 7% / 9%)

Tableau comparatif en temps réel :

| Enveloppe | Capital final | Gain net | Fiscalité |
|-----------|---------------|----------|-----------|
| Livret A  | X €           | X €      | 0%        |
| PEA       | X €           | X €      | 17,2% PS  |
| AV > 8 ans| X €           | X €      | 7,5% + PS |
| PER       | X €           | X €      | IR sortie |
| CTO       | X €           | X €      | PFU 30%   |

Graphique courbes d'évolution (utilise recharts).
Mise en surbrillance de la meilleure option selon situation.

═══════════════════════════════
SIMULATEUR 3 — Impact revenus fonciers
═══════════════════════════════

Slider : loyers annuels (0 → 50 000€)
Toggle : régime micro-foncier vs réel
Toggle : charges (0 → 100%)

Affichage :
- Revenu net imposable selon régime
- IR supplémentaire au TMI du foyer
- PS 17,2%
- Coût fiscal total
- Recommandation régime optimal

═══════════════════════════════
UI GÉNÉRALE
═══════════════════════════════

Layout /simulator :
1. Tabs horizontaux : "PER" | "Enveloppes" | "Foncier"
2. Chaque simulateur sur fond blanc, sliders teal
3. Résultats mis à jour instantanément (pas de bouton valider)
4. Bouton "💬 Discuter de cette simulation" → chat avec 
   contexte de la simulation pré-injecté
5. Bouton "💾 Sauvegarder cette simulation" → localStorage

Lien vers /simulator depuis la sidebar du chat et le menu.
Utilise recharts pour les graphiques (déjà dans le projet).
```

**Commit** : `git commit -am "Feature : simulateur fiscal interactif"`

---

## 📍 FEATURE 4 — Mode déclaration guidée

```
Crée src/pages/DeclarationGuide.jsx (route /declaration)
Un wizard qui guide pas à pas la déclaration sur impots.gouv.fr
en parallèle de l'app, avec les valeurs exactes à saisir.

═══════════════════════════════
STRUCTURE DU WIZARD
═══════════════════════════════

Étape 0 — Introduction
  - "Ouvrez impots.gouv.fr dans un nouvel onglet"
  - Bouton "Ouvrir impots.gouv.fr →" (target="_blank")
  - Checklist pré-déclaration (les points critiques)

Étape 1 — Identification (formulaire 2042)
  Items guidés :
  ┌─────────────────────────────────────────┐
  │ 📋 Case 1AJ — Salaires D1              │
  │ Valeur à saisir : 55 910 €             │  ← extrait du profil
  │ [📋 Copier] [✅ Fait]                  │
  │                                         │
  │ ⚠️ Vérifiez que le préremplissage      │
  │ affiche bien ce montant.               │
  │ Si différent → corrigez manuellement.  │
  └─────────────────────────────────────────┘

Étape 2 — Revenus D2 (si mode couple)
  - Case 1BJ avec valeur D2

Étape 3 — Prélèvements à la source
  - Case 8HV : PAS D1 (valeur + avertissement si sous-estimé)
  - Case 8IV : PAS D2 (⚠️ vérifier les 2 cumuls si changement employeur)

Étape 4 — Revenus fonciers (si fermage > 0)
  - Case 4BE : micro-foncier
  - Rappel abattement 30% automatique

Étape 5 — PERO/PER
  - Case 6QS si PERO > 0
  - Attestation fiscale employeur à joindre

Étape 6 — Comptes à l'étranger
  - Formulaire 3916 bis si crypto détectée
  - ⚠️ Amende 1 500€ si oublié

Étape 7 — Récapitulatif et solde
  - IR net calculé
  - PAS total prélevé
  - Solde attendu (remboursement ou supplément)
  - Date de réception estimée

═══════════════════════════════
UI
═══════════════════════════════

Layout :
- Stepper vertical à gauche (toutes les étapes visibles)
- Contenu à droite
- Chaque case fiscale :
  * Label + numéro de case en badge
  * Valeur à saisir en très grand (copiable en 1 clic)
  * Explication courte en gris
  * Checkbox "✅ Fait" qui sauvegarde en localStorage
  * Bouton "❓ Pourquoi cette valeur ?" → chat

- Barre de progression globale en haut
- Bouton "💾 Sauvegarder ma progression" 
- Bouton final "🎉 Déclaration terminée !" avec confettis

Données extraites automatiquement de state.profile.
Si une valeur n'est pas trouvée dans le profil → 
champ de saisie manuelle avec placeholder.
```

**Commit** : `git commit -am "Feature : mode déclaration guidée"`

---

## 📍 FEATURE 5 — Tableau de bord patrimonial visuel

```
Crée src/pages/Dashboard.jsx (route /dashboard) comme 
page d'accueil post-profil. Remplace ou complète /profile.

═══════════════════════════════
SECTIONS DU DASHBOARD
═══════════════════════════════

SECTION 1 — Vue patrimoine globale
  Graphique camembert (recharts PieChart) :
  - Épargne liquide (Livret A + LDDS + LEP + Livret+)
  - Épargne long terme (PEA + AV + PER + PERCO)
  - Immobilier (valeur estimée si dans le profil)
  - Crypto
  
  Total patrimoine net affiché en gros au centre.
  Légende avec montants et pourcentages.

SECTION 2 — Scorecard fiscal
  4 jauges circulaires :
  - TMI actuel : 30% (rouge si > 30%, orange si 30%, vert si < 30%)
  - Taux d'épargne estimé : X%
  - Score optimisation PER : X% du plafond utilisé
  - Score diversification : note /10

SECTION 3 — Opportunités détectées
  Intègre OpportunitiesPanel (créé en Feature 2)
  Max 3 opportunités affichées, bouton "Voir tout"

SECTION 4 — Prochaines actions
  Timeline des actions à faire :
  - 🔴 Avant le 31/12 : verser X€ sur PER
  - 🟠 Avant mai 2026 : déclaration IR
  - 🔵 Long terme : ouvrir PEA

SECTION 5 — Raccourcis rapides
  Boutons vers les autres sections :
  [📋 Checklist] [🧮 Simulateur] [📝 Déclaration] [💬 Chat]

═══════════════════════════════
NAVIGATION
═══════════════════════════════

- Après génération du profil → rediriger vers /dashboard 
  au lieu de /profile
- Menu principal : Dashboard | Checklist | Simulateur | 
  Déclaration | Chat
- /profile reste accessible depuis le dashboard

Style : cards blanches sur fond gris très clair,
graphiques teal/violet/orange, chiffres en grand.
```

**Commit** : `git commit -am "Feature : dashboard patrimonial visuel"`

---

## 📍 FEATURE 6 — Génération de documents

```
Crée src/pages/Documents.jsx (route /documents) qui permet
de générer des documents personnalisés basés sur les 
templates de Paperasse et les données du profil.

═══════════════════════════════
DOCUMENTS DISPONIBLES
═══════════════════════════════

DOC 1 — Résumé de bilan patrimonial (PDF)
  - Synthèse du profil en format document formel
  - Tableau patrimoine, revenus, TMI, optimisations
  - Pied de page avec date de génération
  - À imprimer ou envoyer à son conseiller

DOC 2 — Tableau de répartition IR équitable (si couple)
  - Calcul méthode célibataire-référence
  - Contribution équitable D1 et D2
  - Régularisation avec le remboursement
  - Format tableau Excel-like à imprimer

DOC 3 — Courrier de réclamation fiscale
  - Template : réclamation pour erreur de préremplissage
  - Pré-rempli avec nom, adresse, numéro fiscal du profil
  - Corps de lettre à personnaliser
  - Références légales (LPF art. R*196-1)

DOC 4 — Contrat de prêt entre particuliers
  - Reprend le template existant (Contrat_Pret_Particuliers)
  - Pré-rempli avec les données D1/D2 du profil
  - Champs à compléter mis en évidence

DOC 5 — Note fiscale personnalisée
  - Appelle l'API Claude avec le master prompt + profil
  - Génère une note de conseil structurée (3-4 pages)
  - Format : synthèse + scénarios + recommandations + cases
  - Exportable en .md ou .txt

═══════════════════════════════
UI
═══════════════════════════════

Layout /documents :
- Grille de cartes (2 colonnes)
- Chaque carte document :
  * Icône + titre + description courte
  * Badge "Pré-rempli depuis votre profil" ou "À compléter"
  * Bouton "Générer →"
- Génération :
  * Loader pendant la génération (si appel API)
  * Preview du document généré
  * Boutons : "📋 Copier" | "💾 Télécharger .txt" | "🖨️ Imprimer"

Pour la génération de documents via Claude :
  Prompt système = masterPrompt + skills pertinents + profil
  Prompt utilisateur = "Génère le document [type] pour ce foyer.
  Format structuré, données exactes, références légales."

Lien vers /documents depuis le Dashboard et le menu.
```

**Commit** : `git commit -am "Feature : génération de documents"`

---

## 📍 FEATURE 7 — Suivi annuel et comparaison N-1

```
Crée un système de sauvegarde et comparaison des profils
annuels dans src/lib/annualTracking.js.

═══════════════════════════════
LOGIQUE
═══════════════════════════════

Crée src/lib/annualTracking.js :

Structure localStorage :
{
  "kapio.history": {
    "2024": { profile: "...", snapshot: { patrimoine, TMI, IR } },
    "2025": { profile: "...", snapshot: { patrimoine, TMI, IR } },
    "2026": { profile: "...", snapshot: { patrimoine, TMI, IR } }
  }
}

Fonction saveAnnualSnapshot(year, profile) :
  - Extrait les données clés du profil (regex sur le texte)
  - Sauvegarde : patrimoine total, TMI, IR payé, 
    taux PAS, épargne totale, RNI foyer

Fonction compareYears(year1, year2) :
  - Retourne les deltas entre les 2 années
  - Évolution patrimoine (+/- X€ et %)
  - Évolution TMI
  - Évolution optimisation fiscale

═══════════════════════════════
UI — Section historique dans Dashboard
═══════════════════════════════

Dans Dashboard.jsx, ajoute une section :

"📅 Évolution de votre patrimoine"

Si 1 seul profil sauvegardé :
  - Message "Revenez l'année prochaine pour voir votre évolution"
  - Bouton "💾 Sauvegarder le profil 2025"

Si 2+ profils sauvegardés :
  - Graphique ligne (recharts LineChart) avec évolution :
    * Patrimoine total par année
    * IR payé par année
    * Épargne par année
  - Tableau comparatif N vs N-1 :
    * Patrimoine : +X€ (+Y%)
    * IR payé : -X€ (optimization réussie ✅)
    * TMI : stable / amélioré

Bouton "📥 Importer un ancien profil" pour charger 
un profil .txt sauvegardé depuis une session précédente.

Dans Profile.jsx, ajoute un bouton :
"💾 Sauvegarder comme profil 2025" qui appelle saveAnnualSnapshot.
```

**Commit** : `git commit -am "Feature : suivi annuel et comparaison N-1"`

---

## 🎁 FEATURES BONUS

### Bonus A — Notifications et rappels

```
Ajoute un système de rappels basé sur les dates fiscales
dans src/lib/fiscalCalendar.js.

Dates fiscales 2026 à hardcoder :
- 15 mai 2026 : début déclaration revenus 2025
- 20 mai 2026 : clôture zone 1 (départements 01-19)
- 27 mai 2026 : clôture zone 2 (départements 20-54)  
- 03 juin 2026 : clôture zone 3 (départements 55-976)
- 15 septembre 2026 : solde IR / remboursement
- 31 décembre 2026 : dernier jour versements PER déductibles

Au chargement de l'app, vérifie si une date approche
(moins de 30 jours) et affiche une bannière :

┌──────────────────────────────────────────┐
│ 📅 Rappel fiscal : Dans 12 jours        │
│ Clôture déclaration IR (zone 2)          │
│ [Ouvrir le guide déclaration] [Ignorer] │
└──────────────────────────────────────────┘

Sauvegarde les rappels ignorés en localStorage.
```

---

### Bonus B — Mode hors-ligne complet

```
Ajoute un Service Worker pour que l'app fonctionne 
100% hors-ligne (sauf le chat qui nécessite l'API).

1. Crée public/sw.js (service worker basique)
2. Dans main.jsx, enregistre le service worker
3. Cache tous les assets statiques (JS, CSS, images)
4. Page offline.html si pas de connexion pour le chat :
   "Pas de connexion internet — Le conseil expert 
   nécessite internet. Les autres fonctionnalités 
   (anonymisation, collecte, profil, checklist) 
   restent disponibles hors-ligne."

Ajoute un manifest.json pour que l'app soit 
installable comme PWA sur mobile (icône sur l'écran d'accueil).
```

---

### Bonus C — Mode partage sécurisé

```
Permets à l'utilisateur de partager son profil 
de manière sécurisée avec son conseiller.

Crée src/pages/Share.jsx (route /share) :

1. Génère un lien unique temporaire (valable 48h)
   - Le profil est chiffré avec une clé aléatoire
   - La clé est dans l'URL fragment (#) → jamais envoyée au serveur
   - Format : https://kapio.vercel.app/view#[clé-chiffrement]

2. Page /view : déchiffre et affiche le profil en lecture seule
   - Pas de formulaire, pas de chat
   - Juste le profil formaté en lecture
   - Bandeau "Partagé par [prénom optionnel] · Expire dans 47h"

3. Bouton "📤 Partager avec mon conseiller" dans Dashboard
   - Génère le lien
   - Copie dans le presse-papier
   - Message type : "Voici mon bilan fiscal Kapio [lien]"

Note technique : utilise Web Crypto API (natif navigateur)
pour le chiffrement AES-GCM. Zéro serveur impliqué.
```

---

### Bonus D — Assistant vocal (expérimental)

```
Ajoute une option "Poser ma question à voix" dans le chat.

Dans Chat.jsx, ajoute un bouton microphone 🎤 :
1. Utilise l'API Web Speech Recognition (natif Chrome/Safari)
2. Transcrit la voix en texte en temps réel
3. Place le texte dans l'input
4. L'utilisateur valide avant d'envoyer

Bouton text-to-speech 🔊 sur les réponses longues :
1. Utilise l'API Web Speech Synthesis (natif)
2. Lit la réponse Claude à voix haute
3. Bouton pause/stop

Note : ces APIs sont natives, zéro lib supplémentaire.
Fonctionne sur Chrome, Safari. Pas sur Firefox.
Afficher un message si navigateur non supporté.
```

---

### Bonus E — Intégration impots.gouv (lecture)

```
Ajoute un bouton "Importer depuis impots.gouv" dans Collect.jsx.

L'utilisateur télécharge son avis d'imposition PDF depuis 
impots.gouv.fr et l'uploade dans l'app.

La lib anonymizer.js (déjà créée) peut extraire les données.
Ajoute des patterns spécifiques aux avis d'imposition :
- Revenu fiscal de référence
- IR net payé
- Nombre de parts
- Taux moyen d'imposition

Ces données pré-remplissent automatiquement les champs 
correspondants dans le formulaire de collecte.

Ajoute aussi la lecture du relevé de situation individuelle
retraite (téléchargeable sur info-retraite.fr) pour 
estimer les droits à la retraite.
```

---

## 📋 Ordre d'implémentation recommandé

| Priorité | Feature | Impact | Effort |
|---|---|---|---|
| 1 | Checklist fiscale | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 2 | Alertes opportunités | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 3 | Dashboard visuel | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 4 | Simulateur fiscal | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 5 | Déclaration guidée | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 6 | Génération documents | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 7 | Suivi annuel | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| B1 | Notifications dates | ⭐⭐⭐⭐ | ⭐ |
| B2 | PWA hors-ligne | ⭐⭐⭐ | ⭐⭐ |
| B3 | Partage sécurisé | ⭐⭐⭐ | ⭐⭐⭐ |
| B4 | Assistant vocal | ⭐⭐ | ⭐⭐ |
| B5 | Import impots.gouv | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 💡 Règles de survie V2

1. **Un prompt à la fois**, teste avant de continuer
2. **Commit après chaque feature** qui fonctionne
3. **Ne casse pas la V1** — chaque feature est additive
4. **Reviens vers Claude.ai** si Claude Code part dans le mauvais sens
5. **Déploie régulièrement** sur Vercel pour tester en conditions réelles
