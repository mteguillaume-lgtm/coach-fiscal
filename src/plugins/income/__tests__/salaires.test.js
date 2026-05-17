import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { abattement10Auto } from '../../../lib/taxCalculator.js';
import plugin from '../salaires.plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF = readFileSync(resolve(__dir, '../../../lib/__tests__/fixtures/profil-fiscal-ref.txt'), 'utf-8');

const SOLO = `== PROFIL FISCAL PERSONNEL 2025 ==
== SITUATION PERSONNELLE ==
Statut : Célibataire
Parts fiscales : 1

== REVENUS 2025 ==
Net imposable annuel (1AJ — case déclaration) : 45 000 €
PAS prélevé 2025 : 4 200 €
Taux PAS : 10%`;

describe('salaires.plugin — parser (profil de référence, couple)', () => {
  const result = plugin.parser(REF, 'couple');

  it('salaireNetImposableD1 = 45 162', () => {
    expect(result.salaireNetImposableD1).toBe(45162);
  });

  it('salaireNetImposableD2 = 29 283', () => {
    expect(result.salaireNetImposableD2).toBe(29283);
  });

  it('pasD1 = 4 609', () => {
    expect(result.pasD1).toBe(4609);
  });

  it('pasD2 = 1 741', () => {
    expect(result.pasD2).toBe(1741);
  });

  it('ijCpamD2 = 1 599', () => {
    expect(result.ijCpamD2).toBe(1599);
  });

  it('ijCpamOrgD2 contient "Maine-et-Loire"', () => {
    expect(result.ijCpamOrgD2).toMatch(/Maine-et-Loire/i);
  });
});

describe('salaires.plugin — parser (profil solo)', () => {
  const result = plugin.parser(SOLO, 'solo');

  it('salaireNetImposableD1 = 45 000 en mode solo', () => {
    expect(result.salaireNetImposableD1).toBe(45000);
  });

  it('salaireNetImposableD2 = 0 en mode solo', () => {
    expect(result.salaireNetImposableD2).toBe(0);
  });

  it('pasD1 = 4 200', () => {
    expect(result.pasD1).toBe(4200);
  });
});

describe('salaires.plugin — calculator', () => {
  it('rniD1 = abattement10Auto(45162)', () => {
    const v1 = { salaireNetImposableD1: 45162, typeRevenuD1: 'Salarié(e)', pensionNetImpD1: 0 };
    expect(plugin.calculator(v1).rniD1).toBe(abattement10Auto(45162, 'Salarié(e)', 0));
  });

  it('rniD2 = abattement10Auto(29283)', () => {
    const v1 = { salaireNetImposableD2: 29283, typeRevenuD2: 'Salarié(e)', pensionNetImpD2: 0 };
    expect(plugin.calculator(v1).rniD2).toBe(abattement10Auto(29283, 'Salarié(e)', 0));
  });

  it('rniD1 = 0 si salaireNetImposableD1 absent', () => {
    expect(plugin.calculator({}).rniD1).toBe(0);
  });
});

describe('salaires.plugin — validator', () => {
  it('valid = true pour net_imp renseigné', () => {
    expect(plugin.validator({ net_imp: '45000' }).valid).toBe(true);
  });

  it('valid = false si net_imp absent', () => {
    expect(plugin.validator({}).valid).toBe(false);
  });

  it('valid = false si net_imp vide', () => {
    expect(plugin.validator({ net_imp: '' }).valid).toBe(false);
  });
});

describe('salaires.plugin — generator', () => {
  it('retourne une chaîne', () => {
    const out = plugin.generator({}, { net_imp: '45000', pas_tot: '4200', taux_pas: '10' }, {}, 'solo');
    expect(typeof out).toBe('string');
  });

  it('contient le net imposable', () => {
    const out = plugin.generator({}, { net_imp: '45000', pas_tot: '4200' }, {}, 'solo');
    expect(out).toContain('45');
  });
});

describe('salaires.plugin — declarativeCases', () => {
  it('retourne 1AJ et 1BJ', () => {
    const codes = plugin.declarativeCases().map(c => c.caseCode);
    expect(codes).toContain('1AJ');
    expect(codes).toContain('1BJ');
  });
});
