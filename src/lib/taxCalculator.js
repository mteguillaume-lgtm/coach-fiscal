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

export { TRANCHES, DECOTE, ABT };

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

// ─── calcIR ───────────────────────────────────────────────────────────────────

/**
 * Calcule l'IR net (barème + décote) pour une base fiscale.
 *
 * @param {number}  base      - RNI APRÈS abattement(s) sur salaires
 * @param {number}  parts     - nombre de parts fiscales
 * @param {boolean} isCouple  - true → décote couple (seuil 3 277 €)
 * @returns {number} IR net en €
 */
export function calcIR(base, parts = 1, isCouple = false) {
  if (!base || base <= 0) return 0;
  const brut = irBrut(base, parts);
  return Math.max(0, brut - applyDecote(brut, isCouple));
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
 * @param {number} netImpSalaire  - salaire net imposable (1AJ)
 * @param {number} peroEmployeur  - cotisations PERO employeur à déduire
 */
export function calcPlafondPer(netImpSalaire, peroEmployeur = 0) {
  const base    = abattement10(netImpSalaire || 0);
  const brut    = base > 0 ? Math.round(base * 0.1) : 0;
  const plafond = Math.min(Math.max(brut, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  return Math.max(0, plafond - (peroEmployeur || 0));
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

  const irBrutVal  = irBrut(rniFoyer, parts);
  const decoteVal  = applyDecote(irBrutVal, isCouple);
  const irNet      = Math.max(0, irBrutVal - decoteVal);

  const foncierBrut = profile.revensFonciers || 0;
  const foncierNet  = (profile.foncierNet != null && profile.foncierNet >= 0)
    ? profile.foncierNet
    : profile.regimeFoncier === 'reel'
      ? foncierBrut
      : Math.round(foncierBrut * (1 - ABATTEMENT_MICRO_FONCIER));
  const psFoncier = Math.round(foncierNet * TAUX_PS_CAPITAL);

  const totalDu = irNet + psFoncier;

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
    decote: decoteVal,
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
