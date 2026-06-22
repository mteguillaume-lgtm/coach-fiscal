// Registre des fournisseurs IA.
// Découple la logique métier (Chat, Profile, Collect) du format de chaque API.
// Chaque adaptateur respecte le même contrat ; on aiguille ici par `provider`.

import * as anthropic from './anthropic';
import * as mistral from './mistral';

export const DEFAULT_PROVIDER = 'anthropic';

const ADAPTERS = {
  anthropic,
  mistral,
};

/**
 * Métadonnées d'affichage (utilisées par Setup.jsx). Aucune logique métier ici.
 * `placeholder` et `consoleUrl` pilotent le champ clé ; `note` est un court
 * avertissement contextuel.
 */
// `tiers` : noms d'affichage des modèles par tier logique ('haiku'|'sonnet'|'opus').
//   short — libellé court (boutons), full — libellé complet (badges),
//   emoji — pictogramme, cost — ordre de grandeur de coût ('' si non communiqué).
export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Claude',
    vendor: 'Anthropic',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-api03-...',
    keyHint: 'sk-ant-',
    note: 'Premium — meilleur raisonnement. Analyse PDF + images.',
    tiers: {
      haiku:  { short: 'Haiku',  full: 'Haiku 4.5',  emoji: '⚡', cost: '~< 0,01 $' },
      sonnet: { short: 'Sonnet', full: 'Sonnet 4.6', emoji: '🧠', cost: '~0,01–0,03 $' },
      opus:   { short: 'Opus',   full: 'Opus 4.7',   emoji: '🔮', cost: '~0,05–0,10 $' },
    },
  },
  {
    id: 'mistral',
    label: 'Mistral',
    vendor: 'Mistral AI',
    consoleUrl: 'https://console.mistral.ai/api-keys',
    placeholder: 'Votre clé Mistral…',
    keyHint: 'clé alphanumérique',
    note: 'Européen, souverain, tier gratuit. Analyse PDF + images.',
    tiers: {
      haiku:  { short: 'Small',  full: 'Mistral Small',  emoji: '⚡', cost: '' },
      sonnet: { short: 'Medium', full: 'Mistral Medium', emoji: '🧠', cost: '' },
      opus:   { short: 'Large',  full: 'Mistral Large',  emoji: '🔮', cost: '' },
    },
  },
];

/** Retourne les métadonnées d'un fournisseur (ou celles du défaut si inconnu). */
export function getProviderMeta(provider) {
  return PROVIDERS.find(p => p.id === provider)
    ?? PROVIDERS.find(p => p.id === DEFAULT_PROVIDER);
}

function resolve(provider) {
  return ADAPTERS[provider] ?? ADAPTERS[DEFAULT_PROVIDER];
}

/**
 * Chat en streaming auprès du fournisseur choisi.
 * @param {'anthropic'|'mistral'} provider
 * @param {{ apiKey, messages, system, onChunk, model }} opts
 * @returns {Promise<string>}
 */
export function chat(provider, opts) {
  return resolve(provider).chat(opts);
}

/**
 * Analyse d'images (pages rasterisées) auprès du fournisseur choisi.
 * @param {'anthropic'|'mistral'} provider
 * @param {Array<{blob:Blob, mediaType:string}>} images
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export function analyzeDoc(provider, images, apiKey) {
  return resolve(provider).analyzeDoc({ images, apiKey });
}

/** Valide une clé selon le format attendu par le fournisseur. */
export function isValidKey(provider, key) {
  return resolve(provider).isValidKey(key);
}

// Ré-export pratique du module partagé de détection de complexité.
export { detectComplexity, MAX_TOKENS } from '../complexity';
