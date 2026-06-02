import { n } from '../../lib/profileParserUtils.js';

/**
 * Plus-values immobilières des particuliers (cession d'un bien autre que la RP) —
 * PHASE 4. L'impôt (IR 19 % + PS 17,2 % + surtaxe) est PRÉLEVÉ À LA SOURCE par le
 * notaire au moment de la cession, HORS déclaration annuelle de revenus → traité
 * comme une ESTIMATION, non ajoutée au total dû annuel. Le calcul vit dans
 * taxCalculator (calcPvImmo / calcSurtaxePvImmo) ; le générateur (_capitalGainsBlock)
 * émet les lignes d'estimation et le routage notaire.
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'plus-values-immo',
  label: 'Plus-values immobilières (cession hors RP) — 3VZ',
  version: '1.0.0',

  fields: [],   // collectés en section Plus-values (Collect.jsx), émis par profileGenerator._capitalGainsBlock

  parser(text /*, mode — cas foyer */) {
    // Estimation informative (prélevée chez le notaire, hors solde annuel).
    const pvImmoBrute      = n(text, /PV immobilière brute\s*:\s*([\d\s,]+)\s*€/i);
    const pvImmoEstimation = n(text, /ESTIMATION impôt PV immobilière[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const pvImmoExoneree   = /Plus-value immobilière[^\n]*:\s*EXONÉRÉE/i.test(text);
    return {
      pvImmoBrute,
      pvImmoEstimation,
      pvImmoExoneree,
    };
  },

  generator() { return ''; },   // émis par profileGenerator._capitalGainsBlock

  validator(formData) {
    const errors = [];
    for (const key of ['pv_immo_cession', 'pv_immo_acquisition', 'pv_immo_frais_reels', 'pv_immo_travaux_reels', 'pv_immo_duree']) {
      const raw = formData?.[key];
      if (raw !== undefined && raw !== '' && (isNaN(parseFloat(raw)) || parseFloat(raw) < 0)) {
        errors.push({ field: key, message: 'Montant invalide (≥ 0)' });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  calculator() { return {}; },   // estimation consolidée par le générateur (hors total dû)

  declarativeCases() {
    return [
      { caseCode: '3VZ', label: 'Plus-values immobilières imposables (report informatif — payées chez le notaire)', declarant: 'foyer', required: false },
    ];
  },
};
