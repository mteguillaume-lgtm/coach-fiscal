import { n } from '../../lib/profileParserUtils.js';

/**
 * Réductions & crédits d'impôt grand public (PHASE 1).
 * Le plugin ré-extrait les dépenses brutes du profil ; les montants de
 * réduction/crédit sont calculés dans taxCalculator.computeFoyerSummary
 * (qui dispose du RNI et de la composition du foyer pour les plafonds).
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'reductions-credits',
  label: 'Réductions et crédits d\'impôt (dons, garde, emploi à domicile, scolarité, syndicales)',
  version: '1.0.0',

  fields: [],   // collecte gérée par la section « Déductions » de Collect.jsx

  parser(text /*, mode */) {
    return {
      donsGeneral:           n(text, /Dons associations\s*:\s*([\d\s,]+)\s*€/i),
      donsAidePersonnes:     n(text, /Dons aide aux personnes[^:\n]*:\s*([\d\s,]+)\s*€/i),
      gardeDepense:          n(text, /Frais garde enfants\s*:\s*([\d\s,]+)\s*€/i),
      emploiDomicileDepense: n(text, /Emploi à domicile\s*:\s*([\d\s,]+)\s*€/i),
      syndicatCotisation:    n(text, /Cotisations syndicales\s*:\s*([\d\s,]+)\s*€/i),
      scolCollege:           n(text, /scolarité[^\n]*collège\s*(\d+)/i),
      scolLycee:             n(text, /scolarité[^\n]*lycée\s*(\d+)/i),
      scolSup:               n(text, /scolarité[^\n]*supérieur\s*(\d+)/i),
    };
  },

  generator() { return ''; },  // émis par profileGenerator (section Déductions)

  validator(formData) {
    const errors = [];
    for (const k of ['dons', 'garde', 'domicile', 'syndicat']) {
      const v = parseFloat(formData?.[k]);
      if (formData?.[k] && (isNaN(v) || v < 0)) {
        errors.push({ field: k, message: `Montant invalide (≥ 0) : ${k}` });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },  // montants calculés dans computeFoyerSummary

  declarativeCases() {
    return [
      { caseCode: '7UF', label: 'Dons d\'intérêt général (réduction 66%)',            declarant: 'foyer', required: false },
      { caseCode: '7UD', label: 'Dons aide aux personnes (réduction 75%)',            declarant: 'foyer', required: false },
      { caseCode: '7DB', label: 'Emploi à domicile (crédit 50%)',                     declarant: 'foyer', required: false },
      { caseCode: '7GA', label: 'Garde d\'enfant < 6 ans hors domicile (crédit 50%)', declarant: 'foyer', required: false },
      { caseCode: '7EA', label: 'Frais de scolarité (réduction forfaitaire)',         declarant: 'foyer', required: false },
      { caseCode: '7AC', label: 'Cotisations syndicales (crédit 66%)',                declarant: 'foyer', required: false },
    ];
  },
};
