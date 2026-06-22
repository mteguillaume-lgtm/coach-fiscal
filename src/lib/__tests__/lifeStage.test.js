import { describe, it, expect } from 'vitest';
import { deriveLifeStage, bandForAge, deriveRoadmapContext, PHASES } from '../lifeStage.js';
import { buildProfile } from '../profileGenerator.js';
import { parseProfile } from '../profileParser.js';

// ════════════════════════════════════════════════════════════════════════════
// CYCLE DE VIE — deriveLifeStage
// Un cas par phase, un cas couple d'âges écartés, le mode dégradé (âge absent),
// et la chaîne réelle parser → lifeStage.
// ════════════════════════════════════════════════════════════════════════════

describe('bandForAge — bornes des 5 phases', () => {
  it('mappe chaque âge représentatif sur la bonne phase', () => {
    expect(bandForAge(25).id).toBe('CONSTITUTION');
    expect(bandForAge(38).id).toBe('ACCUMULATION');
    expect(bandForAge(50).id).toBe('CONSOLIDATION');
    expect(bandForAge(60).id).toBe('PRE_RETRAITE');
    expect(bandForAge(70).id).toBe('RETRAITE');
  });

  it('retourne null si l\'âge est absent / invalide', () => {
    expect(bandForAge(0)).toBeNull();
    expect(bandForAge(undefined)).toBeNull();
    expect(bandForAge(-5)).toBeNull();
  });

  it('couvre les bornes sans trou ni chevauchement', () => {
    for (let age = 18; age <= 95; age++) {
      const matches = PHASES.filter(p => age >= p.ageMin && age <= p.ageMax);
      expect(matches.length).toBe(1);
    }
  });
});

describe('deriveLifeStage — une phase par âge (solo)', () => {
  const stageFor = (age) => deriveLifeStage({ mode: 'solo', ageD1: age, retraiteD1: 64 });

  it('25 ans → CONSTITUTION, allocation offensive, pas de glidepath', () => {
    const ls = stageFor(25);
    expect(ls.bandD1.id).toBe('CONSTITUTION');
    expect(ls.bandFoyer.id).toBe('CONSTITUTION');
    expect(ls.flags.glidepathRequis).toBe(false);
    expect(ls.degrade).toBe(false);
  });

  it('38 ans → ACCUMULATION, pas de glidepath', () => {
    const ls = stageFor(38);
    expect(ls.bandD1.id).toBe('ACCUMULATION');
    expect(ls.flags.glidepathRequis).toBe(false);
    expect(ls.bandD1.transmission).toBe(false);
  });

  it('50 ans → CONSOLIDATION, glidepath requis, transmission amorcée', () => {
    const ls = stageFor(50);
    expect(ls.bandD1.id).toBe('CONSOLIDATION');
    expect(ls.flags.glidepathRequis).toBe(true);
    expect(ls.bandD1.transmission).toBe(true);
    expect(ls.flags.donFamilialPossible).toBe(true);
  });

  it('60 ans → PRE_RETRAITE, glidepath requis', () => {
    const ls = stageFor(60);
    expect(ls.bandD1.id).toBe('PRE_RETRAITE');
    expect(ls.flags.glidepathRequis).toBe(true);
  });

  it('70 ans → RETRAITE, glidepath requis', () => {
    const ls = stageFor(70);
    expect(ls.bandD1.id).toBe('RETRAITE');
    expect(ls.flags.glidepathRequis).toBe(true);
  });
});

describe('deriveLifeStage — flag av70Proche (bascule 990 I → 757 B)', () => {
  it('vrai à 68 et 69 ans', () => {
    expect(deriveLifeStage({ mode: 'solo', ageD1: 68 }).flags.av70Proche).toBe(true);
    expect(deriveLifeStage({ mode: 'solo', ageD1: 69 }).flags.av70Proche).toBe(true);
  });

  it('faux loin du pivot (50 ans) et bien après (75 ans)', () => {
    expect(deriveLifeStage({ mode: 'solo', ageD1: 50 }).flags.av70Proche).toBe(false);
    expect(deriveLifeStage({ mode: 'solo', ageD1: 75 }).flags.av70Proche).toBe(false);
  });

  it('don familial impossible une fois passé 80 ans (art. 790 G)', () => {
    expect(deriveLifeStage({ mode: 'solo', ageD1: 82 }).flags.donFamilialPossible).toBe(false);
  });
});

describe('deriveLifeStage — couple d\'âges écartés (35 / 62)', () => {
  const ls = deriveLifeStage({
    mode: 'couple',
    ageD1: 35, retraiteD1: 64,
    ageD2: 62, retraiteD2: 64,
  });

  it('expose une phase par déclarant', () => {
    expect(ls.bandD1.id).toBe('ACCUMULATION');
    expect(ls.bandD2.id).toBe('PRE_RETRAITE');
  });

  it('bandFoyer = phase du plus âgé (transmission / glidepath)', () => {
    expect(ls.bandFoyer.id).toBe('PRE_RETRAITE');
    expect(ls.flags.glidepathRequis).toBe(true);
  });

  it('horizon = déclarant le plus proche de la retraite (le plus âgé)', () => {
    // D1 : 64 − 35 = 29 ans ; D2 : 64 − 62 = 2 ans → min = 2
    expect(ls.horizonInvestissement).toBe(2);
  });
});

describe('deriveLifeStage — mode dégradé (âge non renseigné)', () => {
  const ls = deriveLifeStage({ mode: 'solo' });

  it('phases nulles, glidepath désactivé, horizon inconnu', () => {
    expect(ls.bandD1).toBeNull();
    expect(ls.bandD2).toBeNull();
    expect(ls.bandFoyer).toBeNull();
    expect(ls.horizonInvestissement).toBeNull();
    expect(ls.flags.glidepathRequis).toBe(false);
    expect(ls.flags.av70Proche).toBe(false);
    expect(ls.flags.donFamilialPossible).toBe(false);
  });

  it('signale la vigilance explicite', () => {
    expect(ls.degrade).toBe(true);
    expect(ls.vigilance).toMatch(/non personnalisé par cycle de vie/i);
  });
});

describe('deriveRoadmapContext — feuille de route Rapport.jsx (différenciation par âge)', () => {
  // Deux profils IDENTIQUES sauf l'âge → la feuille de route doit diverger.
  const baseProfil = { mode: 'solo', retraiteD1: 64, patrimoineNet: 400000 };
  const jeune = deriveRoadmapContext({ ...baseProfil, ageD1: 28 });
  const proche = deriveRoadmapContext({ ...baseProfil, ageD1: 68 });

  it('jeune (28) : constitution, pas de sécurisation ni de transmission', () => {
    expect(jeune.enConstitution).toBe(true);
    expect(jeune.securisationRequise).toBe(false);
    expect(jeune.transmissionPertinente).toBe(false);
    expect(jeune.peaHorlogeUtile).toBe(true);
  });

  it('proche retraite (68) : retraite, sécurisation + transmission + AV 70 ans', () => {
    expect(proche.enRetraite).toBe(true);
    expect(proche.securisationRequise).toBe(true);
    expect(proche.transmissionPertinente).toBe(true);
    expect(proche.lifeStage.flags.av70Proche).toBe(true);
  });

  it('les deux profils produisent des contextes de conseil distincts', () => {
    expect(proche.phase).not.toBe(jeune.phase);
    expect(proche.securisationRequise).not.toBe(jeune.securisationRequise);
    expect(proche.transmissionPertinente).not.toBe(jeune.transmissionPertinente);
  });

  it('horizon court (68 ans, retraite à 64) → PEA horloge peu utile', () => {
    // Déjà retraité (68 > 64) → horizon 0 → l'horloge 5 ans n'est plus pertinente.
    expect(proche.horizon).toBe(0);
    expect(proche.peaHorlogeUtile).toBe(false);
  });
});

describe('deriveLifeStage — chaîne réelle parser → lifeStage', () => {
  it('lit l\'âge depuis un profil généré (solo)', () => {
    const parsed = parseProfile(
      buildProfile({ statut: 'Célibataire', net_imp: '40000', age_d1: '50', retraite_d1: '64' }, {}, {}, [], false),
    );
    expect(parsed.ageD1).toBe(50);
    const ls = deriveLifeStage(parsed);
    expect(ls.bandFoyer.id).toBe('CONSOLIDATION');
    expect(ls.flags.glidepathRequis).toBe(true);
  });

  it('profil sans âge → mode dégradé', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '40000' }, {}, {}, [], false));
    const ls = deriveLifeStage(parsed);
    expect(ls.degrade).toBe(true);
  });
});
