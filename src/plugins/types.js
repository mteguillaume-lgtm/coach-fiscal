/**
 * Types JSDoc pour le système de plugins coach-fiscal.
 * Importé par les plugins pour l'autocomplétion IDE et par le registre pour la validation.
 */

/**
 * Champ de formulaire décrit par un plugin.
 * @typedef {Object} FieldDescriptor
 * @property {string}  key       - Clé dans formData / d1Data / d2Data
 * @property {string}  label     - Libellé affiché dans Collect.jsx
 * @property {'number'|'string'|'boolean'|'date'} type
 * @property {boolean} required
 * @property {'D1'|'D2'|'foyer'|null} [declarant] - null = champ commun foyer
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {Array<{field: string, message: string}>} errors
 */

/**
 * Résultat partiel de calcul retourné par calculator().
 * Les clés correspondent aux champs du profil v1 calculés par ce plugin.
 * @typedef {Object} CalculResult
 */

/**
 * Case déclarative gérée par un plugin.
 * @typedef {Object} CaseDescriptor
 * @property {string}  caseCode  - Code formulaire 2042 (ex. '1AJ', '2TR', '4BE')
 * @property {string}  label
 * @property {'D1'|'D2'|'foyer'} declarant
 * @property {boolean} [required]
 */

/**
 * Interface que tout plugin income doit respecter.
 * Vérifiée à l'import par registry.js.
 *
 * @typedef {Object} IncomePlugin
 * @property {string}           id               - Identifiant unique (kebab-case)
 * @property {string}           label            - Nom lisible
 * @property {string}           version          - Semver
 * @property {FieldDescriptor[]} fields          - Champs de formulaire
 * @property {function(string, string): Object}  parser
 *   (text, mode) → objet partiel compatible v1 flat
 * @property {function(Object, Object, Object, string): string} generator
 *   (formData, d1Data, d2Data, mode) → fragment texte profil
 * @property {function(Object): ValidationResult} validator
 * @property {function(Object): CalculResult}     calculator
 * @property {function(): CaseDescriptor[]}       declarativeCases
 */

/** Champs obligatoires vérifiés par le registre. */
export const PLUGIN_REQUIRED_FIELDS = [
  'id', 'label', 'version', 'fields',
  'parser', 'generator', 'validator', 'calculator', 'declarativeCases',
];
