// src/components/patrimoine/AllocationDonut.jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { byType } from '../../lib/patrimoine/calculator';
import GlowCard from '../motion/GlowCard';

const COLORS = ['#5ECFAE', '#2EB88A', '#1D9E75', '#F59E0B', '#34D399', '#FBBF24', '#F87171', '#71717A'];
const LABELS = { checking: 'Comptes', savings: 'Livrets', life_insurance: 'Assurance-vie', pea: 'PEA', securities: 'Titres', per: 'PER', loan: 'Prêts', real_estate: 'Immobilier' };

function DarkTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-white/[0.1] bg-ink-800 px-3 py-2 shadow-2xl">
      <p className="text-xs font-semibold text-ink-0">{d.name}</p>
      <p className="text-sm font-mono text-kapio-300 mt-0.5">{Number(d.value).toLocaleString('fr-FR')} €</p>
    </div>
  );
}

export default function AllocationDonut({ positions }) {
  const data = Object.entries(byType(positions))
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({ name: LABELS[type] || type, value }));
  if (data.length === 0) return null;
  return (
    <GlowCard className="p-6">
      <h3 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
        <PieIcon size={14} className="text-kapio-300" />
        Allocation
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<DarkTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs text-ink-100">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </GlowCard>
  );
}
