import { describe, it, expect } from 'vitest';
import {
  parseAmount, parseRate, parseDateToMMYYYY,
  extractFields, mapExtractToForm, EXTRACT_MAP,
} from '../docExtract.js';

describe('parsers locaux', () => {
  it('parseAmount gère les séparateurs français (espace normal + insécable)', () => {
    expect(parseAmount('45 162')).toBe('45162');
    expect(parseAmount('45 162')).toBe('45162');     // U+202F étroite insécable
    expect(parseAmount('1.300.000')).toBe('1300000');     // points = milliers
    expect(parseAmount('45 162,30')).toBe('45162');        // virgule décimale tronquée
    expect(parseAmount('12 000 €')).toBe('12000');
    expect(parseAmount('abc')).toBeNull();
  });

  it('parseRate gère la virgule décimale', () => {
    expect(parseRate('11,80')).toBe('11.8');
    expect(parseRate('30 %')).toBe('30');
    expect(parseRate('x')).toBeNull();
  });

  it('parseDateToMMYYYY normalise en MM/AAAA', () => {
    expect(parseDateToMMYYYY('05/03/2018')).toBe('03/2018');
    expect(parseDateToMMYYYY('1.7.20')).toBe('07/2020');
    expect(parseDateToMMYYYY('rien')).toBeNull();
  });
});

describe('extractFields — avis d\'imposition', () => {
  const txt = [
    "AVIS D'IMPÔT 2025",
    'Revenu fiscal de référence 45 162',
    'Nombre de parts 2',
    'Taux personnalisé 11,80 %',
  ].join('\n');

  it('extrait RFR, parts et taux PAS', () => {
    const out = extractFields(txt, 'avis_ir');
    expect(out.rfr).toBe('45162');
    expect(out.nbParts).toBe('2');
    expect(out.tauxPAS).toBe('11.8');
  });
});

describe('extractFields — bulletin (cumul annuel, jamais mensuel)', () => {
  const txt = 'Net imposable mensuel 3 750 Cumul 45 000\nNet à payer 2 800';

  it('vise le cumul annuel', () => {
    const out = extractFields(txt, 'bulletin_salaire');
    expect(out.netImposable).toBe('45000');
  });

  it('ignore un type inconnu', () => {
    expect(extractFields(txt, 'inconnu')).toEqual({});
  });
});

describe('mapExtractToForm — routage déclarant / foyer', () => {
  it('sépare individuel (déclarant) et foyer', () => {
    const { declarant, foyer } = mapExtractToForm(
      { netImposable: '45000', plafondPER: '5000' }, 'd1',
    );
    expect(declarant).toEqual({ net_imp: '45000' });
    expect(foyer).toEqual({ per_n1: '5000' });
  });

  it('suffixe les champs foyer per-déclarant (pero)', () => {
    expect(mapExtractToForm({ peroCotisations: '1200' }, 'd2').foyer).toEqual({ pero_d2: '1200' });
    expect(mapExtractToForm({ peroCotisations: '1200' }, 'solo').foyer).toEqual({ pero_d1: '1200' });
  });

  it('ignore les ids sans mapping (rfr sert à la cohérence)', () => {
    expect(EXTRACT_MAP.rfr).toBeUndefined();
    const { declarant, foyer } = mapExtractToForm({ rfr: '45162' }, 'solo');
    expect(declarant).toEqual({});
    expect(foyer).toEqual({});
  });
});
