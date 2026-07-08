// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppProvider } from '../../context/AppContext';
import Rapport from '../Rapport';

// process.cwd() plutôt qu'import.meta.url : sous jsdom, import.meta.url est http://.
const REF = readFileSync(
  resolve(process.cwd(), 'src/lib/__tests__/fixtures/profil-fiscal-ref.txt'), 'utf8',
);

// Node ≥ 22 expose un localStorage global expérimental (inactif sans flag) qui
// masque celui de jsdom → shim mémoire explicite pour ce test.
function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
  };
}

describe('Rapport — smoke test de rendu complet (filet E6)', () => {
  beforeAll(() => {
    const storage = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    localStorage.setItem('kapio.state', JSON.stringify({ profile: REF, mode: 'couple' }));
    // jsdom n'implémente pas matchMedia (utilisé par framer-motion / AuroraBackground).
    window.matchMedia = (query) => ({
      matches: false, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
      dispatchEvent: () => false,
    });
  });

  it('rend la page avec le profil de référence (titres clés présents)', async () => {
    render(<MemoryRouter><AppProvider><Rapport /></AppProvider></MemoryRouter>);
    // L'hydratation localStorage est asynchrone (useEffect) → findBy.
    expect((await screen.findAllByText(/Revenus 2025/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Salaires retenus/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Feuille de route/)).length).toBeGreaterThan(0);
  });
});
