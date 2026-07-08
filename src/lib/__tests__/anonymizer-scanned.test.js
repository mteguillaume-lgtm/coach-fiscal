import { describe, it, expect } from 'vitest';
import { assertTextLayer } from '../anonymizer';

describe('Garde-fou PDF scanné — aucune couche texte (audit C5)', () => {
  it('lève NO_TEXT_LAYER quand aucune page ne contient de mot', () => {
    expect(() => assertTextLayer([{ lines: [] }, { lines: [[]] }])).toThrowError(/scanné/);
    let code = null;
    try { assertTextLayer([{ lines: [] }]); } catch (e) { code = e.code; }
    expect(code).toBe('NO_TEXT_LAYER');
  });

  it('retourne le nombre de mots quand il y a du texte', () => {
    expect(assertTextLayer([
      { lines: [[{ text: 'a' }], [{ text: 'b' }, { text: 'c' }]] },
    ])).toBe(3);
  });
});
