// src/components/patrimoine/AccountsList.jsx
import { Landmark } from 'lucide-react';
import { byBank } from '../../lib/patrimoine/calculator';

export default function AccountsList({ positions }) {
  const auto = positions.filter((p) => p.source === 'gocardless');
  if (auto.length === 0) return null;
  const totals = byBank(auto);
  const banks = [...new Set(auto.map((p) => p.bank || '—'))];
  return (
    <section className="card-dark card-static p-6 mt-6">
      <h2 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
        <Landmark size={14} className="text-kapio-300" />
        Comptes (synchronisés)
      </h2>
      {banks.map((bank) => (
        <div key={bank} className="mt-4 first:mt-0">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <span className="text-sm font-semibold text-ink-0">{bank}</span>
            <span className="text-sm font-semibold text-kapio-300">{totals[bank].toLocaleString('fr-FR')} €</span>
          </div>
          <ul>
            {auto.filter((p) => (p.bank || '—') === bank).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                <span className="text-sm text-ink-100">{p.label}</span>
                <span className="text-sm font-semibold text-ink-0">{Number(p.value).toLocaleString('fr-FR')} €</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
