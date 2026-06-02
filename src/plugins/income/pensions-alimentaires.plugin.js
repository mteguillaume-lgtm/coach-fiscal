import { n } from '../../lib/profileParserUtils.js';

/**
 * Pensions alimentaires & frais d'accueil — DÉDUCTIONS du revenu global
 * (art. 156-II CGI). Les montants sont calculés/plafonnés par le générateur
 * (calcDeductionsRevenu) ; ce plugin les ré-extrait du profil pour alimenter
 * le calcul du RNI (profileParser._rni) et la transparence du rapport.
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'pensions-alimentaires',
  label: 'Pensions alimentaires & frais d\'accueil (6EL/6EM/6GU/6EU/1AO)',
  version: '1.0.0',

  fields: [],   // collecte gérée par la section « Déductions » de Collect.jsx

  parser(text /*, mode */) {
    const pensionAlimVersee = n(text, /Pension alimentaire versée \(déductible\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const fraisAccueil      = n(text, /Frais d'accueil personne âgée[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const deductionsRevenu  = n(text, /Déductions du revenu \(total\)[^:\n]*:\s*([\d\s,]+)\s*€/i)
                           || (pensionAlimVersee + fraisAccueil);
    const pensionAlimRecue  = n(text, /Pension alimentaire reçue \(1AO\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
    return { pensionAlimVersee, fraisAccueil, deductionsRevenu, pensionAlimRecue };
  },

  generator() { return ''; },  // émis par profileGenerator._deductionsRevenu

  validator(formData) {
    const errors = [];
    const v = parseFloat(formData?.pension);
    if (formData?.pension && (isNaN(v) || v < 0)) {
      errors.push({ field: 'pension', message: 'Pension alimentaire invalide (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },  // déduction appliquée au RNI par profileParser._rni

  declarativeCases() {
    return [
      { caseCode: '6EL', label: 'Pension alimentaire enfant majeur (déductible)', declarant: 'foyer', required: false },
      { caseCode: '6GU', label: 'Pension alimentaire ascendant (déductible)',     declarant: 'foyer', required: false },
      { caseCode: '6EU', label: 'Frais d\'accueil personne âgée (déductible)',     declarant: 'foyer', required: false },
      { caseCode: '1AO', label: 'Pension alimentaire reçue (imposable)',           declarant: 'foyer', required: false },
    ];
  },
};
