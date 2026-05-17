/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'ifi',
  label: 'Impôt sur la Fortune Immobilière (IFI)',
  version: '0.0.1',
  fields: [],
  parser()           { return {}; },
  generator()        { return ''; },
  validator()        { return { valid: true, errors: [] }; },
  calculator()       { return {}; },
  declarativeCases() { return [{ caseCode: '9HI', label: 'Patrimoine immobilier IFI', declarant: 'foyer' }]; },
};
