// src/components/patrimoine/AllocationDonut.jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { byType } from '../../lib/patrimoine/calculator';

const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#dc2626', '#4b5563'];
const LABELS = { checking: 'Comptes', savings: 'Livrets', life_insurance: 'Assurance-vie', pea: 'PEA', securities: 'Titres', per: 'PER', loan: 'Prêts', real_estate: 'Immobilier' };

export default function AllocationDonut({ positions }) {
  const data = Object.entries(byType(positions))
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({ name: LABELS[type] || type, value }));
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} />
      </PieChart>
    </ResponsiveContainer>
  );
}
