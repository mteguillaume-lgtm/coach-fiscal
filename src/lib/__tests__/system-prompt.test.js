import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../skillRouter';

const CONTENU = [{
  id: 'fiscaliste',
  content: 'Règles IR de test.',
  data: { 'bareme-test.json': '{"tranche": 0.11}' },
  refs: { 'workflow.md': 'Étapes de test.' },
}];

describe('buildSystemPrompt — pur, alimenté par loadSkills (audit E7)', () => {
  it('rend le bloc skill avec données et références', () => {
    const out = buildSystemPrompt({
      skills: ['fiscaliste'], skillsContent: CONTENU,
      profile: 'RNI : 40 000 €', masterPrompt: 'MASTER', model: 'sonnet',
    });
    expect(out).toContain('## SKILL : Fiscaliste');
    expect(out).toContain('Règles IR de test.');
    expect(out).toContain('### Données de référence');
    expect(out).toContain('bareme-test.json');
    expect(out).toContain('### Documentation procédurale');
    expect(out).toContain('## PROFIL FISCAL CLIENT');
  });

  it('sans skillsContent : prompt dégradé propre (pas de bloc skill), rétro-compat E4 summary', () => {
    const sans = buildSystemPrompt({ skills: ['fiscaliste'], profile: '', masterPrompt: 'MASTER', model: 'haiku' });
    expect(sans).not.toContain('## SKILL :');
    const avec = buildSystemPrompt({
      skills: [], skillsContent: [], profile: '', masterPrompt: 'MASTER', model: 'haiku',
      summary: { rniFoyer: 40_000, partsFiscales: 1, tmi: 30, irNet: 5_104, decote: 0, cehr: 0, totalDu: 5_104, pasTotal: 4_000, solde: 1_104 },
      parsedProfile: {},
    });
    expect(avec).toContain('CHIFFRES OFFICIELS DU FOYER');
  });
});
