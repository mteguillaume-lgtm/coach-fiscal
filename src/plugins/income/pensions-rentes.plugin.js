import { n, s, section } from '../../lib/profileParserUtils.js';
import { abattement10Pension } from '../../lib/taxCalculator.js';

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'pensions-rentes',
  label: 'Pensions et rentes viagères (1AS/1BS)',
  version: '1.0.0',

  fields: [
    { key: 'rente_1bs_montant',    label: 'Rente viagère 1AS/1BS',    type: 'number', required: false, declarant: null },
    { key: 'rente_1bs_pas',        label: 'PAS rente prélevé',         type: 'number', required: false, declarant: null },
    { key: 'rente_1bs_organisme',  label: 'Organisme rente',           type: 'string', required: false, declarant: null },
    { key: 'rente_1bs_recurrent',  label: 'Rente récurrente',          type: 'boolean', required: false, declarant: null },
    { key: 'pension_net_imp',      label: 'Pension nette imposable 1AS', type: 'number', required: false, declarant: null },
  ],

  parser(text, mode) {
    const secRevD1 = mode === 'couple'
      ? section(text, '== REVENUS 2025 — DÉCLARANT 1 ==')
      : section(text, '== REVENUS 2025 ==');
    const secRevD2 = mode === 'couple'
      ? section(text, '== REVENUS 2025 — DÉCLARANT 2 ==')
      : '';

    const secProfil = section(text, '== PROFIL & RETRAITE ==');

    return {
      rente1BsD1:    n(secRevD1, /Montant (?:déclaré en 1[AB]S|1BS)[^:\n]*:\s*([\d\s,]+)\s*€/i),
      pasRente1BsD1: n(secRevD1, /PAS rente[^:\n]*:\s*([\d\s,]+)\s*€/i)
                  || n(secRevD1, /PAS prélevé par[^:\n]*:\s*([\d\s,]+)\s*€/i),
      orgRente1BsD1: s(secRevD1, /Organisme\s*:\s*([^\n]+)/i),
      recurrentRente1BsD1: /Récurrent\s*:\s*Non|NON RÉCURRENT/i.test(secRevD1) ? false
                         : /Récurrent\s*:\s*Oui/i.test(secRevD1) ? true : null,
      pensionNetImpD1: n(secProfil, /Pension nette imposable 1AS D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(secProfil, /Pension nette imposable 1AS[^:\n]*:\s*([\d\s,]+)\s*€/i),

      rente1BsD2:    n(secRevD2, /Montant (?:déclaré en 1[AB]S|1BS)[^:\n]*:\s*([\d\s,]+)\s*€/i),
      pasRente1BsD2: n(secRevD2, /PAS rente[^:\n]*:\s*([\d\s,]+)\s*€/i)
                  || n(secRevD2, /PAS prélevé par[^:\n]*:\s*([\d\s,]+)\s*€/i),
      orgRente1BsD2: s(secRevD2, /Organisme\s*:\s*([^\n]+)/i),
      recurrentRente1BsD2: /Récurrent\s*:\s*Non|NON RÉCURRENT/i.test(secRevD2) ? false
                         : /Récurrent\s*:\s*Oui/i.test(secRevD2) ? true : null,
      pensionNetImpD2: n(secProfil, /Pension nette imposable 1AS D2[^:\n]*:\s*([\d\s,]+)\s*€/i),
    };
  },

  generator(formData, d1Data, d2Data /*, mode */) {
    const render = (data, suffix) => {
      const montant = parseFloat(data?.rente_1bs_montant || 0);
      if (!montant) return '';
      const pas = parseFloat(data?.rente_1bs_pas || 0);
      return [
        `Rente viagère — case 1${suffix === 'D1' ? 'A' : 'B'}S (${suffix}) :`,
        `  Organisme : ${data.rente_1bs_organisme || 'Non renseigné'}`,
        `  Montant 1${suffix === 'D1' ? 'A' : 'B'}S déclaré : ${fmtN(montant)}`,
        `  PAS rente : ${pas > 0 ? fmtN(pas) : '0 €'}`,
        `  Récurrent : ${data.rente_1bs_recurrent || 'Oui'}`,
      ].join('\n');
    };
    const d1 = d1Data || {};
    const d2 = d2Data || {};
    return [render(d1, 'D1'), render(d2, 'D2')].filter(Boolean).join('\n');
  },

  validator(formData) {
    const errors = [];
    const montant = parseFloat(formData?.rente_1bs_montant);
    if (formData?.rente_1bs_montant && (isNaN(montant) || montant < 0)) {
      errors.push({ field: 'rente_1bs_montant', message: 'Montant rente invalide (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    return {
      rniRenteD1: v1.rente1BsD1 > 0 ? abattement10Pension(v1.rente1BsD1) : 0,
      rniRenteD2: v1.rente1BsD2 > 0 ? abattement10Pension(v1.rente1BsD2) : 0,
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1AS', label: 'Pensions/rentes nettes imposables D1', declarant: 'D1', required: false },
      { caseCode: '1BS', label: 'Pensions/rentes nettes imposables D2', declarant: 'D2', required: false },
    ];
  },
};
