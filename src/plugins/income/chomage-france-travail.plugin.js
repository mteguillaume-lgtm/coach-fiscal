/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'chomage-france-travail',
  label: 'Allocations chômage France Travail (ARE)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '1AP', label: 'Allocations chômage ARE', declarant: 'D1' }]; },
};
