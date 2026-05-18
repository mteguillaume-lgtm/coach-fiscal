import { n, section } from '../../lib/profileParserUtils.js';
import { PLAFOND_APPRENTISSAGE_IR } from '../../lib/taxCalculator.js';

// Art. 81 bis CGI : exonération IR sur la rémunération apprenti <= 1 SMIC annuel brut (21 622 € en 2025).
// Cases déclaratives : 1AJ/1BJ (excédent imposable s'additionne aux salaires ordinaires).
// Pas de proratisation même si le contrat débute ou prend fin en cours d'année.

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'apprentissage',
  label: 'Apprentissage — exonération IR art. 81 bis CGI (1AJ/1BJ)',
  version: '1.0.0',

  fields: [
    { key: 'brut_apprentissage', label: 'Rémunération brute apprentissage (€)', type: 'number', required: false, declarant: null },
  ],

  parser(text, mode) {
    const secD1 = mode === 'couple'
      ? section(text, '== APPRENTISSAGE — DÉCLARANT 1 ==')
      : section(text, '== APPRENTISSAGE ==');
    const secD2 = mode === 'couple'
      ? section(text, '== APPRENTISSAGE — DÉCLARANT 2 ==')
      : '';

    const readBrut = (sec) =>
      n(sec, /Rémunération brute\s*:\s*([\d\s,]+)\s*€/i) ||
      n(sec, /Brut apprentissage\s*:\s*([\d\s,]+)\s*€/i);

    return {
      brutApprentissageD1: readBrut(secD1),
      brutApprentissageD2: readBrut(secD2),
    };
  },

  generator(formData, d1Data, d2Data, mode) {
    const renderApp = (data, declarantNum) => {
      const brut = parseFloat(data?.brut_apprentissage || 0);
      if (!brut) return '';
      const exo = Math.min(brut, PLAFOND_APPRENTISSAGE_IR);
      const imp = Math.max(0, brut - PLAFOND_APPRENTISSAGE_IR);
      const header = mode === 'couple'
        ? `== APPRENTISSAGE — DÉCLARANT ${declarantNum} ==`
        : '== APPRENTISSAGE ==';
      return [
        header,
        `Rémunération brute : ${fmtN(brut)}`,
        `Exonération IR (art. 81 bis) : ${fmtN(exo)}`,
        `Plafond exonération 2025 : ${fmtN(PLAFOND_APPRENTISSAGE_IR)}`,
        `Net imposable (1AJ) : ${fmtN(imp)}`,
      ].join('\n');
    };

    const parts = [renderApp(d1Data || {}, '1')];
    if (mode === 'couple') parts.push(renderApp(d2Data || {}, '2'));
    return parts.filter(Boolean).join('\n');
  },

  validator(formData) {
    const errors = [];
    const brut = parseFloat(formData?.brut_apprentissage);
    if (formData?.brut_apprentissage && (isNaN(brut) || brut < 0))
      errors.push({ field: 'brut_apprentissage', message: 'Rémunération brute invalide (≥ 0)' });
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    // Art. 81 bis : partie > plafond = imposable en 1AJ/1BJ (s'additionne aux salaires).
    const imp = (brut) => Math.max(0, (brut || 0) - PLAFOND_APPRENTISSAGE_IR);
    return {
      rniApprentissageD1: imp(v1.brutApprentissageD1),
      rniApprentissageD2: imp(v1.brutApprentissageD2),
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1AJ', label: 'Apprentissage — excédent imposable D1', declarant: 'D1', required: false },
      { caseCode: '1BJ', label: 'Apprentissage — excédent imposable D2', declarant: 'D2', required: false },
    ];
  },
};
