// Chargement À LA DEMANDE des skills et de leurs référentiels (audit E7).
// Globs NON-eager : chaque .md / .json devient un chunk séparé, téléchargé à la
// première question pour les seuls skills activés par le routeur — le bundle
// initial ne porte plus les 2 Mo de contenus bruts.
// Les JSON fiscaux restent importés PARSÉS par taxCalculator (calculs) — seule
// la copie ?raw destinée aux prompts est lazy.

const _skillsGlob = import.meta.glob('./skills/*.md',                     { query: '?raw', import: 'default' });
const _dataGlob   = import.meta.glob('./paperasse/*/data/**/*.json',      { query: '?raw', import: 'default' });
const _refsGlob   = import.meta.glob('./paperasse/*/references/**/*.md',  { query: '?raw', import: 'default' });

// Nom de fichier relatif après data/ ou references/ (aligné sur l'ancien parseSkillFiles).
const _relName = (path) => path.split(/\/(?:data|references)\//)[1];

async function _loadFamily(glob, id, kind) {
  const prefix = `./paperasse/${id}/${kind}/`;
  const entries = Object.entries(glob).filter(([path]) => path.startsWith(prefix));
  const out = {};
  for (const [path, load] of entries) out[_relName(path)] = String(await load() ?? '');
  return out;
}

const _cache = new Map();   // id → Promise<{ id, content, data, refs }>

function _loadOne(id) {
  if (_cache.has(id)) return _cache.get(id);
  const p = (async () => {
    const skillPath = `./skills/${id}.md`;
    const content = _skillsGlob[skillPath] ? String(await _skillsGlob[skillPath]() ?? '') : '';
    const [data, refs] = await Promise.all([
      _loadFamily(_dataGlob, id, 'data'),
      _loadFamily(_refsGlob, id, 'references'),
    ]);
    return { id, content, data, refs };
  })().catch((cause) => {
    _cache.delete(id);   // ne pas mettre l'échec en cache
    throw new Error('Connexion requise pour charger les référentiels fiscaux — réessayez.', { cause });
  });
  _cache.set(id, p);
  return p;
}

/**
 * Charge le contenu des skills demandés (SKILL.md + données JSON + références MD).
 * @param {string[]} ids
 * @returns {Promise<Array<{ id:string, content:string, data:Object, refs:Object }>>}
 */
export function loadSkills(ids = []) {
  return Promise.all(ids.map(_loadOne));
}
