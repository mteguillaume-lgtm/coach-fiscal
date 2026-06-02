import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registry } from '../registry.js';
import { migrateProfile } from '../../lib/migrations/v1-to-v2.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF = readFileSync(
  resolve(__dir, '../../lib/__tests__/fixtures/profil-fiscal-ref.txt'),
  'utf-8'
);

// ─── Interface complète ───────────────────────────────────────────────────────

describe('architecture — interface IncomePlugin (8 propriétés)', () => {
  const REQUIRED = ['id', 'label', 'version', 'fields', 'parser', 'generator', 'validator', 'calculator', 'declarativeCases'];

  for (const plugin of registry.getAll()) {
    it(`${plugin.id} : possède les 9 propriétés obligatoires`, () => {
      for (const prop of REQUIRED) {
        expect(plugin, `"${plugin.id}" manque "${prop}"`).toHaveProperty(prop);
      }
    });
  }
});

// ─── Unicité des IDs ──────────────────────────────────────────────────────────

describe('architecture — unicité des IDs', () => {
  it('aucun id en double parmi les 21 plugins', () => {
    const ids = registry.getAll().map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(21); // 12 actifs + 9 stubs
  });
});

// ─── Plugins actifs (version 1.0.0) ──────────────────────────────────────────

describe('architecture — plugins actifs (v1.0.0)', () => {
  // Plugins actifs possédant leurs propres champs de formulaire.
  const ACTIVE_IDS = [
    'salaires', 'pensions-rentes', 'foncier-micro', 'mobiliers', 'chomage-france-travail',
    'apprentissage', 'heures-supp', 'licenciement', 'ppv',
  ];
  // Plugins actifs (PHASE 1) dont la collecte est gérée par Collect.jsx (fields: []).
  const ACTIVE_NO_FIELDS_IDS = ['dividendes', 'reductions-credits', 'pensions-alimentaires'];

  it('exactement 12 plugins actifs (version 1.0.0)', () => {
    const active = registry.getAll().filter(p => p.version === '1.0.0');
    expect(active.length).toBe(12);
  });

  it('plugins PHASE 1 sans champs propres : parser fonctionnel', () => {
    for (const id of ACTIVE_NO_FIELDS_IDS) {
      const p = registry.getById(id);
      expect(p.version).toBe('1.0.0');
      expect(typeof p.parser('', 'solo')).toBe('object');
    }
  });

  for (const id of ACTIVE_IDS) {
    it(`${id} : label non vide`, () => {
      const p = registry.getById(id);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
    });

    it(`${id} : version = '1.0.0'`, () => {
      expect(registry.getById(id).version).toBe('1.0.0');
    });

    it(`${id} : fields est un tableau non vide`, () => {
      const fields = registry.getById(id).fields;
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
    });
  }
});

// ─── Stubs (version 0.0.1) ───────────────────────────────────────────────────

describe('architecture — stubs (v0.0.1)', () => {
  it('exactement 9 stubs (version 0.0.1)', () => {
    const stubs = registry.getAll().filter(p => p.version === '0.0.1');
    expect(stubs.length).toBe(9);
  });

  it('stubs : parser() retourne un objet (pas null, pas undefined)', () => {
    for (const plugin of registry.getAll().filter(p => p.version === '0.0.1')) {
      const result = plugin.parser('', 'solo');
      expect(result, `${plugin.id}.parser() ne doit pas retourner null/undefined`).not.toBeNull();
      expect(result, `${plugin.id}.parser() ne doit pas retourner null/undefined`).not.toBeUndefined();
      expect(typeof result).toBe('object');
    }
  });

  it('stubs : calculator() retourne un objet (pas null, pas undefined)', () => {
    for (const plugin of registry.getAll().filter(p => p.version === '0.0.1')) {
      const result = plugin.calculator({});
      expect(result, `${plugin.id}.calculator() ne doit pas retourner null/undefined`).not.toBeNull();
      expect(result, `${plugin.id}.calculator() ne doit pas retourner null/undefined`).not.toBeUndefined();
      expect(typeof result).toBe('object');
    }
  });

  it('stubs : validator() retourne { valid: true, errors: [] }', () => {
    for (const plugin of registry.getAll().filter(p => p.version === '0.0.1')) {
      const result = plugin.validator({});
      expect(result.valid, `${plugin.id}.validator().valid`).toBe(true);
      expect(result.errors, `${plugin.id}.validator().errors`).toEqual([]);
    }
  });

  it('stubs : declarativeCases() retourne un tableau non vide', () => {
    for (const plugin of registry.getAll().filter(p => p.version === '0.0.1')) {
      const cases = plugin.declarativeCases();
      expect(Array.isArray(cases), `${plugin.id}.declarativeCases()`).toBe(true);
      expect(cases.length, `${plugin.id} doit déclarer au moins une case 2042`).toBeGreaterThan(0);
    }
  });
});

// ─── Schéma v2 — validation structurelle ─────────────────────────────────────

describe('architecture — schéma profil v2 (profil de référence)', () => {
  const v2 = migrateProfile(REF);

  it('$version === 2', () => {
    expect(v2.$version).toBe(2);
  });

  it('top-level keys obligatoires présentes', () => {
    const KEYS = ['mode', 'foyer', 'declarants', 'revenus', 'mobilier', 'acomptes', 'foncier', 'calculs', 'patrimoine'];
    for (const key of KEYS) {
      expect(v2, `clé v2 "${key}" manquante`).toHaveProperty(key);
    }
  });

  it('foyer : statut, statutNorm, parts, departement', () => {
    expect(typeof v2.foyer.statut).toBe('string');
    expect(typeof v2.foyer.statutNorm).toBe('string');
    expect(typeof v2.foyer.parts).toBe('number');
    expect(v2.foyer.parts).toBeGreaterThanOrEqual(1);
  });

  it('declarants : tableau avec id D1 et D2', () => {
    expect(Array.isArray(v2.declarants)).toBe(true);
    expect(v2.declarants.some(d => d.id === 'D1')).toBe(true);
    expect(v2.declarants.some(d => d.id === 'D2')).toBe(true);
  });

  it('revenus : chaque élément a id, type, declarant, montant', () => {
    expect(Array.isArray(v2.revenus)).toBe(true);
    for (const rev of v2.revenus) {
      expect(typeof rev.id).toBe('string');
      expect(typeof rev.type).toBe('string');
      expect(['D1', 'D2', 'foyer']).toContain(rev.declarant);
      expect(typeof rev.montant).toBe('number');
    }
  });

  it('calculs : rniFoyer, tmi, irBrut, solde sont des nombres', () => {
    const { rniFoyer, tmi, irBrut, solde } = v2.calculs;
    expect(typeof rniFoyer).toBe('number');
    expect(typeof tmi).toBe('number');
    expect(typeof irBrut).toBe('number');
    expect(typeof solde).toBe('number');
  });

  it('patrimoine : epargneD1 et epargneD2 présents', () => {
    expect(v2.patrimoine).toHaveProperty('epargneD1');
    expect(v2.patrimoine).toHaveProperty('epargneD2');
  });

  it('idempotence : migrateProfile(v2) === v2', () => {
    expect(migrateProfile(v2)).toBe(v2);
  });
});
