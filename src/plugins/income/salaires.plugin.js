import { n, f, s, section } from '../../lib/profileParserUtils.js';
import { abattement10Auto } from '../../lib/taxCalculator.js';

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'salaires',
  label: 'Salaires et traitements (1AJ/1BJ)',
  version: '1.0.0',

  fields: [
    { key: 'net_imp',     label: 'Net imposable (1AJ/1BJ)', type: 'number', required: true,  declarant: null },
    { key: 'brut',        label: 'Brut imposable',           type: 'number', required: false, declarant: null },
    { key: 'pas_tot',     label: 'PAS prélevé 2025',         type: 'number', required: true,  declarant: null },
    { key: 'taux_pas',    label: 'Taux PAS (%)',             type: 'number', required: false, declarant: null },
    { key: 'ij_cpam',     label: 'IJ CPAM incluses dans net', type: 'number', required: false, declarant: null },
    { key: 'ij_cpam_org', label: 'Organisme attestation CPAM', type: 'string', required: false, declarant: null },
  ],

  parser(text, mode) {
    const secRevD1 = mode === 'couple'
      ? section(text, '== REVENUS 2025 — DÉCLARANT 1 ==')
      : section(text, '== REVENUS 2025 ==');
    const secRevD2 = mode === 'couple'
      ? section(text, '== REVENUS 2025 — DÉCLARANT 2 ==')
      : '';

    return {
      salaireNetImposableD1:   n(secRevD1, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      salairesBrutImposableD1: n(secRevD1, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      pasD1:    n(secRevD1, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/),
      tauxPasD1: f(secRevD1, /Taux PAS\s*:\s*([\d,\.]+)\s*%/),
      ijCpamD1:    n(secRevD1, /\(dont\s+([\d\s,]+)\s*€\s*IJ\s*CPAM/i),
      ijCpamOrgD1: s(secRevD1, /IJ\s*CPAM[^—\n]*—\s*attestation\s+([^\)\n]+)/i),

      salaireNetImposableD2:   n(secRevD2, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      salairesBrutImposableD2: n(secRevD2, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      pasD2:    n(secRevD2, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/),
      tauxPasD2: f(secRevD2, /Taux PAS\s*:\s*([\d,\.]+)\s*%/),
      ijCpamD2:    n(secRevD2, /\(dont\s+([\d\s,]+)\s*€\s*IJ\s*CPAM/i),
      ijCpamOrgD2: s(secRevD2, /IJ\s*CPAM[^—\n]*—\s*attestation\s+([^\)\n]+)/i),
    };
  },

  generator(formData, d1Data, d2Data, mode) {
    const d1 = d1Data || {};
    const net = parseFloat(d1.net_imp || 0);
    const pas = parseFloat(d1.pas_tot || 0);
    const ijCpam = parseFloat(d1.ij_cpam || 0);
    if (!net) return '';
    const netLine = `Net imposable annuel (1AJ — case déclaration) : ${fmtN(net)}`
      + (ijCpam > 0 ? ` (dont ${fmtN(ijCpam)} IJ CPAM — attestation ${d1.ij_cpam_org || 'CPAM'})` : '');
    const pasLine = pas > 0 ? `PAS prélevé 2025 : ${fmtN(pas)}` : '';
    const tauxLine = d1.taux_pas ? `Taux PAS : ${d1.taux_pas}%` : '';
    return [netLine, tauxLine, pasLine].filter(Boolean).join('\n');
  },

  validator(formData) {
    const errors = [];
    const net = parseFloat(formData?.net_imp);
    if (!formData?.net_imp || isNaN(net) || net < 0) {
      errors.push({ field: 'net_imp', message: 'Net imposable annuel requis (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    return {
      rniD1: abattement10Auto(v1.salaireNetImposableD1 || 0, v1.typeRevenuD1 || 'Salarié(e)', v1.pensionNetImpD1 || 0),
      rniD2: abattement10Auto(v1.salaireNetImposableD2 || 0, v1.typeRevenuD2 || 'Salarié(e)', v1.pensionNetImpD2 || 0),
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1AJ', label: 'Salaires nets imposables D1', declarant: 'D1', required: true },
      { caseCode: '1BJ', label: 'Salaires nets imposables D2', declarant: 'D2', required: false },
    ];
  },
};
