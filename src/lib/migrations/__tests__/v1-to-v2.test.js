import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseProfile } from '../../profileParser.js';
import { migrateProfile } from '../v1-to-v2.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REF_PATH = resolve(__dir, '../../__tests__/fixtures/profil-fiscal-ref.txt');
const REF = readFileSync(REF_PATH, 'utf-8');

// ─── Migration depuis texte brut (profil de référence v4) ────────────────────
describe('migrateProfile — profil de référence v4 (texte brut)', () => {
  const v2 = migrateProfile(REF);

  it('$version === 2', () => {
    expect(v2.$version).toBe(2);
  });

  it('mode couple', () => {
    expect(v2.mode).toBe('couple');
  });

  it('foyer.statutNorm = pacse', () => {
    expect(v2.foyer.statutNorm).toBe('pacse');
  });

  it('foyer.parts >= 1', () => {
    expect(v2.foyer.parts).toBeGreaterThanOrEqual(1);
  });

  it('deux déclarants', () => {
    expect(v2.declarants).toHaveLength(2);
  });

  it('declarants[0].id = D1', () => {
    expect(v2.declarants[0].id).toBe('D1');
  });

  it('declarants[1].id = D2', () => {
    expect(v2.declarants[1].id).toBe('D2');
  });

  it('D1 salaires.netImposable = 45 162 €', () => {
    expect(v2.declarants[0].salaires.netImposable).toBe(45162);
  });

  it('D2 salaires.netImposable = 29 283 €', () => {
    expect(v2.declarants[1].salaires.netImposable).toBe(29283);
  });

  it('mobilier.case2TR = 527 €', () => {
    expect(v2.mobilier.case2TR).toBe(527);
  });

  it('mobilier.case2CK = 68 €', () => {
    expect(v2.mobilier.case2CK).toBe(68);
  });

  it('mobilier.case2BH = case2TR (même valeur)', () => {
    expect(v2.mobilier.case2BH).toBe(v2.mobilier.case2TR);
  });

  it('acomptes.irD1_8HW = 12 €', () => {
    expect(v2.acomptes.irD1_8HW).toBe(12);
  });

  it('acomptes.irD2_8IW = 12 €', () => {
    expect(v2.acomptes.irD2_8IW).toBe(12);
  });

  it('acomptes.psD1_8HX = 24 €', () => {
    expect(v2.acomptes.psD1_8HX).toBe(24);
  });

  it('acomptes.psD2_8IX = 18 €', () => {
    expect(v2.acomptes.psD2_8IX).toBe(18);
  });

  it('calculs.acomptes = 66 € (somme 8HW+8IW+8HX+8IX)', () => {
    expect(v2.calculs.acomptes).toBe(66);
  });

  it('calculs.creditsImpot = 68 € (crédit PFU 2CK)', () => {
    expect(v2.calculs.creditsImpot).toBe(68);
  });

  it('calculs.rniFoyer = 73 067 €', () => {
    expect(v2.calculs.rniFoyer).toBe(73067);
  });

  it('calculs.irBrut ≈ 8 128 € (± 5)', () => {
    expect(v2.calculs.irBrut).toBeGreaterThan(0);
    expect(Math.abs(v2.calculs.irBrut - 8128)).toBeLessThanOrEqual(5);
  });

  it('calculs.solde = −1 786 € (± 5)', () => {
    expect(Math.abs(v2.calculs.solde - (-1786))).toBeLessThanOrEqual(5);
  });

  it('revenus contient rente1bs D2 = 6 192 €', () => {
    const rente = v2.revenus.find(r => r.type === 'rente1bs' && r.declarant === 'D2');
    expect(rente).toBeDefined();
    expect(rente.montant).toBe(6192);
  });

  it('revenus contient mobilier foyer = 527 €', () => {
    const mob = v2.revenus.find(r => r.type === 'mobilier' && r.declarant === 'foyer');
    expect(mob).toBeDefined();
    expect(mob.montant).toBe(527);
  });

  it('chaque revenu possède un id unique', () => {
    const ids = v2.revenus.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('foncier.brut = 705 €', () => {
    expect(v2.foncier.brut).toBe(705);
  });
});

// ─── Idempotence et types d'entrée ───────────────────────────────────────────
describe('migrateProfile — idempotence et types d\'entrée', () => {
  it('idempotent : v2 en entrée retourne la même référence', () => {
    const v2 = migrateProfile(REF);
    expect(migrateProfile(v2)).toBe(v2);
  });

  it('objet v1 plat en entrée produit le même $version 2', () => {
    const v1 = parseProfile(REF);
    const v2 = migrateProfile(v1);
    expect(v2.$version).toBe(2);
    expect(v2.calculs.rniFoyer).toBe(73067);
  });

  it('source invalide lève une erreur', () => {
    expect(() => migrateProfile(null)).toThrow();
    expect(() => migrateProfile(42)).toThrow();
  });
});

// ─── Mode solo ───────────────────────────────────────────────────────────────
describe('migrateProfile — profil solo', () => {
  const SOLO = `== PROFIL FISCAL PERSONNEL 2025 ==
== SITUATION PERSONNELLE ==
Statut : Célibataire
Parts fiscales : 1

== REVENUS 2025 ==
Net imposable annuel (1AJ — case déclaration) : 45 000 €
PAS prélevé 2025 : 4 200 €
Taux PAS : 10%`;

  const v2 = migrateProfile(SOLO);

  it('mode solo', () => {
    expect(v2.mode).toBe('solo');
  });

  it('un seul déclarant', () => {
    expect(v2.declarants).toHaveLength(1);
  });

  it('declarants[0].id = D1', () => {
    expect(v2.declarants[0].id).toBe('D1');
  });

  it('foyer.statutNorm = celibataire', () => {
    expect(v2.foyer.statutNorm).toBe('celibataire');
  });

  it('D1 salaires.netImposable = 45 000', () => {
    expect(v2.declarants[0].salaires.netImposable).toBe(45000);
  });
});
