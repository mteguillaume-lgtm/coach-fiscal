/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'revenus-etrangers',
  label: 'Revenus de source étrangère (conventions fiscales)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '8TI', label: 'Revenus étrangers imposables en France', declarant: 'foyer' }]; },
};
