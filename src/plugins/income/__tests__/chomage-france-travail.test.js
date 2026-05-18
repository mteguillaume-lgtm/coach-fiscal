import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../chomage-france-travail.plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF   = readFileSync(resolve(__dir, '../../../lib/__tests__/fixtures/profil-fiscal-ref.txt'), 'utf-8');
const MULTI = readFileSync(resolve(__dir, '../../../../tests/fixtures/profiles/multi-employeurs.txt'), 'utf-8');

describe('chomage-france-travail.plugin — identité', () => {
  it('id = chomage-france-travail', () => {
    expect(plugin.id).toBe('chomage-france-travail');
  });

  it('version = 1.0.0', () => {
    expect(plugin.version).toBe('1.0.0');
  });
});

describe('chomage-france-travail.plugin — parser (fixture multi-employeurs, solo)', () => {
  const result = plugin.parser(MULTI, 'solo');

  it('areNetD1 = 2 660 (case 1AP)', () => {
    expect(result.areNetD1).toBe(2660);
  });

  it('areBrutD1 = 2 800', () => {
    expect(result.areBrutD1).toBe(2800);
  });

  it('arePasD1 = 0', () => {
    expect(result.arePasD1).toBe(0);
  });

  it('areNetD2 = 0 (solo, pas de D2)', () => {
    expect(result.areNetD2).toBe(0);
  });
});

describe('chomage-france-travail.plugin — parser (profil-fiscal-ref.txt — aucune ARE)', () => {
  const result = plugin.parser(REF, 'couple');

  it('areNetD1 = 0 si pas de section ARE', () => {
    expect(result.areNetD1).toBe(0);
  });

  it('areNetD2 = 0 si pas de section ARE', () => {
    expect(result.areNetD2).toBe(0);
  });
});

describe('chomage-france-travail.plugin — calculator (aucun abattement — paperasse ir-mecanisme.md)', () => {
  it('rniAreD1 = areNetD1 (pas d\'abattement sur 1AP)', () => {
    const result = plugin.calculator({ areNetD1: 2660, areNetD2: 0 });
    expect(result.rniAreD1).toBe(2660);
  });

  it('rniAreD2 = areNetD2', () => {
    const result = plugin.calculator({ areNetD1: 0, areNetD2: 1500 });
    expect(result.rniAreD2).toBe(1500);
  });

  it('rniAreD1 = 0 si areNetD1 absent', () => {
    expect(plugin.calculator({}).rniAreD1).toBe(0);
  });
});

describe('chomage-france-travail.plugin — round-trip solo', () => {
  it('generator → parser → mêmes valeurs', () => {
    const d1Data = { are_brut: '2800', are_net: '2660', are_pas: '0' };
    const txt = plugin.generator({}, d1Data, {}, 'solo');
    expect(txt).toContain('== ALLOCATIONS CHÔMAGE FRANCE TRAVAIL ==');
    const parsed = plugin.parser(txt, 'solo');
    expect(parsed.areNetD1).toBe(2660);
    expect(parsed.areBrutD1).toBe(2800);
    expect(parsed.arePasD1).toBe(0);
  });

  it('generator → parser → mêmes valeurs (couple D2)', () => {
    const d1Data = { are_brut: '0', are_net: '0', are_pas: '0' };
    const d2Data = { are_brut: '3000', are_net: '2850', are_pas: '100' };
    const txt = plugin.generator({}, d1Data, d2Data, 'couple');
    expect(txt).toContain('== ALLOCATIONS CHÔMAGE FRANCE TRAVAIL — DÉCLARANT 2 ==');
    const parsed = plugin.parser(txt, 'couple');
    expect(parsed.areNetD2).toBe(2850);
    expect(parsed.arePasD2).toBe(100);
  });
});

describe('chomage-france-travail.plugin — generator (retourne vide si aucune ARE)', () => {
  it('retourne "" si are_net et are_brut absents', () => {
    expect(plugin.generator({}, {}, {}, 'solo')).toBe('');
  });
});

describe('chomage-france-travail.plugin — validator', () => {
  it('valid = true si champs vides (facultatifs)', () => {
    expect(plugin.validator({}).valid).toBe(true);
  });

  it('valid = false si are_brut négatif', () => {
    expect(plugin.validator({ are_brut: '-100' }).valid).toBe(false);
  });

  it('valid = false si are_net négatif', () => {
    expect(plugin.validator({ are_net: '-50' }).valid).toBe(false);
  });
});

describe('chomage-france-travail.plugin — declarativeCases', () => {
  it('contient 1AP et 1BP', () => {
    const codes = plugin.declarativeCases().map(c => c.caseCode);
    expect(codes).toContain('1AP');
    expect(codes).toContain('1BP');
  });
});
