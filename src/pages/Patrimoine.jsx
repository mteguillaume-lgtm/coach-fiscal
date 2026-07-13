import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { getBackendConfig } from '../lib/patrimoine/backendConfigStore';
import { getConsolidatedSnapshot } from '../lib/providers/bank';
import { completeConnect } from '../lib/providers/bank/enablebanking';
import { summary } from '../lib/patrimoine/calculator';
import { appendSnapshot, listHistory } from '../lib/patrimoine/history';
import { useApp } from '../context/AppContext';
import ManualPositions from '../components/patrimoine/ManualPositions';
import AllocationDonut from '../components/patrimoine/AllocationDonut';
import NetWorthChart from '../components/patrimoine/NetWorthChart';
import AccountsList from '../components/patrimoine/AccountsList';
import ConnectBankButton from '../components/patrimoine/ConnectBankButton';
import GlowCard from '../components/motion/GlowCard';
import AnimatedNumber from '../components/motion/AnimatedNumber';
import AuroraBackground from '../components/motion/AuroraBackground';
import Grain from '../components/motion/Grain';

const EASE = [0.16, 1, 0.3, 1];

function StatCard({ Icon, label, value, accent }) {
  const accentColor = accent === 'success' ? 'text-success-400' : accent === 'danger' ? 'text-danger-400' : 'text-ink-0';
  return (
    <div className="card-dark p-6">
      <div className="w-10 h-10 rounded-xl bg-kapio-500/10 border border-kapio-500/20 flex items-center justify-center mb-4">
        <Icon size={18} className="text-kapio-300" />
      </div>
      <p className="text-xs uppercase tracking-widest text-ink-100 mb-2 font-semibold">{label}</p>
      <p className={'text-2xl font-bold tracking-tight ' + accentColor}>
        {value === 0 ? <span className="text-ink-300">—</span> : <AnimatedNumber value={value} suffix=" €" />}
      </p>
    </div>
  );
}

export default function Patrimoine() {
  const { state } = useApp();
  const [snap, setSnap] = useState({ positions: [], errors: [] });
  const [loading, setLoading] = useState(false);
  const [connectError, setConnectError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const config = getBackendConfig();
      const next = await getConsolidatedSnapshot({ config });
      setSnap(next);
      appendSnapshot(summary(next.positions));
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement initial au montage (pattern data-fetching documenté react.dev :
  // https://react.dev/learn/synchronizing-with-effects#fetching-data — le setLoading(true)
  // synchrone en tête de `refresh` est un faux positif connu de cette règle stricte).
  // Si la banque vient de nous rediriger (?code=…&state=… ou ?error=…), on
  // nettoie d'abord l'URL, puis on finalise la connexion ou on affiche
  // l'annulation/le refus avant de rafraîchir.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const bankError = params.get('error');
    if (code || bankError) window.history.replaceState({}, '', window.location.pathname);
    if (bankError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnectError(`Connexion bancaire annulée ou refusée : ${bankError}`);
      refresh();
      return;
    }
    if (!code) { refresh(); return; }
    completeConnect({ ...getBackendConfig(), code, state })
      .then(() => setConnectError(''))
      .catch((e) => setConnectError(`Connexion bancaire non finalisée : ${e.message}`))
      .finally(() => refresh());
  }, [refresh]);

  const s = summary(snap.positions);

  return (
    <div className="relative bg-ink-900 text-ink-0 overflow-hidden min-h-screen">
      <AuroraBackground showGrid intensity={0.6} />
      <Grain opacity={0.025} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10">

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        >
          <div>
            <span className="text-xs font-semibold text-kapio-300 uppercase tracking-widest mb-2 inline-block">
              Vue d&apos;ensemble
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-ink-0">Patrimoine</h1>
            <p className="text-sm text-ink-100 mt-1">Comptes synchronisés et placements saisis à la main.</p>
          </div>
          <button
            type="button"
            onClick={() => { setConnectError(''); refresh(); }}
            disabled={loading}
            className="btn-ghost-dark !text-sm shrink-0 disabled:opacity-50"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {loading ? 'Actualisation…' : 'Actualiser'}
          </button>
        </motion.div>

        {/* ERREURS DE SYNC */}
        {(snap.errors?.length > 0 || connectError) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            role="alert"
            className="mb-6 rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm text-warning-400"
          >
            <p className="font-semibold flex items-center gap-2">
              <AlertTriangle size={14} aria-hidden="true" />
              Synchronisation bancaire indisponible — reconnecte tes banques.
            </p>
            <ul className="mt-2 list-disc pl-6 text-warning-400/80">
              {[...(connectError ? [connectError] : []), ...snap.errors].map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* HERO — patrimoine net + actifs / dettes */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.08 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <GlowCard className="p-6">
            <div className="w-10 h-10 rounded-xl bg-kapio-500/10 border border-kapio-500/20 flex items-center justify-center mb-4">
              <Wallet size={18} className="text-kapio-300" />
            </div>
            <p className="text-xs uppercase tracking-widest text-ink-100 mb-2 font-semibold">Patrimoine net</p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight text-kapio-300">
              <AnimatedNumber value={s.netWorth} suffix=" €" />
            </p>
          </GlowCard>
          <StatCard Icon={TrendingUp} label="Actifs" value={s.assets} accent="success" />
          <StatCard Icon={TrendingDown} label="Dettes" value={s.debts} accent="danger" />
        </motion.div>

        {/* EMPTY STATE */}
        {snap.positions.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE, delay: 0.16 }}
            className="card-dark card-static p-8 mt-6 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-kapio-500/10 border border-kapio-500/30 flex items-center justify-center mx-auto mb-4">
              <Wallet size={22} className="text-kapio-300" />
            </div>
            <p className="text-sm text-ink-100">Aucun compte. Connecte une banque ou ajoute un placement.</p>
          </motion.div>
        )}

        {/* GRAPHIQUES */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.16 }}
          className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <AllocationDonut positions={snap.positions} />
          <NetWorthChart history={listHistory()} />
        </motion.div>

        {/* COMPTES + SAISIE */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.24 }}
        >
          <AccountsList positions={snap.positions} />
          <ConnectBankButton mode={state.mode} />
          <ManualPositions mode={state.mode} onChange={refresh} />
        </motion.div>
      </div>
    </div>
  );
}
