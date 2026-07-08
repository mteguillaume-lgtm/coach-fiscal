import { describe, it, expect } from 'vitest';
import { loadSkills } from '../../data/skillsLoader';

describe('loadSkills — chargement à la demande (audit E7)', () => {
  it('charge le contenu, les données et les références du skill demandé', async () => {
    const [fisc] = await loadSkills(['fiscaliste']);
    expect(fisc.id).toBe('fiscaliste');
    expect(fisc.content.length).toBeGreaterThan(500);
    expect(Object.keys(fisc.data)).toContain('bareme-ir-2025.json');
    expect(Object.keys(fisc.refs).length).toBeGreaterThan(0);
  });

  it('id inconnu → entrée neutre ignorée par le builder', async () => {
    const [inconnu] = await loadSkills(['inexistant']);
    expect(inconnu).toEqual({ id: 'inexistant', content: '', data: {}, refs: {} });
  });

  it('cache : deux appels renvoient le même objet (pas de rechargement)', async () => {
    const [a] = await loadSkills(['gcp']);
    const [b] = await loadSkills(['gcp']);
    expect(b).toBe(a);
  });
});
