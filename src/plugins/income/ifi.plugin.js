import { n } from '../../lib/profileParserUtils.js';

/**
 * Impôt sur la Fortune Immobilière (IFI) — art. 964 et s. CGI / BOI-PAT-IFI.
 * PHASE 5. Impôt DISTINCT de l'IR (avis séparé), non ajouté au total dû IR.
 * L'assiette (patrimoine immo brut − abattement 30 % RP − passif), le barème et la
 * décote sont calculés par le générateur (_patrimoineBlock → calcIFI) ; ce parser
 * lit l'assiette nette et l'IFI dû consolidés au niveau foyer.
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'ifi',
  label: 'Impôt sur la Fortune Immobilière (IFI)',
  version: '1.0.0',

  fields: [],   // collectés en section Patrimoine (Collect.jsx), émis par profileGenerator._patrimoineBlock

  parser(text /*, mode — cas foyer */) {
    const ifiDu       = n(text, /IFI dû foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const ifiAssiette = n(text, /IFI assiette nette foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    return { ifiDu, ifiAssiette };
  },

  generator() { return ''; },   // émis par profileGenerator._patrimoineBlock

  validator(formData) {
    const errors = [];
    for (const key of ['ifi_patrimoine_brut', 'ifi_valeur_rp', 'ifi_passif']) {
      const raw = formData?.[key];
      if (raw !== undefined && raw !== '' && (isNaN(parseFloat(raw)) || parseFloat(raw) < 0)) {
        errors.push({ field: key, message: 'Montant invalide (≥ 0)' });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },   // déjà consolidé par le générateur

  declarativeCases() {
    return [
      { caseCode: '9HI', label: 'Base imposable IFI (patrimoine immobilier net ≥ 1,3 M€)', declarant: 'foyer', required: false },
    ];
  },
};
