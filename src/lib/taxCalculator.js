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
import pvMobRaw          from '../data/paperasse/fiscaliste/data/plus-values-mobilieres-crypto.json';
import pvImmoRaw         from '../data/paperasse/fiscaliste/data/plus-values-immo-abattements.json';
import ifiRaw            from '../data/paperasse/fiscaliste/data/ifi-bareme.json';
import defiscRaw         from '../data/paperasse/fiscaliste/data/defiscalisation.json';
import intlRaw           from '../data/paperasse/fiscaliste/data/fiscalite-internationale.json';
import transmissionRaw    from '../data/paperasse/notaire/data/abattements-succession-donation.json';
import peaAvRaw           from '../data/paperasse/fiscaliste/data/pea-assurance-vie.json';
import epargneRegRaw      from '../data/epargne-reglementee.json';
import { deriveLifeStage } from './lifeStage';

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
if (typeof DECOTE.taux !== 'number') {
  throw new Error('[taxCalculator] decote.taux manquant dans bareme-ir-YYYY.json — ajouter le champ machine (taux de la formule de décote, cf. BOI-IR-LIQ-20-20-30).');
}

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
export const TAUX_PLAFOND_PER = perRaw.per_individuel.taux_calcul;   // 10 % du RNI (art. 163 quatervicies)

// ─── Plafonds épargne réglementée & PEA (depuis les JSON) ─────────────────────

export const PLAFOND_LIVRET_A       = epargneRegRaw.livret_a.plafond_versements;
export const PLAFOND_LDDS           = epargneRegRaw.ldds.plafond_versements;
export const PLAFOND_LEP            = epargneRegRaw.lep.plafond_versements;
export const SEUIL_RFR_LEP_SOLO     = epargneRegRaw.lep.seuil_rfr_celibataire;
export const SEUIL_RFR_LEP_COUPLE   = epargneRegRaw.lep.seuil_rfr_couple_2_parts;
export const PLAFOND_VERSEMENTS_PEA = peaAvRaw.pea_classique.plafond_versements;

// ─── Assurance-vie — rachats après 8 ans (depuis pea-assurance-vie.json) ─────

export const AV_ABATTEMENT_8ANS_SOLO     = peaAvRaw.assurance_vie_rachats.abattement_annuel_apres_8_ans.celibataire_veuf_divorce;
export const AV_ABATTEMENT_8ANS_COUPLE   = peaAvRaw.assurance_vie_rachats.abattement_annuel_apres_8_ans.couple_imposition_commune;
export const AV_TAUX_IR_APRES_8ANS       = peaAvRaw.assurance_vie_rachats.taux_ir_pfl_apres_8_ans;
export const AV_SEUIL_PRIMES_TAUX_REDUIT = peaAvRaw.assurance_vie_rachats.seuil_primes_nettes_taux_reduit;

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

// ─── Plus-values & capital — PHASE 4 (depuis les JSON) ────────────────────────

// PFU : part IR 12,8 % et part PS 17,2 % (réutilisées par les PV mobilières/crypto).
export const PFU_TAUX_IR              = pfuRaw.pfu.detail_ir;
export const PFU_TAUX_PS              = pfuRaw.pfu.detail_ps;
export const DIV_ABATTEMENT_BAREME    = pfuRaw.dividendes_option_bareme.abattement;

// PV mobilières : abattements pour durée de détention (titres acquis avant 2018, option barème, IR seul).
export const PV_MOB_ABATT_DROIT_COMMUN = pvMobRaw.plus_values_mobilieres.abattements_duree_detention_avant_2018.grille_machine.droit_commun;
export const PV_MOB_ABATT_RENFORCE_PME = pvMobRaw.plus_values_mobilieres.abattements_duree_detention_avant_2018.grille_machine.renforce_pme;

// Crypto : seuil d'exonération annuel (cessions cumulées) — art. 150 VH bis CGI.
export const CRYPTO_SEUIL_EXONERATION  = pvMobRaw.crypto_actifs.exoneration.seuil_annuel;

// PV immobilières : taux IR/PS, grilles d'abattement durée, surtaxe, seuils.
export const PV_IMMO_TAUX_IR           = pvImmoRaw.regime_general.taux_ir;
export const PV_IMMO_TAUX_PS           = pvImmoRaw.regime_general.taux_ps;
export const PV_IMMO_ABATT_IR          = pvImmoRaw.abattements_ir.grille_machine;
export const PV_IMMO_ABATT_PS          = pvImmoRaw.abattements_ps.grille_machine;
export const PV_IMMO_FRAIS_ACQ_FORFAIT = pvImmoRaw.prix_acquisition_majore.frais_acquisition_forfait;
export const PV_IMMO_TRAVAUX_FORFAIT   = pvImmoRaw.prix_acquisition_majore.travaux_forfait;
export const PV_IMMO_TRAVAUX_DETENTION_MIN = pvImmoRaw.prix_acquisition_majore.travaux_forfait_detention_min_annees;
export const PV_IMMO_SEUIL_PETIT_PRIX  = pvImmoRaw.exonerations.seuil_petit_prix;
export const PV_IMMO_SURTAXE_SEUIL     = pvImmoRaw.surtaxe_pv_importantes.seuil_declenchement;
export const PV_IMMO_SURTAXE_BAREME    = pvImmoRaw.surtaxe_pv_importantes.bareme;

// ─── IFI & défiscalisation — PHASE 5 (depuis les JSON) ───────────────────────

export const IFI_SEUIL_ASSUJETTISSEMENT = ifiRaw.ifi.seuil_assujettissement;   // 1 300 000 €
export const IFI_BAREME_DEPART          = ifiRaw.ifi.bareme_commence_a;         // 800 000 €
export const IFI_TRANCHES               = ifiRaw.ifi.tranches;
export const IFI_DECOTE                 = ifiRaw.ifi.decote;                     // plage 1,3–1,4 M€
export const IFI_ABATTEMENT_RP          = ifiRaw.abattements_exonerations.residence_principale; // 0,30
export const IFI_PLAFONNEMENT           = ifiRaw.plafonnement;

export const DEFISC_DISPOSITIFS         = defiscRaw.dispositifs;
export const PLAFOND_NICHES_MAJORE      = nichesRaw.plafonnement_global.plafond_majore_sofica_om
                                       ?? nichesRaw.plafonnement_global.plafond_investissements_outre_mer; // 18 000 €

// ─── Fiscalité internationale — PHASE 6 (depuis le JSON) ─────────────────────

export const INTL_METHODES        = intlRaw.methodes_elimination_double_imposition;
export const INTL_CASES           = intlRaw.cases_revenus_etrangers;
export const INTL_ROUTAGE         = intlRaw.regimes_routage_avocat_fiscaliste;

// ─── Transmission — abattements donation / assurance-vie (depuis le JSON notaire) ──
// Source unique : abattements-succession-donation.json. AUCUN montant en dur ailleurs
// (lifeStage.js, Rapport.jsx, Profile.jsx) ne doit réécrire ces valeurs.
const _abattDonation = transmissionRaw.abattements.donation;
const _findAbatt     = (lien) => (_abattDonation.find(a => a.lien === lien) || {});
const _donEnfant     = _findAbatt('enfant');
const _donFamilial   = _findAbatt('don_familial_sommes_argent');
const _avTransm      = transmissionRaw.assurance_vie_transmission;
const _seuilsAge     = transmissionRaw.seuils_age;

export const ABATTEMENT_DONATION_ENFANT    = _donEnfant.abattement;                 // 100 000 € / parent / enfant
export const RAPPEL_FISCAL_DONATION_ANNEES = _donEnfant.renouvellement_annees;       // 15 ans (art. 784 CGI)
export const ABATTEMENT_DON_FAMILIAL       = _donFamilial.abattement;                // 31 865 € (art. 790 G)
export const SEUIL_AGE_DON_FAMILIAL        = _seuilsAge.don_familial_age_max_donateur; // donateur < 80 ans
export const ABATTEMENT_AV_AVANT_70        = _avTransm.primes_versees_avant_70_ans.abattement_par_beneficiaire; // 152 500 € (art. 990 I)
export const ABATTEMENT_AV_APRES_70        = _avTransm.primes_versees_apres_70_ans.abattement_global;           // 30 500 € (art. 757 B)
export const SEUIL_AGE_AV_TRANSMISSION     = _avTransm.seuil_age_pivot;              // 70 ans (bascule 990 I → 757 B)

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

/**
 * Arbitrage GLOBAL de l'option barème (case 2OP) — art. 200 A 2 CGI.
 * L'option 2OP est globale et annuelle : elle couvre d'un bloc les dividendes
 * (2DC), intérêts (2TR) ET plus-values mobilières (3VG). Cette fonction compare
 * les deux SEULS scénarios déclarables : tout PFU vs tout barème.
 * NB : la crypto (3AN) a sa propre option, distincte de 2OP → hors périmètre.
 *
 * Approximation (héritée d'arbitragePfuBareme, documentée) : la CSG déductible
 * 6,8 % s'impute légalement en N+1 ; elle est approximée la même année. La
 * déductibilité réduite de la CSG sur PV abattues n'est pas modélisée.
 *
 * @param {object} o
 * @param {number} o.dividendes       - dividendes bruts (2DC)
 * @param {number} o.interets         - intérêts bruts (2TR)
 * @param {number} o.pvNetImposable   - PV après moins-values (gainImposable de calcPvMobiliere)
 * @param {number} o.pvBaseIRBareme   - PV après MV et abattements durée (baseIRBareme) — défaut : pvNetImposable
 * @param {number} o.rniFoyer
 * @param {number} o.parts
 * @param {boolean} o.isCouple
 * @returns {{ pfu:number, bareme:number, recommande:'pfu'|'bareme', economie:number, detail:object }}
 */
export function arbitrage2OP({
  dividendes = 0, interets = 0,
  pvNetImposable = 0, pvBaseIRBareme = 0,
  rniFoyer = 0, parts = 1, isCouple = false,
} = {}) {
  const div = Math.max(0, dividendes);
  const int = Math.max(0, interets);
  const pv  = Math.max(0, pvNetImposable);
  const pvBareme = Math.min(pv, Math.max(0, pvBaseIRBareme) || pv);
  const base = div + int + pv;
  if (base <= 0) {
    return { pfu: 0, bareme: 0, recommande: 'pfu', economie: 0, detail: { base: 0, irPfu: 0, irBareme: 0, ps: 0 } };
  }
  const ps    = _round(base * TAUX_PS_CAPITAL);   // identique dans les deux scénarios
  const irPfu = _round(base * PFU_TAUX_IR);

  const abatt    = pfuRaw.dividendes_option_bareme.abattement;
  const csgDeduc = _round(base * pfuRaw.prelevements_sociaux.dont_csg_deductible_si_bareme);
  const baseBareme = Math.max(0, _round(div * (1 - abatt) + int + pvBareme - csgDeduc));
  const irBareme = Math.max(0, calcIR(rniFoyer + baseBareme, parts, isCouple) - calcIR(rniFoyer, parts, isCouple));

  const pfu    = irPfu + ps;
  const bareme = irBareme + ps;
  return {
    pfu, bareme,
    recommande: bareme <= pfu ? 'bareme' : 'pfu',
    economie: Math.abs(pfu - bareme),
    detail: { base, baseBareme, csgDeduc, irPfu, irBareme, ps },
  };
}

// ─── Plus-values & capital — PHASE 4 ─────────────────────────────────────────

/**
 * Taux d'abattement pour durée de détention (titres mobiliers acquis avant 2018).
 * Lit la grille machine [min_annees inclus, max_annees exclu].
 * @param {Array<{min_annees:number,max_annees:number|null,taux:number}>} grille
 * @param {number} duree - durée de détention en années révolues
 * @returns {number} taux d'abattement (0 si aucune tranche applicable)
 */
function tauxAbattementMobiliere(grille, duree) {
  const d = Math.max(0, duree || 0);
  const t = (grille || []).find(b => d >= b.min_annees && (b.max_annees == null || d < b.max_annees));
  return t ? t.taux : 0;
}

/**
 * Plus-value de cession de valeurs mobilières (actions, OPC, parts) — case 3VG.
 * Source : plus-values-mobilieres-crypto.json + pfu-prelevements-sociaux.json.
 * - Moins-values reportables (3VH) imputées en priorité sur la PV (même nature).
 * - PS 17,2 % toujours sur le gain net (l'abattement durée NE s'applique PAS aux PS).
 * - IR : PFU 12,8 % par défaut ; option barème → abattement durée de détention
 *   (IR seulement) si titres acquis avant 2018, puis IR marginal au barème.
 *
 * @param {object} o
 * @param {number}  o.plusValue            - plus-value brute de l'année
 * @param {number}  [o.moinsValuesReportees=0] - stock de moins-values reportables imputables
 * @param {boolean} [o.optionBareme=false] - option barème progressif (globale capital)
 * @param {boolean} [o.anteriorite2018=false] - titres acquis avant le 1er janvier 2018
 * @param {string}  [o.typeAbattement='droit_commun'] - 'droit_commun' | 'renforce_pme'
 * @param {number}  [o.dureeDetention=0]   - durée de détention en années
 * @param {number}  [o.rniFoyer=0]         - RNI hors PV (pour l'IR marginal au barème)
 * @param {number}  [o.parts=1]
 * @param {boolean} [o.isCouple=false]
 */
export function calcPvMobiliere({
  plusValue = 0, moinsValuesReportees = 0,
  optionBareme = false, anteriorite2018 = false, typeAbattement = 'droit_commun',
  dureeDetention = 0, rniFoyer = 0, parts = 1, isCouple = false,
} = {}) {
  const pv = Math.max(0, plusValue || 0);
  const mvImputees = Math.min(Math.max(0, moinsValuesReportees || 0), pv);
  const gainImposable = _round(pv - mvImputees);

  const ps    = _round(gainImposable * PFU_TAUX_PS);
  const irPfu = _round(gainImposable * PFU_TAUX_IR);

  const grille = typeAbattement === 'renforce_pme' ? PV_MOB_ABATT_RENFORCE_PME : PV_MOB_ABATT_DROIT_COMMUN;
  const abattementDuree = (optionBareme && anteriorite2018) ? tauxAbattementMobiliere(grille, dureeDetention) : 0;
  const baseIRBareme = _round(gainImposable * (1 - abattementDuree));
  const irBareme = Math.max(0, calcIR(rniFoyer + baseIRBareme, parts, isCouple) - calcIR(rniFoyer, parts, isCouple));

  const ir         = optionBareme ? irBareme : irPfu;
  const totalPfu    = irPfu + ps;
  const totalBareme = irBareme + ps;
  return {
    plusValue: pv, moinsValuesImputees: mvImputees, gainImposable,
    ps, irPfu, irBareme, ir,
    abattementDuree, baseIRBareme,
    total: ir + ps,
    totalPfu, totalBareme,
    recommande: totalBareme <= totalPfu ? 'bareme' : 'pfu',
    economie: Math.abs(totalPfu - totalBareme),
  };
}

/**
 * Plus-value de cession d'actifs numériques (crypto) — cases 3AN (gain) / 3BN (perte).
 * Source : plus-values-mobilieres-crypto.json → crypto_actifs.
 * - Exonération TOTALE si cessions cumulées de l'année ≤ 305 € (au-delà : imposition
 *   intégrale de la PV, pas seulement la fraction excédentaire).
 * - PFU 30 % par défaut (12,8 % IR + 17,2 % PS), option barème possible.
 *
 * @param {object} o
 * @param {number}  o.plusValue          - plus-value nette de l'année (gains − pertes crypto)
 * @param {number}  [o.totalCessions=0]  - montant total des cessions de l'année (déclenche le seuil 305 €)
 * @param {boolean} [o.optionBareme=false]
 * @param {number}  [o.rniFoyer=0]
 * @param {number}  [o.parts=1]
 * @param {boolean} [o.isCouple=false]
 */
export function calcCrypto({
  plusValue = 0, totalCessions = 0, optionBareme = false,
  rniFoyer = 0, parts = 1, isCouple = false,
} = {}) {
  const pv       = Math.max(0, plusValue || 0);
  const cessions = Math.max(0, totalCessions || 0);
  const exonere  = cessions > 0 && cessions <= CRYPTO_SEUIL_EXONERATION;
  if (exonere || pv <= 0) {
    return {
      plusValue: pv, totalCessions: cessions, exonere,
      seuilExoneration: CRYPTO_SEUIL_EXONERATION,
      ps: 0, irPfu: 0, irBareme: 0, ir: 0, total: 0,
      totalPfu: 0, totalBareme: 0, recommande: 'pfu', economie: 0,
    };
  }
  const ps      = _round(pv * PFU_TAUX_PS);
  const irPfu   = _round(pv * PFU_TAUX_IR);
  const irBareme = Math.max(0, calcIR(rniFoyer + pv, parts, isCouple) - calcIR(rniFoyer, parts, isCouple));
  const ir      = optionBareme ? irBareme : irPfu;
  return {
    plusValue: pv, totalCessions: cessions, exonere: false,
    seuilExoneration: CRYPTO_SEUIL_EXONERATION,
    ps, irPfu, irBareme, ir, total: ir + ps,
    totalPfu: irPfu + ps, totalBareme: irBareme + ps,
    recommande: (irBareme + ps) <= (irPfu + ps) ? 'bareme' : 'pfu',
    economie: Math.abs(irPfu - irBareme),
  };
}

/**
 * Fiscalité d'un rachat d'assurance-vie (de vivant) — art. 125-0 A CGI.
 * Cases 2042 : 2CG (gains au PFU) / 2BH (gains au barème sur option).
 * Entrée = part de produits imposable fournie par l'assureur (pas de recalcul de
 * proportionnalité). Millésime 2025 : un contrat pré-27/09/2017 est ≥ 8 ans → le
 * régime ne dépend que de l'ancienneté :
 *   ≥ 8 ans : abattement (4 600/9 200 €, IR uniquement) puis 7,5 % ; PS 17,2 % pleins.
 *   < 8 ans : PFU 12,8 % sans abattement ; PS 17,2 %.
 * Fraction de versements > 150 000 € (12,8 % sur l'excédent) : signalée (flag), non calculée.
 *
 * @param {object} o
 * @param {number}  o.gainsRachat        - part de produits imposable (assureur)
 * @param {boolean} o.contratHuitAns     - contrat ≥ 8 ans
 * @param {number}  [o.primesNettesFoyer=0] - total versements nets foyer (flag 150 k)
 * @param {number}  [o.rniFoyer=0] @param {number} [o.parts=1] @param {boolean} [o.isCouple=false]
 */
export function calcRachatAV({
  gainsRachat = 0, contratHuitAns = false, primesNettesFoyer = 0,
  rniFoyer = 0, parts = 1, isCouple = false,
} = {}) {
  const gains = Math.max(0, gainsRachat || 0);
  const abattement = contratHuitAns
    ? (isCouple ? AV_ABATTEMENT_8ANS_COUPLE : AV_ABATTEMENT_8ANS_SOLO)
    : 0;
  const baseIR = Math.max(0, gains - abattement);
  const tauxIR = contratHuitAns ? AV_TAUX_IR_APRES_8ANS : PFU_TAUX_IR;
  const ir = _round(baseIR * tauxIR);
  const ps = _round(gains * TAUX_PS_CAPITAL);
  const total = ir + ps;

  // Arbitrage barème (case 2BH) — informatif : IR marginal sur la base après abattement.
  const irBareme = gains > 0
    ? Math.max(0, calcIR(rniFoyer + baseIR, parts, isCouple) - calcIR(rniFoyer, parts, isCouple))
    : 0;
  const totalBareme = irBareme + ps;

  return {
    gainsRachat: gains, abattement, baseIR, ir, ps, total, tauxIR,
    case2042: '2CG',
    bareme: {
      ir: irBareme, total: totalBareme,
      recommande: totalBareme <= total ? 'bareme' : 'pfu',
      economie: Math.abs(total - totalBareme),
    },
    flags: { primesSuperieur150k: (primesNettesFoyer || 0) > AV_SEUIL_PRIMES_TAUX_REDUIT },
  };
}

/** Abattement durée de détention PV immo — grille IR (exonération 22 ans). */
function tauxAbattementImmoIR(duree) {
  const g = PV_IMMO_ABATT_IR;
  const d = Math.max(0, duree || 0);
  if (d <= g.seuil_debut_annees) return 0;
  if (d >= g.exoneration_totale_annees) return 1;
  const annees = Math.min(d, 21) - g.seuil_debut_annees;
  return Math.min(1, annees * g.taux_annuel_6_a_21);
}

/** Abattement durée de détention PV immo — grille PS (exonération 30 ans). */
function tauxAbattementImmoPS(duree) {
  const g = PV_IMMO_ABATT_PS;
  const d = Math.max(0, duree || 0);
  if (d <= g.seuil_debut_annees) return 0;
  if (d >= g.exoneration_totale_annees) return 1;
  let t = (Math.min(d, 21) - g.seuil_debut_annees) * g.taux_annuel_6_a_21;
  if (d >= 22) t += g.taux_annee_22;
  if (d >= 23) t += (Math.min(d, 30) - 22) * g.taux_annuel_23_a_30;
  return Math.min(1, t);
}

/**
 * Surtaxe sur les plus-values immobilières imposables > 50 000 € (art. 1609 nonies G CGI).
 * Source : plus-values-immo-abattements.json → surtaxe_pv_importantes.bareme.
 * Assise = PV imposable après abattements durée (base IR). Taux progressif 2 %→6 %
 * avec lissage dans les tranches de transition : taxe = taux × PV − (borne − PV) × coef.
 *
 * @param {number} pvImposable - plus-value imposable après abattements (base IR)
 * @returns {number} surtaxe en €
 */
export function calcSurtaxePvImmo(pvImposable = 0) {
  const pv = Math.max(0, pvImposable || 0);
  if (pv <= PV_IMMO_SURTAXE_SEUIL) return 0;
  const t = PV_IMMO_SURTAXE_BAREME.find(b => pv >= b.min && (b.max == null || pv <= b.max));
  if (!t) return 0;
  const lissage = t.lissage_borne != null ? (t.lissage_borne - pv) * t.lissage_coef : 0;
  return Math.max(0, _round(t.taux * pv - lissage));
}

/**
 * Plus-value immobilière des particuliers (cession d'un bien autre que la RP).
 * Source : plus-values-immo-abattements.json (BOI-RFPI-PVI).
 * IMPORTANT : impôt prélevé À LA SOURCE par le notaire au moment de la cession,
 * HORS déclaration annuelle de revenus → résultat = ESTIMATION (non ajoutée au
 * solde IR annuel). IR 19 % + PS 17,2 % + surtaxe, sur la PV après abattements
 * durée (grilles distinctes IR 22 ans / PS 30 ans). Exonérations : RP, petit prix.
 *
 * @param {object} o
 * @param {number}  o.prixCession           - prix de vente
 * @param {number}  o.prixAcquisition       - prix d'achat d'origine
 * @param {number}  [o.fraisAcqReels=0]     - frais d'acquisition réels (sinon forfait 7,5 %)
 * @param {number}  [o.travauxReels=0]      - travaux réels (sinon forfait 15 % si détention ≥ 5 ans)
 * @param {number}  [o.dureeDetention=0]    - durée de détention en années
 * @param {boolean} [o.residencePrincipale=false] - exonération totale si RP
 * @returns {object}
 */
export function calcPvImmo({
  prixCession = 0, prixAcquisition = 0,
  fraisAcqReels = 0, travauxReels = 0,
  dureeDetention = 0, residencePrincipale = false,
} = {}) {
  const cession = Math.max(0, prixCession || 0);
  const acq     = Math.max(0, prixAcquisition || 0);

  // Exonérations totales.
  if (residencePrincipale) {
    return { exonere: true, motifExoneration: 'residence_principale', pvBrute: 0, baseIR: 0, basePS: 0, ir: 0, ps: 0, surtaxe: 0, total: 0 };
  }
  if (cession > 0 && cession <= PV_IMMO_SEUIL_PETIT_PRIX) {
    return { exonere: true, motifExoneration: 'petit_prix', pvBrute: 0, baseIR: 0, basePS: 0, ir: 0, ps: 0, surtaxe: 0, total: 0 };
  }

  const fraisAcq = fraisAcqReels > 0 ? fraisAcqReels : _round(acq * PV_IMMO_FRAIS_ACQ_FORFAIT);
  const travaux  = travauxReels > 0
    ? travauxReels
    : (dureeDetention >= PV_IMMO_TRAVAUX_DETENTION_MIN ? _round(acq * PV_IMMO_TRAVAUX_FORFAIT) : 0);
  const prixAcqMajore = acq + fraisAcq + travaux;
  const pvBrute = Math.max(0, _round(cession - prixAcqMajore));

  const abattIR = tauxAbattementImmoIR(dureeDetention);
  const abattPS = tauxAbattementImmoPS(dureeDetention);
  const baseIR  = _round(pvBrute * (1 - abattIR));
  const basePS  = _round(pvBrute * (1 - abattPS));

  const ir      = _round(baseIR * PV_IMMO_TAUX_IR);
  const ps      = _round(basePS * PV_IMMO_TAUX_PS);
  const surtaxe = calcSurtaxePvImmo(baseIR);

  return {
    exonere: false, motifExoneration: null,
    prixCession: cession, prixAcquisition: acq, fraisAcq, travaux, prixAcqMajore,
    pvBrute, abattIR, abattPS, baseIR, basePS,
    ir, ps, surtaxe, total: ir + ps + surtaxe,
  };
}

// ─── IFI & défiscalisation — PHASE 5 ─────────────────────────────────────────

/** Barème progressif IFI appliqué à l'assiette nette (à partir de 800 000 €). */
function _baremeIFI(assiette) {
  let ifi = 0;
  for (const t of IFI_TRANCHES) {
    if (t.au_dela != null) {
      if (assiette > t.au_dela) ifi += (assiette - t.au_dela) * t.taux;
    } else if (assiette > t.de) {
      ifi += (Math.min(assiette, t.a) - t.de) * t.taux;
    }
  }
  return ifi;
}

/**
 * Impôt sur la Fortune Immobilière (IFI) — art. 964 et s. CGI / BOI-PAT-IFI.
 * Source : ifi-bareme.json. Impôt DISTINCT de l'IR (avis séparé), non ajouté au
 * total dû IR. Assiette nette = patrimoine immobilier brut − abattement 30 % RP
 * − passif déductible. Assujetti si assiette ≥ 1 300 000 € ; barème appliqué dès
 * 800 000 € ; décote de lissage entre 1,3 et 1,4 M€.
 * Le plafonnement à 75 % des revenus et les exonérations « biens professionnels »
 * sont signalés mais NON calculés → routage CGP (cf. detector).
 *
 * @param {object} o
 * @param {number} o.patrimoineImmoBrut - valeur vénale brute du patrimoine immobilier taxable
 * @param {number} [o.valeurRP=0]       - valeur de la résidence principale (abattement 30 %)
 * @param {number} [o.passif=0]         - passif déductible (CRD emprunts, travaux, impôts afférents)
 */
export function calcIFI({ patrimoineImmoBrut = 0, valeurRP = 0, passif = 0 } = {}) {
  const brut         = Math.max(0, patrimoineImmoBrut || 0);
  const abattementRP = _round(Math.max(0, valeurRP || 0) * IFI_ABATTEMENT_RP);
  const passifDed    = Math.max(0, passif || 0);
  const assietteNette = Math.max(0, brut - abattementRP - passifDed);
  const assujetti     = assietteNette >= IFI_SEUIL_ASSUJETTISSEMENT;
  if (!assujetti) {
    return {
      assujetti: false, patrimoineImmoBrut: brut, abattementRP, passif: passifDed,
      assietteNette, seuil: IFI_SEUIL_ASSUJETTISSEMENT, ifiBrut: 0, decote: 0, ifi: 0,
    };
  }
  const ifiBrut = _round(_baremeIFI(assietteNette));
  // Décote de lissage entre le seuil et le plafond d'application (1,3–1,4 M€).
  const decote = assietteNette <= IFI_DECOTE.plafond_application
    ? Math.max(0, Math.min(ifiBrut, _round(IFI_DECOTE.montant_fixe - IFI_DECOTE.taux * assietteNette)))
    : 0;
  const ifi = Math.max(0, ifiBrut - decote);
  return {
    assujetti: true, patrimoineImmoBrut: brut, abattementRP, passif: passifDed,
    assietteNette, seuil: IFI_SEUIL_ASSUJETTISSEMENT, ifiBrut, decote, ifi,
  };
}

/**
 * Réduction d'impôt d'un dispositif de défiscalisation à mode « versement ».
 * Source : defiscalisation.json → dispositifs. Réduction = taux × min(versement,
 * plafond) ; le plafond dépend de la situation (célibataire/couple) si applicable.
 * Les dispositifs en mode « report » (Pinel/Denormandie/Censi-Bouvard fermés,
 * Girardin) ne sont PAS calculés ici (réduction saisie / routage).
 *
 * @param {object} o
 * @param {string}  o.dispositif        - clé dans DEFISC_DISPOSITIFS (fcpi, fip, sofica…)
 * @param {number}  o.versement         - montant investi / souscrit dans l'année
 * @param {boolean} [o.isCouple=false]  - sélectionne le plafond de versement couple
 * @param {number}  [o.tauxMajore]      - applique le taux majoré documenté (ex. FIP Corse 30 %)
 */
export function calcReductionDefisc({ dispositif, versement = 0, isCouple = false, tauxMajore = null } = {}) {
  const d = DEFISC_DISPOSITIFS[dispositif];
  if (!d) return null;
  const vers = Math.max(0, versement || 0);
  const plafond = isCouple
    ? (d.plafond_versement_couple ?? d.plafond_versement_celibataire ?? d.plafond_versement_annuel ?? d.plafond_versement_absolu ?? Infinity)
    : (d.plafond_versement_celibataire ?? d.plafond_versement_annuel ?? d.plafond_versement_absolu ?? Infinity);
  const versementRetenu = Math.min(vers, plafond);
  const taux = (tauxMajore && d.taux_majore_possible) ? d.taux_majore_possible : d.taux;
  const reduction = (d.mode === 'versement' && taux)
    ? _round(versementRetenu * taux)
    : 0;
  return {
    dispositif, libelle: d.libelle, case: d.case, mode: d.mode,
    statut: d.statut, ferme: String(d.statut || '').startsWith('ferme'),
    categoriePlafond: d.categorie_plafond,
    versement: vers, versementRetenu, plafond, taux,
    reduction,
  };
}

/**
 * Plafonnement global des niches à deux étages (art. 200-0 A CGI).
 * Source : niches-fiscales.json → plafonnement_global. Plafond de base 10 000 €
 * sur l'ensemble ; la part SOFICA + outre-mer (Girardin) bénéficie du plafond
 * majoré 18 000 € — la part non-spécifique restant plafonnée à 10 000 €.
 *
 * @param {object} o
 * @param {number} o.global      - somme des réductions de catégorie « global_10k »
 * @param {number} o.specifique  - somme des réductions SOFICA / outre-mer (« specifique_18k »)
 * @returns {{ partGlobale:number, partSpecifique:number, avantageRetenu:number, exces:number, plafondEffectif:number, actif:boolean }}
 */
export function plafonnementNichesDeuxEtages({ global = 0, specifique = 0 } = {}) {
  const g = Math.max(0, global || 0);
  const s = Math.max(0, specifique || 0);
  const partGlobale     = Math.min(g, PLAFOND_NICHES_METROPOLE);
  const partSpecifique  = Math.min(s, PLAFOND_NICHES_MAJORE - partGlobale);
  const avantageRetenu  = partGlobale + partSpecifique;
  const exces           = Math.max(0, (g + s) - avantageRetenu);
  return {
    partGlobale, partSpecifique, avantageRetenu, exces,
    plafondEffectif: s > 0 ? PLAFOND_NICHES_MAJORE : PLAFOND_NICHES_METROPOLE,
    actif: (g + s) > avantageRetenu,
  };
}

// ─── Fiscalité internationale — PHASE 6 ──────────────────────────────────────

/**
 * Méthode du taux effectif (exemption avec progressivité) — convention bilatérale.
 * Source : fiscalite-internationale.json → methodes...taux_effectif (case 8TI).
 * Le revenu étranger est EXONÉRÉ mais retenu pour déterminer le taux moyen :
 *   IR dû = IR(revenu mondial) × (revenus français / revenu mondial).
 * Utilise calcIR (barème seul) ; l'intégration QF/décote vit dans computeFoyerSummary.
 *
 * @param {object} o
 * @param {number} o.revenusFrancais           - RNI de source française
 * @param {number} o.revenusEtrangersExoneres  - revenus étrangers exonérés (8TI), retenus pour le taux
 * @param {number} [o.parts=1]
 * @param {boolean} [o.isCouple=false]
 */
export function calcTauxEffectif({ revenusFrancais = 0, revenusEtrangersExoneres = 0, parts = 1, isCouple = false } = {}) {
  const fr    = Math.max(0, revenusFrancais || 0);
  const etr   = Math.max(0, revenusEtrangersExoneres || 0);
  const monde = fr + etr;
  if (etr <= 0 || monde <= 0) {
    const ir = calcIR(fr, parts, isCouple);
    return { revenusFrancais: fr, revenusEtrangersExoneres: etr, revenuMondial: monde, irMondial: ir, coef: 1, irFrancais: ir, tauxMoyen: fr > 0 ? ir / fr : 0 };
  }
  const irMondial  = calcIR(monde, parts, isCouple);
  const coef       = fr / monde;
  const irFrancais = _round(irMondial * coef);
  return { revenusFrancais: fr, revenusEtrangersExoneres: etr, revenuMondial: monde, irMondial, coef, irFrancais, tauxMoyen: monde > 0 ? irMondial / monde : 0 };
}

/**
 * Crédit d'impôt étranger (méthode de l'imputation) — case 8TK.
 * Source : fiscalite-internationale.json → methodes...imputation_credit.
 * Le revenu étranger est imposé en France (déjà inclus dans le RNI) ; le crédit
 * d'impôt est plafonné à la quote-part d'impôt français afférente à ce revenu.
 *
 * @param {object} o
 * @param {number} o.montant8TK            - crédit d'impôt étranger déclaré (8TK)
 * @param {number} [o.quotePartIRFrancais] - plafond = IR français afférent au revenu étranger
 */
export function calcCreditImpotEtranger({ montant8TK = 0, quotePartIRFrancais = Infinity } = {}) {
  const montant = Math.max(0, montant8TK || 0);
  const plafond = Math.max(0, quotePartIRFrancais);
  return { montant8TK: montant, plafond, credit: _round(Math.min(montant, plafond)) };
}

// ─── CEHR — Contribution Exceptionnelle Hauts Revenus ────────────────────────

// Barème CEHR — source unique : bareme-ir-YYYY.json → cehr (art. 223 sexies CGI).
export const CEHR_BAREME = baremeRaw.cehr;

function _cehrSurTranches(tranches, rfr) {
  let total = 0;
  for (const t of tranches) {
    if (t.au_dela != null) {
      if (rfr > t.au_dela) total += (rfr - t.au_dela) * t.taux;
    } else if (rfr > t.de) {
      total += (Math.min(rfr, t.a) - t.de) * t.taux;
    }
  }
  return total;
}

/**
 * Calcule la CEHR (art. 223 sexies CGI).
 * Base = RFR (pas le RNI). S'ajoute à l'IR net.
 * Seuils et taux : voir le bloc `cehr` du JSON barème (seuils doublés en couple).
 *
 * @param {number}  rfr       - Revenu Fiscal de Référence
 * @param {boolean} isCouple
 * @returns {number} CEHR en €
 */
export function calcCEHR(rfr, isCouple = false) {
  if (!rfr || rfr <= 0) return 0;
  const tranches = isCouple ? CEHR_BAREME.seuils_couple : CEHR_BAREME.seuils_celibataire;
  return Math.round(_cehrSurTranches(tranches, rfr));
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
  return Math.max(0, Math.round(plafond - DECOTE.taux * brut));
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
  const foncier = (p.revensFonciers || 0) * (p.regimeFoncier === 'reel' ? 1 : 1 - ABATTEMENT_MICRO_FONCIER);
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
  const brut       = base > 0 ? Math.round(base * TAUX_PLAFOND_PER) : 0;
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
  const brut10      = rni > 0 ? Math.round(rni * TAUX_PLAFOND_PER) : 0;
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
  // PHASE 4 : un foyer peut n'avoir QUE des revenus du capital imposés hors barème
  // (plus-values mobilières/crypto au PFU, PS immobiliers) → RNI barème nul mais
  // impôt dû. On poursuit le calcul si une base de capital/PS est présente.
  const hasCapitalBase = (profile.pvCapitalIR || 0) > 0
                      || (profile.pvCapitalPsBase || 0) > 0
                      || (profile.immoPsBase || 0) > 0
                      || (profile.ifiDu || 0) > 0;   // IFI seul (RNI barème nul mais patrimoine taxable)
  if (!rniFoyer && !hasCapitalBase) return null;

  const partsBase = isCouple ? 2 : 1;
  const qfOpts    = {
    nbDemiPartsT:          profile.nbDemiPartsT || 0,
    nbDemiPartsL:          profile.nbDemiPartsL || 0,
    nbDemiPartsInvalidite: profile.nbDemiPartsInvalidite || 0,
  };
  // PHASE 6 : méthode du taux effectif — le revenu étranger exonéré (8TI) gonfle
  // la base servant au barème, puis l'IR est proraté revenus français / mondial.
  const revEtrTauxEffectif = profile.revEtrTauxEffectif || 0;
  const rniBareme          = rniFoyer + revEtrTauxEffectif;
  const tauxEffectifCoef   = revEtrTauxEffectif > 0 && rniBareme > 0 ? rniFoyer / rniBareme : 1;

  const qf            = plafonnementQF(rniBareme, parts, partsBase, QF_PLAFONDS, qfOpts);
  const irBrutVal     = qf.irSelon;
  const irPlafonneVal = qf.irPlafonne;
  const decoteVal     = applyDecote(irPlafonneVal, isCouple);
  // IR mondial (barème + QF + décote) proraté à la part française (taux effectif).
  const irApresDecote = _round(Math.max(0, irPlafonneVal - decoteVal) * tauxEffectifCoef);

  // Étape réductions/crédits avec plafonnement global des niches (art. 200-0 A CGI).
  // Réductions grand public (PHASE 1) — HORS plafond global : dons, scolarité.
  const reductionDons      = calcReductionDons(profile.donsAidePersonnes || 0, profile.donsGeneral || 0, rniFoyer);
  const reductionScolarite = calcReductionScolarite({
    college: profile.scolCollege || 0, lycee: profile.scolLycee || 0, sup: profile.scolSup || 0,
  });
  // Avantages SOUMIS au plafond global (PHASE 5 : Pinel/FCPI/SOFICA/Madelin…).
  // Plafonnement à deux étages : base 10 000 € + part SOFICA/outre-mer jusqu'à 18 000 €.
  const niches = plafonnementNichesDeuxEtages({
    global:     profile.reductionsNichesSoumises    || 0,
    specifique: profile.reductionsNichesSpecifiques || 0,
  });
  const reductionsHorsPlafond = reductionDons + reductionScolarite + (profile.reductionsHorsPlafond || 0);
  const reductionsRetenues    = niches.avantageRetenu + reductionsHorsPlafond;
  // Réductions : ne rendent pas l'impôt négatif. Crédits (remboursables) : gérés au solde.
  const irNetAvantCreditEtranger = Math.max(0, irApresDecote - reductionsRetenues);

  // PHASE 6 : crédit d'impôt étranger (8TK, méthode de l'imputation) — plafonné à la
  // quote-part d'IR français afférente au revenu de source étrangère imposé en France.
  const revEtrImputation = profile.revEtrImputation || 0;
  const montant8TK       = profile.creditImpotEtranger8TK || 0;
  const quotePartIREtranger = (revEtrImputation > 0 && rniFoyer > 0)
    ? Math.round(irNetAvantCreditEtranger * Math.min(1, revEtrImputation / rniFoyer))
    : irNetAvantCreditEtranger;
  const creditImpotEtranger = montant8TK > 0
    ? calcCreditImpotEtranger({ montant8TK, quotePartIRFrancais: quotePartIREtranger }).credit
    : 0;
  const irNet = Math.max(0, irNetAvantCreditEtranger - creditImpotEtranger);

  // Crédits d'impôt remboursables grand public : emploi à domicile, garde < 6 ans,
  // cotisations syndicales (art. 199 sexdecies / quater B / 200 quater B CGI).
  const nbPersonnesACharge   = (profile.nbEnfants || 0) + (profile.nbEnfantsAlternes || 0);
  const creditEmploiDomicile = calcCreditEmploiDomicile(profile.emploiDomicileDepense || 0, nbPersonnesACharge);
  const creditGarde          = calcCreditGarde(profile.gardeDepense || 0, profile.nbEnfants || 0, profile.nbEnfantsAlternes || 0);
  const creditSyndicales     = calcCreditSyndicales(profile.syndicatCotisation || 0, rniFoyer);

  // Arbitrage 2OP — verdict GLOBAL (div + intérêts + PV) écrit au TXT par le
  // générateur (source '2op'). Fallback anciens profils / sans PV : arbitrage
  // partiel div + intérêts (exact quand PV = 0).
  const arbitrageCapital = profile.arb2opRecommande
    ? {
        pfu:        profile.arb2opPfu || 0,
        bareme:     profile.arb2opBareme || 0,
        recommande: profile.arb2opRecommande,
        economie:   profile.arb2opEconomie || 0,
        source:     '2op',
      }
    : {
        ...arbitragePfuBareme({
          dividendes: profile.dividendes2DC || 0,
          interets:   profile.intMob2TR || 0,
          rniFoyer, parts, isCouple,
        }),
        source: 'fallback',
      };

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

  // PHASE 4 : plus-values mobilières (3VG) + crypto (3AN) imposées sur la déclaration
  // annuelle. IR (PFU 12,8 % ou barème) consolidé par le générateur ; PS 17,2 % sur la
  // base consolidée. La PV immobilière est prélevée à la source par le notaire → hors total dû.
  const pvCapitalIR = profile.pvCapitalIR || 0;
  const psCapital   = Math.round((profile.pvCapitalPsBase || 0) * TAUX_PS_CAPITAL);

  const totalDu = irNet + cehr + psFoncier + psImmo + pvCapitalIR + psCapital;

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
  const tmi   = getTMI(rniBareme, parts);   // PHASE 6 : TMI sur la base mondiale (taux effectif)

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
    nichesPlafond: niches.plafondEffectif,
    nichesExces: niches.exces,
    nichesPartGlobale: niches.partGlobale,
    nichesPartSpecifique: niches.partSpecifique,
    cehr,
    irNet,
    psFoncier,
    psImmo,
    psImmoBase: profile.immoPsBase || 0,
    immoDeltaRni: profile.immoDeltaRni || 0,
    pvCapitalIR,
    psCapital,
    pvCapitalPsBase: profile.pvCapitalPsBase || 0,
    // PHASE 5 : IFI — impôt distinct (avis séparé), NON inclus dans totalDu IR.
    ifi: profile.ifiDu || 0,
    ifiAssiette: profile.ifiAssiette || 0,
    // PHASE 6 : international — taux effectif (IR proraté) + crédit d'impôt étranger 8TK.
    revEtrTauxEffectif,
    tauxEffectifCoef,
    creditImpotEtranger,
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
    // Cycle de vie : âge & phase patrimoniale exposés depuis la source de vérité
    // (parsedProfile), pour le conseil personnalisé. Voir lifeStage.deriveLifeStage.
    ageD1: profile.ageD1 || 0,
    ageD2: profile.ageD2 || 0,
    lifeStage: deriveLifeStage(profile),
  };
}
