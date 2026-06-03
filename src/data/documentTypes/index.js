// Loader du registre de types de documents.
//
// Le registre lui-même (registry.json) est un fichier de DONNÉES PUR, agnostique du
// framework : les motifs `detect` y sont des CHAÎNES, compilées ici en RegExp. Un futur
// loader Python pourra relire le même JSON sans dépendre de ce module.
//
// Ce module ne contient que la « plomberie » de lecture : compilation des regex,
// indexation par id, et helpers de sélection. Aucune logique métier d'extraction
// (voir src/lib/docExtract.js) ni d'anonymisation (voir src/lib/patterns.js).

import registry from './registry.json';

export const VERSION = registry.version;

/** Toutes les entrées du registre (données brutes, ordre du fichier). */
export const DOCUMENTS = registry.documents;

const _byId = new Map(DOCUMENTS.map(d => [d.id, d]));

// Détecteurs compilés une fois : { id, label, regexes: RegExp[] }
const _detectors = DOCUMENTS
  .filter(d => Array.isArray(d.detect) && d.detect.length > 0)
  .map(d => ({
    id: d.id,
    label: d.label,
    regexes: d.detect.map(src => new RegExp(src, 'i')),
  }));

/** Retourne l'entrée de registre correspondant à un id, ou undefined. */
export function getType(id) {
  return _byId.get(id);
}

/**
 * Détecte le type de document à partir du texte brut extrait localement (pdf.js).
 * Score = nombre de motifs `detect` qui matchent. En cas d'égalité, l'ordre du
 * registre tranche (le premier déclaré gagne).
 *
 * @param {string} text
 * @returns {{ id: string|null, label: string|null, confidence: number, matches: number }}
 *   id = null si aucun type reconnu (confidence 0).
 */
export function detectType(text) {
  if (!text) return { id: null, label: null, confidence: 0, matches: 0 };

  let best = { id: null, label: null, matches: 0 };
  for (const det of _detectors) {
    const matches = det.regexes.reduce((n, re) => (re.test(text) ? n + 1 : n), 0);
    if (matches > best.matches) best = { id: det.id, label: det.label, matches };
  }

  // confidence normalisée par le nombre de motifs du type retenu (0..1)
  const total = best.id ? _byId.get(best.id).detect.length : 0;
  const confidence = total > 0 ? best.matches / total : 0;
  return { ...best, confidence };
}

/**
 * Liste des documents à proposer dans la checklist, filtrée par les flags de l'étape 0.
 * Un document est retenu si `condition` est null (socle/universel) ou si le flag
 * correspondant est actif dans `modules`.
 *
 * @param {Record<string, boolean>} modules - collectProfile.modules
 * @returns {object[]} entrées du registre
 */
export function documentsForFlags(modules = {}) {
  return DOCUMENTS.filter(d => d.condition == null || !!modules[d.condition]);
}

/**
 * Flags « prouvés » par la présence d'un document de type `typeId`.
 * Sert au contrôle de cohérence déclaré ↔ détecté (Phase D).
 * @param {string} typeId
 * @returns {string[]} liste de flags (vide si socle/universel)
 */
export function evidenceFlags(typeId) {
  const d = _byId.get(typeId);
  return d && d.condition ? [d.condition] : [];
}
