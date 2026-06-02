import { n } from '../../lib/profileParserUtils.js';
import { MICRO_TNS_REGIMES } from '../../lib/taxCalculator.js';

/**
 * BIC / BNC / BA — revenus professionnels des indépendants au régime micro.
 *
 * Le bénéfice imposable (recettes − abattement forfaitaire) est calculé par le
 * générateur (_tnsBlock) et émis dans la section « REVENUS INDÉPENDANTS (TNS) ».
 * Ce plugin ré-extrait du profil le bénéfice foyer (hors versement libératoire)
 * pour alimenter le RNI (profileParser._rni) ainsi que les cases déclaratives.
 *
 * Régime réel (liasses 2031/2035) HORS scope → routage expert-comptable.
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'bic-bnc-ba',
  label: 'BIC / BNC / BA — revenus indépendants (micro)',
  version: '1.0.0',

  fields: [],   // collecte gérée par la section « Revenus indépendants » de Collect.jsx

  parser(text /*, mode */) {
    const beneficeTnsImposable = n(text, /Bénéfice TNS imposable foyer \(hors VL\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const versementLiberatoireTns = n(text, /Versement libératoire IR foyer \(total\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const recettesTnsD1 = n(text, /Recettes brutes D1[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const recettesTnsD2 = n(text, /Recettes brutes D2[^:\n]*:\s*([\d\s,]+)\s*€/i);
    return { beneficeTnsImposable, versementLiberatoireTns, recettesTnsD1, recettesTnsD2 };
  },

  generator() { return ''; },   // émis par profileGenerator._tnsBlock

  validator(formData) {
    const errors = [];
    const type = formData?.tns_type || '';
    const rec  = parseFloat(formData?.tns_recettes);
    if (type && !MICRO_TNS_REGIMES[type]) {
      errors.push({ field: 'tns_type', message: 'Type d\'activité micro inconnu' });
    }
    if (formData?.tns_recettes && (isNaN(rec) || rec < 0)) {
      errors.push({ field: 'tns_recettes', message: 'Recettes invalides (≥ 0)' });
    }
    if (type && MICRO_TNS_REGIMES[type] && rec > MICRO_TNS_REGIMES[type].seuil_recettes_brutes) {
      errors.push({ field: 'tns_recettes', message: `Dépasse le seuil micro (${MICRO_TNS_REGIMES[type].seuil_recettes_brutes.toLocaleString('fr-FR')} €) → régime réel, voir expert-comptable` });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },  // bénéfice réintégré au RNI par profileParser._rni

  declarativeCases() {
    return [
      { caseCode: '5KO', label: 'Micro-BIC vente — recettes (D1)',        declarant: 'D1', required: false },
      { caseCode: '5KP', label: 'Micro-BIC prestations — recettes (D1)',  declarant: 'D1', required: false },
      { caseCode: '5HQ', label: 'Micro-BNC — recettes (D1)',              declarant: 'D1', required: false },
      { caseCode: '5XB', label: 'Micro-BA — recettes (D1)',               declarant: 'D1', required: false },
    ];
  },
};
