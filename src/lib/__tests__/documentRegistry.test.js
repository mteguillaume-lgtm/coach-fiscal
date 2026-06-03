import { describe, it, expect } from 'vitest';
import registry from '../../data/documentTypes/registry.json';
import {
  VERSION, DOCUMENTS, getType, detectType, documentsForFlags, evidenceFlags,
} from '../../data/documentTypes/index.js';

const TIERS = ['socle', 'enveloppes', 'immobilier', 'specifique'];
// Groupes connus de patterns.js (cf. buildPatterns)
const GROUPS = ['identite', 'employeur', 'nss', 'admin', 'adresse', 'banque', 'salaire'];

describe('registre — intégrité des données', () => {
  it('expose une version cohérente avec le JSON', () => {
    expect(VERSION).toBe(registry.version);
    expect(typeof VERSION).toBe('string');
  });

  it('a des ids uniques', () => {
    const ids = DOCUMENTS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chaque entrée est bien formée', () => {
    for (const d of DOCUMENTS) {
      expect(typeof d.id).toBe('string');
      expect(typeof d.label).toBe('string');
      expect(TIERS).toContain(d.tier);
      expect(d.condition === null || typeof d.condition === 'string').toBe(true);
      expect(Array.isArray(d.detect)).toBe(true);
      expect(Array.isArray(d.extract)).toBe(true);
      expect(Array.isArray(d.anonymizeGroups)).toBe(true);
      for (const g of d.anonymizeGroups) expect(GROUPS).toContain(g);
    }
  });

  it('tous les motifs detect compilent', () => {
    for (const d of DOCUMENTS) {
      for (const src of d.detect) {
        expect(() => new RegExp(src, 'i')).not.toThrow();
      }
    }
  });
});

describe('detectType', () => {
  it('reconnaît un avis d\'imposition', () => {
    const txt = "AVIS D'IMPÔT 2025\nRevenu fiscal de référence 45 162\nDGFiP";
    expect(detectType(txt).id).toBe('avis_ir');
  });

  it('reconnaît un bulletin de salaire', () => {
    const txt = 'Bulletin de paie décembre\nNet imposable cumul 45 000\nNet à payer 2 800';
    expect(detectType(txt).id).toBe('bulletin_salaire');
  });

  it('renvoie une confiance entre 0 et 1', () => {
    const { confidence } = detectType("AVIS D'IMPÔT\nrevenu fiscal de référence");
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('renvoie id null si rien ne matche', () => {
    expect(detectType('lorem ipsum dolor sit amet').id).toBeNull();
    expect(detectType('').id).toBeNull();
  });
});

describe('documentsForFlags', () => {
  it('inclut toujours les documents sans condition (socle/universel)', () => {
    const ids = documentsForFlags({}).map(d => d.id);
    expect(ids).toContain('avis_ir');
    expect(ids).toContain('releve_assurance_vie');
  });

  it('exclut les documents conditionnels non activés', () => {
    const ids = documentsForFlags({}).map(d => d.id);
    expect(ids).not.toContain('export_crypto');
    expect(ids).not.toContain('taxe_fonciere');
  });

  it('révèle un document quand son flag est actif', () => {
    const ids = documentsForFlags({ crypto: true, foncier: true }).map(d => d.id);
    expect(ids).toContain('export_crypto');
    expect(ids).toContain('bail_quittances');
  });
});

describe('getType / evidenceFlags', () => {
  it('getType renvoie l\'entrée', () => {
    expect(getType('avis_ir').label).toMatch(/avis/i);
    expect(getType('inconnu')).toBeUndefined();
  });

  it('evidenceFlags renvoie le flag conditionnel, vide pour le socle', () => {
    expect(evidenceFlags('export_crypto')).toEqual(['crypto']);
    expect(evidenceFlags('avis_ir')).toEqual([]);
  });
});
