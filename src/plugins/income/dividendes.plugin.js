/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'dividendes',
  label: 'Dividendes et distributions (2DC/2BH)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() {
    return [
      { caseCode: '2DC', label: 'Dividendes bruts', declarant: 'foyer' },
      { caseCode: '2DA', label: 'Abattement 40% sur dividendes', declarant: 'foyer' },
    ];
  },
};
