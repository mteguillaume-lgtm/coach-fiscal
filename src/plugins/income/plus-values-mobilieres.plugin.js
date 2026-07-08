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

    // Arbitrage 2OP global écrit par le générateur (une seule ligne, 4 groupes).
    // [\s ] : espaces fines insécables des montants fmtN.
    const mArb = text.match(
      /Arbitrage 2OP foyer\s*:\s*PFU\s*([\d\s ]+)€\s*\|\s*barème\s*([\d\s ]+)€\s*\|\s*recommandé\s*:\s*(PFU|barème)\s*\|\s*économie\s*([\d\s ]+)€/i,
    );
    const toInt = (v) => parseInt(String(v).replace(/[\s ]/g, ''), 10) || 0;
    const arb2opPfu         = mArb ? toInt(mArb[1]) : 0;
    const arb2opBareme      = mArb ? toInt(mArb[2]) : 0;
    const arb2opRecommande  = mArb ? (/barème/i.test(mArb[3]) ? 'bareme' : 'pfu') : null;
    const arb2opEconomie    = mArb ? toInt(mArb[4]) : 0;
    const option2opDeclaree = /Option 2OP déclarée\s*:\s*Oui/i.test(text);

    return {
      pvCapitalIR,
      pvCapitalPsBase,
      pvMobGain,
      pvMobGainImposable,
      arb2opPfu, arb2opBareme, arb2opRecommande, arb2opEconomie, option2opDeclaree,
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
