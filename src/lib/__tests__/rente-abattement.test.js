import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseProfile } from '../profileParser';

const REF = readFileSync(
  fileURLToPath(new URL('./fixtures/profil-fiscal-ref.txt', import.meta.url)), 'utf8',
);

// Supprime toutes les lignes "RNI …" du profil pour forcer le parser à
// RECALCULER le RNI depuis les composantes (sinon il lit les totaux du texte).
const sansLignesRni = (t) => t.replace(/^.*\bRNI\b.*$/gm, '');
// Remplace le montant de la rente 1BS (6 192 € dans la fixture, espace normal
// ou fine insécable, avec ou sans décimales).
const avecRente = (montant) =>
  sansLignesRni(REF).replace(/6[\s ]?192(?:,00)?/g, montant);

describe('Abattement 10 % pensions sur rente 1BS — plancher 450 € / plafond 4 446 € foyer (audit C3)', () => {
  it('plafond : rente 60 000 € → contribution RNI 55 554 € (abattement plafonné à 4 446 €)', () => {
    const p0 = parseProfile(avecRente('0'));
    const p6 = parseProfile(avecRente('60 000'));
    expect(p6.rniD2 - p0.rniD2).toBe(55_554);   // ancien code : 54 000 (×0,9)
  });

  it('plancher : rente 3 000 € → contribution RNI 2 550 € (abattement plancher 450 €)', () => {
    const p0 = parseProfile(avecRente('0'));
    const p3 = parseProfile(avecRente('3 000'));
    expect(p3.rniD2 - p0.rniD2).toBe(2_550);    // ancien code : 2 700 (×0,9)
  });

  it('zone médiane : rente 6 192 € → contribution 5 573 € (identique à l\'ancien calcul)', () => {
    const p0 = parseProfile(avecRente('0'));
    const p6 = parseProfile(avecRente('6 192'));
    expect(p6.rniD2 - p0.rniD2).toBe(5_573);
  });
});
