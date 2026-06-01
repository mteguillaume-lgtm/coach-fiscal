/**
 * Calculs IR — source de vérité unique : les JSON du skill fiscaliste.
 *
 * MISE À JOUR ANNUELLE : modifier uniquement les fichiers JSON dans
 *   src/data/paperasse/fiscaliste/data/
 * → bareme-ir-XXXX.json   (tranches, décote, abattements)
 * → per-plafonds.json      (PASS, plafonds PER)
 *
 * Ce fichier importe et parse ces JSON → aucune valeur hardcodée ici.
 * Le chat Claude utilise les mêmes JSON via skillsLoader.js.
 */

import perRaw            from '../data/paperasse/fiscaliste/data/per-plafonds.json';
import pfuRaw            from '../data/paperasse/fiscaliste/data/pfu-prelevements-sociaux.json';
import nichesRaw         from '../data/paperasse/fiscaliste/data/niches-fiscales.json';
import fonciersRaw       from '../data/paperasse/fiscaliste/data/regimes-fonciers-lmnp.json';
import hsSuppRaw         from '../data/paperasse/fiscaliste/data/heures-supplementaires-ppv.json';
import apprentissageRaw  from '../data/paperasse/fiscaliste/data/apprentissage.json';
import baremeKmRaw       from '../data/paperasse/fiscaliste/data/bareme-kilometrique-2025.json';

// Auto-sélection du barème le plus récent dans le répertoire.
// Pour ajouter un millésime : déposer bareme-ir-YYYY.json dans le même dossier.
// Aucune autre modification de code nécessaire.
const _baremeFiles = import.meta.glob(
  '../data/paperasse/fiscaliste/data/bareme-ir-*.json',
  { eager: true },
);
const baremeRaw = (() => {
  let latestYear = 0;
  let latest = null;
  for (const [path, mod] of Object.entries(_baremeFiles)) {
    const m = path.match(/bareme-ir-(\d{4})\.json$/);
    if (m) {
      const year = parseInt(m[1]);
      if (year > latestYear) { latestYear = year; latest = mod.default ?? mod; }
    }
  }
  if (!latest) throw new Error('[taxCalculator] Aucun fichier bareme-ir-YYYY.json trouvé.');
  return latest;
})();

// ─── Parse tranches depuis le format JSON du skill ────────────────────────────
// Formats possibles dans le JSON :
//   { "jusqu_a": 11600, "taux": 0.00 }          → [0, 11600, 0]
//   { "de": 11600, "a": 29579, "taux": 0.11 }   → [11600, 29579, 0.11]
//   { "au_dela": 181917, "taux": 0.45 }          → [181917, Infinity, 0.45]

const TRANCHES = baremeRaw.bareme_ir.tranches.map(t => [
  t.jusqu_a !== undefined ? 0      : (t.au_dela ?? t.de ?? 0),
  t.jusqu_a !== undefined ? t.jusqu_a : (t.a ?? Infinity),
  t.taux,
]);

// ─── Décote (depuis le JSON) ───────────────────────────────────────────────────

const DECOTE = baremeRaw.decote;

// ─── Abattement 10% salaires (depuis le JSON) ─────────────────────────────────

const ABT = baremeRaw.abattement_salaires_10pct;

// Abattement 10% pensions/retraites (cases 1AS/1BS) — art. 158-5-a CGI
// Paramètres distincts : min 450 €, max 4 446 € (vs min 509 / max 14 555 € pour salaires)
export const ABT_PENSION = baremeRaw.abattement_pensions_10pct ?? { taux: 0.10, minimum: 450, maximum: 4446 };

// ─── Exports pour affichage (Rapport.jsx) ────────────────────────────────────

export const QF_PLAFONDS = baremeRaw.quotient_familial;
export { TRANCHES, DECOTE, ABT };

// ─── Règles de parts (depuis le JSON — art. 194-195 CGI) ──────────────────────
// Aucun increment de part en dur : tout est lu dans quotient_familial.parts.
export const QF_PARTS = baremeRaw.quotient_familial.parts;

// ─── Plafonnement global des niches fiscales (depuis le JSON) ─────────────────
export const PLAFOND_NICHES_METROPOLE = nichesRaw.plafonnement_global.plafond_metropole;
export const PLAFOND_NICHES_OUTRE_MER = nichesRaw.plafonnement_global.plafond_investissements_outre_mer;

// ─── PASS et plafonds PER (depuis le JSON) ────────────────────────────────────

export const PASS_2025       = perRaw._meta.pass_2025;
export const MIN_PLAFOND_PER = perRaw.per_individuel.plancher_euros;
export const MAX_PLAFOND_PER = perRaw.per_individuel.plafond_absolu_euros;

// ─── Prélèvements sociaux et régimes fonciers (depuis les JSON) ───────────────

export const TAUX_PS_CAPITAL          = pfuRaw.prelevements_sociaux.taux_revenus_capital;
export const SEUIL_MICRO_FONCIER      = fonciersRaw.micro_foncier.seuil_recettes_brutes;
export const ABATTEMENT_MICRO_FONCIER = fonciersRaw.micro_foncier.abattement;

// ─── Heures supplémentaires défiscalisées + PPV (depuis le JSON) ──────────────

export const PLAFOND_HEURES_SUPP      = hsSuppRaw.heures_supplementaires_defiscalisees.plafond_annuel_par_declarant;
export const PLAFOND_PPV_SANS_ACCORD  = hsSuppRaw.prime_partage_valeur.plafond_sans_accord;
export const PLAFOND_PPV_AVEC_ACCORD  = hsSuppRaw.prime_partage_valeur.plafond_avec_accord;
export const SEUIL_3_SMIC_2025        = hsSuppRaw.prime_partage_valeur.seuil_remuneration_exoneration_IR.seuil_3_smic_2025;

// ─── Apprentissage / Stage (depuis le JSON) ───────────────────────────────────

export const PLAFOND_APPRENTISSAGE_IR = apprentissageRaw.apprentissage.exoneration_IR.plafond_2025;

// ─── Licenciement — plafond exonération (5 × PASS) ───────────────────────────

export const PLAFOND_LICENCIEMENT_MAX = 5 * perRaw._meta.pass_2025;

// ─── Barème kilométrique (depuis le JSON BOFiP) ────────────────────────────────

export const BAREME_KILOMETRIQUE     = baremeKmRaw.bareme_voitures_thermiques.tranches;
export const MAJORATION_ELECTRIQUE_KM = baremeKmRaw.bareme_voitures_thermiques.majoration_electrique.taux;

/**
 * Calcule les frais kilométriques (voiture thermique ou électrique).
 * Source : BOFiP BOI-BAREME-000001 + art. 6 B annexe IV CGI.
 *
 * @param {number}  distance   - Distance annuelle totale (aller + retour) en km
 * @param {number}  cv         - Puissance fiscale (≤ 3 → 3CV, 4, 5, 6, ≥ 7)
 * @param {boolean} [electrique=false] - Véhicule 100 % électrique → majoration +20 %
 * @returns {number} Montant arrondi en €
 */
export function calculFraisKilometriques(distance, cv, electrique = false) {
  if (!distance || distance <= 0 || !cv || cv <= 0) return 0;
  const key = cv <= 3 ? '3_cv_et_moins'
    : cv === 4 ? '4_cv'
    : cv === 5 ? '5_cv'
    : cv === 6 ? '6_cv'
    : '7_cv_et_plus';
  const t = BAREME_KILOMETRIQUE[key];
  let montant;
  if (distance <= 5000) {
    montant = distance * t['0_a_5000_km'].coefficient;
  } else if (distance <= 20000) {
    montant = distance * t['5001_a_20000_km'].coefficient + t['5001_a_20000_km'].constante;
  } else {
    montant = distance * t['au_dela_20000_km'].coefficient;
  }
  if (electrique) montant *= (1 + MAJORATION_ELECTRIQUE_KM);
  return Math.round(montant);
}

// ─── Abattement 10% sur salaires ──────────────────────────────────────────────

/** Applique l'abattement forfaitaire 10% sur salaire net imposable (1AJ). */
export function abattement10(salaire) {
  if (!salaire || salaire <= 0) return 0;
  const a = salaire * ABT.taux;
  return Math.round(salaire - Math.min(Math.max(a, ABT.minimum), ABT.maximum));
}

/**
 * Abattement 10% sur pension/retraite (cases 1AS/1BS).
 * Min 450 €, max 4 446 € par foyer — art. 158-5-a CGI.
 * @returns {number} RNI après abattement pension
 */
export function abattement10Pension(pension) {
  if (!pension || pension <= 0) return 0;
  const a = pension * ABT_PENSION.taux;
  return Math.round(pension - Math.min(Math.max(a, ABT_PENSION.minimum), ABT_PENSION.maximum));
}

/**
 * Abattement 10% automatique selon le type de revenu.
 * @param {number}  montant
 * @param {'salaire'|'pension'|'mixte'} type
 * @param {number}  [pensionPart=0]  part pension si type='mixte' (reste = salaire)
 * @returns {number} RNI après abattement
 */
export function abattement10Auto(montant, type = 'salaire', pensionPart = 0) {
  if (!montant || montant <= 0) return 0;
  if (type === 'pension') return abattement10Pension(montant);
  if (type === 'mixte' && pensionPart > 0) {
    const salairePart = Math.max(0, montant - pensionPart);
    return abattement10(salairePart) + abattement10Pension(pensionPart);
  }
  return abattement10(montant);
}

// ─── Parts fiscales (quotient familial) ──────────────────────────────────────

/**
 * Dérive le nombre de parts fiscales depuis la composition du foyer.
 * Source unique : QF_PARTS (bareme-ir-YYYY.json → quotient_familial.parts),
 * art. 194-195 CGI. Aucun increment de part codé en dur.
 *
 * Renvoie aussi le détail des demi-parts supplémentaires par catégorie, pour
 * alimenter plafonnementQF (chaque catégorie a son propre plafond d'avantage).
 *
 * @param {object} sit
 * @param {boolean} [sit.isCouple=false]      - mariés/pacsés (imposition commune)
 * @param {boolean} [sit.veuf=false]          - veuf/veuve (avec enfant → base 2)
 * @param {number}  [sit.nbEnfants=0]         - enfants à charge en résidence principale (hors alternée)
 * @param {number}  [sit.nbEnfantsAlternes=0] - enfants en résidence alternée
 * @param {number}  [sit.nbEnfantsInvalides=0]- enfants titulaires CMI-invalidité (parmi les enfants à charge)
 * @param {boolean} [sit.parentIsole=false]   - case T (parent isolé, ≥ 1 enfant)
 * @param {number}  [sit.nbDemiPartsInvalidite=0] - demi-parts invalidité déclarant/conjoint (cases P/F/G/S/W)
 * @param {number}  [sit.nbEnfantsRattaches=0]    - enfants majeurs rattachés (comptés comme enfants à charge)
 * @returns {{
 *   parts: number, partsBase: number,
 *   nbDemiPartsClassiques: number, nbDemiPartsT: number,
 *   nbDemiPartsInvalidite: number, nbDemiPartsL: number,
 *   detail: object,
 * }}
 */
export function calcParts(sit = {}) {
  const q = QF_PARTS;
  const isCouple = !!sit.isCouple;
  const veuf     = !!sit.veuf;

  // Total des enfants comptés pour le rang (résidence principale + rattachés + alternés).
  // Les enfants en résidence alternée comptent pour le rang mais à valeur réduite (×0,5).
  const nbPlein    = (sit.nbEnfants || 0) + (sit.nbEnfantsRattaches || 0);
  const nbAlternes = sit.nbEnfantsAlternes || 0;
  const nbInvalEnf = Math.min(sit.nbEnfantsInvalides || 0, nbPlein + nbAlternes);

  const partsBase = isCouple ? q.base_marie_pacse
                  : veuf && (nbPlein + nbAlternes) > 0 ? q.base_marie_pacse
                  : q.base_celibataire_divorce_separe;

  // Majoration par rang d'enfant. Les enfants en résidence alternée occupent les
  // derniers rangs à valeur ×facteur_residence_alternee.
  const rangValue = (rang) =>
    rang <= 1 ? q.majoration_enfant_rang_1
    : rang === 2 ? q.majoration_enfant_rang_2
    : q.majoration_enfant_rang_3_et_plus;

  let majEnfantsPlein = 0;
  for (let r = 1; r <= nbPlein; r++) majEnfantsPlein += rangValue(r);
  let majEnfantsAlternes = 0;
  for (let r = nbPlein + 1; r <= nbPlein + nbAlternes; r++) {
    majEnfantsAlternes += rangValue(r) * q.facteur_residence_alternee;
  }

  // Case T (parent isolé) : +0,5 part → le 1er enfant devient une part entière.
  // Cette part entière (2 demi-parts) relève du plafond « parent isolé » (4 262 €).
  const totalEnfants = nbPlein + nbAlternes;
  const parentIsole  = !!sit.parentIsole && totalEnfants > 0;
  const majParentIsole = parentIsole ? q.majoration_parent_isole_case_T : 0;
  // 2 demi-parts T (la part entière du 1er enfant) si parent isolé.
  const nbDemiPartsT = parentIsole ? 2 : 0;

  // Invalidité enfant : +0,5 part par enfant invalide (demi-parts à plafond invalidité).
  const majEnfantsInvalides = nbInvalEnf * q.majoration_enfant_invalide;
  // Invalidité déclarant/conjoint : demi-parts directes (cases P/F/G/S/W).
  const nbDemiPartsInvaliditeDirect = sit.nbDemiPartsInvalidite || 0;
  const nbDemiPartsInvalidite = Math.round((nbInvalEnf * 1 + nbDemiPartsInvaliditeDirect) * 100) / 100;

  const parts = Math.round(
    (partsBase + (majEnfantsPlein + majEnfantsAlternes) + majParentIsole
     + majEnfantsInvalides + nbDemiPartsInvaliditeDirect * 0.5) * 100,
  ) / 100;

  // Demi-parts « classiques » = reliquat des demi-parts supplémentaires une fois
  // retirées les catégories à plafond propre (T, invalidité, L). Cohérent avec le
  // recalcul interne de plafonnementQF.
  const totalSuppDemiParts = Math.round((parts - partsBase) * 2 * 100) / 100;
  const nbDemiPartsClassiquesNet = Math.max(0, totalSuppDemiParts - nbDemiPartsT - nbDemiPartsInvalidite);

  return {
    parts,
    partsBase,
    nbDemiPartsClassiques: nbDemiPartsClassiquesNet,
    nbDemiPartsT,
    nbDemiPartsInvalidite,
    nbDemiPartsL: 0,
    detail: {
      isCouple, veuf, nbPlein, nbAlternes, nbInvalEnf, parentIsole,
      majEnfantsPlein, majEnfantsAlternes, majParentIsole, majEnfantsInvalides,
    },
  };
}

// ─── Plafonnement global des niches fiscales (art. 200-0 A CGI) ───────────────

/**
 * Applique le plafonnement global des avantages fiscaux (réductions + crédits
 * concernés). Source : niches-fiscales.json (plafond 10 000 € métropole,
 * 18 000 € avec investissements outre-mer/SOFICA).
 *
 * NB : certains avantages sont HORS plafond (dons, emploi à domicile, garde
 * d'enfant…). L'appelant ne transmet que les avantages SOUMIS au plafond.
 *
 * @param {number}  avantagesSoumis  - total des réductions/crédits soumis au plafond
 * @param {boolean} [outreMer=false] - true → plafond majoré (18 000 €)
 * @returns {{ plafond:number, avantageRetenu:number, exces:number, actif:boolean }}
 */
export function plafonnementNiches(avantagesSoumis, outreMer = false) {
  const av = Math.max(0, avantagesSoumis || 0);
  const plafond = outreMer ? PLAFOND_NICHES_OUTRE_MER : PLAFOND_NICHES_METROPOLE;
  const avantageRetenu = Math.min(av, plafond);
  return {
    plafond,
    avantageRetenu,
    exces: Math.max(0, av - plafond),   // excédent perdu (non reportable)
    actif: av > plafond,
  };
}

// ─── CEHR — Contribution Exceptionnelle Hauts Revenus ────────────────────────

/**
 * Calcule la CEHR (art. 223 sexies CGI).
 * Base = RFR (pas le RNI). S'ajoute à l'IR net.
 *
 * Célibataire : 3 % sur [250k–500k€], 4 % au-delà de 500k€
 * Couple      : 3 % sur [500k–1M€],   4 % au-delà de 1M€
 *
 * @param {number}  rfr       - Revenu Fiscal de Référence
 * @param {boolean} isCouple
 * @returns {number} CEHR en €
 */
export function calcCEHR(rfr, isCouple = false) {
  if (!rfr || rfr <= 0) return 0;
  if (!isCouple) {
    const t1 = Math.max(0, Math.min(rfr, 500_000) - 250_000) * 0.03;
    const t2 = Math.max(0, rfr - 500_000) * 0.04;
    return Math.round(t1 + t2);
  }
  const t1 = Math.max(0, Math.min(rfr, 1_000_000) - 500_000) * 0.03;
  const t2 = Math.max(0, rfr - 1_000_000) * 0.04;
  return Math.round(t1 + t2);
}

// ─── IR brut (barème progressif) ─────────────────────────────────────────────

function irBrut(base, parts) {
  if (!base || base <= 0 || parts <= 0) return 0;
  const quotient = base / parts;
  let taxParPart = 0;
  for (const [lo, hi, rate] of TRANCHES) {
    if (quotient <= lo) break;
    taxParPart += (Math.min(quotient, hi) - lo) * rate;
  }
  return Math.round(taxParPart * parts);
}

// ─── Décote ───────────────────────────────────────────────────────────────────

function applyDecote(brut, isCouple) {
  const seuil   = isCouple ? DECOTE.seuil_couple          : DECOTE.seuil_celibataire;
  const plafond = isCouple ? DECOTE.plafond_couple        : DECOTE.plafond_celibataire;
  if (brut >= seuil) return 0;
  return Math.max(0, Math.round(plafond - 0.4525 * brut));
}

// ─── Plafonnement QF (art. 197-2 CGI) ────────────────────────────────────────

/**
 * Double calcul DGFIP : IR selon les parts vs IR plafonné.
 * Ordre strict : appeler avant la décote (jamais après).
 *
 * @param {number} rniFoyer   - RNI foyer après abattements
 * @param {number} partsReel  - parts fiscales réelles
 * @param {number} partsBase  - parts de base (1 solo / 2 couple)
 * @param {object} plafonds   - bloc quotient_familial du JSON barème
 * @param {object} [opts]
 * @param {number} [opts.nbDemiPartsT=0]          - demi-parts case T (parent isolé)
 * @param {number} [opts.nbDemiPartsL=0]          - demi-parts case L (personne ayant élevé un enfant)
 * @param {number} [opts.nbDemiPartsInvalidite=0] - demi-parts invalidité/ancien combattant (cases P/F/G/S/W et enfant invalide)
 * @returns {{ irSelon:number, irPlafonne:number, avantageReel:number, avantageMax:number, plafonnementActif:boolean }}
 */
export function plafonnementQF(rniFoyer, partsReel, partsBase, plafonds, opts = {}) {
  const irSelon = irBrut(rniFoyer, partsReel);

  if (partsReel <= partsBase) {
    return { irSelon, irPlafonne: irSelon, avantageReel: 0, avantageMax: 0, plafonnementActif: false };
  }

  const irBase          = irBrut(rniFoyer, partsBase);
  const avantageReel    = Math.max(0, irBase - irSelon);
  const nbDemiPartsSupp = (partsReel - partsBase) * 2;
  const nbT             = opts.nbDemiPartsT || 0;
  const nbL             = opts.nbDemiPartsL || 0;
  const nbInval         = opts.nbDemiPartsInvalidite || 0;
  const nbClassic       = Math.max(0, nbDemiPartsSupp - nbT - nbL - nbInval);

  const pClassic = plafonds.plafond_gain_par_demi_part;
  const pT       = plafonds.plafond_gain_parent_isole;
  const pL       = plafonds.plafond_gain_case_L;
  const pInval   = plafonds.plafond_gain_invalidite;

  let avantageMax = nbClassic * pClassic;

  if (nbT > 0) {
    if (pT == null) {
      console.warn('[taxCalculator] plafond_gain_parent_isole (case T) null dans le JSON — fallback plafond classique');
      avantageMax += nbT * pClassic;
    } else {
      avantageMax += nbT * pT;
    }
  }

  if (nbL > 0) {
    if (pL == null) {
      console.warn('[taxCalculator] plafond_gain_case_L null dans le JSON — fallback plafond classique');
      avantageMax += nbL * pClassic;
    } else {
      avantageMax += nbL * pL;
    }
  }

  if (nbInval > 0) {
    if (pInval == null) {
      console.warn('[taxCalculator] plafond_gain_invalidite null dans le JSON — fallback plafond classique');
      avantageMax += nbInval * pClassic;
    } else {
      avantageMax += nbInval * pInval;
    }
  }

  const plafonnementActif = avantageReel > avantageMax;
  const irPlafonne        = plafonnementActif ? Math.round(irBase - avantageMax) : irSelon;

  return { irSelon, irPlafonne, avantageReel, avantageMax, plafonnementActif };
}

// ─── calcIR ───────────────────────────────────────────────────────────────────

/**
 * Calcule l'IR net (barème + plafonnement QF + décote) pour une base fiscale.
 * Ordre de liquidation : barème → plafonnement QF → décote.
 *
 * @param {number}  base      - RNI APRÈS abattement(s) sur salaires
 * @param {number}  parts     - nombre de parts fiscales
 * @param {boolean} isCouple  - true → partsBase=2, décote couple
 * @returns {number} IR net en €
 */
export function calcIR(base, parts = 1, isCouple = false) {
  if (!base || base <= 0) return 0;
  const partsBase = isCouple ? 2 : 1;
  const { irPlafonne } = plafonnementQF(base, parts, partsBase, QF_PLAFONDS);
  return Math.max(0, irPlafonne - applyDecote(irPlafonne, isCouple));
}

// ─── Bases IR ────────────────────────────────────────────────────────────────

/**
 * Base imposable d'un déclarant seul (salaire 1AJ → après abattement 10%).
 */
export function baseIRSolo(netImpSalaire) {
  return abattement10(netImpSalaire || 0);
}

/**
 * Base imposable du foyer depuis state.parsedProfile.
 * Applique l'abattement 10% sur D1 et D2 séparément.
 * Foncier : abattement 30% micro-foncier par défaut.
 * Dividendes et crypto : imposés au PFU 30%, exclus du barème.
 */
export function baseIRFoyer(p) {
  const salD1   = abattement10(p.salaireNetImposableD1 || 0);
  const salD2   = abattement10(p.salaireNetImposableD2 || 0);
  const foncier = (p.revensFonciers || 0) * (p.regimeFoncier === 'reel' ? 1 : 0.70);
  const areD1   = p.rniAreD1           || 0;
  const areD2   = p.rniAreD2           || 0;
  const appD1   = p.rniApprentissageD1 || 0;
  const appD2   = p.rniApprentissageD2 || 0;
  const licD1   = p.rniLicenciementD1  || 0;
  const licD2   = p.rniLicenciementD2  || 0;
  const ppvD1   = p.rniPpvD1           || 0;
  const ppvD2   = p.rniPpvD2           || 0;
  return salD1 + salD2 + foncier + areD1 + areD2 + appD1 + appD2 + licD1 + licD2 + ppvD1 + ppvD2;
}

// ─── TMI ─────────────────────────────────────────────────────────────────────

/**
 * Tranche marginale effective (0, 11, 30, 41, ou 45).
 * @param {number} base  - RNI après abattements
 * @param {number} parts - parts fiscales
 */
export function getTMI(base, parts = 1) {
  if (!base || base <= 0) return 0;
  const q = base / parts;
  let tmi = 0;
  for (const [lo, , rate] of TRANCHES) {
    if (q > lo) tmi = Math.round(rate * 100);
    else break;
  }
  return tmi;
}

// ─── Plafond PER ─────────────────────────────────────────────────────────────

/**
 * Plafond PER individuel disponible (versements volontaires).
 * Base = salaire net imposable après abattement 10%.
 * Plancher : MIN_PLAFOND_PER (issu du PASS).
 * Plafond absolu : MAX_PLAFOND_PER.
 *
 * @param {number} netImpSalaire       - salaire net imposable (1AJ, pré-abattement)
 * @param {number} [peroEmployeur=0]   - cotisations PERO obligatoires à déduire (cases 6QS/T/U)
 * @param {number} [abondPEEPERCO=0]   - abondement employeur PEE/PERCO N-1 à déduire (BOI-IR-BASE-20-50-20)
 */
export function calcPlafondPer(netImpSalaire, peroEmployeur = 0, abondPEEPERCO = 0) {
  const base       = abattement10(netImpSalaire || 0);
  const brut       = base > 0 ? Math.round(base * 0.1) : 0;
  const plafond    = Math.min(Math.max(brut, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  const reductions = (peroEmployeur || 0) + (abondPEEPERCO || 0);
  return Math.max(0, plafond - reductions);
}

/**
 * Calcule le plafond PER disponible pour un déclarant — source unique de vérité UI.
 * Appel : Simulator (profile mode), Rapport.PerZonesBlock, opportunitiesDetector.
 *
 * @param {object}  opts
 * @param {number}  opts.rni              - RNI individuel post-abattement 10 % (pp.rniD1/D2)
 * @param {number}  [opts.pero=0]         - Cotisations PERO obligatoires N-1
 * @param {number}  [opts.abondPEEPERCO=0] - Abondement employeur PEE/PERCO N-1
 * @param {number}  [opts.reportN1=0]     - Plafond reportable N-1
 * @param {number}  [opts.reportN2=0]     - Plafond reportable N-2
 * @param {number}  [opts.reportN3=0]     - Plafond reportable N-3
 * @returns {{
 *   brut10: number,
 *   plafondBrut: number,
 *   reductions: number,
 *   plafondNet: number,
 *   reportTotal: number,
 *   plafondWithReports: number,
 * }}
 */
export function computePlafondPERDeclarant({
  rni = 0,
  pero = 0,
  abondPEEPERCO = 0,
  reportN1 = 0,
  reportN2 = 0,
  reportN3 = 0,
} = {}) {
  const brut10      = rni > 0 ? Math.round(rni * 0.1) : 0;
  const plafondBrut = Math.min(Math.max(brut10, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  const reductions  = (pero || 0) + (abondPEEPERCO || 0);
  const plafondNet  = Math.max(0, plafondBrut - reductions);
  const reportTotal = (reportN1 || 0) + (reportN2 || 0) + (reportN3 || 0);
  return {
    brut10,
    plafondBrut,
    reductions,
    plafondNet,
    reportTotal,
    plafondWithReports: plafondNet + reportTotal,
  };
}

// ─── Optimum fiscal PER — cascade descendante ─────────────────────────────────

/**
 * Calcule l'optimum fiscal PER en cascade depuis la TMI jusqu'au seuil 11%.
 * Retourne les zones prioritaires (rendement = taux effacé) et la capacité résiduelle
 * (rendement 11% seulement → à orienter vers PEA/AV).
 *
 * @param {number}  rniFoyer    - RNI foyer après abattements
 * @param {number}  parts       - parts fiscales
 * @param {number}  plafondD1   - plafond PER net D1
 * @param {number}  plafondD2   - plafond PER net D2
 * @param {boolean} isCouple    - pour le calcul décote dans calcIR
 */
/**
 * @param {number} rniD1  - RNI individuel D1 (post-abattement). 0 = inconnu → fallback plafond.
 * @param {number} rniD2  - RNI individuel D2 (post-abattement). 0 = inconnu → fallback plafond.
 */
/**
 * @param {number} stopRate  - Taux de sortie PER (TMI retraite / 100). Défaut 0.11.
 *   N'optimiser que les tranches > stopRate (sinon PER = report neutre ou perdant).
 *   Skill fiscaliste : "TMI sortie < TMI entrée = gain ; TMI sortie ≥ TMI entrée = neutre/perte".
 */
export function computePerOptimumCascade(rniFoyer, parts, plafondD1, plafondD2, isCouple, rniD1 = 0, rniD2 = 0, stopRate = 0.11) {
  const STOP_RATE = Math.max(0, Math.min(stopRate, 0.44)); // borné entre 0 et 44%
  const pd1 = plafondD1 || 0;
  const pd2 = plafondD2 || 0;
  const plafondTotal = pd1 + pd2;

  const empty = {
    zones: [], optimumTotal: 0, optimumD1: 0, optimumD2: 0,
    economieOptimum: 0, effortNet: 0, rendementMoyen: 0,
    capaciteResiduelle: plafondTotal, plafondTotal, plafondD1: pd1, plafondD2: pd2, tmiDepart: 0,
  };

  if (!rniFoyer || !parts || !plafondTotal) return empty;

  const quotientInit = rniFoyer / parts;
  let tmiDepart = 0;
  for (const [lo, , rate] of TRANCHES) {
    if (quotientInit > lo) tmiDepart = Math.round(rate * 100);
    else break;
  }
  if (tmiDepart <= 11) return { ...empty, tmiDepart };

  const tranchesDesc = [...TRANCHES].filter(([, , rate]) => rate > STOP_RATE).reverse();
  let rniResiduel = rniFoyer;
  let plafondRestant = plafondTotal;
  const zones = [];

  for (const [lo, hi, rate] of tranchesDesc) {
    if (plafondRestant <= 0) break;
    const quotient = rniResiduel / parts;
    if (quotient <= lo) continue;
    const fractionFoyer = Math.round((Math.min(quotient, hi) - lo) * parts);
    if (fractionFoyer <= 0) continue;
    const versement = Math.min(fractionFoyer, plafondRestant);
    const taux = Math.round(rate * 100);
    zones.push({ taux, fractionFoyer, versement, economie: Math.round(versement * rate), partial: versement < fractionFoyer });
    plafondRestant -= versement;
    rniResiduel -= versement;
  }

  const optimumTotal = zones.reduce((s, z) => s + z.versement, 0);
  const economieOptimum = Math.max(0, calcIR(rniFoyer, parts, isCouple) - calcIR(Math.max(0, rniFoyer - optimumTotal), parts, isCouple));
  const capaciteResiduelle = plafondTotal - optimumTotal;

  // Prioritaire = déclarant qui paie le plus d'impôts = plus haut RNI individuel.
  // Fallback sur plafond brut si RNI non disponibles (les deux = 0).
  const d1IsPrio = (rniD1 > 0 || rniD2 > 0) ? (rniD1 >= rniD2) : (pd1 >= pd2);
  let optimumD1, optimumD2, prioritaire;
  if (d1IsPrio) {
    optimumD1 = Math.min(pd1, optimumTotal);
    optimumD2 = Math.min(pd2, Math.max(0, optimumTotal - optimumD1));
    prioritaire = 'D1';
  } else {
    optimumD2 = Math.min(pd2, optimumTotal);
    optimumD1 = Math.min(pd1, Math.max(0, optimumTotal - optimumD2));
    prioritaire = 'D2';
  }

  return {
    zones, optimumTotal, optimumD1, optimumD2, economieOptimum,
    effortNet: optimumTotal - economieOptimum,
    rendementMoyen: optimumTotal > 0 ? Math.round((economieOptimum / optimumTotal) * 100) : 0,
    capaciteResiduelle, plafondTotal, plafondD1: pd1, plafondD2: pd2, tmiDepart,
    prioritaire,
  };
}

// ─── computeFoyerSummary ──────────────────────────────────────────────────────

/**
 * Source de vérité unique pour le résumé fiscal du foyer.
 * Consommé par StepRecap (DeclarationGuide) et Rapport.
 *
 * @param {object} profile - parsedProfile issu de parseProfile(text)
 * @returns {object|null} Résumé complet ou null si rniFoyer absent
 */
export function computeFoyerSummary(profile) {
  if (!profile) return null;

  const isCouple  = profile.mode === 'couple';
  const parts     = Math.max(1, profile.parts || (isCouple ? 2 : 1));
  const rniFoyer  = profile.rniFoyer || 0;
  if (!rniFoyer) return null;

  const partsBase = isCouple ? 2 : 1;
  const qfOpts    = {
    nbDemiPartsT:          profile.nbDemiPartsT || 0,
    nbDemiPartsL:          profile.nbDemiPartsL || 0,
    nbDemiPartsInvalidite: profile.nbDemiPartsInvalidite || 0,
  };
  const qf            = plafonnementQF(rniFoyer, parts, partsBase, QF_PLAFONDS, qfOpts);
  const irBrutVal     = qf.irSelon;
  const irPlafonneVal = qf.irPlafonne;
  const decoteVal     = applyDecote(irPlafonneVal, isCouple);
  const irApresDecote = Math.max(0, irPlafonneVal - decoteVal);

  // Étape réductions/crédits avec plafonnement global des niches (art. 200-0 A CGI).
  // Les avantages SOUMIS au plafond sont fournis par le profil (phases ≥ 1) ;
  // les avantages HORS plafond (dons, emploi à domicile…) s'imputent à part.
  const niches        = plafonnementNiches(profile.reductionsNichesSoumises || 0, !!profile.nichesOutreMer);
  const reductionsHorsPlafond = profile.reductionsHorsPlafond || 0;
  const reductionsRetenues    = niches.avantageRetenu + reductionsHorsPlafond;
  // Réductions : ne rendent pas l'impôt négatif. Crédits (remboursables) : gérés au solde.
  const irNet = Math.max(0, irApresDecote - reductionsRetenues);

  // CEHR (art. 223 sexies CGI) — assise sur le RFR, s'ajoute à l'IR net.
  const cehr = calcCEHR(profile.rfr || rniFoyer, isCouple);

  const foncierBrut = profile.revensFonciers || 0;
  const foncierNet  = (profile.foncierNet != null && profile.foncierNet >= 0)
    ? profile.foncierNet
    : profile.regimeFoncier === 'reel'
      ? foncierBrut
      : Math.round(foncierBrut * (1 - ABATTEMENT_MICRO_FONCIER));
  const psFoncier = Math.round(foncierNet * TAUX_PS_CAPITAL);

  const totalDu = irNet + cehr + psFoncier;

  // Priorité à pasTotal consolidé (tous plugins) si disponible
  const pasTotal = profile.pasTotal > 0
    ? profile.pasTotal
    : (profile.pasD1          || 0)
    + (profile.pasD2          || 0)
    + (profile.pasRente1BsD1  || 0)
    + (profile.pasRente1BsD2  || 0)
    + (profile.arePasD1       || 0)
    + (profile.arePasD2       || 0);

  const acomptesIR   = (profile.acompte8HW || 0) + (profile.acompte8IW || 0);
  const acomptesPS   = (profile.acompte8HX || 0) + (profile.acompte8IX || 0);
  const creditsImpot = profile.intMob2CK || 0;

  // solde positif = complément à payer, négatif = remboursement
  const solde = totalDu - pasTotal;
  const tmi   = getTMI(rniFoyer, parts);

  return {
    rniFoyer,
    partsFiscales: parts,
    quotientFamilial: parts > 0 ? Math.round(rniFoyer / parts) : rniFoyer,
    irBrut: irBrutVal,
    irPlafonne: irPlafonneVal,
    plafonnementQFActif: qf.plafonnementActif,
    avantageQF: qf.avantageReel,
    avantageQFMax: qf.avantageMax,
    decote: decoteVal,
    irApresDecote,
    reductionsRetenues,
    plafonnementNichesActif: niches.actif,
    nichesPlafond: niches.plafond,
    nichesExces: niches.exces,
    cehr,
    irNet,
    psFoncier,
    totalDu,
    pasTotal,
    acomptesIR,
    acomptesPS,
    creditsImpot,
    solde,
    tmi,
    isCouple,
  };
}
