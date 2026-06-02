import { n } from '../../lib/profileParserUtils.js';

/**
 * Location meublée non professionnelle (LMNP) au régime réel (BIC).
 * Le résultat fiscal (amortissements + liasse 2031/2033-A) est établi par un
 * expert-comptable → HORS scope de calcul de l'outil. On accepte uniquement un
 * résultat BIC net DÉJÀ établi (saisi), réintégré au RNI s'il est positif. Un
 * déficit LMNP n'est PAS imputable sur le revenu global (≠ LMP) : reportable
 * 10 ans sur les BIC meublés. La consolidation RNI/PS se fait dans _immoBlock.
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'lmnp-reel',
  label: 'LMNP régime réel (BIC, résultat saisi — expert-comptable)',
  version: '1.0.0',

  fields: [],   // collectés en section Immobilier (Collect.jsx), émis par profileGenerator._immoBlock

  parser(text /*, mode — cas foyer */) {
    const lmnpReelNet = n(text, /Résultat LMNP réel net foyer \(saisi\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const lmnpReelDeficit = n(text, /Déficit LMNP réel\s*:\s*([\d\s,]+)\s*€/i);
    return { lmnpReelNet, lmnpReelDeficit };
  },

  generator() { return ''; },   // émis par profileGenerator._immoBlock

  validator(formData) {
    const errors = [];
    const raw = formData?.lmnp_reel_net;
    if (raw !== undefined && raw !== '' && isNaN(parseFloat(raw))) {
      errors.push({ field: 'lmnp_reel_net', message: 'Résultat BIC net invalide' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },

  declarativeCases() {
    return [
      { caseCode: '5NA', label: 'Résultat LMNP régime réel — bénéfice (liasse 2031/2033-A)', declarant: 'foyer', required: false },
    ];
  },
};
