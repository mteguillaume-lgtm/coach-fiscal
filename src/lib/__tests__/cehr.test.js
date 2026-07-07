import { describe, it, expect } from 'vitest';
import { calcCEHR, CEHR_BAREME } from '../taxCalculator';

describe('CEHR — barème lu depuis bareme-ir-YYYY.json (paperasse-first)', () => {
  it('expose le barème du JSON (preuve de lecture, pas de valeurs en dur)', () => {
    expect(CEHR_BAREME.seuils_celibataire[0]).toMatchObject({ de: 250000, a: 500000, taux: 0.03 });
    expect(CEHR_BAREME.seuils_couple[0]).toMatchObject({ de: 500000, a: 1000000, taux: 0.03 });
  });

  it('célibataire : 0 sous le seuil, 3 % puis 4 %', () => {
    expect(calcCEHR(200_000, false)).toBe(0);
    expect(calcCEHR(300_000, false)).toBe(1_500);          // 3 % × 50 000
    expect(calcCEHR(600_000, false)).toBe(11_500);         // 7 500 + 4 000
  });

  it('couple : seuils doublés', () => {
    expect(calcCEHR(400_000, true)).toBe(0);
    expect(calcCEHR(600_000, true)).toBe(3_000);           // 3 % × 100 000
    expect(calcCEHR(1_200_000, true)).toBe(23_000);        // 15 000 + 8 000
  });
});
