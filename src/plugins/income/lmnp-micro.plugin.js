/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'lmnp-micro',
  label: 'LMNP micro-BIC (abat. 50%)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '5ND', label: 'Revenus LMNP micro-BIC', declarant: 'foyer' }]; },
};
