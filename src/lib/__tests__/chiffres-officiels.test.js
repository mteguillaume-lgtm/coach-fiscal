import { describe, it, expect } from 'vitest';
import { buildChiffresOfficiels } from '../chiffresOfficiels';
import { buildProfile } from '../profileGenerator';
import { parseProfile } from '../profileParser';
import { computeFoyerSummary } from '../taxCalculator';

describe('buildChiffresOfficiels — bloc autorité pour le system prompt (audit E4)', () => {
  const parsed  = parseProfile(buildProfile(
    { statut: 'Célibataire', net_imp: '45000', div_2dc: '5000', pv_mob_gain: '2000' },
    {}, {}, [], false,
  ));
  const summary = computeFoyerSummary(parsed);

  it('contient les montants clés formatés fr-FR et la mention d\'autorité', () => {
    const bloc = buildChiffresOfficiels(summary, parsed);
    expect(bloc).toContain('CHIFFRES OFFICIELS DU FOYER');
    expect(bloc).toContain('font autorité');
    expect(bloc).toContain(summary.totalDu.toLocaleString('fr-FR'));
    expect(bloc).toContain(`TMI : ${summary.tmi}`);
    expect(bloc).toMatch(/Arbitrage 2OP/);
  });

  it('retourne une chaîne vide sans summary (rétro-compat)', () => {
    expect(buildChiffresOfficiels(null, {})).toBe('');
    expect(buildChiffresOfficiels(undefined)).toBe('');
  });
});
