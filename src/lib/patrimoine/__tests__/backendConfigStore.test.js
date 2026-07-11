import { describe, it, expect, beforeEach } from 'vitest';
import { getBackendConfig, setBackendConfig, hasBackendConfig } from '../backendConfigStore';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('patrimoine/backendConfigStore', () => {
  let s;
  beforeEach(() => { s = memStorage(); });

  it('vide par défaut', () => {
    expect(getBackendConfig(s)).toEqual({ url: '', secret: '' });
    expect(hasBackendConfig(s)).toBe(false);
  });

  it('persiste url + secret', () => {
    setBackendConfig({ url: 'https://x.vercel.app', secret: 'abc' }, s);
    expect(getBackendConfig(s)).toEqual({ url: 'https://x.vercel.app', secret: 'abc' });
    expect(hasBackendConfig(s)).toBe(true);
  });

  it('hasBackendConfig exige les deux champs', () => {
    setBackendConfig({ url: 'https://x', secret: '' }, s);
    expect(hasBackendConfig(s)).toBe(false);
  });
});
