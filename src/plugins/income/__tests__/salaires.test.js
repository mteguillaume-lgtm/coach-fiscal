import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { abattement10Auto, calculFraisKilometriques } from '../../../lib/taxCalculator.js';
import plugin from '../salaires.plugin.js';

const __dir    = dirname(fileURLToPath(import.meta.url));
const REF      = readFileSync(resolve(__dir, '../../../lib/__tests__/fixtures/profil-fiscal-ref.txt'), 'utf-8');
const MULTI    = readFileSync(resolve(__dir, '../../../../tests/fixtures/profiles/multi-employeurs.txt'), 'utf-8');
const FR_REELS = readFileSync(resolve(__dir, '../../../../tests/fixtures/profiles/frais-reels.txt'), 'utf-8');

const SOLO = `== PROFIL FISCAL PERSONNEL 2025 ==
== SITUATION PERSONNELLE ==
Statut : Célibataire
Parts fiscales : 1

== REVENUS 2025 ==
Net imposable annuel (1AJ — case déclaration) : 45 000 €
PAS prélevé 2025 : 4 200 €
Taux PAS : 10%`;

describe('salaires.plugin — parser (profil de référence, couple)', () => {
  const result = plugin.parser(REF, 'couple');

  it('salaireNetImposableD1 = 45 162', () => {
    expect(result.salaireNetImposableD1).toBe(45162);
  });

  it('salaireNetImposableD2 = 29 283', () => {
    expect(result.salaireNetImposableD2).toBe(29283);
  });

  it('pasD1 = 4 609', () => {
    expect(result.pasD1).toBe(4609);
  });

  it('pasD2 = 1 741', () => {
    expect(result.pasD2).toBe(1741);
  });

  it('ijCpamD2 = 1 599', () => {
    expect(result.ijCpamD2).toBe(1599);
  });

  it('ijCpamOrgD2 contient "Maine-et-Loire"', () => {
    expect(result.ijCpamOrgD2).toMatch(/Maine-et-Loire/i);
  });
});

describe('salaires.plugin — parser (profil solo)', () => {
  const result = plugin.parser(SOLO, 'solo');

  it('salaireNetImposableD1 = 45 000 en mode solo', () => {
    expect(result.salaireNetImposableD1).toBe(45000);
  });

  it('salaireNetImposableD2 = 0 en mode solo', () => {
    expect(result.salaireNetImposableD2).toBe(0);
  });

  it('pasD1 = 4 200', () => {
    expect(result.pasD1).toBe(4200);
  });
});

describe('salaires.plugin — calculator', () => {
  it('rniD1 = abattement10Auto(45162)', () => {
    const v1 = { salaireNetImposableD1: 45162, typeRevenuD1: 'Salarié(e)', pensionNetImpD1: 0 };
    expect(plugin.calculator(v1).rniD1).toBe(abattement10Auto(45162, 'Salarié(e)', 0));
  });

  it('rniD2 = abattement10Auto(29283)', () => {
    const v1 = { salaireNetImposableD2: 29283, typeRevenuD2: 'Salarié(e)', pensionNetImpD2: 0 };
    expect(plugin.calculator(v1).rniD2).toBe(abattement10Auto(29283, 'Salarié(e)', 0));
  });

  it('rniD1 = 0 si salaireNetImposableD1 absent', () => {
    expect(plugin.calculator({}).rniD1).toBe(0);
  });
});

describe('salaires.plugin — validator', () => {
  it('valid = true pour net_imp renseigné', () => {
    expect(plugin.validator({ net_imp: '45000' }).valid).toBe(true);
  });

  it('valid = false si net_imp absent', () => {
    expect(plugin.validator({}).valid).toBe(false);
  });

  it('valid = false si net_imp vide', () => {
    expect(plugin.validator({ net_imp: '' }).valid).toBe(false);
  });
});

describe('salaires.plugin — generator', () => {
  it('retourne une chaîne', () => {
    const out = plugin.generator({}, { net_imp: '45000', pas_tot: '4200', taux_pas: '10' }, {}, 'solo');
    expect(typeof out).toBe('string');
  });

  it('contient le net imposable', () => {
    const out = plugin.generator({}, { net_imp: '45000', pas_tot: '4200' }, {}, 'solo');
    expect(out).toContain('45');
  });
});

describe('salaires.plugin — declarativeCases', () => {
  it('retourne 1AJ et 1BJ', () => {
    const codes = plugin.declarativeCases().map(c => c.caseCode);
    expect(codes).toContain('1AJ');
    expect(codes).toContain('1BJ');
  });
});

// ─── Multi-employeurs (Sprint A) ─────────────────────────────────────────────

describe('salaires.plugin — parser multi-employeurs (fixture Sprint A, solo)', () => {
  const result = plugin.parser(MULTI, 'solo');

  it('salaireNetImposableD1 = 32 400 (cumul 2 employeurs)', () => {
    expect(result.salaireNetImposableD1).toBe(32400);
  });

  it('salairesBrutImposableD1 = 40 500', () => {
    expect(result.salairesBrutImposableD1).toBe(40500);
  });

  it('pasD1 = 2 916 (cumul PAS 2 employeurs)', () => {
    expect(result.pasD1).toBe(2916);
  });

  it('salaireSourcesD1 contient 2 sources', () => {
    expect(result.salaireSourcesD1).toHaveLength(2);
  });

  it('source 1 : net = 14 800, pas = 1 332', () => {
    expect(result.salaireSourcesD1[0].net).toBe(14800);
    expect(result.salaireSourcesD1[0].pas).toBe(1332);
  });

  it('source 2 : net = 17 600, pas = 1 584', () => {
    expect(result.salaireSourcesD1[1].net).toBe(17600);
    expect(result.salaireSourcesD1[1].pas).toBe(1584);
  });

  it('somme sources.net = salaireNetImposableD1', () => {
    const sum = result.salaireSourcesD1.reduce((acc, s) => acc + s.net, 0);
    expect(sum).toBe(result.salaireNetImposableD1);
  });

  it('salaireSourcesD2 = null (profil solo)', () => {
    expect(result.salaireSourcesD2).toBeNull();
  });
});

describe('salaires.plugin — round-trip multi-sources', () => {
  it('generator(sources) → parser → mêmes totaux', () => {
    const d1Data = {
      net_imp: '32400',
      brut: '40500',
      pas_tot: '2916',
      sources: [
        { type: 'employeur', organisme: 'Employeur A', periode: '(jan-mai 2025)', brut: '18500', net: '14800', pas: '1332', tauxPas: '9,00' },
        { type: 'employeur', organisme: 'Employeur B', periode: '(juin-oct 2025)', brut: '22000', net: '17600', pas: '1584', tauxPas: '9,00' },
      ],
    };
    const txt = `== REVENUS 2025 ==\n${plugin.generator({}, d1Data, {}, 'solo')}`;
    const parsed = plugin.parser(txt, 'solo');
    expect(parsed.salaireNetImposableD1).toBe(32400);
    expect(parsed.salairesBrutImposableD1).toBe(40500);
    expect(parsed.pasD1).toBe(2916);
    expect(parsed.salaireSourcesD1).toHaveLength(2);
    expect(parsed.salaireSourcesD1[0].net).toBe(14800);
    expect(parsed.salaireSourcesD1[1].net).toBe(17600);
  });
});

describe('salaires.plugin — non-régression profil-fiscal-ref.txt (sources=null)', () => {
  const result = plugin.parser(REF, 'couple');

  it('salaireNetImposableD1 = 45 162 inchangé', () => {
    expect(result.salaireNetImposableD1).toBe(45162);
  });

  it('salaireNetImposableD2 = 29 283 inchangé', () => {
    expect(result.salaireNetImposableD2).toBe(29283);
  });

  it('salaireSourcesD1 = null (format single-source)', () => {
    expect(result.salaireSourcesD1).toBeNull();
  });

  it('ijCpamD2 = 1 599 inchangé', () => {
    expect(result.ijCpamD2).toBe(1599);
  });
});

// ─── PR A5 — Frais réels kilométriques ───────────────────────────────────────

describe('calculFraisKilometriques — exemples officiels BOFiP', () => {
  it('4 000 km, 5 CV → 2 544 €', () => {
    expect(calculFraisKilometriques(4000, 5, false)).toBe(2544);
  });

  it('11 000 km, 5 CV → 5 322 €', () => {
    expect(calculFraisKilometriques(11000, 5, false)).toBe(5322);
  });

  it('25 000 km, 6 CV → 11 175 €', () => {
    expect(calculFraisKilometriques(25000, 6, false)).toBe(11175);
  });

  it('distance = 0 → 0 €', () => {
    expect(calculFraisKilometriques(0, 5, false)).toBe(0);
  });

  it('cv = 0 → 0 € (véhicule non renseigné)', () => {
    expect(calculFraisKilometriques(10000, 0, false)).toBe(0);
  });

  it('électrique : +20% sur le résultat', () => {
    const thermique = calculFraisKilometriques(10000, 5, false);
    const electrique = calculFraisKilometriques(10000, 5, true);
    expect(electrique).toBe(Math.round(thermique * 1.20));
  });

  it('3 CV ou moins → utilise la tranche 3_cv_et_moins', () => {
    expect(calculFraisKilometriques(3000, 2, false)).toBe(Math.round(3000 * 0.529));
    expect(calculFraisKilometriques(3000, 3, false)).toBe(Math.round(3000 * 0.529));
  });

  it('7 CV et plus → utilise la tranche 7_cv_et_plus', () => {
    expect(calculFraisKilometriques(3000, 7, false)).toBe(Math.round(3000 * 0.697));
    expect(calculFraisKilometriques(3000, 9, false)).toBe(Math.round(3000 * 0.697));
  });
});

describe('salaires.plugin — parser (fixture frais-reels.txt, couple)', () => {
  const parsed = plugin.parser(FR_REELS, 'couple');

  it('D1 : distanceAller = 40 km', ()  => expect(parsed.fraisDistanceAllerD1).toBe(40));
  it('D1 : jours = 220',           ()  => expect(parsed.fraisJoursD1).toBe(220));
  it('D1 : cv = 5',                 ()  => expect(parsed.fraisCvD1).toBe(5));
  it('D1 : électrique = false',     ()  => expect(parsed.fraisElectriqueD1).toBe(false));
  it('D1 : autres = 0',             ()  => expect(parsed.fraisAutresD1).toBe(0));
  it('D1 : option = true (OUI)',    ()  => expect(parsed.fraisOptionD1).toBe(true));

  it('D2 : distanceAller = 5 km',   ()  => expect(parsed.fraisDistanceAllerD2).toBe(5));
  it('D2 : jours = 210',            ()  => expect(parsed.fraisJoursD2).toBe(210));
  it('D2 : cv = 3',                 ()  => expect(parsed.fraisCvD2).toBe(3));
  it('D2 : option = false (NON)',   ()  => expect(parsed.fraisOptionD2).toBe(false));
});

describe('salaires.plugin — calculator (frais réels vs forfait)', () => {
  // D1 : 50 000 € salary, 40km×2×220 = 17 600 km, 5 CV
  //   frais = 17600 × 0.357 + 1395 = 6283.2 + 1395 = 7678.2 → 7678 €
  //   forfait = 50000 × 10% = 5000 € → frais réels RECOMMANDÉS
  //   option = OUI → rniD1 = 50000 - 7678 = 42322
  const v1Frais = {
    salaireNetImposableD1: 50000, typeRevenuD1: 'Salarié(e)',
    fraisDistanceAllerD1: 40, fraisJoursD1: 220, fraisCvD1: 5,
    fraisElectriqueD1: false, fraisAutresD1: 0, fraisOptionD1: true,
    salaireNetImposableD2: 40000, typeRevenuD2: 'Salarié(e)',
    fraisDistanceAllerD2: 5, fraisJoursD2: 210, fraisCvD2: 3,
    fraisElectriqueD2: false, fraisAutresD2: 0, fraisOptionD2: false,
  };
  const r = plugin.calculator(v1Frais);

  it('D1 : distanceAnnuelle = 17 600 km', () => expect(r.distanceAnnuelleD1).toBe(17600));
  it('D1 : fraisKm = 7 678 €',            () => expect(r.fraisKmD1).toBe(7678));
  it('D1 : forfaitMontant = 5 000 €',     () => expect(r.forfaitMontantD1).toBe(5000));
  it('D1 : recommandeReels = true (7678 > 5000)',   () => expect(r.recommandeReelsD1).toBe(true));
  it('D1 : option OUI → rniD1 = 50000 - 7678 = 42322', () => expect(r.rniD1).toBe(42322));
  it('D1 : montant1AKD1 = 7 678 €',       () => expect(r.montant1AKD1).toBe(7678));

  // D2 : 40 000 € salary, 5km×2×210 = 2 100 km, 3 CV
  //   frais = 2100 × 0.529 = 1110.9 → 1111 €
  //   forfait = 40000 × 10% = 4000 € → forfait MEILLEUR
  //   option = NON → rniD2 = abattement10Auto(40000) = 40000 - 4000 = 36000
  it('D2 : distanceAnnuelle = 2 100 km',  () => expect(r.distanceAnnuelleD2).toBe(2100));
  it('D2 : fraisKm = 1 111 €',            () => expect(r.fraisKmD2).toBe(1111));
  it('D2 : forfaitMontant = 4 000 €',     () => expect(r.forfaitMontantD2).toBe(4000));
  it('D2 : recommandeReels = false (1111 < 4000)',  () => expect(r.recommandeReelsD2).toBe(false));
  it('D2 : option NON → rniD2 = abattement10Auto(40000)', () => {
    expect(r.rniD2).toBe(abattement10Auto(40000, 'Salarié(e)', 0));
  });
  it('D2 : montant1AKD2 = 0 (forfait retenu)', () => expect(r.montant1AKD2).toBe(0));
});

describe('salaires.plugin — calculator non-régression (pas de frais réels)', () => {
  it('rniD1 = abattement10Auto(45162) si pas de frais réels', () => {
    const v1 = { salaireNetImposableD1: 45162, typeRevenuD1: 'Salarié(e)', pensionNetImpD1: 0 };
    expect(plugin.calculator(v1).rniD1).toBe(abattement10Auto(45162, 'Salarié(e)', 0));
  });
});

describe('salaires.plugin — generator (frais réels)', () => {
  const d1 = {
    net_imp: '50000', pas_tot: '4500',
    frais_distance_aller: '40', frais_jours: '220', frais_cv: '5',
    frais_electrique: false, frais_autres: '0', frais_option: true,
  };
  const out = plugin.generator({}, d1, {}, 'solo');

  it('contient le header FRAIS RÉELS', () => expect(out).toContain('== FRAIS RÉELS =='));
  it('contient Distance aller',        () => expect(out).toContain('Distance aller'));
  it('contient Jours travaillés',      () => expect(out).toContain('Jours travaillés'));
  it('contient Option frais réels',    () => expect(out).toContain('Option frais réels : OUI'));
  it('contient distance annuelle 17600', () => expect(out).toContain('17600'));
});

describe('salaires.plugin — generator (sans frais réels → pas de section)', () => {
  const d1 = { net_imp: '45000', pas_tot: '4200' };
  it('ne contient pas FRAIS RÉELS si pas de frais saisis', () => {
    expect(plugin.generator({}, d1, {}, 'solo')).not.toContain('FRAIS RÉELS');
  });
});

describe('salaires.plugin — round-trip frais réels (parser → generator → parser)', () => {
  it('frais réels D1 → génère → reparse → mêmes valeurs', () => {
    const d1 = {
      net_imp: '50000', pas_tot: '4500',
      frais_distance_aller: '40', frais_jours: '220', frais_cv: '5',
      frais_electrique: false, frais_autres: '0', frais_option: true,
    };
    const generated = `== REVENUS 2025 ==\n${plugin.generator({}, d1, {}, 'solo')}`;
    const reparsed = plugin.parser(generated, 'solo');
    expect(reparsed.fraisDistanceAllerD1).toBe(40);
    expect(reparsed.fraisJoursD1).toBe(220);
    expect(reparsed.fraisCvD1).toBe(5);
    expect(reparsed.fraisElectriqueD1).toBe(false);
    expect(reparsed.fraisOptionD1).toBe(true);
  });
});

describe('salaires.plugin — declarativeCases (avec 1AK/1BK)', () => {
  const codes = plugin.declarativeCases().map(c => c.caseCode);
  it('contient 1AJ', () => expect(codes).toContain('1AJ'));
  it('contient 1BJ', () => expect(codes).toContain('1BJ'));
  it('contient 1AK', () => expect(codes).toContain('1AK'));
  it('contient 1BK', () => expect(codes).toContain('1BK'));
  it('1AK required = false', () => {
    const c = plugin.declarativeCases().find(c => c.caseCode === '1AK');
    expect(c.required).toBe(false);
  });
});
