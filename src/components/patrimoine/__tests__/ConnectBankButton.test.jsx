// @vitest-environment jsdom
// src/components/patrimoine/__tests__/ConnectBankButton.test.jsx
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import ConnectBankButton from '../ConnectBankButton';

// Node ≥ 22 expose un localStorage global expérimental (inactif sans flag) qui
// masque celui de jsdom → shim mémoire explicite (même pattern que ManualPositions.test.jsx).
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

describe('ConnectBankButton', () => {
  it('demande la config backend quand elle manque', () => {
    render(<ConnectBankButton />);
    expect(screen.getByLabelText(/URL du backend/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jeton secret/i)).toBeInTheDocument();
  });
});
