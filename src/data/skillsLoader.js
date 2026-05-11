import fiscaliste from './skills/fiscaliste.md?raw';
import notaire from './skills/notaire.md?raw';
import comptable from './skills/comptable.md?raw';
import controleurFiscal from './skills/controleur-fiscal.md?raw';
import commissaire from './skills/commissaire-aux-comptes.md?raw';
import syndic from './skills/syndic.md?raw';
import gcp from './skills/gcp.md?raw';

export const SKILLS_MAP = {
  fiscaliste,
  notaire,
  comptable,
  'controleur-fiscal': controleurFiscal,
  'commissaire-aux-comptes': commissaire,
  syndic,
  gcp,
};

export const ALL_SKILLS = `## SKILL : Fiscaliste
${fiscaliste}

## SKILL : Notaire
${notaire}

## SKILL : Comptable
${comptable}

## SKILL : Contrôleur fiscal
${controleurFiscal}

## SKILL : Commissaire aux comptes
${commissaire}

## SKILL : Syndic
${syndic}

## SKILL : Gestionnaire de patrimoine
${gcp}`;

// ─── Enrichissements dynamiques depuis _sources/paperasse/ ────────────────────
// Vite résout ces globs à la compilation ; seuls les fichiers du skill actif
// sont injectés dans le system prompt (économie de tokens).

const _dataGlob = import.meta.glob(
  './paperasse/*/data/**/*.json',
  { query: '?raw', import: 'default', eager: true },
);

const _refsGlob = import.meta.glob(
  './paperasse/*/references/**/*.md',
  { query: '?raw', import: 'default', eager: true },
);

function parseSkillFiles(rawFiles) {
  const map = {};
  for (const [path, content] of Object.entries(rawFiles)) {
    const parts = path.split('/');
    const idx   = parts.lastIndexOf('paperasse');
    if (idx === -1) continue;
    const skill    = parts[idx + 1];
    const filename = parts.slice(idx + 3).join('/'); // relatif à data/ ou references/
    if (!map[skill]) map[skill] = {};
    map[skill][filename] = typeof content === 'string' ? content : String(content ?? '');
  }
  return map;
}

export const SKILL_DATA = parseSkillFiles(_dataGlob);
export const SKILL_REFS = parseSkillFiles(_refsGlob);
