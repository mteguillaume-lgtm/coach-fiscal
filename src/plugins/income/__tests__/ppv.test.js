import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../ppv.plugin.js';
import { PLAFOND_PPV_SANS_ACCORD, PLAFOND_PPV_AVEC_ACCORD, SEUIL_3_SMIC_2025 } from '../../../lib/taxCalculator.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MULTI = readFileSync(
  resolve(__dir, '../../../../tests/fixtures/profiles/multi-employeurs.txt'),
  'utf-8'
);

describe('ppv — identité', () => {
  it('id = "ppv"',        () => expect(plugin.id).toBe('ppv'));
  it('version = "1.0.0"', () => expect(plugin.version).toBe('1.0.0'));
  it('fields non vide',   () => expect(plugin.fields.length).toBeGreaterThan(0));
});

describe('ppv — constantes paperasse', () => {
  it('PLAFOND_PPV_SANS_ACCORD = 3000',    () => expect(PLAFOND_PPV_SANS_ACCORD).toBe(3000));
  it('PLAFOND_PPV_AVEC_ACCORD = 6000',    () => expect(PLAFOND_PPV_AVEC_ACCORD).toBe(6000));
  it('SEUIL_3_SMIC_2025 = 64866',         () => expect(SEUIL_3_SMIC_2025).toBe(64866));
});

describe('ppv — parser (fixture multi-employeurs)', () => {
  const parsed = plugin.parser(MULTI, 'solo');

  it('lit montantPpvD1 = 2500',          () => expect(parsed.montantPpvD1).toBe(2500));
  it('lit remunerationRef12D1 = 40000',  () => expect(parsed.remunerationRef12D1).toBe(40000));
  it('accordInteressementD1 = false',    () => expect(parsed.accordInteressementD1).toBe(false));
  it('tailleEntreprise50pD1 = false (< 50)', () => expect(parsed.tailleEntreprise50pD1).toBe(false));
  it('affectationPeeD1 = false',         () => expect(parsed.affectationPeeD1).toBe(false));
});

describe('ppv — calculator (petite entreprise, exonérée)', () => {
  // Fixture: montant=2500, remRef=40000(<64866), accord=false, taille<50, pee=false
  // → exonérée (montant ≤ plafond 3000 et remRef < seuil)
  const v1 = {
    montantPpvD1: 2500, remunerationRef12D1: 40000,
    accordInteressementD1: false, tailleEntreprise50pD1: false, affectationPeeD1: false,
  };
  const r = plugin.calculator(v1);
  it('rniPpvD1 = 0 (exonérée)', () => expect(r.rniPpvD1).toBe(0));
  it('ppvExoD1 = 2500',         () => expect(r.ppvExoD1).toBe(2500));
});

describe('ppv — calculator (grande entreprise, imposable)', () => {
  const v1 = {
    montantPpvD1: 2500, remunerationRef12D1: 40000,
    accordInteressementD1: false, tailleEntreprise50pD1: true, affectationPeeD1: false,
  };
  const r = plugin.calculator(v1);
  it('rniPpvD1 = 2500 (imposable)', () => expect(r.rniPpvD1).toBe(2500));
  it('ppvExoD1 = 0',                () => expect(r.ppvExoD1).toBe(0));
});

describe('ppv — calculator (PEE/PERECO, toujours exonéré)', () => {
  const v1 = {
    montantPpvD1: 5000, remunerationRef12D1: 80000,
    accordInteressementD1: false, tailleEntreprise50pD1: true, affectationPeeD1: true,
  };
  const r = plugin.calculator(v1);
  it('rniPpvD1 = 0 (PEE exonère même grande entreprise à haut salaire)', () => {
    expect(r.rniPpvD1).toBe(0);
  });
  it('ppvExoD1 = 5000', () => expect(r.ppvExoD1).toBe(5000));
});

describe('ppv — calculator (remunération > seuil 3 SMIC)', () => {
  const v1 = {
    montantPpvD1: 2500, remunerationRef12D1: 70000,
    accordInteressementD1: false, tailleEntreprise50pD1: false, affectationPeeD1: false,
  };
  const r = plugin.calculator(v1);
  it('rniPpvD1 = 2500 (remRef > seuil → imposable)', () => expect(r.rniPpvD1).toBe(2500));
});

describe('ppv — calculator (montant > plafond sans accord)', () => {
  const v1 = {
    montantPpvD1: 3500, remunerationRef12D1: 40000,
    accordInteressementD1: false, tailleEntreprise50pD1: false, affectationPeeD1: false,
  };
  const r = plugin.calculator(v1);
  it('rniPpvD1 = 3500 (montant > plafond 3000 → imposable)', () => expect(r.rniPpvD1).toBe(3500));
});

describe('ppv — calculator (accord intéressement → plafond 6000)', () => {
  const v1 = {
    montantPpvD1: 5000, remunerationRef12D1: 40000,
    accordInteressementD1: true, tailleEntreprise50pD1: false, affectationPeeD1: false,
  };
  const r = plugin.calculator(v1);
  it('rniPpvD1 = 0 (5000 ≤ 6000 avec accord)', () => expect(r.rniPpvD1).toBe(0));
  it('ppvExoD1 = 5000',                         () => expect(r.ppvExoD1).toBe(5000));
});

describe('ppv — calculator (pas de montant)', () => {
  it('aucun montant → tout à 0', () => {
    const r = plugin.calculator({});
    expect(r.rniPpvD1).toBe(0);
    expect(r.ppvExoD1).toBe(0);
  });
});

describe('ppv — generator (solo)', () => {
  const d1 = { montant_ppv: '2500', remuneration_ref_12mois: '40000', accord_interessement: false, taille_entreprise_50plus: false, affectation_pee: false };
  const out = plugin.generator({}, d1, {}, 'solo');

  it('contient le header', ()               => expect(out).toContain('== PRIME DE PARTAGE DE LA VALEUR =='));
  it('contient Montant PPV',  ()            => expect(out).toContain('Montant PPV'));
  it('contient Accord d\'intéressement', () => expect(out).toContain("Accord d'intéressement"));
});

describe('ppv — generator vide si pas de montant', () => {
  it('retourne "" si montant = 0', () => {
    expect(plugin.generator({}, {}, {}, 'solo')).toBe('');
  });
});

describe('ppv — round-trip parser → generator → parser', () => {
  it('fixture → génère → reparse → mêmes valeurs', () => {
    const d1 = { montant_ppv: '2500', remuneration_ref_12mois: '40000', accord_interessement: false, taille_entreprise_50plus: false, affectation_pee: false };
    const generated = plugin.generator({}, d1, {}, 'solo');
    const reparsed = plugin.parser(generated, 'solo');
    expect(reparsed.montantPpvD1).toBe(2500);
    expect(reparsed.remunerationRef12D1).toBe(40000);
    expect(reparsed.accordInteressementD1).toBe(false);
    expect(reparsed.tailleEntreprise50pD1).toBe(false);
    expect(reparsed.affectationPeeD1).toBe(false);
  });
});

describe('ppv — validator', () => {
  it('valeurs valides → valid = true', () => {
    expect(plugin.validator({ montant_ppv: '2500', remuneration_ref_12mois: '40000' }).valid).toBe(true);
  });

  it('montant négatif → erreur', () => {
    const r = plugin.validator({ montant_ppv: '-100' });
    expect(r.valid).toBe(false);
    expect(r.errors[0].field).toBe('montant_ppv');
  });

  it('sans données → valid = true', () => {
    expect(plugin.validator({}).valid).toBe(true);
  });
});

describe('ppv — declarativeCases', () => {
  const cases = plugin.declarativeCases();
  it('retourne 1AJ et 1BJ', () => {
    const codes = cases.map(c => c.caseCode);
    expect(codes).toContain('1AJ');
    expect(codes).toContain('1BJ');
  });
});
