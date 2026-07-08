import { describe, it, expect } from 'vitest';
import { AI_TITLES, isAiSection, stripAiSections, extractAiSections } from '../aiSections';
import { buildProfile } from '../profileGenerator';
import { parseProfile } from '../profileParser';

const PROFIL_POLLUE = `== SITUATION ==
Statut : Célibataire

== DONNÉES POUR CALCUL IR FOYER ==
RNI FOYER TOTAL : 40 000 €
IR net : 4 000 €

== POINTS D'ATTENTION ==
[🔴 CRITIQUE] Fausse alerte IA
IR net : 99 999 €

== OBJECTIFS PRIORITAIRES ==
1. Verser sur le PER

== ÉPARGNE ET PLACEMENTS ==
Livret A : 10 000 €`;

describe('aiSections — découpage des blocs IA', () => {
  it('expose les 5 titres et isAiSection', () => {
    expect(AI_TITLES).toHaveLength(5);
    expect(isAiSection("POINTS D'ATTENTION")).toBe(true);
    expect(isAiSection('DONNÉES POUR CALCUL IR FOYER')).toBe(false);
  });

  it('stripAiSections retire les blocs IA, conserve tout le reste (y compris après)', () => {
    const s = stripAiSections(PROFIL_POLLUE);
    expect(s).toContain('RNI FOYER TOTAL : 40 000 €');   // section déterministe conservée
    expect(s).toContain('Livret A : 10 000 €');           // section APRÈS un bloc IA conservée
    expect(s).not.toContain('99 999');
    expect(s).not.toContain('Verser sur le PER');
  });

  it('extractAiSections ne garde que les blocs IA, en-têtes inclus', () => {
    const e = extractAiSections(PROFIL_POLLUE);
    expect(e).toContain("== POINTS D'ATTENTION ==");
    expect(e).toContain('99 999');
    expect(e).toContain('== OBJECTIFS PRIORITAIRES ==');
    expect(e).not.toContain('RNI FOYER TOTAL : 40 000');
    expect(e).not.toContain('Livret A');
  });

  it('INVARIANT : identité sur un profil généré pur (aucune section déterministe strippée)', () => {
    const profile = buildProfile(
      { statut: 'Célibataire', net_imp: '30000', div_2dc: '5000', pv_mob_gain: '2000', livret_a: '10000' },
      {}, {}, [], false,
    );
    expect(stripAiSections(profile)).toBe(profile);
    expect(extractAiSections(profile)).toBe('');
  });

  it('texte vide / sans section : comportement neutre', () => {
    expect(stripAiSections('')).toBe('');
    expect(extractAiSections('juste du texte sans en-tête')).toBe('');
  });
});

describe('Parser blindé — la pollution IA ne change aucun champ numérique (audit E4)', () => {
  const formData = { statut: 'Célibataire', net_imp: '30000', div_2dc: '5000', pv_mob_gain: '2000', livret_a: '10000' };
  const pur = buildProfile(formData, {}, {}, [], false);
  const pollution = `

== ANALYSE DES SITUATIONS PARTICULIÈRES ==
Le foyer mentionne un DÉCLARANT 2 hypothétique. RNI FOYER TOTAL : 99 999 €

== POINTS D'ATTENTION ==
[🔴 CRITIQUE] IR net : 99 999 € — pénalité possible
[🟡 À CONFIRMER] Plafond PER D1 : 99 999 €
[🟢 OPTIMISATION] Verser 99 999 € sur le PER

== STRATÉGIE PATRIMONIALE ==
Livret A : 99 999 € conseillé. Arbitrage 2OP foyer : PFU 99 999 € | barème 1 € | recommandé : barème | économie 99 998 €`;

  const pParsed  = parseProfile(pur);
  const pPollue  = parseProfile(pur + pollution);

  it('tous les champs numériques sont identiques avec et sans pollution', () => {
    for (const [k, v] of Object.entries(pParsed)) {
      if (typeof v === 'number') {
        expect(pPollue[k], `champ ${k}`).toBe(v);
      }
    }
    expect(pPollue.mode).toBe('solo');   // le « DÉCLARANT 2 » de l'IA ne bascule pas le mode
  });

  it('le qualitatif IA reste lu : isEnriched + alertes 🔴🟡🟢', () => {
    expect(pPollue.isEnriched).toBe(true);
    expect(pParsed.isEnriched).toBe(false);
    expect(pPollue.alertsCritiques.length).toBeGreaterThan(0);
    expect(pPollue.alertsOpportunites.length).toBeGreaterThan(0);
  });
});
