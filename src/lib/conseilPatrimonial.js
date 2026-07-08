// ─── Conseil patrimonial universel & garde-fous — PHASE 7 ────────────────────
//
// Couche de SYNTHÈSE au-dessus de taxCalculator (computeFoyerSummary) et
// opportunitiesDetector (detectOpportunities). N'introduit aucun calcul fiscal :
// elle agrège les leviers de toutes les phases (0-6) en une synthèse rédigée,
// chiffrée, avec comparaison « sans action / avec action », détecte les zones hors
// périmètre pour orienter vers le bon professionnel, et porte le disclaimer global.

import { computeFoyerSummary } from './taxCalculator';
import { detectOpportunities } from './opportunitiesDetector';

export const DISCLAIMER_GLOBAL =
  "Cet outil est une aide à la décision : il ne se substitue pas à un conseil "
  + "professionnel personnalisé (expert-comptable, notaire, avocat fiscaliste, CGP). "
  + "Vérifiez toujours votre situation et vos déclarations sur impots.gouv.fr.";

export const LIEN_VERIF_OFFICIEL = 'https://www.impots.gouv.fr';

// Mention affichée en tête des leviers (audit E5) — pédagogie, pas de conseil
// en investissement personnalisé (frontière CIF/AMF).
export const MENTION_NON_CONSEIL =
  'Pistes pédagogiques chiffrées à partir de vos données — pas un conseil en '
  + 'investissement personnalisé. Chaque décision est à valider selon votre '
  + 'situation, le cas échéant avec un professionnel.';

const fmt = (v) => Math.round(v || 0).toLocaleString('fr-FR');

/**
 * Détecteur de « zones non couvertes » : signaux du profil qui sortent du périmètre
 * automatisable et appellent une orientation explicite vers un professionnel, plutôt
 * qu'un silence ou un calcul approximatif. Réutilise les flags déjà parsés (phases 0-6).
 *
 * @param {object} p - parsedProfile
 * @returns {Array<{id, signal, professionnel, pourquoi}>}
 */
export function detectZonesNonCouvertes(p = {}) {
  const zones = [];
  const add = (id, signal, professionnel, pourquoi) => zones.push({ id, signal, professionnel, pourquoi });

  // International (non-résident / impatrié / exit tax) — PHASE 6.
  if (p.intlRoutage) {
    add('international', 'Situation fiscale internationale (non-résident, impatrié ou exit tax)',
      'Avocat fiscaliste (fiscalité internationale)',
      'Les règles conventionnelles, le taux minimum des non-résidents (art. 197 A), l\'impatriation (155 B) et l\'exit tax (167 bis) ne sont pas automatisables sans risque.');
  }
  // LMNP / LMP au réel — PHASE 3.
  if ((p.lmnpReelNet || 0) > 0 || (p.lmnpReelDeficit || 0) > 0) {
    add('lmnp_reel', 'Location meublée au régime réel (amortissements, liasse 2031/2033-A)',
      'Expert-comptable',
      'Le calcul des amortissements et la liasse fiscale dépassent le périmètre de l\'outil ; le résultat doit être établi par un professionnel.');
  }
  // TNS au réel (bénéfice élevé sans régime micro lisible) — PHASE 2.
  if ((p.beneficeTnsImposable || 0) > 0 && ((p.recettesTnsD1 || 0) + (p.recettesTnsD2 || 0)) === 0) {
    add('tns_reel', 'Revenus d\'indépendant au régime réel (BIC/BNC, liasse 2031/2035)',
      'Expert-comptable',
      'Le résultat réel (charges réelles, amortissements) et les cotisations sociales nécessitent un expert-comptable.');
  }
  // IFI — PHASE 5.
  if ((p.ifiDu || 0) > 0) {
    add('ifi', 'Assujettissement à l\'IFI (plafonnement 75 %, biens professionnels, démembrement)',
      'CGP / notaire',
      'Le plafonnement à 75 % des revenus, l\'exonération des biens professionnels et les stratégies de démembrement requièrent un conseil dédié.');
  }
  // Dispositif de défiscalisation fermé en report — PHASE 5.
  if (p.defiscFerme) {
    add('defisc_ferme', 'Dispositif de défiscalisation en report (Pinel/Denormandie/Censi-Bouvard fermés)',
      'CGP',
      'La sortie de dispositif (revente, conservation, bascule LMNP) et la projection pluriannuelle relèvent d\'un conseil en gestion de patrimoine.');
  }
  // Plus-value immobilière — PHASE 4 (prélevée chez le notaire).
  if ((p.pvImmoEstimation || 0) > 0) {
    add('pv_immo', 'Plus-value immobilière (cession d\'un bien)',
      'Notaire',
      'Le calcul définitif (abattements, surtaxe, exonérations) est établi et prélevé par le notaire au moment de la vente.');
  }

  return zones;
}

/**
 * Synthèse patrimoniale rédigée — agrège tous les leviers détectés en une vue
 * « sans action / avec action » chiffrée. Aucun calcul fiscal propre : délègue à
 * computeFoyerSummary et detectOpportunities.
 *
 * @param {object} p              - parsedProfile
 * @param {object} [summary]      - résultat computeFoyerSummary (optionnel, recalculé sinon)
 * @param {Array}  [opportunities]- résultat detectOpportunities (optionnel, recalculé sinon)
 */
export function genererSynthese(p = {}, summary = null, opportunities = null) {
  const s    = summary || computeFoyerSummary(p) || {};
  const opps = opportunities || detectOpportunities(p) || [];

  // Leviers chiffrables (gain € positif) vs informatifs/alertes/routage.
  const leviersGain = opps.filter(o => o.type === 'gain' && (o.impactEuros || 0) > 0);
  const gainTotal   = leviersGain.reduce((acc, o) => acc + (o.impactEuros || 0), 0);

  const totalDuActuel       = Math.max(0, s.totalDu || 0);
  const totalDuApresAction  = Math.max(0, totalDuActuel - gainTotal);
  const zonesNonCouvertes   = detectZonesNonCouvertes(p);

  const actions = leviersGain
    .slice()
    .sort((a, b) => (b.impactEuros || 0) - (a.impactEuros || 0))
    .map(o => ({ id: o.id, titre: o.titre, impactEuros: o.impactEuros, action: o.action }));

  // Synthèse rédigée (3ᵉ personne, accessible).
  const phrases = [];
  if (totalDuActuel > 0) {
    phrases.push(`Le foyer présente un impôt sur le revenu estimé à ${fmt(totalDuActuel)} € (tranche marginale ${s.tmi || 0} %).`);
  } else {
    phrases.push(`Le foyer n'a pas d'impôt sur le revenu à payer dans la configuration actuelle.`);
  }
  if (gainTotal > 0) {
    phrases.push(`En activant ${leviersGain.length} levier${leviersGain.length > 1 ? 's' : ''} adapté${leviersGain.length > 1 ? 's' : ''} à sa situation, il pourrait réduire sa charge d'environ ${fmt(gainTotal)} €, ramenant le total dû à ${fmt(totalDuApresAction)} €.`);
  } else {
    phrases.push(`Aucun levier d'optimisation chiffrable n'a été détecté automatiquement ; un échange avec le conseil permet d'explorer des pistes personnalisées.`);
  }
  if (zonesNonCouvertes.length > 0) {
    phrases.push(`${zonesNonCouvertes.length} point${zonesNonCouvertes.length > 1 ? 's' : ''} de la situation dépasse${zonesNonCouvertes.length > 1 ? 'nt' : ''} le périmètre de l'outil et mérite${zonesNonCouvertes.length > 1 ? 'nt' : ''} l'avis d'un professionnel.`);
  }

  return {
    tmi: s.tmi || 0,
    totalDuActuel,
    gainTotal,
    totalDuApresAction,
    nbLeviers: opps.length,
    nbLeviersGain: leviersGain.length,
    actions,
    zonesNonCouvertes,
    synthese: phrases.join(' '),
    disclaimer: DISCLAIMER_GLOBAL,
    lienOfficiel: LIEN_VERIF_OFFICIEL,
  };
}
