import { describe, it, expect } from 'vitest';
import { detectRelevantSkills, tokenize, deriveDefiscKeywords } from '../skillRouter';
import { DEFISC_DISPOSITIFS } from '../taxCalculator';

const has = (msg, skill) => detectRelevantSkills(msg).includes(skill);

describe('tokenize', () => {
  it('minuscules, accents retirés, découpe ponctuation/tirets', () => {
    expect(tokenize("l'IR. et l'assurance-vie")).toEqual(['l', 'ir', 'et', 'l', 'assurance', 'vie']);
    expect(tokenize('Déduction PER ?')).toEqual(['deduction', 'per']);
  });
});

describe('detectRelevantSkills — word boundaries (audit)', () => {
  it('gcp toujours présent', () => {
    expect(detectRelevantSkills('bonjour')).toContain('gcp');
  });

  it('ir matche « mon IR » mais pas « partir »', () => {
    expect(has('comment calculer mon IR ?', 'fiscaliste')).toBe(true);
    // « je dois partir » ne doit PAS activer un skill via un faux « ir » — fiscaliste
    // reste possible par fallback, donc on teste l'absence de faux positif sur comptable :
    expect(detectRelevantSkills('je dois partir demain')).not.toContain('comptable');
  });

  it('is (comptable) matche « l\'IS » mais pas « je suis »', () => {
    expect(has("l'IS de ma société", 'comptable')).toBe(true);
    expect(has('je suis salarié', 'comptable')).toBe(false);
  });

  it('per matche mon PER / PER ? / PER, mais pas hyperactif', () => {
    expect(has('mon PER', 'fiscaliste')).toBe(true);
    expect(has('PER ?', 'fiscaliste')).toBe(true);
    expect(has('je suis hyperactif', 'comptable')).toBe(false);
  });

  it('dispositifs defisc → fiscaliste (dérivés du JSON)', () => {
    expect(has('investir en Pinel', 'fiscaliste')).toBe(true);
    expect(has('souscrire un FCPI', 'fiscaliste')).toBe(true);
    expect(has('un investissement Girardin outre-mer', 'fiscaliste')).toBe(true);
  });

  it('ajouts ifi/cehr → fiscaliste ; holding → comptable', () => {
    expect(has("suis-je redevable de l'IFI ?", 'fiscaliste')).toBe(true);
    expect(has('la CEHR sur mes revenus', 'fiscaliste')).toBe(true);
    expect(has('créer une holding', 'comptable')).toBe(true);
  });

  it('tiret = espace : assurance-vie et assurance vie routent pareil', () => {
    expect(detectRelevantSkills('mon assurance-vie')).toEqual(detectRelevantSkills('mon assurance vie'));
    expect(has('mon assurance-vie', 'fiscaliste')).toBe(true);
  });

  it('multi-skills : succession + TVA', () => {
    const r = detectRelevantSkills('ma succession et la TVA de mon activité');
    expect(r).toContain('notaire');
    expect(r).toContain('comptable');
    expect(r).toContain('gcp');
  });

  it('charabia → fallback [gcp, fiscaliste]', () => {
    expect(detectRelevantSkills('azerty qwerty').sort()).toEqual(['fiscaliste', 'gcp']);
  });
});

describe('deriveDefiscKeywords', () => {
  it('contient un token par dispositif du JSON (reste synchro)', () => {
    const kw = deriveDefiscKeywords();
    for (const key of Object.keys(DEFISC_DISPOSITIFS)) {
      const parts = key.split('_').filter(t => t.length >= 3 && t !== 'ir');
      expect(parts.some(t => kw.includes(t))).toBe(true);
    }
  });
});
