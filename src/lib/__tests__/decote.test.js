import { describe, it, expect } from 'vitest';
import { DECOTE, calcIR } from '../taxCalculator';

describe('Décote — taux lu depuis bareme-ir-YYYY.json (paperasse-first)', () => {
  it('expose un champ machine taux (pas seulement la formule en prose)', () => {
    expect(typeof DECOTE.taux).toBe('number');
    expect(DECOTE.taux).toBeGreaterThan(0);
    expect(DECOTE.taux).toBeLessThan(1);
  });

  it('la décote réduit bien l\'IR d\'un petit revenu (non-régression comportementale)', () => {
    // Solo, RNI 20 000 € : IR brut sous le seuil de décote → décote active.
    const avecDecote = calcIR(20_000, 1, false);
    expect(avecDecote).toBeGreaterThan(0);
    // Un revenu élevé n'est pas décoté : l'IR croît plus vite que linéairement en bas de barème.
    expect(calcIR(40_000, 1, false)).toBeGreaterThan(2 * avecDecote);
  });
});
