// URL du backend patrimoine + jeton secret perso, en localStorage (comme la clé API).
const URL_KEY = 'kapio.patrimoine.backendUrl';
const SECRET_KEY = 'kapio.patrimoine.backendSecret';

export function getBackendConfig(storage = localStorage) {
  return {
    url: storage.getItem(URL_KEY) || '',
    secret: storage.getItem(SECRET_KEY) || '',
  };
}

export function setBackendConfig({ url, secret }, storage = localStorage) {
  if (url) storage.setItem(URL_KEY, url); else storage.removeItem(URL_KEY);
  if (secret) storage.setItem(SECRET_KEY, secret); else storage.removeItem(SECRET_KEY);
}

export function hasBackendConfig(storage = localStorage) {
  const { url, secret } = getBackendConfig(storage);
  return Boolean(url && secret);
}
