import { describe, it, expect, vi, afterEach } from 'vitest';
import * as mistral from '../mistral';
import {
  PROVIDERS, DEFAULT_PROVIDER, getProviderMeta, isValidKey, detectComplexity, analyzeDoc,
} from '../index';

afterEach(() => vi.restoreAllMocks());

describe('registre des fournisseurs', () => {
  it('expose Claude (anthropic, défaut) et Mistral', () => {
    expect(DEFAULT_PROVIDER).toBe('anthropic');
    expect(PROVIDERS.map(p => p.id)).toEqual(['anthropic', 'mistral']);
  });

  it('getProviderMeta retourne les métadonnées du fournisseur', () => {
    expect(getProviderMeta('mistral').consoleUrl).toContain('console.mistral.ai');
    expect(getProviderMeta('anthropic').placeholder).toMatch(/^sk-ant-/);
  });

  it('getProviderMeta retombe sur le défaut pour un id inconnu', () => {
    expect(getProviderMeta('inconnu').id).toBe('anthropic');
  });

  it('isValidKey aiguille vers la validation du bon fournisseur', () => {
    expect(isValidKey('anthropic', 'sk-ant-xxxxxxxxxxxxxxxxxxxx')).toBe(true);
    expect(isValidKey('anthropic', 'pas-une-cle-anthropic')).toBe(false);
    expect(isValidKey('mistral', 'abcDEF1234567890abcd')).toBe(true);
    expect(isValidKey('mistral', 'sk-ant-xxxxxxxxxxxxxxxxxxxx')).toBe(true); // alphanum+tiret, sanity gate
  });

  it('ré-exporte detectComplexity (provider-agnostic)', () => {
    expect(detectComplexity('Bonjour').model).toBeDefined();
  });
});

describe('registre — analyzeDoc', () => {
  it('aiguille vers le provider en passant { images, apiKey }', async () => {
    const spy = vi.spyOn(mistral, 'analyzeDoc').mockResolvedValue('ok');
    const images = [{ blob: new Blob(['x']), mediaType: 'image/jpeg' }];
    await analyzeDoc('mistral', images, 'key1234567890abcdefgh');
    expect(spy).toHaveBeenCalledWith({ images, apiKey: 'key1234567890abcdefgh' });
  });

  it('annonce le support PDF côté Mistral (métadonnée)', () => {
    expect(getProviderMeta('mistral').note).toMatch(/PDF/);
  });
});
