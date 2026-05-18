import { describe, it, expect } from 'vitest';
import { baseIRFoyer, abattement10 } from '../taxCalculator.js';

describe('baseIRFoyer — agrégation multi-plugins Sprint A', () => {
  it('salaires seuls (cas de base, rétrocompatibilité)', () => {
    const p = { salaireNetImposableD1: 50000 };
    expect(baseIRFoyer(p)).toBe(abattement10(50000));
  });

  it('profil multi-employeurs : ARE + licenciement inclus dans la base', () => {
    // multi-employeurs.txt :
    //   sal=32 400 → abattement10=29 160
    //   ARE nette=2 660 → imposable à 100 % (aucun abattement)
    //   apprentissage brut=20 000 < plafond 21 622 → imposable=0
    //   licenciement tot=100 000, légale=20 000, remun=35 000
    //     exo=max(20000,70000,50000)=70000 → imp=30000
    //   PPV=2 500, remun 40 000 < seuil, accord=NON, <50 sal, PEE=NON → exonéré → imp=0
    const p = {
      salaireNetImposableD1: 32400,
      rniAreD1:           2660,
      rniApprentissageD1: 0,
      rniLicenciementD1:  30000,
      rniPpvD1:           0,
    };
    expect(baseIRFoyer(p)).toBe(61820); // 29160+2660+30000
    // Régression : ARE doit être dans la base (bug corrigé)
    expect(baseIRFoyer(p)).toBeGreaterThan(abattement10(32400) + 30000);
  });

  it('profil complexe : salaires + ARE + apprentissage excédent + PPV imposable', () => {
    // Foyer fictif : D1 sal=50 000, ARE=10 000, app excédent=5 000, PPV imposable=2 000
    const p = {
      salaireNetImposableD1: 50000,
      rniAreD1:           10000,
      rniApprentissageD1: 5000,
      rniPpvD1:           2000,
    };
    expect(baseIRFoyer(p)).toBe(62000); // 45000+10000+5000+2000
  });

  it('couple : D1 + D2 tous revenus additionnés', () => {
    const p = {
      salaireNetImposableD1: 40000,
      salaireNetImposableD2: 30000,
      rniAreD1:           5000,
      rniAreD2:           3000,
      rniLicenciementD1:  10000,
      rniLicenciementD2:  0,
      rniApprentissageD1: 0,
      rniApprentissageD2: 0,
      rniPpvD1:           0,
      rniPpvD2:           0,
    };
    const expected = abattement10(40000) + abattement10(30000) + 5000 + 3000 + 10000;
    expect(baseIRFoyer(p)).toBe(expected);
  });

  it('champs absents → traités comme 0 (pas d\'exception)', () => {
    expect(() => baseIRFoyer({})).not.toThrow();
    expect(baseIRFoyer({})).toBe(0);
  });
});
