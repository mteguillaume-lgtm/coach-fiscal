import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../apprentissage.plugin.js';
import { PLAFOND_APPRENTISSAGE_IR } from '../../../lib/taxCalculator.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MULTI = readFileSync(
  resolve(__dir, '../../../../tests/fixtures/profiles/multi-employeurs.txt'),
  'utf-8'
);

describe('apprentissage — identité', () => {
  it('id = "apprentissage"', () => expect(plugin.id).toBe('apprentissage'));
  it('version = "1.0.0"',    () => expect(plugin.version).toBe('1.0.0'));
  it('fields non vide',      () => expect(plugin.fields.length).toBeGreaterThan(0));
});

describe('apprentissage — constante paperasse', () => {
  it('PLAFOND_APPRENTISSAGE_IR = 21622', () => {
    expect(PLAFOND_APPRENTISSAGE_IR).toBe(21622);
  });
});

describe('apprentissage — parser (fixture multi-employeurs)', () => {
  const parsed = plugin.parser(MULTI, 'solo');

  it('lit brutApprentissageD1 = 20000', () => {
    expect(parsed.brutApprentissageD1).toBe(20000);
  });

  it('brutApprentissageD2 = 0 (profil célibataire)', () => {
    expect(parsed.brutApprentissageD2).toBe(0);
  });
});

describe('apprentissage — calculator', () => {
  it('brut < plafond → imposable = 0', () => {
    const result = plugin.calculator({ brutApprentissageD1: 20000, brutApprentissageD2: 0 });
    expect(result.rniApprentissageD1).toBe(0);
  });

  it('brut = plafond → imposable = 0', () => {
    const result = plugin.calculator({ brutApprentissageD1: PLAFOND_APPRENTISSAGE_IR });
    expect(result.rniApprentissageD1).toBe(0);
  });

  it('brut > plafond → imposable = brut - plafond', () => {
    const brut = PLAFOND_APPRENTISSAGE_IR + 3000;
    const result = plugin.calculator({ brutApprentissageD1: brut });
    expect(result.rniApprentissageD1).toBe(3000);
  });

  it('pas de brut → imposable = 0', () => {
    const result = plugin.calculator({});
    expect(result.rniApprentissageD1).toBe(0);
    expect(result.rniApprentissageD2).toBe(0);
  });
});

describe('apprentissage — generator (solo)', () => {
  const d1 = { brut_apprentissage: '20000' };
  const out = plugin.generator({}, d1, {}, 'solo');

  it('contient le header == APPRENTISSAGE ==', () => {
    expect(out).toContain('== APPRENTISSAGE ==');
  });

  it('contient Rémunération brute', () => {
    expect(out).toContain('Rémunération brute');
  });

  it('contient Net imposable (1AJ) : 0 € (tout exonéré)', () => {
    expect(out).toContain('Net imposable (1AJ) : 0');
  });
});

describe('apprentissage — generator (couple)', () => {
  const d1 = { brut_apprentissage: '25000' };
  const d2 = { brut_apprentissage: '18000' };
  const out = plugin.generator({}, d1, d2, 'couple');

  it('section DÉCLARANT 1', () => expect(out).toContain('DÉCLARANT 1'));
  it('section DÉCLARANT 2', () => expect(out).toContain('DÉCLARANT 2'));

  it('D1 : imposable = 25000 - 21622 = 3378', () => {
    expect(out).toContain('3 378');
  });

  it('D2 : imposable = 0 (18000 < 21622)', () => {
    // D2 section starts after the D1 section — slice from DÉCLARANT 2
    const d2Start = out.indexOf('DÉCLARANT 2');
    expect(d2Start).toBeGreaterThan(-1);
    expect(out.slice(d2Start)).toContain('Net imposable (1AJ) : 0');
  });
});

describe('apprentissage — generator vide si pas de montant', () => {
  it('retourne "" si brut = 0', () => {
    expect(plugin.generator({}, {}, {}, 'solo')).toBe('');
  });
});

describe('apprentissage — round-trip parser → generator → parser', () => {
  it('brut 20000 → génère → reparse → brutApprentissageD1 = 20000', () => {
    const d1 = { brut_apprentissage: '20000' };
    const generated = plugin.generator({}, d1, {}, 'solo');
    const reparsed = plugin.parser(generated, 'solo');
    expect(reparsed.brutApprentissageD1).toBe(20000);
  });

  it('brut > plafond → génère → reparse → brutApprentissageD1 conservé', () => {
    const brut = PLAFOND_APPRENTISSAGE_IR + 5000;
    const d1 = { brut_apprentissage: String(brut) };
    const generated = plugin.generator({}, d1, {}, 'solo');
    const reparsed = plugin.parser(generated, 'solo');
    expect(reparsed.brutApprentissageD1).toBe(brut);
  });
});

describe('apprentissage — validator', () => {
  it('montant valide → valid = true', () => {
    expect(plugin.validator({ brut_apprentissage: '20000' }).valid).toBe(true);
  });

  it('montant négatif → erreur', () => {
    const r = plugin.validator({ brut_apprentissage: '-100' });
    expect(r.valid).toBe(false);
    expect(r.errors[0].field).toBe('brut_apprentissage');
  });

  it('sans montant → valid = true', () => {
    expect(plugin.validator({}).valid).toBe(true);
  });
});

describe('apprentissage — declarativeCases', () => {
  const cases = plugin.declarativeCases();
  it('retourne 1AJ et 1BJ', () => {
    const codes = cases.map(c => c.caseCode);
    expect(codes).toContain('1AJ');
    expect(codes).toContain('1BJ');
  });
});
