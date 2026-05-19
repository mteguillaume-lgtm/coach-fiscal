import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// Versements (bleu) en bas, intérêts nets (orange/ambre) au-dessus
const COLOR_VERS  = '#5B7CFA';
const COLOR_INTER = '#F5A623';

const fmt = n => Math.round(n).toLocaleString('fr-FR');

function EvTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const vers  = payload.find(p => p.dataKey === 'versements')?.value ?? 0;
  const inter = payload.find(p => p.dataKey === 'interets')?.value ?? 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xl p-3 text-xs min-w-[180px]">
      <p className="font-bold text-gray-700 mb-1.5">Année {label}</p>
      <div className="flex justify-between gap-4 py-0.5">
        <span className="text-gray-500">Total</span>
        <span className="font-bold font-mono">{fmt(vers + inter)} €</span>
      </div>
      <div className="flex justify-between gap-4 py-0.5">
        <span style={{ color: COLOR_VERS }} className="font-medium">Versements</span>
        <span className="font-bold font-mono">{fmt(vers)} €</span>
      </div>
      <div className="flex justify-between gap-4 py-0.5">
        <span style={{ color: COLOR_INTER }} className="font-medium">Intérêts nets</span>
        <span className="font-bold font-mono">{fmt(inter)} €</span>
      </div>
    </div>
  );
}

/**
 * Graphique d'évolution empilé : versements (bleu) + intérêts nets (orange).
 *
 * @param {{ data: Array<{ year: number, versements: number, interets: number }>, height?: number }} props
 */
export default function EvolutionChart({ data, height = 280 }) {
  const formatY = v => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
    return String(v);
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradVers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={COLOR_VERS}  stopOpacity={0.85} />
              <stop offset="95%" stopColor={COLOR_VERS}  stopOpacity={0.55} />
            </linearGradient>
            <linearGradient id="gradInter" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={COLOR_INTER} stopOpacity={0.90} />
              <stop offset="95%" stopColor={COLOR_INTER} stopOpacity={0.60} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="#f3f4f6"
            vertical={false}
          />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={v => `${v}a`}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={formatY}
            width={40}
          />
          <Tooltip content={<EvTooltip />} />
          <Area
            type="monotone"
            dataKey="versements"
            stackId="stack"
            stroke={COLOR_VERS}
            fill="url(#gradVers)"
            strokeWidth={1.5}
            name="Versements"
          />
          <Area
            type="monotone"
            dataKey="interets"
            stackId="stack"
            stroke={COLOR_INTER}
            fill="url(#gradInter)"
            strokeWidth={1.5}
            name="Intérêts nets"
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* Légende manuelle — Recharts Legend n'est pas utilisé pour garder le positionnement sous le graphique */}
      <div className="flex justify-center gap-6 mt-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLOR_VERS }} />
          Versements
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLOR_INTER }} />
          Intérêts nets
        </span>
      </div>
    </div>
  );
}
