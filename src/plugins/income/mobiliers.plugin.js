import { n } from '../../lib/profileParserUtils.js';
import { TAUX_PS_CAPITAL } from '../../lib/taxCalculator.js';

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'mobiliers',
  label: 'Revenus de capitaux mobiliers (2TR/2BH/2CK)',
  version: '1.0.0',

  fields: [
    { key: 'int_mob_2tr', label: 'Intérêts mobiliers bruts (2TR)', type: 'number', required: false, declarant: 'foyer' },
    { key: 'int_mob_2ck', label: 'PFU 12,8% prélevé (2CK)',        type: 'number', required: false, declarant: 'foyer' },
  ],

  parser(text /*, mode — non utilisé : cas foyer */) {
    const intMob2TR = n(text, /Intérêts mobiliers bruts[^:\n]*:\s*([\d\s,]+)\s*€/i)
                   || n(text, /Intérêts[^(\n]*\(case 2TR\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const intMob2CK = n(text, /PFU[^(]*\(case 2CK\)[^:\n]*:\s*([\d\s,]+)\s*€/i)
                   || n(text, /Intérêts mobiliers.*?PFU[^:\n]*:\s*([\d\s,]+)\s*€/is)
                   || n(text, /2CK[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i);

    return {
      intMob2TR,
      intMob2CK,
    };
  },

  generator(formData /*, d1Data, d2Data, mode */) {
    const d = formData || {};
    const v2TR = parseFloat(d.int_mob_2tr || 0);
    const v2CK = parseFloat(d.int_mob_2ck || 0);
    if (!v2TR) return '';
    return [
      `Intérêts mobiliers bruts (case 2TR) : ${fmtN(v2TR)}`,
      v2CK > 0 ? `PFU 12,8% prélevé (case 2CK) : ${fmtN(v2CK)}` : '',
      `Intérêts soumis PS (case 2BH) : ${fmtN(v2TR)}`,
    ].filter(Boolean).join('\n');
  },

  validator(formData) {
    const errors = [];
    const v2TR = parseFloat(formData?.int_mob_2tr);
    const v2CK = parseFloat(formData?.int_mob_2ck);
    if (formData?.int_mob_2tr && (isNaN(v2TR) || v2TR < 0)) {
      errors.push({ field: 'int_mob_2tr', message: 'Intérêts mobiliers invalides (≥ 0)' });
    }
    if (formData?.int_mob_2ck && v2TR > 0 && v2CK > v2TR) {
      errors.push({ field: 'int_mob_2ck', message: 'PFU 2CK ne peut pas dépasser 2TR' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    const base = v1.intMob2TR || 0;
    return {
      psMobilier: Math.round(base * TAUX_PS_CAPITAL),
    };
  },

  declarativeCases() {
    return [
      { caseCode: '2TR', label: 'Intérêts mobiliers bruts',  declarant: 'foyer', required: false },
      { caseCode: '2CK', label: 'PFU 12,8% prélevé',         declarant: 'foyer', required: false },
      { caseCode: '2BH', label: 'Intérêts soumis PS (= 2TR)', declarant: 'foyer', required: false },
    ];
  },
};
