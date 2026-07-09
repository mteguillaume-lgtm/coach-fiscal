# Scénarios PER + sensibilité TMI de sortie — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un module déterministe pur pour les scénarios PER (avec TMI résiduelle) et la sensibilité de l'avantage net à la TMI de sortie (0/11/30 %), consommé par Rapport — la logique quitte la page, gagne des tests, et le gap « risque législatif long terme » est comblé.

**Architecture:** Spec validée `docs/superpowers/specs/2026-07-09-per-scenarios-sensibilite-design.md`. Nouveau `src/lib/perScenarios.js` (pur), refactor de `PerScenariosTable`/`PerZonesBlock`/`PerCalendarBlock` pour consommer le module, ajout colonne TMI + mini-bloc sensibilité dans l'UI.

**Tech Stack:** Vitest (module en env node), jsdom (smoke Rapport existant), React.

## Global Constraints

- **Parité stricte** des scénarios actuels : mêmes versements/économies qu'aujourd'hui (test de non-régression figé).
- **Paperasse-first** : les taux de sortie de la sensibilité sont dérivés de `TRANCHES`, aucun littéral 0.11/0.30. Verrou `paperasse-first.test.js` reste vert.
- Aucun appel API (module déterministe pur).
- Suite verte à chaque commit (759 au départ). Branche `per-scenarios`. Commits `feat(per)/refactor(per)`.

---

### Task 1: Module `perScenarios.js` (TDD)

**Files:**
- Create: `src/lib/perScenarios.js`
- Test: `src/lib/__tests__/per-scenarios.test.js` (create)

**Interfaces:**
- Produces: `getEffectivePlafondsWithReports(p)`, `buildPerScenarios(opts)`, `buildTmiSortieSensitivity(opts)` (formes de la spec). Tâche 2 en dépend.

- [ ] **Step 0:** `git checkout -b per-scenarios`

- [ ] **Step 1: Tests qui échouent** — créer `src/lib/__tests__/per-scenarios.test.js` :

```js
import { describe, it, expect } from 'vitest';
import {
  getEffectivePlafondsWithReports, buildPerScenarios, buildTmiSortieSensitivity,
} from '../perScenarios';
import { TRANCHES, calcIR, getTMI } from '../taxCalculator';

// Profil solo TMI 30 % : RNI 50 000 €, 1 part, plafond PER 5 000 €.
const SOLO = { rniFoyer: 50_000, parts: 1, isCouple: false, plafondD1: 5_000, plafondD2: 0, rniD1: 50_000, rniD2: 0, stopRate: 0.11, irAvant: calcIR(50_000, 1, false) };

describe('buildPerScenarios (audit — scénarios PER)', () => {
  const { scenarios, recommendedId } = buildPerScenarios(SOLO);

  it('produit un statu quo à 0 € sans économie', () => {
    const sq = scenarios.find(s => s.id === 'statu_quo');
    expect(sq.versement).toBe(0);
    expect(sq.economie).toBe(0);
    expect(sq.tmiResiduelle).toBe(getTMI(50_000, 1)); // 30
  });

  it('parité : économie = IR(avant) − IR(après versement) sur le barème réel', () => {
    const plafond = scenarios.find(s => s.id === 'plafond_max');
    expect(plafond.versement).toBe(5_000);
    expect(plafond.economie).toBe(Math.max(0, SOLO.irAvant - calcIR(45_000, 1, false)));
    expect(plafond.effort).toBe(plafond.versement - plafond.economie);
  });

  it('TMI résiduelle : le versement fait (au moins) descendre ou rester dans la tranche', () => {
    for (const s of scenarios) {
      expect(s.tmiResiduelle).toBe(getTMI(Math.max(0, 50_000 - s.versement), 1));
      expect(s.tmiResiduelle).toBeLessThanOrEqual(30);
    }
  });

  it('recommendedId pointe le scénario à meilleure économie (hors statu quo)', () => {
    const reco = scenarios.find(s => s.id === recommendedId);
    const best = scenarios.filter(s => s.versement > 0).reduce((b, s) => s.economie > b.economie ? s : b);
    expect(reco.economie).toBe(best.economie);
  });
});

describe('buildTmiSortieSensitivity (risque législatif long terme)', () => {
  it('taux de sortie = 3 rates les plus bas du barème (paperasse-first, pas de littéral)', () => {
    const attendus = [...new Set(TRANCHES.map(t => t[2]))].sort((a, b) => a - b).slice(0, 3);
    const { points } = buildTmiSortieSensitivity({ versement: 5_000, economie: 1_500, stopRate: 0.11 });
    expect(points.map(p => p.tmiSortie)).toEqual(attendus);
  });

  it('avantage net décroît avec la TMI de sortie et vaut l\'économie à 0 %', () => {
    const { points } = buildTmiSortieSensitivity({ versement: 5_000, economie: 1_500, stopRate: 0.11 });
    expect(points[0].avantageNet).toBe(1_500);              // tmiSortie 0 → economie pleine
    expect(points[1].avantageNet).toBeGreaterThan(points[2].avantageNet);
    // À 30 % : 1 500 − 5 000×0,30 = 0 → PER neutre
    expect(points[2].avantageNet).toBe(1_500 - Math.round(5_000 * 0.30));
  });

  it('marque le taux correspondant à la TMI de sortie déclarée', () => {
    const { points } = buildTmiSortieSensitivity({ versement: 5_000, economie: 1_500, stopRate: 0.11 });
    const decl = points.find(p => p.estTmiDeclaree);
    expect(Math.round(decl.tmiSortie * 100)).toBe(11);
  });
});

describe('getEffectivePlafondsWithReports', () => {
  it('ajoute les reports N-1/N-2/N-3 pro-ratés par RNI', () => {
    const r = getEffectivePlafondsWithReports({
      rniD1: 30_000, rniD2: 10_000, plafondPerD1: 3_000, plafondPerD2: 1_000,
      perReportableN1: 400, perReportableN2: 0, perReportableN3: 0,
    });
    expect(r.plafondD1).toBe(3_000 + Math.round(400 * (30_000 / 40_000))); // +300
    expect(r.plafondD2).toBe(1_000 + (400 - 300));                          // +100
  });
});
```

⚠️ Avant d'implémenter, VÉRIFIER les valeurs figées de parité en lisant le `calcScen`/`scenarios`
actuels de `PerScenariosTable` (Rapport.jsx ~l.1216-1250) — le module doit produire les MÊMES
montants. Ajuster les `expect` de parité si le barème réel donne d'autres chiffres exacts
(les relations `economie = irAvant − irApres` et `effort = versement − economie` restent, elles).

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/per-scenarios.test.js` → FAIL (module inexistant).

- [ ] **Step 3: Implémenter `src/lib/perScenarios.js`**

```js
// Scénarios PER + sensibilité à la TMI de sortie — module DÉTERMINISTE PUR
// (aucun appel API). Extrait de Rapport.jsx pour être testable et réutilisable.
// Réutilise le barème réel via taxCalculator ; aucun paramètre fiscal en propre.

import { calcIR, getTMI, computePerOptimumCascade, TRANCHES } from './taxCalculator';

const _round = (v) => Math.round(v || 0);

/** Plafonds PER effectifs, reports N-1/N-2/N-3 pro-ratés par RNI (déplacé de Rapport). */
export function getEffectivePlafondsWithReports(p) {
  const rniD1    = p.rniD1 || 0;
  const rniD2    = p.rniD2 || 0;
  const rniTot   = rniD1 + rniD2;
  const repTotal = (p.perReportableN1 || 0) + (p.perReportableN2 || 0) + (p.perReportableN3 || 0);
  const repD1    = rniTot > 0 ? _round(repTotal * (rniD1 / rniTot)) : repTotal;
  const repD2    = repTotal - repD1;
  return {
    plafondD1: (p.plafondPerD1 || 0) + repD1,
    plafondD2: (p.plafondPerD2 || 0) + repD2,
  };
}

// Un scénario chiffré sur le barème réel, avec TMI résiduelle après versement.
function _scen(id, label, desc, versement, ctx) {
  const { rniFoyer, parts, isCouple, irAvant } = ctx;
  const v = Math.max(0, _round(versement));
  if (v === 0) {
    return { id, label, desc, versement: 0, irApres: irAvant, economie: 0, effort: 0, rendement: 0, tmiResiduelle: getTMI(rniFoyer, parts) };
  }
  const rniApres = Math.max(0, rniFoyer - v);
  const irApres  = calcIR(rniApres, parts, isCouple);
  const economie = Math.max(0, irAvant - irApres);
  return {
    id, label, desc,
    versement: v, irApres, economie,
    effort: v - economie,
    rendement: v > 0 ? _round((economie / v) * 100) : 0,
    tmiResiduelle: getTMI(rniApres, parts),
  };
}

/**
 * Scénarios de versement PER (statu quo → plafond max), chiffrés sur le barème réel.
 * Reproduit les scénarios historiques de Rapport.PerScenariosTable + TMI résiduelle.
 * @returns {{ scenarios:Array, recommendedId:string, optimum:object }}
 */
export function buildPerScenarios({ rniFoyer, parts, isCouple, plafondD1, plafondD2, rniD1, rniD2, stopRate, irAvant }) {
  const ctx = { rniFoyer, parts, isCouple, irAvant };
  const optimum = computePerOptimumCascade(rniFoyer, parts, plafondD1, plafondD2, isCouple, rniD1, rniD2, stopRate);

  let scenarios;
  if (isCouple && (plafondD1 > 0 || plafondD2 > 0)) {
    const prio    = optimum.prioritaire || 'D1';
    const sec     = prio === 'D1' ? 'D2' : 'D1';
    const prioOpt = prio === 'D1' ? optimum.optimumD1 : optimum.optimumD2;
    scenarios = [
      _scen('statu_quo',      'A — Statu quo',               'Aucun versement', 0, ctx),
      _scen('optimum',        `B — Optimum ${prio}`,         `${prio} seul (effacement tranche max)`, prioOpt, ctx),
      _scen('optimum_couple', `C — Optimum ${prio}+${sec}`,  'Total optimal', optimum.optimumTotal, ctx),
      _scen('plafond_max',    'D — Plafond max',             'Plafonds saturés', plafondD1 + plafondD2, ctx),
    ];
  } else if (!isCouple && plafondD1 > 0) {
    const t75 = _round((plafondD1 * 0.75) / 100) * 100;
    scenarios = [
      _scen('statu_quo',   'A — Statu quo',      'Aucun versement', 0, ctx),
      _scen('optimum',     'B — Optimum fiscal', 'Effacement tranches > sortie', optimum.optimumTotal, ctx),
      _scen('partiel',     'C — Partiel 75 %',   '75 % du plafond', t75, ctx),
      _scen('plafond_max', 'D — Plafond max',    'Plafond saturé', plafondD1, ctx),
    ];
  } else {
    return { scenarios: [], recommendedId: null, optimum };
  }

  const best = scenarios.filter(s => s.versement > 0).reduce((b, s) => (s.economie > b.economie ? s : b), scenarios[1] ?? scenarios[0]);
  return { scenarios, recommendedId: best?.id ?? null, optimum };
}

// Taux de sortie testés = 3 rates distincts les plus bas du barème (0, 11, 30 %) —
// dérivés du JSON, pas de littéral (verrou paperasse-first).
const _TAUX_SORTIE = [...new Set(TRANCHES.map(t => t[2]))].sort((a, b) => a - b).slice(0, 3);

/**
 * Sensibilité de l'avantage NET du PER à la TMI de sortie (report d'imposition).
 * avantageNet = economie − versement × tmiSortie. Capitalisation ignorée (prudent),
 * hors PFU sur les gains — estimation à étiqueter comme telle dans l'UI.
 * @returns {{ versement, economie, points:Array<{tmiSortie,avantageNet,estTmiDeclaree}> }}
 */
export function buildTmiSortieSensitivity({ versement = 0, economie = 0, stopRate = 0.11 }) {
  const declPct = Math.round(stopRate * 100);
  const points = _TAUX_SORTIE.map(tmiSortie => ({
    tmiSortie,
    avantageNet: economie - _round(versement * tmiSortie),
    estTmiDeclaree: Math.round(tmiSortie * 100) === declPct,
  }));
  return { versement, economie, points };
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/per-scenarios.test.js src/lib/__tests__/paperasse-first.test.js` → PASS (ajuster les valeurs de parité figées si nécessaire — cf. avertissement Step 1). Puis `npx vitest run` complet → vert.

- [ ] **Step 5:** Commit `feat(per): module déterministe perScenarios — scénarios + TMI résiduelle + sensibilité TMI sortie`.

---

### Task 2: Rapport consomme le module (refactor + UI)

**Files:**
- Modify: `src/pages/Rapport.jsx` — import du module ; `PerScenariosTable` (colonne TMI + bloc sensibilité) ; `PerZonesBlock` et `PerCalendarBlock` (import du helper déplacé) ; suppression du `getEffectivePlafondsWithReports` local.

- [ ] **Step 1: Import** — ajouter en tête (près des imports `../lib/…`) :

```js
import { getEffectivePlafondsWithReports, buildPerScenarios, buildTmiSortieSensitivity } from '../lib/perScenarios';
```

- [ ] **Step 2: Supprimer le helper local** — retirer la fonction `function getEffectivePlafondsWithReports(p) { … }` de Rapport.jsx (désormais importée). Les 3 appelants (`PerScenariosTable`, `PerZonesBlock`, `PerCalendarBlock`) utilisent l'import sans autre changement.

- [ ] **Step 3: `PerScenariosTable` consomme le module** — remplacer le corps (de `const { plafondD1: plafD1 … }` jusqu'à la fin de la construction `scenarios`/`bestScen`) par :

```js
  const { plafondD1: plafD1, plafondD2: plafD2 } = getEffectivePlafondsWithReports(p);
  const parts = p.parts || (isCouple ? 2 : 1);
  const stopRate = Math.min(p.tmiRetraiteD1 ?? 11, p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? 11)) / 100;
  const { scenarios, recommendedId } = buildPerScenarios({
    rniFoyer: d.rniFoyer, parts, isCouple, plafondD1: plafD1, plafondD2: plafD2,
    rniD1: p.rniD1 || 0, rniD2: p.rniD2 || 0, stopRate, irAvant: d.irNetFoyer,
  });
  if (scenarios.length === 0) return null;
  const bestScen = scenarios.find(s => s.id === recommendedId) ?? scenarios[0];
  const reco = bestScen;
  const sensibilite = buildTmiSortieSensitivity({ versement: reco.versement, economie: reco.economie, stopRate });
```

Puis, dans le `<thead>`, ajouter une colonne après « Rendement » :

```jsx
            <Th right>TMI après</Th>
```

et dans le `<tbody>`, dans chaque ligne, après la cellule Rendement :

```jsx
                <Td right muted={s.versement === 0}>{s.versement > 0 ? `${s.tmiResiduelle} %` : '—'}</Td>
```

(la détection `isBest` compare désormais `s.id === recommendedId && i > 0` au lieu du label.)

- [ ] **Step 4: Mini-bloc sensibilité** — juste avant `</SectionBox>` de `PerScenariosTable`, insérer :

```jsx
      {reco.versement > 0 && (
        <div className="mx-4 mb-4 mt-3 rounded-xl border border-gray-200 bg-gray-50/60 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-100">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Sensibilité — le PER est un report d'imposition</p>
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-600 mb-3 leading-relaxed">
              Sur le scénario recommandé (<strong>{e0(reco.versement)}</strong> versés, <strong>{e0(reco.economie)}</strong> d'économie à l'entrée),
              l'avantage net réel dépend de votre taux d'imposition à la retraite :
            </p>
            <div className="grid grid-cols-3 gap-2">
              {sensibilite.points.map(pt => {
                const perdant = pt.avantageNet <= 0;
                return (
                  <div key={pt.tmiSortie} className={`rounded-lg border p-3 text-center ${pt.estTmiDeclaree ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-white'}`}>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">TMI sortie {Math.round(pt.tmiSortie * 100)} %{pt.estTmiDeclaree ? ' · déclarée' : ''}</p>
                    <p className={`text-sm font-bold tabular-nums mt-1 ${perdant ? 'text-red-600' : 'text-teal-800'}`}>{perdant ? e0(pt.avantageNet) : `+${e0(pt.avantageNet)}`}</p>
                    {perdant && <p className="text-2xs text-red-500 mt-0.5">PER neutre/perdant</p>}
                  </div>
                );
              })}
            </div>
            <p className="text-2xs text-gray-400 italic mt-3 leading-relaxed">
              Estimation prudente : capitalisation de l'économie d'entrée et fiscalité PFU des gains non comptées (elles jouent en votre faveur). Vérifiez votre situation avec un professionnel.
            </p>
          </div>
        </div>
      )}
```

(`e0` et `Th`/`Td` sont déjà utilisés dans le fichier ; `e2`-style non requis.)

- [ ] **Step 5:** `npx vitest run` → tout vert (dont le smoke Rapport E6 : le rendu doit toujours contenir la table) ; `npm run lint` → 0/0 ; `npm run build` → succès.

- [ ] **Step 6:** Vérif manuelle (optionnelle) : `npm run dev` → /rapport avec un profil chargé → la colonne « TMI après » et le bloc sensibilité s'affichent, la case de la TMI déclarée est surlignée.

- [ ] **Step 7:** Commit `refactor(per): Rapport consomme perScenarios + colonne TMI résiduelle + bloc sensibilité`.

---

### Task 3: Traçabilité + clôture

- [ ] **Step 1:** `docs/audit-2026-07-complet.md`, section « Moyenne » : marquer « Scénarios A/B/C PER + bloc sensibilité TMI sortie » ✅ 09/07/2026 (branche per-scenarios).
- [ ] **Step 2:** `npx vitest run` + `npm run lint` + `npm run build` verts.
- [ ] **Step 3:** Commit docs, clôture via finishing-a-development-branch (merge main + push selon le choix établi), CI surveillée, mémoire projet mise à jour.
