import { n, s } from '../../lib/profileParserUtils.js';
import { LMNP_MICRO_REGIMES } from '../../lib/taxCalculator.js';

/**
 * Location meublée non professionnelle (LMNP) au régime micro-BIC.
 * Réforme loi Le Meur (revenus 2025) : 3 régimes — longue durée 50 % / 77 700 €,
 * meublé de tourisme classé 50 % / 77 700 €, meublé de tourisme non classé
 * 30 % / 15 000 €. Bénéfice = recettes − abattement, réintégré au RNI (BIC) et
 * soumis aux PS 17,2 %. Le calcul et la réintégration au foyer sont consolidés
 * par le générateur (_immoBlock → foncier-reel pour le RNI/PS). Ce plugin lit le
 * détail d'affichage et expose les cases déclaratives.
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'lmnp-micro',
  label: 'LMNP micro-BIC (loi Le Meur : 50 % / 30 %)',
  version: '1.0.0',

  fields: [],   // collectés en section Immobilier (Collect.jsx), émis par profileGenerator._immoBlock

  parser(text /*, mode — cas foyer */) {
    const lmnpMicroBenefice = n(text, /Bénéfice LMNP micro-BIC foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const lmnpMicroLabel    = s(text, /LMNP micro-BIC — (.+)/i);
    return { lmnpMicroBenefice, lmnpMicroLabel };
  },

  generator() { return ''; },   // émis par profileGenerator._immoBlock

  validator(formData) {
    const errors = [];
    const type = formData?.lmnp_type || '';
    const rec  = parseFloat(formData?.lmnp_recettes);
    if (type && !LMNP_MICRO_REGIMES[type]) {
      errors.push({ field: 'lmnp_type', message: 'Type de location meublée inconnu' });
    }
    if (formData?.lmnp_recettes !== undefined && formData?.lmnp_recettes !== '' && (isNaN(rec) || rec < 0)) {
      errors.push({ field: 'lmnp_recettes', message: 'Recettes invalides (≥ 0)' });
    }
    if (type && LMNP_MICRO_REGIMES[type] && rec > LMNP_MICRO_REGIMES[type].seuil) {
      errors.push({ field: 'lmnp_recettes', message: `Dépasse le seuil micro (${LMNP_MICRO_REGIMES[type].seuil.toLocaleString('fr-FR')} €) → régime réel, voir expert-comptable` });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },

  declarativeCases() {
    return [
      { caseCode: '5ND', label: 'Revenus LMNP micro-BIC (meublé longue durée / non classé)', declarant: 'foyer', required: false },
      { caseCode: '5NG', label: 'Revenus LMNP micro-BIC (meublé de tourisme classé / chambre d\'hôtes)', declarant: 'foyer', required: false },
    ];
  },
};
