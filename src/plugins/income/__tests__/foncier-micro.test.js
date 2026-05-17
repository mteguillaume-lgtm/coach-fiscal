import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../foncier-micro.plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF = readFileSync(resolve(__dir, '../../../lib/__tests__/fixtures/profil-fiscal-ref.txt'), 'utf-8');

describe('foncier-micro.plugin — parser (profil de référence)', () => {
  const result = plugin.parser(REF, 'couple');

  it('revensFonciers = 705 €', () => {
    expect(result.revensFonciers).toBe(705);
  });

  it('foncierNet = 705 × 70% = 494 €', () => {
    expect(result.foncierNet).toBe(Math.round(705 * 0.70));
  });

  it('regimeFoncier = "micro"', () => {
    expect(result.regimeFoncier).toBe('micro');
  });
});

describe('foncier-micro.plugin — calculator', () => {
  it('foncierNet calculé depuis brut si absent', () => {
    const result = plugin.calculator({ revensFonciers: 705, foncierNet: 0 });
    expect(result.foncierNet).toBe(Math.round(705 * 0.70));
  });

  it('foncierPs = round(net × 17,2%)', () => {
    const net = Math.round(705 * 0.70);
    const result = plugin.calculator({ revensFonciers: 705, foncierNet: 0 });
    expect(result.foncierPs).toBe(Math.round(net * 0.172));
  });

  it('foncierNet = 0 si revensFonciers = 0', () => {
    const result = plugin.calculator({ revensFonciers: 0, foncierNet: 0 });
    expect(result.foncierNet).toBe(0);
    expect(result.foncierPs).toBe(0);
  });
});

describe('foncier-micro.plugin — generator', () => {
  it('retourne une chaîne contenant "foncier"', () => {
    const out = plugin.generator({ foncier: '705' });
    expect(out.toLowerCase()).toContain('foncier');
  });

  it('mentionne "micro-foncier" si brut < 15 000 €', () => {
    const out = plugin.generator({ foncier: '705' });
    expect(out).toContain('micro-foncier');
  });

  it('retourne "Néant" si foncier absent', () => {
    expect(plugin.generator({})).toContain('Néant');
  });
});

describe('foncier-micro.plugin — validator', () => {
  it('valid = true pour 705 €', () => {
    expect(plugin.validator({ foncier: '705' }).valid).toBe(true);
  });

  it('valid = false si brut > 15 000 €', () => {
    expect(plugin.validator({ foncier: '20000' }).valid).toBe(false);
  });

  it('valid = false si montant négatif', () => {
    expect(plugin.validator({ foncier: '-100' }).valid).toBe(false);
  });
});

describe('foncier-micro.plugin — declarativeCases', () => {
  it('contient 4BE', () => {
    const codes = plugin.declarativeCases().map(c => c.caseCode);
    expect(codes).toContain('4BE');
  });
});
