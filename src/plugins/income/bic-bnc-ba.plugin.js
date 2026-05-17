/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'bic-bnc-ba',
  label: 'BIC / BNC / BA — revenus professionnels indépendants',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() {
    return [
      { caseCode: '5KO', label: 'BIC professionnel imposable', declarant: 'D1' },
      { caseCode: '5HQ', label: 'BNC professionnel imposable', declarant: 'D1' },
    ];
  },
};
