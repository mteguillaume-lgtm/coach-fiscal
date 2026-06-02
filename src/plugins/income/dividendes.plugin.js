import { n } from '../../lib/profileParserUtils.js';

/**
 * Dividendes et distributions du CTO (2DC/2BH).
 * L'arbitrage PFU 30 % vs option barème (abattement 40 % + CSG déductible) est
 * calculé dans taxCalculator.computeFoyerSummary (qui dispose du RNI et des parts).
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'dividendes',
  label: 'Dividendes et distributions (2DC/2BH)',
  version: '1.0.0',

  fields: [],   // collecte gérée par la section « Revenus » de Collect.jsx

  parser(text /*, mode */) {
    const dividendes2DC = n(text, /Dividendes bruts \(case 2DC\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
    return { dividendes2DC };
  },

  generator() { return ''; },  // émis par profileGenerator (section Revenus)

  validator(formData) {
    const errors = [];
    const v = parseFloat(formData?.div_2dc);
    if (formData?.div_2dc && (isNaN(v) || v < 0)) {
      errors.push({ field: 'div_2dc', message: 'Dividendes invalides (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },  // arbitrage PFU/barème calculé dans computeFoyerSummary

  declarativeCases() {
    return [
      { caseCode: '2DC', label: 'Dividendes bruts',               declarant: 'foyer', required: false },
      { caseCode: '2BH', label: 'Dividendes soumis aux PS',       declarant: 'foyer', required: false },
      { caseCode: '2DA', label: 'Abattement 40% (option barème)', declarant: 'foyer', required: false },
      { caseCode: '2OP', label: 'Option imposition au barème',    declarant: 'foyer', required: false },
    ];
  },
};
