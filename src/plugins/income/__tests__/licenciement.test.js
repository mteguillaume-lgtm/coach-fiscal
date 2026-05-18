import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../licenciement.plugin.js';
import { PLAFOND_LICENCIEMENT_MAX } from '../../../lib/taxCalculator.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MULTI = readFileSync(
  resolve(__dir, '../../../../tests/fixtures/profiles/multi-employeurs.txt'),
  'utf-8'
);

describe('licenciement — identité', () => {
  it('id = "licenciement"', () => expect(plugin.id).toBe('licenciement'));
  it('version = "1.0.0"',  () => expect(plugin.version).toBe('1.0.0'));
  it('fields non vide',    () => expect(plugin.fields.length).toBeGreaterThan(0));
});

describe('licenciement — constante paperasse', () => {
  it('PLAFOND_LICENCIEMENT_MAX = 235500 (5 × PASS 2025)', () => {
    expect(PLAFOND_LICENCIEMENT_MAX).toBe(235500);
  });
});

describe('licenciement — parser (fixture multi-employeurs)', () => {
  const parsed = plugin.parser(MULTI, 'solo');

  it('lit indemTotaleD1 = 100000', ()          => expect(parsed.indemTotaleD1).toBe(100000));
  it('lit indemLegaleD1 = 20000', ()           => expect(parsed.indemLegaleD1).toBe(20000));
  it('lit remunerationAnnuelleD1 = 35000', ()  => expect(parsed.remunerationAnnuelleD1).toBe(35000));
  it('D2 tous à 0 (profil célibataire)', ()    => {
    expect(parsed.indemTotaleD2).toBe(0);
    expect(parsed.indemLegaleD2).toBe(0);
  });
});

describe('licenciement — calculator (cas fixture)', () => {
  // tot=100000, leg=20000, rem=35000
  // exoCandidate = max(20000, 70000, 50000) = 70000
  // exo = min(100000, min(70000, 235500)) = 70000
  // imposable = 30000
  const v1 = {
    indemTotaleD1:          100000,
    indemLegaleD1:          20000,
    remunerationAnnuelleD1: 35000,
  };
  const result = plugin.calculator(v1);

  it('exoLicenciementD1 = 70000', () => expect(result.exoLicenciementD1).toBe(70000));
  it('rniLicenciementD1 = 30000', () => expect(result.rniLicenciementD1).toBe(30000));
  it('rniLicenciementD2 = 0',     () => expect(result.rniLicenciementD2).toBe(0));
});

describe('licenciement — calculator (cas particuliers)', () => {
  it('indem = 0 → exo=0, imp=0', () => {
    const r = plugin.calculator({});
    expect(r.rniLicenciementD1).toBe(0);
    expect(r.exoLicenciementD1).toBe(0);
  });

  it('indem totalement couverte par légale → imposable = 0', () => {
    // tot=50000, leg=60000, rem=20000
    // exoCandidate = max(60000, 40000, 25000) = 60000 > tot → exo = 50000, imp = 0
    const r = plugin.calculator({ indemTotaleD1: 50000, indemLegaleD1: 60000, remunerationAnnuelleD1: 20000 });
    expect(r.exoLicenciementD1).toBe(50000);
    expect(r.rniLicenciementD1).toBe(0);
  });

  it('indem dépasse le plafond 5×PASS → plafonnement', () => {
    // tot=300000, leg=0, rem=0 → exoCandidate=max(0,0,150000)=150000, exo=min(300000,min(150000,235500))=150000
    const r = plugin.calculator({ indemTotaleD1: 300000, indemLegaleD1: 0, remunerationAnnuelleD1: 0 });
    expect(r.exoLicenciementD1).toBeLessThanOrEqual(PLAFOND_LICENCIEMENT_MAX);
    expect(r.rniLicenciementD1).toBeGreaterThan(0);
  });
});

describe('licenciement — generator (solo)', () => {
  const d1 = { indem_totale: '100000', indem_legale: '20000', remuneration_annuelle: '35000' };
  const out = plugin.generator({}, d1, {}, 'solo');

  it('contient le header', ()          => expect(out).toContain('== INDEMNITÉ DE LICENCIEMENT =='));
  it('contient Indemnité totale', ()   => expect(out).toContain('Indemnité totale'));
  // French locale uses U+202F (narrow no-break space) as thousands separator — use \s in regex
  it('contient exo 70000', ()          => expect(out).toMatch(/70\s000/));
  it('contient imposable 30000', ()    => expect(out).toMatch(/30\s000/));
});

describe('licenciement — generator vide si pas de montant', () => {
  it('retourne "" si tot = 0', () => {
    expect(plugin.generator({}, {}, {}, 'solo')).toBe('');
  });
});

describe('licenciement — round-trip parser → generator → parser', () => {
  it('100000/20000/35000 → génère → reparse → mêmes valeurs', () => {
    const d1 = { indem_totale: '100000', indem_legale: '20000', remuneration_annuelle: '35000' };
    const generated = plugin.generator({}, d1, {}, 'solo');
    const reparsed = plugin.parser(generated, 'solo');
    expect(reparsed.indemTotaleD1).toBe(100000);
    expect(reparsed.indemLegaleD1).toBe(20000);
    expect(reparsed.remunerationAnnuelleD1).toBe(35000);
  });
});

describe('licenciement — validator', () => {
  it('valeurs valides → valid = true', () => {
    expect(plugin.validator({ indem_totale: '100000', indem_legale: '20000', remuneration_annuelle: '35000' }).valid).toBe(true);
  });

  it('légale > totale → erreur', () => {
    const r = plugin.validator({ indem_totale: '10000', indem_legale: '20000' });
    expect(r.valid).toBe(false);
  });

  it('valeur négative → erreur', () => {
    const r = plugin.validator({ indem_totale: '-1000' });
    expect(r.valid).toBe(false);
  });

  it('sans données → valid = true', () => {
    expect(plugin.validator({}).valid).toBe(true);
  });
});

describe('licenciement — declarativeCases', () => {
  const cases = plugin.declarativeCases();
  it('retourne 1AJ, 1BJ, 1AD, 1BD', () => {
    const codes = cases.map(c => c.caseCode);
    expect(codes).toContain('1AJ');
    expect(codes).toContain('1BJ');
    expect(codes).toContain('1AD');
    expect(codes).toContain('1BD');
  });
});
