import { useState } from 'react';
import { getBackendConfig, setBackendConfig, hasBackendConfig } from '../../lib/patrimoine/backendConfigStore';
import * as gocardless from '../../lib/providers/bank/gocardless';

export default function ConnectBankButton({ mode = 'solo' }) {
  const [configured, setConfigured] = useState(() => hasBackendConfig());
  const [cfg, setCfg] = useState(() => getBackendConfig());
  const [institutionId, setInstitutionId] = useState('');
  const [owner, setOwner] = useState('d1');
  const [error, setError] = useState('');

  const saveConfig = (e) => {
    e.preventDefault();
    setBackendConfig(cfg);
    setConfigured(hasBackendConfig());
  };

  const connect = async () => {
    setError('');
    try {
      const { link } = await gocardless.startConnect({ ...getBackendConfig(), institutionId, owner });
      window.location.href = link;
    } catch (e) {
      setError(e.message);
    }
  };

  if (!configured) {
    return (
      <form onSubmit={saveConfig} className="mt-4 space-y-2 rounded border p-4">
        <p className="text-sm text-gray-600">Configure ton backend patrimoine (une seule fois).</p>
        <label className="flex flex-col text-sm">URL du backend
          <input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} placeholder="https://…vercel.app" className="rounded border p-2" />
        </label>
        <label className="flex flex-col text-sm">Jeton secret
          <input value={cfg.secret} onChange={(e) => setCfg({ ...cfg, secret: e.target.value })} className="rounded border p-2" />
        </label>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">Enregistrer</button>
      </form>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-sm">Banque (identifiant GoCardless)
        <input value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} placeholder="ex. BNP_FR…" className="rounded border p-2" />
      </label>
      {mode === 'couple' && (
        <label className="flex flex-col text-sm">Titulaire
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded border p-2">
            <option value="d1">Déclarant 1</option><option value="d2">Déclarant 2</option><option value="joint">Commun</option>
          </select>
        </label>
      )}
      <button onClick={connect} disabled={!institutionId} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50">Connecter une banque</button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
