import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate }    from 'react-router-dom';
import toast              from 'react-hot-toast';
import {
  ChevronDown, X, CheckCircle, AlertCircle, Loader2, ArrowLeft,
  Upload, Sparkles, Users, User, Home, TrendingUp, Scissors, Building2, FolderOpen,
} from 'lucide-react';

import { useApp }                   from '../context/AppContext';
import { analyzeDoc, mapExtracted } from '../lib/extractor';
import { parseProfile }             from '../lib/profileParser';
import { buildProfile }             from '../lib/profileGenerator';
import Button                       from '../components/Button';
import Card                         from '../components/Card';

// ─── Section data (module-level — stable references) ──────────────────────────

const SECTION_SIT = {
  id: 'sit', Icon: User, label: 'Situation du foyer', fields: [
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
  id: 'rev', Icon: TrendingUp, label: 'Revenus 2025', fields: [
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
  id: 'ep', Icon: Building2, label: 'Épargne & Placements', fields: [
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
  id: 'ded', Icon: Scissors, label: 'Déductions', fields: [
    { key: 'dons',     label: 'Dons associations (€)',                  type: 'number', ph: '0' },
    { key: 'garde',    label: 'Frais garde enfants (€)',                type: 'number', ph: '0' },
    { key: 'domicile', label: 'Emploi à domicile (€)',                  type: 'number', ph: '0' },
    { key: 'travaux',  label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0' },
    { key: 'pero_d1',  label: 'PERO — cotisations 2025 (€)',            type: 'number', ph: '0', hint: 'Déjà déduit de votre 1AJ — renseignez uniquement pour calculer votre plafond PER disponible N+1.' },
    { key: 'pension',  label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0' },
    { key: 'syndicat', label: 'Cotisations syndicales (€)',             type: 'number', ph: '0' },
    { key: 'frais_r',  label: 'Frais réels (€)',                        type: 'number', ph: 'vide = forfait 10%' },
  ],
};

const SECTION_REV_FOYER = {
  id: 'rev_foyer', Icon: TrendingUp, label: 'Revenus du foyer', fields: [
    { key: 'foncier', label: 'Revenus fonciers (€)',    type: 'number', ph: '0' },
    { key: 'divid',   label: 'Dividendes/intérêts (€)', type: 'number', ph: '0' },
    { key: 'crypto',  label: 'Revenus crypto (€)',      type: 'number', ph: '0' },
  ],
};

const SECTION_DED = {
  id: 'ded', Icon: Scissors, label: 'Déductions du foyer', fields: [
    { key: 'dons',     label: 'Dons associations (€)',                  type: 'number', ph: '0' },
    { key: 'garde',    label: 'Frais garde enfants (€)',                type: 'number', ph: '0' },
    { key: 'domicile', label: 'Emploi à domicile (€)',                  type: 'number', ph: '0' },
    { key: 'travaux',  label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0' },
    { key: 'pero_d1',  label: 'PERO D1 — cotisations 2025 (€)',         type: 'number', ph: '0', hint: 'Déjà déduit du 1AJ — renseignez uniquement pour calculer le plafond PER D1 disponible N+1.' },
    { key: 'pero_d2',  label: 'PERO D2 — cotisations 2025 (€)',         type: 'number', ph: '0', hint: 'Déjà déduit du 1AJ — renseignez uniquement pour calculer le plafond PER D2 disponible N+1.' },
    { key: 'pension',  label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0' },
    { key: 'syndicat', label: 'Cotisations syndicales (€)',             type: 'number', ph: '0' },
  ],
};

const SECTION_IMMO = {
  id: 'immo', Icon: Home, label: 'Immobilier', fields: [
    { key: 'proprio', label: 'Propriétaire RP ?',         type: 'select', opts: ['Non', 'Oui'] },
    { key: 'locatif', label: 'Bien locatif ?',            type: 'select', opts: ['Non', 'Oui — micro', 'Oui — réel'] },
    { key: 'rev_loc', label: 'Revenus locatifs 2025 (€)', type: 'number', ph: '0' },
  ],
};

const SOLO_SECTIONS = [SECTION_SIT, SECTION_REV_SOLO, SECTION_EP_SOLO, SECTION_DED_SOLO, SECTION_IMMO];

// ─── Sub-components (outside main component — prevents focus loss on re-render) ──

function FieldRow({ f, value, onChange, autoFKeys }) {
  const isAuto = !!(autoFKeys && autoFKeys[f.key]);
  const base = [
    'w-full rounded-xl border px-3 py-2.5 text-sm bg-white',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all',
    'font-sans placeholder:text-gray-300',
    isAuto ? 'border-teal-300 focus:ring-teal-300/50' : 'border-gray-200 focus:ring-teal-300/50',
  ].join(' ');

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {f.label}
        {isAuto && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-teal-500 text-xs font-normal">
            <Sparkles size={10} /> auto
          </span>
        )}
      </label>
      {f.type === 'select' ? (
        <select
          value={value || ''}
          onChange={e => onChange(f.key, e.target.value)}
          className={base}
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
          className={base}
        />
      )}
      {f.hint && (
        <p className="mt-1.5 text-xs text-amber-600 leading-snug">{f.hint}</p>
      )}
    </div>
  );
}

function AccSection({ section, data, onChange, autoFKeys, activeAcc, setActiveAcc }) {
  const { Icon } = section;
  const filled = section.fields.filter(f => data[f.key] && data[f.key] !== '').length;
  const pct    = Math.round(filled / section.fields.length * 100);
  const open   = activeAcc === section.id;

  return (
    <div className={[
      'rounded-2xl border mb-2 transition-all duration-200 overflow-hidden',
      open ? 'border-teal-200 shadow-sm' : 'border-gray-100 bg-white',
    ].join(' ')}>
      <button
        type="button"
        onClick={() => setActiveAcc(open ? null : section.id)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={[
            'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
            open ? 'bg-teal-gradient text-white' : 'bg-gray-100 text-gray-400',
          ].join(' ')}>
            <Icon size={14} aria-hidden="true" />
          </div>
          <span className="font-semibold text-sm text-gray-800">{section.label}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono text-gray-400">{filled}/{section.fields.length}</span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-teal-500' : 'bg-purple-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-teal-50/20" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-3">
            {section.fields.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocItem({ doc, onRemove }) {
  return (
    <div className={[
      'flex gap-2.5 items-start rounded-xl p-3 mt-2 border',
      doc.status === 'done'    ? 'bg-teal-50/50 border-teal-100'  : '',
      doc.status === 'error'   ? 'bg-red-50/50 border-red-100'    : '',
      doc.status === 'loading' ? 'bg-gray-50 border-gray-100'     : '',
    ].join(' ')}>
      <div className="shrink-0 mt-0.5">
        {doc.status === 'loading' && <Loader2 size={15} className="text-teal-500 animate-spin" />}
        {doc.status === 'done'    && <CheckCircle size={15} className="text-teal-500" />}
        {doc.status === 'error'   && <AlertCircle size={15} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-gray-400 mb-1 truncate">{doc.name}</p>
        {doc.status === 'loading' && (
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            Extraction IA…
          </p>
        )}
        {doc.status === 'done' && (
          <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{doc.extracted}</p>
        )}
        {doc.status === 'done' && doc.warning && (
          <div className={[
            'mt-2 text-xs px-2.5 py-1.5 rounded-lg',
            doc.warning.startsWith('✅')
              ? 'bg-teal-50 border border-teal-200 text-teal-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700',
          ].join(' ')}>
            {doc.warning}
          </div>
        )}
        {doc.status === 'error' && <p className="text-xs text-red-500 truncate">{doc.error}</p>}
      </div>
      <button
        type="button"
        onClick={() => onRemove(doc.id)}
        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors p-0.5"
        aria-label="Supprimer"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function UploadZone({ target, uploading, docs, onFiles, onRemove }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
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
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files, target); }}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200',
          dragging
            ? 'border-teal-400 bg-teal-50/60 scale-[1.01] shadow-sm shadow-teal-100'
            : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/30',
        ].join(' ')}
      >
        <div className={[
          'w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2 transition-colors',
          uploading || dragging ? 'bg-teal-gradient' : 'bg-gray-100',
        ].join(' ')}>
          {uploading
            ? <Loader2 size={16} className="text-white animate-spin" />
            : <Upload size={16} className={dragging ? 'text-white' : 'text-gray-400'} />
          }
        </div>
        <p className="text-sm font-semibold text-gray-700">
          {uploading ? 'Analyse IA en cours…' : 'Glisse ici ou clique'}
        </p>
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
    <div className={[
      'rounded-2xl border mb-2 transition-all duration-200 overflow-hidden',
      open
        ? (isD1 ? 'border-teal-200 shadow-sm' : 'border-purple-200 shadow-sm')
        : 'border-gray-100 bg-white',
    ].join(' ')}>
      <button
        type="button"
        onClick={() => setActiveAcc(open ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={[
            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono border transition-colors',
            open && isD1  ? 'bg-teal-gradient border-transparent text-white'   : '',
            open && !isD1 ? 'bg-purple-500 border-transparent text-white'      : '',
            !open && isD1  ? 'bg-teal-50 border-teal-200 text-teal-600'        : '',
            !open && !isD1 ? 'bg-purple-50 border-purple-200 text-purple-600'  : '',
          ].join(' ')}>
            D{num}
          </div>
          <span className="font-semibold text-sm text-gray-800">Déclarant {num}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-mono ${
            pct === 100
              ? (isD1 ? 'text-teal-500' : 'text-purple-500')
              : 'text-gray-400'
          }`}>
            {filled}/{allFields.length}
          </span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isD1 ? 'bg-teal-500' : 'bg-purple-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className={`px-4 pb-4 ${isD1 ? 'bg-teal-50/20' : 'bg-purple-50/10'}`} onClick={e => e.stopPropagation()}>
          <UploadZone target={uploadTarget} uploading={uploading} docs={docs} onFiles={onFiles} onRemove={onRemove} />
          {Object.keys(autoFKeys).length > 0 && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl mb-3 border ${
              isD1
                ? 'bg-teal-50 border-teal-200 text-teal-700'
                : 'bg-purple-50 border-purple-200 text-purple-700'
            }`}>
              <Sparkles size={12} />
              {Object.keys(autoFKeys).length} champ(s) pré-rempli(s) — vérifie les valeurs
            </div>
          )}
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-1">
            Revenus 2025
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {REV_FIELDS.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} />
            ))}
          </div>
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Épargne individuelle
          </p>
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

  // Sync local states when a profile is imported (AppContext updated externally)
  useEffect(() => { if (state.formData) setFormData(state.formData); }, [state.formData]);
  useEffect(() => { if (state.d1Data)   setD1Data(state.d1Data);     }, [state.d1Data]);
  useEffect(() => { if (state.d2Data)   setD2Data(state.d2Data);     }, [state.d2Data]);

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

  const anonymizedFiles = state.anonymizedFiles || [];
  const handleUseAnonymized = useCallback(() => {
    if (anonymizedFiles.filter(f => f.blob).length === 0) {
      toast.error('Les fichiers ne sont plus disponibles — uploader manuellement.');
      return;
    }

    if (!isCouple) {
      const files = anonymizedFiles
        .filter(f => f.blob)
        .map(f => new File([f.blob], f.name, { type: 'application/pdf' }));
      handleFiles(files, 'solo');
      return;
    }

    // Mode couple : router selon le target enregistré dans l'étape Anonymize
    const byTarget = { d1: [], d2: [] };
    for (const f of anonymizedFiles.filter(f => f.blob)) {
      const t = f.target === 'd2' ? 'd2' : 'd1'; // fallback → d1 si pas de target
      byTarget[t].push(new File([f.blob], f.name, { type: 'application/pdf' }));
    }
    if (byTarget.d1.length > 0) handleFiles(byTarget.d1, 'd1');
    if (byTarget.d2.length > 0) handleFiles(byTarget.d2, 'd2');
  }, [anonymizedFiles, handleFiles, isCouple]);

  const accProps    = { activeAcc, setActiveAcc };
  const uploadProps = { uploading, docs, onFiles: handleFiles, onRemove: removeDoc };

  const importFileRef = useRef(null);
  const handleImportProfile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string' && text.trim()) {
        const trimmed = text.trim();
        const pp = parseProfile(trimmed);

        // Reconstruit formData (champs partagés + solo)
        const str = v => (v && v !== 0) ? String(v) : '';
        const newFormData = {
          parts:      str(pp.parts),
          dept:       pp.departement || '',
          foncier:    str(pp.revensFonciers),
          divid:      str(pp.dividendes),
          crypto:     str(pp.revenusCrypto),
          pero_d1:    str(pp.peroD1),
          pero_d2:    str(pp.peroD2),
          // Solo : revenus et épargne dans formData
          ...(pp.mode === 'solo' ? {
            brut:         str(pp.salairesBrutImposableD1),
            net_imp:      str(pp.salaireNetImposableD1),
            taux_pas:     str(pp.tauxPasD1),
            pas_tot:      str(pp.pasD1),
            livret_a:     str(pp.livretAD1),
            ldd:          str(pp.lddsD1),
            lep:          str(pp.lepD1),
            livret_plus:  str(pp.livretPlusD1),
            pel:          str(pp.pelD1),
            pea:          str(pp.peaD1),
            per:          str(pp.percoD1),
            av:           str(pp.avD1),
            crypto_wallet:str(pp.cryptoD1),
          } : {}),
        };

        // Couple : revenus/épargne dans d1Data / d2Data séparés
        const newD1 = pp.mode === 'couple' ? {
          brut:         str(pp.salairesBrutImposableD1),
          net_imp:      str(pp.salaireNetImposableD1),
          taux_pas:     str(pp.tauxPasD1),
          pas_tot:      str(pp.pasD1),
          livret_a:     str(pp.livretAD1),
          ldd:          str(pp.lddsD1),
          lep:          str(pp.lepD1),
          livret_plus:  str(pp.livretPlusD1),
          pel:          str(pp.pelD1),
          pea:          str(pp.peaD1),
          per:          str(pp.percoD1),
          av:           str(pp.avD1),
          crypto_wallet:str(pp.cryptoD1),
        } : null;

        const newD2 = pp.mode === 'couple' ? {
          brut:         str(pp.salairesBrutImposableD2),
          net_imp:      str(pp.salaireNetImposableD2),
          taux_pas:     str(pp.tauxPasD2),
          pas_tot:      str(pp.pasD2),
          livret_a:     str(pp.livretAD2),
          ldd:          str(pp.lddsD2),
          lep:          str(pp.lepD2),
          livret_plus:  str(pp.livretPlusD2),
          pel:          str(pp.pelD2),
          pea:          str(pp.peaD2),
          per:          str(pp.percoD2),
          av:           str(pp.avD2),
          crypto_wallet:str(pp.cryptoD2),
        } : null;

        dispatch({ type: 'SET_MODE',      payload: pp.mode });
        dispatch({ type: 'SET_PROFILE',   payload: trimmed });
        dispatch({ type: 'SET_FORM_DATA', payload: newFormData });
        if (newD1) dispatch({ type: 'SET_D1_DATA', payload: newD1 });
        if (newD2) dispatch({ type: 'SET_D2_DATA', payload: newD2 });
        toast.success('Profil importé — vérifiez les données puis continuez.');
      } else {
        toast.error('Fichier vide ou invalide.');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <div className="flex gap-2 flex-wrap mb-2">
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape 2 / 4</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Collecte fiscale</h1>
        <p className="text-sm text-gray-500">
          Upload tes documents anonymisés → l'IA extrait les chiffres → tu vérifies et génères ton profil.
        </p>
        <div className="flex gap-2 flex-wrap mt-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-600 border border-teal-100">
            Fiscal 2025
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100">
            <Sparkles size={10} /> IA Auto-Fill
          </span>
          {isCouple && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100">
              <Users size={10} /> Mode couple
            </span>
          )}
        </div>
      </div>

      {/* Import profil existant */}
      <input ref={importFileRef} type="file" accept=".txt" className="hidden" onChange={handleImportProfile} />
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 px-4 py-3">
        <p className="text-xs text-gray-500">Vous avez déjà un profil .txt ?</p>
        <button
          type="button"
          onClick={() => importFileRef.current?.click()}
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 border border-teal-200 bg-white rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors shrink-0"
        >
          <FolderOpen size={13} /> Importer directement
        </button>
      </div>

      {/* Bannière fichiers anonymisés */}
      {anonymizedFiles.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-teal-800">
            <CheckCircle size={15} className="text-teal-500 shrink-0" />
            <span>
              <strong>{anonymizedFiles.length} fichier(s) anonymisé(s)</strong> depuis l'étape précédente.
              {isCouple && <span className="text-teal-600"> (sera chargé dans D1)</span>}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleUseAnonymized} disabled={uploading}>
            Utiliser →
          </Button>
        </div>
      )}

      {/* Mode couple info */}
      {isCouple && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-gray-700">
          <Users size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong className="text-amber-700">Marié(e) ou Pacsé(e) depuis 2024</strong> — déclaration commune obligatoire.
            Remplis les blocs D1 et D2 avec vos fiches de paie respectives.
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">Profil complété</span>
              <span className={`text-xs font-mono font-bold ${pct === 100 ? 'text-teal-600' : 'text-purple-500'}`}>
                {pct}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-purple-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-gray-800 font-mono">{totalF}</div>
            <div className="text-xs text-gray-400 font-mono">/{totalAll}</div>
          </div>
        </div>
      </div>

      {/* Upload zone — solo only */}
      {!isCouple && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Upload size={14} className="text-teal-500" /> Upload documents
          </h2>
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-gray-700">
            <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <span>
              <strong className="text-amber-700">Anonymise impérativement</strong> — masque nom, adresse, n° SS, IBAN.
              Garde les montants.
            </span>
          </div>
          <UploadZone target="solo" {...uploadProps} />
          {Object.keys(autoFilled).length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs bg-teal-50 border border-teal-200 text-teal-700 rounded-xl px-3 py-2">
              <Sparkles size={11} />
              {Object.keys(autoFilled).length} champ(s) pré-rempli(s) automatiquement par l'IA.
            </div>
          )}
        </div>
      )}

      {/* Form sections */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Compléter / vérifier</h2>

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
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-2 text-xs text-blue-700">
              <Upload size={12} className="shrink-0 mt-0.5" />
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
      </div>

      {/* Generate CTA */}
      <Button
        variant="primary"
        size="lg"
        className="w-full !rounded-2xl"
        onClick={handleGenerate}
      >
        <Sparkles size={16} /> Générer mon profil fiscal →
      </Button>

      <div className="flex justify-start -mt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/anonymize')}>
          <ArrowLeft size={14} /> Retour à l&apos;anonymisation
        </Button>
      </div>

    </div>
  );
}
