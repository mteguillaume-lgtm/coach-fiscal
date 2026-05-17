/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'lmnp-reel',
  label: 'LMNP régime réel (BIC)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '5NA', label: 'Revenus LMNP réel nets', declarant: 'foyer' }]; },
};
