/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'crypto-avance',
  label: 'Actifs numériques — plus-values avancées (3AN)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '3AN', label: 'Plus-values actifs numériques', declarant: 'foyer' }]; },
};
