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
 * @returns {{ scenarios:Array, recommendedId:string|null, optimum:object }}
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
 * @returns {{ versement:number, economie:number, points:Array<{tmiSortie:number,avantageNet:number,estTmiDeclaree:boolean}> }}
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
