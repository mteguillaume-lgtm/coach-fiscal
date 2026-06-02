import { n, signed } from '../../lib/profileParserUtils.js';

/**
 * Revenus fonciers au régime réel (location nue, formulaire 2044) + déficit
 * foncier (art. 156-I-3° CGI). Point d'intégration unique de l'immobilier
 * locatif au RNI/PS du foyer : le bénéfice/déficit foncier, la quote-part SCI
 * à l'IR, le LMNP micro-BIC et le LMNP réel sont consolidés par le générateur
 * (_immoBlock) et émis dans la section « REVENUS IMMOBILIER LOCATIF ».
 *
 * Les montants foyer (deltaRni signé + base PS) sont lus ici ; le calcul lui-même
 * vit dans taxCalculator (calcFoncierReel / calcDeficitFoncier).
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'foncier-reel',
  label: 'Revenus fonciers régime réel + déficit foncier (2044)',
  version: '1.0.0',

  fields: [],   // collectés en section Immobilier (Collect.jsx), émis par profileGenerator._immoBlock

  parser(text /*, mode — cas foyer */) {
    // Revenu net immobilier réintégré au RNI (signé : négatif = déficit foncier imputé).
    const immoDeltaRni = signed(text, /Revenu immobilier net réintégré au RNI foyer[^:\n]*:\s*([-−]?[\d\s ,]+)\s*€/i);
    const immoPsBase   = n(text, /Base PS immobilier foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const foncierReelNet            = n(text, /Foncier réel net imposable foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const foncierDeficitImputeGlobal = n(text, /Déficit foncier imputé sur le revenu global[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const foncierDeficitReporte      = n(text, /Déficit foncier reportable[^:\n]*:\s*([\d\s,]+)\s*€/i);
    return {
      immoDeltaRni: immoDeltaRni ?? 0,
      immoPsBase,
      foncierReelNet,
      foncierDeficitImputeGlobal,
      foncierDeficitReporte,
    };
  },

  generator() { return ''; },   // émis par profileGenerator._immoBlock

  validator(formData) {
    const errors = [];
    for (const key of ['foncier_reel_recettes', 'foncier_reel_charges', 'foncier_reel_interets', 'sci_ir_net']) {
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
      { caseCode: '4BA', label: 'Revenus fonciers nets (régime réel, report 2044)', declarant: 'foyer', required: false },
      { caseCode: '4BB', label: 'Déficit foncier imputable sur les revenus fonciers', declarant: 'foyer', required: false },
      { caseCode: '4BC', label: 'Déficit foncier imputable sur le revenu global (≤ 10 700 €)', declarant: 'foyer', required: false },
      { caseCode: '4BD', label: 'Déficits fonciers antérieurs non encore imputés', declarant: 'foyer', required: false },
    ];
  },
};
