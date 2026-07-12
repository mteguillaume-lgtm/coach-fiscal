import { useState, useEffect, useCallback } from 'react';
import { getBackendConfig } from '../lib/patrimoine/backendConfigStore';
import { getConsolidatedSnapshot } from '../lib/providers/bank';
import { summary } from '../lib/patrimoine/calculator';
import { appendSnapshot, listHistory } from '../lib/patrimoine/history';
import { useApp } from '../context/AppContext';
import ManualPositions from '../components/patrimoine/ManualPositions';
import AllocationDonut from '../components/patrimoine/AllocationDonut';
import NetWorthChart from '../components/patrimoine/NetWorthChart';
import AccountsList from '../components/patrimoine/AccountsList';

export default function Patrimoine() {
  const { state } = useApp();
  const [snap, setSnap] = useState({ positions: [], errors: [] });
  const [loading, setLoading] = useState(false);

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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  const s = summary(snap.positions);
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Patrimoine</h1>
        <button onClick={refresh} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {loading ? 'Actualisation…' : '↻ Actualiser'}
        </button>
      </div>
      <p className="mt-2 text-3xl font-semibold">{s.netWorth.toLocaleString('fr-FR')} €</p>
      <p className="text-sm text-gray-500">
        Actifs {s.assets.toLocaleString('fr-FR')} € − Dettes {s.debts.toLocaleString('fr-FR')} €
      </p>
      {snap.positions.length === 0 && !loading && (
        <p className="mt-6 text-gray-500">Aucun compte. Connecte une banque ou ajoute un placement.</p>
      )}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <AllocationDonut positions={snap.positions} />
        <NetWorthChart history={listHistory()} />
      </div>
      <AccountsList positions={snap.positions} />
      <ManualPositions mode={state.mode} onChange={refresh} />
    </div>
  );
}
