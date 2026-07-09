import { n } from '../../lib/profileParserUtils.js';

/**
 * Rachats d'assurance-vie de vivant (cases 2CG / 2BH). Le calcul vit dans
 * taxCalculator.calcRachatAV ; le générateur (_avRachatBlock) consolide IR/PS au
 * foyer. Ce plugin lit les lignes émises et déclare les cases 2042.
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'assurance-vie-rachat',
  label: 'Rachat assurance-vie (2CG/2BH)',
  version: '1.0.0',
  fields: [],   // collecte en section AV (Collect.jsx), émission par profileGenerator

  parser(text) {
    const avRachatIR       = n(text, /Rachat AV — IR foyer[^:\n]*:\s*([\d\s ,]+)\s*€/i);
    const avRachatPsBase   = n(text, /Rachat AV — base PS foyer[^:\n]*:\s*([\d\s ,]+)\s*€/i);
    const avRachatGains    = n(text, /Rachat AV — part de gains imposable\s*:\s*([\d\s ,]+)\s*€/i);
    const avRachatBaremeEco = n(text, /option barème \(2BH\) plus avantageuse \(~([\d\s ,]+)\s*/i);
    const avRachat8ans     = /Rachat AV — part de gains imposable[^\n]*contrat\s*:\s*≥ 8 ans/i.test(text);
    return { avRachatIR, avRachatPsBase, avRachatGains, avRachat8ans, avRachatBaremeEco };
  },

  generator() { return ''; },

  validator(formData) {
    const errors = [];
    const v = parseFloat(formData?.av_rachat_gains);
    if (formData?.av_rachat_gains && (isNaN(v) || v < 0)) {
      errors.push({ field: 'av_rachat_gains', message: 'Part de gains invalide (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },

  declarativeCases() {
    return [
      { caseCode: '2CG', label: 'Gains de rachat AV imposables au PFU', declarant: 'foyer', required: false },
      { caseCode: '2BH', label: 'Gains de rachat AV imposables au barème (option)', declarant: 'foyer', required: false },
    ];
  },
};
