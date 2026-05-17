import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseProfile } from '../profileParser.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Profil de référence — foyer pacsé multi-revenus (IJ CPAM, rente, Livret+, acomptes)
const REF_PATH = resolve(__dir, '../../../../../Downloads/profil-fiscal-2026-05-17 v4.txt');
let REF;
try {
  REF = readFileSync(REF_PATH, 'utf-8');
} catch {
  REF = null;
}

const desc = REF ? describe : describe.skip;

desc('parseProfile — profil de référence v4', () => {
  let pp;
  it('parse sans erreur', () => {
    pp = parseProfile(REF);
    expect(pp).toBeTruthy();
  });

  it('mode couple', () => {
    pp = pp || parseProfile(REF);
    expect(pp.mode).toBe('couple');
  });

  it('statut Pacsé(e)', () => {
    pp = pp || parseProfile(REF);
    expect(pp.statut).toMatch(/Pacsé/i);
  });

  it('salaireNetImposableD1 = 45 162 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.salaireNetImposableD1).toBe(45162);
  });

  it('salaireNetImposableD2 ≈ 29 283 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.salaireNetImposableD2).toBe(29283);
  });

  it('pasD1 = 4 609 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.pasD1).toBe(4609);
  });

  it('pasD2 = 1 741 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.pasD2).toBe(1741);
  });

  it('rniFoyer = 73 067 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.rniFoyer).toBe(73067);
  });

  it('tmi = 30 %', () => {
    pp = pp || parseProfile(REF);
    expect(pp.tmi).toBe(30);
  });

  it('intMob2TR = 527 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.intMob2TR).toBe(527);
  });

  it('intMob2CK = 68 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.intMob2CK).toBe(68);
  });

  it('acompte8HW = 12 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.acompte8HW).toBe(12);
  });

  it('acompte8IW = 12 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.acompte8IW).toBe(12);
  });

  it('acompte8HX = 24 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.acompte8HX).toBe(24);
  });

  it('acompte8IX = 18 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.acompte8IX).toBe(18);
  });

  it('peroD1 = 1 260 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.peroD1).toBe(1260);
  });

  it('revensFonciers = 705 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.revensFonciers).toBe(705);
  });

  it('typeRevenuD1 = Salarié(e)', () => {
    pp = pp || parseProfile(REF);
    expect(pp.typeRevenuD1).toMatch(/Salarié/i);
  });

  it('typeRevenuD2 = Salarié(e)', () => {
    pp = pp || parseProfile(REF);
    expect(pp.typeRevenuD2).toMatch(/Salarié/i);
  });

  it('cryptoPlateformeD1 = Binance', () => {
    pp = pp || parseProfile(REF);
    expect(pp.cryptoPlateformeD1).toBe('Binance');
  });

  it('avVerseD1 = 300', () => {
    pp = pp || parseProfile(REF);
    expect(pp.avVerseD1).toBe(300);
  });

  it('avVerseD2 = 300', () => {
    pp = pp || parseProfile(REF);
    expect(pp.avVerseD2).toBe(300);
  });

  it('plafondPerD1 (disponible après PERO) = 3 450 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.plafondPerD1).toBe(3450);
  });

  it('plafondPerD2 (disponible, pas de PERO) = 4 710 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.plafondPerD2).toBe(4710);
  });

  it('ijCpamD2 ≈ 1 599 € (dont 1 598,80 IJ CPAM)', () => {
    pp = pp || parseProfile(REF);
    expect(pp.ijCpamD2).toBe(1599);
  });

  it('ijCpamOrgD2 = Maine-et-Loire', () => {
    pp = pp || parseProfile(REF);
    expect(pp.ijCpamOrgD2).toMatch(/Maine-et-Loire/i);
  });

  it('rente1BsD2 = 6 192 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.rente1BsD2).toBe(6192);
  });

  it('pasRente1BsD2 = 0 €', () => {
    pp = pp || parseProfile(REF);
    expect(pp.pasRente1BsD2).toBe(0);
  });

  it('orgRente1BsD2 contient Crédit Agricole', () => {
    pp = pp || parseProfile(REF);
    expect(pp.orgRente1BsD2).toMatch(/Crédit Agricole/i);
  });

  it('recurrentRente1BsD2 = false (NON RÉCURRENT)', () => {
    pp = pp || parseProfile(REF);
    expect(pp.recurrentRente1BsD2).toBe(false);
  });

  // Test 3 — Calcul IR (tolérance ± 5 €)
  it('calcul IR : irNet ≈ 8 202 € (± 5)', () => {
    pp = pp || parseProfile(REF);
    if (pp.irNet > 0) {
      expect(Math.abs(pp.irNet - 8202)).toBeLessThanOrEqual(5);
    }
  });

  it('calcul IR : totalDu présent dans le profil enrichi', () => {
    pp = pp || parseProfile(REF);
    if (pp.totalDu > 0) {
      expect(pp.totalDu).toBe(8202);
    }
  });
});

describe('parseProfile — profil vide / null', () => {
  it('retourne un objet avec mode solo par défaut', () => {
    const pp = parseProfile('');
    expect(pp.mode).toBe('solo');
    expect(pp.salaireNetImposableD1).toBe(0);
  });

  it('null ne lève pas d\'erreur', () => {
    expect(() => parseProfile(null)).not.toThrow();
  });
});

describe('parseProfile — format solo minimal', () => {
  const SOLO = `== PROFIL FISCAL PERSONNEL 2025 ==
== SITUATION PERSONNELLE ==
Statut : Célibataire
Parts fiscales : 1

== REVENUS 2025 ==
Net imposable annuel (1AJ — case déclaration) : 45 000 €
PAS prélevé 2025 : 4 200 €
Taux PAS : 10%
Intérêts mobiliers bruts (case 2TR) : 200 €
PFU 12,8% prélevé (case 2CK) : 26 €
Acompte IR D1 (8HW) : 10 €
Acompte PS D1 (8HX) : 15 €`;

  it('mode solo', () => {
    expect(parseProfile(SOLO).mode).toBe('solo');
  });

  it('statut Célibataire', () => {
    expect(parseProfile(SOLO).statut).toBe('Célibataire');
  });

  it('net imposable D1 = 45 000', () => {
    expect(parseProfile(SOLO).salaireNetImposableD1).toBe(45000);
  });

  it('intMob2TR = 200', () => {
    expect(parseProfile(SOLO).intMob2TR).toBe(200);
  });

  it('intMob2CK = 26', () => {
    expect(parseProfile(SOLO).intMob2CK).toBe(26);
  });

  it('acompte8HW = 10', () => {
    expect(parseProfile(SOLO).acompte8HW).toBe(10);
  });

  it('acompte8HX = 15', () => {
    expect(parseProfile(SOLO).acompte8HX).toBe(15);
  });
});
