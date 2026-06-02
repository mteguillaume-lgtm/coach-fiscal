import { describe, it, expect } from 'vitest';
import {
  genererSynthese, detectZonesNonCouvertes, DISCLAIMER_GLOBAL, LIEN_VERIF_OFFICIEL,
} from '../conseilPatrimonial.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';

// ════════════════════════════════════════════════════════════════════════════
// PHASE 7 — Conseil universel & garde-fous
// Synthèse rédigée « sans/avec action », détecteur de zones non couvertes,
// disclaimer global permanent + renvoi impots.gouv.fr.
// ════════════════════════════════════════════════════════════════════════════

describe('detectZonesNonCouvertes — orientation vers le bon professionnel', () => {
  it('aucune zone pour un profil simple', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '30000' }, {}, {}, [], false));
    expect(detectZonesNonCouvertes(parsed)).toEqual([]);
  });

  it('international → avocat fiscaliste', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '50000', intl_statut_residence: 'non_resident' }, {}, {}, [], false));
    const zones = detectZonesNonCouvertes(parsed);
    expect(zones.some(z => z.id === 'international')).toBe(true);
    expect(zones.find(z => z.id === 'international').professionnel).toMatch(/avocat fiscaliste/i);
  });

  it('IFI → CGP / notaire', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '80000', ifi_patrimoine_brut: '1800000', ifi_valeur_rp: '400000' }, {}, {}, [], false));
    expect(detectZonesNonCouvertes(parsed).some(z => z.id === 'ifi')).toBe(true);
  });

  it('LMNP réel → expert-comptable', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '40000', lmnp_reel_net: '8000' }, {}, {}, [], false));
    expect(detectZonesNonCouvertes(parsed).some(z => z.id === 'lmnp_reel')).toBe(true);
  });

  it('PV immobilière → notaire', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '40000', pv_immo_cession: '300000', pv_immo_acquisition: '200000', pv_immo_duree: '10' }, {}, {}, [], false));
    expect(detectZonesNonCouvertes(parsed).some(z => z.id === 'pv_immo')).toBe(true);
  });
});

describe('genererSynthese — vue sans/avec action + disclaimer', () => {
  it('porte le disclaimer global et le lien officiel', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '30000' }, {}, {}, [], false));
    const s = genererSynthese(parsed);
    expect(s.disclaimer).toBe(DISCLAIMER_GLOBAL);
    expect(s.lienOfficiel).toBe(LIEN_VERIF_OFFICIEL);
    expect(DISCLAIMER_GLOBAL).toMatch(/impots\.gouv\.fr/);
    expect(DISCLAIMER_GLOBAL).toMatch(/ne se substitue pas/i);
  });

  it('agrège les gains chiffrables : total dû avec action ≤ sans action', () => {
    // Profil avec dividendes à TMI faible → levier arbitrage PFU/barème (gain > 0).
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '20000', divid: '5000', div_2dc: '5000' }, {}, {}, [], false));
    const s = genererSynthese(parsed);
    expect(s.gainTotal).toBeGreaterThanOrEqual(0);
    expect(s.totalDuApresAction).toBe(Math.max(0, s.totalDuActuel - s.gainTotal));
    expect(s.totalDuApresAction).toBeLessThanOrEqual(s.totalDuActuel);
  });

  it('synthèse rédigée non vide + zones remontées', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '80000', ifi_patrimoine_brut: '1800000', ifi_valeur_rp: '400000' }, {}, {}, [], false));
    const s = genererSynthese(parsed);
    expect(typeof s.synthese).toBe('string');
    expect(s.synthese.length).toBeGreaterThan(0);
    expect(s.zonesNonCouvertes.length).toBeGreaterThan(0);
    expect(s.synthese).toMatch(/professionnel/i);
  });

  it('profil vide → ne lève pas, structure cohérente', () => {
    const s = genererSynthese({});
    expect(s.totalDuActuel).toBe(0);
    expect(typeof s.gainTotal).toBe('number');
    expect(s.totalDuApresAction).toBe(Math.max(0, s.totalDuActuel - s.gainTotal));
    expect(Array.isArray(s.actions)).toBe(true);
    expect(Array.isArray(s.zonesNonCouvertes)).toBe(true);
    expect(s.zonesNonCouvertes).toEqual([]);
  });
});
