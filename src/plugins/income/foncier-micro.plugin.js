import { n } from '../../lib/profileParserUtils.js';
import { TAUX_PS_CAPITAL, SEUIL_MICRO_FONCIER, ABATTEMENT_MICRO_FONCIER } from '../../lib/taxCalculator.js';

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'foncier-micro',
  label: 'Revenus fonciers micro-foncier (4BE < 15 000 €)',
  version: '1.0.0',

  fields: [
    { key: 'foncier', label: 'Revenus fonciers bruts (4BE)', type: 'number', required: false, declarant: 'foyer' },
  ],

  parser(text /*, mode — cas foyer */) {
    const brut = n(text, /Revenus fonciers bruts\s*:\s*([\d\s,]+)\s*€/i)
              || n(text, /Revenus fonciers\s*:\s*([\d\s,]+)\s*€/);

    const netFromText = n(text, /fonciers nets imposables\s*:\s*([\d\s,]+)\s*€/i);
    const isMicro = brut > 0 && brut <= SEUIL_MICRO_FONCIER;
    const foncierNet = netFromText > 0
      ? netFromText
      : isMicro ? Math.round(brut * (1 - ABATTEMENT_MICRO_FONCIER)) : brut;

    return {
      revensFonciers: brut,
      foncierNet,
      regimeFoncier: brut <= 0 ? null : isMicro ? 'micro' : 'reel',
    };
  },

  generator(formData /*, d1Data, d2Data, mode */) {
    const d = formData || {};
    const brut = parseFloat(d.foncier || 0);
    if (!brut) return 'Revenus fonciers : Néant';
    const isMicro = brut <= SEUIL_MICRO_FONCIER;
    const net = isMicro ? Math.round(brut * (1 - ABATTEMENT_MICRO_FONCIER)) : brut;
    const ps = Math.round(net * TAUX_PS_CAPITAL);
    return [
      `Revenus fonciers bruts : ${fmtN(brut)}`,
      `Régime foncier : ${isMicro ? 'micro-foncier (abat. 30%)' : 'régime réel'}`,
      `Revenus fonciers nets imposables : ${fmtN(net)}`,
      `Prélèvements sociaux fonciers (17,2%) : ${fmtN(ps)}`,
    ].join('\n');
  },

  validator(formData) {
    const errors = [];
    const brut = parseFloat(formData?.foncier);
    if (formData?.foncier && (isNaN(brut) || brut < 0)) {
      errors.push({ field: 'foncier', message: 'Revenus fonciers invalides (≥ 0)' });
    }
    if (brut > SEUIL_MICRO_FONCIER) {
      errors.push({ field: 'foncier', message: 'Dépasse 15 000 € : utilisez le plugin foncier-reel' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    const brut = v1.revensFonciers || 0;
    const isMicro = brut > 0 && brut <= SEUIL_MICRO_FONCIER;
    const net = v1.foncierNet > 0
      ? v1.foncierNet
      : isMicro ? Math.round(brut * (1 - ABATTEMENT_MICRO_FONCIER)) : brut;
    return {
      foncierNet: net,
      foncierPs:  Math.round(net * TAUX_PS_CAPITAL),
    };
  },

  declarativeCases() {
    return [
      { caseCode: '4BE', label: 'Revenus fonciers bruts micro-foncier (< 15 000 €)', declarant: 'foyer', required: false },
    ];
  },
};
