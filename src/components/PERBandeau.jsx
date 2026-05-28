import { useApp }  from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { calcIR, getTMI } from '../lib/taxCalculator';

const fmt = n => Math.round(n).toLocaleString('fr-FR');

export default function PERBandeau() {
  const { state }  = useApp();
  const navigate   = useNavigate();
  const sim        = state.perSimulation ?? {};
  const p          = state.parsedProfile ?? {};
  const rniFoyer   = p.rniFoyer || 0;
  const isCouple   = p.mode === 'couple';
  const parts      = p.parts || (isCouple ? 2 : 1);

  const d1 = sim.versementD1 || 0;
  const d2 = sim.versementD2 || 0;
  const total = d1 + d2;

  if (total <= 0 || rniFoyer <= 0) return null;

  const irAvant  = calcIR(rniFoyer, parts, isCouple);
  const rniApres = Math.max(0, rniFoyer - total);
  const economie = Math.max(0, irAvant - calcIR(rniApres, parts, isCouple));
  const tmiApres = getTMI(rniApres, parts);

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/60 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap text-xs text-teal-800">
        <span className="font-bold uppercase tracking-wide text-xs text-teal-500">PER simulé</span>
        {isCouple ? (
          <>
            <span>D1 : <strong className="font-mono">{fmt(d1)} €</strong></span>
            <span className="text-teal-400">·</span>
            <span>D2 : <strong className="font-mono">{fmt(d2)} €</strong></span>
            <span className="text-teal-400">·</span>
          </>
        ) : (
          <>
            <span>Versement : <strong className="font-mono">{fmt(d1)} €</strong></span>
            <span className="text-teal-400">·</span>
          </>
        )}
        <span>Économie IR : <strong className="font-mono text-teal-700">{fmt(economie)} €</strong></span>
        <span className="text-teal-400">·</span>
        <span>TMI résiduelle : <strong className="font-mono">{tmiApres} %</strong></span>
      </div>
      <button
        type="button"
        onClick={() => navigate('/simulator')}
        className="text-xs font-semibold text-teal-600 hover:text-teal-800 underline underline-offset-2 whitespace-nowrap"
      >
        Modifier
      </button>
    </div>
  );
}
