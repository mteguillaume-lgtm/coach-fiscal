import { PLUGIN_REQUIRED_FIELDS } from './types.js';

function validatePlugin(plugin, path) {
  for (const field of PLUGIN_REQUIRED_FIELDS) {
    if (plugin[field] === undefined) {
      throw new Error(`[registry] Plugin "${plugin?.id ?? path}" : champ obligatoire manquant — "${field}"`);
    }
  }
  const fns = ['parser', 'generator', 'validator', 'calculator', 'declarativeCases'];
  for (const fn of fns) {
    if (typeof plugin[fn] !== 'function') {
      throw new Error(`[registry] Plugin "${plugin.id}" : "${fn}" doit être une fonction`);
    }
  }
  if (!Array.isArray(plugin.fields)) {
    throw new Error(`[registry] Plugin "${plugin.id}" : "fields" doit être un tableau`);
  }
}

// Auto-discovery : tout fichier *.plugin.js déposé dans income/ apparaît
// automatiquement sans modification de ce fichier.
const _modules = import.meta.glob('./income/*.plugin.js', { eager: true });

const _plugins = Object.entries(_modules).map(([path, mod]) => {
  const plugin = mod.default;
  validatePlugin(plugin, path);
  return plugin;
});

// Détection des IDs en double à l'import
const _ids = _plugins.map(p => p.id);
const _dups = _ids.filter((id, i) => _ids.indexOf(id) !== i);
if (_dups.length > 0) {
  throw new Error(`[registry] IDs de plugins en double : ${_dups.join(', ')}`);
}

export const registry = {
  /** Retourne tous les plugins découverts. */
  getAll() {
    return [..._plugins];
  },

  /** Retourne le plugin par son id, ou null si absent. */
  getById(id) {
    return _plugins.find(p => p.id === id) ?? null;
  },

  /**
   * Retourne les plugins qui déclarent la case donnée (ex. '1AJ', '2TR').
   * @param {string} caseCode
   */
  getByType(caseCode) {
    return _plugins.filter(p =>
      p.declarativeCases().some(c => c.caseCode === caseCode)
    );
  },
};
