import { useState, useMemo } from 'react';
import { useNavigate }       from 'react-router-dom';
import { TrendingUp, AlertTriangle, Zap, MessageCircle, Euro, Info } from 'lucide-react';
import { MENTION_NON_CONSEIL } from '../lib/conseilPatrimonial';

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG = {
  gain:   { label: 'Gain',    Icon: TrendingUp,    color: 'text-kapio-300',   bg: 'bg-kapio-500/[0.08]',  border: 'border-kapio-500/30',   badge: 'bg-kapio-500/15 text-kapio-300'   },
  risque: { label: 'Risque',  Icon: AlertTriangle, color: 'text-danger-400',  bg: 'bg-danger-500/[0.08]', border: 'border-danger-500/30',  badge: 'bg-danger-500/10 text-danger-400'  },
  alerte: { label: 'Alerte',  Icon: AlertTriangle, color: 'text-warning-400', bg: 'bg-warning-500/[0.08]', border: 'border-warning-500/30', badge: 'bg-warning-500/10 text-warning-400' },
  action: { label: 'Action',  Icon: Zap,           color: 'text-blue-400',    bg: 'bg-blue-500/[0.08]',   border: 'border-blue-500/30',    badge: 'bg-blue-500/10 text-blue-400'     },
  info:   { label: 'Conseil', Icon: Info,          color: 'text-teal-300',    bg: 'bg-teal-500/[0.08]',   border: 'border-teal-500/30',    badge: 'bg-teal-500/10 text-teal-300'     },
};
// Fallback défensif : tout type inconnu est traité comme un conseil informatif.
const cfgFor = (type) => TYPE_CFG[type] || TYPE_CFG.info;

const URGENCE_CFG = {
  immediate:         { label: 'Urgent — À faire maintenant',          color: 'text-danger-400'  },
  avant_decembre:    { label: 'À faire avant le 31/12',               color: 'text-warning-400' },
  avant_declaration: { label: 'À l\'occasion de la déclaration',      color: 'text-warning-400' },
  a_etudier:         { label: 'À étudier',                            color: 'text-ink-200'     },
  long_terme:        { label: 'Long terme',                           color: 'text-ink-200'     },
};
const urgenceFor = (u) => URGENCE_CFG[u] || URGENCE_CFG.long_terme;

// ─── Carte opportunité ────────────────────────────────────────────────────────

function OpportunityCard({ opp }) {
  const navigate = useNavigate();
  const cfg      = cfgFor(opp.type);
  const urgence  = urgenceFor(opp.urgence);

  return (
    <div className={`rounded-2xl border ${cfg.border} bg-ink-800/60 shadow-sm`}>
      <div className="p-4 flex flex-col gap-3">

        {/* En-tête */}
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center`}>
            <cfg.Icon size={15} className={cfg.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {cfg.label}
              </span>
              <span className={`text-xs font-semibold ${urgence.color}`}>
                {urgence.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-ink-50 mt-1.5 leading-snug">{opp.titre}</p>
            <p className="text-xs text-ink-200 mt-1 leading-relaxed">{opp.description}</p>
          </div>
        </div>

        {/* Impact */}
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${cfg.bg} border ${cfg.border}`}>
          <Euro size={13} className={cfg.color} />
          <span className={`text-xs font-semibold ${cfg.color}`}>{opp.impact}</span>
        </div>

        {/* Action */}
        <div className="text-xs text-ink-200 bg-ink-700/50 rounded-xl px-3 py-2 border border-white/[0.06]">
          <span className="font-semibold text-ink-50">Action : </span>{opp.action}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate('/chat', { state: { prefill: opp.questionChat } })}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-kapio-500/30 text-kapio-300 text-xs font-semibold hover:bg-kapio-500/[0.08] transition-colors"
        >
          <MessageCircle size={13} />
          En discuter avec Kapio
        </button>

      </div>
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export default function OpportunitiesPanel({ opportunities }) {
  const [filter, setFilter] = useState('all');

  const gains   = useMemo(() => opportunities.filter(o => o.type === 'gain'),   [opportunities]);
  const risques = useMemo(() => opportunities.filter(o => o.type === 'risque' || o.type === 'alerte'), [opportunities]);
  const actions = useMemo(() => opportunities.filter(o => o.type === 'action'), [opportunities]);
  const infos   = useMemo(() => opportunities.filter(o => o.type === 'info'),   [opportunities]);

  const totalGains = useMemo(
    () => gains.reduce((sum, o) => sum + o.impactEuros, 0),
    [gains]
  );

  const filtered = useMemo(() => {
    if (filter === 'gain')   return gains;
    if (filter === 'risque') return risques;
    if (filter === 'action') return actions;
    if (filter === 'info')   return infos;
    return opportunities;
  }, [filter, opportunities, gains, risques, actions, infos]);

  if (opportunities.length === 0) return null;

  const FILTERS = [
    { id: 'all',    label: `Tous (${opportunities.length})` },
    { id: 'gain',   label: `Gains (${gains.length})` },
    { id: 'risque', label: `Alertes (${risques.length})` },
    { id: 'action', label: `Actions (${actions.length})` },
    { id: 'info',   label: `Conseils (${infos.length})` },
  ].filter(t => t.id === 'all' || t.id === 'gain' || (t.id === 'risque' && risques.length) || (t.id === 'action' && actions.length) || (t.id === 'info' && infos.length));

  return (
    <div className="flex flex-col gap-4">

      {/* Titre + badge */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-ink-0">Opportunités détectées</h2>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-kapio-500/15 text-kapio-300 text-xs font-bold">
          {opportunities.length}
        </span>
      </div>

      {/* Mention non-conseil (audit E5 — frontière CIF) */}
      <p className="text-xs text-ink-300 leading-relaxed -mt-2">{MENTION_NON_CONSEIL}</p>

      {/* Bannière gains potentiels */}
      {totalGains > 0 && (
        <div className="rounded-2xl border border-kapio-500/30 bg-kapio-500/[0.06] px-4 py-3 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">💰</span>
          <div>
            <p className="text-xs text-kapio-300 font-bold uppercase tracking-widest">Gains potentiels identifiés</p>
            <p className="text-xl font-bold text-kapio-200">{totalGains.toLocaleString('fr-FR')} €</p>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-1 p-1 bg-ink-800/80 border border-white/[0.06] rounded-2xl overflow-x-auto">
        {FILTERS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={[
              'flex-1 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200',
              filter === tab.id
                ? 'bg-ink-700 text-kapio-300 shadow-sm'
                : 'text-ink-300 hover:text-ink-0',
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
