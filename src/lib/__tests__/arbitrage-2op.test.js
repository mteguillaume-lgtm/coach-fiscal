import { describe, it, expect } from 'vitest';
import { arbitrage2OP, PFU_TAUX_IR, TAUX_PS_CAPITAL } from '../taxCalculator';

describe('arbitrage2OP — option barème globale (dividendes + intérêts + PV)', () => {
  it('tout à zéro → neutre, aucune économie', () => {
    const r = arbitrage2OP({});
    expect(r.pfu).toBe(0);
    expect(r.bareme).toBe(0);
    expect(r.economie).toBe(0);
  });

  it('PFU exact : 12,8 % IR + 17,2 % PS sur la base globale', () => {
    // TMI 45 % (RNI 200 000, 1 part) : le PFU gagne largement sur des dividendes.
    const r = arbitrage2OP({ dividendes: 10_000, rniFoyer: 200_000, parts: 1 });
    expect(r.pfu).toBe(Math.round(10_000 * (PFU_TAUX_IR + TAUX_PS_CAPITAL))); // 3 000
    expect(r.recommande).toBe('pfu');
    expect(r.economie).toBe(Math.abs(r.pfu - r.bareme));
  });

  it('TMI 11 % + dividendes → barème gagnant (abattement 40 % + CSG déductible)', () => {
    const r = arbitrage2OP({ dividendes: 10_000, rniFoyer: 15_000, parts: 1 });
    expect(r.recommande).toBe('bareme');
    expect(r.bareme).toBeLessThan(r.pfu);
  });

  it('PV pré-2018 avec abattement durée 65 % : inversion à TMI 30 %', () => {
    // Dividendes seuls à TMI 30 % → PFU gagne. Mais une PV dont la base barème est
    // réduite de 65 % (titres < 2018, ≥ 8 ans) fait basculer l'arbitrage GLOBAL.
    const divSeuls = arbitrage2OP({ dividendes: 5_000, rniFoyer: 60_000, parts: 1 });
    expect(divSeuls.recommande).toBe('pfu');

    const avecPv = arbitrage2OP({
      dividendes: 0, interets: 0,
      pvNetImposable: 20_000, pvBaseIRBareme: 7_000,   // abattement 65 %
      rniFoyer: 60_000, parts: 1,
    });
    expect(avecPv.pfu).toBe(Math.round(20_000 * (PFU_TAUX_IR + TAUX_PS_CAPITAL))); // 6 000
    expect(avecPv.recommande).toBe('bareme');
  });

  it('PV seule sans dividendes/intérêts : l\'arbitrage fonctionne (angle mort de l\'existant)', () => {
    const r = arbitrage2OP({ pvNetImposable: 20_000, rniFoyer: 200_000, parts: 1 });
    expect(r.recommande).toBe('pfu');   // TMI 45 % sans abattement → PFU
    expect(r.pfu).toBe(6_000);
  });

  it('les PS sont identiques dans les deux scénarios (assiette pleine)', () => {
    const r = arbitrage2OP({ dividendes: 10_000, pvNetImposable: 5_000, rniFoyer: 40_000, parts: 1 });
    expect(r.detail.ps).toBe(Math.round(15_000 * TAUX_PS_CAPITAL));
    expect(r.pfu - r.detail.irPfu).toBe(r.detail.ps);
    expect(r.bareme - r.detail.irBareme).toBe(r.detail.ps);
  });
});
