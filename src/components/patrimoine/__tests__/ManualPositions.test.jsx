// @vitest-environment jsdom
// src/components/patrimoine/__tests__/ManualPositions.test.jsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ManualPositions from '../ManualPositions';
import { MANUAL_KEY } from '../../../lib/patrimoine/manualStore';

// Node ≥ 22 expose un localStorage global expérimental (inactif sans flag) qui
// masque celui de jsdom → shim mémoire explicite (même pattern que rapport-smoke.test.jsx).
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
  };
}

beforeAll(() => {
  const storage = memoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
});

beforeEach(() => localStorage.clear());
// Pas de globals:true dans vite.config.js → RTL n'auto-nettoie pas le DOM entre tests
afterEach(cleanup);

describe('ManualPositions', () => {
  it('replie le formulaire par défaut et l’ouvre via « Ajouter un placement »', () => {
    render(<ManualPositions mode="solo" />);
    expect(screen.queryByLabelText(/libellé/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ajouter un placement/i }));
    expect(screen.getByLabelText(/libellé/i)).toBeInTheDocument();
  });

  it('ajoute un poste manuel via le formulaire', () => {
    const onChange = vi.fn();
    render(<ManualPositions mode="solo" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /ajouter un placement/i }));
    fireEvent.change(screen.getByLabelText(/libellé/i), { target: { value: 'Mon PEA' } });
    fireEvent.change(screen.getByLabelText(/valeur/i), { target: { value: '42000' } });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }));
    expect(JSON.parse(localStorage.getItem(MANUAL_KEY))).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText('Mon PEA')).toBeInTheDocument();
  });
});
