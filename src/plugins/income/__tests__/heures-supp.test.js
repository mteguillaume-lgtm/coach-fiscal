import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../heures-supp.plugin.js';
import { PLAFOND_HEURES_SUPP } from '../../../lib/taxCalculator.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MULTI = readFileSync(
  resolve(__dir, '../../../../tests/fixtures/profiles/multi-employeurs.txt'),
  'utf-8'
);

describe('heures-supp — identité', () => {
  it('id = "heures-supp"', () => expect(plugin.id).toBe('heures-supp'));
  it('version = "1.0.0"', ()  => expect(plugin.version).toBe('1.0.0'));
  it('fields non vide',   ()  => expect(plugin.fields.length).toBeGreaterThan(0));
});

describe('heures-supp — constante paperasse', () => {
  it('PLAFOND_HEURES_SUPP = 7500', () => {
    expect(PLAFOND_HEURES_SUPP).toBe(7500);
  });
});

describe('heures-supp — parser (fixture multi-employeurs)', () => {
  const parsed = plugin.parser(MULTI, 'solo');

  it('lit heureSuppExoD1 = 1200', () => {
    expect(parsed.heureSuppExoD1).toBe(1200);
  });

  it('heureSuppExoD2 = 0 (profil célibataire)', () => {
    expect(parsed.heureSuppExoD2).toBe(0);
  });
});

describe('heures-supp — calculator', () => {
  it('montant < plafond → retourné tel quel', () => {
    const r = plugin.calculator({ heureSuppExoD1: 1200, heureSuppExoD2: 0 });
    expect(r.heureSuppExoD1).toBe(1200);
    expect(r.heureSuppExoD2).toBe(0);
  });

  it('montant = plafond → retourné tel quel', () => {
    const r = plugin.calculator({ heureSuppExoD1: PLAFOND_HEURES_SUPP });
    expect(r.heureSuppExoD1).toBe(PLAFOND_HEURES_SUPP);
  });

  it('montant > plafond → plafonné à 7500', () => {
    const r = plugin.calculator({ heureSuppExoD1: 9000 });
    expect(r.heureSuppExoD1).toBe(PLAFOND_HEURES_SUPP);
  });

  it('pas de montant → 0', () => {
    const r = plugin.calculator({});
    expect(r.heureSuppExoD1).toBe(0);
    expect(r.heureSuppExoD2).toBe(0);
  });
});

describe('heures-supp — generator (solo)', () => {
  const d1 = { heures_supp_exo_d1: '1200' };
  const out = plugin.generator({}, d1, {}, 'solo');

  it('contient le header', () => {
    expect(out).toContain('== HEURES SUPPLÉMENTAIRES DÉFISCALISÉES ==');
  });

  it('contient Montant exonéré D1 (1GH)', () => {
    expect(out).toContain('1GH');
    // French locale uses U+202F (narrow no-break space) as thousands separator — use \s in regex
    expect(out).toMatch(/1\s200/);
  });
});

describe('heures-supp — generator (couple)', () => {
  const d1 = { heures_supp_exo_d1: '3000' };
  const d2 = { heures_supp_exo_d2: '500' };
  const out = plugin.generator({}, d1, d2, 'couple');

  it('section DÉCLARANT 1', () => expect(out).toContain('DÉCLARANT 1'));
  it('section DÉCLARANT 2', () => expect(out).toContain('DÉCLARANT 2'));
  it('D1 : 3 000 €',        () => expect(out).toMatch(/3\s000/));
  it('D2 : 500 €',          () => expect(out).toContain('500'));
});

describe('heures-supp — generator vide si pas de montant', () => {
  it('retourne "" si exo = 0', () => {
    expect(plugin.generator({}, {}, {}, 'solo')).toBe('');
  });
});

describe('heures-supp — round-trip parser → generator → parser', () => {
  it('1200 → génère → reparse = 1200', () => {
    const d1 = { heures_supp_exo_d1: '1200' };
    const generated = plugin.generator({}, d1, {}, 'solo');
    const reparsed = plugin.parser(generated, 'solo');
    expect(reparsed.heureSuppExoD1).toBe(1200);
  });
});

describe('heures-supp — validator', () => {
  it('montant valide → valid = true', () => {
    expect(plugin.validator({ heures_supp_exo_d1: '1200' }).valid).toBe(true);
  });

  it('montant négatif → erreur', () => {
    const r = plugin.validator({ heures_supp_exo_d1: '-100' });
    expect(r.valid).toBe(false);
  });

  it('montant > plafond → erreur', () => {
    const r = plugin.validator({ heures_supp_exo_d1: '8000' });
    expect(r.valid).toBe(false);
    expect(r.errors[0].field).toBe('heures_supp_exo_d1');
  });

  it('sans montant → valid = true', () => {
    expect(plugin.validator({}).valid).toBe(true);
  });
});

describe('heures-supp — declarativeCases', () => {
  const cases = plugin.declarativeCases();
  it('retourne 1GH et 1HH', () => {
    const codes = cases.map(c => c.caseCode);
    expect(codes).toContain('1GH');
    expect(codes).toContain('1HH');
  });
});
