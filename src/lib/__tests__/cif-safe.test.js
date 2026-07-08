import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MENTION_NON_CONSEIL } from '../conseilPatrimonial';

// Verrou E5 : aucun levier ne doit COMMENCER son champ `action` par un verbe
// d'ordre décisionnel d'investissement (zone CIF/AMF) — reformuler en
// « À étudier : … ». Les impératifs déclaratifs/administratifs et le routage
// professionnel restent autorisés : Reporter, Déclarer, Vérifier, Conserver,
// Consulter, Rédiger, Augmenter, Comparer, Identifier, Concentrer.
const SRC = readFileSync(
  fileURLToPath(new URL('../opportunitiesDetector.js', import.meta.url)), 'utf8',
);

describe('CIF-safe — pédagogie conditionnelle, pas d\'ordre décisionnel (audit E5)', () => {
  it('aucune chaîne action ne commence par un verbe décisionnel d\'investissement', () => {
    const lignes = SRC.split('\n');
    const fautes = [];
    for (let i = 0; i < lignes.length; i++) {
      if (!/^\s*action:/.test(lignes[i])) continue;
      // Bloc action = la ligne + ses continuations ternaires immédiates (? '…' / : '…').
      const bloc = [lignes[i]];
      let j = i + 1;
      while (j < lignes.length && /^\s*[?:]\s*['`]/.test(lignes[j])) bloc.push(lignes[j++]);
      for (const l of bloc) {
        if (/['`](Verser|Cocher|Ouvrir|Clôturer|Saturer|Investir|Basculer|Arbitrer|Étaler|Anticiper)\b/.test(l)) {
          fautes.push(`ligne ${i + 1}: ${l.trim().slice(0, 90)}`);
        }
      }
    }
    expect(fautes, `Verbe décisionnel en tête d'action (reformuler « À étudier : … ») :\n${fautes.join('\n')}`).toEqual([]);
  });

  it('la mention non-conseil centralisée existe', () => {
    expect(MENTION_NON_CONSEIL).toMatch(/pas un conseil/i);
  });
});
