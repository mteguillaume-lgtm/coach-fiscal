// src/components/patrimoine/NetWorthChart.jsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function NetWorthChart({ history }) {
  if (!history || history.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={history}>
        <XAxis dataKey="date" fontSize={11} />
        <YAxis width={70} tickFormatter={(v) => `${Number(v).toLocaleString('fr-FR')}`} fontSize={11} />
        <Tooltip formatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} />
        <Area type="monotone" dataKey="netWorth" stroke="#2563eb" fill="#93c5fd" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
