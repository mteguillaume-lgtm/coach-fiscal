// src/components/patrimoine/ManualPositions.jsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, PiggyBank } from 'lucide-react';
import { listManual, addManual, removeManual } from '../../lib/patrimoine/manualStore';
import { POSITION_TYPES } from '../../lib/patrimoine/model';

const EASE = [0.16, 1, 0.3, 1];

const TYPE_LABELS = {
  checking: 'Compte courant', savings: 'Livret', life_insurance: 'Assurance-vie',
  pea: 'PEA', securities: 'Compte-titres', per: 'PER', loan: 'Prêt', real_estate: 'Immobilier',
};

export default function ManualPositions({ mode = 'solo', onChange }) {
  const [list, setList] = useState(() => listManual());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });

  const commit = (next) => { setList(next); onChange?.(); };
  const add = (e) => {
    e.preventDefault();
    commit(addManual({ ...form, value: Number(form.value) }));
    setForm({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="card-dark card-static p-6 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-ink-0 flex items-center gap-2">
          <PiggyBank size={14} className="text-kapio-300" />
          Placements &amp; prêts (saisie manuelle)
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="btn-ghost-dark !text-xs !px-3 !py-1.5"
        >
          <Plus size={13} className={'transition-transform duration-300 ' + (open ? 'rotate-45' : '')} aria-hidden="true" />
          Ajouter un placement
        </button>
      </div>

      {list.length > 0 && (
        <ul className="mt-4">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
              <span className="text-sm text-ink-100">
                <span className="text-ink-0 font-medium">{p.label || TYPE_LABELS[p.type]}</span>
                {' — '}{Number(p.value).toLocaleString('fr-FR')} €
              </span>
              <button
                type="button"
                aria-label={`Supprimer ${p.label}`}
                onClick={() => commit(removeManual(p.id))}
                className="text-ink-300 hover:text-danger-400 transition-colors p-1"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <form onSubmit={add} className="mt-5 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Type
                <select value={form.type} onChange={set('type')} className="input-dark">
                  {POSITION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Libellé
                <input value={form.label} onChange={set('label')} className="input-dark" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Organisme
                <input value={form.bank} onChange={set('bank')} className="input-dark" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Valeur (€)
                <input type="number" step="0.01" value={form.value} onChange={set('value')} className="input-dark" />
                {form.type === 'loan' && (
                  <span className="mt-1 text-xs font-normal text-ink-200">
                    Saisis le capital restant dû ; il sera compté comme une dette.
                  </span>
                )}
              </label>
              {mode === 'couple' && (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Titulaire
                  <select value={form.owner} onChange={set('owner')} className="input-dark">
                    <option value="d1">Déclarant 1</option>
                    <option value="d2">Déclarant 2</option>
                    <option value="joint">Commun</option>
                  </select>
                </label>
              )}
              <button type="submit" className="btn-kapio col-span-2 !text-sm">Ajouter</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
