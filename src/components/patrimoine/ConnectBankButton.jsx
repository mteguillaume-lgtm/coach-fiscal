// src/components/patrimoine/ConnectBankButton.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Landmark, Plus } from 'lucide-react';
import { getBackendConfig, setBackendConfig, hasBackendConfig } from '../../lib/patrimoine/backendConfigStore';
import * as gocardless from '../../lib/providers/bank/gocardless';

const EASE = [0.16, 1, 0.3, 1];

export default function ConnectBankButton({ mode = 'solo' }) {
  const [configured, setConfigured] = useState(() => hasBackendConfig());
  const [cfg, setCfg] = useState(() => getBackendConfig());
  const [open, setOpen] = useState(false);
  const [institutionId, setInstitutionId] = useState('');
  const [owner, setOwner] = useState('d1');
  const [error, setError] = useState('');
  const [institutions, setInstitutions] = useState([]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    gocardless.listInstitutions(getBackendConfig())
      .then((list) => { if (!cancelled) setInstitutions(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setInstitutions([]); });
    return () => { cancelled = true; };
  }, [configured]);

  const saveConfig = (e) => {
    e.preventDefault();
    setBackendConfig(cfg);
    setConfigured(hasBackendConfig());
  };

  const connect = async () => {
    setError('');
    try {
      const institutionName = institutions.find((i) => i.id === institutionId)?.name;
      const { link } = await gocardless.startConnect({ ...getBackendConfig(), institutionId, institutionName, owner });
      window.location.href = link;
    } catch (e) {
      setError(e.message);
    }
  };

  if (!configured) {
    return (
      <section className="card-dark card-static p-6 mt-6">
        <h2 className="text-sm font-bold text-ink-0 mb-1 flex items-center gap-2">
          <Landmark size={14} className="text-kapio-300" />
          Synchronisation bancaire
        </h2>
        <p className="text-xs text-ink-200 mb-4">Configure ton backend patrimoine (une seule fois).</p>
        <form onSubmit={saveConfig} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">URL du backend
            <input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
                   placeholder="https://…vercel.app" className="input-dark" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Jeton secret
            <input value={cfg.secret} onChange={(e) => setCfg({ ...cfg, secret: e.target.value })} className="input-dark" />
          </label>
          <button type="submit" className="btn-kapio sm:col-span-2 !text-sm">Enregistrer</button>
        </form>
      </section>
    );
  }

  return (
    <section className="card-dark card-static p-6 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-ink-0 flex items-center gap-2">
          <Landmark size={14} className="text-kapio-300" />
          Synchronisation bancaire
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="btn-ghost-dark !text-xs !px-3 !py-1.5"
        >
          <Plus size={13} className={'transition-transform duration-300 ' + (open ? 'rotate-45' : '')} aria-hidden="true" />
          Connecter une banque
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100 min-w-56 flex-1">Banque
                {institutions.length > 0 ? (
                  <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} className="input-dark">
                    <option value="">— Choisir une banque —</option>
                    {institutions.map((inst) => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                ) : (
                  <input value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}
                         placeholder="ex. BNP_FR…" className="input-dark" />
                )}
              </label>
              {mode === 'couple' && (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Titulaire
                  <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input-dark">
                    <option value="d1">Déclarant 1</option>
                    <option value="d2">Déclarant 2</option>
                    <option value="joint">Commun</option>
                  </select>
                </label>
              )}
              <button onClick={connect} disabled={!institutionId} className="btn-kapio !text-sm disabled:opacity-50">
                Connecter
              </button>
              {error && <p className="w-full text-sm text-danger-400">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
