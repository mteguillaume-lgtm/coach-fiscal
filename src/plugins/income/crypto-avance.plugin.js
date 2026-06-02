import { n } from '../../lib/profileParserUtils.js';

/**
 * Actifs numériques (crypto) — plus-values de cession, cases 3AN (gain) / 3BN (perte).
 * PHASE 4. Régime des particuliers : PFU 30 % (12,8 % IR + 17,2 % PS) par défaut,
 * option barème possible ; exonération totale si cessions cumulées de l'année ≤ 305 €
 * (art. 150 VH bis CGI). L'IR et la base PS sont consolidés avec les PV mobilières par
 * le générateur (_capitalGainsBlock) et réintégrés au total dû via le plugin
 * plus-values-mobilieres. Le calcul vit dans taxCalculator (calcCrypto).
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'crypto-avance',
  label: 'Actifs numériques — plus-values (3AN/3BN)',
  version: '1.0.0',

  fields: [],   // crypto collecté en section Épargne ; option barème dans PV_FIELDS (Collect.jsx)

  parser(text /*, mode — cas foyer */) {
    // Lignes crypto-spécifiques (le montant IR/PS est consolidé par plus-values-mobilieres).
    const cryptoPvImposable = n(text, /Plus-values crypto \(3AN\)\s*:\s*([\d\s,]+)\s*€/i);
    const cryptoExoneree    = /Plus-values crypto[^\n]*EXONÉRÉES/i.test(text);
    return {
      cryptoPvImposable,
      cryptoExoneree,
    };
  },

  generator() { return ''; },   // émis par profileGenerator._capitalGainsBlock

  validator() { return { valid: true, errors: [] }; },

  calculator() { return {}; },   // déjà consolidé par le générateur

  declarativeCases() {
    return [
      { caseCode: '3AN', label: 'Plus-values de cession d\'actifs numériques (PFU 12,8 % + 17,2 % PS)', declarant: 'foyer', required: false },
      { caseCode: '3BN', label: 'Moins-values de cession d\'actifs numériques (imputables même nature)', declarant: 'foyer', required: false },
    ];
  },
};
