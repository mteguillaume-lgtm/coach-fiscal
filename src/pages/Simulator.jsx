import { useState, useMemo, useEffect } from 'react';
import { useNavigate }             from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import toast                       from 'react-hot-toast';
import { TrendingUp, Layers, Home, MessageCircle, Save, ChevronRight, FileText, PenLine } from 'lucide-react';

import { useApp }  from '../context/AppContext';
import Button      from '../components/Button';
import { getTMI, baseIRFoyer, MIN_PLAFOND_PER, calcIR, TRANCHES, computePerOptimumCascade } from '../lib/taxCalculator';

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
function envNet(id, P, r, t, tmiE, tmiS = null, reinvest = true, isCouple = false) {
  const rate    = id === 'livretA' ? 0.03 : r;
  const Brut    = P * Math.pow(1 + rate, t);
  const G       = Brut - P;                 // plus-value brute
  const Te      = tmiE / 100;
  const Ts      = (tmiS ?? tmiE) / 100;

  switch (id) {
    case 'livretA':
      return Brut;                           // 0 % — exonéré total

    case 'pea':
      // < 5 ans : flat tax 30 % sur gains
      // ≥ 5 ans : PS 17,2 % sur gains seulement (IR exonéré)
      return t >= 5 ? Brut - G * 0.172 : Brut - G * 0.30;

    case 'av8': {
      // PS 17,2 % sur tous les gains + IR 7,5 % sur gains > abattement
      const abatt = isCouple ? 9_200 : 4_600;
      const psTotal = G * 0.172;
      const irTotal = Math.max(0, G - abatt) * 0.075;
      return Brut - psTotal - irTotal;
    }

    case 'per': {
      // Toute la somme retirée = revenu imposable (versements déduits à l'entrée)
      // IR = Brut × TMI_s ; PS = gains × 17,2 %
      const netBase = Brut * (1 - Ts) - G * 0.172;
      if (!reinvest) return netBase;
      // Bonus : économie fiscale d'entrée (P × TMI_e) placée en PEA pendant t ans
      // Rendement net PEA = (1+r)^t × (1 − 0,172) + 0,172  (PS sur les gains PEA)
      const bonus = P * Te * (Math.pow(1 + r, t) * (1 - 0.172) + 0.172);
      return netBase + bonus;
    }

    case 'cto':
      // PFU 30 % = 12,8 % IR + 17,2 % PS sur les gains
      return Brut - G * 0.30;

    default:
      return Brut;
  }
}

/** Détail fiscal d'une enveloppe : brut, impôts, net, gain net. */
function envDetail(id, P, r, t, tmiE, tmiS, reinvest, isCouple) {
  const rate = id === 'livretA' ? 0.03 : r;
  const Brut = P * Math.pow(1 + rate, t);
  const G    = Brut - P;
  const net  = envNet(id, P, r, t, tmiE, tmiS, reinvest, isCouple);
  let tax    = Brut - net;
  let bonus  = 0;
  if (id === 'per' && reinvest) {
    const netBase = envNet('per', P, r, t, tmiE, tmiS, false, isCouple);
    bonus = net - netBase;
    tax   = Brut - netBase;  // impôts sur la partie PER seule (hors bonus)
  }
  return { brut: Math.round(Brut), tax: Math.round(tax), net: Math.round(net), gain: Math.round(net - P), bonus: Math.round(bonus) };
}

/** Année à partir de laquelle PER >= PEA, ou null si PEA toujours gagnant sur l'horizon. */
function perCrossover(P, r, tmiE, tmiS, reinvest, isCouple, maxY = 50) {
  for (let y = 1; y <= maxY; y++) {
    if (envNet('per', P, r, y, tmiE, tmiS, reinvest, isCouple) >= envNet('pea', P, r, y, tmiE, tmiS, reinvest, isCouple)) return y;
  }
  return null;
}

const ENVELOPES = [
  { id: 'livretA', name: 'Livret A',      color: '#94a3b8', taxLabel: '0 % (exonéré)'                            },
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
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-sm font-bold text-teal-700 font-mono tabular-nums">
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
      <div className="flex justify-between text-[10px] text-gray-400 font-mono">
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
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={[
              'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
              value === opt
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
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
    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Données du profil</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-[10px] text-blue-400">{label}</p>
            <p className="text-sm font-bold text-blue-800 font-mono tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {sub && <p className="text-[10px] text-blue-500 mt-2 text-center">{sub}</p>}
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
    <div className="rounded-xl border border-gray-200 bg-white shadow-xl p-3 text-xs min-w-[160px]">
      <p className="font-bold text-gray-700 mb-1.5">Année {label}</p>
      {payload.map(({ name, value, color }) => (
        <div key={name} className="flex items-center justify-between gap-4 py-0.5">
          <span style={{ color }} className="font-medium">{name}</span>
          <span className="font-bold font-mono tabular-nums text-gray-800">{fmt(value)} €</span>
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

  const plafondD1    = showTwoSliders ? (profData.perCalcD1?.plafondNet || 0) : (profData.plafond || 0);
  const plafondD2    = showTwoSliders ? (profData.perCalcD2?.plafondNet || 0) : 0;
  const plafondTotal = plafondD1 + plafondD2;

  // Initialiser sur l'optimum fiscal (effacement de la tranche supérieure)
  const [versementD1, setVersementD1] = useState(() => {
    if (!plafondD1) return 0;
    const opt = computePerOptimumCascade(rniFoyer, parts, plafondD1, plafondD2, isCouple, profData.perCalcD1?.rni || 0, profData.perCalcD2?.rni || 0);
    return Math.round((opt.optimumD1 || 0) / 50) * 50;
  });
  const [versementD2, setVersementD2] = useState(() => {
    if (!showTwoSliders || !plafondD2) return 0;
    const opt = computePerOptimumCascade(rniFoyer, parts, plafondD1, plafondD2, isCouple, profData.perCalcD1?.rni || 0, profData.perCalcD2?.rni || 0);
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
        sub={null}
      />

      {/* ── Curseurs D1 + D2 (ou curseur unique) ── */}
      {showTwoSliders ? (
        <div className="flex flex-col gap-5">
          {/* Répartition plafonds D1/D2 */}
          <div className="flex items-center justify-center gap-6 rounded-xl bg-blue-50 border border-blue-100 px-4 py-2 text-xs text-blue-700">
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
              <div className="flex items-center justify-end gap-2 text-xs text-teal-600">
                <span>Économie D1 : <strong className="font-mono">{fmt(res.economieD1)} €</strong></span>
                <span className="text-gray-400">(rendement {rendD1} %)</span>
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
              <div className="flex items-center justify-end gap-2 text-xs text-teal-600">
                <span>Économie marginale D2 : <strong className="font-mono">{fmt(res.economieD2)} €</strong></span>
                <span className="text-gray-400">(rendement {rendD2} %)</span>
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
          className="rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 active:bg-teal-200 px-4 py-2.5 text-xs font-semibold text-teal-700 transition-colors flex items-center justify-center gap-1.5"
        >
          ⚡ Optimiser — effacer entièrement la tranche {profData.tmi} %
          <span className="ml-1 text-teal-500">({fmt(Math.min(plafondTotal, fractionInTopBracket))} € nécessaires)</span>
        </button>
      )}
      {topBracketDone && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-2.5 text-xs font-semibold text-teal-700 flex items-center gap-2">
          ✅ Tranche {profData.tmi} % entièrement effacée.
          {nextLowerRate > 0 && ` Versements supplémentaires s'imputent sur la tranche ${nextLowerRate} %.`}
        </div>
      )}

      {/* ── Résultats foyer ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Impact fiscal foyer</p>
          <span className="text-xs font-mono text-gray-400">
            {showTwoSliders ? `D1 ${fmt(versementD1)} + D2 ${fmt(versementD2)} =` : 'Versement :'} {fmt(totalVerse)} €
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { label: 'Économie IR totale (barème réel)', value: `${fmt(res.economie)} €`, color: 'text-teal-700', hi: true },
            { label: 'Effort net réel (versé − économie)', value: `${fmt(res.effort)} €`, color: 'text-gray-800' },
            { label: 'RNI foyer résiduel', value: `${fmt(res.rniApres)} €`, color: 'text-gray-800' },
            { label: 'Rendement fiscal', value: `${res.rendement} %`, color: 'text-teal-600' },
          ].map(({ label, value, color, hi }) => (
            <div key={label} className={`flex items-center justify-between px-4 py-3 ${hi ? 'bg-teal-50/40' : ''}`}>
              <span className="text-sm text-gray-600">{label}</span>
              <span className={`text-sm font-bold font-mono tabular-nums ${color}`}>{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">TMI résiduelle après PER</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-mono text-gray-400">{profData.tmi} %</span>
              <ChevronRight size={12} className="text-gray-300" />
              <span className={`text-sm font-bold font-mono tabular-nums ${res.newTMI < profData.tmi ? 'text-teal-600' : 'text-gray-800'}`}>
                {res.newTMI} %{res.newTMI < profData.tmi ? ' ✨' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Décomposition par tranche ── */}
      {totalVerse > 0 && res.bracketBreakdown.length > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-100/50">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Décomposition par tranche</p>
          </div>
          <div className="divide-y divide-blue-100/60">
            {res.bracketBreakdown.map(({ rate, amount, saving }) => (
              <div key={rate} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-10 text-right font-bold text-blue-700 font-mono text-xs shrink-0">{rate} %</span>
                  <span className="text-xs text-blue-600">{fmt(amount)} € effacés dans cette tranche</span>
                </div>
                <span className="text-xs font-bold text-teal-700 font-mono">→ {fmt(saving)} €</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-blue-50">
              <span className="text-xs font-bold text-gray-700">Économie totale réelle</span>
              <span className="text-sm font-bold text-teal-700 font-mono">{fmt(res.economie)} €</span>
            </div>
          </div>
          {res.bracketBreakdown.length > 1 && (
            <div className="px-4 py-2 border-t border-blue-100">
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
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Courbe d'économie IR</p>
          {fractionInTopBracket > 0 && plafondTotal > fractionInTopBracket && (
            <p className="text-[10px] text-amber-600 mb-3 leading-snug">
              Rupture de pente à {fmt(fractionInTopBracket)} € : tranche {profData.tmi} % entièrement effacée
              {nextLowerRate > 0 && ` → rendement passe à ${nextLowerRate} %`}
            </p>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
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
                    <div className="rounded-xl border border-gray-200 bg-white shadow-xl p-3 text-xs">
                      <p className="font-bold text-gray-700">Versement : {fmt(payload[0].payload.versement)} €</p>
                      <p className="text-teal-700 font-bold">Économie IR : {fmt(payload[0].value)} €</p>
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
      <details className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden group">
        <summary className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-widest cursor-pointer flex items-center justify-between select-none hover:bg-gray-50 transition-colors">
          <span>Comment fonctionne le PER fiscalement ?</span>
          <span className="text-gray-400 text-[10px] group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="px-5 py-4 flex flex-col gap-3 text-xs text-gray-700 leading-relaxed border-t border-gray-100">
          <p>
            <strong>Principe :</strong> chaque euro versé sur un PER réduit directement le revenu net imposable.
            L'économie d'IR dépend de la tranche dans laquelle ce versement s'impute.
          </p>
          <p>
            <strong>Règle d'imputation :</strong> les versements s'imputent en priorité sur la{' '}
            <em>tranche marginale la plus haute</em>. L'économie par euro versé = taux de la tranche effacée.
          </p>
          {fractionInTopBracket > 0 && rniFoyer > 0 && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="font-semibold text-blue-800 mb-2">Votre profil — calcul détaillé</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-blue-700">
                <span>RNI foyer avant PER</span>
                <span className="font-mono text-right">{fmt(rniFoyer)} €</span>
                <span>Seuil tranche {profData.tmi} % ({parts} part{parts > 1 ? 's' : ''})</span>
                <span className="font-mono text-right">{fmt(Math.round(rniFoyer - fractionInTopBracket))} €</span>
                <span className="font-semibold border-t border-blue-200 pt-1 mt-0.5">Fraction dans la tranche {profData.tmi} %</span>
                <span className="font-mono font-bold text-right border-t border-blue-200 pt-1 mt-0.5">{fmt(fractionInTopBracket)} €</span>
              </div>
              <div className="mt-3 pt-2 border-t border-blue-200 space-y-1.5">
                <p>→ Pour effacer entièrement la tranche {profData.tmi} % : verser <strong>{fmt(fractionInTopBracket)} €</strong></p>
                <p>→ Économie : {fmt(fractionInTopBracket)} × {profData.tmi} % = <strong>{fmt(Math.round(fractionInTopBracket * profData.tmi / 100))} €</strong></p>
                {nextLowerRate > 0 && (
                  <p className="text-blue-500">
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

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
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

function SimEnveloppes({ data }) {
  const navigate = useNavigate();
  const tmiProfile = data.tmi || 30; // TMI entrée depuis le profil

  const perEnvInfo = useMemo(() => getPerEnvInfo(data), [data]);

  const [capital,   setCapital]   = useState(10_000);
  const [duration,  setDuration]  = useState(20);
  const [rate,      setRate]      = useState(0.05);
  const [tmiE,      setTmiE]      = useState(tmiProfile);  // TMI à l'entrée (prérempli)
  const [tmiS,      setTmiS]      = useState(11);           // TMI à la sortie/retraite
  const [reinvest,  setReinvest]  = useState(true);         // réinvestir l'économie IR en PEA

  const isCouple = data.isCouple ?? false;
  const tmiDiff  = tmiE - tmiS;

  // Calcul détaillé par enveloppe (brut, impôts, net, gain, bonus PER)
  const tableRows = useMemo(
    () => ENVELOPES.map(env => ({ ...env, ...envDetail(env.id, capital, rate, duration, tmiE, tmiS, reinvest, isCouple) })),
    [capital, rate, duration, tmiE, tmiS, reinvest, isCouple]
  );

  const bestId = useMemo(
    () => tableRows.reduce((b, r) => r.net > b.net ? r : b, tableRows[0])?.id,
    [tableRows]
  );

  // Point de croisement PER / PEA
  const crossoverYear = useMemo(
    () => perCrossover(capital, rate, tmiE, tmiS, reinvest, isCouple, 60),
    [capital, rate, tmiE, tmiS, reinvest, isCouple]
  );

  const chartData = useMemo(() => {
    const step = duration <= 10 ? 1 : duration <= 20 ? 2 : 5;
    const pts = new Map();
    for (let y = 0; y <= duration; y += step) pts.set(y, y);
    if (crossoverYear && crossoverYear <= duration) pts.set(crossoverYear, crossoverYear);
    return [...pts.values()].sort((a, b) => a - b).map(y => {
      const pt = { année: y };
      for (const env of ENVELOPES) {
        pt[env.name] = Math.round(envNet(env.id, capital, rate, y, tmiE, tmiS, reinvest, isCouple));
      }
      return pt;
    });
  }, [capital, rate, duration, tmiE, tmiS, reinvest, isCouple, crossoverYear]);

  const formatY = v => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
    return `${v}`;
  };

  // Message contextuel PER vs PEA
  const perRow  = tableRows.find(r => r.id === 'per');
  const peaRow  = tableRows.find(r => r.id === 'pea');
  const perWins = (perRow?.net ?? 0) > (peaRow?.net ?? 0);
  const econoIR = Math.round(capital * tmiE / 100);

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

  const colorMap = { teal: 'border-teal-200 bg-teal-50 text-teal-800', amber: 'border-amber-200 bg-amber-50 text-amber-800', blue: 'border-blue-200 bg-blue-50 text-blue-800', gray: 'border-gray-200 bg-gray-50 text-gray-700' };

  return (
    <div className="flex flex-col gap-5">

      {/* Paramètres généraux */}
      <div className="flex flex-col gap-4">
        <SimSlider label="Capital à investir" value={capital} min={1_000} max={100_000} step={1_000}
          onChange={setCapital} format={v => `${fmt(v)} €`} />
        {/* Info déclarant PER — visible en mode couple uniquement */}
        {perEnvInfo.declarant && (
          <div className={`rounded-lg border px-3 py-2 text-[11px] leading-snug ${perEnvInfo.fallback ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>
            {perEnvInfo.fallback
              ? perEnvInfo.fallbackReason
              : `PER simulé sur le plafond de ${perEnvInfo.declarant} (salaire le plus élevé) : ${fmt(perEnvInfo.plafond)} €. Réglez le capital à cette valeur pour comparer à votre plafond réel.`}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <ToggleGroup label="Durée de placement" options={DURATIONS} value={duration}
            onChange={setDuration} format={v => `${v} ans`} />
          <ToggleGroup label="Rendement annuel estimé" options={RATES} value={rate}
            onChange={setRate} format={v => `${(v * 100).toFixed(0)} %`} />
        </div>
      </div>

      {/* Paramètres PER */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Hypothèses PER</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tmiDiff > 0 ? 'bg-teal-100 text-teal-700' : tmiDiff < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
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
        <div className="flex items-center justify-between pt-1 border-t border-violet-200">
          <span className="text-xs text-violet-700">Réinvestir l'économie IR ({fmt(econoIR)} €) en PEA</span>
          <button
            type="button"
            onClick={() => setReinvest(v => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${reinvest ? 'bg-teal-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${reinvest ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        {!reinvest && (
          <p className="text-[10px] text-violet-600 italic">Sans réinvestissement : l'économie IR reste en trésorerie — l'avantage PER est sous-estimé.</p>
        )}
      </div>

      {/* Message contextuel */}
      <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${colorMap[contextMsg.color]}`}>
        {contextMsg.text}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Comparatif après {duration} ans — {fmt(capital)} € à {(rate * 100).toFixed(0)} % — TMI entrée {tmiE} % / sortie {tmiS} %
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/30">
                <th className="text-left px-4 py-2 text-gray-400 font-semibold">Enveloppe</th>
                <th className="text-right px-3 py-2 text-gray-400 font-semibold whitespace-nowrap">Brut avant impôt</th>
                <th className="text-right px-3 py-2 text-gray-400 font-semibold whitespace-nowrap">Impôts / prél.</th>
                <th className="text-right px-3 py-2 text-gray-400 font-semibold whitespace-nowrap">Capital net</th>
                <th className="text-right px-3 py-2 text-gray-400 font-semibold whitespace-nowrap">Gain net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableRows.map(row => (
                <tr key={row.id} className={row.id === bestId ? 'bg-teal-50/60' : 'hover:bg-gray-50/40 transition-colors'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: row.color }} />
                      <span className="font-semibold text-gray-800">{row.name}</span>
                      {row.id === bestId && (
                        <span className="text-[9px] font-bold text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded-full">Meilleur</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 ml-4">{row.taxLabel}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-500 whitespace-nowrap">
                    {fmt(row.brut)} €
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {row.tax > 0
                      ? <span className="text-red-500">−{fmt(row.tax)} €</span>
                      : <span className="text-teal-600 font-semibold">0 €</span>}
                    {row.id === 'per' && row.bonus > 0 && (
                      <div className="text-[10px] text-violet-600 whitespace-nowrap">+{fmt(row.bonus)} € boost</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-bold font-mono tabular-nums text-gray-800 whitespace-nowrap">
                    {fmt(row.net)} €
                  </td>
                  <td className={`px-3 py-3 text-right font-bold font-mono tabular-nums whitespace-nowrap ${row.gain >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                    {row.gain >= 0 ? '+' : ''}{fmt(row.gain)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {crossoverYear && (
          <p className="px-4 py-2.5 text-[11px] text-violet-700 bg-violet-50/50 border-t border-violet-100">
            {crossoverYear <= duration
              ? `✓ PER dépasse PEA à ${crossoverYear} ans sur ce graphe`
              : `ℹ PER dépasserait PEA à ${crossoverYear} ans (au-delà de l'horizon affiché)`}
          </p>
        )}
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Évolution du capital net</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="année" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `${v}a`} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={formatY} width={38} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            {crossoverYear && crossoverYear <= duration && (
              <ReferenceLine x={crossoverYear} stroke="#8b5cf6" strokeDasharray="4 2"
                label={{ value: `PER=PEA (${crossoverYear}a)`, position: 'top', fontSize: 9, fill: '#7c3aed' }} />
            )}
            {ENVELOPES.map(env => (
              <Line key={env.id} type="monotone" dataKey={env.name} stroke={env.color}
                strokeWidth={env.id === bestId ? 2.5 : 1.5} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-400 text-center mt-2">
          Livret A taux garanti 3 %. PEA : PS 17,2 % sur gains (≥5 ans) · PFU 30 % avant.
          AV&gt;8 ans : PS 17,2 % + IR 7,5 % sur gains &gt; {isCouple ? '9 200' : '4 600'} € (abattement {isCouple ? 'couple' : 'solo'}).
          CTO : PFU 30 % sur gains.
          PER : IR {tmiS} % sur la totalité + PS 17,2 % sur plus-values{reinvest ? ` + bonus ${fmt(econoIR)} € réinvesti en PEA` : ''}.
          Simulation en capital (rente exclue).
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
          ? 'bg-teal-50 border-teal-200 text-teal-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
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
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Impact fiscal</p>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">
              {regime === 'micro' ? 'Abattement forfaitaire 30 %' : `Déduction charges (${charges} %)`}
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-teal-600">
              − {fmt(regime === 'micro' ? loyers * 0.30 : loyers * charges / 100)} €
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">Revenu net imposable</span>
            <span className="text-sm font-bold font-mono tabular-nums text-gray-800">{fmt(res.net)} €</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">IR supplémentaire (TMI {tmi} %)</span>
            <span className="text-sm font-bold font-mono tabular-nums text-red-500">{fmt(res.ir)} €</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">Prélèvements sociaux (17,2 %)</span>
            <span className="text-sm font-bold font-mono tabular-nums text-red-500">{fmt(res.ps)} €</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-red-50/40">
            <span className="text-sm font-semibold text-gray-700">Coût fiscal total</span>
            <div className="text-right">
              <span className="text-sm font-bold font-mono tabular-nums text-red-600">{fmt(res.total)} €</span>
              <span className="text-[10px] text-gray-400 ml-2">({res.tauxEff} % des loyers)</span>
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
            <div key={r} className={`rounded-2xl border p-3.5 ${isBest ? 'border-teal-200 bg-teal-50/50' : 'border-gray-100 bg-white shadow-sm'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${isBest ? 'text-teal-600' : 'text-gray-400'}`}>
                {r === 'micro' ? 'Micro-foncier' : 'Régime réel'}
                {isBest && ' ✓'}
              </p>
              <p className="text-xs text-gray-500">
                Net imposable : <span className="font-bold text-gray-700 font-mono">{fmt(net)} €</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
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

      <p className="text-[10px] text-gray-400 text-center">
        Simulation indicative. Loyers meublés (BIC/LMNP) non inclus dans ce simulateur.
      </p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'per',        label: 'PER',        Icon: TrendingUp },
  { id: 'enveloppes', label: 'Enveloppes', Icon: Layers     },
  { id: 'foncier',    label: 'Foncier',    Icon: Home       },
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
    const plafondBrut = Math.max(Math.round(rni * 0.1), MIN_PLAFOND);
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
    const brut10D1      = Math.round(rniD1 * 0.1);
    const plafondBrutD1 = Math.max(brut10D1, MIN_PLAFOND);
    const plafondNetD1  = Math.max(0, plafondBrutD1 - peroD1);
    const perCalcD1 = { rni: rniD1, pero: peroD1, brut10: brut10D1, plafondBrut: plafondBrutD1, plafondNet: plafondNetD1 };

    // Plafond PER D2 (couple uniquement)
    const rniD2         = pp.rniD2 || 0;
    const peroD2        = pp.peroD2 || 0;
    const brut10D2      = Math.round(rniD2 * 0.1);
    const plafondBrutD2 = Math.max(brut10D2, MIN_PLAFOND);
    const plafondNetD2  = Math.max(0, plafondBrutD2 - peroD2);
    const perCalcD2 = isCouple ? { rni: rniD2, pero: peroD2, brut10: brut10D2, plafondBrut: plafondBrutD2, plafondNet: plafondNetD2 } : null;

    const selectedCalc = (isCouple && perDeclarant === 'd2') ? perCalcD2 : perCalcD1;

    const baseFoyer = baseIRFoyer(pp);
    const tmi       = hasData ? getTMI(baseFoyer, parts) : 30;

    return {
      rni: pp.rniFoyer || 65_000, tmi,
      parts,
      plafond:      hasData ? selectedCalc.plafondNet : MIN_PLAFOND,
      isDefault:    !hasData,
      isCouple,     perCalcD1, perCalcD2, selectedCalc,
      salairesBrutD1: pp.salairesBrutImposableD1 || 0,
      salairesBrutD2: pp.salairesBrutImposableD2 || 0,
    };
  }, [mode, manualTMI, manualParts, perCalc, state.parsedProfile, perDeclarant]);

  return (
    <div className="flex flex-col gap-6">

      <div>
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Outils interactifs</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Simulateurs fiscaux</h1>
        <p className="text-sm text-gray-500 mt-1">
          Visualisez l'impact de vos décisions en temps réel.
        </p>
      </div>

      {/* Toggle mode */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200',
              mode === id
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Saisie manuelle */}
      {mode === 'manual' && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Vos paramètres</p>

          {/* Ligne 1 : TMI + RNI + parts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">TMI actuel</label>
              <select
                value={manualTMI}
                onChange={e => setManualTMI(Number(e.target.value))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-teal-400 bg-white"
              >
                {TMI_OPTIONS.map(t => <option key={t} value={t}>{t} %</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">RNI foyer (€)</label>
              <input
                type="number"
                value={manualRNI}
                onChange={e => setManualRNI(e.target.value)}
                placeholder="65 000"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-teal-400"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">Parts fiscales</label>
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {[1, 2].map(n => (
                  <button key={n} type="button" onClick={() => setManualParts(n)}
                    className={['flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                      manualParts === n ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                    ].join(' ')}>
                    {n} part{n > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Calcul automatique plafond PER */}
          {perCalc.rni > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 flex flex-col gap-1.5 text-xs">
              <p className="font-bold text-blue-600 flex items-center gap-1.5">💡 Plafond PER calculé automatiquement</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600 mt-0.5">
                <span>10 % × votre RNI</span>
                <span className="font-mono font-semibold text-gray-800 text-right">{fmt(Math.round(perCalc.rni * 0.1))} €</span>
                <span>Minimum légal (10 % PASS)</span>
                <span className="font-mono font-semibold text-gray-800 text-right">{fmt(MIN_PLAFOND)} €</span>
                <span className="font-semibold text-blue-700">→ Plafond brut retenu</span>
                <span className="font-mono font-bold text-blue-700 text-right">{fmt(perCalc.plafondBrut)} €</span>
                {parseInt(manualPERO, 10) > 0 && <>
                  <span className="text-amber-600">− PERO employeur</span>
                  <span className="font-mono font-semibold text-amber-600 text-right">− {fmt(parseInt(manualPERO, 10))} €</span>
                </>}
                {parseInt(manualAnterieurs, 10) > 0 && <>
                  <span className="text-teal-600">+ Plafonds antérieurs</span>
                  <span className="font-mono font-semibold text-teal-600 text-right">+ {fmt(parseInt(manualAnterieurs, 10))} €</span>
                </>}
                <span className="font-bold text-teal-700 border-t border-blue-200 pt-1">→ Plafond disponible net</span>
                <span className="font-mono font-bold text-teal-700 border-t border-blue-200 pt-1 text-right">{fmt(perCalc.plafondTotal)} €</span>
              </div>
            </div>
          )}

          {/* Champs optionnels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">
                Cotisations PERO employeur (€)
                <span className="ml-1 text-gray-400 font-normal">— optionnel</span>
              </label>
              <input
                type="number"
                value={manualPERO}
                onChange={e => setManualPERO(e.target.value)}
                placeholder="0"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-teal-400"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                Plafonds antérieurs N-3/N-2/N-1 (€)
                <span
                  className="ml-1 text-gray-400 font-normal cursor-help"
                  title="Vous pouvez mobiliser vos plafonds des 3 années précédentes si non utilisés (art. 163 quatervicies II CGI). Ces plafonds apparaissent sur votre avis d'imposition."
                >ⓘ</span>
              </label>
              <input
                type="number"
                value={manualAnterieurs}
                onChange={e => setManualAnterieurs(e.target.value)}
                placeholder="0"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Profil auto — détail plafond PER */}
      {mode === 'profile' && tab === 'per' && !profileData.isDefault && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Plafond PER — données du profil</p>

          {/* Toggle D1 / D2 pour couple */}
          {profileData.isCouple && (
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
              {[{ id: 'd1', label: 'Déclarant 1' }, { id: 'd2', label: 'Déclarant 2' }].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPerDeclarant(id)}
                  className={[
                    'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                    perDeclarant === id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Calcul étape par étape */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 flex flex-col gap-1.5 text-xs">
            <p className="font-bold text-blue-600 flex items-center gap-1.5">💡 Plafond PER calculé automatiquement</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600 mt-0.5">
              <span>RNI {profileData.isCouple ? (perDeclarant === 'd1' ? 'D1' : 'D2') : 'foyer'}</span>
              <span className="font-mono font-semibold text-gray-800 text-right">{fmt(profileData.selectedCalc.rni)} €</span>
              <span>10 % × RNI</span>
              <span className="font-mono font-semibold text-gray-800 text-right">{fmt(profileData.selectedCalc.brut10)} €</span>
              <span>Minimum légal (10 % PASS)</span>
              <span className="font-mono font-semibold text-gray-800 text-right">{fmt(MIN_PLAFOND)} €</span>
              <span className="font-semibold text-blue-700">→ Plafond brut retenu</span>
              <span className="font-mono font-bold text-blue-700 text-right">{fmt(profileData.selectedCalc.plafondBrut)} €</span>
              {profileData.selectedCalc.pero > 0 && <>
                <span className="text-amber-600">− PERO employeur</span>
                <span className="font-mono font-semibold text-amber-600 text-right">− {fmt(profileData.selectedCalc.pero)} €</span>
              </>}
              <span className="font-bold text-teal-700 border-t border-blue-200 pt-1">→ Plafond disponible net</span>
              <span className="font-mono font-bold text-teal-700 border-t border-blue-200 pt-1 text-right">{fmt(profileData.selectedCalc.plafondNet)} €</span>
            </div>
          </div>

          {/* Foyer consolidé (couple uniquement) */}
          {profileData.isCouple && profileData.perCalcD1 && profileData.perCalcD2 && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/40 px-4 py-3">
              <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-2">
                Plafond PER du foyer consolidé
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>Plafond disponible D1</span>
                <span className="font-mono font-semibold text-gray-800 text-right">{fmt(profileData.perCalcD1.plafondNet)} €</span>
                <span>Plafond disponible D2</span>
                <span className="font-mono font-semibold text-gray-800 text-right">{fmt(profileData.perCalcD2.plafondNet)} €</span>
                <span className="font-bold text-teal-700 border-t border-teal-200 pt-1 mt-0.5">→ Plafond mutualisable foyer</span>
                <span className="font-mono font-bold text-teal-700 border-t border-teal-200 pt-1 mt-0.5 text-right">
                  {fmt(profileData.perCalcD1.plafondNet + profileData.perCalcD2.plafondNet)} €
                </span>
              </div>
              <p className="text-[9px] text-teal-500 mt-2 leading-snug">
                art. 163 quatervicies II CGI — chaque déclarant utilise son propre plafond individuel
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabs simulateur */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200',
              tab === id
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenu simulateur */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        {tab === 'per'        && <SimPER        data={profileData} />}
        {tab === 'enveloppes' && <SimEnveloppes data={profileData} />}
        {tab === 'foncier'    && <SimFoncier    data={profileData} />}
      </div>

    </div>
  );
}
