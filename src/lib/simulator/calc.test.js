import { describe, it, expect } from 'vitest';
import { simulate, envelope } from './calc.js';

describe('Capital brut — taux équivalent, fin de mois', () => {
  it('10 000 € + 500 €/mois × 20 ans à 5 %', () => {
    const r = simulate({ C0: 10_000, V: 500, years: 20, rate: 0.05 });
    expect(Math.round(r.capitalBrut)).toBe(229_435);
    expect(r.versementsTotaux).toBe(130_000);
    expect(Math.round(r.interets)).toBe(99_435);
  });

  it('série temporelle : len = N+1, monotone croissante', () => {
    const r = simulate({ C0: 10_000, V: 500, years: 20, rate: 0.05 });
    expect(r.serie.length).toBe(241);
    expect(r.serie[0].capital).toBe(10_000);
    expect(r.serie[240].capital).toBeCloseTo(r.capitalBrut, 0);
    for (let m = 1; m < r.serie.length; m++) {
      expect(r.serie[m].capital).toBeGreaterThan(r.serie[m - 1].capital);
    }
  });

  it('cas dégénéré taux 0 %', () => {
    const r = simulate({ C0: 10_000, V: 500, years: 20, rate: 0 });
    expect(r.capitalBrut).toBe(130_000);
    expect(r.interets).toBe(0);
  });
});

describe('Enveloppes — valeurs attendues à 10 000 + 500/mois × 20 ans × 5 %', () => {
  it('Livret A à 3 % figé', () => {
    const r = envelope('livretA', { C0: 10_000, V: 500, years: 20 });
    expect(Math.round(r.capitalNet)).toBeCloseTo(181_488, -2);
  });

  it('PEA après 17,2 % PS sur intérêts', () => {
    const r = envelope('pea', { C0: 10_000, V: 500, years: 20, rate: 0.05 });
    expect(Math.round(r.capitalNet)).toBe(212_332);
  });

  it('AV > 8 ans (abat 9 200 couple) — 7,5 % IR + 17,2 % PS', () => {
    const r = envelope('av', { C0: 10_000, V: 500, years: 20, rate: 0.05, couple: true });
    expect(Math.round(r.capitalNet)).toBeCloseTo(205_565, -1);
  });

  it('CTO — PFU 30 % sur intérêts', () => {
    const r = envelope('cto', { C0: 10_000, V: 500, years: 20, rate: 0.05 });
    expect(Math.round(r.capitalNet)).toBe(199_605);
  });

  it('PER — TMI 30→11 + boost réinvest. IR', () => {
    const r = envelope('per', {
      C0: 10_000, V: 500, years: 20, rate: 0.05,
      tmiEntree: 0.30, tmiSortie: 0.11,
    });
    expect(Math.round(r.capitalNet)).toBeCloseTo(249_675, -2);
  });
});
