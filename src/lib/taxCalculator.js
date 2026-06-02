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
import chargesRaw        from '../data/paperasse/fiscaliste/data/charges-deductibles.json';
import fonciersRaw       from '../data/paperasse/fiscaliste/data/regimes-fonciers-lmnp.json';
import hsSuppRaw         from '../data/paperasse/fiscaliste/data/heures-supplementaires-ppv.json';
import apprentissageRaw  from '../data/paperasse/fiscaliste/data/apprentissage.json';
import baremeKmRaw       from '../data/paperasse/fiscaliste/data/bareme-kilometrique-2025.json';
import microTnsRaw       from '../data/paperasse/fiscaliste/data/micro-tns.json';

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

// ─── Immobilier locatif — PHASE 3 (depuis regimes-fonciers-lmnp.json) ─────────

export const DEFICIT_FONCIER          = fonciersRaw.regime_reel_foncier.deficit_foncier;
export const LMNP_MICRO_REGIMES       = {
  lmnp_longue_duree:        fonciersRaw.micro_bic_lmnp.lmnp_longue_duree,
  meuble_tourisme_classe:   fonciersRaw.micro_bic_lmnp.meuble_tourisme_classe,
  meuble_tourisme_non_classe: fonciersRaw.micro_bic_lmnp.meuble_tourisme_non_classe,
};
export const LMNP_MICRO_ABATT_MIN     = fonciersRaw.micro_bic_lmnp.abattement_minimum_euros;
export const LMNP_MICRO_TYPES         = Object.keys(LMNP_MICRO_REGIMES);
export const LMP_SEUILS               = fonciersRaw.lmp_vs_lmnp.seuils_cumulatifs;

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

// ─── Régimes micro TNS — BIC / BNC / BA (depuis le JSON) ──────────────────────

export const MICRO_TNS              = microTnsRaw;
export const MICRO_TNS_REGIMES      = microTnsRaw.regimes;
export const MICRO_TNS_ABATT_MIN    = microTnsRaw.abattement_minimum_euros;
// Identifiants de régime acceptés par calcMicroTns / le générateur / le parser.
export const MICRO_TNS_TYPES        = Object.keys(microTnsRaw.regimes); // micro_bic_vente, micro_bic_service, micro_bnc, micro_ba

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

// ─── Réductions & crédits d'impôt grand public (PHASE 1) ─────────────────────
// Tous les paramètres sont lus dans niches-fiscales.json → bareme_reductions_credits_2025.
export const REDUC_CREDITS = nichesRaw.bareme_reductions_credits_2025;
export const CHARGES_DEDUCTIBLES = chargesRaw;

const _round = (v) => Math.round(v || 0);

/** Crédit d'impôt emploi à domicile (7DB/7DF) — 50 %, art. 199 sexdecies CGI. */
export function calcCreditEmploiDomicile(depense, nbPersonnesACharge = 0, opts = {}) {
  const c = REDUC_CREDITS.emploi_a_domicile;
  if (!depense || depense <= 0) return 0;
  const maxCap = opts.invalidite ? c.plafond_invalidite
               : opts.premiereAnnee ? c.plafond_premiere_annee
               : c.plafond_majore_max;
  const plafond = Math.min(c.plafond_base + c.majoration_par_personne_a_charge * (nbPersonnesACharge || 0), maxCap);
  return _round(Math.min(depense, plafond) * c.taux);
}

/** Crédit d'impôt garde d'enfant < 6 ans hors domicile (7GA-7GG) — 50 %. */
export function calcCreditGarde(depenseTotale, nbEnfants = 0, nbEnfantsAlternes = 0) {
  const c = REDUC_CREDITS.garde_enfant_exterieur;
  if (!depenseTotale || depenseTotale <= 0) return 0;
  const plafond = c.plafond_depenses_par_enfant * (nbEnfants || 0)
                + c.plafond_residence_alternee_par_enfant * (nbEnfantsAlternes || 0);
  if (plafond <= 0) return 0;
  return _round(Math.min(depenseTotale, plafond) * c.taux);
}

/**
 * Réduction d'impôt forfaitaire frais de scolarité (7EA-7EF), art. 199 quater F.
 * @param {{college?:number, lycee?:number, sup?:number, collegeAlt?:number, lyceeAlt?:number, supAlt?:number}} counts
 */
export function calcReductionScolarite(counts = {}) {
  const m = REDUC_CREDITS.frais_scolarite.montants;
  const ma = REDUC_CREDITS.frais_scolarite.montants_residence_alternee;
  return _round(
    (counts.college || 0) * m.college + (counts.lycee || 0) * m.lycee + (counts.sup || 0) * m.enseignement_superieur
    + (counts.collegeAlt || 0) * ma.college + (counts.lyceeAlt || 0) * ma.lycee + (counts.supAlt || 0) * ma.enseignement_superieur,
  );
}

/**
 * Réduction d'impôt dons (7UD à 75 %, 7UF à 66 %), art. 200 CGI.
 * @param {number} donsAidePersonnes - dons aux organismes d'aide (7UD)
 * @param {number} donsGeneral       - autres dons d'intérêt général (7UF)
 * @param {number} revenuImposable   - pour le plafond 20 % de l'assiette 66 %
 */
export function calcReductionDons(donsAidePersonnes = 0, donsGeneral = 0, revenuImposable = 0) {
  const d = REDUC_CREDITS.dons;
  const aide = Math.max(0, donsAidePersonnes);
  const assiette75 = Math.min(aide, d.plafond_assiette_75pct);
  const reste66    = Math.max(0, aide - d.plafond_assiette_75pct) + Math.max(0, donsGeneral);
  const plafond66  = (revenuImposable || 0) * d.plafond_assiette_66pct_pct_revenu;
  const assiette66 = plafond66 > 0 ? Math.min(reste66, plafond66) : reste66;
  return _round(assiette75 * d.taux_aide_personnes_75pct + assiette66 * d.taux_general_66pct);
}

/** Crédit d'impôt cotisations syndicales (7AC/7AE/7AG) — 66 %, plafond 1 % du revenu brut. */
export function calcCreditSyndicales(cotisation, revenuBrut = 0) {
  const c = REDUC_CREDITS.cotisations_syndicales;
  if (!cotisation || cotisation <= 0) return 0;
  const plafond = (revenuBrut || 0) * c.plafond_pct_revenu_brut;
  const base = plafond > 0 ? Math.min(cotisation, plafond) : cotisation;
  return _round(base * c.taux);
}

/**
 * Déductions du revenu global (pension alimentaire versée, frais d'accueil) —
 * art. 156-II CGI. Réduisent le RNI AVANT calcul de l'IR.
 * @returns {{ total:number, pensionDeduc:number, fraisAccueilDeduc:number }}
 */
export function calcDeductionsRevenu({ pensionVersee = 0, pensionBenef = '', pensionNb = 1, fraisAccueil = 0, fraisAccueilNb = 1 } = {}) {
  const enfMaj = CHARGES_DEDUCTIBLES.pension_alimentaire_enfant_majeur;
  const accueil = CHARGES_DEDUCTIBLES.frais_accueil_personne_agee;
  const nb = Math.max(1, pensionNb || 1);
  // Pension enfant majeur : plafonnée par enfant ; ascendant/ex-conjoint : montant réel.
  const pensionDeduc = /enfant/i.test(pensionBenef)
    ? Math.min(Math.max(0, pensionVersee), enfMaj.plafond_reel_par_enfant * nb)
    : Math.max(0, pensionVersee);
  const fraisAccueilDeduc = Math.min(Math.max(0, fraisAccueil), accueil.plafond_par_personne * Math.max(1, fraisAccueilNb || 1));
  return { total: _round(pensionDeduc + fraisAccueilDeduc), pensionDeduc: _round(pensionDeduc), fraisAccueilDeduc: _round(fraisAccueilDeduc) };
}

/**
 * Bénéfice imposable d'une activité au régime micro (BIC / BNC / BA).
 * Source : micro-tns.json. Bénéfice = recettes − abattement forfaitaire
 * (plancher 305 €), plafonné à la hauteur des recettes.
 *
 * @param {object} o
 * @param {string} o.type      - clé de regimes : 'micro_bic_vente' | 'micro_bic_service' | 'micro_bnc' | 'micro_ba'
 * @param {number} o.recettes  - chiffre d'affaires / recettes brutes
 * @returns {{ type:string, label:string, recettes:number, abattement:number, abattementEuros:number,
 *            beneficeImposable:number, seuil:number, depassementSeuil:boolean, regimeReelObligatoire:boolean }|null}
 */
export function calcMicroTns({ type, recettes = 0 } = {}) {
  const regime = MICRO_TNS_REGIMES[type];
  if (!regime) return null;
  const rec = Math.max(0, recettes || 0);
  // Abattement forfaitaire avec plancher légal de 305 €, jamais > recettes.
  const abattementEuros = rec > 0 ? Math.min(rec, Math.max(_round(rec * regime.abattement), MICRO_TNS_ABATT_MIN)) : 0;
  const beneficeImposable = _round(rec - abattementEuros);
  const depassementSeuil = rec > regime.seuil_recettes_brutes;
  return {
    type,
    label: regime.label,
    recettes: rec,
    abattement: regime.abattement,
    abattementEuros,
    beneficeImposable,
    seuil: regime.seuil_recettes_brutes,
    depassementSeuil,
    regimeReelObligatoire: depassementSeuil,
  };
}

/**
 * Estimation INDICATIVE des cotisations sociales micro-social (URSSAF) +
 * éventuel versement libératoire de l'IR, en % du chiffre d'affaires brut.
 * Source : micro-tns.json (estimation, ne remplace pas le décompte URSSAF).
 *
 * @param {object} o
 * @param {string}  o.type                  - clé de regimes (le micro_ba n'a pas de micro-social → 0)
 * @param {number}  o.recettes              - CA brut
 * @param {boolean} o.versementLiberatoire  - option VL de l'IR
 * @returns {{ cotisations:number, tauxCotisations:number, versementLiberatoire:number,
 *            tauxVL:number, totalPrelevements:number, estimation:true }}
 */
export function estimCotisationsMicro({ type, recettes = 0, versementLiberatoire = false } = {}) {
  const rec = Math.max(0, recettes || 0);
  const tauxCot = MICRO_TNS.cotisations_micro_social.taux[type] || 0;
  const tauxVL  = versementLiberatoire ? (MICRO_TNS.versement_liberatoire.taux[type] || 0) : 0;
  const cotisations = _round(rec * tauxCot);
  const vl          = _round(rec * tauxVL);
  return {
    cotisations,
    tauxCotisations: tauxCot,
    versementLiberatoire: vl,
    tauxVL,
    totalPrelevements: cotisations + vl,
    estimation: true,
  };
}

// ─── Immobilier locatif — PHASE 3 ────────────────────────────────────────────

/**
 * Revenus fonciers au régime réel (location nue, formulaire 2044).
 * Source : regimes-fonciers-lmnp.json → regime_reel_foncier.
 * Résultat net = recettes − charges (dont intérêts d'emprunt). Peut être
 * négatif (déficit). Les intérêts sont isolés car ils ne sont JAMAIS imputables
 * sur le revenu global (uniquement sur les revenus fonciers) — cf. calcDeficitFoncier.
 *
 * @param {object} o
 * @param {number} o.recettes  - loyers bruts encaissés
 * @param {number} o.charges   - charges déductibles HORS intérêts (travaux, taxe foncière, assurances, gestion…)
 * @param {number} o.interets  - intérêts d'emprunt déductibles
 * @returns {{ recettes:number, charges:number, interets:number, chargesTotal:number,
 *            net:number, deficit:number, deficitInterets:number, deficitAutresCharges:number }}
 */
export function calcFoncierReel({ recettes = 0, charges = 0, interets = 0 } = {}) {
  const rec = Math.max(0, recettes || 0);
  const chg = Math.max(0, charges || 0);
  const int = Math.max(0, interets || 0);
  const chargesTotal = chg + int;
  const net = _round(rec - chargesTotal);
  // Décomposition du déficit : les intérêts s'imputent en priorité sur les
  // recettes (art. 156-I-3° CGI). La fraction de déficit due aux intérêts n'est
  // jamais imputable sur le revenu global.
  const deficit = net < 0 ? -net : 0;
  const deficitInterets = _round(Math.max(0, int - rec));            // intérêts non couverts par les recettes
  const deficitAutresCharges = _round(Math.max(0, deficit - deficitInterets));
  return {
    recettes: rec, charges: chg, interets: int, chargesTotal,
    net, deficit, deficitInterets, deficitAutresCharges,
  };
}

/**
 * Imputation d'un déficit foncier (art. 156-I-3° CGI).
 * Source : regimes-fonciers-lmnp.json → regime_reel_foncier.deficit_foncier.
 * - La fraction due aux AUTRES charges (hors intérêts) est imputable sur le
 *   revenu global dans la limite annuelle (10 700 €, ou 21 400 € pour travaux de
 *   rénovation énergétique globale).
 * - L'excédent + la fraction due aux intérêts sont reportables 10 ans sur les
 *   seuls revenus fonciers.
 *
 * @param {object} o
 * @param {number}  o.deficitAutresCharges - déficit hors intérêts (de calcFoncierReel)
 * @param {number}  o.deficitInterets      - déficit dû aux intérêts (de calcFoncierReel)
 * @param {boolean} [o.renovationEnergetique=false] - travaux de rénovation énergétique globale → plafond doublé
 * @returns {{ imputableRevenuGlobal:number, reportableRevenusFonciers:number, plafond:number }}
 */
export function calcDeficitFoncier({ deficitAutresCharges = 0, deficitInterets = 0, renovationEnergetique = false } = {}) {
  const plafond = renovationEnergetique
    ? DEFICIT_FONCIER.imputation_revenu_global_renovation_energetique
    : DEFICIT_FONCIER.imputation_revenu_global;
  const autres = Math.max(0, deficitAutresCharges || 0);
  const inter  = Math.max(0, deficitInterets || 0);
  const imputableRevenuGlobal = Math.min(autres, plafond);
  // Excédent de la fraction « autres charges » au-delà du plafond + intérêts → report foncier.
  const reportableRevenusFonciers = _round((autres - imputableRevenuGlobal) + inter);
  return {
    imputableRevenuGlobal: _round(imputableRevenuGlobal),
    reportableRevenusFonciers,
    plafond,
  };
}

/**
 * Bénéfice imposable d'une location meublée non professionnelle au régime
 * micro-BIC (LMNP). Source : regimes-fonciers-lmnp.json → micro_bic_lmnp.
 * Réforme loi Le Meur : 3 régimes (longue durée 50 %, tourisme classé 50 %,
 * tourisme non classé 30 %). Bénéfice = recettes − abattement forfaitaire
 * (plancher 305 €). Imposé en BIC, réintégré au RNI.
 *
 * @param {object} o
 * @param {string} o.type      - 'lmnp_longue_duree' | 'meuble_tourisme_classe' | 'meuble_tourisme_non_classe'
 * @param {number} o.recettes  - loyers meublés bruts encaissés
 * @returns {{ type:string, label:string, recettes:number, abattement:number, abattementEuros:number,
 *            beneficeImposable:number, seuil:number, depassementSeuil:boolean, regimeReelObligatoire:boolean }|null}
 */
export function calcLmnpMicro({ type, recettes = 0 } = {}) {
  const regime = LMNP_MICRO_REGIMES[type];
  if (!regime) return null;
  const rec = Math.max(0, recettes || 0);
  const abattementEuros = rec > 0 ? Math.min(rec, Math.max(_round(rec * regime.abattement), LMNP_MICRO_ABATT_MIN)) : 0;
  const beneficeImposable = _round(rec - abattementEuros);
  const depassementSeuil = rec > regime.seuil;
  return {
    type,
    label: regime.label,
    recettes: rec,
    abattement: regime.abattement,
    abattementEuros,
    beneficeImposable,
    seuil: regime.seuil,
    depassementSeuil,
    regimeReelObligatoire: depassementSeuil,
  };
}

/**
 * Détecte la bascule LMNP → LMP (Loueur Meublé Professionnel, art. 155-IV CGI).
 * Source : regimes-fonciers-lmnp.json → lmp_vs_lmnp.seuils_cumulatifs.
 * Conditions CUMULATIVES : recettes meublées > 23 000 € ET > 50 % des autres
 * revenus professionnels du foyer (salaires + BIC + BNC + rémunérations dirigeant).
 *
 * @param {object} o
 * @param {number} o.recettesMeublees  - total des recettes meublées du foyer
 * @param {number} o.revenusProFoyer   - autres revenus professionnels du foyer
 * @returns {{ estLMP:boolean, seuilRecettes:number, partRevenusPro:number, depasseSeuil:boolean, depassePart:boolean }}
 */
export function detectLmp({ recettesMeublees = 0, revenusProFoyer = 0 } = {}) {
  const rec = Math.max(0, recettesMeublees || 0);
  const pro = Math.max(0, revenusProFoyer || 0);
  const depasseSeuil = rec > LMP_SEUILS.seuil_recettes;
  const depassePart  = rec > pro * LMP_SEUILS.part_revenus_pro_min;
  return {
    estLMP: depasseSeuil && depassePart,
    seuilRecettes: LMP_SEUILS.seuil_recettes,
    partRevenusPro: LMP_SEUILS.part_revenus_pro_min,
    depasseSeuil,
    depassePart,
  };
}

/**
 * Arbitrage PFU 30 % vs option barème pour les revenus du capital (dividendes/intérêts).
 * Source : pfu-prelevements-sociaux.json + gcp.md (levier « PFU vs barème »).
 * Compare l'imposition globale (IR + PS) des deux options.
 *
 * @param {object} o
 * @param {number} o.dividendes  - dividendes bruts (2DC)
 * @param {number} o.interets    - intérêts bruts (2TR)
 * @param {number} o.rniFoyer    - RNI hors revenus de capital
 * @param {number} o.parts
 * @param {boolean} o.isCouple
 * @returns {{ pfu:number, bareme:number, recommande:'pfu'|'bareme', economie:number, detail:object }}
 */
export function arbitragePfuBareme({ dividendes = 0, interets = 0, rniFoyer = 0, parts = 1, isCouple = false }) {
  const div = Math.max(0, dividendes);
  const int = Math.max(0, interets);
  const base = div + int;
  const tauxPS = TAUX_PS_CAPITAL;

  // Option PFU : 12,8 % IR + 17,2 % PS sur le brut.
  const pfu = _round(base * (pfuRaw.pfu.detail_ir + tauxPS));

  // Option barème : abattement 40 % sur dividendes, PS 17,2 % sur le brut,
  // CSG déductible 6,8 % imputable l'année suivante (approximée comme une
  // réduction d'assiette barème la même année pour l'arbitrage indicatif).
  const abatt = pfuRaw.dividendes_option_bareme.abattement;
  const csgDeductible = pfuRaw.prelevements_sociaux.dont_csg_deductible_si_bareme;
  const baseBaremeImposable = div * (1 - abatt) + int;
  const csgDeduc = _round(base * csgDeductible);
  const irAvec = calcIR(rniFoyer + Math.max(0, baseBaremeImposable - csgDeduc), parts, isCouple);
  const irSans = calcIR(rniFoyer, parts, isCouple);
  const irMarginal = Math.max(0, irAvec - irSans);
  const bareme = _round(irMarginal + base * tauxPS);

  const recommande = bareme <= pfu ? 'bareme' : 'pfu';
  return {
    pfu, bareme, recommande,
    economie: Math.abs(pfu - bareme),
    detail: { base, baseBaremeImposable, csgDeduc, irMarginal, tauxPS },
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
  // Réductions grand public (PHASE 1) — HORS plafond global : dons, scolarité.
  const reductionDons      = calcReductionDons(profile.donsAidePersonnes || 0, profile.donsGeneral || 0, rniFoyer);
  const reductionScolarite = calcReductionScolarite({
    college: profile.scolCollege || 0, lycee: profile.scolLycee || 0, sup: profile.scolSup || 0,
  });
  // Avantages SOUMIS au plafond global (Pinel, FCPI… → phases ≥ 5).
  const niches = plafonnementNiches(profile.reductionsNichesSoumises || 0, !!profile.nichesOutreMer);
  const reductionsHorsPlafond = reductionDons + reductionScolarite + (profile.reductionsHorsPlafond || 0);
  const reductionsRetenues    = niches.avantageRetenu + reductionsHorsPlafond;
  // Réductions : ne rendent pas l'impôt négatif. Crédits (remboursables) : gérés au solde.
  const irNet = Math.max(0, irApresDecote - reductionsRetenues);

  // Crédits d'impôt remboursables grand public : emploi à domicile, garde < 6 ans,
  // cotisations syndicales (art. 199 sexdecies / quater B / 200 quater B CGI).
  const nbPersonnesACharge   = (profile.nbEnfants || 0) + (profile.nbEnfantsAlternes || 0);
  const creditEmploiDomicile = calcCreditEmploiDomicile(profile.emploiDomicileDepense || 0, nbPersonnesACharge);
  const creditGarde          = calcCreditGarde(profile.gardeDepense || 0, profile.nbEnfants || 0, profile.nbEnfantsAlternes || 0);
  const creditSyndicales     = calcCreditSyndicales(profile.syndicatCotisation || 0, rniFoyer);

  // Arbitrage PFU 30 % vs option barème sur les revenus du capital (dividendes/intérêts CTO).
  const arbitrageCapital = arbitragePfuBareme({
    dividendes: profile.dividendes2DC || 0,
    interets:   profile.intMob2TR || 0,
    rniFoyer, parts, isCouple,
  });

  // CEHR (art. 223 sexies CGI) — assise sur le RFR, s'ajoute à l'IR net.
  const cehr = calcCEHR(profile.rfr || rniFoyer, isCouple);

  const foncierBrut = profile.revensFonciers || 0;
  const foncierNet  = (profile.foncierNet != null && profile.foncierNet >= 0)
    ? profile.foncierNet
    : profile.regimeFoncier === 'reel'
      ? foncierBrut
      : Math.round(foncierBrut * (1 - ABATTEMENT_MICRO_FONCIER));
  const psFoncier = Math.round(foncierNet * TAUX_PS_CAPITAL);

  // PHASE 3 : PS 17,2 % sur les autres revenus immobiliers locatifs (foncier réel,
  // LMNP micro/réel, quote-part SCI à l'IR) — base consolidée par le générateur.
  const psImmo = Math.round((profile.immoPsBase || 0) * TAUX_PS_CAPITAL);

  const totalDu = irNet + cehr + psFoncier + psImmo;

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

  // Crédits remboursables : remboursés même si l'IR est nul → imputés au solde.
  const creditsRemboursables = creditEmploiDomicile + creditGarde + creditSyndicales;

  // solde positif = complément à payer, négatif = remboursement
  const solde            = totalDu - pasTotal;            // headline (avant crédits remb.)
  const soldeApresCredits = solde - creditsRemboursables; // solde réel après crédits remboursables
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
    reductionDons,
    reductionScolarite,
    reductionsRetenues,
    plafonnementNichesActif: niches.actif,
    nichesPlafond: niches.plafond,
    nichesExces: niches.exces,
    cehr,
    irNet,
    psFoncier,
    psImmo,
    psImmoBase: profile.immoPsBase || 0,
    immoDeltaRni: profile.immoDeltaRni || 0,
    totalDu,
    pasTotal,
    acomptesIR,
    acomptesPS,
    creditsImpot,
    creditEmploiDomicile,
    creditGarde,
    creditSyndicales,
    creditsRemboursables,
    deductionsRevenu: profile.deductionsRevenu || 0,
    arbitrageCapital,
    solde,
    soldeApresCredits,
    tmi,
    isCouple,
  };
}
