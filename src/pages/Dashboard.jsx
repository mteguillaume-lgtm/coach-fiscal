import { useState, useMemo }   from 'react';
import { useNavigate, Link }    from 'react-router-dom';
import { useApp }               from '../context/AppContext';
import { detectOpportunities }  from '../lib/opportunitiesDetector';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ClipboardList, Calculator, BookOpen, MessageSquare,
  ChevronRight, FileText, User, Users,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt  = n => Math.round(n || 0).toLocaleString('fr-FR');
const fmtE = n => (n || 0) > 0 ? `${fmt(n)} €` : '—';

/** Barème IR 2025 approximatif (décote non appliquée). */
function calcIR(rni, parts = 1) {
  if ((rni || 0) <= 0 || parts <= 0) return 0;
  const base = rni / parts;
  const TRANCHES = [
    [0,      11497,    0    ],
    [11497,  29315,    0.11 ],
    [29315,  83823,    0.30 ],
    [83823,  180294,   0.41 ],
    [180294, Infinity, 0.45 ],
  ];
  let tax = 0;
  for (const [lo, hi, rate] of TRANCHES) {
    if (base <= lo) break;
    tax += (Math.min(base, hi) - lo) * rate;
  }
  return Math.round(tax * parts);
}

function diversificationScore(p) {
  let score = 0;
  if ((p.epargneLiquide  || 0) > 0) score += 2;
  if ((p.peaD1  || 0) + (p.peaD2  || 0) > 0) score += 2;
  if ((p.avD1   || 0) + (p.avD2   || 0) > 0) score += 2;
  if ((p.percoD1 || 0) > 0) score += 1;
  if ((p.immoTotal || 0) > 0) score += 2;
  if ((p.cryptoTotal || 0) > 0) score += 1;
  return Math.min(score, 10);
}

// ─── CircularGauge ────────────────────────────────────────────────────────────

function CircularGauge({ value, max = 100, label, sublabel, color = '#0d9488', size = 88 }) {
  const r    = 32;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(Math.max(value ?? 0, 0), max) / max;
  const dash = pct * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="text-center -mt-[72px] mb-[60px] flex flex-col items-center justify-center" style={{ height: size }}>
        <span className="text-lg font-bold text-gray-900 leading-none">{label}</span>
        {sublabel && <span className="text-[10px] text-gray-400 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}

// ─── PieTooltip ───────────────────────────────────────────────────────────────

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-800">{name}</p>
      <p className="text-teal-600 font-bold mt-0.5">{fmt(value)} €</p>
    </div>
  );
}

// ─── TimelineItem ─────────────────────────────────────────────────────────────

function TimelineItem({ label, date, color = 'teal', urgent }) {
  const colors = {
    teal:  { dot: 'bg-teal-500',  text: 'text-teal-700',  bg: 'bg-teal-50',  border: 'border-teal-200' },
    red:   { dot: 'bg-red-500',   text: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200'  },
    amber: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    gray:  { dot: 'bg-gray-400',  text: 'text-gray-600',  bg: 'bg-gray-50',  border: 'border-gray-200' },
  };
  const c = colors[color] ?? colors.gray;
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${c.border} ${c.bg} px-4 py-3`}>
      <div className={`shrink-0 w-2 h-2 rounded-full ${c.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{label}</p>
        {date && <p className={`text-[10px] font-medium ${c.text} mt-0.5`}>{date}</p>}
      </div>
      {urgent && (
        <span className="shrink-0 text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
          Urgent
        </span>
      )}
    </div>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? 'text-teal-700' : 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'd1',    label: 'Déclarant 1', short: 'D1',    Icon: User  },
    { id: 'd2',    label: 'Déclarant 2', short: 'D2',    Icon: User  },
    { id: 'foyer', label: 'Vue foyer',   short: 'Foyer', Icon: Users },
  ];
  return (
    <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
      {tabs.map(({ id, label, short, Icon }) => (
        <button key={id} type="button" onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${
            active === id
              ? 'bg-white shadow-sm text-teal-700 border border-teal-100'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Icon size={13} />
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{short}</span>
        </button>
      ))}
    </div>
  );
}

// ─── DeclarantTab ─────────────────────────────────────────────────────────────

function DeclarantTab({ rev, ep, fiscal }) {
  const totalEp = (ep.livretA||0) + (ep.ldds||0) + (ep.lep||0) + (ep.livretPlus||0)
                + (ep.pel||0) + (ep.pea||0) + (ep.av||0) + (ep.perco||0) + (ep.crypto||0);

  const epLines = [
    { label: 'Livret A',        v: ep.livretA    },
    { label: 'LDDS',            v: ep.ldds       },
    { label: 'LEP',             v: ep.lep        },
    { label: 'Livret bancaire', v: ep.livretPlus },
    { label: 'PEL',             v: ep.pel        },
    { label: 'PEA',             v: ep.pea        },
    { label: 'Assurance-vie',   v: ep.av         },
    { label: 'PER versements',  v: ep.perco      },
    { label: 'Crypto (wallet)', v: ep.crypto     },
  ].filter(x => (x.v || 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Revenus */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Revenus 2025</h3>
        <InfoRow label="Net imposable"   value={fmtE(rev.net)}  />
        <InfoRow label="Brut imposable"  value={fmtE(rev.brut)} />
        <InfoRow label="PAS prélevé"     value={fmtE(rev.pas)}  />
        <InfoRow label="Taux PAS"        value={rev.taux ? `${rev.taux} %` : '—'} />
        {(rev.pero || 0) > 0 && (
          <InfoRow label="PERO cotisations 2025" value={fmtE(rev.pero)} highlight />
        )}
      </section>

      {/* Épargne */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Épargne et placements</h3>
        {epLines.length > 0 ? (
          <>
            {epLines.map(({ label, v }) => <InfoRow key={label} label={label} value={fmtE(v)} />)}
            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700">Total épargne</span>
              <span className="text-sm font-bold text-teal-700">{fmtE(totalEp)}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 py-1">Aucune épargne détectée.</p>
        )}
      </section>

      {/* Fiscal */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Situation fiscale</h3>
        <InfoRow label="RNI" value={fmtE(fiscal.rni)} />
        {(fiscal.plafondPer || 0) > 0 && (
          <InfoRow label="Plafond PER disponible" value={fmtE(fiscal.plafondPer)} highlight />
        )}
      </section>
    </div>
  );
}

// ─── ContributionTable ────────────────────────────────────────────────────────

function ContributionTable({ p, sectionNum }) {
  const rniD1    = p.rniD1    || 0;
  const rniD2    = p.rniD2    || 0;
  const rniFoyer = p.rniFoyer || 0;
  const pasD1    = p.pasD1    || 0;
  const pasD2    = p.pasD2    || 0;
  const parts    = p.parts    || 2;
  const irNet    = p.irNet    || 0;

  if (!rniFoyer) return null;

  const irEstime  = irNet > 0 ? irNet : calcIR(rniFoyer, parts);
  const ratioD1   = rniFoyer > 0 ? rniD1 / rniFoyer : 0.5;
  const ratioD2   = rniFoyer > 0 ? rniD2 / rniFoyer : 0.5;
  const contribD1 = Math.round(irEstime * ratioD1);
  const contribD2 = Math.round(irEstime * ratioD2);
  const regD1     = pasD1 - contribD1; // positif = trop prélevé → remboursé
  const regD2     = pasD2 - contribD2;

  const irD1Solo   = calcIR(rniD1, 1);
  const irD2Solo   = calcIR(rniD2, 1);
  const gainCouple = Math.max(0, irD1Solo + irD2Solo - irEstime);

  const fmtReg   = v => {
    if (Math.abs(v) < 10) return '≈ 0 €';
    return (v > 0 ? '+' : '') + fmt(v) + ' €';
  };
  const regColor = v =>
    Math.abs(v) < 10 ? 'text-gray-400' : v > 0 ? 'text-green-600' : 'text-red-500';

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
      <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 flex-wrap">
        <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold shrink-0">
          {sectionNum}
        </span>
        Répartition fiscale du foyer
        {irNet === 0 && (
          <span className="text-[10px] font-normal text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            IR estimé
          </span>
        )}
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[300px]">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="py-2 font-medium text-left pr-4">Indicateur</th>
              <th className="py-2 font-medium text-right pr-4">D1</th>
              <th className="py-2 font-medium text-right">D2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="py-2.5 text-gray-600 pr-4">RNI</td>
              <td className="py-2.5 text-right font-semibold text-gray-800 pr-4">{fmtE(rniD1)}</td>
              <td className="py-2.5 text-right font-semibold text-gray-800">{fmtE(rniD2)}</td>
            </tr>
            <tr>
              <td className="py-2.5 text-gray-600 pr-4">Quote-part IR</td>
              <td className="py-2.5 text-right font-semibold text-gray-800 pr-4">{Math.round(ratioD1 * 100)} %</td>
              <td className="py-2.5 text-right font-semibold text-gray-800">{Math.round(ratioD2 * 100)} %</td>
            </tr>
            <tr>
              <td className="py-2.5 text-gray-600 pr-4">Contribution équitable</td>
              <td className="py-2.5 text-right font-semibold text-gray-800 pr-4">{fmtE(contribD1)}</td>
              <td className="py-2.5 text-right font-semibold text-gray-800">{fmtE(contribD2)}</td>
            </tr>
            <tr>
              <td className="py-2.5 text-gray-600 pr-4">PAS prélevé 2025</td>
              <td className="py-2.5 text-right font-semibold text-gray-800 pr-4">{fmtE(pasD1)}</td>
              <td className="py-2.5 text-right font-semibold text-gray-800">{fmtE(pasD2)}</td>
            </tr>
            <tr>
              <td className="py-2.5 text-gray-600 pr-4">Régularisation estimée</td>
              <td className={`py-2.5 text-right font-bold pr-4 ${regColor(regD1)}`}>{fmtReg(regD1)}</td>
              <td className={`py-2.5 text-right font-bold ${regColor(regD2)}`}>{fmtReg(regD2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {gainCouple > 100 && (
        <div className="flex items-center justify-between rounded-xl bg-teal-50 border border-teal-200 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-teal-800">Gain du quotient conjugal</p>
            <p className="text-[10px] text-teal-600 mt-0.5">Économie vs déclarations séparées</p>
          </div>
          <span className="text-base font-bold text-teal-700">~{fmt(gainCouple)} €</span>
        </div>
      )}

      {irNet === 0 && (
        <p className="text-[10px] text-gray-400 leading-relaxed">
          IR estimé d'après le barème 2025 (décote non appliquée). Utilisez le simulateur pour l'IR exact.
        </p>
      )}
    </section>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#0d9488', '#14b8a6', '#94a3b8', '#f59e0b'];

export default function Dashboard() {
  const { state }  = useApp();
  const navigate   = useNavigate();
  const p          = state.parsedProfile ?? {};
  const isCouple   = p.mode === 'couple';

  const [activeTab, setActiveTab] = useState('foyer');

  const opps     = useMemo(() => detectOpportunities(p), [p]);
  const divScore = useMemo(() => diversificationScore(p), [p]);

  // ── Pie data ──
  const pieData = [
    { name: 'Épargne liquide',    value: p.epargneLiquide   ?? 0 },
    { name: 'Épargne long terme', value: p.epargneLongTerme ?? 0 },
    { name: 'Immobilier',         value: p.immoTotal        ?? 0 },
    { name: 'Crypto',             value: p.cryptoTotal      ?? 0 },
  ].filter(d => d.value > 0);

  const totalPat = (p.epargneLiquide ?? 0) + (p.epargneLongTerme ?? 0)
                 + (p.immoTotal ?? 0) + (p.cryptoTotal ?? 0);

  const tmi      = p.tmi ?? 0;
  const tmiColor = tmi > 30 ? '#ef4444' : tmi === 30 ? '#f59e0b' : '#0d9488';

  const timeline = useMemo(() => {
    const items = [];
    opps.filter(o => o.urgence === 'immediate').slice(0, 3)
      .forEach(o => items.push({ label: o.titre, date: 'À faire maintenant', color: 'red', urgent: true }));
    opps.filter(o => o.urgence === 'avant_decembre').slice(0, 2)
      .forEach(o => items.push({ label: o.titre, date: 'Avant le 31 décembre', color: 'amber' }));
    items.push({ label: 'Déclaration de revenus 2025', date: '31 mai 2026 — date limite', color: 'teal' });
    opps.filter(o => o.urgence === 'long_terme').slice(0, 2)
      .forEach(o => items.push({ label: o.titre, date: 'Long terme', color: 'gray' }));
    return items;
  }, [opps]);

  const topOpps = opps.slice(0, 3);

  // ── Declarant data objects ──
  const d1Rev = { net: p.salaireNetImposableD1, brut: p.salairesBrutImposableD1, pas: p.pasD1, taux: p.tauxPasD1, pero: p.peroD1 };
  const d2Rev = { net: p.salaireNetImposableD2, brut: p.salairesBrutImposableD2, pas: p.pasD2, taux: p.tauxPasD2, pero: p.peroD2 };
  const d1Ep  = { livretA: p.livretAD1, ldds: p.lddsD1, lep: p.lepD1, livretPlus: p.livretPlusD1, pel: p.pelD1, pea: p.peaD1, av: p.avD1, perco: p.percoD1, crypto: p.cryptoD1 };
  const d2Ep  = { livretA: p.livretAD2, ldds: p.lddsD2, lep: p.lepD2, livretPlus: p.livretPlusD2, pel: p.pelD2, pea: p.peaD2, av: p.avD2, perco: p.percoD2, crypto: p.cryptoD2 };
  const d1Fis = { rni: p.rniD1, plafondPer: p.plafondPerD1 };
  const d2Fis = { rni: p.rniD2, plafondPer: p.plafondPerD2 };

  // ── Section numbers dynamiques ──
  const n = (solo, couple) => isCouple ? couple : solo;

  // ── Vue foyer ──
  const foyerView = (
    <div className="flex flex-col gap-8">

      {/* Section 1 : Patrimoine */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">1</span>
          Répartition du patrimoine
        </h2>
        {totalPat > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={80}
                    paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Total</span>
                <span className="text-sm font-bold text-gray-900 leading-tight">{fmt(totalPat)} €</span>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 gap-2 w-full">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-gray-600">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">{fmt(d.value)} €</span>
                    <span className="text-[10px] text-gray-400">{Math.round(d.value / totalPat * 100)} %</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-6 text-center">
            <p className="text-sm text-gray-500">Aucune donnée patrimoniale détectée dans votre profil.</p>
            <button type="button" onClick={() => navigate('/profile')}
              className="mt-2 text-xs text-teal-600 font-semibold hover:underline">
              Voir le profil →
            </button>
          </div>
        )}
      </section>

      {/* Section 2 : Indicateurs clés */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">2</span>
          Indicateurs clés
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {/* TMI */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <CircularGauge value={tmi} max={45} label={`${tmi} %`} sublabel="TMI" color={tmiColor} />
            <p className="text-[10px] text-center text-gray-500 leading-tight">Tranche marginale<br />d'imposition</p>
          </div>
          {/* Plafond PER */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
            {(() => {
              const plaf    = p.plafondPerD1 || p.plafondPerTotal || 0;
              const rni     = p.rniFoyer || 0;
              const pctPer  = plaf > 0 && rni > 0 ? Math.round(plaf / rni * 100) : null;
              return (
                <CircularGauge value={pctPer ?? 0} max={30}
                  label={pctPer != null ? `${pctPer} %` : '—'} sublabel="PER" color="#8b5cf6" />
              );
            })()}
            <p className="text-[10px] text-center text-gray-500 leading-tight">Plafond PER<br />du RNI</p>
          </div>
          {/* Diversification */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <CircularGauge value={divScore} max={10} label={`${divScore}/10`} sublabel="Diversif." color="#f59e0b" />
            <p className="text-[10px] text-center text-gray-500 leading-tight">Score de<br />diversification</p>
          </div>
        </div>
      </section>

      {/* Section 3 (couple) : Répartition fiscale */}
      {isCouple && <ContributionTable p={p} sectionNum="3" />}

      {/* Section Opportunités */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">
              {n('3', '4')}
            </span>
            Opportunités prioritaires
            {opps.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold">
                {opps.length}
              </span>
            )}
          </h2>
          {opps.length > 3 && (
            <Link to="/opportunites" className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700">
              Voir tout <ChevronRight size={13} />
            </Link>
          )}
        </div>
        {topOpps.length > 0 ? (
          <div className="flex flex-col gap-3">
            {topOpps.map(opp => {
              const typeColors = { gain: 'border-teal-200 bg-teal-50', risque: 'border-red-200 bg-red-50', action: 'border-blue-200 bg-blue-50' };
              const typeLabels = { gain: '💡 Gain', risque: '🔴 Risque', action: '🔵 Action' };
              return (
                <div key={opp.id} className={`rounded-2xl border ${typeColors[opp.type]} p-4 flex items-start gap-3`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold">{typeLabels[opp.type]}</span>
                      <span className="text-[10px] text-gray-500">{opp.impact}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{opp.titre}</p>
                  </div>
                  <button type="button"
                    onClick={() => navigate('/chat', { state: { prefill: opp.questionChat } })}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-teal-600 border border-teal-200 bg-white rounded-lg px-2.5 py-1.5 hover:bg-teal-50 transition-colors">
                    <MessageSquare size={11} /> Discuter
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-5 text-center">
            <p className="text-sm text-gray-500">Aucune opportunité détectée pour l'instant.</p>
          </div>
        )}
      </section>

      {/* Section Timeline */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">
            {n('4', '5')}
          </span>
          Prochaines étapes
        </h2>
        <div className="flex flex-col gap-2">
          {timeline.map((item, i) => <TimelineItem key={i} {...item} />)}
        </div>
      </section>

      {/* Section Liens rapides */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">
            {n('5', '6')}
          </span>
          Accès rapide
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/checklist',   Icon: ClipboardList, label: 'Checklist',   desc: 'Documents à préparer' },
            { to: '/simulator',   Icon: Calculator,    label: 'Simulateurs', desc: 'PER, enveloppes, foncier' },
            { to: '/declaration', Icon: BookOpen,      label: 'Déclaration', desc: 'Guide impôts.gouv.fr' },
            { to: '/chat',        Icon: MessageSquare, label: 'Conseil IA',  desc: 'Questions à Claude' },
          ].map(({ to, Icon, label, desc }) => (
            <Link key={to} to={to}
              className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 hover:border-teal-300 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-xl bg-teal-gradient flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Icon size={18} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">{label}</span>
              <span className="text-[10px] text-gray-400 text-center leading-tight">{desc}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Tableau de bord</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Vue d'ensemble fiscale</h1>
        <p className="text-sm text-gray-500 mt-1">
          Synthèse de votre situation patrimoniale et des actions prioritaires.
        </p>
      </div>

      {/* Tab bar — couple uniquement */}
      {isCouple && <TabBar active={activeTab} onChange={setActiveTab} />}

      {/* Contenu selon tab */}
      {(!isCouple || activeTab === 'foyer') && foyerView}
      {isCouple && activeTab === 'd1' && <DeclarantTab rev={d1Rev} ep={d1Ep} fiscal={d1Fis} />}
      {isCouple && activeTab === 'd2' && <DeclarantTab rev={d2Rev} ep={d2Ep} fiscal={d2Fis} />}

      {/* Lien profil complet */}
      <div className="flex justify-center pt-2 pb-4">
        <Link to="/profile" className="flex items-center gap-2 text-xs text-gray-400 hover:text-teal-600 transition-colors">
          <FileText size={13} />
          Voir le profil fiscal complet
        </Link>
      </div>

    </div>
  );
}
