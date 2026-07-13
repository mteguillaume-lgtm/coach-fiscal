// src/components/patrimoine/NetWorthChart.jsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import GlowCard from '../motion/GlowCard';

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/[0.1] bg-ink-800 px-3 py-2 shadow-2xl">
      <p className="text-xs font-semibold text-ink-0">{label}</p>
      <p className="text-sm font-mono text-kapio-300 mt-0.5">{Number(payload[0].value).toLocaleString('fr-FR')} €</p>
    </div>
  );
}

export default function NetWorthChart({ history }) {
  if (!history || history.length < 2) return null;
  return (
    <GlowCard className="p-6">
      <h3 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
        <TrendingUp size={14} className="text-kapio-300" />
        Évolution du patrimoine
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={history}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2EB88A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2EB88A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis width={70} tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false}
                 tickFormatter={(v) => Number(v).toLocaleString('fr-FR')} />
          <Tooltip content={<DarkTooltip />} />
          <Area type="monotone" dataKey="netWorth" stroke="#2EB88A" strokeWidth={2} fill="url(#netWorthFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </GlowCard>
  );
}
