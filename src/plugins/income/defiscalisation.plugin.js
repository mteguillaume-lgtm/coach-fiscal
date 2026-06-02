import { n } from '../../lib/profileParserUtils.js';

/**
 * Dispositifs de défiscalisation — réductions d'impôt (Pinel/Denormandie,
 * Malraux, Censi-Bouvard, FCPI/FIP, SOFICA, IR-PME Madelin, Girardin). PHASE 5.
 * Les réductions sont calculées et ventilées par le générateur (_defiscBlock →
 * calcReductionDefisc) dans la section « DÉFISCALISATION », en trois enveloppes :
 * plafond global 10 000 € (→ reductionsNichesSoumises), plafond majoré 18 000 €
 * SOFICA/outre-mer (→ reductionsNichesSpecifiques), et hors plafond Malraux
 * (→ reductionsHorsPlafond). Le plafonnement à deux étages est appliqué dans
 * computeFoyerSummary (plafonnementNichesDeuxEtages).
 *
 * @type {import('../types.js').IncomePlugin}
 */
export default {
  id: 'defiscalisation',
  label: 'Dispositifs de défiscalisation (Pinel, FCPI/FIP, SOFICA, Malraux, Madelin)',
  version: '1.0.0',

  fields: [],   // collectés en section Défiscalisation (Collect.jsx), émis par profileGenerator._defiscBlock

  parser(text /*, mode — cas foyer */) {
    const reductionsNichesSoumises    = n(text, /Réductions défisc soumises plafond 10 000 € foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const reductionsNichesSpecifiques = n(text, /Réductions défisc spécifiques plafond 18 000 € foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const reductionsHorsPlafond       = n(text, /Réductions défisc hors plafond foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
    const defiscFerme                 = /Dispositif défiscalisation fermé \(report\)\s*:\s*Oui/i.test(text);
    return {
      reductionsNichesSoumises,
      reductionsNichesSpecifiques,
      reductionsHorsPlafond,
      defiscFerme,
    };
  },

  generator() { return ''; },   // émis par profileGenerator._defiscBlock

  validator() { return { valid: true, errors: [] }; },

  calculator() { return {}; },   // plafonnement appliqué par computeFoyerSummary

  declarativeCases() {
    return [
      { caseCode: '7GQ', label: 'FCPI — souscription (réduction 18 %)', declarant: 'foyer', required: false },
      { caseCode: '7FQ', label: 'FIP — souscription (réduction 18 %)', declarant: 'foyer', required: false },
      { caseCode: '7CF', label: 'IR-PME Madelin — souscription au capital de PME', declarant: 'foyer', required: false },
      { caseCode: '7GN', label: 'SOFICA — réduction 30 % (plafond majoré 18 000 €)', declarant: 'foyer', required: false },
      { caseCode: '7NA', label: 'Malraux — travaux de restauration (hors plafond global)', declarant: 'foyer', required: false },
      { caseCode: '7QA', label: 'Pinel/Denormandie — report (fermé aux acquisitions depuis le 31/12/2024)', declarant: 'foyer', required: false },
    ];
  },
};
