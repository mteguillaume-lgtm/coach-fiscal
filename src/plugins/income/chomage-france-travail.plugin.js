import { n, f, section } from '../../lib/profileParserUtils.js';

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

// Paperasse — ir-mecanisme.md :
// "Allocations chômage (ARE) | 1AP/1BP | Aucun abattement"
// Les ARE sont imposées à 100% de leur montant net. Pas d'abattement 10%.

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'chomage-france-travail',
  label: 'Allocations chômage France Travail (ARE) — 1AP/1BP',
  version: '1.0.0',

  fields: [
    { key: 'are_brut', label: 'Allocations brutes ARE (€)',       type: 'number', required: false, declarant: null },
    { key: 'are_net',  label: 'Allocations nettes ARE — case 1AP (€)', type: 'number', required: false, declarant: null },
    { key: 'are_pas',  label: 'PAS prélevé France Travail (€)',   type: 'number', required: false, declarant: null },
  ],

  parser(text, mode) {
    const secD1 = mode === 'couple'
      ? section(text, '== ALLOCATIONS CHÔMAGE FRANCE TRAVAIL — DÉCLARANT 1 ==')
      : section(text, '== ALLOCATIONS CHÔMAGE FRANCE TRAVAIL ==');
    const secD2 = mode === 'couple'
      ? section(text, '== ALLOCATIONS CHÔMAGE FRANCE TRAVAIL — DÉCLARANT 2 ==')
      : '';

    return {
      areBrutD1: n(secD1, /Allocations brutes ARE\s*:\s*([\d\s,]+)\s*€/i),
      areNetD1:  n(secD1, /Allocations nettes ARE[^:]*:\s*([\d\s,]+)\s*€/i)
              || n(secD1, /Case 1AP\s*:\s*([\d\s,]+)\s*€/i),
      arePasD1:  n(secD1, /PAS prélevé France Travail\s*:\s*([\d\s,]+)\s*€/i),
      tauxPasAreD1: f(secD1, /Taux PAS\s*:\s*([\d,.]+)\s*%/i),

      areBrutD2: n(secD2, /Allocations brutes ARE\s*:\s*([\d\s,]+)\s*€/i),
      areNetD2:  n(secD2, /Allocations nettes ARE[^:]*:\s*([\d\s,]+)\s*€/i)
              || n(secD2, /Case 1BP\s*:\s*([\d\s,]+)\s*€/i),
      arePasD2:  n(secD2, /PAS prélevé France Travail\s*:\s*([\d\s,]+)\s*€/i),
      tauxPasAreD2: f(secD2, /Taux PAS\s*:\s*([\d,.]+)\s*%/i),
    };
  },

  generator(formData, d1Data, d2Data, mode) {
    const renderAre = (data, declarantNum, caseCode) => {
      const net  = parseFloat(data?.are_net  || 0);
      const brut = parseFloat(data?.are_brut || 0);
      if (!net && !brut) return '';
      const pas = parseFloat(data?.are_pas || 0);
      const header = mode === 'couple'
        ? `== ALLOCATIONS CHÔMAGE FRANCE TRAVAIL — DÉCLARANT ${declarantNum} ==`
        : '== ALLOCATIONS CHÔMAGE FRANCE TRAVAIL ==';
      return [
        header,
        `Allocations brutes ARE : ${fmtN(brut || net)}`,
        `Allocations nettes ARE (${caseCode}) : ${fmtN(net || brut)}`,
        `PAS prélevé France Travail : ${fmtN(pas)}`,
        `Case ${caseCode} : ${fmtN(net || brut)}`,
      ].join('\n');
    };

    const d1 = d1Data || {};
    const d2 = d2Data || {};
    const parts = [renderAre(d1, '1', '1AP')];
    if (mode === 'couple') parts.push(renderAre(d2, '2', '1BP'));
    return parts.filter(Boolean).join('\n');
  },

  validator(formData) {
    const errors = [];
    const brut = parseFloat(formData?.are_brut);
    const net  = parseFloat(formData?.are_net);
    if (formData?.are_brut && (isNaN(brut) || brut < 0))
      errors.push({ field: 'are_brut', message: 'Montant brut ARE invalide (≥ 0)' });
    if (formData?.are_net && (isNaN(net) || net < 0))
      errors.push({ field: 'are_net', message: 'Montant net ARE invalide (≥ 0)' });
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    // ARE (1AP/1BP) : aucun abattement (source paperasse: ir-mecanisme.md).
    // RNI = montant net déclaré, imposé à 100%.
    return {
      rniAreD1: v1.areNetD1 || 0,
      rniAreD2: v1.areNetD2 || 0,
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1AP', label: 'Allocations chômage ARE D1', declarant: 'D1', required: false },
      { caseCode: '1BP', label: 'Allocations chômage ARE D2', declarant: 'D2', required: false },
    ];
  },
};
