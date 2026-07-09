import { describe, it, expect } from 'vitest';
import {
  getEffectivePlafondsWithReports, buildPerScenarios, buildTmiSortieSensitivity,
} from '../perScenarios';
import { TRANCHES, calcIR, getTMI } from '../taxCalculator';

// Profil solo TMI 30 % : RNI 50 000 €, 1 part, plafond PER 5 000 €.
const SOLO = {
  rniFoyer: 50_000, parts: 1, isCouple: false,
  plafondD1: 5_000, plafondD2: 0, rniD1: 50_000, rniD2: 0,
  stopRate: 0.11, irAvant: calcIR(50_000, 1, false),
};

describe('buildPerScenarios (audit — scénarios PER)', () => {
  const { scenarios, recommendedId } = buildPerScenarios(SOLO);

  it('produit un statu quo à 0 € sans économie', () => {
    const sq = scenarios.find(s => s.id === 'statu_quo');
    expect(sq.versement).toBe(0);
    expect(sq.economie).toBe(0);
    expect(sq.tmiResiduelle).toBe(getTMI(50_000, 1)); // 30
  });

  it('parité : économie = IR(avant) − IR(après versement) sur le barème réel', () => {
    const plafond = scenarios.find(s => s.id === 'plafond_max');
    expect(plafond.versement).toBe(5_000);
    expect(plafond.economie).toBe(Math.max(0, SOLO.irAvant - calcIR(45_000, 1, false)));
    expect(plafond.effort).toBe(plafond.versement - plafond.economie);
  });

  it('TMI résiduelle : cohérente avec getTMI après versement, jamais au-dessus de la TMI de départ', () => {
    for (const s of scenarios) {
      expect(s.tmiResiduelle).toBe(getTMI(Math.max(0, 50_000 - s.versement), 1));
      expect(s.tmiResiduelle).toBeLessThanOrEqual(30);
    }
  });

  it('recommendedId pointe le scénario à meilleure économie (hors statu quo)', () => {
    const reco = scenarios.find(s => s.id === recommendedId);
    const best = scenarios.filter(s => s.versement > 0).reduce((b, s) => s.economie > b.economie ? s : b);
    expect(reco.economie).toBe(best.economie);
  });
});

describe('buildTmiSortieSensitivity (risque législatif long terme)', () => {
  it('taux de sortie = 3 rates les plus bas du barème (paperasse-first, pas de littéral)', () => {
    const attendus = [...new Set(TRANCHES.map(t => t[2]))].sort((a, b) => a - b).slice(0, 3);
    const { points } = buildTmiSortieSensitivity({ versement: 5_000, economie: 1_500, stopRate: 0.11 });
    expect(points.map(p => p.tmiSortie)).toEqual(attendus);
  });

  it('avantage net décroît avec la TMI de sortie et vaut l\'économie à 0 %', () => {
    const { points } = buildTmiSortieSensitivity({ versement: 5_000, economie: 1_500, stopRate: 0.11 });
    expect(points[0].avantageNet).toBe(1_500);              // tmiSortie 0 → economie pleine
    expect(points[1].avantageNet).toBeGreaterThan(points[2].avantageNet);
    // À 30 % : 1 500 − round(5 000 × 0,30) = 0 → PER neutre
    expect(points[2].avantageNet).toBe(1_500 - Math.round(5_000 * 0.30));
  });

  it('marque le taux correspondant à la TMI de sortie déclarée', () => {
    const { points } = buildTmiSortieSensitivity({ versement: 5_000, economie: 1_500, stopRate: 0.11 });
    const decl = points.find(p => p.estTmiDeclaree);
    expect(Math.round(decl.tmiSortie * 100)).toBe(11);
  });
});

describe('getEffectivePlafondsWithReports', () => {
  it('ajoute les reports N-1/N-2/N-3 pro-ratés par RNI', () => {
    const r = getEffectivePlafondsWithReports({
      rniD1: 30_000, rniD2: 10_000, plafondPerD1: 3_000, plafondPerD2: 1_000,
      perReportableN1: 400, perReportableN2: 0, perReportableN3: 0,
    });
    expect(r.plafondD1).toBe(3_000 + Math.round(400 * (30_000 / 40_000))); // +300
    expect(r.plafondD2).toBe(1_000 + (400 - 300));                          // +100
  });
});
