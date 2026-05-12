import { useMemo }        from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp }            from '../context/AppContext';
import { detectOpportunities } from '../lib/opportunitiesDetector';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ClipboardList, Calculator, BookOpen, MessageSquare,
  TrendingUp, ChevronRight, CalendarClock, FileText, AlertTriangle,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = n => Math.round(n).toLocaleString('fr-FR');

function extractNum(text, rx) {
  const m = text.match(rx);
  if (!m || !m[1]) return 0;
  return parseInt(m[1].replace(/[\s.]/g, ''), 10) || 0;
}

function parsePatrimoine(profile) {
  const p = profile;
  const livretA = extractNum(p, /livret\s*a[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);
  const ldds    = extractNum(p, /ldds[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);
  const lep     = extractNum(p, /lep[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);
  const pea     = extractNum(p, /pea[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);
  const av      = extractNum(p, /assurance[- ]vie[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);
  const per     = extractNum(p, /\bper\b[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);
  const immo    = extractNum(p, /immobilier[^€\n]{0,80}?(\d[\d\s.]{1,10})\s*€/i)
                  || extractNum(p, /valeur\s+du\s+bien[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);
  const crypto  = extractNum(p, /crypto[^€\n]{0,40}?(\d[\d\s.]{1,10})\s*€/i);

  const epargLiq    = livretA + ldds + lep;
  const epargLong   = pea + av + per;
  const immoTotal   = immo;
  const cryptoTotal = crypto;

  return { epargLiq, epargLong, immoTotal, cryptoTotal, livretA, ldds, lep, pea, av, per, immo, crypto };
}

function parseScores(profile) {
  const rni = extractNum(profile, /revenu\s+net\s+impos[^€\n]{0,30}?(\d[\d\s.]{1,10})\s*€/i)
           || extractNum(profile, /rni[^€\n]{0,30}?(\d[\d\s.]{1,10})\s*€/i);
  const sal = extractNum(profile, /salaire[^€\n]{0,30}?(\d[\d\s.]{1,10})\s*€/i);
  const rev = rni || sal || 0;

  const BRACKETS = [
    { max: 11_497, rate: 0  },
    { max: 29_315, rate: 11 },
    { max: 83_823, rate: 30 },
    { max: 180_294, rate: 41 },
    { max: Infinity, rate: 45 },
  ];
  const tmi = BRACKETS.find(b => rev <= b.max)?.rate ?? 0;

  const epargne = extractNum(profile, /épargne?\s+annuel[^€\n]{0,30}?(\d[\d\s.]{1,10})\s*€/i)
               || extractNum(profile, /capacité\s+d.épargne[^€\n]{0,30}?(\d[\d\s.]{1,10})\s*€/i);
  const txEpargne = rev > 0 && epargne > 0 ? Math.round(epargne / (rev / 12) * 100) : null;

  const perPlafond = extractNum(profile, /plafond\s+per[^€\n]{0,30}?(\d[\d\s.]{1,10})\s*€/i)
                  || (rev > 0 ? Math.round(rev * 0.1) : 0);
  const perAnnuel  = extractNum(profile, /versement[^€\n]{0,30}?per[^€\n]{0,30}?(\d[\d\s.]{1,10})\s*€/i);
  const txPER      = perPlafond > 0 && perAnnuel > 0 ? Math.round(perAnnuel / perPlafond * 100) : null;

  return { tmi, txEpargne, txPER, rev };
}

function diversificationScore(pat) {
  let score = 0;
  if (pat.epargLiq  > 0) score += 2;
  if (pat.pea       > 0) score += 2;
  if (pat.av        > 0) score += 2;
  if (pat.per       > 0) score += 1;
  if (pat.immoTotal > 0) score += 2;
  if (pat.crypto    > 0) score += 1;
  return Math.min(score, 10);
}

// ─── Circular gauge ───────────────────────────────────────────────────────────

function CircularGauge({ value, max = 100, label, sublabel, color = '#0d9488', size = 88 }) {
  const r   = 32;
  const cx  = size / 2;
  const cy  = size / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(Math.max(value ?? 0, 0), max) / max;
  const dash = pct * circ;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="text-center -mt-[72px] mb-[60px] flex flex-col items-center justify-center" style={{ height: size }}>
        <span className="text-lg font-bold text-gray-900 leading-none">{label}</span>
        {sublabel && <span className="text-[10px] text-gray-400 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}

// ─── Custom PieChart tooltip ──────────────────────────────────────────────────

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

// ─── Timeline entry ───────────────────────────────────────────────────────────

function TimelineItem({ icon: Icon, label, date, color = 'teal', urgent }) {
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#0d9488', '#14b8a6', '#94a3b8', '#f59e0b'];

export default function Dashboard() {
  const { state }  = useApp();
  const navigate   = useNavigate();
  const profile    = state.profile ?? '';

  const pat    = useMemo(() => parsePatrimoine(profile), [profile]);
  const scores = useMemo(() => parseScores(profile),     [profile]);
  const opps   = useMemo(() => detectOpportunities(profile), [profile]);
  const divScore = useMemo(() => diversificationScore(pat), [pat]);

  // ── Pie data ──
  const pieData = [
    { name: 'Épargne liquide',    value: pat.epargLiq    },
    { name: 'Épargne long terme', value: pat.epargLong   },
    { name: 'Immobilier',         value: pat.immoTotal   },
    { name: 'Crypto',             value: pat.cryptoTotal },
  ].filter(d => d.value > 0);

  const totalPat = pat.epargLiq + pat.epargLong + pat.immoTotal + pat.cryptoTotal;

  // ── Gauge configs ──
  const tmiColor = scores.tmi > 30 ? '#ef4444' : scores.tmi === 30 ? '#f59e0b' : '#0d9488';

  // ── Timeline items ──
  const timeline = useMemo(() => {
    const items = [];
    const urgentOpps = opps.filter(o => o.urgence === 'immediate').slice(0, 3);
    urgentOpps.forEach(o => items.push({ label: o.titre, date: 'À faire maintenant', color: 'red', urgent: true }));

    const decOpps = opps.filter(o => o.urgence === 'avant_decembre').slice(0, 2);
    decOpps.forEach(o => items.push({ label: o.titre, date: 'Avant le 31 décembre', color: 'amber' }));

    items.push({ label: 'Déclaration de revenus 2025', date: '31 mai 2026 — date limite', color: 'teal' });

    const ltOpps = opps.filter(o => o.urgence === 'long_terme').slice(0, 2);
    ltOpps.forEach(o => items.push({ label: o.titre, date: 'Long terme', color: 'gray' }));

    return items;
  }, [opps]);

  const topOpps = opps.slice(0, 3);

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div>
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Tableau de bord</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Vue d'ensemble fiscale</h1>
        <p className="text-sm text-gray-500 mt-1">
          Synthèse de votre situation patrimoniale et des actions prioritaires.
        </p>
      </div>

      {/* ── Section 1 : Patrimoine ──────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">1</span>
          Répartition du patrimoine
        </h2>

        {totalPat > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Pie */}
            <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={52} outerRadius={80}
                    paddingAngle={3} dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Total</span>
                <span className="text-sm font-bold text-gray-900 leading-tight">{fmt(totalPat)} €</span>
              </div>
            </div>

            {/* Légende */}
            <div className="flex-1 grid grid-cols-1 gap-2 w-full">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-gray-600">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">{fmt(d.value)} €</span>
                    <span className="text-[10px] text-gray-400">
                      {Math.round(d.value / totalPat * 100)} %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-6 text-center">
            <p className="text-sm text-gray-500">Aucune donnée patrimoniale détectée dans votre profil.</p>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="mt-2 text-xs text-teal-600 font-semibold hover:underline"
            >
              Voir le profil →
            </button>
          </div>
        )}
      </section>

      {/* ── Section 2 : Scorecards ──────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">2</span>
          Indicateurs clés
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

          {/* TMI */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <CircularGauge
              value={scores.tmi} max={45}
              label={`${scores.tmi} %`} sublabel="TMI"
              color={tmiColor}
            />
            <p className="text-[10px] text-center text-gray-500 leading-tight">
              Tranche marginale<br />d'imposition
            </p>
          </div>

          {/* Taux épargne */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <CircularGauge
              value={scores.txEpargne ?? 0} max={30}
              label={scores.txEpargne != null ? `${scores.txEpargne} %` : '—'}
              sublabel="Épargne"
              color="#14b8a6"
            />
            <p className="text-[10px] text-center text-gray-500 leading-tight">
              Taux d'épargne<br />mensuel
            </p>
          </div>

          {/* Score PER */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <CircularGauge
              value={scores.txPER ?? 0} max={100}
              label={scores.txPER != null ? `${scores.txPER} %` : '—'}
              sublabel="PER"
              color="#8b5cf6"
            />
            <p className="text-[10px] text-center text-gray-500 leading-tight">
              Plafond PER<br />utilisé
            </p>
          </div>

          {/* Diversification */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <CircularGauge
              value={divScore} max={10}
              label={`${divScore}/10`}
              sublabel="Diversif."
              color="#f59e0b"
            />
            <p className="text-[10px] text-center text-gray-500 leading-tight">
              Score de<br />diversification
            </p>
          </div>

        </div>
      </section>

      {/* ── Section 3 : Opportunités ────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">3</span>
            Opportunités prioritaires
            {opps.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold">
                {opps.length}
              </span>
            )}
          </h2>
          {opps.length > 3 && (
            <Link
              to="/opportunites"
              className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
            >
              Voir tout <ChevronRight size={13} />
            </Link>
          )}
        </div>

        {topOpps.length > 0 ? (
          <div className="flex flex-col gap-3">
            {topOpps.map(opp => {
              const typeColors = {
                gain:   'border-teal-200 bg-teal-50',
                risque: 'border-red-200 bg-red-50',
                action: 'border-blue-200 bg-blue-50',
              };
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
                  <button
                    type="button"
                    onClick={() => navigate('/chat', { state: { prefill: opp.questionChat } })}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-teal-600 border border-teal-200 bg-white rounded-lg px-2.5 py-1.5 hover:bg-teal-50 transition-colors"
                  >
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

      {/* ── Section 4 : Timeline ────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">4</span>
          Prochaines étapes
        </h2>
        <div className="flex flex-col gap-2">
          {timeline.map((item, i) => (
            <TimelineItem key={i} {...item} />
          ))}
        </div>
      </section>

      {/* ── Section 5 : Liens rapides ────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold">5</span>
          Accès rapide
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/checklist',   Icon: ClipboardList, label: 'Checklist',   desc: 'Documents à préparer' },
            { to: '/simulator',   Icon: Calculator,    label: 'Simulateurs', desc: 'PER, enveloppes, foncier' },
            { to: '/declaration', Icon: BookOpen,      label: 'Déclaration', desc: 'Guide impôts.gouv.fr' },
            { to: '/chat',        Icon: MessageSquare, label: 'Conseil IA',  desc: 'Questions à Claude' },
          ].map(({ to, Icon, label, desc }) => (
            <Link
              key={to} to={to}
              className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 hover:border-teal-300 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-gradient flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Icon size={18} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">{label}</span>
              <span className="text-[10px] text-gray-400 text-center leading-tight">{desc}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Lien vers profil complet ─────────────────────────────────── */}
      <div className="flex justify-center pt-2 pb-4">
        <Link
          to="/profile"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-teal-600 transition-colors"
        >
          <FileText size={13} />
          Voir le profil fiscal complet
        </Link>
      </div>

    </div>
  );
}
