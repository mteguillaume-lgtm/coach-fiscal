/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'reductions-credits',
  label: 'Réductions et crédits d\'impôt (dons, garde, emploi à domicile…)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() {
    return [
      { caseCode: '7UF', label: 'Dons associations (réduction 66%)', declarant: 'foyer' },
      { caseCode: '7DB', label: 'Garde enfants (crédit 50%)', declarant: 'foyer' },
      { caseCode: '7DB', label: 'Emploi à domicile (crédit 50%)', declarant: 'foyer' },
    ];
  },
};
