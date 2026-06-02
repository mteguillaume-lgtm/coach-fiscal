import { n } from '../../lib/profileParserUtils.js';

/**
 * Plus-values de cession de valeurs mobilières (actions, OPC, parts) — case 3VG,
 * moins-values reportables 3VH. PHASE 4. Point d'intégration unique des plus-values
 * du capital (PV mobilières + crypto) au total dû du foyer : le générateur
 * (_capitalGainsBlock) consolide l'IR (PFU 12,8 % par défaut, option barème) et la
 * base PS 17,2 % des PV mobilières ET de la crypto dans la section
 * « PLUS-VALUES & CAPITAL ». Le calcul lui-même vit dans taxCalculator
 * (calcPvMobiliere / calcCrypto).
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'plus-values-mobilieres',
  label: 'Plus-values mobilières (PEA/compte-titres) — 3VG/3VH',
  version: '1.0.0',

  fields: [],   // collectés en section Plus-values (Collect.jsx), émis par profileGenerator._capitalGainsBlock

  parser(text /*, mode — cas foyer */) {
    // Montants foyer consolidés (PV mobilières + crypto) réintégrés au total dû.
    const pvCapitalIR     = n(text, /Plus-values mobilières\/crypto — IR foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const pvCapitalPsBase = n(text, /Plus-values mobilières\/crypto — base PS foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const pvMobGain          = n(text, /Plus-values mobilières \(3VG\)\s*:\s*([\d\s,]+)\s*€/i);
    const pvMobGainImposable = n(text, /PV mobilières — gain imposable\s*:\s*([\d\s,]+)\s*€/i);
    return {
      pvCapitalIR,
      pvCapitalPsBase,
      pvMobGain,
      pvMobGainImposable,
    };
  },

  generator() { return ''; },   // émis par profileGenerator._capitalGainsBlock

  validator(formData) {
    const errors = [];
    for (const key of ['pv_mob_gain', 'pv_mob_mv_reportees', 'pv_mob_duree']) {
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
      { caseCode: '3VG', label: 'Plus-values de cession de valeurs mobilières (PFU 12,8 % + 17,2 % PS)', declarant: 'foyer', required: false },
      { caseCode: '3VH', label: 'Moins-values nettes de l\'année (reportables 10 ans)', declarant: 'foyer', required: false },
      { caseCode: '2OP', label: 'Option pour le barème progressif (globale aux revenus du capital)', declarant: 'foyer', required: false },
    ];
  },
};
