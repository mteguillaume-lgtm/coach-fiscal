/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'plus-values-mobilieres',
  label: 'Plus-values mobilières (PEA/compte-titres)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '3VG', label: 'Plus-values imposables PFU', declarant: 'foyer' }]; },
};
