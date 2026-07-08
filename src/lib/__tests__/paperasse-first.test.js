import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Règle paperasse-first : aucun littéral fiscal en dur dans le code.
// Les valeurs vivent dans src/data/paperasse/*.json (ou src/data/*.json) et
// sont exposées par taxCalculator.js. Ce test échoue si l'un des littéraux
// ci-dessous réapparaît dans src/lib ou src/plugins.

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOTS = [join(__dir, '..'), join(__dir, '../../plugins')];

// Fichiers exclus : tests, fixtures, et le module d'hypothèses de rendement
// (constantes NON fiscales, documentées comme telles).
const EXCLUDE = /__tests__|\.test\.js$|hypothesesRendement\.js$/;

const FORBIDDEN = [
  { re: /0\.4525/,                           why: 'taux de décote → bareme-ir JSON (decote.taux)' },
  { re: /0\.172\b/,                          why: 'PS capital → TAUX_PS_CAPITAL (pfu-prelevements-sociaux.json)' },
  { re: /\b(?:250_000|500_000|1_000_000)\b/, why: 'seuils CEHR → bareme-ir JSON (cehr)' },
  { re: /\*\s*0\.9\b/,                       why: 'abattement pension approximé → abattement10Pension()' },
  { re: /\b22_?950\b/,                       why: 'plafond Livret A → PLAFOND_LIVRET_A (epargne-reglementee.json)' },
  { re: /\b150_000\b/,                       why: 'plafond PEA / seuil AV → PLAFOND_VERSEMENTS_PEA / AV_SEUIL_PRIMES_TAUX_REDUIT' },
  { re: /\b(?:4_600|9_200)\b/,               why: 'abattements AV 8 ans → AV_ABATTEMENT_8ANS_* (pea-assurance-vie.json)' },
  { re: /\b0\.075\b/,                        why: 'taux IR AV après 8 ans → AV_TAUX_IR_APRES_8ANS' },
];

function jsFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFilesUnder(p));
    else if (p.endsWith('.js') && !EXCLUDE.test(p)) out.push(p);
  }
  return out;
}

describe('Paperasse-first — aucun littéral fiscal en dur (audit E8)', () => {
  const files = ROOTS.flatMap(jsFilesUnder);

  it('scanne bien les sources (sanity check)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const { re, why } of FORBIDDEN) {
    it(`interdit ${re} — ${why}`, () => {
      const hits = files
        .filter(f => re.test(readFileSync(f, 'utf8')))
        .map(f => relative(process.cwd(), f));
      expect(hits, `Littéral fiscal en dur (${why}) dans : ${hits.join(', ')}`).toEqual([]);
    });
  }
});
