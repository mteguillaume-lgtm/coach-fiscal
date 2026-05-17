import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { abattement10Pension } from '../../../lib/taxCalculator.js';
import plugin from '../pensions-rentes.plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF = readFileSync(resolve(__dir, '../../../lib/__tests__/fixtures/profil-fiscal-ref.txt'), 'utf-8');

describe('pensions-rentes.plugin — parser (profil de référence, couple)', () => {
  const result = plugin.parser(REF, 'couple');

  it('rente1BsD2 = 6 192 €', () => {
    expect(result.rente1BsD2).toBe(6192);
  });

  it('pasRente1BsD2 = 0 €', () => {
    expect(result.pasRente1BsD2).toBe(0);
  });

  it('orgRente1BsD2 contient "Crédit Agricole"', () => {
    expect(result.orgRente1BsD2).toMatch(/Crédit Agricole/i);
  });

  it('recurrentRente1BsD2 = false (NON RÉCURRENT)', () => {
    expect(result.recurrentRente1BsD2).toBe(false);
  });

  it('rente1BsD1 = 0 (D1 sans rente dans le profil de référence)', () => {
    expect(result.rente1BsD1).toBe(0);
  });
});

describe('pensions-rentes.plugin — calculator', () => {
  it('rniRenteD2 = abattement10Pension(6192)', () => {
    const result = plugin.calculator({ rente1BsD1: 0, rente1BsD2: 6192 });
    expect(result.rniRenteD2).toBe(abattement10Pension(6192));
  });

  it('rniRenteD1 = 0 si pas de rente D1', () => {
    const result = plugin.calculator({ rente1BsD1: 0, rente1BsD2: 0 });
    expect(result.rniRenteD1).toBe(0);
  });
});

describe('pensions-rentes.plugin — validator', () => {
  it('valid = true si pas de rente renseignée', () => {
    expect(plugin.validator({}).valid).toBe(true);
  });

  it('valid = false si montant négatif', () => {
    expect(plugin.validator({ rente_1bs_montant: '-100' }).valid).toBe(false);
  });
});

describe('pensions-rentes.plugin — declarativeCases', () => {
  it('contient 1AS et 1BS', () => {
    const codes = plugin.declarativeCases().map(c => c.caseCode);
    expect(codes).toContain('1AS');
    expect(codes).toContain('1BS');
  });
});
