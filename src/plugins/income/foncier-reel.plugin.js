/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'foncier-reel',
  label: 'Revenus fonciers régime réel (≥ 15 000 €)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '4BA', label: 'Revenus fonciers nets réel', declarant: 'foyer' }]; },
};
