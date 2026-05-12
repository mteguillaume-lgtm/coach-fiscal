import { useState, useMemo }      from 'react';
import { useNavigate }             from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import toast                       from 'react-hot-toast';
import { TrendingUp, Layers, Home, MessageCircle, Save, ChevronRight, FileText, PenLine } from 'lucide-react';

import { useApp }  from '../context/AppContext';
import Button      from '../components/Button';

const TMI_OPTIONS  = [0, 11, 30, 41, 45];
const PASS_2025    = 47_100;
const MIN_PLAFOND  = Math.round(PASS_2025 * 0.1); // 4 710 €

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = n => Math.round(n).toLocaleString('fr-FR');

function extractNum(profile, rx) {
  if (!profile) return null;
  const m = profile.match(rx);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[\s.]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function fromProfile(profile) {
  return {
    rni:       extractNum(profile, /rni[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i)
            || extractNum(profile, /revenu net imposable[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i),
    tmi:       extractNum(profile, /tmi[^%\d]{0,20}(\d{1,2})\s*%/i),
    perPlafond: extractNum(profile, /plafond[^€]{0,40}(\d[\d\s.]{1,10})\s*€/i),
  };
}

// Tranches TMI 2025 (par part fiscale, indicatif)
const BRACKETS = [
  { rate: 0,  max: 11_497  },
  { rate: 11, max: 29_315  },
  { rate: 30, max: 83_823  },
  { rate: 41, max: 180_294 },
  { rate: 45, max: Infinity },
];
const getTMI = rni => (BRACKETS.find(b => rni <= b.max) ?? BRACKETS.at(-1)).rate;

// Capital net après impôts pour chaque enveloppe
function envNet(id, P, r, t, tmi) {
  const rate = id === 'livretA' ? 0.03 : r;
  const Brut = P * Math.pow(1 + rate, t);
  const G    = Brut - P;
  const T    = tmi / 100;
  switch (id) {
    case 'livretA': return Brut;
    case 'pea':     return Brut - G * 0.172;
    case 'av8':     return Brut - G * 0.172 - Math.max(0, G - 4600) * 0.075;
    case 'per': {
      // Déduction à l'entrée + taxation pleine à la sortie (hypothèse TMI stable)
      const deduction = P * T;
      const taxExit   = Brut * T + G * 0.172;
      return Brut - taxExit + deduction;
    }
    case 'cto':     return Brut - G * 0.30;
    default:        return Brut;
  }
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

function ProfileBanner({ items, isDefault }) {
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
  const navigate = useNavigate();
  const profData = data;

  const [versement, setVersement] = useState(
    () => Math.round(Math.min(profData.plafond, 5000) / 100) * 100
  );

  const res = useMemo(() => {
    const economie  = Math.round(versement * (profData.tmi / 100));
    const effort    = versement - economie;
    const newRNI    = profData.rni - versement;
    const newTMI    = getTMI(newRNI);
    const rendement = versement > 0 ? Math.round((economie / versement) * 100) : 0;
    return { economie, effort, newRNI, newTMI, rendement };
  }, [versement, profData]);

  const handleChat = () => {
    const msg = `Simulation PER : versement de ${fmt(versement)} € (TMI ${profData.tmi} %, plafond disponible ${fmt(profData.plafond)} €). Économie IR estimée : ${fmt(res.economie)} €, effort réel net : ${fmt(res.effort)} €, rendement immédiat ${res.rendement} %. Quels PER recommandes-tu et comment optimiser ce versement avant le 31/12 ?`;
    navigate('/chat', { state: { prefill: msg } });
  };

  const rows = [
    { label: 'Économie IR immédiate',  value: `${fmt(res.economie)} €`, color: 'text-teal-700', hi: true  },
    { label: 'Effort réel net',        value: `${fmt(res.effort)} €`,   color: 'text-gray-800', hi: false },
    { label: 'Nouveau RNI estimé',     value: `${fmt(res.newRNI)} €`,   color: 'text-gray-800', hi: false },
    { label: 'Rendement immédiat',     value: `${res.rendement} %`,     color: 'text-teal-600', hi: false },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ProfileBanner
        isDefault={profData.isDefault}
        items={[
          { label: 'RNI foyer',    value: `${fmt(profData.rni)} €`    },
          { label: 'TMI actuel',   value: `${profData.tmi} %`          },
          { label: 'Plafond PER',  value: `${fmt(profData.plafond)} €` },
        ]}
      />

      <SimSlider
        label="Montant à verser sur le PER"
        value={versement}
        min={0}
        max={profData.plafond}
        step={100}
        onChange={setVersement}
        format={v => `${fmt(v)} €`}
      />

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Résultats en temps réel</p>
          <span className="text-xs font-mono text-gray-400">Versement : {fmt(versement)} €</span>
        </div>
        <div className="divide-y divide-gray-50">
          {rows.map(({ label, value, color, hi }) => (
            <div key={label} className={`flex items-center justify-between px-4 py-3 ${hi ? 'bg-teal-50/40' : ''}`}>
              <span className="text-sm text-gray-600">{label}</span>
              <span className={`text-sm font-bold font-mono tabular-nums ${color}`}>{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">TMI après versement</span>
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

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1"
          onClick={() => saveSimulation(`PER — ${fmt(versement)} € → économie ${fmt(res.economie)} €`)}>
          <Save size={13} /> Sauvegarder
        </Button>
        <Button variant="primary" size="sm" className="flex-1" onClick={handleChat}>
          <MessageCircle size={13} /> Discuter de cette simulation
        </Button>
      </div>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        Simulation indicative (1 part fiscale). L'impact réel sur le TMI dépend du quotient familial.
      </p>
    </div>
  );
}

// ─── Simulateur Enveloppes ────────────────────────────────────────────────────

function SimEnveloppes({ data }) {
  const navigate = useNavigate();
  const tmi = data.tmi;

  const [capital,  setCapital]  = useState(10_000);
  const [duration, setDuration] = useState(20);
  const [rate,     setRate]     = useState(0.05);

  const tableRows = useMemo(() => ENVELOPES.map(env => {
    const net  = Math.round(envNet(env.id, capital, rate, duration, tmi));
    const gain = net - capital;
    return { ...env, net, gain };
  }), [capital, rate, duration, tmi]);

  const bestId = useMemo(
    () => tableRows.reduce((b, r) => r.net > b.net ? r : b, tableRows[0])?.id,
    [tableRows]
  );

  const chartData = useMemo(() => {
    const step = duration <= 10 ? 1 : duration <= 20 ? 2 : 5;
    const pts = [];
    for (let y = 0; y <= duration; y += step) {
      const pt = { année: y };
      for (const env of ENVELOPES) {
        pt[env.name] = Math.round(envNet(env.id, capital, rate, y, tmi));
      }
      pts.push(pt);
    }
    return pts;
  }, [capital, rate, duration, tmi]);

  const formatY = v => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
    return `${v}`;
  };

  const handleChat = () => {
    const best = tableRows.find(r => r.id === bestId);
    const msg = `Simulation enveloppes : ${fmt(capital)} € investis pendant ${duration} ans à ${(rate * 100).toFixed(0)} % annuels (TMI ${tmi} %). Meilleure option estimée : ${best?.name} avec ${fmt(best?.net || 0)} € nets. Peux-tu confirmer cette analyse et m'aider à choisir ?`;
    navigate('/chat', { state: { prefill: msg } });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <SimSlider
          label="Capital à investir"
          value={capital}
          min={1_000}
          max={100_000}
          step={1_000}
          onChange={setCapital}
          format={v => `${fmt(v)} €`}
        />
        <div className="grid grid-cols-2 gap-4">
          <ToggleGroup
            label="Durée de placement"
            options={DURATIONS}
            value={duration}
            onChange={setDuration}
            format={v => `${v} ans`}
          />
          <ToggleGroup
            label="Rendement annuel estimé"
            options={RATES}
            value={rate}
            onChange={setRate}
            format={v => `${(v * 100).toFixed(0)} %`}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Comparatif après {duration} ans — TMI {tmi} %
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-gray-400 font-semibold">Enveloppe</th>
                <th className="text-right px-3 py-2.5 text-gray-400 font-semibold">Capital net</th>
                <th className="text-right px-3 py-2.5 text-gray-400 font-semibold">Gain net</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-semibold hidden sm:table-cell">Fiscalité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableRows.map(row => (
                <tr key={row.id} className={row.id === bestId ? 'bg-teal-50/60' : 'hover:bg-gray-50/40 transition-colors'}>
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: row.color }} />
                      {row.name}
                      {row.id === bestId && (
                        <span className="text-[9px] font-bold text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded-full">
                          Meilleur
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-bold font-mono tabular-nums text-gray-800">
                    {fmt(row.net)} €
                  </td>
                  <td className={`px-3 py-3 text-right font-bold font-mono tabular-nums ${row.gain >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                    {row.gain >= 0 ? '+' : ''}{fmt(row.gain)} €
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">{row.taxLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            {ENVELOPES.map(env => (
              <Line
                key={env.id}
                type="monotone"
                dataKey={env.name}
                stroke={env.color}
                strokeWidth={env.id === bestId ? 2.5 : 1.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-400 text-center mt-2">
          Livret A taux fixe 3 %. PER avec hypothèse TMI identique entrée/sortie ({tmi} %).
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1"
          onClick={() => saveSimulation(`Enveloppes — ${fmt(capital)} € × ${duration} ans à ${(rate * 100).toFixed(0)} %`)}>
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

  // Champs saisie manuelle
  const [manualTMI,        setManualTMI]        = useState(30);
  const [manualRNI,        setManualRNI]        = useState('65000');
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
      return {
        rni:       perCalc.rni || 65_000,
        tmi:       manualTMI,
        plafond:   perCalc.plafondTotal || 10_000,
        isDefault: false,
      };
    }
    const raw = fromProfile(state.profile);
    const isDefault = !raw.rni && !raw.tmi && !raw.perPlafond;
    return {
      rni:     raw.rni        || 65_000,
      tmi:     raw.tmi        || 30,
      plafond: raw.perPlafond || 10_000,
      isDefault,
    };
  }, [mode, manualTMI, perCalc, state.profile]);

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

          {/* Ligne 1 : TMI + RNI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
