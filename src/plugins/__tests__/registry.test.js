import { describe, it, expect } from 'vitest';
import { registry } from '../registry.js';
import { PLUGIN_REQUIRED_FIELDS } from '../types.js';

describe('registry — découverte automatique', () => {
  it('découvre exactement 21 plugins (12 actifs + 9 stubs)', () => {
    expect(registry.getAll().length).toBe(21);
  });

  it('auto-discovery : tous les plugins ont un id non vide', () => {
    // Preuve du mécanisme : ajouter *.plugin.js dans income/ suffit,
    // sans toucher registry.js.
    const all = registry.getAll();
    expect(all.every(p => typeof p.id === 'string' && p.id.length > 0)).toBe(true);
  });
});

describe('registry — unicité des IDs', () => {
  it('aucun ID en double', () => {
    const ids = registry.getAll().map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('registry — conformité à l\'interface IncomePlugin', () => {
  it('tous les plugins ont les champs obligatoires', () => {
    for (const plugin of registry.getAll()) {
      for (const field of PLUGIN_REQUIRED_FIELDS) {
        expect(plugin, `"${plugin.id}" doit avoir "${field}"`).toHaveProperty(field);
      }
    }
  });

  it('tous les plugins ont parser/generator/validator/calculator/declarativeCases comme fonctions', () => {
    for (const plugin of registry.getAll()) {
      expect(typeof plugin.parser,          `${plugin.id}.parser`).toBe('function');
      expect(typeof plugin.generator,       `${plugin.id}.generator`).toBe('function');
      expect(typeof plugin.validator,       `${plugin.id}.validator`).toBe('function');
      expect(typeof plugin.calculator,      `${plugin.id}.calculator`).toBe('function');
      expect(typeof plugin.declarativeCases,`${plugin.id}.declarativeCases`).toBe('function');
    }
  });

  it('tous les plugins ont fields comme tableau', () => {
    for (const plugin of registry.getAll()) {
      expect(Array.isArray(plugin.fields), `${plugin.id}.fields`).toBe(true);
    }
  });

  it('declarativeCases() retourne un tableau pour chaque plugin', () => {
    for (const plugin of registry.getAll()) {
      expect(Array.isArray(plugin.declarativeCases()), `${plugin.id}.declarativeCases()`).toBe(true);
    }
  });
});

describe('registry — getById', () => {
  it('getById("salaires") retourne le plugin salaires', () => {
    const p = registry.getById('salaires');
    expect(p).not.toBeNull();
    expect(p.id).toBe('salaires');
  });

  it('getById("mobiliers") retourne le plugin mobiliers', () => {
    expect(registry.getById('mobiliers')?.id).toBe('mobiliers');
  });

  it('getById("inconnu") retourne null', () => {
    expect(registry.getById('inconnu')).toBeNull();
  });
});

describe('registry — getByType (caseCode)', () => {
  it('getByType("1AJ") inclut le plugin salaires', () => {
    expect(registry.getByType('1AJ').some(p => p.id === 'salaires')).toBe(true);
  });

  it('getByType("2TR") inclut le plugin mobiliers', () => {
    expect(registry.getByType('2TR').some(p => p.id === 'mobiliers')).toBe(true);
  });

  it('getByType("4BE") inclut le plugin foncier-micro', () => {
    expect(registry.getByType('4BE').some(p => p.id === 'foncier-micro')).toBe(true);
  });

  it('getByType("1AS") inclut le plugin pensions-rentes', () => {
    expect(registry.getByType('1AS').some(p => p.id === 'pensions-rentes')).toBe(true);
  });

  it('getByType("INEXISTANT") retourne tableau vide', () => {
    expect(registry.getByType('INEXISTANT')).toHaveLength(0);
  });
});
