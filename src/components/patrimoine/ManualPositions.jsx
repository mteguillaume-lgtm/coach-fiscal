// src/components/patrimoine/ManualPositions.jsx
import { useState } from 'react';
import { listManual, addManual, removeManual } from '../../lib/patrimoine/manualStore';
import { POSITION_TYPES } from '../../lib/patrimoine/model';

const TYPE_LABELS = {
  checking: 'Compte courant', savings: 'Livret', life_insurance: 'Assurance-vie',
  pea: 'PEA', securities: 'Compte-titres', per: 'PER', loan: 'Prêt', real_estate: 'Immobilier',
};

export default function ManualPositions({ mode = 'solo', onChange }) {
  const [list, setList] = useState(() => listManual());
  const [form, setForm] = useState({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });

  const commit = (next) => { setList(next); onChange?.(); };
  const add = (e) => {
    e.preventDefault();
    commit(addManual({ ...form, value: Number(form.value) }));
    setForm({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Placements & prêts (saisie manuelle)</h2>
      <ul className="mt-3 divide-y">
        {list.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2">
            <span><span>{p.label || TYPE_LABELS[p.type]}</span> — {Number(p.value).toLocaleString('fr-FR')} €</span>
            <button aria-label={`Supprimer ${p.label}`} onClick={() => commit(removeManual(p.id))} className="text-red-600">✕</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col text-sm">Type
          <select value={form.type} onChange={set('type')} className="rounded border p-2">
            {POSITION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">Libellé
          <input value={form.label} onChange={set('label')} className="rounded border p-2" />
        </label>
        <label className="flex flex-col text-sm">Organisme
          <input value={form.bank} onChange={set('bank')} className="rounded border p-2" />
        </label>
        <label className="flex flex-col text-sm">Valeur (€)
          <input type="number" step="0.01" value={form.value} onChange={set('value')} className="rounded border p-2" />
          {form.type === 'loan' && (
            <span className="mt-1 text-xs text-gray-500">
              Saisis le capital restant dû ; il sera compté comme une dette.
            </span>
          )}
        </label>
        {mode === 'couple' && (
          <label className="flex flex-col text-sm">Titulaire
            <select value={form.owner} onChange={set('owner')} className="rounded border p-2">
              <option value="d1">Déclarant 1</option>
              <option value="d2">Déclarant 2</option>
              <option value="joint">Commun</option>
            </select>
          </label>
        )}
        <button type="submit" className="col-span-2 rounded bg-blue-600 px-4 py-2 text-white">Ajouter</button>
      </form>
    </section>
  );
}
