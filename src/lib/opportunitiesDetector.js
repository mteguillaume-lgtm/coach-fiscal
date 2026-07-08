// ─── detectOpportunities ──────────────────────────────────────────────────────
// Accepte un objet parsedProfile (résultat de parseProfile) ou un texte brut.

import { calcIR, computePerOptimumCascade, arbitragePfuBareme, calcPvMobiliere, calcCrypto, plafonnementNichesDeuxEtages, TAUX_PS_CAPITAL, PLAFOND_LDDS, PLAFOND_LEP } from './taxCalculator';
import { GAIN_DIFF_LDDS, GAIN_DIFF_LEP, GAIN_DIFF_AV_LT, GAIN_DIFF_PEA_LT, GAIN_DIFF_DEFAUT } from './hypothesesRendement';

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

export function detectOpportunities(parsedProfile) {
  if (!parsedProfile) return [];

  // Compatibilité descendante : si on reçoit un string (ancien code), on retourne vide
  // (les appelants doivent passer state.parsedProfile)
  if (typeof parsedProfile === 'string') {
    console.warn('[opportunitiesDetector] Reçu un string — passer state.parsedProfile');
    return [];
  }

  const {
    rniFoyer, rfr,
    plafondPerD1, plafondPerD2,
    livretAD1, livretAD2, lddsD1, lddsD2,
    lepD1, lepD2,
    livretPlusD1, livretPlusD2,
    peaD1, peaD2,
    avD1, avD2,
    pelD1, pelD2,
    pelDateD1, pelDateD2,
    remboursement,
    cryptoTotal,
    mode,
    hasCrypto,
    hasIndivision,
    hasTestamentManquant,
    irNet, foncierNet, pasTotal, pasD1, pasD2, parts,
  } = parsedProfile;

  const opps = [];
  const isCouple       = mode === 'couple';
  const isPacseOuMarie = isCouple;

  // INC-03 : intégrer les reports N-1/N-2/N-3 dans le plafond disponible
  // Les reports sont stockés au niveau foyer → pro-ratés par RNI en couple
  const _rniD1    = parsedProfile.rniD1 || 0;
  const _rniD2    = parsedProfile.rniD2 || 0;
  const _rniTot   = _rniD1 + _rniD2;
  const _repTotal = (parsedProfile.perReportableN1 || 0)
                  + (parsedProfile.perReportableN2 || 0)
                  + (parsedProfile.perReportableN3 || 0);
  const _repD1    = _rniTot > 0 ? Math.round(_repTotal * (_rniD1 / _rniTot)) : _repTotal;
  const _repD2    = _repTotal - _repD1;
  const effectivePlafondD1 = (plafondPerD1 || 0) + _repD1;
  const effectivePlafondD2 = (plafondPerD2 || 0) + _repD2;
  const perPlafond = effectivePlafondD1 + (isCouple ? effectivePlafondD2 : 0) || effectivePlafondD1;
  const hasPEA         = peaD1 > 0 || peaD2 > 0;
  const hasLEP         = lepD1 > 0 || lepD2 > 0;

  // Épargne liquide = tout ce qui reste disponible sans blocage fiscal
  // (Livret A, LDDS, LEP, Livret+/bancaire) — hors PEA, AV, PEL, PERCO
  const livretTotal = livretAD1 + livretAD2
                    + lddsD1   + lddsD2
                    + lepD1    + lepD2
                    + (livretPlusD1 || 0) + (livretPlusD2 || 0);

  // Taux effectif réel (IR net / RNI) — toujours plus bas que le TMI
  const irNetEstime     = irNet > 0 ? irNet : calcIR(rniFoyer || 0, parts || 1, isCouple);
  const tauxEffectif    = rniFoyer > 0 ? +((irNetEstime / rniFoyer) * 100).toFixed(1) : 0;
  const psFoncierEstime = (foncierNet || 0) * TAUX_PS_CAPITAL;
  const totalDuEstime   = irNetEstime + psFoncierEstime;
  const pasTot          = pasTotal || (pasD1 + pasD2);
  // Complément estimé (positif = à payer en septembre, négatif = remboursement)
  const complementEstime = Math.round(totalDuEstime - pasTot);

  // ── GAINS ──────────────────────────────────────────────────────────────────

  // PER optimal : cascade descendante par tranche — s'arrête à 11%
  if (perPlafond > 0) {
    const nbParts = parts || (isCouple ? 2 : 1);
    const opt = computePerOptimumCascade(rniFoyer || 0, nbParts, effectivePlafondD1, effectivePlafondD2, isCouple, _rniD1, _rniD2);

    if (opt.optimumTotal > 0 && opt.tmiDepart > 11) {
      const zoneLabel = opt.zones.map(z => `${fmt(z.versement)} € × ${z.taux} % = ${fmt(z.economie)} €`).join(' + ');
      const residuelNote = opt.capaciteResiduelle > 0
        ? ` Capacité résiduelle ${fmt(opt.capaciteResiduelle)} € à orienter vers PEA ou AV (rendement PER : 11 % seulement).`
        : '';

      // Libellé priorité couple : toujours mentionner le + imposé en premier
      const prio   = opt.prioritaire || 'D1';
      const second = prio === 'D1' ? 'D2' : 'D1';
      const prioPl = prio === 'D1' ? opt.plafondD1 : opt.plafondD2;
      const prioOpt= prio === 'D1' ? opt.optimumD1 : opt.optimumD2;
      const secOpt = prio === 'D1' ? opt.optimumD2 : opt.optimumD1;

      opps.push({
        id: 'per_optimal',
        type: 'gain',
        urgence: 'avant_decembre',
        titre: '💡 Versement PER optimal détecté',
        description: isCouple
          ? `Optimum fiscal : ${fmt(opt.optimumTotal)} € effacent la tranche ${opt.tmiDepart} % — économie IR réelle ${fmt(opt.economieOptimum)} €, effort net ${fmt(opt.effortNet)} €.${residuelNote}`
          : `Optimum fiscal : ${fmt(opt.optimumTotal)} € effacent la tranche ${opt.tmiDepart} % — économie IR réelle ${fmt(opt.economieOptimum)} €, effort net ${fmt(opt.effortNet)} €.${residuelNote}`,
        impact: `Économie IR optimum (${zoneLabel}) : ${fmt(opt.economieOptimum)} €`,
        impactEuros: opt.economieOptimum,
        action: isCouple
          ? `${prio} (plus imposé·e, plafond ${fmt(prioPl)} €) : verser ${fmt(prioOpt)} € en priorité${secOpt > 0 ? ` — puis ${second} : ${fmt(secOpt)} €` : ''} avant le 31/12`
          : `Verser ${fmt(opt.optimumTotal)} € sur votre PER avant le 31/12 (plafond max : ${fmt(opt.plafondTotal)} €)`,
        questionChat: isCouple
          ? `Mon foyer est marié/pacsé. RNI foyer : ${fmt(rniFoyer)} €, ${nbParts} parts fiscales, TMI ${opt.tmiDepart} %. Déclarant prioritaire : ${prio} (plafond ${fmt(prioPl)} €, plus imposé). Optimum fiscal : ${prio} verse ${fmt(prioOpt)} €${secOpt > 0 ? `, ${second} verse ${fmt(secOpt)} €` : ''} (total ${fmt(opt.optimumTotal)} €) → économie IR réelle ${fmt(opt.economieOptimum)} € (effort net ${fmt(opt.effortNet)} €).${opt.capaciteResiduelle > 0 ? ` Résiduel ${fmt(opt.capaciteResiduelle)} € (rendement PER 11 % → PEA/AV à comparer).` : ''} Comment choisir nos PER ?`
          : `RNI : ${fmt(rniFoyer)} €, ${nbParts} part(s) fiscale(s), TMI ${opt.tmiDepart} %. Optimum fiscal PER : ${fmt(opt.optimumTotal)} € effacent la tranche ${opt.tmiDepart} %, économie IR réelle ${fmt(opt.economieOptimum)} € (effort net ${fmt(opt.effortNet)} €).${opt.capaciteResiduelle > 0 ? ` Résiduel ${fmt(opt.capaciteResiduelle)} € → PEA/AV (rendement PER résiduel 11 %).` : ''} Quel PER choisir ?`,
      });
    }
  }

  // Arbitrage 2OP — verdict GLOBAL (div + intérêts + PV) lu du profil quand
  // disponible ; levier BIDIRECTIONNEL dès que l'option déclarée n'est pas
  // l'optimum. Fallback anciens profils : arbitrage div + intérêts (exact
  // quand PV = 0), barème seulement (comportement historique).
  const _div2DC = parsedProfile.dividendes2DC || 0;
  const _int2TR = parsedProfile.intMob2TR || 0;
  if (parsedProfile.arb2opRecommande) {
    const reco    = parsedProfile.arb2opRecommande;                       // 'pfu' | 'bareme'
    const declare = parsedProfile.option2opDeclaree ? 'bareme' : 'pfu';
    const eco     = parsedProfile.arb2opEconomie || 0;
    if (reco !== declare && eco >= 50) {
      const versBareme = reco === 'bareme';
      opps.push({
        id: 'arbitrage_pfu_bareme',
        type: 'gain',
        urgence: 'avant_declaration',
        titre: versBareme
          ? '💡 Option barème (2OP) avantageuse sur l\'ensemble de vos revenus du capital'
          : '💡 Le PFU serait plus avantageux que votre option barème (2OP)',
        description: `Arbitrage GLOBAL (dividendes + intérêts + plus-values ensemble — la case 2OP couvre tout d'un bloc) : PFU ${fmt(parsedProfile.arb2opPfu)} € vs barème ${fmt(parsedProfile.arb2opBareme)} €. Votre option actuelle (${declare === 'bareme' ? 'barème' : 'PFU'}) n'est pas l'optimum.`,
        impact: `Économie estimée : ${fmt(eco)} € en ${versBareme ? 'cochant' : 'décochant'} la case 2OP`,
        impactEuros: eco,
        action: versBareme
          ? 'Cocher la case 2OP lors de la déclaration — l\'option est GLOBALE (dividendes + intérêts + PV), annuelle et irrévocable pour l\'année.'
          : 'Ne pas cocher la case 2OP cette année : le PFU 30 % est plus avantageux sur l\'ensemble de vos revenus du capital.',
        questionChat: `Mon arbitrage 2OP global : PFU ${fmt(parsedProfile.arb2opPfu)} € vs barème ${fmt(parsedProfile.arb2opBareme)} € (économie ${fmt(eco)} € en optant pour ${versBareme ? 'le barème' : 'le PFU'}). Peux-tu vérifier ce choix compte tenu de mon TMI, de l'abattement 40 % sur dividendes, des abattements durée sur PV et de la CSG déductible ?`,
      });
    }
  } else if (_div2DC + _int2TR > 0) {
    const arb = arbitragePfuBareme({
      dividendes: _div2DC, interets: _int2TR,
      rniFoyer: rniFoyer || 0, parts: parts || (isCouple ? 2 : 1), isCouple,
    });
    if (arb.recommande === 'bareme' && arb.economie >= 50) {
      opps.push({
        id: 'arbitrage_pfu_bareme',
        type: 'gain',
        urgence: 'avant_declaration',
        titre: '💡 Option barème avantageuse sur vos revenus du capital',
        description: `Vos dividendes/intérêts (${fmt(_div2DC + _int2TR)} €) seraient moins taxés au barème (${fmt(arb.bareme)} €) qu'au PFU 30 % (${fmt(arb.pfu)} €) — grâce à l'abattement 40 % sur dividendes et à la CSG déductible (6,8 %).`,
        impact: `Économie estimée : ${fmt(arb.economie)} € en optant pour le barème (case 2OP)`,
        impactEuros: arb.economie,
        action: 'Cocher la case 2OP (imposition au barème) lors de la déclaration — attention : l\'option est GLOBALE pour tous les revenus du capital de l\'année et irrévocable.',
        questionChat: `Mes revenus du capital (dividendes ${fmt(_div2DC)} €, intérêts ${fmt(_int2TR)} €) : l'option barème (2OP) semble plus avantageuse que le PFU 30 % (économie ~${fmt(arb.economie)} €). Peux-tu confirmer l'arbitrage compte tenu de mon TMI et m'expliquer l'effet de la CSG déductible l'année suivante ?`,
      });
    }
  }

  // Levier dons : réduction 66 % (75 % aide aux personnes) non exploitée.
  const _donsDeclares = (parsedProfile.donsGeneral || 0) + (parsedProfile.donsAidePersonnes || 0);
  if (_donsDeclares === 0 && irNetEstime > 500) {
    opps.push({
      id: 'levier_dons',
      type: 'gain',
      urgence: 'avant_decembre',
      titre: '💡 Dons : réduction d\'impôt 66 % à 75 %',
      description: 'Aucun don déclaré. Les dons aux associations ouvrent droit à une réduction d\'impôt de 66 % (75 % pour l\'aide aux personnes en difficulté, jusqu\'à 1 000 €). Hors plafond global des niches (10 000 €).',
      impact: 'Ex. : 300 € de dons → 198 € de réduction (ou 225 € à 75 %)',
      impactEuros: 198,
      action: 'Conserver les reçus fiscaux et reporter en 7UD (75 %) / 7UF (66 %). Dons effectués avant le 31/12.',
      questionChat: 'Je souhaite optimiser mes dons. Quelle différence entre les cases 7UD (75 %) et 7UF (66 %), quels organismes ouvrent droit à 75 %, et jusqu\'à quel plafond puis-je donner en gardant l\'avantage fiscal ?',
    });
  }

  // Levier TNS (PHASE 2) : bénéfice micro déclaré → arbitrage micro vs réel
  // + PER individuel déductible du bénéfice. Routage expert-comptable pour le réel.
  const _beneficeTns = parsedProfile.beneficeTnsImposable || 0;
  const _recettesTns = (parsedProfile.recettesTnsD1 || 0) + (parsedProfile.recettesTnsD2 || 0);
  if (_beneficeTns > 0 || _recettesTns > 0) {
    opps.push({
      id: 'levier_tns_micro_reel',
      type: 'info',
      urgence: 'a_etudier',
      titre: '💡 Indépendant : micro vs réel + PER déductible',
      description: 'Au régime micro, l\'abattement forfaitaire remplace vos charges réelles. Si vos charges (local, matériel, sous-traitance) dépassent l\'abattement, le régime réel est plus avantageux. Par ailleurs, un PER individuel est déductible de votre bénéfice (plafond 10 % du bénéfice imposable).',
      impact: 'Variable selon vos charges réelles et votre TMI.',
      impactEuros: 0,
      action: 'Comparer abattement micro vs charges réelles. Pour le régime réel (liasse 2031 BIC / 2035 BNC), faites établir le résultat par un expert-comptable.',
      questionChat: 'Je suis indépendant au régime micro. Comment savoir si je gagnerais à passer au régime réel, et quel montant de PER individuel puis-je déduire de mon bénéfice cette année ?',
    });
  }

  // Levier déficit foncier (PHASE 3) : foncier réel avec déficit imputé / report
  // → optimisation de la concentration des travaux + arbitrage micro vs réel.
  const _foncierDeficitImpute = parsedProfile.foncierDeficitImputeGlobal || 0;
  const _foncierDeficitReporte = parsedProfile.foncierDeficitReporte || 0;
  const _foncierReelNet = parsedProfile.foncierReelNet || 0;
  if (_foncierDeficitImpute > 0 || _foncierDeficitReporte > 0 || _foncierReelNet > 0) {
    opps.push({
      id: 'levier_deficit_foncier',
      type: 'info',
      urgence: 'a_etudier',
      titre: '🏠 Foncier réel : déficit foncier & travaux',
      description: 'Au régime réel (location nue), vos charges et travaux d\'entretien/réparation/amélioration sont déductibles. Un déficit foncier s\'impute sur votre revenu global jusqu\'à 10 700 €/an (21 400 € pour une rénovation énergétique globale), l\'excédent étant reportable 10 ans sur vos revenus fonciers. Les intérêts d\'emprunt ne s\'imputent jamais sur le revenu global.',
      impact: _foncierDeficitImpute > 0
        ? `Déficit imputé sur le revenu global : ${fmt(_foncierDeficitImpute)} €${_foncierDeficitReporte > 0 ? ` · reportable : ${fmt(_foncierDeficitReporte)} €` : ''}.`
        : 'Comparez micro-foncier (abattement 30 %) et régime réel selon vos charges réelles.',
      impactEuros: 0,
      action: 'Concentrer les gros travaux sur une même année pour maximiser le déficit imputable. Ne pas céder le bien dans les 3 ans suivant l\'imputation (sinon reprise).',
      questionChat: 'J\'ai des revenus fonciers au régime réel. Comment optimiser mon déficit foncier (plafond 10 700 €, travaux, intérêts) et dois-je préférer le micro-foncier ou le réel cette année ?',
    });
  }

  // Levier LMNP réel (PHASE 3) : meublé déclaré → amortissements (réel) souvent
  // plus avantageux que le micro-BIC. Routage expert-comptable pour la liasse.
  const _lmnpMicroBenefice = parsedProfile.lmnpMicroBenefice || 0;
  const _lmnpReelNet = parsedProfile.lmnpReelNet || 0;
  if (_lmnpMicroBenefice > 0 || _lmnpReelNet > 0 || parsedProfile.lmnpReelDeficit > 0) {
    opps.push({
      id: 'levier_lmnp_reel',
      type: 'info',
      urgence: 'a_etudier',
      titre: '🛏️ LMNP : micro-BIC vs réel (amortissements)',
      description: 'En location meublée, le régime réel permet d\'amortir le bien, le mobilier et les travaux : le résultat fiscal est souvent nul ou déficitaire pendant des années, contre un abattement micro-BIC de 50 % (ou 30 % pour le tourisme non classé depuis la loi Le Meur). Attention à la bascule LMP si vos recettes meublées dépassent 23 000 € ET 50 % de vos revenus professionnels.',
      impact: 'Variable : l\'amortissement efface souvent l\'imposition des loyers meublés.',
      impactEuros: 0,
      action: 'Comparer abattement micro-BIC vs amortissements au réel. Pour le régime réel (liasse 2031/2033-A), faites établir le résultat par un expert-comptable.',
      questionChat: 'Je loue en meublé (LMNP). Le régime réel avec amortissements serait-il plus avantageux que le micro-BIC, et quel est mon risque de bascule en LMP ?',
    });
  }

  // Levier option barème sur les plus-values (PHASE 4) — TMI faible / titres < 2018.
  const _pvMobGain    = parsedProfile.pvMobGain || 0;
  const _cryptoPvImp  = parsedProfile.cryptoExoneree ? 0 : (parsedProfile.cryptoPvImposable || 0);
  if (_pvMobGain + _cryptoPvImp > 0) {
    const _parts = parts || (isCouple ? 2 : 1);
    const pm = _pvMobGain > 0
      ? calcPvMobiliere({ plusValue: _pvMobGain, rniFoyer: rniFoyer || 0, parts: _parts, isCouple })
      : null;
    const cp = _cryptoPvImp > 0
      ? calcCrypto({ plusValue: _cryptoPvImp, totalCessions: Math.max(_cryptoPvImp, 306), rniFoyer: rniFoyer || 0, parts: _parts, isCouple })
      : null;
    const economie = (pm && pm.recommande === 'bareme' ? pm.economie : 0)
                   + (cp && cp.recommande === 'bareme' ? cp.economie : 0);
    if (economie >= 50) {
      opps.push({
        id: 'levier_option_bareme_pv',
        type: 'gain',
        urgence: 'avant_declaration',
        titre: '💡 Plus-values : l\'option barème (2OP) semble plus avantageuse',
        description: 'Vos plus-values (mobilières/crypto) sont imposées par défaut au PFU 12,8 % d\'IR. À votre tranche marginale, le barème progressif serait moins coûteux. Si vos titres ont été acquis avant 2018, le barème ouvre en plus droit à un abattement pour durée de détention (50 % à 85 %), réservé à l\'IR.',
        impact: `Économie estimée : ${fmt(economie)} € en optant pour le barème (case 2OP).`,
        impactEuros: economie,
        action: 'Cocher la case 2OP lors de la déclaration. ATTENTION : l\'option est GLOBALE pour tous les revenus du capital de l\'année (dividendes, intérêts, plus-values) et irrévocable.',
        questionChat: `Mes plus-values seraient-elles moins taxées au barème (case 2OP) qu'au PFU 12,8 % ? Économie estimée ~${fmt(economie)} €. Peux-tu confirmer compte tenu de mon TMI et m'expliquer l'abattement pour durée de détention si mes titres datent d'avant 2018 ?`,
      });
    }
  }

  // Levier moins-values reportables (PHASE 4) : plus-value déclarée → vérifier le stock
  // de moins-values des 10 années précédentes (3VH), imputables sur les PV de même nature.
  if (_pvMobGain > 0) {
    opps.push({
      id: 'levier_moins_values_reportables',
      type: 'info',
      urgence: 'avant_declaration',
      titre: '📉 Moins-values reportables : pensez à les imputer',
      description: 'Vos moins-values de cession de valeurs mobilières des 10 années précédentes (case 3VH) s\'imputent en priorité sur vos plus-values de même nature de l\'année — avant tout calcul d\'impôt. Une moins-value non reportée est définitivement perdue après 10 ans.',
      impact: 'Chaque 1 000 € de moins-value imputée économise ~128 € d\'IR (PFU) + 172 € de PS.',
      impactEuros: 0,
      action: 'Vérifier vos avis d\'imposition / IFU des 10 dernières années pour retrouver vos moins-values non imputées et les reporter en 3VH.',
      questionChat: 'J\'ai réalisé des plus-values mobilières cette année. Comment retrouver et imputer mes moins-values reportables (3VH) des 10 années précédentes, et dans quel ordre s\'appliquent-elles ?',
    });
  }

  // Levier plus-values immobilières (PHASE 4) : cession d'un bien → exonérations
  // (RP, durée de détention 22 ans IR / 30 ans PS), surtaxe > 50 000 €, routage notaire.
  // Alerte seuil crypto 305 € intégrée.
  const _pvImmoBrute   = parsedProfile.pvImmoBrute || 0;
  const _pvImmoEstim   = parsedProfile.pvImmoEstimation || 0;
  if (_pvImmoBrute > 0 || _pvImmoEstim > 0 || parsedProfile.pvImmoExoneree) {
    opps.push({
      id: 'levier_pv_immo',
      type: 'info',
      urgence: 'a_etudier',
      titre: '🏠 Plus-value immobilière : exonérations & calendrier',
      description: 'La plus-value immobilière (hors résidence principale, totalement exonérée) est imposée à 19 % d\'IR + 17,2 % de PS, prélevés directement par le notaire à la vente. Des abattements pour durée de détention réduisent la base : exonération totale d\'IR à 22 ans, de PS à 30 ans. Une surtaxe de 2 % à 6 % s\'applique au-delà de 50 000 € de plus-value imposable.',
      impact: _pvImmoEstim > 0 ? `Estimation de l'impôt sur la plus-value : ${fmt(_pvImmoEstim)} € (prélevé chez le notaire, hors déclaration annuelle).` : 'Le calendrier de cession peut fortement réduire l\'imposition.',
      impactEuros: 0,
      action: 'Vérifier les conditions d\'exonération (résidence principale, première cession avec remploi) et l\'impact d\'un report de la vente pour franchir un palier d\'abattement. Le calcul définitif est établi par le notaire.',
      questionChat: 'Je vends un bien immobilier. Quelles exonérations puis-je obtenir (résidence principale, durée de détention) et comment réduire la plus-value imposable et l\'éventuelle surtaxe avant de signer chez le notaire ?',
    });
  }

  // Levier plafonnement des niches (PHASE 5) : excédent de réductions perdu.
  const _nicheGlobal     = parsedProfile.reductionsNichesSoumises || 0;
  const _nicheSpecifique = parsedProfile.reductionsNichesSpecifiques || 0;
  if (_nicheGlobal + _nicheSpecifique > 0) {
    const plaf = plafonnementNichesDeuxEtages({ global: _nicheGlobal, specifique: _nicheSpecifique });
    if (plaf.actif && plaf.exces > 0) {
      opps.push({
        id: 'levier_plafonnement_niches',
        type: 'alerte',
        urgence: 'avant_declaration',
        titre: '⚠️ Plafonnement des niches fiscales dépassé',
        description: `Vos réductions soumises au plafonnement global atteignent ${fmt(_nicheGlobal + _nicheSpecifique)} €, au-delà du plafond effectif de ${fmt(plaf.plafondEffectif)} € (10 000 € de base, 18 000 € avec SOFICA/outre-mer). L'excédent n'est ni reportable ni remboursable.`,
        impact: `Avantage fiscal PERDU : ${fmt(plaf.exces)} €.`,
        impactEuros: -plaf.exces,
        action: 'Étaler les investissements défiscalisants sur plusieurs années ou privilégier les dispositifs hors plafond (Malraux, déficit foncier) / la déduction PER.',
        questionChat: `Mes réductions d'impôt dépassent le plafond global des niches (excédent ${fmt(plaf.exces)} € perdu). Comment réorganiser mes investissements (étalement, dispositifs hors plafond, PER) pour ne plus perdre cet avantage ?`,
      });
    }
  }

  // Levier IFI (PHASE 5) : foyer assujetti → optimisation assiette + alerte plafonnement 75 %.
  const _ifiDu = parsedProfile.ifiDu || 0;
  if (_ifiDu > 0) {
    opps.push({
      id: 'levier_ifi',
      type: 'info',
      urgence: 'a_etudier',
      titre: '🏛️ IFI : optimisation de l\'assiette et plafonnement',
      description: `Votre patrimoine immobilier net (${fmt(parsedProfile.ifiAssiette || 0)} €) dépasse le seuil de 1,3 M€ : IFI estimé ${fmt(_ifiDu)} €. L'assiette bénéficie de l'abattement 30 % sur la résidence principale et de la déduction du passif (emprunts au 1er janvier).`,
      impact: `IFI estimé : ${fmt(_ifiDu)} € (avis distinct de l'IR).`,
      impactEuros: 0,
      action: 'Vérifier le passif déductible, l\'exonération des biens professionnels (outil de travail) et le plafonnement IFI à 75 % des revenus. Démembrement / dons / nue-propriété → CGP et notaire.',
      questionChat: 'Je suis redevable de l\'IFI. Comment réduire légalement mon assiette (passif déductible, biens professionnels, démembrement) et le plafonnement à 75 % des revenus joue-t-il dans mon cas ?',
    });
  }

  // Alerte Pinel/Denormandie/Censi-Bouvard fermé : réduction en report mais dispositif clos.
  if (parsedProfile.defiscFerme) {
    opps.push({
      id: 'levier_defisc_ferme',
      type: 'info',
      urgence: 'a_etudier',
      titre: 'ℹ️ Dispositif de défiscalisation fermé aux nouvelles acquisitions',
      description: 'L\'un de vos dispositifs (Pinel/Denormandie depuis le 31/12/2024, Censi-Bouvard depuis le 31/12/2022) est fermé aux nouvelles acquisitions. Seules les réductions des engagements antérieurs continuent à courir (report annuel jusqu\'au terme de l\'engagement).',
      impact: 'Aucune nouvelle souscription possible ; anticiper la fin de la réduction.',
      impactEuros: 0,
      action: 'Anticiper la sortie : à l\'échéance Pinel, arbitrer entre conservation, revente ou passage en location nue/meublée. Pour Censi-Bouvard, bascule possible en LMNP réel.',
      questionChat: 'Mon dispositif Pinel/Censi-Bouvard arrive à son terme. Quelles options (revente, conservation, bascule LMNP) et quel impact fiscal à la sortie ?',
    });
  }

  // Levier international (PHASE 6) : taux effectif / crédit d'impôt étranger appliqués.
  const _revEtrTE = parsedProfile.revEtrTauxEffectif || 0;
  const _credit8TK = parsedProfile.creditImpotEtranger8TK || 0;
  if (_revEtrTE > 0 || _credit8TK > 0) {
    opps.push({
      id: 'levier_international',
      type: 'info',
      urgence: 'avant_declaration',
      titre: '🌍 Revenus étrangers : méthode conventionnelle appliquée',
      description: `Vos revenus de source étrangère sont traités selon la convention bilatérale : ${_revEtrTE > 0 ? `taux effectif (revenu exonéré ${fmt(_revEtrTE)} € retenu pour le taux moyen)` : ''}${_revEtrTE > 0 && _credit8TK > 0 ? ' ; ' : ''}${_credit8TK > 0 ? `crédit d'impôt étranger ${fmt(_credit8TK)} € (8TK, plafonné à l'impôt français correspondant)` : ''}.`,
      impact: 'Déclaration via le formulaire 2047. Vérifier la convention France–pays de source.',
      impactEuros: 0,
      action: 'Reporter les revenus étrangers sur la 2047 puis les cases dédiées de la 2042 (8TI taux effectif / 8TK crédit d\'impôt). Conserver les justificatifs d\'impôt payé à l\'étranger.',
      questionChat: 'J\'ai des revenus de source étrangère. Peux-tu m\'expliquer comment les déclarer (2047, cases 8TI/8TK), quelle méthode s\'applique selon la convention, et vérifier mon calcul de taux effectif ?',
    });
  }

  // Alerte routage international (PHASE 6) : non-résident / impatrié / exit tax → avocat fiscaliste.
  if (parsedProfile.intlRoutage) {
    opps.push({
      id: 'levier_routage_international',
      type: 'alerte',
      urgence: 'a_etudier',
      titre: '⚠️ Situation internationale complexe → avocat fiscaliste',
      description: 'Votre situation (non-résident, impatrié ou transfert de domicile/exit tax) relève de règles conventionnelles complexes : taux minimum des non-résidents (art. 197 A), exonération d\'impatriation (art. 155 B) ou imposition des plus-values latentes (exit tax, art. 167 bis). Ces régimes ne sont pas automatisés.',
      impact: 'Enjeux potentiellement importants — un calcul approximatif serait risqué.',
      impactEuros: 0,
      action: 'Consulter un avocat fiscaliste spécialisé en fiscalité internationale pour sécuriser votre déclaration et optimiser votre situation conventionnelle.',
      questionChat: 'Ma situation est internationale (non-résident / impatrié / exit tax). Quels sont les points de vigilance et pourquoi un avocat fiscaliste est-il recommandé ?',
    });
  }

  // Épargne liquide mal rémunérée : total > 10 000 €
  // Plan de réallocation détaillé étape par étape avec gain annuel estimé.
  if (livretTotal > 10_000) {
    const livretPlusTotal = (livretPlusD1 || 0) + (livretPlusD2 || 0);
    const lddsTotal       = lddsD1 + lddsD2;
    const lepTotal        = lepD1 + lepD2;
    const livretATotal    = livretAD1 + livretAD2;

    const detail = [
      livretATotal    > 0 ? `Livret A ${fmt(livretATotal)} €`           : null,
      lddsTotal       > 0 ? `LDDS ${fmt(lddsTotal)} €`                  : null,
      lepTotal        > 0 ? `LEP ${fmt(lepTotal)} €`                    : null,
      livretPlusTotal > 0 ? `Livret bancaire ${fmt(livretPlusTotal)} €` : null,
    ].filter(Boolean).join(' · ');

    // Plafonds par déclarant
    const NB = isCouple ? 2 : 1;
    const PLAF_LDDS = PLAFOND_LDDS * NB;
    const PLAF_LEP  = PLAFOND_LEP * NB;
    const liquidityFloor = isCouple ? 24_000 : 12_000; // 3-6 mois de charges

    const excess = Math.max(0, livretTotal - liquidityFloor);
    const plafondLEPRfr = isCouple ? 34_393 : 22_419;
    const eligibleLEP = rfr > 0 && rfr <= plafondLEPRfr;

    // Construction du plan
    const plan = [];
    let remaining = excess;
    let gainTotal = 0;

    const lddsRoom = Math.max(0, PLAF_LDDS - lddsTotal);
    if (lddsRoom > 0 && remaining > 1_000) {
      const move = Math.min(lddsRoom, remaining);
      const gain = Math.round(move * GAIN_DIFF_LDDS);
      plan.push(`Saturer LDDS (${fmt(move)} €) — gain +${fmt(gain)} €/an (taux 3 % vs ~1,5 %)`);
      remaining -= move; gainTotal += gain;
    }
    if (eligibleLEP) {
      const lepRoom = Math.max(0, PLAF_LEP - lepTotal);
      if (lepRoom > 0 && remaining > 1_000) {
        const move = Math.min(lepRoom, remaining);
        const gain = Math.round(move * GAIN_DIFF_LEP);
        plan.push(`Saturer LEP (${fmt(move)} €) — gain +${fmt(gain)} €/an (taux ~5 %, meilleur taux garanti)`);
        remaining -= move; gainTotal += gain;
      }
    }
    if (remaining > 5_000) {
      const move = Math.min(remaining, 30_000);
      const gain = Math.round(move * GAIN_DIFF_AV_LT);
      const avExists = (avD1 || 0) + (avD2 || 0) > 0;
      plan.push(`${avExists ? 'Renforcer' : 'Ouvrir'} AV multisupport (${fmt(move)} €) — gain +${fmt(gain)} €/an espéré LT (rendement ~4 % net)`);
      remaining -= move; gainTotal += gain;
    }
    if (remaining > 5_000) {
      const move = Math.min(remaining, 20_000);
      const gain = Math.round(move * GAIN_DIFF_PEA_LT);
      const peaExists = (peaD1 || 0) + (peaD2 || 0) > 0;
      plan.push(`${peaExists ? 'Renforcer' : 'Ouvrir'} PEA (${fmt(move)} €) — gain +${fmt(gain)} €/an espéré LT (ETF Monde ~6 %, exo IR > 5 ans)`);
      remaining -= move; gainTotal += gain;
    }
    if (remaining > 5_000) {
      const gain = Math.round(remaining * GAIN_DIFF_DEFAUT);
      plan.push(`Surplus ${fmt(remaining)} € → AV/PEA selon profil de risque — gain +${fmt(gain)} €/an`);
      gainTotal += gain;
    }

    const planLine = plan.length > 0 ? ` Plan : ${plan.join(' ; ')}.` : '';
    const lepNote = !eligibleLEP && livretTotal > 20_000 ? ' (Non éligible LEP : RFR au-dessus du seuil.)' : '';
    const noteRendement = livretPlusTotal > 10_000
      ? ` ${fmt(livretPlusTotal)} € sur Livret+/bancaire à ~1,5 % net = manque à gagner direct.`
      : '';

    opps.push({
      id: 'epargne_mal_remuneree',
      type: 'gain',
      urgence: 'long_terme',
      titre: '💡 Plan de réallocation épargne liquide',
      description: `${fmt(livretTotal)} € d'épargne disponible${detail ? ` (${detail})` : ''}.${noteRendement} Coussin de précaution conservé : ~${fmt(liquidityFloor)} € (3-6 mois de charges). À réallouer : ${fmt(excess)} €.${lepNote}${planLine}`,
      impact: `Gain annuel récurrent espéré : +${fmt(gainTotal)} €/an`,
      impactEuros: gainTotal,
      action: plan.length > 0
        ? plan.map((p, i) => `${i + 1}. ${p}`).join(' | ')
        : 'Identifier le surplus au-delà de 3-6 mois de charges, puis alimenter LDDS/LEP saturés, AV, PEA',
      questionChat: isCouple
        ? `Mon foyer (couple) a ${fmt(livretTotal)} € d'épargne liquide${livretPlusTotal > 0 ? `, dont ${fmt(livretPlusTotal)} € sur Livret+/bancaire à ~1,5 % net` : ''}. Plan de réallocation proposé : ${plan.join(' / ')}. Quel ordre exécuter, quels supports AV/PEA choisir, lump sum ou DCA, et comment équilibrer entre D1 et D2 ?`
        : `J'ai ${fmt(livretTotal)} € d'épargne liquide${livretPlusTotal > 0 ? `, dont ${fmt(livretPlusTotal)} € sur Livret+/bancaire à ~1,5 % net` : ''}. Plan de réallocation proposé : ${plan.join(' / ')}. Peux-tu valider l'ordre, suggérer des supports AV/PEA concrets, et comparer lump sum vs DCA ?`,
    });
  }

  // Décision PEL — fiscalité bascule à l'échéance des 12 ans
  const pelTotal = (pelD1 || 0) + (pelD2 || 0);
  if (pelTotal > 0) {
    const analyses = [];
    [['D1', pelD1, pelDateD1], ['D2', pelD2, pelDateD2]].forEach(([sfx, solde, date]) => {
      if (!solde || !date) return;
      // Parse MM/AAAA ou YYYY
      let year = null, month = 1;
      if (/^\d{2}\/\d{4}$/.test(date)) { const [m, y] = date.split('/').map(Number); month = m; year = y; }
      else if (/^\d{4}$/.test(date))   { year = Number(date); }
      if (!year) return;
      const nowY = new Date().getFullYear();
      if (year < 2011 || (year === 2011 && month < 3)) {
        analyses.push({ sfx, solde, msg: `PEL ${sfx} (${fmt(solde)} €, ouvert ${date}) : exo IR à vie — à conserver.` });
      } else if (year <= 2017) {
        const exoEnd = year + 12;
        if (nowY < exoEnd) {
          analyses.push({ sfx, solde, decision: true,
            msg: `PEL ${sfx} (${fmt(solde)} €, ouvert ${date}) : exo IR jusqu'en ${exoEnd}. Décision à prendre fin ${exoEnd - 1} — conserver comme matelas garanti, ou basculer vers AV/PEA avant la bascule en PFU 30 %.` });
        } else {
          analyses.push({ sfx, solde, decision: true,
            msg: `⚠️ PEL ${sfx} (${fmt(solde)} €, ouvert ${date}) : exo IR échue depuis ${nowY - exoEnd} an(s). Intérêts désormais imposés au PFU 30 % → rendement net dégradé. Envisager une réallocation vers AV/PEA.` });
        }
      } else {
        analyses.push({ sfx, solde,
          msg: `PEL ${sfx} (${fmt(solde)} €, ouvert ${date}) : PFU 30 % dès l'origine (post-2018). Utile uniquement pour le prêt PEL à taux figé — sinon réallouer.` });
      }
    });
    if (analyses.length > 0 && analyses.some(a => a.decision)) {
      opps.push({
        id: 'pel_decision',
        type: 'action',
        urgence: 'long_terme',
        titre: '🔵 PEL — décision à prendre avant l\'échéance des 12 ans',
        description: analyses.map(a => a.msg).join(' '),
        impact: 'Préserver le rendement net avant la bascule au PFU 30 %',
        impactEuros: Math.round(pelTotal * 0.0075), // perte fiscale annuelle si conservé après échéance : ~0,75% (PFU sur 2,5% = 0,75 € manqué/100 € capital)
        action: 'Arbitrer fin de l\'avant-dernière année : conserver le PEL comme matelas garanti, ou clôturer pour basculer vers AV multisupport (fiscalité plus douce après 8 ans, meilleur rendement LT)',
        questionChat: `J'ai un PEL : ${analyses.map(a => a.msg).join(' ')} Faut-il conserver ce PEL jusqu'à l'échéance des 12 ans, clôturer avant, ou basculer le capital vers AV multisupport ? Compare le rendement net après la bascule PFU avec une AV bien gérée.`,
      });
    }
  }

  // PEA non ouvert
  if (!hasPEA) {
    opps.push({
      id: 'pea_non_ouvert',
      type: 'gain',
      urgence: 'long_terme',
      titre: '💡 PEA non ouvert — horloge fiscale non démarrée',
      description: isCouple
        ? 'Aucun PEA détecté pour votre foyer. Chacun peut ouvrir son propre PEA (plafond 150 000 €/personne, soit 300 000 € pour votre couple). Exonération totale d\'IR sur les plus-values après 5 ans.'
        : 'Le PEA offre une exonération totale d\'IR sur les plus-values après 5 ans. Chaque jour sans PEA retarde votre date d\'exonération.',
      impact: isCouple
        ? 'Exonération IR sur les plus-values, plafond 300 000 € (150 000 € × 2)'
        : 'Exonération IR sur toutes les plus-values après 5 ans',
      impactEuros: 500,
      action: isCouple
        ? 'Ouvrir un PEA chacun (même avec 1 €) pour faire partir le délai de 5 ans dès maintenant'
        : 'Ouvrir un PEA même avec 1 € pour faire partir le délai de 5 ans',
      questionChat: isCouple
        ? 'Mon couple n\'a pas encore de PEA. Peut-on ouvrir un PEA chacun et cumuler les plafonds (150 000 € × 2 = 300 000 €) ? Quels courtiers recommander pour un couple en 2025 et comment organiser nos placements entre les deux PEA ?'
        : 'Je n\'ai pas encore de PEA. Quelle banque ou quel courtier recommander pour ouvrir un PEA en 2025, et quels points de vigilance lors de l\'ouverture ?',
    });
  }

  // LEP accessible : RFR éligible et LEP non ouvert
  if (!hasLEP && rfr > 0) {
    const plafondRFR = isPacseOuMarie ? 34_393 : 22_419;
    if (rfr <= plafondRFR) {
      opps.push({
        id: 'lep_non_ouvert',
        type: 'gain',
        urgence: 'avant_decembre',
        titre: '💡 LEP accessible — meilleur taux garanti de France',
        description: isCouple
          ? `Avec un RFR de ${fmt(rfr)} €, votre foyer est éligible au LEP (taux 5 % vs Livret A 3 %). Chacun peut ouvrir son propre LEP (plafond 10 000 €/personne, soit 20 000 € pour votre couple).`
          : `Avec un RFR de ${fmt(rfr)} €, vous êtes éligible au Livret d'Épargne Populaire (taux 5 % vs Livret A à 3 %). Plafond de dépôt : 10 000 €.`,
        impact: isCouple
          ? 'Gain : taux 5 % vs 3 % — soit +400 €/an pour 20 000 € (2 LEP)'
          : 'Gain : taux 5 % vs Livret A 3 % — soit +200 €/an pour 10 000 €',
        impactEuros: isCouple ? 400 : 200,
        action: isCouple
          ? 'Ouvrir un LEP chacun (La Banque Postale, Caisse d\'Épargne…) — plafond 10 000 €/personne'
          : 'Ouvrir un LEP à La Banque Postale, Caisse d\'Épargne ou votre banque',
        questionChat: isCouple
          ? `Notre foyer (RFR ${fmt(rfr)} €) est éligible au LEP. Peut-on ouvrir un LEP chacun pour cumuler 20 000 € au taux de 5 % ? Comment vérifier l'éligibilité de chaque membre du couple et où ouvrir nos LEP ?`
          : `Mon RFR est de ${fmt(rfr)} €. Suis-je éligible au LEP et comment l'ouvrir pour bénéficier du taux de 5 % ?`,
      });
    }
  }

  // ── RISQUES ────────────────────────────────────────────────────────────────

  // Crypto sans déclaration 3916 bis
  if (hasCrypto) {
    opps.push({
      id: 'crypto_3916bis',
      type: 'risque',
      urgence: 'immediate',
      titre: '🔴 Obligation déclarative crypto à vérifier',
      description: `Tout exchange étranger (Binance, Kraken, Coinbase…) doit être déclaré via le formulaire 3916 bis, même sans cession taxable.${cryptoTotal > 305 ? ` Portefeuille détecté : ${fmt(cryptoTotal)} €.` : ''}`,
      impact: 'Amende : 1 500 € par compte non déclaré',
      impactEuros: 1500,
      action: 'Déclarer chaque exchange via le formulaire 3916 bis sur impots.gouv',
      questionChat: 'J\'ai des comptes sur des exchanges crypto étrangers. Comment remplir les formulaires 3916 bis et quelles informations dois-je renseigner pour chaque exchange ?',
    });
  }

  // Pacsé sans testament
  if (hasTestamentManquant) {
    opps.push({
      id: 'pacse_sans_testament',
      type: 'risque',
      urgence: 'long_terme',
      titre: '🔴 Testament manquant — partenaire non protégé',
      description: 'Le partenaire de PACS n\'hérite pas automatiquement en l\'absence de testament. Les biens reviennent aux héritiers légaux (parents, fratrie).',
      impact: 'En cas de décès, votre partenaire n\'hérite pas automatiquement',
      impactEuros: 800,
      action: 'Rédiger un testament chez un notaire pour protéger votre partenaire',
      questionChat: 'Je suis pacsé(e) sans testament. Quelle est la différence entre PACS et mariage en matière de succession, et comment protéger efficacement mon partenaire ?',
    });
  }

  // Indivision non sécurisée
  if (hasIndivision) {
    opps.push({
      id: 'indivision_non_securisee',
      type: 'risque',
      urgence: 'long_terme',
      titre: '🟠 Indivision non sécurisée',
      description: 'Une indivision sans convention peut bloquer la gestion du bien : ventes, travaux et locations nécessitent l\'accord unanime de tous les indivisaires.',
      impact: 'Risque de blocage et conflits entre indivisaires',
      impactEuros: 600,
      action: 'Consulter un notaire pour rédiger une convention d\'indivision',
      questionChat: 'Je suis en indivision sur un bien immobilier. Quels sont les risques et comment une convention d\'indivision peut-elle sécuriser notre situation ?',
    });
  }

  // PAS insuffisant : on compare le PAS total versé au total dû estimé.
  // On n'utilise PAS le TMI — le TMI (taux marginal) est toujours bien supérieur
  // au taux effectif, surtout quand on est juste au-dessus d'un seuil de tranche.
  // Critère : complément estimé > 500 € (risque concret de solde en septembre).
  if (complementEstime > 500 && pasTot > 0) {
    opps.push({
      id: 'taux_pas_trop_bas',
      type: 'risque',
      urgence: 'avant_decembre',
      titre: '🟠 PAS insuffisant — complément prévisible',
      description: `PAS versé : ${fmt(pasTot)} € — IR estimé : ${fmt(totalDuEstime)} € (taux effectif ${tauxEffectif} %). Complément à payer en septembre : ~${fmt(complementEstime)} €.`,
      impact: `Risque de solde à payer en septembre : ~${fmt(complementEstime)} €`,
      impactEuros: complementEstime,
      action: 'Augmenter votre taux PAS sur impots.gouv → Gérer mon prélèvement à la source',
      questionChat: isCouple
        ? `Mon foyer (couple) a un taux effectif d'imposition de ${tauxEffectif} %. PAS versé au total : ${fmt(pasTot)} €${pasD1 && pasD2 ? ` (D1 : ${fmt(pasD1)} €, D2 : ${fmt(pasD2)} €)` : ''}, IR estimé : ${fmt(totalDuEstime)} €. Complément à payer en septembre : ~${fmt(complementEstime)} €. Comment ajuster nos taux PAS individuels pour chaque déclarant ?`
        : `Mon taux effectif d'imposition est de ${tauxEffectif} % mais mon PAS verse seulement ${fmt(pasTot)} € contre un IR estimé à ${fmt(totalDuEstime)} €. Comment ajuster mon prélèvement pour éviter ${fmt(complementEstime)} € de complément en septembre ?`,
    });
  }

  // ── ACTIONS ────────────────────────────────────────────────────────────────

  // Remboursement IR prévu
  if (remboursement > 0) {
    opps.push({
      id: 'remboursement_ir',
      type: 'action',
      urgence: 'long_terme',
      titre: `🔵 Remboursement IR prévu : ${fmt(remboursement)} €`,
      description: 'Un remboursement d\'impôt sur le revenu est détecté dans votre profil. Il sera versé en juillet-septembre après traitement de votre déclaration.',
      impact: `Remboursement attendu : ${fmt(remboursement)} €`,
      impactEuros: remboursement,
      action: 'Vérifier que votre RIB est à jour sur impots.gouv avant le remboursement',
      questionChat: `J'attends un remboursement IR de ${fmt(remboursement)} €. Quand sera-t-il versé et comment m'assurer que mon RIB est bien enregistré sur impots.gouv ?`,
    });
  }

  return opps.sort((a, b) => b.impactEuros - a.impactEuros);
}
