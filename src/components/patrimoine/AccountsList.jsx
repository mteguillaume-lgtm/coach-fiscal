// src/components/patrimoine/AccountsList.jsx
import { byBank } from '../../lib/patrimoine/calculator';

export default function AccountsList({ positions }) {
  const auto = positions.filter((p) => p.source === 'gocardless');
  if (auto.length === 0) return null;
  const totals = byBank(auto);
  const banks = [...new Set(auto.map((p) => p.bank))];
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Comptes (synchronisés)</h2>
      {banks.map((bank) => (
        <div key={bank} className="mt-3">
          <div className="flex justify-between font-medium">
            <span>{bank}</span>
            <span>{totals[bank].toLocaleString('fr-FR')} €</span>
          </div>
          <ul className="ml-4 text-sm text-gray-600">
            {auto.filter((p) => p.bank === bank).map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.label}</span><span>{Number(p.value).toLocaleString('fr-FR')} €</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
