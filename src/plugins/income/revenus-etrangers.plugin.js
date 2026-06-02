import { n } from '../../lib/profileParserUtils.js';

/**
 * Revenus de source étrangère & conventions fiscales (formulaire 2047) — PHASE 6.
 * Deux mécanismes calculés (computeFoyerSummary / _internationalBlock) :
 *  - taux effectif (8TI) : revenu étranger exonéré retenu pour le taux moyen ;
 *  - crédit d'impôt étranger (8TK) : imputation plafonnée à l'IR français afférent.
 * Les régimes complexes (non-résident art. 197 A, impatrié 155 B, exit tax 167 bis,
 * fonciers étrangers) sont DÉTECTÉS et ROUTÉS vers un avocat fiscaliste — pas calculés.
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'revenus-etrangers',
  label: 'Revenus de source étrangère (conventions fiscales, 2047)',
  version: '1.0.0',

  fields: [],   // collectés en section International (Collect.jsx), émis par profileGenerator._internationalBlock

  parser(text /*, mode — cas foyer */) {
    const revEtrTauxEffectif      = n(text, /Revenus étrangers exonérés \(taux effectif\) foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const revEtrImputation        = n(text, /Revenus étrangers imposés en France \(imputation\) foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const creditImpotEtranger8TK  = n(text, /Crédit d'impôt étranger 8TK foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const intlRoutage             = /Routage international avocat fiscaliste\s*:\s*Oui/i.test(text);
    return {
      revEtrTauxEffectif,
      revEtrImputation,
      creditImpotEtranger8TK,
      intlRoutage,
    };
  },

  generator() { return ''; },   // émis par profileGenerator._internationalBlock

  validator(formData) {
    const errors = [];
    for (const key of ['intl_rev_etrangers_exoneres', 'intl_rev_etrangers_imputation', 'intl_credit_8tk']) {
      const raw = formData?.[key];
      if (raw !== undefined && raw !== '' && (isNaN(parseFloat(raw)) || parseFloat(raw) < 0)) {
        errors.push({ field: key, message: 'Montant invalide (≥ 0)' });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },   // taux effectif / crédit 8TK appliqués par computeFoyerSummary

  declarativeCases() {
    return [
      { caseCode: '8TI', label: 'Revenus étrangers exonérés retenus pour le taux effectif', declarant: 'foyer', required: false },
      { caseCode: '8TK', label: 'Crédit d\'impôt égal à l\'impôt étranger', declarant: 'foyer', required: false },
      { caseCode: '2047', label: 'Déclaration des revenus encaissés à l\'étranger', declarant: 'foyer', required: false },
    ];
  },
};
