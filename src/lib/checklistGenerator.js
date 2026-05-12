// ─── Catalogue des items de checklist ─────────────────────────────────────────

export const CHECKLIST_ITEMS = [

  // ── Toujours affichés ──────────────────────────────────────────────────────

  {
    id: 'case_1aj',
    priorite: 'critique',
    categorie: 'Salaires',
    case: '1AJ',
    titre: 'Salaires D1 — Vérifier le préremplissage',
    description: 'Vérifier que le montant correspond au cumul de décembre (pas novembre).',
    detail: 'Le préremplissage de l\'administration utilise les données transmises par votre employeur. Assurez-vous que le montant affiché en case 1AJ correspond bien au cumul annuel figurant sur votre dernière fiche de paie de décembre, et non de novembre. En cas d\'écart, corrigez manuellement.',
    valeurAttendue: null,
    condition: ['always'],
    lienImpots: 'https://www.impots.gouv.fr',
    questionChat: 'Ma case 1AJ est préremplie avec X €, est-ce que c\'est le bon montant à vérifier sur ma fiche de paie de décembre ?',
  },
  {
    id: 'case_8hv',
    priorite: 'critique',
    categorie: 'PAS',
    case: '8HV',
    titre: 'PAS D1 — Vérifier le total annuel prélevé',
    description: 'Le total annuel du prélèvement à la source doit être bien repris.',
    detail: 'La case 8HV doit reprendre le cumul annuel du PAS prélevé par votre employeur. Ce montant figure sur votre dernier bulletin de décembre. Si vous avez eu plusieurs employeurs, chaque employeur l\'aura transmis séparément — vérifiez que la somme est correcte.',
    valeurAttendue: null,
    condition: ['always'],
    lienImpots: null,
    questionChat: 'Comment vérifier que ma case 8HV (PAS prélevé) est correcte si j\'ai eu plusieurs employeurs en 2025 ?',
  },
  {
    id: 'taux_pas_2026',
    priorite: 'info',
    categorie: 'PAS',
    case: null,
    titre: 'Taux PAS 2026 — Mise à jour en septembre',
    description: 'Après dépôt de la déclaration, votre taux PAS sera recalculé et appliqué à partir de septembre 2026.',
    detail: 'Une fois votre déclaration traitée, l\'administration recalcule votre taux de prélèvement à la source. Le nouveau taux est communiqué en juillet-août et appliqué par votre employeur à partir de septembre 2026. Vérifiez à cette date qu\'il correspond bien à votre situation (changement de revenus, de foyer…).',
    valeurAttendue: null,
    condition: ['always'],
    lienImpots: null,
    questionChat: 'Comment est recalculé mon taux PAS après la déclaration, et à partir de quelle date le nouveau taux s\'applique-t-il ?',
  },

  // ── Si couple ──────────────────────────────────────────────────────────────

  {
    id: 'case_1bj',
    priorite: 'critique',
    categorie: 'Salaires',
    case: '1BJ',
    titre: 'Salaires D2 — Vérifier le cumul annuel',
    description: 'Vérifier le cumul annuel D2 (tous employeurs inclus).',
    detail: 'Comme pour la case 1AJ, la case 1BJ doit reprendre le cumul annuel net imposable du déclarant 2. Si le déclarant 2 a eu plusieurs employeurs en 2025, vérifiez que tous les cumuls sont bien additionnés dans le préremplissage.',
    valeurAttendue: null,
    condition: ['marie_pacse'],
    lienImpots: null,
    questionChat: 'Comment vérifier la case 1BJ (salaires D2) si le déclarant 2 a changé d\'employeur en 2025 ?',
  },
  {
    id: 'case_8iv',
    priorite: 'critique',
    categorie: 'PAS',
    case: '8IV',
    titre: 'PAS D2 — Risque d\'oubli si changement d\'employeur',
    description: 'Si D2 a changé d\'employeur : vérifier que les PAS des deux employeurs sont bien additionnés.',
    detail: 'En cas de changement d\'employeur pour le déclarant 2, le préremplissage peut n\'afficher que le PAS transmis par le dernier employeur. Additionnez manuellement les PAS de tous les bulletins de décembre de chaque employeur et comparez avec la case 8IV.',
    valeurAttendue: null,
    condition: ['marie_pacse'],
    lienImpots: null,
    questionChat: 'La case 8IV de mon conjoint semble incomplète car il a eu 2 employeurs en 2025, comment corriger ?',
  },

  // ── Changement employeur ───────────────────────────────────────────────────

  {
    id: 'cumul_pas_multi',
    priorite: 'critique',
    categorie: 'PAS',
    case: null,
    titre: 'PAS multi-employeurs — Additionner manuellement',
    description: 'Le préremplissage peut n\'afficher que le dernier employeur. Additionnez tous les PAS.',
    detail: 'Si vous avez eu plusieurs employeurs en 2025, chacun a transmis son propre cumul PAS à l\'administration. Le préremplissage devrait les additionner, mais des erreurs surviennent parfois. Reprenez chaque bulletin de paie de décembre (ou solde de tout compte) et additionnez tous les montants PAS pour les comparer aux cases 8HV/8IV.',
    valeurAttendue: null,
    condition: ['changement_employeur', 'plusieurs_employeurs'],
    lienImpots: null,
    questionChat: 'J\'ai eu 2 employeurs en 2025, comment m\'assurer que les cases 8HV et 1AJ reprennent bien le cumul des deux ?',
  },
  {
    id: 'indemnites_rupture',
    priorite: 'attention',
    categorie: 'Salaires',
    case: null,
    titre: 'Indemnités de rupture — Vérifier l\'exonération',
    description: 'Les indemnités de licenciement sont exonérées dans certaines limites. Vérifiez le traitement fiscal.',
    detail: 'Les indemnités de licenciement sont exonérées d\'IR dans la limite la plus élevée entre : 2x la rémunération brute annuelle, ou 50% de l\'indemnité, dans la limite de 6 plafonds annuels SS. Les indemnités de rupture conventionnelle sont exonérées dans la limite de l\'indemnité légale/conventionnelle (sans dépasser 2x le PASS). Vérifiez votre solde de tout compte et le traitement retenu par votre employeur.',
    valeurAttendue: null,
    condition: ['indemnites_rupture'],
    lienImpots: null,
    questionChat: 'J\'ai perçu une indemnité de rupture conventionnelle de X €, quelle partie est exonérée d\'impôt ?',
  },

  // ── PERO / Article 83 ──────────────────────────────────────────────────────

  {
    id: 'case_6qs',
    priorite: 'attention',
    categorie: 'Retraite',
    case: '6QS',
    titre: 'Cotisations PERO obligatoires — Attestation fiscale',
    description: 'Reporter le montant de l\'attestation fiscale employeur reçue en mars-avril.',
    detail: 'Si vous avez un PERO (Plan d\'Épargne Retraite Obligatoire, ex-article 83) chez votre employeur, vous recevrez une attestation fiscale entre mars et avril précisant les cotisations déductibles. Reportez le montant en case 6QS (D1) ou 6RS (D2) selon l\'attestation. Vérifiez également les cases 6QT et 6QU pour la ventilation obligatoire/non-obligatoire.',
    valeurAttendue: null,
    condition: ['pero'],
    lienImpots: null,
    questionChat: 'Comment remplir les cases 6QS/6QT/6QU pour mon PERO obligatoire, et où trouver l\'attestation fiscale ?',
  },

  // ── Revenus fonciers ───────────────────────────────────────────────────────

  {
    id: 'case_4be_microfoncier',
    priorite: 'critique',
    categorie: 'Foncier',
    case: '4BE',
    titre: 'Revenus fonciers bruts — Micro-foncier (< 15 000 €)',
    description: 'Si total loyers bruts < 15 000 € : micro-foncier de plein droit, abattement 30% automatique.',
    detail: 'Le régime micro-foncier s\'applique de plein droit si vos revenus fonciers bruts annuels ne dépassent pas 15 000 €. Reporter le total brut en case 4BE. L\'administration applique automatiquement un abattement de 30% pour frais. Ce régime s\'applique aux loyers nus, fermages, et quotes-parts de SCI à l\'IR ou d\'indivision. Si vos charges réelles dépassent 30%, le régime réel peut être plus avantageux.',
    valeurAttendue: null,
    condition: ['loyers_nus', 'fermage', 'sci_ir', 'indivision_revenus'],
    lienImpots: 'https://www.impots.gouv.fr/particulier/les-revenus-fonciers',
    questionChat: 'Je perçois X € de loyers bruts en 2025, est-ce que le micro-foncier en case 4BE est plus avantageux que le régime réel ?',
  },
  {
    id: 'regime_reel_vs_micro',
    priorite: 'attention',
    categorie: 'Foncier',
    case: null,
    titre: 'Choix régime réel vs micro-foncier — À simuler',
    description: 'Si charges réelles > 30% des loyers bruts, le régime réel peut être plus avantageux.',
    detail: 'Le choix entre micro-foncier et régime réel est structurant : si vous optez pour le réel, vous y êtes engagé pour 3 ans minimum. Le régime réel permet de déduire les charges réelles (travaux, intérêts d\'emprunt, charges de copropriété, assurances, frais de gestion…). Il permet aussi de créer un déficit foncier (dans la limite de 10 700 € déductible du revenu global). Simulez les deux avant de choisir.',
    valeurAttendue: null,
    condition: ['loyers_nus'],
    lienImpots: null,
    questionChat: 'Avec X € de loyers bruts et Y € de charges (dont Z € d\'intérêts), vaut-il mieux le micro-foncier ou le régime réel ?',
  },
  {
    id: 'cases_4ba_4bc_reel',
    priorite: 'critique',
    categorie: 'Foncier',
    case: '4BA',
    titre: 'Régime réel foncier — Cases 4BA / 4BB / 4BC',
    description: 'Reporter revenus bruts (4BA), charges déductibles (4BB), intérêts d\'emprunt (4BC).',
    detail: 'Si vous avez opté pour le régime réel foncier, remplissez la déclaration 2044 : case 4BA (revenus bruts), 4BB (charges déductibles hors intérêts : travaux, charges de co-prop, assurance, frais de gestion), 4BC (intérêts d\'emprunt). Le résultat net (4BA - 4BB - 4BC) peut être un déficit reportable. Les formulaires 2044 et 2044-SPE sont disponibles sur impots.gouv.',
    valeurAttendue: null,
    condition: ['loyers_nus'],
    lienImpots: 'https://www.impots.gouv.fr/particulier/les-revenus-fonciers',
    questionChat: 'Comment remplir la déclaration 2044 au régime réel avec mes revenus fonciers et charges en 2025 ?',
  },
  {
    id: 'lmnp_5nd',
    priorite: 'critique',
    categorie: 'Foncier',
    case: '5ND',
    titre: 'Location meublée LMNP — Cases 5ND/5OD (BIC)',
    description: 'Les revenus de location meublée ne sont PAS en 4BE mais en BIC (cases 5ND ou liasse 2031).',
    detail: 'Les revenus de location meublée (LMNP, Airbnb, résidences services) sont imposés en BIC (bénéfices industriels et commerciaux), pas en revenus fonciers. Si total BIC < 77 700 € : micro-BIC, abattement 50% (71% pour chambres d\'hôtes), reporter en case 5ND. Si vous avez opté pour le réel : déposer une liasse fiscale 2031 et reporter le bénéfice ou déficit en case 5KC/5NK.',
    valeurAttendue: null,
    condition: ['loyers_meubles'],
    lienImpots: null,
    questionChat: 'Mes revenus Airbnb de X € en 2025, est-ce que je dois déclarer en 5ND (micro-BIC) ou faire une liasse 2031 ?',
  },
  {
    id: 'plus_value_immo',
    priorite: 'attention',
    categorie: 'Foncier',
    case: null,
    titre: 'Plus-value immobilière — Formulaire 2048-IMM',
    description: 'Vente d\'un bien en 2025 hors RP : formulaire 2048-IMM, taxe payée via notaire.',
    detail: 'Si vous avez vendu un bien immobilier en 2025 (hors résidence principale exonérée), la plus-value est imposée à 19% IR + 17,2% PS = 36,2%. Le notaire a normalement calculé et payé la taxe lors de la vente. Vérifiez que le montant figure sur le formulaire 2048-IMM et que vous l\'avez bien transmis. Les abattements pour durée de détention s\'appliquent : exonération IR totale après 22 ans, PS après 30 ans.',
    valeurAttendue: null,
    condition: ['vente_immo'],
    lienImpots: null,
    questionChat: 'J\'ai vendu un appartement en 2025 après X années de détention, quel est l\'abattement applicable et comment le déclarer ?',
  },

  // ── Revenus mobiliers ──────────────────────────────────────────────────────

  {
    id: 'cases_2dc_2bh',
    priorite: 'critique',
    categorie: 'Revenus mobiliers',
    case: '2DC',
    titre: 'Dividendes et intérêts — Cases 2DC / 2BH',
    description: 'Reporter les revenus de capitaux mobiliers du IFU envoyé par votre banque/courtier.',
    detail: 'L\'Imprimé Fiscal Unique (IFU) est envoyé par votre banque, courtier ou assureur entre janvier et mars. Il récapitule tous les revenus mobiliers 2025 : dividendes (2DC), produits de placement (2BH), crédits d\'impôt… Le préremplissage de l\'administration devrait reprendre ces données, mais vérifiez la correspondance avec votre IFU. Le PFU 30% (12,8% IR + 17,2% PS) s\'applique par défaut.',
    valeurAttendue: null,
    condition: ['dividendes'],
    lienImpots: null,
    questionChat: 'J\'ai reçu X € de dividendes en 2025, comment vérifier que les cases 2DC et 2BH sont bien remplies ?',
  },
  {
    id: 'option_bareme_dividendes',
    priorite: 'attention',
    categorie: 'Revenus mobiliers',
    case: null,
    titre: 'Option barème dividendes — Simuler si TMI ≤ 11%',
    description: 'Si votre TMI est 0% ou 11% : l\'option barème peut être plus favorable que le PFU 30%.',
    detail: 'L\'option pour le barème progressif (case 2OP à cocher) s\'applique à l\'ensemble de vos revenus mobiliers. Avantages si TMI ≤ 11% : abattement 40% sur dividendes, déductibilité partielle de la CSG (6,8%). L\'option est globale — elle s\'applique à tous vos revenus mobiliers de l\'année. Simulez avant de cocher : ce n\'est avantageux que si votre TMI réel après décote est faible.',
    valeurAttendue: null,
    condition: ['dividendes'],
    lienImpots: null,
    questionChat: 'Avec une TMI de X% et Y € de dividendes, est-ce que l\'option barème (case 2OP) est avantageuse ou pas ?',
  },
  {
    id: 'cases_3vg_3vh',
    priorite: 'critique',
    categorie: 'Revenus mobiliers',
    case: '3VG',
    titre: 'Plus-values mobilières — Cases 3VG / 3VH',
    description: 'Reporter les cessions actions/ETF/obligations du IFU. Moins-values imputables sur 10 ans.',
    detail: 'Les plus-values de cession de valeurs mobilières (actions, ETF, obligations, SCPI…) sont à reporter en case 3VG. Les moins-values s\'imputent sur les plus-values de l\'année, puis les excédents sont reportables 10 ans (case 3VH). Ces données figurent sur votre IFU. Vérifiez bien les montants si vous avez opéré sur plusieurs comptes-titres ou courtiers : chacun envoie son propre IFU.',
    valeurAttendue: null,
    condition: ['plus_values_mobilieres'],
    lienImpots: null,
    questionChat: 'J\'ai des plus-values de X € et des moins-values de Y € sur mon compte-titres en 2025, comment les reporter et imputer ?',
  },
  {
    id: 'case_3an_crypto',
    priorite: 'critique',
    categorie: 'Crypto',
    case: '3AN',
    titre: 'Plus-values crypto — Case 3AN (formulaire 2086)',
    description: 'Cessions crypto en 2025 > 305 € : imposition obligatoire PFU 30%. Formulaire 2086 si nombreuses cessions.',
    detail: 'Si le total de vos cessions de cryptomonnaies en 2025 dépasse 305 €, vous devez déclarer les plus-values. Calcul : (prix de cession - prix d\'acquisition moyen pondéré × fraction du portefeuille cédé / valeur totale du portefeuille). En pratique : utilisez le formulaire 2086 pour le calcul ligne par ligne, puis reportez le résultat en case 3AN. Le PFU 30% s\'applique. Des logiciels spécialisés (Waltio, Koinly, CryptoTaxCalculator) peuvent automatiser le calcul.',
    valeurAttendue: null,
    condition: ['cessions_crypto'],
    lienImpots: 'https://www.impots.gouv.fr/particulier/cryptomonnaies',
    questionChat: 'J\'ai réalisé plusieurs cessions crypto en 2025 pour un total de X €, comment calculer ma plus-value nette et remplir la case 3AN ?',
  },
  {
    id: 'pea_retraits',
    priorite: 'attention',
    categorie: 'Revenus mobiliers',
    case: null,
    titre: 'PEA — Vérifier le régime fiscal des retraits',
    description: 'Retrait avant 5 ans : PFU 30%. Retrait après 5 ans : PS 17,2% seulement.',
    detail: 'Le régime fiscal d\'un retrait PEA dépend de l\'ancienneté du plan à la date du retrait. Avant 5 ans : imposition au PFU 30% (12,8% IR + 17,2% PS) sur la plus-value. Après 5 ans : exonération d\'IR, mais PS 17,2% sur la plus-value. Ces données figurent sur le relevé fiscal envoyé par votre courtier/banque. Si vous avez effectué un retrait partiel, vérifiez que le plan n\'est pas automatiquement clôturé (cas avant 5 ans).',
    valeurAttendue: null,
    condition: ['pea_retraits'],
    lienImpots: null,
    questionChat: 'J\'ai effectué un retrait de mon PEA ouvert en 2018, quelle est la fiscalité applicable sur la plus-value ?',
  },
  {
    id: 'interets_livrets',
    priorite: 'info',
    categorie: 'Revenus mobiliers',
    case: '2TR',
    titre: 'Intérêts sur livrets non exonérés — Case 2TR',
    description: 'Les intérêts des livrets non réglementés (hors Livret A, LDDS, LEP) sont imposables.',
    detail: 'Les intérêts des livrets réglementés (Livret A, LDDS, LEP, livret jeune) sont exonérés d\'IR et de PS. En revanche, les intérêts des livrets bancaires classiques, comptes à terme, ou obligations sont imposables. Ils figurent sur l\'IFU et sont normalement préremplis en case 2TR.',
    valeurAttendue: null,
    condition: ['interets_livrets'],
    lienImpots: null,
    questionChat: 'Quels intérêts de livrets dois-je déclarer en 2025 et lesquels sont exonérés ?',
  },

  // ── Comptes à déclarer ─────────────────────────────────────────────────────

  {
    id: 'formulaire_3916_banque',
    priorite: 'critique',
    categorie: 'Comptes étrangers',
    case: '3916',
    titre: 'Formulaire 3916 — Comptes bancaires étrangers',
    description: 'OBLIGATOIRE. Pénalité : 1 500 € par compte non déclaré (10 000 € si pays non coopératif).',
    detail: 'Tout compte bancaire ouvert, détenu, utilisé ou clôturé à l\'étranger doit être déclaré via le formulaire 3916, même sans mouvement en 2025. S\'applique à Revolut (banque UK), N26 (Allemagne), Wise, Bunq, tout compte dans une banque étrangère. La déclaration est à refaire chaque année. Pénalité en cas d\'omission : 1 500 € par compte non déclaré, portée à 10 000 € pour les pays n\'ayant pas conclu de convention d\'assistance avec la France.',
    valeurAttendue: null,
    condition: ['compte_bancaire_etranger'],
    lienImpots: 'https://www.impots.gouv.fr/particulier/comptes-etrangers',
    questionChat: 'J\'ai un compte Revolut et un compte N26 — comment remplir les formulaires 3916 et quelles informations fournir pour chacun ?',
  },
  {
    id: 'formulaire_3916bis_crypto',
    priorite: 'critique',
    categorie: 'Comptes étrangers',
    case: '3916 bis',
    titre: 'Formulaire 3916 bis — Comptes crypto sur exchanges étrangers',
    description: 'OBLIGATOIRE pour chaque exchange non établi en France. Pénalité : 1 500 € par compte.',
    detail: 'Tout compte ou portefeuille sur un exchange de cryptomonnaies non établi en France (Binance, Kraken, Coinbase, Bybit, Bitpanda, OKX…) doit être déclaré via le formulaire 3916 bis, même sans cession taxable. S\'applique aux exchanges détenus ou utilisés à tout moment en 2025. Exemption : les exchanges établis en France (Coinhouse, Bitstack, Paymium) ne nécessitent pas ce formulaire.',
    valeurAttendue: null,
    condition: ['compte_crypto'],
    lienImpots: 'https://www.impots.gouv.fr/particulier/cryptomonnaies',
    questionChat: 'J\'ai des comptes sur Binance et Kraken — comment remplir les formulaires 3916 bis et quelles informations sont nécessaires ?',
  },
  {
    id: 'formulaire_3916_courtier',
    priorite: 'critique',
    categorie: 'Comptes étrangers',
    case: '3916',
    titre: 'Formulaire 3916 — Comptes de courtage étrangers',
    description: 'Interactive Brokers, Trading212, Degiro, Saxo, Schwab… : même obligation que les comptes bancaires.',
    detail: 'Les comptes de courtage ouverts auprès d\'intermédiaires établis à l\'étranger (Interactive Brokers UK/IE, Trading212, Degiro NL, Saxo DK, Charles Schwab US…) doivent être déclarés via le formulaire 3916. En plus de la déclaration 3916, vérifiez si des retenues à la source étrangères ont été prélevées sur vos dividendes : elles peuvent ouvrir droit à un crédit d\'impôt en France sous conditions de convention fiscale.',
    valeurAttendue: null,
    condition: ['courtier_etranger'],
    lienImpots: 'https://www.impots.gouv.fr/particulier/comptes-etrangers',
    questionChat: 'J\'ai un compte Interactive Brokers, comment déclarer le compte via 3916 et gérer les retenues à la source sur dividendes étrangers ?',
  },
  {
    id: 'formulaire_3916_av_etrangere',
    priorite: 'critique',
    categorie: 'Comptes étrangers',
    case: '3916',
    titre: 'Formulaire 3916 — Assurance-vie étrangère',
    description: 'Toute assurance-vie souscrite auprès d\'un assureur étranger doit être déclarée, même sans rachat.',
    detail: 'Les contrats d\'assurance-vie souscrits auprès d\'assureurs établis à l\'étranger (Luxembourg, Irlande, Belgique…) doivent être déclarés via le formulaire 3916. Cette obligation s\'applique même si aucun rachat n\'a été effectué en 2025. La valeur de rachat au 01/01/2025 ou à la date de souscription doit être renseignée.',
    valeurAttendue: null,
    condition: ['av_etrangere'],
    lienImpots: null,
    questionChat: 'J\'ai une assurance-vie au Luxembourg, comment la déclarer via le formulaire 3916 et quelles informations l\'assureur doit-il me fournir ?',
  },
  {
    id: 'compte_paypal',
    priorite: 'attention',
    categorie: 'Comptes étrangers',
    case: '3916',
    titre: 'Compte PayPal — Déclaration si solde significatif',
    description: 'PayPal est établi au Luxembourg : à déclarer si utilisé comme compte de dépôt.',
    detail: 'PayPal Europe est établi au Luxembourg. Si vous utilisez votre compte PayPal comme un compte bancaire (solde conservé, virements reçus de tiers…), vous avez en principe l\'obligation de le déclarer via le formulaire 3916. En pratique, l\'obligation est interprétée strictement pour les comptes avec solde significatif ou utilisés régulièrement comme compte de stockage de fonds.',
    valeurAttendue: null,
    condition: ['compte_paypal'],
    lienImpots: null,
    questionChat: 'Mon compte PayPal (établi au Luxembourg) doit-il être déclaré via le formulaire 3916, et dans quels cas ?',
  },

  // ── Déductions et réductions ───────────────────────────────────────────────

  {
    id: 'case_6ns',
    priorite: 'attention',
    categorie: 'Retraite',
    case: '6NS',
    titre: 'Versements PER volontaires — Cases 6NS / 6NT',
    description: 'Reporter en 6NS (D1) ou 6NT (D2). Déduction du revenu imposable dans la limite du plafond.',
    detail: 'Les versements volontaires sur un PER individuel (PERIN) en 2025 sont déductibles du revenu imposable, dans la limite du plafond disponible (figurant sur votre avis d\'imposition N-1 ou disponible sur votre espace impots.gouv). Reporter en case 6NS pour D1, 6NT pour D2. Les plafonds non utilisés des 3 dernières années sont reportables. Vérifiez votre plafond disponible avant de verser en fin d\'année.',
    valeurAttendue: null,
    condition: ['per_volontaire'],
    lienImpots: null,
    questionChat: 'J\'ai versé X € sur mon PER individuel en 2025, quel est mon plafond disponible et comment optimiser la déduction case 6NS ?',
  },
  {
    id: 'cases_7db_7dd',
    priorite: 'attention',
    categorie: 'Déductions',
    case: '7DB',
    titre: 'Emploi à domicile — Cases 7DB / 7DD (crédit d\'impôt 50%)',
    description: '50% de crédit d\'impôt sur les dépenses. Plafond 12 000 € + 1 500 € par enfant.',
    detail: 'Le crédit d\'impôt pour emploi à domicile est de 50% des dépenses engagées (salaires + charges patronales). Plafond de base : 12 000 €, majoré de 1 500 € par enfant à charge, enfant handicapé, ou ascendant > 65 ans (max 15 000 €). Case 7DB (dépenses totales), 7DG (si case CESU). Si vous passez par un prestataire (société de services à la personne), reporter en case 7DD. Le crédit est remboursable — il vous est versé même si vous ne payez pas d\'impôt.',
    valeurAttendue: null,
    condition: ['emploi_domicile'],
    lienImpots: null,
    questionChat: 'J\'ai payé X € de salaire + charges à mon employé de maison en 2025, quel crédit d\'impôt puis-je obtenir case 7DB ?',
  },
  {
    id: 'cases_7ga_7gc',
    priorite: 'attention',
    categorie: 'Déductions',
    case: '7GA',
    titre: 'Garde d\'enfants < 6 ans — Cases 7GA / 7GB / 7GC',
    description: '50% de crédit d\'impôt. Plafond 3 500 € par enfant (2 300 € si garde hors domicile).',
    detail: 'Le crédit d\'impôt pour frais de garde s\'applique aux enfants de moins de 6 ans au 01/01/2025. Taux : 50% des dépenses. Plafond : 3 500 € par enfant gardé à domicile (case 7GA), 2 300 € par enfant en crèche ou assistante maternelle (case 7GC). Le crédit est remboursable. Reporter les dépenses nettes (après déduction des aides CAF/PAJ-Emploi si applicables).',
    valeurAttendue: null,
    condition: ['garde_enfants'],
    lienImpots: null,
    questionChat: 'Mon enfant de 4 ans est à la crèche. J\'ai payé X € en 2025 — quel crédit d\'impôt puis-je déclarer case 7GC ?',
  },
  {
    id: 'cases_7ud_7uf',
    priorite: 'attention',
    categorie: 'Déductions',
    case: '7UD',
    titre: 'Dons associations — Cases 7UD / 7UF (réduction 66% ou 75%)',
    description: '66% de réduction d\'impôt. 75% pour associations d\'aide aux personnes (plafond 1 000 €).',
    detail: 'Les dons aux associations reconnues d\'utilité publique ouvrent droit à une réduction d\'impôt de 66% du montant versé, dans la limite de 20% du revenu imposable. Cas particulier : les dons aux associations d\'aide aux personnes en difficulté (Restos du Cœur, Croix-Rouge, Secours Populaire…) bénéficient d\'un taux de 75% dans la limite de 1 000 €, puis 66% au-delà. Conservez précieusement les reçus fiscaux.',
    valeurAttendue: null,
    condition: ['dons'],
    lienImpots: null,
    questionChat: 'J\'ai donné X € aux Restos du Cœur et Y € à une association culturelle en 2025, quelle est la réduction d\'impôt totale ?',
  },
  {
    id: 'case_7dq_pension',
    priorite: 'attention',
    categorie: 'Déductions',
    case: '7DQ',
    titre: 'Pension alimentaire versée — Case 7DQ (enfant majeur)',
    description: 'Déductible du revenu imposable si enfant majeur non rattaché. Plafond 6 368 € par enfant.',
    detail: 'Les pensions alimentaires versées à un enfant majeur non rattaché au foyer fiscal sont déductibles du revenu imposable dans la limite de 6 368 € par enfant en 2025 (plafond fixé par décret). La déduction n\'est possible que si l\'enfant ne fait pas partie du foyer fiscal. À déclarer en case 7DQ. L\'enfant bénéficiaire devra déclarer cette pension en revenus.',
    valeurAttendue: null,
    condition: ['pension_versee'],
    lienImpots: null,
    questionChat: 'Je verse 500 €/mois à mon enfant majeur étudiant non rattaché — quel montant déductible puis-je déclarer case 7DQ ?',
  },
  {
    id: 'frais_scolarite',
    priorite: 'info',
    categorie: 'Déductions',
    case: '7EA',
    titre: 'Frais de scolarité — Cases 7EA / 7EC / 7EF',
    description: 'Réduction d\'impôt : 61 € collège, 153 € lycée, 183 € enseignement supérieur par enfant.',
    detail: 'Réduction d\'impôt forfaitaire par enfant à charge scolarisé : 61 € au collège (case 7EA), 153 € au lycée (case 7EC), 183 € dans l\'enseignement supérieur (case 7EF). À déclarer si l\'enfant est scolarisé au 31 décembre 2025. Pas de justificatif à fournir mais à conserver.',
    valeurAttendue: null,
    condition: ['enfants_scolarises'],
    lienImpots: null,
    questionChat: 'J\'ai un enfant en terminale et un en BTS en 2025 — quels montants puis-je déclarer cases 7EC et 7EF ?',
  },
  {
    id: 'travaux_renovation',
    priorite: 'attention',
    categorie: 'Déductions',
    case: '7WF',
    titre: 'Travaux rénovation énergétique — MaPrimeRénov et CITE',
    description: 'Vérifier les attestations reçues. Certains travaux restent en crédit d\'impôt selon leur nature.',
    detail: 'MaPrimeRénov est une aide versée directement (pas un crédit d\'impôt à déclarer). Cependant, certains équipements peuvent encore ouvrir droit au crédit d\'impôt transition énergétique (CITE) selon les travaux. Vérifiez les attestations fiscales remises par vos artisans (document obligatoire). Si vous avez reçu MaPrimeRénov, celle-ci n\'est pas à déclarer en revenus.',
    valeurAttendue: null,
    condition: ['travaux_renovation'],
    lienImpots: 'https://www.impots.gouv.fr',
    questionChat: 'J\'ai réalisé des travaux de rénovation énergétique en 2025 (pompe à chaleur, isolation), est-ce que je peux encore bénéficier d\'un crédit d\'impôt ?',
  },
  {
    id: 'case_7ac_syndicat',
    priorite: 'info',
    categorie: 'Déductions',
    case: '7AC',
    titre: 'Cotisations syndicales — Case 7AC (réduction 66%)',
    description: '66% de réduction d\'impôt sur les cotisations versées.',
    detail: 'Les cotisations syndicales versées en 2025 ouvrent droit à une réduction d\'impôt de 66% dans la limite de 1% de votre revenu brut imposable. Reporter le montant figurant sur le certificat de cotisation délivré par votre syndicat. Ce crédit est remboursable si votre impôt est inférieur à la réduction.',
    valeurAttendue: null,
    condition: ['cotisations_syndicales'],
    lienImpots: null,
    questionChat: 'J\'ai payé X € de cotisations syndicales en 2025, quel est le montant de la réduction d\'impôt case 7AC ?',
  },

  // ── Situations spéciales ───────────────────────────────────────────────────

  {
    id: 'pel_avant_2018',
    priorite: 'attention',
    categorie: 'Épargne',
    case: null,
    titre: 'PEL ouvert avant 2018 — Vérifier l\'imposition des intérêts',
    description: 'Les intérêts sont exonérés d\'IR pendant les 12 premières années. Après 12 ans → PFU.',
    detail: 'Les PEL ouverts avant le 1er janvier 2018 bénéficient d\'un régime spécifique : les intérêts sont exonérés d\'IR pendant les 12 premières années du plan. À partir du 13e anniversaire du plan, les intérêts deviennent imposables (PFU 30%). Si votre PEL a été ouvert avant 2013, il est probablement en phase imposable. Vérifiez la date d\'ouverture et les intérêts déclarés par votre banque sur l\'IFU.',
    valeurAttendue: null,
    condition: ['pel_avant_2018'],
    lienImpots: null,
    questionChat: 'Mon PEL a été ouvert en 2010 — mes intérêts 2025 sont-ils imposables et comment sont-ils déclarés ?',
  },
  {
    id: 'donation_heritage',
    priorite: 'info',
    categorie: 'Patrimoine',
    case: null,
    titre: 'Donation / héritage reçu en 2025 — Pas d\'IR, mais vérifier les revenus générés',
    description: 'Donations et successions hors IR. Mais les revenus des biens reçus peuvent être à déclarer.',
    detail: 'Les donations et successions ne sont pas imposables à l\'IR (déclaration séparée 2705-SD pour les droits de mutation). En revanche, si les biens reçus (immobilier, titres, assurance-vie…) ont généré des revenus en 2025 (loyers, dividendes, rachats…), ces revenus sont à déclarer normalement dans les cases correspondantes. Si vous avez reçu une assurance-vie suite à un décès, vérifiez le traitement fiscal des capitaux reçus.',
    valeurAttendue: null,
    condition: ['donation_heritage'],
    lienImpots: null,
    questionChat: 'J\'ai hérité d\'un appartement en 2025 qui a généré des loyers — comment déclarer ces revenus fonciers pour la partie de l\'année où j\'étais propriétaire ?',
  },
  {
    id: 'impatrie',
    priorite: 'attention',
    categorie: 'Situations spéciales',
    case: null,
    titre: 'Impatrié / non-résident rentrant en France — Régimes spéciaux',
    description: 'Régime des impatriés (art. 155B CGI) : exonération partielle 8 ans. Vérifier l\'éligibilité.',
    detail: 'Si vous avez transféré votre domicile fiscal en France en 2025 après avoir travaillé à l\'étranger, vous pouvez bénéficier du régime des impatriés (article 155B CGI) : exonération de 50% du salaire ou de la prime d\'impatriation pendant 8 ans. Conditions : ne pas avoir été résident fiscal français les 5 années précédentes, être recruté de l\'étranger par une entreprise française ou être salarié transféré. Ce régime est à demander explicitement et peut nécessiter l\'assistance d\'un fiscaliste.',
    valeurAttendue: null,
    condition: ['impatrie'],
    lienImpots: null,
    questionChat: 'Je suis rentré en France en 2025 après 6 ans à l\'étranger, est-ce que je peux bénéficier du régime des impatriés article 155B CGI ?',
  },
  {
    id: 'changement_situation',
    priorite: 'critique',
    categorie: 'Situation',
    case: null,
    titre: 'Changement de situation en 2025 — Déclarer le changement sur impots.gouv',
    description: 'Mariage, PACS, divorce, naissance, décès du conjoint : modifier votre profil sur impots.gouv.',
    detail: 'Tout changement de situation familiale en 2025 (mariage, PACS, divorce, séparation, naissance, décès du conjoint) doit être déclaré à l\'administration fiscale via votre espace impots.gouv (rubrique "Gérer mon profil"). Ce changement peut modifier votre nombre de parts fiscales, votre quotient familial, et donc votre calcul d\'impôt. Un mariage ou PACS en cours d\'année crée une situation particulière (deux déclarations possibles). Consultez impots.gouv pour connaître les modalités exactes selon votre cas.',
    valeurAttendue: null,
    condition: ['changement_situation'],
    lienImpots: 'https://www.impots.gouv.fr',
    questionChat: 'Je me suis marié(e) en juin 2025 — comment cela affecte-t-il ma déclaration d\'impôt et dois-je faire une déclaration commune ou séparée ?',
  },
];

// ─── Questionnaire ─────────────────────────────────────────────────────────────

export const QUESTIONNAIRE_GROUPS = [
  {
    id: 'situation',
    label: 'Situation',
    items: [
      { id: 'marie_pacse',          label: 'Je suis marié(e) ou pacsé(e)' },
      { id: 'enfants_charge',       label: "J'ai des enfants à charge" },
      { id: 'changement_situation', label: "J'ai eu un changement de situation en 2025 (mariage, divorce, naissance, décès, séparation)" },
      { id: 'demenagement',         label: "J'ai déménagé en cours d'année 2025" },
      { id: 'revenus_etrangers',    label: "J'ai travaillé à l'étranger ou j'ai des revenus étrangers" },
    ],
  },
  {
    id: 'revenus_salariaux',
    label: 'Revenus salariaux',
    items: [
      { id: 'changement_employeur', label: "J'ai changé d'employeur en 2025" },
      { id: 'plusieurs_employeurs', label: "J'ai eu plusieurs employeurs simultanément" },
      { id: 'indemnites_rupture',   label: "J'ai perçu des indemnités de rupture (licenciement, rupture conventionnelle)" },
      { id: 'avantages_nature',     label: "J'ai des avantages en nature (véhicule, logement)" },
      { id: 'pero',                 label: "J'ai un PERO / article 83 chez mon employeur" },
      { id: 'pee_pereco',           label: "J'ai participé à une augmentation de capital réservée aux salariés (PEE/PERECO)" },
    ],
  },
  {
    id: 'revenus_fonciers',
    label: 'Revenus fonciers',
    items: [
      { id: 'loyers_nus',          label: "Je perçois des loyers nus (appartement, maison, local commercial)" },
      { id: 'loyers_meubles',      label: "Je perçois des loyers meublés (LMNP, Airbnb, résidence services)" },
      { id: 'fermage',             label: "Je perçois un fermage (terres agricoles)" },
      { id: 'sci_ir',              label: "Je suis associé d'une SCI à l'IR" },
      { id: 'indivision_revenus',  label: "Je suis en indivision sur un bien qui génère des revenus" },
      { id: 'vente_immo',          label: "J'ai vendu un bien immobilier en 2025" },
    ],
  },
  {
    id: 'revenus_mobiliers',
    label: 'Revenus mobiliers',
    items: [
      { id: 'dividendes',             label: "J'ai perçu des dividendes ou coupons (compte-titres)" },
      { id: 'plus_values_mobilieres', label: "J'ai vendu des actions, ETF, obligations en 2025 (plus-values)" },
      { id: 'cessions_crypto',        label: "J'ai cédé des cryptomonnaies en 2025" },
      { id: 'rachat_av',              label: "J'ai une assurance-vie avec des rachats en 2025" },
      { id: 'pea_retraits',           label: "J'ai un PEA avec des retraits en 2025" },
      { id: 'interets_livrets',       label: "J'ai des intérêts sur livrets non exonérés" },
    ],
  },
  {
    id: 'revenus_divers',
    label: 'Revenus divers',
    items: [
      { id: 'activite_secondaire', label: "J'ai une activité secondaire (auto-entrepreneur, freelance, BNC/BIC)" },
      { id: 'pensions_recues',     label: "J'ai perçu des pensions alimentaires" },
      { id: 'rentes',              label: "J'ai perçu des rentes viagères" },
      { id: 'droits_auteur',       label: "J'ai des droits d'auteur ou redevances" },
      { id: 'chomage',             label: "J'ai reçu des allocations chômage" },
    ],
  },
  {
    id: 'deductions',
    label: 'Déductions et réductions',
    items: [
      { id: 'pension_versee',        label: "Je verse une pension alimentaire (enfants majeurs, parents)" },
      { id: 'garde_alternee',        label: "J'ai un enfant en garde alternée" },
      { id: 'emploi_domicile',       label: "J'emploie quelqu'un à domicile (ménage, jardinage, garde d'enfants)" },
      { id: 'garde_enfants',         label: "J'ai des frais de garde d'enfants < 6 ans" },
      { id: 'dons',                  label: "J'ai fait des dons à des associations en 2025" },
      { id: 'travaux_renovation',    label: "J'ai réalisé des travaux de rénovation énergétique (MaPrimeRénov)" },
      { id: 'cotisations_syndicales',label: "Je paie des cotisations syndicales" },
      { id: 'enfants_scolarises',    label: "J'ai des enfants scolarisés (collège, lycée, supérieur)" },
      { id: 'fcpi_fip',              label: "J'ai investi dans des FCPI, FIP, SOFICA" },
      { id: 'per_volontaire',        label: "J'ai versé sur un PER individuel volontairement" },
    ],
  },
  {
    id: 'comptes_etrangers',
    label: 'Comptes à déclarer (3916 / 3916 bis)',
    items: [
      { id: 'compte_bancaire_etranger', label: "J'ai un compte bancaire à l'étranger (Revolut UK, N26, Wise, Bunq…)" },
      { id: 'courtier_etranger',        label: "J'ai un compte de courtage à l'étranger (Interactive Brokers, Trading212, Degiro, Saxo, Schwab…)" },
      { id: 'compte_crypto',            label: "J'ai un compte crypto sur exchange (Binance, Kraken, Coinbase, Bitpanda, Bybit…)" },
      { id: 'av_etrangere',             label: "J'ai une assurance-vie étrangère" },
      { id: 'compte_paypal',            label: "J'ai un compte PayPal avec solde significatif" },
      { id: 'autre_compte_etranger',    label: "J'ai tout autre compte, contrat ou placement hors de France" },
    ],
  },
  {
    id: 'situations_speciales',
    label: 'Situations spéciales',
    items: [
      { id: 'primo_accedant',   label: "Je suis primo-accédant / j'ai acheté ma résidence principale en 2025" },
      { id: 'pel_avant_2018',   label: "J'ai un PEL ouvert avant 2018" },
      { id: 'nu_propriete',     label: "Je suis propriétaire en nu-propriété" },
      { id: 'donation_heritage',label: "J'ai reçu une donation ou un héritage en 2025" },
      { id: 'impatrie',         label: "Je suis non-résident ou impatrié" },
    ],
  },
];

// ─── Extraction automatique depuis parsedProfile ──────────────────────────────

/**
 * Détecte les conditions de checklist depuis state.parsedProfile.
 * Accepte aussi un string (profile text brut) en fallback pour compatibilité.
 */
export function extractProfileData(parsedProfileOrText) {
  if (!parsedProfileOrText) return {};

  // Fallback string (ancien code) — regex sur le texte brut
  if (typeof parsedProfileOrText === 'string') {
    const profile = parsedProfileOrText;
    const detected = {};
    if (/pacsé|pacs|marié|couple|conjoint/i.test(profile))     detected.marie_pacse = true;
    if (/enfant|parts.*[2-9]|\d+ enfant/i.test(profile))        detected.enfants_charge = true;
    if (/cryptomonnaie|crypto|binance|kraken|coinbase|3916 bis/i.test(profile)) {
      detected.cessions_crypto = true;
      detected.compte_crypto = true;
    }
    if (/revolut|n26|wise|bunq|compte.*étranger|étranger.*compte/i.test(profile)) detected.compte_bancaire_etranger = true;
    if (/interactive broker|trading212|degiro|saxo/i.test(profile)) detected.courtier_etranger = true;
    if (/lmnp|airbnb|meublé|bic.*location/i.test(profile))     detected.loyers_meubles = true;
    if (/loyer|foncier|4be|sci\b|indivision/i.test(profile))   detected.loyers_nus = true;
    if (/fermage|terres agricoles/i.test(profile))              detected.fermage = true;
    if (/sci\b/i.test(profile))                                 detected.sci_ir = true;
    if (/dividende|2dc|2bh|coupon/i.test(profile))             detected.dividendes = true;
    if (/pea.*retrait|retrait.*pea/i.test(profile))            detected.pea_retraits = true;
    if (/plus.value.*immo|vente.*bien|immo.*vendu/i.test(profile)) detected.vente_immo = true;
    if (/per.*volontaire|perin|6ns|versement.*per/i.test(profile)) detected.per_volontaire = true;
    if (/pero|article 83|6qs/i.test(profile))                  detected.pero = true;
    if (/don.*association|7ud|7uf/i.test(profile))             detected.dons = true;
    if (/emploi.*domicile|salarié.*maison|7db/i.test(profile)) detected.emploi_domicile = true;
    if (/garde.*enfant|7ga|7gc/i.test(profile))                detected.garde_enfants = true;
    if (/pel.*201[0-7]|ouvert.*201[0-7]/i.test(profile))      detected.pel_avant_2018 = true;
    if (/pension.*versée|7dq|aliment/i.test(profile))          detected.pension_versee = true;
    if (/syndicat|7ac/i.test(profile))                         detected.cotisations_syndicales = true;
    if (/scolarisé|collège|lycée|supérieur|étudiant/i.test(profile)) detected.enfants_scolarises = true;
    if (/travaux.*énergétique|maprimerenov|rénovation/i.test(profile)) detected.travaux_renovation = true;
    if (/impatrié|non.résident|155b/i.test(profile))           detected.impatrie = true;
    return detected;
  }

  // Chemin principal : parsedProfile object
  const p = parsedProfileOrText;
  const detected = {};

  if (p.mode === 'couple')      detected.marie_pacse = true;
  if (p.hasCrypto)              { detected.cessions_crypto = true; detected.compte_crypto = true; }
  if (p.hasCompteEtranger)      detected.compte_bancaire_etranger = true;
  if (p.hasIndivision)          detected.loyers_nus = true;
  if (p.revensFonciers > 0)     detected.loyers_nus = true;
  if (p.revenusLoc > 0)         detected.loyers_meubles = true;
  if (p.dividendes > 0)         detected.dividendes = true;
  if (p.peroD1 > 0)             detected.pero = true;
  if (p.percoD1 > 0 || p.plafondPerD1 > 0) detected.per_volontaire = true;
  if (p.hasPelAncien)           detected.pel_avant_2018 = true;
  if (p.hasChangementEmployeur) detected.changement_employeur = true;
  if (p.hasMultipleEmployeurs)  detected.plusieurs_employeurs = true;

  return detected;
}

// ─── Extraction de valeurs chiffrées pour les items ───────────────────────────

/**
 * Retourne un dict case → valeur affichable, depuis state.parsedProfile.
 * Accepte aussi un string en fallback.
 */
export function extractValues(parsedProfileOrText) {
  if (!parsedProfileOrText) return {};

  if (typeof parsedProfileOrText === 'string') {
    const profile = parsedProfileOrText;
    const vals = {};
    const m = (rx) => { const r = profile.match(rx); return r ? r[1].replace(/\s/g, '') : null; };
    vals['1AJ'] = m(/net imposable.*?(\d[\d\s]{2,})\s*€/i);
    vals['1BJ'] = m(/d2.*?net imposable.*?(\d[\d\s]{2,})\s*€/i);
    vals['8HV'] = m(/pas prélevé.*?(\d[\d\s]{2,})\s*€/i);
    vals['8IV'] = m(/d2.*?pas.*?(\d[\d\s]{2,})\s*€/i);
    vals['PER_PLAFOND'] = m(/plafond.*?disponible.*?(\d[\d\s]{2,})\s*€/i);
    vals['TMI'] = m(/tmi.*?(\d+)\s*%/i);
    vals['4BE'] = m(/4be.*?(\d[\d\s]{2,})/i) || m(/loyers.*?bruts?.*?(\d[\d\s]{2,})\s*€/i);
    vals['3AN'] = m(/crypto.*?(\d[\d\s]{2,})\s*€/i);
    return vals;
  }

  const p = parsedProfileOrText;
  const fmtN = (v) => v > 0 ? String(Math.round(v)) : null;

  return {
    '1AJ':        fmtN(p.salaireNetImposableD1),
    '1BJ':        fmtN(p.salaireNetImposableD2),
    '8HV':        fmtN(p.pasD1),
    '8IV':        fmtN(p.pasD2),
    'PER_PLAFOND': fmtN(p.plafondPerD1 || p.plafondPerTotal),
    'TMI':        p.tmi > 0 ? String(p.tmi) : null,
    '4BE':        fmtN(p.revensFonciers),
    '3AN':        fmtN(p.cryptoTotal),
  };
}

// ─── Génération de la checklist filtrée ───────────────────────────────────────

export function generateChecklist(answers) {
  return CHECKLIST_ITEMS.filter(item =>
    item.condition.includes('always') ||
    item.condition.some(c => answers.has(c))
  );
}
