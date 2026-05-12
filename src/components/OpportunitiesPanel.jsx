import { useState, useMemo } from 'react';
import { useNavigate }       from 'react-router-dom';
import { TrendingUp, AlertTriangle, Zap, MessageCircle, Euro } from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG = {
  gain:   { label: 'Gain',   Icon: TrendingUp,   color: 'text-teal-600',  bg: 'bg-teal-50',  border: 'border-teal-200',  badge: 'bg-teal-100 text-teal-700'  },
  risque: { label: 'Risque', Icon: AlertTriangle, color: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-200',   badge: 'bg-red-100 text-red-700'    },
  action: { label: 'Action', Icon: Zap,           color: 'text-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-200',  badge: 'bg-blue-100 text-blue-700'  },
};

const URGENCE_CFG = {
  immediate:      { label: 'Urgent — À faire maintenant', color: 'text-red-500'   },
  avant_decembre: { label: 'À faire avant le 31/12',      color: 'text-amber-500' },
  long_terme:     { label: 'Long terme',                  color: 'text-gray-400'  },
};

// ─── Carte opportunité ────────────────────────────────────────────────────────

function OpportunityCard({ opp }) {
  const navigate = useNavigate();
  const cfg      = TYPE_CFG[opp.type];
  const urgence  = URGENCE_CFG[opp.urgence];

  return (
    <div className={`rounded-2xl border ${cfg.border} bg-white shadow-sm`}>
      <div className="p-4 flex flex-col gap-3">

        {/* En-tête */}
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center`}>
            <cfg.Icon size={15} className={cfg.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {cfg.label}
              </span>
              <span className={`text-[10px] font-semibold ${urgence.color}`}>
                {urgence.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-1.5 leading-snug">{opp.titre}</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{opp.description}</p>
          </div>
        </div>

        {/* Impact */}
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${cfg.bg} border ${cfg.border}`}>
          <Euro size={13} className={cfg.color} />
          <span className={`text-xs font-semibold ${cfg.color}`}>{opp.impact}</span>
        </div>

        {/* Action */}
        <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
          <span className="font-semibold text-gray-700">Action : </span>{opp.action}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate('/chat', { state: { prefill: opp.questionChat } })}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-teal-200 text-teal-600 text-xs font-semibold hover:bg-teal-50 transition-colors"
        >
          <MessageCircle size={13} />
          En discuter avec Coach Fiscal
        </button>

      </div>
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export default function OpportunitiesPanel({ opportunities }) {
  const [filter, setFilter] = useState('all');

  const gains   = useMemo(() => opportunities.filter(o => o.type === 'gain'),   [opportunities]);
  const risques = useMemo(() => opportunities.filter(o => o.type === 'risque'), [opportunities]);
  const actions = useMemo(() => opportunities.filter(o => o.type === 'action'), [opportunities]);

  const totalGains = useMemo(
    () => gains.reduce((sum, o) => sum + o.impactEuros, 0),
    [gains]
  );

  const filtered = useMemo(() => {
    if (filter === 'gain')   return gains;
    if (filter === 'risque') return risques;
    if (filter === 'action') return actions;
    return opportunities;
  }, [filter, opportunities, gains, risques, actions]);

  if (opportunities.length === 0) return null;

  const FILTERS = [
    { id: 'all',    label: `Tous (${opportunities.length})` },
    { id: 'gain',   label: `💡 Gains (${gains.length})` },
    { id: 'risque', label: `🔴 Risques (${risques.length})` },
    { id: 'action', label: `🔵 Actions (${actions.length})` },
  ];

  return (
    <div className="flex flex-col gap-4">

      {/* Titre + badge */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-gray-900">Opportunités détectées</h2>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold">
          {opportunities.length}
        </span>
      </div>

      {/* Bannière gains potentiels */}
      {totalGains > 0 && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 px-4 py-3 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">💰</span>
          <div>
            <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest">Gains potentiels identifiés</p>
            <p className="text-xl font-bold text-teal-700">{totalGains.toLocaleString('fr-FR')} €</p>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-2xl overflow-x-auto">
        {FILTERS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={[
              'flex-1 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200',
              filter === tab.id
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cartes */}
      <div className="flex flex-col gap-3">
        {filtered.map(opp => (
          <OpportunityCard key={opp.id} opp={opp} />
        ))}
      </div>

    </div>
  );
}
