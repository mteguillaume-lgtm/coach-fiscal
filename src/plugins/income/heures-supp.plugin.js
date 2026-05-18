import { n, section } from '../../lib/profileParserUtils.js';
import { PLAFOND_HEURES_SUPP } from '../../lib/taxCalculator.js';

// Art. 81 quater CGI : heures supplémentaires et complémentaires exonérées d'IR
// dans la limite de 7 500 € nets fiscaux par an et par déclarant.
// L'excédent éventuel bascule en 1AJ/1BJ (géré par l'employeur sur l'attestation fiscale).

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'heures-supp',
  label: 'Heures supplémentaires défiscalisées — art. 81 quater CGI (1GH/1HH)',
  version: '1.0.0',

  fields: [
    { key: 'heures_supp_exo_d1', label: 'Montant exonéré D1 — case 1GH (€)', type: 'number', required: false, declarant: 'D1' },
    { key: 'heures_supp_exo_d2', label: 'Montant exonéré D2 — case 1HH (€)', type: 'number', required: false, declarant: 'D2' },
  ],

  parser(text, mode) {
    const secD1 = mode === 'couple'
      ? section(text, '== HEURES SUPPLÉMENTAIRES DÉFISCALISÉES — DÉCLARANT 1 ==')
      : section(text, '== HEURES SUPPLÉMENTAIRES DÉFISCALISÉES ==');
    const secD2 = mode === 'couple'
      ? section(text, '== HEURES SUPPLÉMENTAIRES DÉFISCALISÉES — DÉCLARANT 2 ==')
      : '';

    const readExo = (sec, label1GH) =>
      n(sec, new RegExp(`Montant exonéré ${label1GH}\\s*:\\s*([\\d\\s,]+)\\s*€`, 'i')) ||
      n(sec, /Montant exonéré\s*:\s*([\d\s,]+)\s*€/i) ||
      n(sec, /Case 1GH\s*:\s*([\d\s,]+)\s*€/i);

    const readExoD2 = (sec) =>
      n(sec, /Montant exonéré D2 \(1HH\)\s*:\s*([\d\s,]+)\s*€/i) ||
      n(sec, /Case 1HH\s*:\s*([\d\s,]+)\s*€/i);

    return {
      heureSuppExoD1: readExo(secD1, 'D1 \\(1GH\\)'),
      heureSuppExoD2: mode === 'couple'
        ? readExo(secD2, '\\(1HH\\)')
        : readExoD2(secD1),
    };
  },

  generator(formData, d1Data, d2Data, mode) {
    if (mode === 'couple') {
      const renderDeclarant = (data, declarantNum, caseCode) => {
        const exo = parseFloat(data?.[`heures_supp_exo_d${declarantNum}`] || 0);
        if (!exo) return '';
        return [
          `== HEURES SUPPLÉMENTAIRES DÉFISCALISÉES — DÉCLARANT ${declarantNum} ==`,
          `Montant exonéré (${caseCode}) : ${fmtN(exo)}`,
          `Plafond annuel : ${fmtN(PLAFOND_HEURES_SUPP)}`,
        ].join('\n');
      };
      return [
        renderDeclarant(d1Data || {}, '1', '1GH'),
        renderDeclarant(d2Data || {}, '2', '1HH'),
      ].filter(Boolean).join('\n');
    }

    const exoD1 = parseFloat(d1Data?.heures_supp_exo_d1 || 0);
    const exoD2 = parseFloat(d2Data?.heures_supp_exo_d2 || 0);
    if (!exoD1 && !exoD2) return '';
    const lines = ['== HEURES SUPPLÉMENTAIRES DÉFISCALISÉES =='];
    if (exoD1) lines.push(`Montant exonéré D1 (1GH) : ${fmtN(exoD1)}`);
    if (exoD2) lines.push(`Montant exonéré D2 (1HH) : ${fmtN(exoD2)}`);
    return lines.join('\n');
  },

  validator(formData) {
    const errors = [];
    for (const key of ['heures_supp_exo_d1', 'heures_supp_exo_d2']) {
      const v = parseFloat(formData?.[key]);
      if (formData?.[key] && (isNaN(v) || v < 0))
        errors.push({ field: key, message: `Montant invalide (≥ 0)` });
      if (!isNaN(v) && v > PLAFOND_HEURES_SUPP)
        errors.push({ field: key, message: `Excède le plafond légal de ${PLAFOND_HEURES_SUPP} €` });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    // Montant exonéré fourni tel quel depuis l'attestation fiscale (déjà ≤ 7 500 €).
    return {
      heureSuppExoD1: Math.min(v1.heureSuppExoD1 || 0, PLAFOND_HEURES_SUPP),
      heureSuppExoD2: Math.min(v1.heureSuppExoD2 || 0, PLAFOND_HEURES_SUPP),
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1GH', label: 'Heures supplémentaires défiscalisées D1', declarant: 'D1', required: false },
      { caseCode: '1HH', label: 'Heures supplémentaires défiscalisées D2', declarant: 'D2', required: false },
    ];
  },
};
