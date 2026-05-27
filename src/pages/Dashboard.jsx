import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ClipboardList, Calculator, BookOpen, MessageSquare,
  FileText, User, Users, TrendingUp, Sparkles,
  Wallet, Building2, Coins, PiggyBank, Target,
  AlertCircle, Activity, Zap, ArrowRight, ChevronRight,
  Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';

import { useApp } from '../context/AppContext';
import { detectOpportunities } from '../lib/opportunitiesDetector';
import { calcIR, computeFoyerSummary } from '../lib/taxCalculator';
import AnimatedNumber from '../components/motion/AnimatedNumber';
import GlowCard from '../components/motion/GlowCard';
import AuroraBackground from '../components/motion/AuroraBackground';
import SpotlightCursor from '../components/motion/SpotlightCursor';
import Grain from '../components/motion/Grain';
import SplitText from '../components/motion/SplitText';

// ============================================================================
// HELPERS — strictement alignés sur l'ancien Dashboard qui marchait
// ============================================================================

const fmt  = n => Math.round(n || 0).toLocaleString('fr-FR');
const fmtE = n => (n || 0) > 0 ? `${fmt(n)} €` : '—';

const PIE_COLORS = ['#5ECFAE', '#2EB88A', '#1D9E75', '#F59E0B'];

function diversificationScore(p) {
  let score = 0;
  if ((p.epargneLiquide  || 0) > 0) score += 2;
  if ((p.peaD1  || 0) + (p.peaD2  || 0) > 0) score += 2;
  if ((p.avD1   || 0) + (p.avD2   || 0) > 0) score += 2;
  if ((p.percoD1 || 0) > 0) score += 1;
  if ((p.peeD1  || 0) + (p.peeD2  || 0) > 0) score += 1;
  if ((p.immoTotal || 0) > 0) score += 2;
  if ((p.cryptoTotal || 0) > 0) score += 1;
  return Math.min(score, 10);
}

// ============================================================================
// COMPOSANTS UI
// ============================================================================

function PieTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-white/[0.1] bg-ink-800 px-3 py-2 shadow-2xl">
      <p className="text-xs font-semibold text-ink-0">{d.name}</p>
      <p className="text-sm font-mono text-kapio-300 mt-0.5">{fmt(d.value)} €</p>
    </div>
  );
}

function InfoRow({ label, value, highlight }) {
  const valueClass = highlight ? 'text-kapio-300' : 'text-ink-0';
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-ink-100">{label}</span>
      <span className={'text-xs font-semibold ' + valueClass}>{value}</span>
    </div>
  );
}

function HeroStatCard({ Icon, label, value, suffix, accent, subtitle }) {
  const accentColor = accent === 'kapio'
    ? 'text-kapio-300'
    : accent === 'warning'
      ? 'text-warning-400'
      : accent === 'success'
        ? 'text-success-400'
        : 'text-ink-0';

  const isEmpty = value == null || value === 0;

  return (
    <GlowCard className="p-6 h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-kapio-500/10 border border-kapio-500/20 flex items-center justify-center">
          <Icon size={18} className="text-kapio-300" />
        </div>
      </div>
      <p className="text-xs uppercase tracking-wider text-ink-200 mb-2 font-semibold">{label}</p>
      <p className={'text-3xl sm:text-4xl font-bold tracking-tight ' + accentColor}>
        {isEmpty ? (
          <span className="text-ink-300">—</span>
        ) : (
          <AnimatedNumber value={value} suffix={suffix || ''} />
        )}
      </p>
      {subtitle ? (
        <p className="text-xs text-ink-100 mt-2">{subtitle}</p>
      ) : null}
    </GlowCard>
  );
}

function StatCard({ label, value, suffix, accent }) {
  const accentColor = accent === 'kapio' ? 'text-kapio-300' : 'text-ink-0';
  const isEmpty = value == null || value === 0;
  return (
    <div className="card-dark p-5">
      <p className="text-xs text-ink-200 uppercase tracking-wider mb-2">{label}</p>
      <p className={'text-xl font-bold ' + accentColor}>
        {isEmpty ? (
          <span className="text-ink-300">—</span>
        ) : (
          <AnimatedNumber value={value} suffix={suffix || ''} />
        )}
      </p>
    </div>
  );
}

// ============================================================================
// TabBar — Switch D1 / D2 / Foyer pour les couples
// ============================================================================

function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'foyer', label: 'Vue foyer',   short: 'Foyer', Icon: Users },
    { id: 'd1',    label: 'Déclarant 1', short: 'D1',    Icon: User  },
    { id: 'd2',    label: 'Déclarant 2', short: 'D2',    Icon: User  },
  ];
  return (
    <div className="card-dark card-static p-1 flex gap-1 mb-6">
      {tabs.map(({ id, label, short, Icon }) => {
        const isActive = active === id;
        const activeClass = isActive
          ? 'bg-kapio-500/15 text-kapio-300 border border-kapio-500/30'
          : 'text-ink-100 hover:text-ink-0 hover:bg-white/[0.03] border border-transparent';
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={'flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ' + activeClass}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{short}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Vue Déclarant individuel (D1 ou D2)
// ============================================================================

function DeclarantView({ label, rev, ep, fiscal }) {
  const totalEp = (ep.livretA || 0) + (ep.ldds || 0) + (ep.lep || 0) + (ep.livretPlus || 0)
                + (ep.pel || 0) + (ep.pea || 0) + (ep.av || 0) + (ep.perco || 0)
                + (ep.pee || 0) + (ep.crypto || 0);

  const epLines = [
    { label: 'Livret A',        v: ep.livretA    },
    { label: 'LDDS',            v: ep.ldds       },
    { label: 'LEP',             v: ep.lep        },
    { label: 'Livret bancaire', v: ep.livretPlus },
    { label: 'PEL',             v: ep.pel        },
    { label: 'PEA',             v: ep.pea        },
    { label: 'Assurance-vie',   v: ep.av         },
    { label: 'PER versements',  v: ep.perco      },
    { label: 'PEE',             v: ep.pee        },
    { label: 'Crypto (wallet)', v: ep.crypto     },
  ].filter(x => (x.v || 0) > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-kapio-500/10 border border-kapio-500/30 flex items-center justify-center">
          <User size={18} className="text-kapio-300" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink-0">{label}</h2>
          <p className="text-xs text-ink-200">Vue détaillée des revenus, épargne et fiscalité</p>
        </div>
      </div>

      {/* Revenus */}
      <div className="card-dark p-6">
        <h3 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
          <Wallet size={14} className="text-kapio-300" />
          Revenus 2025
        </h3>
        <InfoRow label="Net imposable"  value={fmtE(rev.net)}  />
        <InfoRow label="Brut imposable" value={fmtE(rev.brut)} />
        <InfoRow label="PAS prélevé"    value={fmtE(rev.pas)}  />
        <InfoRow label="Taux PAS"       value={rev.taux ? `${rev.taux} %` : '—'} />
        {(rev.pero || 0) > 0 ? (
          <InfoRow label="PERO cotisations 2025" value={fmtE(rev.pero)} highlight />
        ) : null}
      </div>

      {/* Épargne */}
      <div className="card-dark p-6">
        <h3 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
          <PiggyBank size={14} className="text-kapio-300" />
          Épargne et placements
        </h3>
        {epLines.length > 0 ? (
          <>
            {epLines.map(({ label: lbl, v }) => (
              <InfoRow key={lbl} label={lbl} value={fmtE(v)} />
            ))}
            <div className="mt-3 pt-3 border-t border-white/[0.08] flex justify-between items-center">
              <span className="text-xs font-bold text-ink-50">Total épargne</span>
              <span className="text-sm font-bold text-kapio-300">{fmtE(totalEp)}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-ink-200 py-1">Aucune épargne détectée.</p>
        )}
      </div>

      {/* Fiscal */}
      <div className="card-dark p-6">
        <h3 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
          <Calculator size={14} className="text-kapio-300" />
          Situation fiscale
        </h3>
        <InfoRow label="RNI" value={fmtE(fiscal.rni)} />
        {(fiscal.plafondPer || 0) > 0 ? (
          <InfoRow label="Plafond PER disponible" value={fmtE(fiscal.plafondPer)} highlight />
        ) : null}
      </div>
    </motion.div>
  );
}

// ============================================================================
// ContributionTable — Répartition fiscale équitable couple
// ============================================================================

function ContributionTable({ p, summary }) {
  const rniD1    = p.rniD1    || 0;
  const rniD2    = p.rniD2    || 0;
  const rniFoyer = p.rniFoyer || 0;
  const pasD1    = p.pasD1    || 0;
  const pasD2    = p.pasD2    || 0;
  const parts    = p.parts    || 2;

  if (!rniFoyer) return null;

  const irD1Solo        = calcIR(rniD1, 1, false);
  const irD2Solo        = calcIR(rniD2, 1, false);
  const irFoyerEnsemble = summary?.irNet > 0 ? summary.irNet : calcIR(rniFoyer, parts, true);
  const gainCouple      = Math.max(0, irD1Solo + irD2Solo - irFoyerEnsemble);
  const partGain  = gainCouple / 2;
  const contribD1 = Math.max(0, irD1Solo - partGain);
  const contribD2 = Math.max(0, irD2Solo - partGain);
  const regD1 = pasD1 - contribD1;
  const regD2 = pasD2 - contribD2;

  const fmtReg = v => {
    if (Math.abs(v) < 10) return '≈ 0 €';
    return (v > 0 ? '+' : '') + fmt(v) + ' €';
  };
  const regColor = v =>
    Math.abs(v) < 10 ? 'text-ink-200' : v > 0 ? 'text-success-400' : 'text-danger-400';

  return (
    <div className="card-dark p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-ink-0 mb-1 flex items-center gap-2">
            <Users size={15} className="text-kapio-300" />
            Répartition fiscale équitable
          </h3>
          <p className="text-xs text-ink-200">
            Avec partage 50/50 du gain PACS ({fmt(gainCouple)} €)
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-left py-2 px-2 font-semibold text-ink-100"> </th>
              <th className="text-right py-2 px-2 font-semibold text-ink-100">D1</th>
              <th className="text-right py-2 px-2 font-semibold text-ink-100">D2</th>
            </tr>
          </thead>
          <tbody className="text-ink-50">
            <tr className="border-b border-white/[0.04]">
              <td className="py-2 px-2 text-ink-200">RNI</td>
              <td className="text-right py-2 px-2 font-mono">{fmtE(rniD1)}</td>
              <td className="text-right py-2 px-2 font-mono">{fmtE(rniD2)}</td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="py-2 px-2 text-ink-200">IR célibataire (référence)</td>
              <td className="text-right py-2 px-2 font-mono">{fmtE(irD1Solo)}</td>
              <td className="text-right py-2 px-2 font-mono">{fmtE(irD2Solo)}</td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="py-2 px-2 text-ink-200">Contribution équitable</td>
              <td className="text-right py-2 px-2 font-mono font-semibold">{fmtE(contribD1)}</td>
              <td className="text-right py-2 px-2 font-mono font-semibold">{fmtE(contribD2)}</td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="py-2 px-2 text-ink-200">PAS prélevé</td>
              <td className="text-right py-2 px-2 font-mono">{fmtE(pasD1)}</td>
              <td className="text-right py-2 px-2 font-mono">{fmtE(pasD2)}</td>
            </tr>
            <tr>
              <td className="py-2 px-2 font-semibold text-ink-0">Régularisation</td>
              <td className={'text-right py-2 px-2 font-mono font-bold ' + regColor(regD1)}>{fmtReg(regD1)}</td>
              <td className={'text-right py-2 px-2 font-mono font-bold ' + regColor(regD2)}>{fmtReg(regD2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-2xs text-ink-200 mt-3 leading-relaxed">
        Méthode "célibataire-référence" : on calcule l'IR que chaque déclarant paierait seul, puis on partage le gain du PACS à parts égales.
      </p>
    </div>
  );
}

// ============================================================================
// Vue Foyer (vue principale)
// ============================================================================

function FoyerView({ p, summary, opps }) {
  const navigate = useNavigate();
  const isCouple = p.mode === 'couple';

  // Allocation patrimoniale
  const pieData = [
    { name: 'Épargne liquide',    value: p.epargneLiquide   || 0, Icon: PiggyBank },
    { name: 'Épargne long terme', value: p.epargneLongTerme || 0, Icon: Wallet },
    { name: 'Immobilier',         value: p.immoTotal        || 0, Icon: Building2 },
    { name: 'Crypto',             value: p.cryptoTotal      || 0, Icon: Coins },
  ].filter(d => d.value > 0);

  const totalPat = (p.epargneLiquide || 0) + (p.epargneLongTerme || 0)
                 + (p.immoTotal || 0) + (p.cryptoTotal || 0);

  const tmi = p.tmi || 0;
  const tmiSubtitle = tmi > 30
    ? 'Tranche élevée'
    : tmi === 30
      ? 'Tranche médiane'
      : tmi > 0
        ? 'Tranche basse'
        : 'Non calculé';

  const tmiAccent = tmi > 30 ? 'warning' : tmi === 30 ? 'warning' : tmi > 0 ? 'success' : null;

  // IR : utiliser totalDu = irNet + psFoncier (source de vérité)
  const irToShow = summary?.totalDu || summary?.irNet || p.totalDu || p.irNet || 0;
  const irSubtitle = summary?.psFoncier > 0
    ? `Inclut ${fmt(summary.psFoncier)} € de PS foncier`
    : (p.regimeFoncier ? 'Foncier inclus' : 'Avant optimisations');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-6"
    >

      {/* HERO STATS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroStatCard
          Icon={Wallet}
          label="Patrimoine net"
          value={totalPat}
          suffix=" €"
          subtitle="Tous actifs confondus"
          accent="kapio"
        />
        <HeroStatCard
          Icon={Activity}
          label="TMI actuel"
          value={tmi}
          suffix=" %"
          subtitle={tmiSubtitle}
          accent={tmiAccent}
        />
        <HeroStatCard
          Icon={Calculator}
          label={summary?.totalDu > 0 ? 'Total dû 2025' : 'IR 2025 estimé'}
          value={irToShow}
          suffix=" €"
          subtitle={irSubtitle}
        />
      </section>

      {/* SOLDE FISCAL (si calculé) */}
      {summary && (summary.solde !== 0 && summary.pasTotal > 0) ? (
        <section>
          {summary.solde < 0 ? (
            <div className="card-dark p-5 border border-success-500/30 bg-success-500/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success-500/15 flex items-center justify-center">
                  <TrendingUp size={18} className="text-success-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink-0">Remboursement attendu</p>
                  <p className="text-xs text-ink-200">Versé en juillet–septembre 2026</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-success-400 font-mono">
                +{fmt(Math.abs(summary.solde))} €
              </p>
            </div>
          ) : (
            <div className="card-dark p-5 border border-danger-500/30 bg-danger-500/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-danger-500/15 flex items-center justify-center">
                  <AlertCircle size={18} className="text-danger-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink-0">Complément à payer</p>
                  <p className="text-xs text-ink-200">Prélevé en septembre 2026</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-danger-400 font-mono">
                {fmt(summary.solde)} €
              </p>
            </div>
          )}
        </section>
      ) : null}

      {/* ALLOCATION + SYNTHESE FISCALE */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Allocation patrimoniale */}
        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-ink-0 mb-1">Allocation patrimoniale</h3>
              <p className="text-xs text-ink-200">Répartition par classe d'actifs</p>
            </div>
            <Target size={18} className="text-kapio-300" />
          </div>

          {totalPat > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 items-center">
              <div className="sm:col-span-2 relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      animationDuration={1200}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[10px] text-ink-200 uppercase tracking-wider">Total</p>
                  <p className="text-lg font-bold text-ink-0">{fmt(totalPat)} €</p>
                </div>
              </div>

              <div className="sm:col-span-3 flex flex-col gap-3">
                {pieData.map((d, i) => {
                  const pct = totalPat > 0 ? Math.round((d.value / totalPat) * 100) : 0;
                  const ItemIcon = d.Icon;
                  const color = PIE_COLORS[i % PIE_COLORS.length];
                  return (
                    <motion.div
                      key={d.name}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
                      className="flex items-center gap-3"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color + '20', border: '1px solid ' + color + '40' }}
                      >
                        <ItemIcon size={14} style={{ color: color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs text-ink-100 truncate">{d.name}</p>
                          <p className="text-xs font-mono font-semibold text-ink-0 shrink-0">{pct} %</p>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 mt-1">
                          <div className="h-1 flex-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: pct + '%' }}
                              transition={{ delay: 0.4 + i * 0.08, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: color }}
                            />
                          </div>
                          <p className="text-xs font-mono text-ink-200 shrink-0 tabular-nums">{fmt(d.value)} €</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Target size={28} className="text-ink-300 mx-auto mb-2" />
              <p className="text-sm text-ink-100 mb-3">Aucune donnée patrimoniale</p>
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="text-xs font-semibold text-kapio-300 hover:text-kapio-200 inline-flex items-center gap-1"
              >
                Voir le profil <ArrowRight size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Synthèse fiscale */}
        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-ink-0 mb-1">Synthèse fiscale</h3>
              <p className="text-xs text-ink-200">
                {summary ? 'Calculée d’après le barème 2025' : 'Profil à compléter'}
              </p>
            </div>
            {!p.isEnriched && summary ? (
              <span className="text-2xs font-semibold text-warning-400 bg-warning-500/10 border border-warning-500/30 px-2 py-0.5 rounded-full">
                Estimée
              </span>
            ) : null}
          </div>

          {summary ? (
            <div>
              <InfoRow label="RNI Foyer"     value={fmtE(summary.rniFoyer)} />
              <InfoRow label="Parts fiscales" value={summary.partsFiscales} />
              <InfoRow label="IR brut"       value={fmtE(summary.irBrut)} />
              {summary.decote > 0 ? (
                <InfoRow label="Décote"      value={'− ' + fmt(summary.decote) + ' €'} />
              ) : null}
              <InfoRow label="IR net"        value={fmtE(summary.irNet)} highlight />
              {summary.psFoncier > 0 ? (
                <InfoRow label="PS foncier (17,2 %)" value={fmtE(summary.psFoncier)} />
              ) : null}
              <InfoRow label="Total dû"      value={fmtE(summary.totalDu)} highlight />
              <InfoRow label="PAS prélevé"   value={fmtE(summary.pasTotal)} />
              {summary.acomptesIR > 0 || summary.acomptesPS > 0 ? (
                <InfoRow label="Acomptes versés" value={fmtE(summary.acomptesIR + summary.acomptesPS)} />
              ) : null}
              {summary.creditsImpot > 0 ? (
                <InfoRow label="Crédits d’impôt" value={fmtE(summary.creditsImpot)} />
              ) : null}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calculator size={28} className="text-ink-300 mx-auto mb-2" />
              <p className="text-sm text-ink-100 mb-1">Calcul fiscal indisponible</p>
              <p className="text-xs text-ink-200 mb-3">Renseignez vos revenus pour activer le calcul</p>
              <button
                type="button"
                onClick={() => navigate('/collect')}
                className="text-xs font-semibold text-kapio-300 hover:text-kapio-200 inline-flex items-center gap-1"
              >
                Compléter <ArrowRight size={11} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* RÉPARTITION ÉQUITABLE (couple uniquement) */}
      {isCouple ? (
        <section>
          <ContributionTable p={p} summary={summary} />
        </section>
      ) : null}

      {/* STATS SECONDAIRES */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Plafond PER"
          value={p.plafondPerTotal || p.plafondPerD1 || 0}
          suffix=" €"
          accent="kapio"
        />
        <StatCard
          label="Taux d'épargne"
          value={p.tauxEpargneFoyer || 0}
          suffix=" %"
        />
        <StatCard
          label="Score diversification"
          value={diversificationScore(p)}
          suffix=" / 10"
        />
        <StatCard
          label="PERO 2025"
          value={(p.peroD1 || 0) + (p.peroD2 || 0)}
          suffix=" €"
        />
      </section>

      {/* OPPORTUNITES */}
      {opps && opps.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-ink-0 flex items-center gap-2">
                <Sparkles size={16} className="text-kapio-300" />
                Opportunités détectées
              </h3>
              <p className="text-xs text-ink-200 mt-1">{opps.length} optimisation{opps.length > 1 ? 's' : ''} identifiée{opps.length > 1 ? 's' : ''}</p>
            </div>
            <Link
              to="/opportunites"
              className="text-xs font-semibold text-kapio-300 hover:text-kapio-200 inline-flex items-center gap-1"
            >
              Tout voir <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {opps.slice(0, 3).map((opp, i) => (
              <OpportunityCard key={opp.id || i} opp={opp} index={i} />
            ))}
          </div>
        </section>
      ) : null}

    </motion.div>
  );
}

// ============================================================================
// OpportunityCard — utilise les vraies données du détecteur
// ============================================================================

function OpportunityCard({ opp, index }) {
  // Le détecteur retourne : type ('gain' | 'risque' | 'action'), urgence, titre, description, impact, action
  const config = {
    risque: { dot: '#EF4444', label: 'Risque', bg: 'bg-danger-500/10',  text: 'text-danger-400',  border: 'border-danger-500/20'  },
    gain:   { dot: '#2EB88A', label: 'Gain',   bg: 'bg-kapio-500/10',   text: 'text-kapio-300',   border: 'border-kapio-500/20'   },
    action: { dot: '#F59E0B', label: 'Action', bg: 'bg-warning-500/10', text: 'text-warning-400', border: 'border-warning-500/20' },
  };
  const c = config[opp.type] || config.gain;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={'card-dark p-5 border ' + c.border}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
          <span className={'text-2xs font-bold uppercase tracking-wider ' + c.text}>{opp.type || 'opportunité'}</span>
        </div>
        <span className={'text-2xs font-medium px-1.5 py-0.5 rounded ' + c.bg + ' ' + c.text}>
          {c.label}
        </span>
      </div>

      <h4 className="text-sm font-bold text-ink-0 mb-1.5 leading-tight">{opp.titre}</h4>
      <p className="text-xs text-ink-100 leading-relaxed mb-4 line-clamp-3">{opp.description}</p>

      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
        {opp.impact ? (
          <span className="text-xs text-ink-50 font-medium">{opp.impact}</span>
        ) : (
          <span className="text-xs text-ink-200">{opp.urgence === 'immediate' ? 'À faire maintenant' : 'Long terme'}</span>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// QuickLinks
// ============================================================================

function QuickLink({ to, Icon, label, desc, accent }) {
  const accentClass = accent ? 'bg-kapio-500/10 border-kapio-500/30' : 'bg-ink-700 border-white/[0.06]';
  const iconClass = accent ? 'text-kapio-300' : 'text-ink-50';

  return (
    <motion.div
      whileHover={{ y: -4, rotateX: 6, rotateY: 4 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformStyle: 'preserve-3d', transformPerspective: 800 }}
    >
      <Link
        to={to}
        className="card-dark p-5 h-full flex flex-col items-start gap-3 hover:border-kapio-500/30 transition-colors group block"
      >
        <div className={'w-10 h-10 rounded-xl flex items-center justify-center border ' + accentClass + ' group-hover:bg-kapio-500/15 group-hover:border-kapio-500/30 transition-colors'}>
          <Icon size={18} className={iconClass + ' group-hover:text-kapio-300 transition-colors'} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-0 mb-1">{label}</p>
          <p className="text-xs text-ink-200">{desc}</p>
        </div>
      </Link>
    </motion.div>
  );
}

// ============================================================================
// DASHBOARD (composant principal)
// ============================================================================

export default function Dashboard() {
  const { state } = useApp();
  const navigate = useNavigate();
  const p = state.parsedProfile || {};
  const isCouple = p.mode === 'couple';

  const [activeTab, setActiveTab] = useState('foyer');

  const summary = useMemo(() => computeFoyerSummary(p), [p]);
  const opps    = useMemo(() => detectOpportunities(p), [p]);

  // Empty state — aucun profil
  if (!p || (!p.mode && !p.rniFoyer && !p.patrimoineTotal)) {
    return (
      <div className="relative bg-ink-900 text-ink-0 overflow-hidden min-h-screen">

        {/* Aurora + Spotlight + Grain en fond */}
        <AuroraBackground showGrid intensity={0.8} />
        <SpotlightCursor size={500} intensity={0.18} />
        <Grain opacity={0.025} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <GlowCard className="p-10 text-center" glowColor="rgba(46,184,138,0.2)" glowSize={500}>
              <motion.div
                animate={{ boxShadow: [
                  '0 0 0 0 rgba(46,184,138,0)',
                  '0 0 40px rgba(46,184,138,0.4)',
                  '0 0 0 0 rgba(46,184,138,0)',
                ] }}
                transition={{ duration: 2.8, repeat: Infinity }}
                className="w-16 h-16 rounded-2xl bg-kapio-500/10 border border-kapio-500/30 flex items-center justify-center mx-auto mb-5"
              >
                <Target size={28} className="text-kapio-300" />
              </motion.div>
              <h2 className="text-2xl font-bold text-ink-0 mb-2">Aucun profil détecté</h2>
              <p className="text-sm text-ink-100 mb-6 max-w-md mx-auto">
                Pour voir votre tableau de bord, commencez par renseigner vos informations fiscales et patrimoniales.
              </p>
              <motion.button
                type="button"
                onClick={() => navigate('/setup')}
                whileHover={{ y: -2, rotateX: 6, rotateY: 4 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformStyle: 'preserve-3d', transformPerspective: 800 }}
                className="btn-kapio shimmer-btn !text-sm !px-6 !py-3"
              >
                Démarrer mon bilan
                <ArrowRight size={14} />
              </motion.button>
            </GlowCard>
          </motion.div>
        </div>
      </div>
    );
  }

  // Préparer les data D1/D2
  const d1Rev = {
    net: p.salaireNetImposableD1,
    brut: p.salairesBrutImposableD1,
    pas: p.pasD1,
    taux: p.tauxPasD1,
    pero: p.peroD1,
  };
  const d2Rev = {
    net: p.salaireNetImposableD2,
    brut: p.salairesBrutImposableD2,
    pas: p.pasD2,
    taux: p.tauxPasD2,
    pero: p.peroD2,
  };
  const d1Ep = {
    livretA: p.livretAD1, ldds: p.lddsD1, lep: p.lepD1, livretPlus: p.livretPlusD1,
    pel: p.pelD1, pea: p.peaD1, av: p.avD1, perco: p.percoD1, pee: p.peeD1, crypto: p.cryptoD1,
  };
  const d2Ep = {
    livretA: p.livretAD2, ldds: p.lddsD2, lep: p.lepD2, livretPlus: p.livretPlusD2,
    pel: p.pelD2, pea: p.peaD2, av: p.avD2, perco: p.percoD2, pee: p.peeD2, crypto: p.cryptoD2,
  };
  const d1Fis = { rni: p.rniD1, plafondPer: p.plafondPerD1 };
  const d2Fis = { rni: p.rniD2, plafondPer: p.plafondPerD2 };

  return (
    <div className="relative bg-ink-900 text-ink-0 overflow-hidden min-h-screen">

      {/* AURORA ANIMÉE (3 blobs en mouvement continu, grille, beam) */}
      <AuroraBackground showGrid showBeam intensity={0.7} />

      {/* SPOTLIGHT CURSEUR — halo qui suit la souris */}
      <SpotlightCursor size={500} intensity={0.15} />

      {/* GRAIN OVERLAY — texture noise subtile */}
      <Grain opacity={0.025} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10">

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-xs font-semibold text-kapio-300 uppercase tracking-widest mb-2 inline-block"
              >
                Tableau de bord
              </motion.span>
              <h1 className="text-3xl sm:text-4xl font-bold text-ink-0 tracking-tight">
                <SplitText text="Vue d’ensemble" delay={0.2} stagger={0.04} />
              </h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.55 }}
                className="text-sm text-ink-100 mt-1"
              >
                {isCouple
                  ? 'Synthèse de la situation du foyer + vues individuelles D1 / D2'
                  : 'Synthèse de votre situation patrimoniale et fiscale'}
              </motion.p>
            </div>
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex items-center gap-2"
            >
              <motion.button
                type="button"
                onClick={() => navigate('/chat')}
                whileHover={{ y: -2, rotateX: 6, rotateY: 4 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformStyle: 'preserve-3d', transformPerspective: 800 }}
                className="btn-ghost-dark !text-xs !px-4 !py-2"
              >
                <MessageSquare size={13} />
                Question à Claude
              </motion.button>
              <motion.button
                type="button"
                onClick={() => navigate('/profile')}
                whileHover={{ y: -2, rotateX: 6, rotateY: 4 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformStyle: 'preserve-3d', transformPerspective: 800 }}
                className="btn-kapio !text-xs !px-4 !py-2"
              >
                <FileText size={13} />
                Profil complet
              </motion.button>
            </motion.div>
          </div>
        </motion.div>

        {/* TAB BAR (couple uniquement) */}
        {isCouple ? (
          <TabBar active={activeTab} onChange={setActiveTab} />
        ) : null}

        {/* CONTENU SELON TAB */}
        {(!isCouple || activeTab === 'foyer') ? (
          <FoyerView p={p} summary={summary} opps={opps} />
        ) : null}

        {isCouple && activeTab === 'd1' ? (
          <DeclarantView label="Déclarant 1" rev={d1Rev} ep={d1Ep} fiscal={d1Fis} />
        ) : null}

        {isCouple && activeTab === 'd2' ? (
          <DeclarantView label="Déclarant 2" rev={d2Rev} ep={d2Ep} fiscal={d2Fis} />
        ) : null}

        {/* LIENS RAPIDES (toujours en bas) */}
        <section className="mt-10">
          <h3 className="text-base font-bold text-ink-0 mb-5 flex items-center gap-2">
            <Zap size={15} className="text-kapio-300" />
            Accès rapide
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <QuickLink to="/simulator"    Icon={Calculator}    label="Simulateurs"   desc="PER, AV, foncier" accent />
            <QuickLink to="/checklist"    Icon={ClipboardList} label="Checklist"     desc="Documents, cases" />
            <QuickLink to="/declaration"  Icon={BookOpen}      label="Déclaration"   desc="Guide impots.gouv" />
            <QuickLink to="/chat"         Icon={MessageSquare} label="Conseil IA"    desc="Question à Claude" />
            <QuickLink to="/rapport"      Icon={FileText}      label="Rapport"       desc="Bilan détaillé" />
            <QuickLink to="/opportunites" Icon={Sparkles}      label="Opportunités"  desc="Toutes les actions" />
          </div>
        </section>

        {/* Lien profil complet */}
        <div className="flex justify-center pt-8 pb-4">
          <Link
            to="/profile"
            className="flex items-center gap-2 text-xs text-ink-200 hover:text-kapio-300 transition-colors"
          >
            <FileText size={13} />
            Voir le profil fiscal complet
          </Link>
        </div>

      </div>
    </div>
  );
}
