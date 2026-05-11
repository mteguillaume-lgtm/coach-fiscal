import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate }    from 'react-router-dom';
import toast              from 'react-hot-toast';
import { ChevronDown, X, CheckCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

import { useApp }                   from '../context/AppContext';
import { analyzeDoc, mapExtracted } from '../lib/extractor';
import { buildProfile }             from '../lib/profileGenerator';
import Button                       from '../components/Button';
import Card                         from '../components/Card';

// ─── Section data (module-level — stable references) ──────────────────────────

const SECTION_SIT = {
  id: 'sit', icon: '👤', label: 'Situation du foyer', fields: [
    { key: 'statut',  label: 'Situation familiale', type: 'select', opts: ['Célibataire', 'Marié(e)', 'Pacsé(e)', 'Divorcé(e)', 'Veuf/Veuve'] },
    { key: 'parts',   label: 'Parts fiscales',      type: 'number', ph: '1, 1.5, 2…' },
    { key: 'enfants', label: 'Enfants à charge',    type: 'number', ph: '0' },
    { key: 'dept',    label: 'Département',         type: 'text',   ph: 'Calvados (14)' },
  ],
};

const REV_FIELDS = [
  { key: 'brut',     label: 'Brut imposable annuel (€)', type: 'number', ph: '54 810' },
  { key: 'net_imp',  label: 'Net imposable annuel (€)',  type: 'number', ph: '43 875' },
  { key: 'taux_pas', label: 'Taux PAS (%)',              type: 'number', ph: '11.80'  },
  { key: 'pas_tot',  label: 'PAS prélevé 2025 (€)',      type: 'number', ph: '4 302'  },
  { key: 'frais_r',  label: 'Frais réels (€)',           type: 'number', ph: 'vide = forfait 10%' },
];

const EP_INDIV_FIELDS = [
  { key: 'livret_a',     label: 'Livret A — solde (€)',          type: 'number', ph: '0' },
  { key: 'ldd',          label: 'LDDS — solde (€)',              type: 'number', ph: '0' },
  { key: 'lep',          label: 'LEP — solde (€)',               type: 'number', ph: '0' },
  { key: 'livret_plus',  label: 'Livret+ / Livret bancaire (€)', type: 'number', ph: '0' },
  { key: 'pel',          label: 'PEL — solde (€)',               type: 'number', ph: '0' },
  { key: 'pea',          label: 'PEA — valorisation (€)',        type: 'number', ph: '0' },
  { key: 'per',          label: 'PER versements 2025 (€)',       type: 'number', ph: '0' },
  { key: 'av',           label: 'Assurance-vie (€)',             type: 'number', ph: '0' },
  { key: 'crypto_wallet',label: 'Crypto — valeur wallet (€)',    type: 'number', ph: '0' },
];

const SECTION_REV_SOLO = {
  id: 'rev', icon: '💰', label: 'Revenus 2025', fields: [
    { key: 'brut',     label: 'Brut imposable annuel (€)', type: 'number', ph: '54 810' },
    { key: 'net_imp',  label: 'Net imposable annuel (€)',  type: 'number', ph: '43 875' },
    { key: 'taux_pas', label: 'Taux PAS (%)',              type: 'number', ph: '11.80'  },
    { key: 'pas_tot',  label: 'PAS prélevé 2025 (€)',      type: 'number', ph: '4 302'  },
    { key: 'foncier',  label: 'Revenus fonciers (€)',      type: 'number', ph: '0' },
    { key: 'divid',    label: 'Dividendes/intérêts (€)',   type: 'number', ph: '0' },
    { key: 'crypto',   label: 'Revenus crypto (€)',        type: 'number', ph: '0' },
  ],
};

const SECTION_EP_SOLO = {
  id: 'ep', icon: '📈', label: 'Épargne & Placements', fields: [
    { key: 'livret_a',     label: 'Livret A — solde (€)',          type: 'number', ph: '0' },
    { key: 'ldd',          label: 'LDDS — solde (€)',              type: 'number', ph: '0' },
    { key: 'lep',          label: 'LEP — solde (€)',               type: 'number', ph: '0' },
    { key: 'livret_plus',  label: 'Livret+ / Livret bancaire (€)', type: 'number', ph: '0' },
    { key: 'pel',          label: 'PEL — solde (€)',               type: 'number', ph: '0' },
    { key: 'pea',          label: 'PEA — valorisation (€)',        type: 'number', ph: '0' },
    { key: 'av',           label: 'Assurance-vie (€)',             type: 'number', ph: '0' },
    { key: 'per',          label: 'PER versements 2025 (€)',       type: 'number', ph: '0' },
    { key: 'crypto_wallet',label: 'Crypto — valeur wallet (€)',    type: 'number', ph: '0' },
  ],
};

const SECTION_DED_SOLO = {
  id: 'ded', icon: '✂️', label: 'Déductions', fields: [
    { key: 'dons',     label: 'Dons associations (€)',                  type: 'number', ph: '0' },
    { key: 'garde',    label: 'Frais garde enfants (€)',                type: 'number', ph: '0' },
    { key: 'domicile', label: 'Emploi à domicile (€)',                  type: 'number', ph: '0' },
    { key: 'travaux',  label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0' },
    { key: 'pero_d1',  label: 'PERO — cotisations 2025 (€)',            type: 'number', ph: '0' },
    { key: 'pension',  label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0' },
    { key: 'syndicat', label: 'Cotisations syndicales (€)',             type: 'number', ph: '0' },
    { key: 'frais_r',  label: 'Frais réels (€)',                        type: 'number', ph: 'vide = forfait 10%' },
  ],
};

const SECTION_REV_FOYER = {
  id: 'rev_foyer', icon: '🏦', label: 'Revenus du foyer', fields: [
    { key: 'foncier', label: 'Revenus fonciers (€)',    type: 'number', ph: '0' },
    { key: 'divid',   label: 'Dividendes/intérêts (€)', type: 'number', ph: '0' },
    { key: 'crypto',  label: 'Revenus crypto (€)',      type: 'number', ph: '0' },
  ],
};

const SECTION_DED = {
  id: 'ded', icon: '✂️', label: 'Déductions du foyer', fields: [
    { key: 'dons',     label: 'Dons associations (€)',                  type: 'number', ph: '0' },
    { key: 'garde',    label: 'Frais garde enfants (€)',                type: 'number', ph: '0' },
    { key: 'domicile', label: 'Emploi à domicile (€)',                  type: 'number', ph: '0' },
    { key: 'travaux',  label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0' },
    { key: 'pero_d1',  label: 'PERO D1 — cotisations 2025 (€)',         type: 'number', ph: '0' },
    { key: 'pero_d2',  label: 'PERO D2 — cotisations 2025 (€)',         type: 'number', ph: '0' },
    { key: 'pension',  label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0' },
    { key: 'syndicat', label: 'Cotisations syndicales (€)',             type: 'number', ph: '0' },
  ],
};

const SECTION_IMMO = {
  id: 'immo', icon: '🏠', label: 'Immobilier', fields: [
    { key: 'proprio', label: 'Propriétaire RP ?',         type: 'select', opts: ['Non', 'Oui'] },
    { key: 'locatif', label: 'Bien locatif ?',            type: 'select', opts: ['Non', 'Oui — micro', 'Oui — réel'] },
    { key: 'rev_loc', label: 'Revenus locatifs 2025 (€)', type: 'number', ph: '0' },
  ],
};

const SOLO_SECTIONS = [SECTION_SIT, SECTION_REV_SOLO, SECTION_EP_SOLO, SECTION_DED_SOLO, SECTION_IMMO];

// ─── Sub-components (outside main component — prevents focus loss on re-render) ──

function FieldRow({ f, value, onChange, autoFKeys }) {
  const isAuto = !!(autoFKeys && autoFKeys[f.key]);
  const base = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white transition-colors';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {f.label}
        {isAuto && <span className="ml-1.5 text-teal-500 text-xs font-normal">✨ auto</span>}
      </label>
      {f.type === 'select' ? (
        <select
          value={value || ''}
          onChange={e => onChange(f.key, e.target.value)}
          className={`${base} ${isAuto ? 'border-teal-300' : 'border-gray-200'}`}
        >
          <option value="">— Choisir —</option>
          {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={f.type}
          placeholder={f.ph}
          value={value || ''}
          onChange={e => onChange(f.key, e.target.value)}
          className={`${base} ${isAuto ? 'border-teal-300' : 'border-gray-200'}`}
        />
      )}
    </div>
  );
}

function AccSection({ section, data, onChange, autoFKeys, activeAcc, setActiveAcc }) {
  const filled = section.fields.filter(f => data[f.key] && data[f.key] !== '').length;
  const pct    = Math.round(filled / section.fields.length * 100);
  const open   = activeAcc === section.id;
  return (
    <div className={`rounded-xl border mb-2 transition-all ${open ? 'border-teal-200 bg-teal-50/30' : 'border-gray-100 bg-white'}`}>
      <button
        type="button"
        onClick={() => setActiveAcc(open ? null : section.id)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{section.icon}</span>
          <span className="font-semibold text-sm text-gray-800">{section.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400">{filled}/{section.fields.length}</span>
          <div className="w-7 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-teal-500' : 'bg-purple-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-3" onClick={e => e.stopPropagation()}>
          {section.fields.map(f => (
            <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocItem({ doc, onRemove }) {
  return (
    <div className="flex gap-2.5 items-start bg-white border border-gray-100 rounded-xl p-3 mt-2 shadow-sm">
      <div className="shrink-0 mt-0.5">
        {doc.status === 'loading' && <Loader2 size={16} className="text-teal-500 animate-spin" />}
        {doc.status === 'done'    && <CheckCircle size={16} className="text-teal-500" />}
        {doc.status === 'error'   && <AlertCircle size={16} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-gray-400 mb-1 truncate">{doc.name}</p>
        {doc.status === 'loading' && <p className="text-xs text-gray-400">Extraction IA en cours…</p>}
        {doc.status === 'done' && (
          <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{doc.extracted}</p>
        )}
        {doc.status === 'done' && doc.warning && (
          <div className={`mt-2 text-xs px-2 py-1.5 rounded-lg ${
            doc.warning.startsWith('✅')
              ? 'bg-teal-50 border border-teal-200 text-teal-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700'
          }`}>
            {doc.warning}
          </div>
        )}
        {doc.status === 'error' && <p className="text-xs text-red-500 truncate">{doc.error}</p>}
      </div>
      <button
        type="button"
        onClick={() => onRemove(doc.id)}
        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
        aria-label="Supprimer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function UploadZone({ target, uploading, docs, onFiles, onRemove }) {
  const inputRef = useRef();
  const mine = docs.filter(d => d.target === target);
  return (
    <div className="mb-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={e => onFiles(e.target.files, target)}
      />
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files, target); }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-teal-300 hover:bg-teal-50/30 transition-all"
      >
        <div className="text-xl mb-1">{uploading ? '⏳' : '📂'}</div>
        <p className="text-sm font-semibold text-gray-700">{uploading ? 'Analyse IA…' : 'Glisse ou clique'}</p>
        <p className="text-xs text-gray-400 mt-0.5">JPG · PNG · PDF</p>
      </div>
      {mine.map(doc => (
        <DocItem key={doc.id} doc={doc} onRemove={onRemove} />
      ))}
    </div>
  );
}

function DeclarantBlock({ num, data, onChange, autoFKeys, uploadTarget, activeAcc, setActiveAcc, uploading, docs, onFiles, onRemove }) {
  const allFields = [...REV_FIELDS, ...EP_INDIV_FIELDS];
  const filled = allFields.filter(f => data[f.key] && data[f.key] !== '').length;
  const pct    = Math.round(filled / allFields.length * 100);
  const id     = `d${num}`;
  const open   = activeAcc === id;
  const isD1   = num === 1;
  return (
    <div className={`rounded-xl border mb-2 transition-all ${
      open
        ? (isD1 ? 'border-teal-200 bg-teal-50/20' : 'border-purple-200 bg-purple-50/20')
        : 'border-gray-100 bg-white'
    }`}>
      <button
        type="button"
        onClick={() => setActiveAcc(open ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold font-mono border ${
            isD1
              ? 'bg-teal-50 border-teal-200 text-teal-600'
              : 'bg-purple-50 border-purple-200 text-purple-600'
          }`}>
            D{num}
          </span>
          <span className="font-semibold text-sm text-gray-800">Déclarant {num}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${
            pct === 100
              ? (isD1 ? 'text-teal-500' : 'text-purple-500')
              : 'text-gray-400'
          }`}>
            {filled}/{allFields.length}
          </span>
          <div className="w-7 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isD1 ? 'bg-teal-500' : 'bg-purple-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4" onClick={e => e.stopPropagation()}>
          <UploadZone target={uploadTarget} uploading={uploading} docs={docs} onFiles={onFiles} onRemove={onRemove} />
          {Object.keys(autoFKeys).length > 0 && (
            <div className={`text-xs px-3 py-2 rounded-lg mb-3 border ${
              isD1
                ? 'bg-teal-50 border-teal-200 text-teal-700'
                : 'bg-purple-50 border-purple-200 text-purple-700'
            }`}>
              ✨ {Object.keys(autoFKeys).length} champ(s) pré-rempli(s) — vérifie les valeurs
            </div>
          )}
          <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-2 mt-1">💰 Revenus 2025</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {REV_FIELDS.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} />
            ))}
          </div>
          <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-2">📈 Épargne individuelle</p>
          <div className="grid grid-cols-2 gap-3">
            {EP_INDIV_FIELDS.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Collect() {
  const { state, dispatch, getApiKey } = useApp();
  const navigate = useNavigate();
  const isCouple = state.mode === 'couple';

  const [formData,   setFormData]   = useState(() => state.formData || {});
  const [d1Data,     setD1Data]     = useState(() => state.d1Data   || {});
  const [d2Data,     setD2Data]     = useState(() => state.d2Data   || {});
  const [docs,       setDocs]       = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [activeAcc,  setActiveAcc]  = useState('sit');
  const [autoFilled, setAutoFilled] = useState({});
  const [autoF1,     setAutoF1]     = useState({});
  const [autoF2,     setAutoF2]     = useState({});

  const handleChange   = (key, val) => { setFormData(p => ({ ...p, [key]: val })); setAutoFilled(p => { const n = { ...p }; delete n[key]; return n; }); };
  const handleD1Change = (key, val) => { setD1Data(p => ({ ...p, [key]: val }));   setAutoF1(p    => { const n = { ...p }; delete n[key]; return n; }); };
  const handleD2Change = (key, val) => { setD2Data(p => ({ ...p, [key]: val }));   setAutoF2(p    => { const n = { ...p }; delete n[key]; return n; }); };
  const removeDoc = id => setDocs(p => p.filter(d => d.id !== id));

  // Log au montage pour diagnostic DevTools
  useEffect(() => {
    console.log('Fichiers anonymisés disponibles:', state.anonymizedFiles);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(async (files, target = 'solo') => {
    if (!files || !files.length) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      toast.error('Clé API manquante — configure-la dans Réglages.');
      return;
    }
    setUploading(true);
    const newDocs = Array.from(files).map(f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      status: 'loading',
      extracted: null,
      warning: null,
      file: f,
      target,
    }));
    setDocs(p => [...p, ...newDocs]);
    for (const doc of newDocs) {
      try {
        const extracted = await analyzeDoc(doc.file, apiKey);
        const { map: mapped, warning } = mapExtracted(extracted);
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'done', extracted, warning } : d));
        if (Object.keys(mapped).length > 0) {
          const mark = Object.fromEntries(Object.keys(mapped).map(k => [k, true]));
          if      (target === 'd1') { setD1Data(p => ({ ...mapped, ...p }));   setAutoF1(p => ({ ...p, ...mark })); }
          else if (target === 'd2') { setD2Data(p => ({ ...mapped, ...p }));   setAutoF2(p => ({ ...p, ...mark })); }
          else                      { setFormData(p => ({ ...mapped, ...p })); setAutoFilled(p => ({ ...p, ...mark })); }
        }
      } catch (e) {
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'error', error: e.message } : d));
      }
    }
    setUploading(false);
  }, [getApiKey]);

  // Progress
  const { filled: totalF, total: totalAll, pct } = (() => {
    if (!isCouple) {
      const total  = SOLO_SECTIONS.reduce((a, s) => a + s.fields.length, 0);
      const filled = SOLO_SECTIONS.reduce((a, s) => a + s.fields.filter(f => formData[f.key] && formData[f.key] !== '').length, 0);
      return { filled, total, pct: Math.round(filled / total * 100) };
    }
    const foyer   = [SECTION_SIT, SECTION_REV_FOYER, SECTION_DED, SECTION_IMMO];
    const foyerT  = foyer.reduce((a, s) => a + s.fields.length, 0);
    const foyerF  = foyer.reduce((a, s) => a + s.fields.filter(f => formData[f.key] && formData[f.key] !== '').length, 0);
    const dFields = [...REV_FIELDS, ...EP_INDIV_FIELDS];
    const d1F = dFields.filter(f => d1Data[f.key] && d1Data[f.key] !== '').length;
    const d2F = dFields.filter(f => d2Data[f.key] && d2Data[f.key] !== '').length;
    const total  = foyerT + dFields.length * 2;
    const filled = foyerF + d1F + d2F;
    return { filled, total, pct: Math.round(filled / total * 100) };
  })();

  const handleGenerate = () => {
    dispatch({ type: 'SET_FORM_DATA', payload: formData });
    dispatch({ type: 'SET_D1_DATA',   payload: d1Data });
    dispatch({ type: 'SET_D2_DATA',   payload: d2Data });
    const profile = buildProfile(formData, d1Data, d2Data, docs, isCouple);
    dispatch({ type: 'SET_PROFILE',   payload: profile });
    navigate('/profile');
  };

  // Charge les blobs anonymisés depuis le step précédent dans la zone d'upload
  const anonymizedFiles = state.anonymizedFiles || [];
  const handleUseAnonymized = useCallback(() => {
    const files = anonymizedFiles
      .filter(f => f.blob)
      .map(f => new File([f.blob], f.name, { type: 'application/pdf' }));
    if (files.length === 0) {
      toast.error('Les fichiers ne sont plus disponibles — uploader manuellement.');
      return;
    }
    const target = isCouple ? 'd1' : 'solo';
    handleFiles(files, target);
  }, [anonymizedFiles, handleFiles, isCouple]);

  const accProps    = { activeAcc, setActiveAcc };
  const uploadProps = { uploading, docs, onFiles: handleFiles, onRemove: removeDoc };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-20">

      {/* Header */}
      <div className="mb-6">
        <div className="flex gap-2 flex-wrap mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono bg-teal-50 text-teal-600 border border-teal-200">
            🇫🇷 Fiscal 2025
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono bg-purple-50 text-purple-600 border border-purple-200">
            IA Auto-Fill
          </span>
          {isCouple && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono bg-amber-50 text-amber-600 border border-amber-200">
              👫 Mode couple
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Collecte fiscale</h1>
        <p className="text-sm text-gray-500">
          Upload tes documents anonymisés → l'IA extrait les chiffres → tu vérifies et génères ton profil.
        </p>
      </div>

      {/* Bannière fichiers anonymisés — visible si on vient de /anonymize */}
      {anonymizedFiles.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-teal-800">
            <span>✅</span>
            <span>
              <strong>{anonymizedFiles.length} fichier(s) anonymisé(s)</strong> disponible(s) depuis l'étape précédente.
              {isCouple && <span className="text-teal-600"> (sera chargé dans D1)</span>}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleUseAnonymized} disabled={uploading}>
            Utiliser →
          </Button>
        </div>
      )}

      {/* Mode indicator (couple only) */}
      {isCouple && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-gray-700">
          <span>💡</span>
          <span>
            <strong className="text-amber-700">Marié(e) ou Pacsé(e) depuis 2024</strong> — déclaration commune obligatoire.
            Remplis les blocs D1 et D2 avec vos fiches de paie respectives.
          </span>
        </div>
      )}

      {/* Progress bar */}
      <Card className="mb-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Profil complété</span>
              <span className={`text-xs font-mono font-semibold ${pct === 100 ? 'text-teal-600' : 'text-purple-500'}`}>
                {pct}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-purple-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-gray-800">{totalF}</div>
            <div className="text-xs text-gray-400 font-mono">/{totalAll} champs</div>
          </div>
        </div>
      </Card>

      {/* Upload zone — solo only (couple uploads are inside each DeclarantBlock) */}
      {!isCouple && (
        <Card className="mb-4 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">📎 Upload documents</h2>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-gray-700">
            <span>🔒</span>
            <span>
              <strong className="text-amber-700">Anonymise impérativement</strong> — masque nom, adresse, n° SS, IBAN.
              Garde les montants.
            </span>
          </div>
          <UploadZone target="solo" {...uploadProps} />
          {Object.keys(autoFilled).length > 0 && (
            <div className="mt-2 text-xs bg-teal-50 border border-teal-200 text-teal-700 rounded-lg px-3 py-2">
              ✨ {Object.keys(autoFilled).length} champ(s) pré-rempli(s) automatiquement par l'IA.
            </div>
          )}
        </Card>
      )}

      {/* Form sections */}
      <Card className="mb-4 p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">✏️ Compléter / vérifier</h2>

        <AccSection
          section={SECTION_SIT}
          data={formData}
          onChange={handleChange}
          autoFKeys={autoFilled}
          {...accProps}
        />

        {!isCouple ? (
          <>
            <AccSection section={SECTION_REV_SOLO} data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
            <AccSection section={SECTION_EP_SOLO}  data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
            <AccSection section={SECTION_DED_SOLO} data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
            <AccSection section={SECTION_IMMO}     data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-2 text-xs text-blue-700">
              <span>🔒</span>
              <span>
                <strong>Upload séparé par déclarant</strong> — dépose les fiches dans le bloc correspondant pour un auto-fill précis.
              </span>
            </div>
            <DeclarantBlock
              num={1} data={d1Data} onChange={handleD1Change} autoFKeys={autoF1}
              uploadTarget="d1" {...accProps} {...uploadProps}
            />
            <DeclarantBlock
              num={2} data={d2Data} onChange={handleD2Change} autoFKeys={autoF2}
              uploadTarget="d2" {...accProps} {...uploadProps}
            />
            <AccSection section={SECTION_REV_FOYER} data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} />
            <AccSection section={SECTION_DED}        data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} />
            <AccSection section={SECTION_IMMO}       data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} />
          </>
        )}
      </Card>

      {/* Generate CTA */}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handleGenerate}
      >
        Générer mon profil fiscal →
      </Button>

      <div className="flex justify-start mt-1">
        <Button variant="ghost" size="sm" onClick={() => navigate('/anonymize')}>
          <ArrowLeft size={14} /> Retour à l&apos;anonymisation
        </Button>
      </div>

    </div>
  );
}
