import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../mobiliers.plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF = readFileSync(resolve(__dir, '../../../lib/__tests__/fixtures/profil-fiscal-ref.txt'), 'utf-8');

describe('mobiliers.plugin — parser (profil de référence)', () => {
  const result = plugin.parser(REF, 'couple');

  it('intMob2TR = 527 €', () => {
    expect(result.intMob2TR).toBe(527);
  });

  it('intMob2CK = 68 €', () => {
    expect(result.intMob2CK).toBe(68);
  });
});

describe('mobiliers.plugin — calculator', () => {
  it('psMobilier = round(527 × 17,2%)', () => {
    const result = plugin.calculator({ intMob2TR: 527 });
    expect(result.psMobilier).toBe(Math.round(527 * 0.172));
  });

  it('psMobilier = 0 si intMob2TR absent', () => {
    expect(plugin.calculator({}).psMobilier).toBe(0);
  });
});

describe('mobiliers.plugin — generator', () => {
  it('retourne une chaîne', () => {
    const out = plugin.generator({ int_mob_2tr: '527', int_mob_2ck: '68' });
    expect(typeof out).toBe('string');
  });

  it('contient "2TR"', () => {
    const out = plugin.generator({ int_mob_2tr: '527', int_mob_2ck: '68' });
    expect(out).toContain('2TR');
  });

  it('contient "2BH"', () => {
    const out = plugin.generator({ int_mob_2tr: '527', int_mob_2ck: '68' });
    expect(out).toContain('2BH');
  });

  it('retourne chaîne vide si 2TR absent', () => {
    expect(plugin.generator({})).toBe('');
  });
});

describe('mobiliers.plugin — validator', () => {
  it('valid = true pour 2TR et 2CK cohérents', () => {
    expect(plugin.validator({ int_mob_2tr: '527', int_mob_2ck: '68' }).valid).toBe(true);
  });

  it('valid = false si 2CK > 2TR', () => {
    expect(plugin.validator({ int_mob_2tr: '100', int_mob_2ck: '200' }).valid).toBe(false);
  });
});

describe('mobiliers.plugin — declarativeCases', () => {
  it('contient 2TR, 2CK, 2BH', () => {
    const codes = plugin.declarativeCases().map(c => c.caseCode);
    expect(codes).toContain('2TR');
    expect(codes).toContain('2CK');
    expect(codes).toContain('2BH');
  });
});
