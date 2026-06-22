// Stockage des clés API par fournisseur (localStorage).
//
// Une clé par fournisseur, pour ne pas écraser l'une avec l'autre :
//   kapio.apiKey.anthropic
//   kapio.apiKey.mistral
//
// Rétro-compat : l'ancienne clé unique `kapio.apiKey` était toujours une clé
// Anthropic — on la migre une fois vers `kapio.apiKey.anthropic`.
//
// Toutes les fonctions acceptent un `storage` injectable (par défaut
// localStorage) pour rester testables unitairement.

export const LEGACY_API_KEY = 'kapio.apiKey';

/** Identifiant de stockage de la clé d'un fournisseur. */
export const keyStorageId = (provider) => `kapio.apiKey.${provider}`;

/** Lit la clé stockée d'un fournisseur (chaîne vide si absente). */
export function getStoredApiKey(provider, storage = localStorage) {
  return storage.getItem(keyStorageId(provider)) || '';
}

/** Écrit (ou efface si vide) la clé d'un fournisseur. */
export function setStoredApiKey(provider, key, storage = localStorage) {
  if (key) storage.setItem(keyStorageId(provider), key);
  else storage.removeItem(keyStorageId(provider));
}

/**
 * Migre l'ancienne clé unique vers la clé Anthropic, une seule fois.
 * Ne surcharge pas une clé Anthropic déjà présente. Idempotent.
 * @returns {boolean} true si une migration a eu lieu.
 */
export function migrateLegacyApiKey(storage = localStorage) {
  const legacy = storage.getItem(LEGACY_API_KEY);
  if (!legacy) return false;
  const target = keyStorageId('anthropic');
  if (!storage.getItem(target)) storage.setItem(target, legacy);
  storage.removeItem(LEGACY_API_KEY);
  return true;
}
