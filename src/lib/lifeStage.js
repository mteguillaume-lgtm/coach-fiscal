/**
 * lifeStage.js — Détecteur de cycle de vie patrimonial.
 *
 * Module PUR (aucune dépendance UI, aucun effet de bord). Il transforme l'âge et
 * l'horizon de retraite déjà parsés (parsedProfile, source de vérité unique) en une
 * « phase patrimoniale » exploitable par le conseil IA (Profile.jsx) et le conseil
 * déterministe (Rapport.jsx).
 *
 * Règle stricte : AUCUN montant / abattement en euros n'est défini ici. Les seuils
 * d'ÂGE structurants (pivot AV 70 ans, donateur don familial < 80 ans) proviennent
 * de Paperasse (abattements-succession-donation.json → seuils_age). Les euros associés
 * (152 500 €, 30 500 €, 100 000 €, 31 865 €) sont exposés par taxCalculator.js.
 *
 * Ce fichier n'importe PAS taxCalculator.js → pas de dépendance circulaire
 * (taxCalculator → lifeStage uniquement).
 */

import transmissionRaw from '../data/paperasse/notaire/data/abattements-succession-donation.json';

// Seuils d'âge depuis Paperasse (jamais en dur).
const SEUIL_AGE_AV_TRANSMISSION = transmissionRaw.seuils_age.av_transmission_pivot_versement;   // 70 ans
const SEUIL_AGE_DON_FAMILIAL    = transmissionRaw.seuils_age.don_familial_age_max_donateur;      // 80 ans

// Fenêtre « approche du pivot 70 ans » : un déclarant dont l'âge tombe dans
// [pivot − N, pivot] doit arbitrer ses versements AV avant la bascule 990 I → 757 B.
const AV70_FENETRE_ANS = 2;

/**
 * Heuristique des phases patrimoniales — CONFIGURABLE ici, et NULLE PART AILLEURS.
 * Bornes d'âge inclusives. Ordre du plus jeune au plus âgé.
 */
export const PHASES = [
  {
    id: 'CONSTITUTION',
    label: 'Constitution',
    ageMin: 18,
    ageMax: 30,
    resume: 'Prendre date (horloges PEA 5 ans / AV 8 ans), allocation offensive long terme, épargne de précaution d\'abord. PER rarement pertinent si TMI 0/11 %.',
    allocation: 'offensive',          // part actions élevée
    perPertinent: 'rarement',
    transmission: false,
  },
  {
    id: 'ACCUMULATION',
    label: 'Accumulation',
    ageMin: 31,
    ageMax: 45,
    resume: 'Pic d\'investissement, levier immobilier, montée de la TMI. PER pertinent dès TMI 30 %.',
    allocation: 'dynamique',
    perPertinent: 'des-tmi-30',
    transmission: false,
  },
  {
    id: 'CONSOLIDATION',
    label: 'Consolidation',
    ageMin: 46,
    ageMax: 55,
    resume: 'TMI souvent au plus haut → PER prioritaire, diversification. Amorcer la transmission tôt (cycles d\'abattement de 15 ans).',
    allocation: 'equilibree',
    perPertinent: 'prioritaire',
    transmission: true,
  },
  {
    id: 'PRE_RETRAITE',
    label: 'Pré-retraite',
    ageMin: 56,
    ageMax: 65,
    resume: 'Glidepath : réduire les actions, sécuriser le fonds €. Préparer la sortie PER (capital vs rente), vérifier la clause bénéficiaire AV AVANT 70 ans.',
    allocation: 'prudente',
    perPertinent: 'sortie-a-preparer',
    transmission: true,
  },
  {
    id: 'RETRAITE',
    label: 'Retraite',
    ageMin: 66,
    ageMax: Infinity,
    resume: 'Décumulation, vigilance seuil 70 ans AV (990 I avant / 757 B après), transmission active (donation, démembrement), IFI.',
    allocation: 'securisee',
    perPertinent: 'decumulation',
    transmission: true,
  },
];

// Phases déclenchant un glidepath (sécurisation progressive de l'allocation).
const PHASES_GLIDEPATH = ['CONSOLIDATION', 'PRE_RETRAITE', 'RETRAITE'];
const PHASE_RANK = Object.fromEntries(PHASES.map((p, i) => [p.id, i]));

/**
 * Phase patrimoniale pour un âge donné.
 * @param {number} age
 * @returns {object|null} l'objet PHASE, ou null si l'âge est absent / invalide.
 */
export function bandForAge(age) {
  if (!age || age <= 0) return null;
  return PHASES.find(p => age >= p.ageMin && age <= p.ageMax) || null;
}

/**
 * Horizon (années) avant la retraite pour un déclarant.
 * Priorité au champ horizon déjà dérivé par le parser ; sinon retraite − âge.
 * @returns {number|null} années (0 si déjà retraité), null si inconnu.
 */
function horizonForDeclarant(age, retraite, horizonField) {
  if (horizonField > 0) return horizonField;
  if (age > 0 && retraite > age) return retraite - age;
  if (age > 0 && retraite > 0 && age >= retraite) return 0;     // déjà en retraite
  return null;
}

/**
 * Détecte le cycle de vie patrimonial du foyer.
 *
 * @param {object} parsedProfile - objet plat issu de parseProfile (source de vérité).
 *   Champs utilisés : mode, ageD1, ageD2, retraiteD1, retraiteD2, horizonD1, horizonD2.
 * @returns {{
 *   bandD1: object|null, bandD2: object|null, bandFoyer: object|null,
 *   horizonInvestissement: number|null,
 *   degrade: boolean, vigilance: string|null,
 *   flags: { av70Proche: boolean, donFamilialPossible: boolean, glidepathRequis: boolean }
 * }}
 */
export function deriveLifeStage(parsedProfile) {
  const p = parsedProfile || {};
  const isCouple = p.mode === 'couple';

  const ageD1 = p.ageD1 || 0;
  const ageD2 = isCouple ? (p.ageD2 || 0) : 0;

  const bandD1 = bandForAge(ageD1);
  const bandD2 = isCouple ? bandForAge(ageD2) : null;

  // Comportement dégradé : aucun âge exploitable → pas de personnalisation.
  const aucunAge = !bandD1 && !bandD2;
  if (aucunAge) {
    return {
      bandD1: null,
      bandD2: null,
      bandFoyer: null,
      horizonInvestissement: null,
      degrade: true,
      vigilance: 'Âge non renseigné — conseil non personnalisé par cycle de vie ; complétez l\'âge pour un conseil adapté.',
      flags: {
        av70Proche: false,
        donFamilialPossible: false,
        glidepathRequis: false,
      },
    };
  }

  // ── Horizon d'investissement = déclarant le PLUS PROCHE de la retraite ──
  // La sécurisation (glidepath) du foyer est pilotée par le plus âgé / le plus proche.
  const hD1 = horizonForDeclarant(ageD1, p.retraiteD1 || 0, p.horizonD1 || 0);
  const hD2 = isCouple ? horizonForDeclarant(ageD2, p.retraiteD2 || 0, p.horizonD2 || 0) : null;
  const horizons = [hD1, hD2].filter(h => h != null);
  const horizonInvestissement = horizons.length ? Math.min(...horizons) : null;

  // ── bandFoyer = phase du déclarant le plus ÂGÉ (transmission / glidepath) ──
  // On compare par rang de phase, en se rabattant sur la seule phase connue.
  let bandFoyer = bandD1;
  if (bandD2 && (!bandD1 || PHASE_RANK[bandD2.id] > PHASE_RANK[bandD1.id])) {
    bandFoyer = bandD2;
  }

  // ── Flags ──
  const ages = [ageD1, ageD2].filter(a => a > 0);
  const av70Proche = ages.some(
    a => a >= SEUIL_AGE_AV_TRANSMISSION - AV70_FENETRE_ANS && a <= SEUIL_AGE_AV_TRANSMISSION,
  );
  // Don familial (art. 790 G) : possible tant qu'un donateur potentiel a < 80 ans.
  const donFamilialPossible = ages.some(a => a > 0 && a < SEUIL_AGE_DON_FAMILIAL);
  const glidepathRequis = !!bandFoyer && PHASES_GLIDEPATH.includes(bandFoyer.id);

  return {
    bandD1,
    bandD2,
    bandFoyer,
    horizonInvestissement,
    degrade: false,
    vigilance: null,
    flags: {
      av70Proche,
      donFamilialPossible,
      glidepathRequis,
    },
  };
}

/**
 * Contexte dérivé pour la feuille de route déterministe (Rapport.jsx).
 * Centralise les booléens de branchement par phase afin qu'ils soient testables
 * sans rendre le composant React. Rapport.jsx consomme directement cet objet.
 *
 * @param {object} parsedProfile
 * @returns {{
 *   lifeStage: object, phase: string|null,
 *   enConstitution: boolean, enRetraite: boolean,
 *   transmissionPertinente: boolean, securisationRequise: boolean,
 *   peaHorlogeUtile: boolean, horizon: number|null
 * }}
 */
export function deriveRoadmapContext(parsedProfile) {
  const lifeStage = deriveLifeStage(parsedProfile);
  const phase = lifeStage.bandFoyer?.id || null;
  const horizon = lifeStage.horizonInvestissement;
  return {
    lifeStage,
    phase,
    enConstitution: phase === 'CONSTITUTION',
    enRetraite: phase === 'RETRAITE',
    // Transmission pertinente dès CONSOLIDATION (cycles d'abattement de 15 ans).
    transmissionPertinente: !!lifeStage.bandFoyer?.transmission,
    // Sécurisation renforcée à l'approche / pendant la retraite.
    securisationRequise: phase === 'PRE_RETRAITE' || phase === 'RETRAITE',
    // Horloge PEA (5 ans) peu utile si l'horizon de liquidité est très court.
    peaHorlogeUtile: horizon == null || horizon >= 5,
    horizon,
  };
}
