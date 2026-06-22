import { describe, it, expect, beforeEach } from 'vitest';
import {
  keyStorageId, getStoredApiKey, setStoredApiKey, migrateLegacyApiKey, LEGACY_API_KEY,
} from '../apiKeyStore';

// Faux localStorage minimal et injectable.
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map,
  };
}

let storage;
beforeEach(() => { storage = makeStorage(); });

describe('apiKeyStore — clés par fournisseur', () => {
  it('utilise un identifiant de stockage par fournisseur', () => {
    expect(keyStorageId('anthropic')).toBe('kapio.apiKey.anthropic');
    expect(keyStorageId('mistral')).toBe('kapio.apiKey.mistral');
  });

  it('écrit et lit indépendamment chaque fournisseur', () => {
    setStoredApiKey('anthropic', 'sk-ant-aaa', storage);
    setStoredApiKey('mistral', 'mmm-key', storage);
    expect(getStoredApiKey('anthropic', storage)).toBe('sk-ant-aaa');
    expect(getStoredApiKey('mistral', storage)).toBe('mmm-key');
  });

  it('retourne une chaîne vide en l’absence de clé', () => {
    expect(getStoredApiKey('mistral', storage)).toBe('');
  });

  it('efface la clé quand on passe une valeur vide', () => {
    setStoredApiKey('anthropic', 'sk-ant-aaa', storage);
    setStoredApiKey('anthropic', '', storage);
    expect(getStoredApiKey('anthropic', storage)).toBe('');
  });

  it('ne contamine pas l’autre fournisseur', () => {
    setStoredApiKey('anthropic', 'sk-ant-aaa', storage);
    expect(getStoredApiKey('mistral', storage)).toBe('');
  });
});

describe('apiKeyStore — migration legacy', () => {
  it('migre l’ancienne clé unique vers le fournisseur Anthropic', () => {
    storage = makeStorage({ [LEGACY_API_KEY]: 'sk-ant-legacy' });
    const migrated = migrateLegacyApiKey(storage);
    expect(migrated).toBe(true);
    expect(getStoredApiKey('anthropic', storage)).toBe('sk-ant-legacy');
    expect(storage.getItem(LEGACY_API_KEY)).toBe(null);
  });

  it('ne surcharge pas une clé Anthropic déjà présente', () => {
    storage = makeStorage({
      [LEGACY_API_KEY]: 'sk-ant-old',
      [keyStorageId('anthropic')]: 'sk-ant-current',
    });
    migrateLegacyApiKey(storage);
    expect(getStoredApiKey('anthropic', storage)).toBe('sk-ant-current');
    expect(storage.getItem(LEGACY_API_KEY)).toBe(null); // legacy nettoyée
  });

  it('est un no-op idempotent sans clé legacy', () => {
    expect(migrateLegacyApiKey(storage)).toBe(false);
    expect(migrateLegacyApiKey(storage)).toBe(false);
  });
});
