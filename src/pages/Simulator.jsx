import { useState, useMemo, useEffect, Fragment } from 'react';
import { useNavigate }             from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import toast                       from 'react-hot-toast';
import { TrendingUp, Layers, Home, Building2, Briefcase, MessageCircle, Save, ChevronRight, FileText, PenLine, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

import { useApp }       from '../context/AppContext';
import Button           from '../components/Button';
import EvolutionChart   from '../components/EvolutionChart';
import SimImmobilier    from '../components/SimImmobilier';
import { getTMI, baseIRFoyer, MIN_PLAFOND_PER, MAX_PLAFOND_PER, calcIR, TRANCHES, computePerOptimumCascade, calcCEHR } from '../lib/taxCalculator';

import AuroraBackground from '../components/motion/AuroraBackground';
import SpotlightCursor  from '../components/motion/SpotlightCursor';
import Grain            from '../components/motion/Grain';
import SplitText        from '../components/motion/SplitText';
import ScrollReveal     from '../components/motion/ScrollReveal';

const TMI_OPTIONS = [0, 11, 30, 41, 45];
const MIN_PLAFOND = MIN_PLAFOND_PER; // 4 710 €

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = n => Math.round(n).toLocaleString('fr-FR');

/**
 * Capital net après impôts pour chaque enveloppe.
 *
 * PEA  : avantage SORTIE — exonération IR sur gains après 5 ans (PS 17,2% seulement).
 *         Avant 5 ans : flat tax 30%.
 * PER  : avantage ENTRÉE — déduction = P × TMI_e, réinvestie en PEA si reinvest=true.
 *         Sortie : IR sur capital+gains (TMI_s) + PS sur gains uniquement.
 *         Bonus réinvestissement = P × TMI_e × [(1+r)^t × (1−0,172) + 0,172]
 *
 * @param {string}  id        - identifiant enveloppe
 * @param {number}  P         - capital investi
 * @param {number}  r         - rendement annuel net
 * @param {number}  t         - durée en années
 * @param {number}  tmiE      - TMI à l'entrée (%)
 * @param {number}  tmiS      - TMI à la sortie/retraite (%) — PER uniquement
 * @param {boolean} reinvest  - réinvestir l'économie fiscale PER en PEA
 */
/**
 * Calcul du capital net pour chaque enveloppe.
 *
 * Règles fiscales France 2025 :
 *  Livret A  — exonéré d'IR et de PS (taux garanti 3 %)
 *  PEA       — PS 17,2 % sur gains après 5 ans ; flat tax 30 % avant 5 ans
 *  AV >8 ans — PS 17,2 % sur tous les gains + IR 7,5 % sur gains > abattement
 *              (4 600 € solo / 9 200 € couple, abattement annuel)
 *  PER       — IR au TMI_sortie sur la totalité du capital retiré (car versements déduits)
 *              + PS 17,2 % sur les plus-values seulement
 *              + bonus si économie IR d'entrée réinvestie en PEA
 *  CTO       — PFU 30 % (12,8 % IR + 17,2 % PS) sur les gains
 *
 * @param {boolean} isCouple — détermine l'abattement AV (9 200 € vs 4 600 €)
 */
/**
 * @param {number} avVerse — versements nets cumulés AV (seuil 150 000 € art. 125-0 A CGI).
 *   ≤ 150k€ : IR 7,5 % sur gains > abattement
 *   > 150k€ : fraction ≤ 150k€ à 7,5 %, fraction > 150k€ à 12,8 % (PFU)
 *   L'abattement annuel s'impute en priorité sur la tranche 7,5 %.
 */
/**
 * Capitalisation d'une mensualité M sur n mois au taux mensuel exact.
 * r_mensuel = (1 + r_annuel)^(1/12) − 1  [géométrique exact, non r/12]
 */
function fvMensuel(m, r, t) {
  if (m <= 0 || t <= 0) return 0;
  const r_m = Math.pow(1 + r, 1 / 12) - 1;
  const n   = t * 12;
  return r_m > 0 ? m * ((Math.pow(1 + r_m, n) - 1) / r_m) : m * n;
}

/**
 * Capital brut total (versement unique P + mensualité m) capitalisé t ans.
 * Livret A : taux figé à 3 % quelle que soit la valeur de r.
 */
function brutEnv(id, P, r, t, m) {
  const rate = id === 'livretA' ? 0.03 : r;
  return (P > 0 ? P * Math.pow(1 + rate, t) : 0) + fvMensuel(m, rate, t);
}

function envNet(id, P, r, t, tmiE, tmiS = null, reinvest = true, isCouple = false, avVerse = 0, m = 0) {
  const rate    = id === 'livretA' ? 0.03 : r;
  const Brut    = brutEnv(id, P, r, t, m);
  const P_total = P + m * t * 12;           // capital total investi
  const G       = Math.max(0, Brut - P_total);
  const Te      = tmiE / 100;
  const Ts      = (tmiS ?? tmiE) / 100;

  switch (id) {
    case 'livretA':
      return Brut;                           // 0 % — exonéré total (taux légal 3 %)

    case 'pea':
      // < 5 ans : flat tax 30 % sur gains
      // ≥ 5 ans : PS 17,2 % sur gains seulement (IR exonéré)
      return t >= 5 ? Brut - G * 0.172 : Brut - G * 0.30;

    case 'av8': {
      // PS 17,2 % toujours dus sur tous les gains (art. 125-0 A CGI)
      const abatt   = isCouple ? 9_200 : 4_600;
      const psTotal = G * 0.172;
      let irTotal;
      if ((avVerse + P_total) <= 150_000) {
        // Tout à 7,5 % IR (versements cumulés ≤ 150 000 €)
        irTotal = Math.max(0, G - abatt) * 0.075;
      } else {
        // Fractionnement : ratio de la part ≤ 150 000 € dans les versements totaux
        const ratio150 = Math.min(1, Math.max(0, 150_000 - avVerse) / Math.max(1, P_total));
        const G150     = G * ratio150;
        const GAbove   = G * (1 - ratio150);
        const G150imp  = Math.max(0, G150 - abatt);
        irTotal = G150imp * 0.075 + GAbove * 0.128;
      }
      return Brut - psTotal - irTotal;
    }

    case 'per': {
      // Toute la somme retirée = revenu imposable (versements déduits à l'entrée)
      const netBase = Brut * (1 - Ts) - G * 0.172;
      if (!reinvest) return netBase;
      // Bonus versement unique : économie IR (P × TMI_e) placée en PEA t ans
      const bonusLump = P > 0
        ? P * Te * (Math.pow(1 + r, t) * (1 - 0.172) + 0.172)
        : 0;
      // Bonus mensuel : chaque année, m×12×TMI_e économisés → placés en PEA
      // FV de cette rente annuelle dans PEA = (m×12×Te) × Σ(1+r)^k × (1−0,172) + base×0,172
      const bonusMensuel = m > 0 && r > 0
        ? m * 12 * Te * (((Math.pow(1 + r, t) - 1) / r) * (1 - 0.172) + t * 0.172)
        : 0;
      return netBase + bonusLump + bonusMensuel;
    }

    case 'cto':
      // PFU 30 % = 12,8 % IR + 17,2 % PS sur les gains
      return Brut - G * 0.30;

    default:
      return Brut;
  }
}

/** Détail fiscal d'une enveloppe : brut, impôts, net, gain net. */
function envDetail(id, P, r, t, tmiE, tmiS, reinvest, isCouple, avVerse = 0, m = 0) {
  const Brut    = brutEnv(id, P, r, t, m);
  const P_total = P + m * t * 12;
  const net     = envNet(id, P, r, t, tmiE, tmiS, reinvest, isCouple, avVerse, m);
  let tax       = Brut - net;
  let bonus     = 0;
  if (id === 'per' && reinvest) {
    const netBase = envNet('per', P, r, t, tmiE, tmiS, false, isCouple, avVerse, m);
    bonus = net - netBase;
    tax   = Brut - netBase;
  }
  return { brut: Math.round(Brut), tax: Math.round(tax), net: Math.round(net), gain: Math.round(net - P_total), bonus: Math.round(bonus), pTotal: Math.round(P_total) };
}

/** Année à partir de laquelle PER >= PEA, ou null si PEA toujours gagnant sur l'horizon. */
function perCrossover(P, r, tmiE, tmiS, reinvest, isCouple, maxY = 50, avVerse = 0, m = 0) {
  for (let y = 1; y <= maxY; y++) {
    if (envNet('per', P, r, y, tmiE, tmiS, reinvest, isCouple, avVerse, m) >= envNet('pea', P, r, y, tmiE, tmiS, reinvest, isCouple, avVerse, m)) return y;
  }
  return null;
}

const ENVELOPES = [
  { id: 'livretA', name: 'Livret A',      color: '#94a3b8', taxLabel: '0 % exonéré — taux légal 3 % (figé, indépendant du curseur)' },
  { id: 'pea',     name: 'PEA',           color: '#0d9488', taxLabel: '17,2 % PS sur gains (>5 ans)'             },
  { id: 'av8',     name: 'AV > 8 ans',   color: '#3b82f6', taxLabel: '7,5 % IR + 17,2 % PS (après abattement)'  },
  { id: 'per',     name: 'PER',           color: '#8b5cf6', taxLabel: 'TMI à la sortie + 17,2 % PS sur gains'    },
  { id: 'cto',     name: 'Compte-titres', color: '#f97316', taxLabel: 'PFU 30 %'                                 },
];

const DURATIONS = [5, 10, 20, 30];
const RATES     = [0.03, 0.05, 0.07, 0.09];
const SAVE_KEY  = 'coachFiscal.simulations';

// ─── Décomposition de l'économie PER par tranche ─────────────────────────────
// La déduction PER réduit le revenu depuis le haut — elle traverse d'abord la
// tranche marginale haute, puis les tranches inférieures si la déduction dépasse
// le montant imposé dans la tranche haute.

function computeBracketBreakdown(rniFoyer, versement, parts) {
  if (!versement || versement <= 0 || !rniFoyer || !parts) return [];
  const quotient      = rniFoyer / parts;
  const quotientApres = Math.max(0, (rniFoyer - versement) / parts);
  const breakdown     = [];
  for (const [lo, hi, rate] of TRANCHES) {
    if (rate === 0)         continue;
    if (quotient <= lo)     break;   // au-delà du revenu actuel
    if (quotientApres >= Math.min(hi, quotient)) continue; // non touché
    const loQ = Math.max(lo, quotientApres);
    const hiQ = Math.min(hi, quotient);
    if (hiQ <= loQ)         continue;
    breakdown.push({
      rate:   Math.round(rate * 100),
      amount: Math.round((hiQ - loQ) * parts),
      saving: Math.round((hiQ - loQ) * parts * rate),
    });
  }
  return breakdown.reverse(); // tranche la plus haute en premier
}

function saveSimulation(label) {
  try {
    const saves = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
    saves.unshift({ id: Date.now(), date: new Date().toLocaleDateString('fr-FR'), label });
    localStorage.setItem(SAVE_KEY, JSON.stringify(saves.slice(0, 10)));
    toast.success('Simulation sauvegardée.');
  } catch {
    toast.error('Impossible de sauvegarder.');
  }
}

// ─── Slider ───────────────────────────────────────────────────────────────────

function SimSlider({ label, value, min, max, step, onChange, format }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-medium text-ink-200">{label}</span>
        <span className="text-sm font-bold text-kapio-300 font-mono tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #0d9488 ${pct}%, #e5e7eb ${pct}%)`,
          accentColor: '#0d9488',
        }}
      />
      <div className="flex justify-between text-[10px] text-ink-300 font-mono">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

// ─── Toggle groupe ────────────────────────────────────────────────────────────

function ToggleGroup({ label, options, value, onChange, format }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-200">{label}</span>
      <div className="flex gap-1 p-1 bg-ink-800/80 border border-white/[0.06] rounded-xl">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={[
              'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
              value === opt
                ? 'bg-ink-700 text-kapio-300 shadow-sm'
                : 'text-ink-300 hover:text-ink-0',
            ].join(' ')}
          >
            {format ? format(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Bandeau données profil ───────────────────────────────────────────────────

function ProfileBanner({ items, isDefault, sub }) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3">
      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Données du profil</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-[10px] text-blue-400">{label}</p>
            <p className="text-sm font-bold text-blue-200 font-mono tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {sub && <p className="text-[10px] text-blue-400 mt-2 text-center">{sub}</p>}
      {isDefault && (
        <p className="text-[10px] text-blue-300 mt-2 text-center">
          Valeurs d'exemple — générez un profil pour les personnaliser
        </p>
      )}
    </div>
  );
}

// ─── Tooltip recharts ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-ink-900 shadow-2xl border border-white/[0.06] p-3 text-xs min-w-[160px]">
      <p className="font-bold text-ink-100 mb-1.5">Année {label}</p>
      {payload.map(({ name, value, color }) => (
        <div key={name} className="flex items-center justify-between gap-4 py-0.5">
          <span style={{ color }} className="font-medium">{name}</span>
          <span className="font-bold font-mono tabular-nums text-ink-0">{fmt(value)} €</span>
        </div>
      ))}
    </div>
  );
}

// ─── Simulateur PER ───────────────────────────────────────────────────────────

function SimPER({ data }) {
  const navigate  = useNavigate();
  const { dispatch } = useApp();
  const profData  = data;

  const isCouple       = profData.isCouple;
  const parts          = profData.parts || 1;
  const rniFoyer       = profData.rni;

  // Two sliders only available in profile mode (perCalcD1/D2 present)
  const showTwoSliders = isCouple && profData.perCalcD1 != null && profData.perCalcD2 != null;

  // Utilise plafondWithReports (N + reports FIFO) comme borne max des curseurs
  const plafondD1    = showTwoSliders ? (profData.perCalcD1?.plafondWithReports || profData.perCalcD1?.plafondNet || 0) : (profData.plafond || 0);
  const plafondD2    = showTwoSliders ? (profData.perCalcD2?.plafondWithReports || profData.perCalcD2?.plafondNet || 0) : 0;
  const plafondTotal = plafondD1 + plafondD2;

  // stopRate = TMI retraite estimée (la plus basse du foyer) / 100
  // N'optimiser que les tranches > stopRate (gain PER = TMI_entrée − TMI_sortie)
  const tmiRetD1    = profData.tmiRetraiteD1 ?? 11;
  const tmiRetD2    = profData.tmiRetraiteD2 ?? tmiRetD1;
  const stopRate    = Math.min(tmiRetD1, tmiRetD2) / 100; // foyer : on prend la plus favorable

  // Initialiser sur l'optimum fiscal (effacement de la tranche supérieure)
  const [versementD1, setVersementD1] = useState(() => {
    if (!plafondD1) return 0;
    const opt = computePerOptimumCascade(rniFoyer, parts, plafondD1, plafondD2, isCouple, profData.perCalcD1?.rni || 0, profData.perCalcD2?.rni || 0, stopRate);
    return Math.round((opt.optimumD1 || 0) / 50) * 50;
  });
  const [versementD2, setVersementD2] = useState(() => {
    if (!showTwoSliders || !plafondD2) return 0;
    const opt = computePerOptimumCascade(rniFoyer, parts, plafondD1, plafondD2, isCouple, profData.perCalcD1?.rni || 0, profData.perCalcD2?.rni || 0, stopRate);
    return Math.round((opt.optimumD2 || 0) / 50) * 50;
  });

  const totalVerse = versementD1 + (showTwoSliders ? versementD2 : 0);

  // Sync versements to global state for inter-tab bandeau
  useEffect(() => {
    dispatch({
      type: 'SET_PER_SIMULATION',
      payload: { versementD1, versementD2: showTwoSliders ? versementD2 : 0 },
    });
  }, [versementD1, versementD2, showTwoSliders, dispatch]);

  // Inflection point: amount of RNI in the top bracket
  const { fractionInTopBracket, nextLowerRate } = useMemo(() => {
    const tmiRate  = profData.tmi / 100;
    const tmiIdx   = TRANCHES.findIndex(t => Math.abs(t[2] - tmiRate) < 0.001);
    const tmiEntry = TRANCHES[tmiIdx];
    const seuilPerPart = tmiEntry ? tmiEntry[0] : 0;
    const seuilTotal   = Math.round(seuilPerPart * parts);
    const fraction     = Math.max(0, Math.round(rniFoyer - seuilTotal));
    const nextRate     = tmiIdx > 0 ? Math.round(TRANCHES[tmiIdx - 1][2] * 100) : 0;
    return { fractionInTopBracket: fraction, nextLowerRate: nextRate };
  }, [rniFoyer, parts, profData.tmi]);

  // Real IR calculations
  const res = useMemo(() => {
    const irAvant   = calcIR(rniFoyer, parts, isCouple);
    const irApresD1 = calcIR(Math.max(0, rniFoyer - versementD1), parts, isCouple);
    const rniApres  = Math.max(0, rniFoyer - totalVerse);
    const irApres   = calcIR(rniApres, parts, isCouple);
    const economie  = Math.max(0, irAvant - irApres);
    const economieD1 = Math.max(0, irAvant - irApresD1);
    const economieD2 = Math.max(0, irApresD1 - irApres);
    const effort    = totalVerse - economie;
    const newTMI    = getTMI(rniApres, parts);
    const rendement = totalVerse > 0 ? Math.round((economie / totalVerse) * 100) : 0;
    const bracketBreakdown = computeBracketBreakdown(rniFoyer, totalVerse, parts);
    return { irAvant, rniApres, economie, economieD1, economieD2, effort, newTMI, rendement, bracketBreakdown };
  }, [versementD1, versementD2, rniFoyer, parts, isCouple, totalVerse]);

  // Economy curve chart data
  const chartData = useMemo(() => {
    const irAvant = calcIR(rniFoyer, parts, isCouple);
    const maxV    = Math.max(plafondTotal || 0, fractionInTopBracket, 2000);
    const step    = Math.max(50, Math.round(maxV / 80) * 10);
    const pts     = new Map();
    for (let v = 0; v <= maxV; v += step) {
      pts.set(v, Math.max(0, irAvant - calcIR(Math.max(0, rniFoyer - v), parts, isCouple)));
    }
    pts.set(0, 0);
    if (fractionInTopBracket > 0 && fractionInTopBracket <= maxV) {
      pts.set(fractionInTopBracket, Math.max(0, irAvant - calcIR(Math.max(0, rniFoyer - fractionInTopBracket), parts, isCouple)));
    }
    if (totalVerse > 0 && totalVerse <= maxV) {
      pts.set(totalVerse, Math.max(0, irAvant - calcIR(Math.max(0, rniFoyer - totalVerse), parts, isCouple)));
    }
    return [...pts.entries()].sort((a, b) => a[0] - b[0]).map(([v, e]) => ({ versement: v, economie: e }));
  }, [rniFoyer, parts, isCouple, plafondTotal, fractionInTopBracket, totalVerse]);

  // Auto-optimize: fill top bracket first, prioritize highest-earning declarant (RNI proxy)
  const handleAutoOptimize = () => {
    if (fractionInTopBracket <= 0) return;
    if (showTwoSliders) {
      const rni1 = profData.perCalcD1?.rni || 0;
      const rni2 = profData.perCalcD2?.rni || 0;
      const d1IsPrio = rni1 >= rni2;
      if (d1IsPrio) {
        const d1 = Math.min(plafondD1, fractionInTopBracket);
        const d2 = Math.min(plafondD2, Math.max(0, fractionInTopBracket - d1));
        setVersementD1(Math.round(d1 / 50) * 50);
        setVersementD2(Math.round(d2 / 50) * 50);
      } else {
        const d2 = Math.min(plafondD2, fractionInTopBracket);
        const d1 = Math.min(plafondD1, Math.max(0, fractionInTopBracket - d2));
        setVersementD1(Math.round(d1 / 50) * 50);
        setVersementD2(Math.round(d2 / 50) * 50);
      }
    } else {
      setVersementD1(Math.round(Math.min(plafondD1, fractionInTopBracket) / 50) * 50);
    }
  };

  const topBracketDone = fractionInTopBracket > 0 && totalVerse >= fractionInTopBracket;
  const rendD1 = versementD1 > 0 ? Math.round((res.economieD1 / versementD1) * 100) : 0;
  const rendD2 = versementD2 > 0 ? Math.round((res.economieD2 / versementD2) * 100) : 0;

  const handleChat = () => {
    const bracketInfo = res.bracketBreakdown.map(b => `${fmt(b.amount)} € × ${b.rate} % = ${fmt(b.saving)} €`).join(' + ');
    const msg = showTwoSliders
      ? `PER couple (barème réel 2025) : D1 verse ${fmt(versementD1)} €, D2 verse ${fmt(versementD2)} € (total ${fmt(totalVerse)} €). RNI foyer ${fmt(rniFoyer)} €, ${parts} parts, TMI ${profData.tmi} %. Économie IR réelle : ${fmt(res.economie)} €${bracketInfo ? ` (${bracketInfo})` : ''}. Effort net : ${fmt(res.effort)} €, rendement ${res.rendement} %. Comment choisir nos PER et optimiser la répartition ?`
      : `PER (barème réel 2025) : versement ${fmt(versementD1)} €. RNI ${fmt(rniFoyer)} €, ${parts} part${parts > 1 ? 's' : ''}, TMI ${profData.tmi} %. Économie IR réelle : ${fmt(res.economie)} €${bracketInfo ? ` (${bracketInfo})` : ''}. Effort net : ${fmt(res.effort)} €, rendement ${res.rendement} %. Quels PER recommandes-tu ?`;
    navigate('/chat', { state: { prefill: msg } });
  };

  return (
    <div className="flex flex-col gap-5">

      {/* ── Profile banner ── */}
      <ProfileBanner
        isDefault={profData.isDefault}
        items={[
          { label: 'RNI foyer',                                          value: `${fmt(rniFoyer)} €`   },
          { label: 'TMI foyer',                                          value: `${profData.tmi} %`    },
          { label: showTwoSliders ? 'Plafond foyer' : 'Plafond PER',   value: `${fmt(plafondTotal)} €` },
        ]}
        sub={profData.cehr > 0
          ? `⚠️ CEHR (art. 223 sexies CGI) : ${fmt(profData.cehr)} € — calculée sur RFR ${fmt(profData.rfr)} €`
          : null}
      />

      {/* ── Curseurs D1 + D2 (ou curseur unique) ── */}
      {showTwoSliders ? (
        <div className="flex flex-col gap-5">
          {/* Répartition plafonds D1/D2 */}
          <div className="flex items-center justify-center gap-6 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 px-4 py-2 text-xs text-blue-300">
            <span>Plafond D1&nbsp;: <strong className="font-mono tabular-nums">{fmt(plafondD1)}&nbsp;€</strong></span>
            <span className="text-blue-300">·</span>
            <span>Plafond D2&nbsp;: <strong className="font-mono tabular-nums">{fmt(plafondD2)}&nbsp;€</strong></span>
            <span className="text-blue-300">·</span>
            <span>Total&nbsp;: <strong className="font-mono tabular-nums">{fmt(plafondTotal)}&nbsp;€</strong></span>
          </div>
          {/* D1 */}
          <div className="flex flex-col gap-1.5">
            <SimSlider
              label={`Versement D1 — plafond disponible ${fmt(plafondD1)} €`}
              value={versementD1}
              min={0}
              max={plafondD1}
              step={50}
              onChange={setVersementD1}
              format={v => `${fmt(v)} €`}
            />
            {versementD1 > 0 && (
              <div className="flex items-center justify-end gap-2 text-xs text-kapio-400">
                <span>Économie D1 : <strong className="font-mono">{fmt(res.economieD1)} €</strong></span>
                <span className="text-ink-300">(rendement {rendD1} %)</span>
              </div>
            )}
          </div>
          {/* D2 */}
          <div className="flex flex-col gap-1.5">
            <SimSlider
              label={`Versement D2 — plafond disponible ${fmt(plafondD2)} €`}
              value={versementD2}
              min={0}
              max={plafondD2}
              step={50}
              onChange={setVersementD2}
              format={v => `${fmt(v)} €`}
            />
            {versementD2 > 0 && (
              <div className="flex items-center justify-end gap-2 text-xs text-kapio-400">
                <span>Économie marginale D2 : <strong className="font-mono">{fmt(res.economieD2)} €</strong></span>
                <span className="text-ink-300">(rendement {rendD2} %)</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <SimSlider
          label={`Montant à verser sur le PER — plafond ${fmt(plafondD1)} €`}
          value={versementD1}
          min={0}
          max={plafondD1 || 10_000}
          step={100}
          onChange={setVersementD1}
          format={v => `${fmt(v)} €`}
        />
      )}

      {/* ── Bouton Optimiser / Badge succès ── */}
      {fractionInTopBracket > 0 && plafondTotal > 0 && !topBracketDone && (
        <button
          type="button"
          onClick={handleAutoOptimize}
          className="rounded-xl border border-kapio-500/30 bg-kapio-500/[0.08] hover:bg-kapio-500/[0.12] active:bg-kapio-500/20 px-4 py-2.5 text-xs font-semibold text-kapio-300 transition-colors flex items-center justify-center gap-1.5"
        >
          ⚡ Optimiser — effacer entièrement la tranche {profData.tmi} %
          <span className="ml-1 text-kapio-300">({fmt(Math.min(plafondTotal, fractionInTopBracket))} € nécessaires)</span>
        </button>
      )}
      {topBracketDone && (
        <div className="rounded-xl border border-kapio-500/30 bg-kapio-500/[0.08] px-4 py-2.5 text-xs font-semibold text-kapio-300 flex items-center gap-2">
          ✅ Tranche {profData.tmi} % entièrement effacée.
          {nextLowerRate > 0 && ` Versements supplémentaires s'imputent sur la tranche ${nextLowerRate} %.`}
        </div>
      )}

      {/* ── Résultats foyer ── */}
      <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 overflow-hidden">
        <div className="px-4 py-3 bg-ink-900/40 border-b border-white/[0.06] flex items-center justify-between">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">Impact fiscal foyer</p>
          <span className="text-xs font-mono text-ink-300">
            {showTwoSliders ? `D1 ${fmt(versementD1)} + D2 ${fmt(versementD2)} =` : 'Versement :'} {fmt(totalVerse)} €
          </span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {[
            { label: 'Économie IR totale (barème réel)', value: `${fmt(res.economie)} €`, color: 'text-kapio-300', hi: true },
            { label: 'Effort net réel (versé − économie)', value: `${fmt(res.effort)} €`, color: 'text-ink-0' },
            { label: 'RNI foyer résiduel', value: `${fmt(res.rniApres)} €`, color: 'text-ink-0' },
            { label: 'Rendement fiscal', value: `${res.rendement} %`, color: 'text-kapio-400' },
          ].map(({ label, value, color, hi }) => (
            <div key={label} className={`flex items-center justify-between px-4 py-3 ${hi ? 'bg-kapio-500/[0.05]' : ''}`}>
              <span className="text-sm text-ink-200">{label}</span>
              <span className={`text-sm font-bold font-mono tabular-nums ${color}`}>{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-ink-200">TMI résiduelle après PER</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-mono text-ink-300">{profData.tmi} %</span>
              <ChevronRight size={12} className="text-gray-300" />
              <span className={`text-sm font-bold font-mono tabular-nums ${res.newTMI < profData.tmi ? 'text-kapio-400' : 'text-ink-0'}`}>
                {res.newTMI} %{res.newTMI < profData.tmi ? ' ✨' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Décomposition par tranche ── */}
      {totalVerse > 0 && res.bracketBreakdown.length > 0 && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-blue-500/20 bg-blue-500/[0.08]">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Décomposition par tranche</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {res.bracketBreakdown.map(({ rate, amount, saving }) => (
              <div key={rate} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-10 text-right font-bold text-blue-400 font-mono text-xs shrink-0">{rate} %</span>
                  <span className="text-xs text-ink-200">{fmt(amount)} € effacés dans cette tranche</span>
                </div>
                <span className="text-xs font-bold text-kapio-300 font-mono">→ {fmt(saving)} €</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-blue-500/[0.04]">
              <span className="text-xs font-bold text-ink-100">Économie totale réelle</span>
              <span className="text-sm font-bold text-kapio-300 font-mono">{fmt(res.economie)} €</span>
            </div>
          </div>
          {res.bracketBreakdown.length > 1 && (
            <div className="px-4 py-2 border-t border-blue-500/20">
              <p className="text-[10px] text-blue-400">
                ≠ {fmt(totalVerse)} € × {profData.tmi} % = {fmt(Math.round(totalVerse * profData.tmi / 100))} €
                {' '}(méthode TMI fixe — incorrecte car {res.bracketBreakdown.length} tranches traversées)
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Courbe d'économie IR ── */}
      {chartData.length > 2 && (
        <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 p-4">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest mb-1">Courbe d'économie IR</p>
          {fractionInTopBracket > 0 && plafondTotal > fractionInTopBracket && (
            <p className="text-[10px] text-warning-400 mb-3 leading-snug">
              Rupture de pente à {fmt(fractionInTopBracket)} € : tranche {profData.tmi} % entièrement effacée
              {nextLowerRate > 0 && ` → rendement passe à ${nextLowerRate} %`}
            </p>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="versement"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={v => `${Math.round(v / 1000)}k€`}
                width={42}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-xl border border-white/[0.08] bg-ink-900 shadow-2xl border border-white/[0.06] p-3 text-xs">
                      <p className="font-bold text-ink-100">Versement : {fmt(payload[0].payload.versement)} €</p>
                      <p className="text-kapio-300 font-bold">Économie IR : {fmt(payload[0].value)} €</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="economie" stroke="#0d9488" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#0d9488' }} name="Économie IR" />
              {fractionInTopBracket > 0 && fractionInTopBracket <= Math.max(plafondTotal, fractionInTopBracket) && (
                <ReferenceLine
                  x={fractionInTopBracket}
                  stroke="#D68910"
                  strokeDasharray="5 3"
                  label={{ value: `${profData.tmi}%→${nextLowerRate}%`, position: 'insideTopRight', fontSize: 9, fill: '#D68910', offset: 5 }}
                />
              )}
              {totalVerse > 0 && (
                <ReferenceLine
                  x={totalVerse}
                  stroke="#0d9488"
                  strokeDasharray="3 3"
                  label={{ value: `${fmt(res.economie)} €`, position: 'insideTopLeft', fontSize: 9, fill: '#0d9488' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Bloc pédagogique ── */}
      <details className="rounded-2xl border border-white/[0.06] bg-ink-800/60 overflow-hidden group">
        <summary className="px-5 py-3.5 text-xs font-bold text-ink-300 uppercase tracking-widest cursor-pointer flex items-center justify-between select-none hover:bg-ink-700/40 transition-colors">
          <span>Comment fonctionne le PER fiscalement ?</span>
          <span className="text-ink-300 text-[10px] group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="px-5 py-4 flex flex-col gap-3 text-xs text-ink-100 leading-relaxed border-t border-white/[0.06]">
          <p>
            <strong>Principe :</strong> chaque euro versé sur un PER réduit directement le revenu net imposable.
            L'économie d'IR dépend de la tranche dans laquelle ce versement s'impute.
          </p>
          <p>
            <strong>Règle d'imputation :</strong> les versements s'imputent en priorité sur la{' '}
            <em>tranche marginale la plus haute</em>. L'économie par euro versé = taux de la tranche effacée.
          </p>
          {fractionInTopBracket > 0 && rniFoyer > 0 && (
            <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/20 px-4 py-3">
              <p className="font-semibold text-blue-300 mb-2">Votre profil — calcul détaillé</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-blue-300">
                <span>RNI foyer avant PER</span>
                <span className="font-mono text-right">{fmt(rniFoyer)} €</span>
                <span>Seuil tranche {profData.tmi} % ({parts} part{parts > 1 ? 's' : ''})</span>
                <span className="font-mono text-right">{fmt(Math.round(rniFoyer - fractionInTopBracket))} €</span>
                <span className="font-semibold border-t border-white/[0.06] pt-1 mt-0.5">Fraction dans la tranche {profData.tmi} %</span>
                <span className="font-mono font-bold text-right border-t border-white/[0.06] pt-1 mt-0.5">{fmt(fractionInTopBracket)} €</span>
              </div>
              <div className="mt-3 pt-2 border-t border-white/[0.06] space-y-1.5 text-ink-200">
                <p>→ Pour effacer entièrement la tranche {profData.tmi} % : verser <strong>{fmt(fractionInTopBracket)} €</strong></p>
                <p>→ Économie : {fmt(fractionInTopBracket)} × {profData.tmi} % = <strong>{fmt(Math.round(fractionInTopBracket * profData.tmi / 100))} €</strong></p>
                {nextLowerRate > 0 && (
                  <p className="text-blue-400">
                    → Au-delà de {fmt(fractionInTopBracket)} €, chaque euro s'impute sur la tranche{' '}
                    {nextLowerRate} % → économie = {nextLowerRate} centimes par euro versé
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* ── Actions ── */}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1"
          onClick={() => saveSimulation(`PER — ${fmt(totalVerse)} € → économie ${fmt(res.economie)} €`)}>
          <Save size={13} /> Sauvegarder
        </Button>
        <Button variant="primary" size="sm" className="flex-1" onClick={handleChat}>
          <MessageCircle size={13} /> Discuter de cette simulation
        </Button>
      </div>

      <p className="text-[10px] text-ink-300 text-center leading-relaxed">
        Barème progressif réel 2025 · {parts} part{parts > 1 ? 's' : ''} fiscale{parts > 1 ? 's' : ''}
        {showTwoSliders ? ` · Plafond foyer ${fmt(plafondTotal)} €` : ` · Plafond ${fmt(plafondD1)} €`}
      </p>
    </div>
  );
}

// ─── Simulateur Enveloppes ────────────────────────────────────────────────────

/**
 * Détermine quel déclarant utiliser pour la simulation PER vs enveloppes.
 * Règle : plus haut RNI individuel = plus gros salaire = TMI la plus haute = économie PER max.
 * Fallback brut si disponible, puis RNI, puis tie → D1.
 * Cas limite : si plafond du prioritaire = 0 (PERO/PERCO sature), bascule sur l'autre avec avertissement.
 */
function getPerEnvInfo(data) {
  const { isCouple, perCalcD1, perCalcD2 } = data;

  if (!isCouple || !perCalcD1 || !perCalcD2) {
    return { declarant: null, plafond: Math.max(perCalcD1?.plafondNet || data.plafond || 10_000, 1_000), fallback: false, fallbackReason: null };
  }

  const brutD1 = data.salairesBrutD1 || 0;
  const brutD2 = data.salairesBrutD2 || 0;
  const rni1   = perCalcD1.rni || 0;
  const rni2   = perCalcD2.rni || 0;

  let primary;
  if      (brutD1 > 0 || brutD2 > 0) primary = brutD1 >= brutD2 ? 'D1' : 'D2';
  else if (rni1 > rni2)               primary = 'D1';
  else if (rni2 > rni1)               primary = 'D2';
  else                                primary = 'D1';

  const primaryCalc   = primary === 'D1' ? perCalcD1 : perCalcD2;
  const secondary     = primary === 'D1' ? 'D2' : 'D1';
  const secondaryCalc = primary === 'D1' ? perCalcD2 : perCalcD1;

  if (primaryCalc.plafondNet === 0) {
    return {
      declarant: secondary,
      plafond: Math.max(secondaryCalc.plafondNet, 1_000),
      fallback: true,
      fallbackReason: `Le plafond de ${primary} est entièrement consommé par les cotisations obligatoires. Simulation effectuée avec le plafond de ${secondary} — l'économie fiscale sera calculée sur la TMI de ${secondary}.`,
    };
  }
  return { declarant: primary, plafond: Math.max(primaryCalc.plafondNet, 1_000), fallback: false, fallbackReason: null };
}

// ─── Note méthodologique taux ─────────────────────────────────────────────────

function RateExplainerTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        aria-label="Convention de taux"
        className="text-ink-300 hover:text-kapio-400 transition-colors ml-1 leading-none"
      >
        ⓘ
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-72 rounded-xl border border-white/[0.08] bg-ink-900 shadow-2xl border border-white/[0.06] p-3.5 text-xs leading-relaxed text-ink-100">
          <p className="font-bold text-ink-0 mb-2">Convention de taux</p>
          <p>
            Le rendement saisi est interprété comme{' '}
            <strong>taux annuel équivalent</strong> : 5 % saisi = 5,000 % réellement appliqué chaque année.
          </p>
          <p className="mt-2">
            Certains simulateurs (Finary, Boursorama) utilisent un{' '}
            <strong>taux nominal proportionnel</strong> (5 % / 12 par mois), qui produit en réalité
            un rendement annuel effectif de 5,116 %. Sur 20 ans, cela gonfle le capital final
            d'environ +1,4 %.
          </p>
          <p className="mt-2 text-kapio-300 font-medium">
            Coach-fiscal privilégie la rigueur : le taux saisi est le taux réel.
          </p>
        </div>
      )}
    </span>
  );
}

function SimEnveloppes({ data }) {
  const navigate = useNavigate();
  const tmiProfile = data.tmi || 30; // TMI entrée depuis le profil

  const perEnvInfo = useMemo(() => getPerEnvInfo(data), [data]);

  const [capital,    setCapital]    = useState(10_000);
  const [mensualite, setMensualite] = useState(0);          // 0 = versement unique ; > 0 = mensuel
  const [duration,   setDuration]   = useState(20);
  const [rate,       setRate]       = useState(0.05);
  const [tmiE,       setTmiE]       = useState(tmiProfile); // TMI à l'entrée (prérempli)
  const [tmiS,       setTmiS]       = useState(data.tmiRetraiteD1 ?? 11);
  const [reinvest,   setReinvest]   = useState(true);       // réinvestir l'économie IR en PEA
  const [selectedEnvId, setSelectedEnvId] = useState(null); // null → suit bestId

  const isCouple = data.isCouple ?? false;
  const tmiDiff  = tmiE - tmiS;
  // AV versements nets cumulés — seuil 150 000 € (art. 125-0 A CGI)
  // Simulation au niveau foyer : somme D1 + D2
  const avVerse  = (data.avVerseD1 || 0) + (data.avVerseD2 || 0);

  // Calcul détaillé par enveloppe (brut, impôts, net, gain, bonus PER)
  const tableRows = useMemo(
    () => ENVELOPES.map(env => ({ ...env, ...envDetail(env.id, capital, rate, duration, tmiE, tmiS, reinvest, isCouple, avVerse, mensualite) })),
    [capital, mensualite, rate, duration, tmiE, tmiS, reinvest, isCouple, avVerse]
  );

  const bestId = useMemo(
    () => tableRows.reduce((b, r) => r.net > b.net ? r : b, tableRows[0])?.id,
    [tableRows]
  );

  const bestRow    = tableRows.find(r => r.id === bestId) ?? tableRows[0];
  const activeEnvId = selectedEnvId ?? bestId;

  const evolutionData = useMemo(() => {
    return Array.from({ length: duration + 1 }, (_, y) => {
      const vers = capital + mensualite * 12 * y;
      const net  = envNet(activeEnvId, capital, rate, y, tmiE, tmiS, reinvest, isCouple, avVerse, mensualite);
      return { year: y, versements: Math.round(vers), interets: Math.max(0, Math.round(net - vers)) };
    });
  }, [activeEnvId, capital, mensualite, rate, duration, tmiE, tmiS, reinvest, isCouple, avVerse]);

  // Point de croisement PER / PEA
  const crossoverYear = useMemo(
    () => perCrossover(capital, rate, tmiE, tmiS, reinvest, isCouple, 60, avVerse, mensualite),
    [capital, mensualite, rate, tmiE, tmiS, reinvest, isCouple, avVerse]
  );

  const chartData = useMemo(() => {
    const step = duration <= 10 ? 1 : duration <= 20 ? 2 : 5;
    const pts = new Map();
    for (let y = 0; y <= duration; y += step) pts.set(y, y);
    if (duration >= 5) pts.set(5, 5);
    if (crossoverYear && crossoverYear <= duration) pts.set(crossoverYear, crossoverYear);
    return [...pts.values()].sort((a, b) => a - b).map(y => {
      const pt = { année: y };
      // Brut = capitalisation totale avant impôts (versement unique + mensualités)
      // brutEnv avec id != 'livretA' → utilise le taux du curseur (pas le 3% légal)
      pt['Brut'] = Math.round((capital > 0 ? capital * Math.pow(1 + rate, y) : 0) + fvMensuel(mensualite, rate, y));
      for (const env of ENVELOPES) {
        pt[env.name] = Math.round(envNet(env.id, capital, rate, y, tmiE, tmiS, reinvest, isCouple, avVerse, mensualite));
      }
      return pt;
    });
  }, [capital, mensualite, rate, duration, tmiE, tmiS, reinvest, isCouple, avVerse, crossoverYear]);

  const formatY = v => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
    return `${v}`;
  };

  // Message contextuel PER vs PEA
  const perRow  = tableRows.find(r => r.id === 'per');
  const peaRow  = tableRows.find(r => r.id === 'pea');
  const perWins = (perRow?.net ?? 0) > (peaRow?.net ?? 0);
  const totalInvesti = capital + mensualite * 12 * duration;
  const econoIR = Math.round((capital + mensualite * 12) * tmiE / 100); // économie annuelle estimée

  const contextMsg = (() => {
    if (tmiE <= 11) return {
      color: 'amber',
      text: `À TMI ${tmiE} %, l'avantage fiscal du PER est insuffisant pour compenser son manque de liquidité. Le PEA est recommandé dans ce cas.`,
    };
    if (perWins) return {
      color: 'teal',
      text: `Le PER est plus performant que le PEA sur ${duration} ans grâce à l'économie fiscale immédiate de ${fmt(econoIR)} € (TMI ${tmiE} %) réinvestie sur ${duration} ans. Condition clé : TMI estimée à la retraite ${tmiS} %.`,
    };
    if (crossoverYear) return {
      color: 'blue',
      text: crossoverYear <= duration
        ? `Le PEA est plus performant sur ${duration} ans. Le PER devient gagnant à partir de ${crossoverYear} ans${tmiDiff > 0 ? ` grâce au différentiel fiscal de ${tmiDiff} %` : ''}.`
        : `Le PEA reste plus performant sur ${duration} ans. Le PER deviendrait gagnant après ${crossoverYear} ans — horizon trop long. Pour réduire ce seuil : allonger la durée ou réduire TMI sortie.`,
    };
    if (tmiE === tmiS) return {
      color: 'gray',
      text: `TMI entrée = TMI sortie (${tmiE} %) : l'avantage PER se réduit à la déductibilité immédiate seule. Les PS identiques sur les gains désavantagent légèrement le PER vs PEA.`,
    };
    return {
      color: 'gray',
      text: `Avec ces hypothèses, le PEA surpasse le PER sur ${duration} ans. Réduire la TMI sortie ou allonger la durée peut inverser le résultat.`,
    };
  })();

  const handleChat = () => {
    const best = tableRows.find(r => r.id === bestId);
    const msg = `Simulation enveloppes : ${fmt(capital)} € investis pendant ${duration} ans à ${(rate * 100).toFixed(0)} % annuels. TMI entrée ${tmiE} %, TMI sortie (retraite) ${tmiS} %. Réinvestissement économie IR : ${reinvest ? 'oui' : 'non'}. Meilleure option : ${best?.name} avec ${fmt(best?.net || 0)} € nets.${crossoverYear ? ` PER dépasse PEA à ${crossoverYear} ans.` : ''} Peux-tu confirmer et m'aider à choisir ?`;
    navigate('/chat', { state: { prefill: msg } });
  };

  const colorMap = { teal: 'border-kapio-500/30 bg-kapio-500/[0.08] text-kapio-300', amber: 'border-warning-500/30 bg-warning-500/[0.08] text-warning-300', blue: 'border-blue-500/30 bg-blue-500/[0.08] text-blue-300', gray: 'border-white/[0.06] bg-ink-800/60 text-ink-200' };

  return (
    <div className="flex flex-col gap-5">

      {/* Paramètres généraux */}
      <div className="flex flex-col gap-4">
        <SimSlider label="Capital à investir" value={capital} min={1_000} max={100_000} step={1_000}
          onChange={setCapital} format={v => `${fmt(v)} €`} />
        <SimSlider
          label={mensualite > 0
            ? `Versements mensuels — ${fmt(mensualite)} €/mois × ${duration} ans = ${fmt(mensualite * 12 * duration)} € investis`
            : 'Versements mensuels — désactivé (versement unique)'}
          value={mensualite}
          min={0}
          max={5_000}
          step={100}
          onChange={setMensualite}
          format={v => v > 0 ? `${fmt(v)} €/mois` : 'Versement unique'}
        />
        {/* Info déclarant PER — visible en mode couple uniquement */}
        {perEnvInfo.declarant && (
          <div className={`rounded-lg border px-3 py-2 text-[11px] leading-snug ${perEnvInfo.fallback ? 'border-warning-500/30 bg-warning-500/[0.08] text-warning-300' : 'border-blue-500/20 bg-blue-500/[0.06] text-blue-300'}`}>
            {perEnvInfo.fallback
              ? perEnvInfo.fallbackReason
              : `PER simulé sur le plafond de ${perEnvInfo.declarant} (salaire le plus élevé) : ${fmt(perEnvInfo.plafond)} €. Réglez le capital à cette valeur pour comparer à votre plafond réel.`}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <ToggleGroup label="Durée de placement" options={DURATIONS} value={duration}
            onChange={setDuration} format={v => `${v} ans`} />
          <ToggleGroup
            label={<span className="flex items-center">Rendement annuel estimé<RateExplainerTooltip /></span>}
            options={RATES} value={rate}
            onChange={setRate} format={v => `${(v * 100).toFixed(0)} %`}
          />
        </div>
      </div>

      {/* Paramètres PER */}
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/[0.08] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-violet-300 uppercase tracking-wide">Hypothèses PER</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tmiDiff > 0 ? 'bg-kapio-500/20 text-kapio-300' : tmiDiff < 0 ? 'bg-red-500/20 text-red-400' : 'bg-ink-700 text-ink-200'}`}>
            Différentiel fiscal : {tmiDiff > 0 ? '+' : ''}{tmiDiff} %
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <ToggleGroup label={`TMI à l'entrée (profil : ${tmiProfile} %)`} options={TMI_OPTIONS} value={tmiE}
              onChange={setTmiE} format={v => `${v} %`} />
          </div>
          <div>
            <ToggleGroup label="TMI à la sortie (retraite)" options={TMI_OPTIONS} value={tmiS}
              onChange={setTmiS} format={v => `${v} %`} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-violet-500/30">
          <span className="text-xs text-violet-300">Réinvestir l'économie IR ({fmt(econoIR)} €) en PEA</span>
          <button
            type="button"
            onClick={() => setReinvest(v => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${reinvest ? 'bg-kapio-500' : 'bg-ink-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${reinvest ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        {!reinvest && (
          <p className="text-[10px] text-violet-400 italic">Sans réinvestissement : l'économie IR reste en trésorerie — l'avantage PER est sous-estimé.</p>
        )}
      </div>

      {/* Message contextuel */}
      <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${colorMap[contextMsg.color]}`}>
        {contextMsg.text}
      </div>

      {/* Headline style Finary — meilleure enveloppe */}
      <div className="rounded-2xl border border-kapio-500/20 bg-kapio-500/[0.06] p-5">
        <p className="text-[10px] font-semibold text-kapio-300 uppercase tracking-widest mb-1">
          Capital net · {bestRow.name}
        </p>
        <p className="text-4xl font-bold text-ink-0 font-mono tabular-nums leading-none mb-3">
          {fmt(bestRow.net)} €
        </p>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-[10px] text-ink-300 mb-0.5">Versements</p>
            <p className="font-bold text-ink-100 font-mono tabular-nums">{fmt(bestRow.pTotal)} €</p>
          </div>
          <span className="text-ink-400">·</span>
          <div>
            <p className="text-[10px] text-ink-300 mb-0.5">Intérêts nets</p>
            <p className="font-bold text-kapio-400 font-mono tabular-nums">+{fmt(bestRow.gain)} €</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 overflow-hidden">
        <div className="px-4 py-3 bg-ink-900/40 border-b border-white/[0.06]">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">
            Comparatif après {duration} ans — {fmt(capital)} € à {(rate * 100).toFixed(0)} % — TMI entrée {tmiE} % / sortie {tmiS} %
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] bg-ink-900/30">
                <th className="text-left px-4 py-2 text-ink-300 font-semibold">Enveloppe</th>
                <th className="text-right px-3 py-2 text-ink-300 font-semibold whitespace-nowrap">Brut avant impôt</th>
                <th className="text-right px-3 py-2 text-ink-300 font-semibold whitespace-nowrap">Impôts / prél.</th>
                <th className="text-right px-3 py-2 text-ink-300 font-semibold whitespace-nowrap">Capital net</th>
                <th className="text-right px-3 py-2 text-ink-300 font-semibold whitespace-nowrap">Gain net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {tableRows.map(row => (
                <Fragment key={row.id}>
                  <tr className={row.id === bestId ? 'bg-kapio-500/[0.08]' : 'hover:bg-ink-700/40 transition-colors'}>
                    <td className="px-4 pt-3 pb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: row.color }} />
                        <span className="font-semibold text-ink-0">{row.name}</span>
                        {row.id === bestId && (
                          <span className="text-[9px] font-bold text-kapio-300 bg-kapio-500/20 px-1.5 py-0.5 rounded-full">Meilleur</span>
                        )}
                      </div>
                      <div className="text-[10px] text-ink-300 mt-0.5 ml-4">{row.taxLabel}</div>
                    </td>
                    <td className="px-3 pt-3 pb-1 text-right font-mono tabular-nums text-ink-300 whitespace-nowrap">
                      {fmt(row.brut)} €
                    </td>
                    <td className="px-3 pt-3 pb-1 text-right font-mono tabular-nums whitespace-nowrap">
                      {row.tax > 0
                        ? <span className="text-red-500">−{fmt(row.tax)} €</span>
                        : <span className="text-kapio-400 font-semibold">0 €</span>}
                      {row.id === 'per' && row.bonus > 0 && (
                        <div className="text-[10px] text-violet-400 whitespace-nowrap">+{fmt(row.bonus)} € boost</div>
                      )}
                    </td>
                    <td className="px-3 pt-3 pb-1 text-right font-bold font-mono tabular-nums text-ink-0 whitespace-nowrap">
                      {fmt(row.net)} €
                    </td>
                    <td className={`px-3 pt-3 pb-1 text-right font-bold font-mono tabular-nums whitespace-nowrap ${row.gain >= 0 ? 'text-kapio-400' : 'text-red-500'}`}>
                      {row.gain >= 0 ? '+' : ''}{fmt(row.gain)} €
                    </td>
                  </tr>
                  {/* Sous-ligne décomposition Versements / Intérêts */}
                  <tr className={row.id === bestId ? 'bg-kapio-500/[0.05]' : ''}>
                    <td colSpan={5} className="px-4 pb-2.5 pt-0">
                      <span className="text-[10px] text-ink-300 ml-4">
                        Versements&nbsp;
                        <span className="font-semibold" style={{ color: '#5B7CFA' }}>{fmt(row.pTotal)} €</span>
                        &nbsp;·&nbsp;
                        Intérêts bruts&nbsp;
                        <span className="font-semibold text-ink-300">{fmt(row.brut - row.pTotal)} €</span>
                        &nbsp;·&nbsp;
                        Intérêts nets&nbsp;
                        <span className="font-semibold" style={{ color: '#F5A623' }}>{fmt(row.gain)} €</span>
                      </span>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {crossoverYear && (
          <p className="px-4 py-2.5 text-[11px] text-violet-300 bg-violet-500/[0.06] border-t border-violet-500/20">
            {crossoverYear <= duration
              ? `✓ PER dépasse PEA à ${crossoverYear} ans sur ce graphe`
              : `ℹ PER dépasserait PEA à ${crossoverYear} ans (au-delà de l'horizon affiché)`}
          </p>
        )}
      </div>

      {/* EvolutionChart — aire empilée versements + intérêts nets */}
      <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">
            Évolution — versements vs intérêts
          </p>
          <div className="flex gap-1 flex-wrap">
            {ENVELOPES.map(env => (
              <button
                key={env.id}
                type="button"
                onClick={() => setSelectedEnvId(env.id)}
                className={[
                  'px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all border',
                  activeEnvId === env.id
                    ? 'text-white border-transparent'
                    : 'text-ink-300 border-white/[0.08] bg-transparent hover:text-ink-200',
                ].join(' ')}
                style={activeEnvId === env.id ? { background: env.color, borderColor: env.color } : {}}
              >
                {env.name}
              </button>
            ))}
          </div>
        </div>
        <EvolutionChart data={evolutionData} height={window.innerWidth < 640 ? 200 : 280} />
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 p-4">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">Évolution du capital net</p>
        </div>
        {/* Brut reference callout */}
        <div className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-lg bg-ink-900/40 border border-white/[0.06]">
          <span className="flex-shrink-0 w-6 border-t-2 border-dashed border-ink-400" />
          <span className="text-[11px] text-ink-300">
            Intérêts composés bruts (avant impôts) à {(rate * 100).toFixed(0)} % sur {duration} ans :{' '}
            <span className="font-mono font-bold text-ink-100">
              {fmt((capital > 0 ? capital * Math.pow(1 + rate, duration) : 0) + fvMensuel(mensualite, rate, duration))} €
            </span>
            {mensualite > 0 && (
              <span className="text-ink-300"> · capital {fmt(capital)} € + {fmt(mensualite)} €/mois</span>
            )}
            {' '}— les courbes colorées = net après fiscalité
          </span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="année" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `${v}a`} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={formatY} width={38} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            {crossoverYear && crossoverYear <= duration && (
              <ReferenceLine x={crossoverYear} stroke="#8b5cf6" strokeDasharray="4 2"
                label={{ value: `PER=PEA (${crossoverYear}a)`, position: 'top', fontSize: 9, fill: '#a78bfa' }} />
            )}
            {/* Ligne brute intérêts composés — référence visuelle (hors légende) */}
            <Line key="brut" type="monotone" dataKey="Brut" stroke="#9ca3af"
              strokeWidth={1.5} strokeDasharray="6 3" dot={false} activeDot={{ r: 3 }}
              name="Brut (sans impôts)" legendType="none" />
            {ENVELOPES.map(env => (
              <Line key={env.id} type="monotone" dataKey={env.name} stroke={env.color}
                strokeWidth={env.id === bestId ? 2.5 : 1.5} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-ink-300 text-center mt-2">
          Livret A taux garanti 3 % (non lié au curseur). PEA : PS 17,2 % sur gains (≥5 ans) · PFU 30 % avant.
          AV&gt;8 ans : PS 17,2 % + IR 7,5 % sur gains &gt; {isCouple ? '9 200' : '4 600'} € (abattement {isCouple ? 'couple' : 'solo'}).
          CTO : PFU 30 % sur gains.
          PER : IR {tmiS} % sur la totalité + PS 17,2 % sur plus-values{reinvest ? ` + bonus ${fmt(econoIR)} € réinvesti en PEA` : ''}.
          Simulation en capital unique (rente exclue).
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1"
          onClick={() => saveSimulation(`Enveloppes — ${fmt(capital)} € × ${duration} ans — TMI e:${tmiE}% s:${tmiS}%`)}>
          <Save size={13} /> Sauvegarder
        </Button>
        <Button variant="primary" size="sm" className="flex-1" onClick={handleChat}>
          <MessageCircle size={13} /> Discuter de cette simulation
        </Button>
      </div>
    </div>
  );
}

// ─── Simulateur Foncier ───────────────────────────────────────────────────────

function SimFoncier({ data }) {
  const navigate = useNavigate();
  const tmi = data.tmi;

  const [loyers,  setLoyers]  = useState(12_000);
  const [charges, setCharges] = useState(30);
  const [regime,  setRegime]  = useState('micro');

  const res = useMemo(() => {
    const microNet  = loyers * 0.70;
    const reelNet   = loyers * (1 - charges / 100);
    const net       = regime === 'micro' ? microNet : reelNet;
    const ir        = Math.round(net * (tmi / 100));
    const ps        = Math.round(net * 0.172);
    const total     = ir + ps;
    const tauxEff   = loyers > 0 ? Math.round((total / loyers) * 100) : 0;
    const optimal   = microNet <= reelNet ? 'micro' : 'reel';
    return { microNet, reelNet, net, ir, ps, total, tauxEff, optimal };
  }, [loyers, charges, regime, tmi]);

  const isOptimal = regime === res.optimal;

  const handleChat = () => {
    const msg = `Simulation foncier : loyers annuels ${fmt(loyers)} €, charges ${charges} %, régime ${regime === 'micro' ? 'micro-foncier (abattement 30 %)' : 'réel'}. Revenu net imposable : ${fmt(res.net)} €, IR : ${fmt(res.ir)} €, PS : ${fmt(res.ps)} €, coût fiscal total : ${fmt(res.total)} € (${res.tauxEff} % des loyers). Le régime ${res.optimal === 'micro' ? 'micro-foncier' : 'réel'} semble optimal. Peux-tu valider et affiner cette analyse ?`;
    navigate('/chat', { state: { prefill: msg } });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <SimSlider
          label="Loyers annuels bruts"
          value={loyers}
          min={0}
          max={50_000}
          step={500}
          onChange={setLoyers}
          format={v => `${fmt(v)} €`}
        />
        <ToggleGroup
          label="Régime fiscal"
          options={['micro', 'reel']}
          value={regime}
          onChange={setRegime}
          format={v => v === 'micro' ? 'Micro-foncier' : 'Régime réel'}
        />
        <SimSlider
          label="Charges réelles en % des loyers"
          value={charges}
          min={0}
          max={100}
          step={5}
          onChange={setCharges}
          format={v => `${v} %`}
        />
      </div>

      {/* Recommandation régime */}
      <div className={`rounded-xl px-4 py-2.5 border text-xs flex items-start gap-2 ${
        isOptimal
          ? 'bg-kapio-500/[0.08] border-kapio-500/30 text-kapio-300'
          : 'bg-warning-500/[0.08] border-warning-500/30 text-warning-300'
      }`}>
        <span className="mt-0.5 shrink-0">{isOptimal ? '✅' : '⚠️'}</span>
        <span>
          {isOptimal
            ? `Vous êtes au régime optimal. ${charges > 30 ? 'Vos charges (>' + charges + ' %) justifient le régime réel.' : 'L\'abattement forfaitaire 30 % est suffisant.'}`
            : `Le ${res.optimal === 'micro' ? 'micro-foncier' : 'régime réel'} serait plus avantageux — charges ${charges > 30 ? 'supérieures' : 'inférieures'} à 30 %, ${charges > 30 ? 'le réel permet de déduire davantage' : 'l\'abattement forfaitaire est plus généreux'}.`
          }
        </span>
      </div>

      {/* Résultats */}
      <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 overflow-hidden">
        <div className="px-4 py-3 bg-ink-900/40 border-b border-white/[0.06]">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">Impact fiscal</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-ink-200">
              {regime === 'micro' ? 'Abattement forfaitaire 30 %' : `Déduction charges (${charges} %)`}
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-kapio-400">
              − {fmt(regime === 'micro' ? loyers * 0.30 : loyers * charges / 100)} €
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-ink-200">Revenu net imposable</span>
            <span className="text-sm font-bold font-mono tabular-nums text-ink-0">{fmt(res.net)} €</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-ink-200">IR supplémentaire (TMI {tmi} %)</span>
            <span className="text-sm font-bold font-mono tabular-nums text-red-500">{fmt(res.ir)} €</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-ink-200">Prélèvements sociaux (17,2 %)</span>
            <span className="text-sm font-bold font-mono tabular-nums text-red-500">{fmt(res.ps)} €</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-red-500/[0.05]">
            <span className="text-sm font-semibold text-ink-100">Coût fiscal total</span>
            <div className="text-right">
              <span className="text-sm font-bold font-mono tabular-nums text-red-400">{fmt(res.total)} €</span>
              <span className="text-[10px] text-ink-300 ml-2">({res.tauxEff} % des loyers)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comparaison micro vs réel */}
      <div className="grid grid-cols-2 gap-3">
        {(['micro', 'reel']).map(r => {
          const net = r === 'micro' ? res.microNet : res.reelNet;
          const tot = Math.round(net * (tmi / 100)) + Math.round(net * 0.172);
          const isBest = r === res.optimal;
          return (
            <div key={r} className={`rounded-2xl border p-3.5 ${isBest ? 'border-kapio-500/30 bg-kapio-500/[0.06]' : 'border-white/[0.06] bg-ink-800/60'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${isBest ? 'text-kapio-400' : 'text-ink-300'}`}>
                {r === 'micro' ? 'Micro-foncier' : 'Régime réel'}
                {isBest && ' ✓'}
              </p>
              <p className="text-xs text-ink-300">
                Net imposable : <span className="font-bold text-ink-100 font-mono">{fmt(net)} €</span>
              </p>
              <p className="text-xs text-ink-300 mt-0.5">
                Coût fiscal : <span className="font-bold text-red-500 font-mono">{fmt(tot)} €</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1"
          onClick={() => saveSimulation(`Foncier — ${fmt(loyers)} € loyers, ${regime}, coût fiscal ${fmt(res.total)} €`)}>
          <Save size={13} /> Sauvegarder
        </Button>
        <Button variant="primary" size="sm" className="flex-1" onClick={handleChat}>
          <MessageCircle size={13} /> Discuter de cette simulation
        </Button>
      </div>

      <p className="text-[10px] text-ink-300 text-center">
        Simulation indicative. Loyers meublés (BIC/LMNP) non inclus dans ce simulateur.
      </p>
    </div>
  );
}

// ─── Simulateur Frais Réels ───────────────────────────────────────────────────

/**
 * Barème kilométrique officiel 2024 (revenus 2024, déclaration 2025).
 * Source : impôts.gouv.fr — arrêté du 22 février 2023, maintenu pour 2024.
 *
 *   ≤ 5 000 km          : d × a
 *   5 001 → 20 000 km   : (d × b) + forfait
 *   > 20 000 km         : d × c
 *
 * Majoration véhicule électrique : +20 % (art. 6 B annexe IV CGI).
 * Repas pris hors domicile (sans cantine, sans mode de restauration sur le
 * lieu de travail) : déduction par repas plafonnée à 21,10 € − 5,35 € = 15,75 €
 * (BOI-RSA-BASE-30-50-30-20 §90).
 */
const BAREME_KM_2024 = {
  3: { a: 0.529, b: 0.316, f: 1065, c: 0.370 },
  4: { a: 0.606, b: 0.340, f: 1330, c: 0.407 },
  5: { a: 0.636, b: 0.357, f: 1395, c: 0.427 },
  6: { a: 0.665, b: 0.374, f: 1457, c: 0.447 },
  7: { a: 0.697, b: 0.394, f: 1515, c: 0.470 },
};
const REPAS_FORFAIT_DOMICILE  = 5.35;  // valeur forfaitaire repas pris chez soi 2024
const REPAS_PLAFOND_JOUR      = 21.10; // plafond indemnité repas 2024
const REPAS_DEDUC_MAX         = REPAS_PLAFOND_JOUR - REPAS_FORFAIT_DOMICILE; // 15,75 €
const ABAT_10_MIN             = 509;
const ABAT_10_MAX             = 14_555;
// Forfait télétravail DGFiP : 2,70 €/jour de télétravail effectif, plafond 626,40 €/an.
// L'allocation employeur déjà exonérée doit être déduite de cette déduction.
const TELETRAVAIL_FORFAIT_JOUR = 2.70;
const TELETRAVAIL_PLAFOND_AN   = 626.40;

function fraisKm(km, cv, electrique) {
  if (km <= 0) return 0;
  const b = BAREME_KM_2024[Math.min(7, Math.max(3, cv))];
  let base;
  if      (km <= 5_000)  base = km * b.a;
  else if (km <= 20_000) base = km * b.b + b.f;
  else                   base = km * b.c;
  return Math.round(base * (electrique ? 1.2 : 1));
}

function fraisRepas(jours, coutRepas) {
  if (jours <= 0 || coutRepas <= 0) return 0;
  const supplement = Math.min(REPAS_DEDUC_MAX, Math.max(0, coutRepas - REPAS_FORFAIT_DOMICILE));
  return Math.round(supplement * jours);
}

/**
 * Forfait télétravail DGFiP — déductible UNIQUEMENT si l'employeur ne verse pas
 * d'allocation déjà exonérée, ou si l'allocation reçue est inférieure au forfait.
 * Si l'employeur a remboursé > forfait → pas de déduction supplémentaire.
 */
function fraisTeletravail(jours, allocationDejaExoneree) {
  if (jours <= 0) return 0;
  const forfait = Math.min(TELETRAVAIL_PLAFOND_AN, jours * TELETRAVAIL_FORFAIT_JOUR);
  return Math.max(0, Math.round(forfait - (+allocationDejaExoneree || 0)));
}

function FraisNum({ label, value, onChange, placeholder = '0' }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-200 mb-1">{label}</label>
      <input
        type="number"
        value={value || ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/[0.08] px-3 py-2 text-sm bg-ink-800 text-ink-0 focus:outline-none focus:ring-2 focus:ring-kapio-300/50 placeholder:text-ink-400 font-mono tabular-nums"
      />
    </div>
  );
}

function SimFrais({ data }) {
  const navigate     = useNavigate();
  const { dispatch, state } = useApp();
  const isCouple     = data.isCouple;

  // Pré-remplissage depuis le profil : salaire brut imposable (case 1AJ) du déclarant choisi.
  const brutD1 = data.salairesBrutD1 || 0;
  const brutD2 = data.salairesBrutD2 || 0;
  const [declarant, setDeclarant] = useState('d1');
  const salaireBrut = declarant === 'd2' ? brutD2 : brutD1;

  // 1. Trajet domicile-travail
  const [distance,   setDistance]   = useState(20);
  const [joursSem,   setJoursSem]   = useState(5);
  const [semaines,   setSemaines]   = useState(47);
  const [cv,         setCv]         = useState(5);
  const [electrique, setElectrique] = useState(false);

  // 2. Frais véhicule complémentaires (déductibles en plus du barème)
  const [peage,    setPeage]    = useState(0);
  const [parking,  setParking]  = useState(0);
  const [interetsEmprunt, setInteretsEmprunt] = useState(0);

  // 3. Repas
  const [joursRepas, setJoursRepas] = useState(0);
  const [coutRepas,  setCoutRepas]  = useState(12);

  // 4. Télétravail
  const [joursTeletravail, setJoursTeletravail] = useState(0);
  const [allocTeletravail, setAllocTeletravail] = useState(0); // allocation employeur déjà exonérée

  // 5. Vêtements pro / EPI / outillage spécifique
  const [vetements, setVetements] = useState(0);

  // 6. Documentation pro / formation
  const [documentation, setDocumentation] = useState(0);
  const [formation,     setFormation]     = useState(0);

  // 7. Double résidence imposée par l'employeur
  const [doubleResidence, setDoubleResidence] = useState(0);

  // 8. Autres frais
  const [autres, setAutres] = useState(0);

  const res = useMemo(() => {
    const kmAnnuels    = distance * 2 * joursSem * semaines;
    const fVehicule    = fraisKm(kmAnnuels, cv, electrique);
    const fPeage       = Math.max(0, Number(peage)           || 0);
    const fParking     = Math.max(0, Number(parking)         || 0);
    const fInterets    = Math.max(0, Number(interetsEmprunt) || 0);
    const fRepas       = fraisRepas(joursRepas, coutRepas);
    const fTeletravail = fraisTeletravail(joursTeletravail, allocTeletravail);
    const fVetements   = Math.max(0, Number(vetements)        || 0);
    const fDocum       = Math.max(0, Number(documentation)    || 0);
    const fFormation   = Math.max(0, Number(formation)        || 0);
    const fDoubleRes   = Math.max(0, Number(doubleResidence)  || 0);
    const fAutres      = Math.max(0, Number(autres)           || 0);

    const totalReels   = fVehicule + fPeage + fParking + fInterets
                       + fRepas + fTeletravail + fVetements
                       + fDocum + fFormation + fDoubleRes + fAutres;

    const abat10Brut   = salaireBrut * 0.10;
    const abat10       = salaireBrut > 0
      ? Math.min(ABAT_10_MAX, Math.max(ABAT_10_MIN, Math.round(abat10Brut)))
      : 0;

    const gain         = totalReels - abat10;
    const interessant  = salaireBrut > 0 && gain > 0;

    return {
      kmAnnuels, fVehicule, fPeage, fParking, fInterets,
      fRepas, fTeletravail, fVetements, fDocum, fFormation,
      fDoubleRes, fAutres,
      totalReels, abat10, gain, interessant,
    };
  }, [distance, joursSem, semaines, cv, electrique,
      peage, parking, interetsEmprunt, joursRepas, coutRepas,
      joursTeletravail, allocTeletravail,
      vetements, documentation, formation, doubleResidence, autres,
      salaireBrut]);

  const reporterDansCollecte = () => {
    if (res.totalReels <= 0) {
      toast.error('Renseignez au moins un poste de frais.');
      return;
    }
    dispatch({
      type: 'SET_FORM_DATA',
      payload: { ...state.formData, frais_r: String(res.totalReels) },
    });
    toast.success(`Frais réels (${fmt(res.totalReels)} €) reportés dans la collecte.`);
  };

  const handleChat = () => {
    const lignes = [
      `Simulation frais réels (${declarant === 'd2' ? 'D2' : 'D1'}).`,
      res.fVehicule > 0 && `Trajet : ${distance} km aller × ${joursSem} j/sem × ${semaines} sem = ${fmt(res.kmAnnuels)} km/an, ${cv} CV${electrique ? ' électrique (+20 %)' : ''} → ${fmt(res.fVehicule)} €`,
      (res.fPeage + res.fParking + res.fInterets) > 0 && `Compléments véhicule : péage ${fmt(res.fPeage)} €, parking ${fmt(res.fParking)} €, intérêts emprunt ${fmt(res.fInterets)} €`,
      res.fRepas > 0 && `Repas : ${joursRepas} × (${coutRepas} − 5,35 €) → ${fmt(res.fRepas)} €`,
      res.fTeletravail > 0 && `Télétravail : ${joursTeletravail} j × 2,70 € − allocation employeur ${fmt(allocTeletravail)} € → ${fmt(res.fTeletravail)} €`,
      (res.fVetements + res.fDocum + res.fFormation + res.fDoubleRes) > 0
        && `Vêtements pro ${fmt(res.fVetements)} €, documentation ${fmt(res.fDocum)} €, formation ${fmt(res.fFormation)} €, double résidence ${fmt(res.fDoubleRes)} €`,
      res.fAutres > 0 && `Autres : ${fmt(res.fAutres)} €`,
      `Total frais réels : ${fmt(res.totalReels)} € vs abattement 10 % (${fmt(res.abat10)} €). ${res.interessant ? `Gain net = ${fmt(res.gain)} €.` : 'Le forfait 10 % reste plus avantageux.'}`,
      "Peux-tu valider la cohérence et signaler les frais que j'aurais pu oublier ?",
    ].filter(Boolean);
    navigate('/chat', { state: { prefill: lignes.join(' ') } });
  };

  return (
    <div className="flex flex-col gap-5">

      {isCouple && (
        <ToggleGroup
          label="Déclarant"
          options={['d1', 'd2']}
          value={declarant}
          onChange={setDeclarant}
          format={v => v === 'd1' ? 'Déclarant 1' : 'Déclarant 2'}
        />
      )}

      {/* 1. Trajet domicile-travail */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">1 · Trajet domicile ↔ travail</p>
        <div className="flex flex-col gap-4">
          <SimSlider label="Distance aller simple"        value={distance} min={0} max={150} step={1}  onChange={setDistance} format={v => `${v} km`} />
          <SimSlider label="Jours travaillés / semaine"   value={joursSem} min={1} max={6}   step={1}  onChange={setJoursSem} format={v => `${v} j`} />
          <SimSlider label="Semaines travaillées / an"    value={semaines} min={1} max={52}  step={1}  onChange={setSemaines} format={v => `${v} sem.`} />
          <ToggleGroup label="Puissance fiscale du véhicule" options={[3, 4, 5, 6, 7]} value={cv} onChange={setCv}
            format={v => v === 7 ? '7 CV et +' : `${v} CV`} />
          <ToggleGroup label="Type de motorisation" options={[false, true]} value={electrique} onChange={setElectrique}
            format={v => v ? '⚡ Électrique (+20 %)' : 'Thermique / hybride'} />
        </div>
        <p className="mt-2 text-[10px] text-ink-300 leading-snug">
          Barème kilométrique 2024. Plafond pratique : 80 km aller-retour/jour sauf justification
          (horaires décalés, double activité, handicap…). Si vous avez changé de véhicule en cours d'année,
          calculez séparément pour chaque véhicule puis additionnez dans « Autres frais ».
        </p>
      </div>

      {/* 2. Frais véhicule complémentaires */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">2 · Frais véhicule complémentaires</p>
        <div className="grid grid-cols-2 gap-3">
          <FraisNum label="Péages autoroute / an"       value={peage}           onChange={setPeage} />
          <FraisNum label="Parking habituel / an"       value={parking}         onChange={setParking} />
          <FraisNum label="Intérêts d'emprunt véhicule" value={interetsEmprunt} onChange={setInteretsEmprunt} />
        </div>
        <p className="mt-2 text-[10px] text-ink-300 leading-snug">
          Déductibles <strong>en plus</strong> du barème kilométrique. Carburant, entretien, assurance véhicule
          et dépréciation sont déjà inclus dans le barème — ne les saisissez pas ici.
        </p>
      </div>

      {/* 3. Repas */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">3 · Repas hors domicile</p>
        <div className="flex flex-col gap-4">
          <SimSlider label="Nombre de repas dans l'année" value={joursRepas} min={0} max={250} step={1} onChange={setJoursRepas} format={v => `${v} repas`} />
          <SimSlider label="Coût moyen d'un repas (€)"    value={coutRepas}  min={0} max={30}  step={1} onChange={setCoutRepas}  format={v => `${v} €`} />
        </div>
        <p className="mt-2 text-[10px] text-ink-300 leading-snug">
          Déduction = (coût repas − 5,35 €) × nombre de repas, plafonnée à 15,75 €/repas (BOI-RSA-BASE-30-50-30-20).
          À utiliser uniquement si vous n'avez ni cantine, ni titre-restaurant.
          Si vous avez des titres-restaurant, seule la part employeur excédentaire compte.
        </p>
      </div>

      {/* 4. Télétravail */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">4 · Télétravail</p>
        <div className="grid grid-cols-2 gap-3">
          <FraisNum label="Jours de télétravail / an"               value={joursTeletravail} onChange={setJoursTeletravail} placeholder="0" />
          <FraisNum label="Allocation employeur déjà exonérée"       value={allocTeletravail} onChange={setAllocTeletravail} placeholder="0" />
        </div>
        <p className="mt-2 text-[10px] text-ink-300 leading-snug">
          Forfait DGFiP : <strong>2,70 €/jour</strong>, plafond 626,40 €/an.
          Si votre employeur vous a versé une <strong>allocation forfaitaire ou un remboursement</strong>
          (exonéré à hauteur de ces mêmes plafonds), <strong>déduisez-le ici</strong> — sinon double déduction.
          Si l'allocation employeur est supérieure au forfait, la déduction supplémentaire est nulle.
        </p>
      </div>

      {/* 5. Vêtements pro */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">5 · Vêtements pro / EPI / outillage</p>
        <FraisNum label="Total annuel" value={vetements} onChange={setVetements} placeholder="0" />
        <p className="mt-2 text-[10px] text-ink-300 leading-snug">
          Uniquement les vêtements spécifiques à l'activité (uniforme, blouse, chaussures de sécurité…)
          et leur entretien. Les costumes de bureau et tenues passe-partout ne sont pas déductibles.
        </p>
      </div>

      {/* 6. Documentation / formation */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">6 · Documentation & formation</p>
        <div className="grid grid-cols-2 gap-3">
          <FraisNum label="Documentation pro / abonnements"  value={documentation} onChange={setDocumentation} placeholder="0" />
          <FraisNum label="Formation pro non remboursée"     value={formation}     onChange={setFormation}     placeholder="0" />
        </div>
        <p className="mt-2 text-[10px] text-ink-300 leading-snug">
          Revues techniques, ouvrages spécialisés, MOOC payants directement liés à l'emploi.
          Les formations remboursées par l'employeur ou OPCO ne sont pas déductibles.
        </p>
      </div>

      {/* 7. Double résidence */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">7 · Double résidence professionnelle</p>
        <FraisNum label="Loyer + charges du second logement" value={doubleResidence} onChange={setDoubleResidence} placeholder="0" />
        <p className="mt-2 text-[10px] text-ink-300 leading-snug">
          Déductible uniquement si la double résidence est <strong>imposée par l'emploi</strong>
          (mutation, mission temporaire, conjoint travaillant ailleurs) — pas pour convenance personnelle.
          Loyer, charges, taxe d'habitation du second logement.
        </p>
      </div>

      {/* 8. Autres frais pro */}
      <div>
        <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-3">8 · Autres frais professionnels</p>
        <FraisNum label="Autres (frais de mission non remboursés, déménagement professionnel imposé…)" value={autres} onChange={setAutres} placeholder="0" />
      </div>

      {/* Recommandation */}
      <div className={`rounded-xl px-4 py-2.5 border text-xs flex items-start gap-2 ${
        res.interessant
          ? 'bg-kapio-500/[0.08] border-kapio-500/30 text-kapio-300'
          : 'bg-ink-800/60 border-white/[0.08] text-ink-200'
      }`}>
        <span className="mt-0.5 shrink-0">{res.interessant ? '✅' : 'ℹ️'}</span>
        <span>
          {salaireBrut <= 0
            ? 'Renseignez votre salaire brut imposable (case 1AJ) dans la collecte pour comparer avec l\'abattement 10 %.'
            : res.interessant
              ? `Vos frais réels (${fmt(res.totalReels)} €) dépassent l'abattement 10 % (${fmt(res.abat10)} €). Gain net : ${fmt(res.gain)} € à déduire en plus.`
              : `L'abattement forfaitaire 10 % (${fmt(res.abat10)} €) reste plus avantageux que vos frais réels (${fmt(res.totalReels)} €). Laissez la case vide.`}
        </span>
      </div>

      {/* Détail */}
      <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 overflow-hidden">
        <div className="px-4 py-3 bg-ink-900/40 border-b border-white/[0.06]">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">Détail des frais</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {[
            { label: 'Indemnité kilométrique', value: res.fVehicule,
              sub: `${fmt(res.kmAnnuels)} km/an · barème ${cv === 7 ? '7 CV+' : `${cv} CV`}${electrique ? ' ×1,20' : ''}` },
            { label: 'Péage / parking / intérêts véhicule', value: res.fPeage + res.fParking + res.fInterets },
            { label: 'Repas hors domicile',         value: res.fRepas },
            { label: 'Télétravail (forfait DGFiP)', value: res.fTeletravail,
              sub: joursTeletravail > 0 ? `${joursTeletravail} j × 2,70 € − ${fmt(allocTeletravail)} € employeur` : null },
            { label: 'Vêtements pro / EPI',         value: res.fVetements },
            { label: 'Documentation + formation',    value: res.fDocum + res.fFormation },
            { label: 'Double résidence',             value: res.fDoubleRes },
            { label: 'Autres',                       value: res.fAutres },
          ].filter(r => r.value > 0).map(({ label, value, sub }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm text-ink-200">{label}</span>
                {sub && <p className="text-[10px] text-ink-300">{sub}</p>}
              </div>
              <span className="text-sm font-bold font-mono tabular-nums text-ink-0">{fmt(value)} €</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-kapio-500/[0.05]">
            <span className="text-sm font-semibold text-ink-100">Total frais réels</span>
            <span className="text-sm font-bold font-mono tabular-nums text-kapio-300">{fmt(res.totalReels)} €</span>
          </div>
          {salaireBrut > 0 && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-ink-300">Abattement 10 % (référence)</span>
              <span className="text-sm font-mono tabular-nums text-ink-300">{fmt(res.abat10)} €</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1"
          onClick={() => saveSimulation(`Frais réels — ${fmt(res.totalReels)} € vs abat. 10% ${fmt(res.abat10)} €`)}>
          <Save size={13} /> Sauvegarder
        </Button>
        <Button
          variant={res.interessant ? 'primary' : 'secondary'}
          size="sm"
          className="flex-1"
          onClick={reporterDansCollecte}
          disabled={!res.interessant}
        >
          <ArrowRight size={13} /> Reporter dans la collecte
        </Button>
      </div>

      <button
        type="button"
        onClick={handleChat}
        className="text-xs text-kapio-400 hover:text-kapio-300 underline self-center"
      >
        💬 Discuter de cette simulation
      </button>

      <p className="text-[10px] text-ink-300 text-center leading-snug">
        Barème kilométrique 2024 (revenus 2024 → déclaration 2025). Plafonds repas : valeur forfaitaire 5,35 € — plafond 21,10 €.
        Frais déductibles uniquement si vous renoncez à l'abattement forfaitaire 10 %.
      </p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'per',        label: 'PER',         Icon: TrendingUp },
  { id: 'enveloppes', label: 'Enveloppes',  Icon: Layers     },
  { id: 'foncier',    label: 'Foncier',     Icon: Home       },
  { id: 'immo',       label: 'Immobilier',  Icon: Building2  },
  { id: 'frais',      label: 'Frais réels', Icon: Briefcase  },
];

const MODES = [
  { id: 'profile', label: 'Depuis mon profil', Icon: FileText },
  { id: 'manual',  label: 'Saisie manuelle',   Icon: PenLine  },
];

export default function Simulator() {
  const { state } = useApp();
  const [tab,  setTab]  = useState('per');
  const [mode, setMode] = useState('profile');
  const [perDeclarant, setPerDeclarant] = useState('d1');

  // Champs saisie manuelle
  const [manualTMI,        setManualTMI]        = useState(30);
  const [manualRNI,        setManualRNI]        = useState('65000');
  const [manualParts,      setManualParts]      = useState(1);
  const [manualPERO,       setManualPERO]       = useState('');
  const [manualAnterieurs, setManualAnterieurs] = useState('');

  // Calcul plafond PER en mode manuel
  const perCalc = useMemo(() => {
    const rni        = parseInt(manualRNI, 10) || 0;
    const pero       = parseInt(manualPERO, 10) || 0;
    const anterieurs = parseInt(manualAnterieurs, 10) || 0;
    const plafondBrut = Math.min(Math.max(Math.round(rni * 0.1), MIN_PLAFOND), MAX_PLAFOND_PER);
    const plafondNet  = Math.max(0, plafondBrut - pero);
    const plafondTotal = plafondNet + anterieurs;
    return { rni, plafondBrut, plafondNet, plafondTotal };
  }, [manualRNI, manualPERO, manualAnterieurs]);

  // Données transmises aux simulateurs
  const profileData = useMemo(() => {
    if (mode === 'manual') {
      const isCouple = manualParts >= 2;
      return {
        rni: perCalc.rni || 65_000, tmi: manualTMI,
        parts: manualParts,
        plafond: perCalc.plafondTotal || 10_000, isDefault: false,
        isCouple, perCalcD1: null, perCalcD2: null, selectedCalc: null,
      };
    }
    const pp       = state.parsedProfile ?? {};
    const hasData  = !!(pp.salaireNetImposableD1 || pp.rniFoyer);
    const isCouple = pp.mode === 'couple';
    const parts    = pp.parts || (isCouple ? 2 : 1);

    // Plafond PER D1 — rniD1 est déjà post-abattement 10%
    const rniD1         = pp.rniD1 || 0;
    const peroD1        = pp.peroD1 || 0;
    const brut10D1      = Math.min(Math.round(rniD1 * 0.1), MAX_PLAFOND_PER);
    const plafondBrutD1 = Math.max(brut10D1, MIN_PLAFOND);
    const plafondNetD1  = Math.max(0, plafondBrutD1 - peroD1);

    // Report PER FIFO (art. 163 quatervicies I CGI) — ordre : N en premier, puis N-3, N-2, N-1
    const reportTotal   = (pp.perReportableTotal || 0);
    // Distribution du report entre D1 et D2 au prorata des RNI
    // (form collecte un seul ensemble de reports au niveau foyer)
    const rniTot        = Math.max(1, rniD1 + (pp.rniD2 || 0));
    const reportD1      = isCouple ? Math.round(reportTotal * (rniD1 / rniTot)) : reportTotal;
    const reportD2raw   = reportTotal - reportD1;

    const plafondWithReportsD1 = plafondNetD1 + reportD1;
    const perCalcD1 = {
      rni: rniD1, pero: peroD1, brut10: brut10D1, plafondBrut: plafondBrutD1, plafondNet: plafondNetD1,
      reportN1: pp.perReportableN1 || 0, reportN2: pp.perReportableN2 || 0, reportN3: pp.perReportableN3 || 0,
      reportTotal: reportD1, plafondWithReports: plafondWithReportsD1,
    };

    // Plafond PER D2 (couple uniquement)
    const rniD2         = pp.rniD2 || 0;
    const peroD2        = pp.peroD2 || 0;
    const brut10D2      = Math.min(Math.round(rniD2 * 0.1), MAX_PLAFOND_PER);
    const plafondBrutD2 = Math.max(brut10D2, MIN_PLAFOND);
    const plafondNetD2  = Math.max(0, plafondBrutD2 - peroD2);
    const plafondWithReportsD2 = plafondNetD2 + reportD2raw;
    const perCalcD2 = isCouple ? {
      rni: rniD2, pero: peroD2, brut10: brut10D2, plafondBrut: plafondBrutD2, plafondNet: plafondNetD2,
      reportN1: 0, reportN2: 0, reportN3: 0,
      reportTotal: reportD2raw, plafondWithReports: plafondWithReportsD2,
    } : null;

    const selectedCalc = (isCouple && perDeclarant === 'd2') ? perCalcD2 : perCalcD1;

    const baseFoyer = baseIRFoyer(pp);
    const tmi       = hasData ? getTMI(baseFoyer, parts) : 30;

    const rfr   = pp.rfr || pp.rniFoyer || 0;
    const cehr  = calcCEHR(rfr, isCouple);

    return {
      rni: pp.rniFoyer || 65_000, tmi,
      parts,
      // plafond = current year net + reports FIFO pour le curseur principal
      plafond:      hasData ? (selectedCalc.plafondWithReports || selectedCalc.plafondNet) : MIN_PLAFOND,
      isDefault:    !hasData,
      isCouple,     perCalcD1, perCalcD2, selectedCalc,
      salairesBrutD1:  pp.salairesBrutImposableD1 || 0,
      salairesBrutD2:  pp.salairesBrutImposableD2 || 0,
      tmiRetraiteD1:   pp.tmiRetraiteD1 ?? null,
      tmiRetraiteD2:   pp.tmiRetraiteD2 ?? null,
      horizonD1:       pp.horizonD1 || 0,
      avVerseD1:       pp.avVerseD1 || 0,
      avVerseD2:       pp.avVerseD2 || 0,
      rfr,   cehr,
    };
  }, [mode, manualTMI, manualParts, perCalc, state.parsedProfile, perDeclarant]);

  return (
    <div className="relative bg-ink-900 overflow-x-hidden">
      <AuroraBackground showGrid intensity={0.7} />
      <SpotlightCursor size={500} intensity={0.14} />
      <Grain opacity={0.02} />

      <div className="relative z-10 max-w-[1100px] mx-auto px-6 py-12">
      <div className="flex flex-col gap-6">

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mb-4"
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-ink-50 text-xs font-medium mb-5">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-kapio-300 opacity-75 animate-pulse2" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-kapio-300" />
          </span>
          Outils interactifs
          <TrendingUp size={11} className="text-kapio-300" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ letterSpacing: '-0.03em' }}>
          <SplitText text="Simulateurs " delay={0.2} stagger={0.04} />
          <SplitText text="fiscaux" gradient delay={0.48} stagger={0.05} />
        </h1>
        <p className="text-base text-ink-100 leading-relaxed">
          Visualisez l'impact de vos décisions en temps réel.
        </p>
      </motion.div>

      {/* Toggle mode */}
      <div className="flex gap-1 p-1 bg-ink-800/80 border border-white/[0.06] rounded-2xl">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200',
              mode === id
                ? 'bg-ink-700 text-kapio-300'
                : 'text-ink-300 hover:text-ink-0',
            ].join(' ')}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Saisie manuelle */}
      {mode === 'manual' && (
        <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 p-5 flex flex-col gap-5">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">Vos paramètres</p>

          {/* Ligne 1 : TMI + RNI + parts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-200">TMI actuel</label>
              <select
                value={manualTMI}
                onChange={e => setManualTMI(Number(e.target.value))}
                className="border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-ink-0 focus:outline-none focus:border-kapio-400 bg-ink-900"
              >
                {TMI_OPTIONS.map(t => <option key={t} value={t}>{t} %</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-200">RNI foyer (€)</label>
              <input
                type="number"
                value={manualRNI}
                onChange={e => setManualRNI(e.target.value)}
                placeholder="65 000"
                className="border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-ink-0 focus:outline-none focus:border-teal-400"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-200">Parts fiscales</label>
              <div className="flex gap-1 p-1 bg-ink-700 rounded-xl">
                {[1, 2].map(n => (
                  <button key={n} type="button" onClick={() => setManualParts(n)}
                    className={['flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                      manualParts === n ? 'bg-ink-600 text-kapio-300 shadow-sm' : 'text-ink-300 hover:text-ink-100',
                    ].join(' ')}>
                    {n} part{n > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Calcul automatique plafond PER */}
          {perCalc.rni > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3 flex flex-col gap-1.5 text-xs">
              <p className="font-bold text-blue-300 flex items-center gap-1.5">💡 Plafond PER calculé automatiquement</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-ink-200 mt-0.5">
                <span>10 % × votre RNI</span>
                <span className="font-mono font-semibold text-ink-0 text-right">{fmt(Math.round(perCalc.rni * 0.1))} €</span>
                <span>Minimum légal (10 % PASS)</span>
                <span className="font-mono font-semibold text-ink-0 text-right">{fmt(MIN_PLAFOND)} €</span>
                <span className="font-semibold text-blue-300">→ Plafond brut retenu</span>
                <span className="font-mono font-bold text-blue-300 text-right">{fmt(perCalc.plafondBrut)} €</span>
                {parseInt(manualPERO, 10) > 0 && <>
                  <span className="text-warning-400">− PERO employeur</span>
                  <span className="font-mono font-semibold text-warning-400 text-right">− {fmt(parseInt(manualPERO, 10))} €</span>
                </>}
                {parseInt(manualAnterieurs, 10) > 0 && <>
                  <span className="text-kapio-400">+ Plafonds antérieurs</span>
                  <span className="font-mono font-semibold text-kapio-400 text-right">+ {fmt(parseInt(manualAnterieurs, 10))} €</span>
                </>}
                <span className="font-bold text-kapio-300 border-t border-white/[0.06] pt-1">→ Plafond disponible net</span>
                <span className="font-mono font-bold text-kapio-300 border-t border-white/[0.06] pt-1 text-right">{fmt(perCalc.plafondTotal)} €</span>
              </div>
            </div>
          )}

          {/* Champs optionnels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-200">
                Cotisations PERO employeur (€)
                <span className="ml-1 text-ink-300 font-normal">— optionnel</span>
              </label>
              <input
                type="number"
                value={manualPERO}
                onChange={e => setManualPERO(e.target.value)}
                placeholder="0"
                className="border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-ink-0 focus:outline-none focus:border-teal-400"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-200 flex items-center gap-1">
                Plafonds antérieurs N-3/N-2/N-1 (€)
                <span
                  className="ml-1 text-ink-300 font-normal cursor-help"
                  title="Vous pouvez mobiliser vos plafonds des 3 années précédentes si non utilisés (art. 163 quatervicies II CGI). Ces plafonds apparaissent sur votre avis d'imposition."
                >ⓘ</span>
              </label>
              <input
                type="number"
                value={manualAnterieurs}
                onChange={e => setManualAnterieurs(e.target.value)}
                placeholder="0"
                className="border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-ink-0 focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Profil auto — détail plafond PER */}
      {mode === 'profile' && tab === 'per' && !profileData.isDefault && (
        <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 p-5 flex flex-col gap-5">
          <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">Plafond PER — données du profil</p>

          {/* Toggle D1 / D2 pour couple */}
          {profileData.isCouple && (
            <div className="flex gap-1 p-1 bg-ink-700 rounded-xl">
              {[{ id: 'd1', label: 'Déclarant 1' }, { id: 'd2', label: 'Déclarant 2' }].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPerDeclarant(id)}
                  className={[
                    'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                    perDeclarant === id ? 'bg-ink-600 text-kapio-300 shadow-sm' : 'text-ink-300 hover:text-ink-100',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Calcul étape par étape */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3 flex flex-col gap-1.5 text-xs">
            <p className="font-bold text-blue-300 flex items-center gap-1.5">💡 Plafond PER calculé automatiquement</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-ink-200 mt-0.5">
              <span>RNI {profileData.isCouple ? (perDeclarant === 'd1' ? 'D1' : 'D2') : 'foyer'}</span>
              <span className="font-mono font-semibold text-ink-0 text-right">{fmt(profileData.selectedCalc.rni)} €</span>
              <span>10 % × RNI</span>
              <span className="font-mono font-semibold text-ink-0 text-right">{fmt(profileData.selectedCalc.brut10)} €</span>
              <span>Minimum légal (10 % PASS)</span>
              <span className="font-mono font-semibold text-ink-0 text-right">{fmt(MIN_PLAFOND)} €</span>
              <span className="font-semibold text-blue-300">→ Plafond brut retenu</span>
              <span className="font-mono font-bold text-blue-300 text-right">{fmt(profileData.selectedCalc.plafondBrut)} €</span>
              {profileData.selectedCalc.pero > 0 && <>
                <span className="text-warning-400">− PERO employeur</span>
                <span className="font-mono font-semibold text-warning-400 text-right">− {fmt(profileData.selectedCalc.pero)} €</span>
              </>}
              <span className="font-bold text-kapio-300 border-t border-white/[0.06] pt-1">→ Plafond disponible net (année N)</span>
              <span className="font-mono font-bold text-kapio-300 border-t border-white/[0.06] pt-1 text-right">{fmt(profileData.selectedCalc.plafondNet)} €</span>
              {profileData.selectedCalc.reportN3 > 0 && <>
                <span className="text-kapio-400">+ Report N-3 (art. 163 quatervicies I CGI)</span>
                <span className="font-mono font-semibold text-kapio-400 text-right">+ {fmt(profileData.selectedCalc.reportN3)} €</span>
              </>}
              {profileData.selectedCalc.reportN2 > 0 && <>
                <span className="text-kapio-400">+ Report N-2</span>
                <span className="font-mono font-semibold text-kapio-400 text-right">+ {fmt(profileData.selectedCalc.reportN2)} €</span>
              </>}
              {profileData.selectedCalc.reportN1 > 0 && <>
                <span className="text-kapio-400">+ Report N-1</span>
                <span className="font-mono font-semibold text-kapio-400 text-right">+ {fmt(profileData.selectedCalc.reportN1)} €</span>
              </>}
              {(profileData.selectedCalc.reportTotal || 0) > 0 && <>
                <span className="font-bold text-kapio-300 border-t border-white/[0.06] pt-1">= Total mobilisable (N + reports)</span>
                <span className="font-mono font-bold text-kapio-300 border-t border-white/[0.06] pt-1 text-right">{fmt(profileData.selectedCalc.plafondWithReports)} €</span>
              </>}
            </div>
          </div>

          {/* Foyer consolidé (couple uniquement) */}
          {profileData.isCouple && profileData.perCalcD1 && profileData.perCalcD2 && (
            <div className="rounded-xl border border-kapio-500/20 bg-kapio-500/[0.05] px-4 py-3">
              <p className="text-[10px] font-bold text-kapio-400 uppercase tracking-widest mb-2">
                Plafond PER du foyer consolidé
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-200">
                <span>Plafond net D1</span>
                <span className="font-mono font-semibold text-ink-0 text-right">{fmt(profileData.perCalcD1.plafondNet)} €</span>
                <span>Plafond net D2</span>
                <span className="font-mono font-semibold text-ink-0 text-right">{fmt(profileData.perCalcD2.plafondNet)} €</span>
                {((profileData.perCalcD1.reportTotal || 0) + (profileData.perCalcD2.reportTotal || 0)) > 0 && <>
                  <span className="text-kapio-400">+ Reports FIFO foyer (N-3/N-2/N-1)</span>
                  <span className="font-mono font-semibold text-kapio-400 text-right">
                    + {fmt((profileData.perCalcD1.reportTotal || 0) + (profileData.perCalcD2.reportTotal || 0))} €
                  </span>
                </>}
                <span className="font-bold text-kapio-300 border-t border-white/[0.06] pt-1 mt-0.5">→ Total mobilisable foyer</span>
                <span className="font-mono font-bold text-kapio-300 border-t border-white/[0.06] pt-1 mt-0.5 text-right">
                  {fmt(profileData.perCalcD1.plafondWithReports + profileData.perCalcD2.plafondWithReports)} €
                </span>
              </div>
              <p className="text-[9px] text-kapio-300 mt-2 leading-snug">
                art. 163 quatervicies I-II CGI — plafond individuel + reports des 3 exercices précédents
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabs simulateur */}
      <div className="flex gap-1 p-1 bg-ink-800/80 border border-white/[0.06] rounded-2xl overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'shrink-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200',
              tab === id
                ? 'bg-ink-700 text-kapio-300'
                : 'text-ink-300 hover:text-ink-0',
            ].join(' ')}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenu simulateur */}
      <ScrollReveal delay={0.1}>
        <div className="rounded-2xl border border-white/[0.06] bg-ink-800/60 backdrop-blur-sm shadow-sm p-5">
          {tab === 'per'        && <SimPER        data={profileData} />}
          {tab === 'enveloppes' && <SimEnveloppes data={profileData} />}
          {tab === 'foncier'    && <SimFoncier    data={profileData} />}
          {tab === 'immo'       && <SimImmobilier />}
          {tab === 'frais'      && <SimFrais      data={profileData} />}
        </div>
      </ScrollReveal>

      </div>
      </div>
    </div>
  );
}
