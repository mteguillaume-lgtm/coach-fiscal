/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'plus-values-immo',
  label: 'Plus-values immobilières (cession RP/locatif)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '3VZ', label: 'Plus-values immo imposables', declarant: 'foyer' }]; },
};
