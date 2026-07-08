import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate }   from 'react-router-dom';
import toast             from 'react-hot-toast';
import {
  Upload, Settings, ChevronDown, ShieldCheck,
  CheckCircle, AlertCircle, Eye, Download, X, Archive,
  FileText, ArrowLeft, User, Users,
} from 'lucide-react';

import { useApp }         from '../context/AppContext';
import { anonymizePdf }   from '../lib/anonymizer';
import { buildPatterns }  from '../lib/patterns';
import { DOCUMENTS }      from '../data/documentTypes/index.js';
import Button             from '../components/Button';
import OnboardingWizard   from '../components/OnboardingWizard';
import DocumentChecklist  from '../components/DocumentChecklist';
import CoherenceAlerts    from '../components/CoherenceAlerts';
import { checkCoherence } from '../lib/coherenceCheck';

const MAX_FILES_SOLO   = 15;
const MAX_FILES_TARGET = 15;  // par déclarant en mode couple

const GROUP_LABELS = {
  identite: 'Identité', employeur: 'Employeur', nss: 'N° Sécurité Sociale',
  admin: 'Administratif', adresse: 'Adresse', banque: 'Banque', salaire: 'Salaires',
};

function Spinner({ size = 16 }) {
  return (
    <svg className="animate-spin shrink-0" style={{ width: size, height: size }}
      viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── File row ─────────────────────────────────────────────────────────────────
function FileRow({ item, onRemove, onChangeType }) {
  const extractedCount = item.extracted ? Object.keys(item.extracted).length : 0;
  return (
    <div className={[
      'group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200',
      item.status === 'done'       && 'border-teal-100 bg-teal-50/50',
      item.status === 'error'      && 'border-red-100 bg-red-50/50',
      item.status === 'processing' && 'border-gray-100 bg-white',
    ].filter(Boolean).join(' ')}>

      <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center">
        {item.status === 'processing' && (
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-500">
            <Spinner size={16} />
          </div>
        )}
        {item.status === 'done' && (
          <div className="w-9 h-9 rounded-xl bg-teal-gradient flex items-center justify-center text-white shadow-sm">
            <CheckCircle size={16} />
          </div>
        )}
        {item.status === 'error' && (
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-500">
            <AlertCircle size={16} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        {item.status === 'processing' && (
          <p className="text-xs text-teal-600 mt-0.5 flex items-center gap-1">
            <Spinner size={10} /> Anonymisation en cours…
          </p>
        )}
        {item.status === 'done' && (
          <>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="text-teal-600 font-medium">{item.zonesCount} zone(s)</span> noircies
              {extractedCount > 0 && (
                <span className="text-teal-600"> · {extractedCount} champ(s) lu(s) localement</span>
              )}
            </p>
            {/* Couche 2 — type détecté + correction en 1 clic */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <FileText size={11} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 shrink-0">Type&nbsp;:</span>
              <select
                value={item.typeId || ''}
                onClick={e => e.stopPropagation()}
                onChange={e => onChangeType?.(item.id, e.target.value)}
                className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1
                  text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300/50 max-w-[14rem] truncate"
              >
                <option value="">Document non reconnu</option>
                {DOCUMENTS.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              {!item.typeId && (
                <span className="text-2xs text-amber-600">à préciser</span>
              )}
            </div>
          </>
        )}
        {item.status === 'error' && (
          <p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.status === 'done' && item.objectUrl && (
          <>
            <a href={item.objectUrl} target="_blank" rel="noreferrer" title="Aperçu"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-teal-600 hover:bg-white transition-colors">
              <Eye size={14} />
            </a>
            <a href={item.objectUrl} download={item.suggestedFilename || 'anonymisé.pdf'} title="Télécharger"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-teal-600 hover:bg-white transition-colors">
              <Download size={14} />
            </a>
          </>
        )}
        <button type="button" title="Retirer" onClick={() => onRemove(item.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-white transition-colors">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Accordion section ────────────────────────────────────────────────────────
function Accordion({ icon: Icon, title, badge, open, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/80 transition-colors">
        <span className="flex items-center gap-2.5 text-sm font-medium text-gray-800">
          <Icon size={15} className="text-teal-600" />
          {title}
          {badge && <span className="text-xs font-normal text-gray-400">{badge}</span>}
        </span>
        <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Drop zone card (pour mode couple) ───────────────────────────────────────
function DropZoneCard({ target, items, maxReached, onFiles, onRemove, onChangeType }) {
  const fileInputRef   = useRef(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const isD1    = target === 'd1';
  const label   = isD1 ? 'Déclarant 1' : 'Déclarant 2';
  const myItems = items.filter(f => f.target === target);

  function onDragEnter(e) { e.preventDefault(); if (++dragCounterRef.current === 1) setIsDragging(true); }
  function onDragLeave(e) { e.preventDefault(); if (--dragCounterRef.current === 0) setIsDragging(false); }
  function onDragOver(e)  { e.preventDefault(); }
  function onDrop(e)      { e.preventDefault(); dragCounterRef.current = 0; setIsDragging(false); onFiles(e.dataTransfer.files, target); }

  return (
    <div className={[
      'flex-1 rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all duration-200',
      isD1 ? 'border-teal-100 bg-teal-50/20' : 'border-purple-100 bg-purple-50/10',
    ].join(' ')}>

      {/* En-tête du bloc */}
      <div className="flex items-center gap-2.5">
        <div className={[
          'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono border',
          isD1
            ? 'bg-teal-gradient border-transparent text-white'
            : 'bg-purple-500 border-transparent text-white',
        ].join(' ')}>
          {isD1 ? <User size={14} /> : <User size={14} />}
        </div>
        <span className="font-semibold text-sm text-gray-800">{label}</span>
        {myItems.length > 0 && (
          <span className={`ml-auto text-xs font-mono ${isD1 ? 'text-teal-500' : 'text-purple-500'}`}>
            {myItems.filter(f => f.status === 'done').length}/{myItems.length}
          </span>
        )}
      </div>

      {/* Zone de drop */}
      {!maxReached ? (
        <div
          role="button" tabIndex={0}
          aria-label={`Zone de dépôt pour ${label}`}
          onDragEnter={onDragEnter} onDragLeave={onDragLeave}
          onDragOver={onDragOver}   onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          className={[
            'border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-3',
            'cursor-pointer transition-all duration-200 select-none outline-none',
            'focus-visible:ring-2 focus-visible:ring-offset-2',
            isDragging
              ? (isD1
                  ? 'border-teal-400 bg-teal-50 scale-[1.01] shadow-sm shadow-teal-100 focus-visible:ring-teal-500'
                  : 'border-purple-400 bg-purple-50 scale-[1.01] shadow-sm shadow-purple-100 focus-visible:ring-purple-500')
              : (isD1
                  ? 'border-teal-200 bg-white hover:border-teal-300 hover:bg-teal-50/30'
                  : 'border-purple-200 bg-white hover:border-purple-300 hover:bg-purple-50/20'),
          ].join(' ')}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
            multiple className="hidden" onChange={e => { onFiles(e.target.files, target); e.target.value = ''; }} />

          <div className={[
            'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
            isDragging
              ? (isD1 ? 'bg-teal-gradient text-white' : 'bg-purple-500 text-white')
              : (isD1 ? 'bg-teal-100 text-teal-400'   : 'bg-purple-100 text-purple-400'),
          ].join(' ')}>
            <Upload size={18} className={isDragging ? 'animate-bounce' : ''} />
          </div>

          <div className="text-center">
            <p className={`font-semibold text-xs transition-colors ${
              isDragging
                ? (isD1 ? 'text-teal-700' : 'text-purple-700')
                : 'text-gray-600'
            }`}>
              {isDragging ? 'Déposez ici ✓' : 'Glisser ou cliquer'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              PDF · {MAX_FILES_TARGET - myItems.length} restant(s)
            </p>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center bg-white">
          <p className="text-xs text-gray-400">Limite atteinte</p>
        </div>
      )}

      {/* Liste fichiers du bloc */}
      {myItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {myItems.map(item => <FileRow key={item.id} item={item} onRemove={onRemove} onChangeType={onChangeType} />)}
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Anonymize() {
  const navigate          = useNavigate();
  const { state, dispatch } = useApp();
  const isCouple          = state.mode === 'couple';

  // ── Étape 0 — situation (gate) ──────────────────────────────────────────────
  // Le questionnaire de situation (OnboardingWizard) s'exécute ICI, avant le dépôt,
  // pour pouvoir personnaliser la checklist et détecter un document manquant.
  const collectProfile = state.collectProfile || {};
  const expertMode     = collectProfile.expertMode || false;
  const onboardingDone = collectProfile.onboardingDone || false;
  const hasExistingData = Object.keys(state.formData || {}).length > 0 || !!state.profile;
  const showWizard = !onboardingDone && !expertMode && !hasExistingData;

  function handleWizardComplete(collected, mode, preFilledForm = {}) {
    dispatch({ type: 'SET_COLLECT_PROFILE', payload: collected });
    dispatch({ type: 'SET_MODE',            payload: mode });
    dispatch({ type: 'SET_FORM_DATA',       payload: { ...(state.formData || {}), ...preFilledForm } });
  }
  function handleWizardSkip() {
    dispatch({ type: 'SET_COLLECT_PROFILE', payload: { ...collectProfile, expertMode: true, onboardingDone: true } });
  }

  // Cohérence : activer un module manquant signalé par une alerte « non déclaré ».
  function handleEnableModule(flag) {
    dispatch({
      type: 'SET_COLLECT_PROFILE',
      payload: { ...collectProfile, modules: { ...(collectProfile.modules || {}), [flag]: true } },
    });
  }

  const [prenom,    setPrenom]    = useState('');
  const [nom,       setNom]       = useState('');
  const [employeur, setEmployeur] = useState('');

  const [isCustomOpen,   setIsCustomOpen]   = useState(false);
  const [isPatternsOpen, setIsPatternsOpen] = useState(false);
  const [disabledLabels, setDisabledLabels] = useState(() => {
    // Les patterns "salaires" masquent les montants utiles pour la collecte — désactivés par défaut
    const initial = buildPatterns('', '', '');
    return new Set(initial.filter(p => p.group === 'salaire').map(p => p.label));
  });
  const [fileItems,      setFileItems]      = useState([]);
  const [isDragging,     setIsDragging]     = useState(false);
  const [isZipping,      setIsZipping]      = useState(false);

  const fileInputRef   = useRef(null);
  const dragCounterRef = useRef(0);
  const blobUrlsRef    = useRef([]);

  useEffect(() => () => blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    const done = fileItems.filter(f => f.status === 'done');
    dispatch({
      type: 'SET_ANONYMIZED_FILES',
      payload: done.map(f => ({
        name: f.suggestedFilename, objectUrl: f.objectUrl, blob: f.blob,
        pageImages: f.pageImages, target: f.target, typeId: f.typeId,
      })),
    });
    // Couche 3 — extraction locale transmise à la collecte (pré-remplissage)
    dispatch({
      type: 'SET_EXTRACTED_DOCS',
      payload: done
        .filter(f => f.extracted && Object.keys(f.extracted).length > 0)
        .map(f => ({ target: f.target, typeId: f.typeId, extracted: f.extracted, name: f.suggestedFilename })),
    });
  }, [fileItems, dispatch]);

  const allPatterns  = useMemo(() => buildPatterns(prenom, nom, employeur), [prenom, nom, employeur]);
  const enabledLabels = useMemo(() => {
    if (disabledLabels.size === 0) return null;
    return allPatterns.filter(p => !disabledLabels.has(p.label)).map(p => p.label);
  }, [allPatterns, disabledLabels]);
  const patternGroups = useMemo(() => {
    const g = {};
    for (const p of allPatterns) (g[p.group] ??= []).push(p);
    return g;
  }, [allPatterns]);

  const processFiles = useCallback(async (rawFiles, target = 'solo') => {
    const maxForTarget = isCouple ? MAX_FILES_TARGET : MAX_FILES_SOLO;
    const countForTarget = fileItems.filter(f => f.target === target).length;
    const remaining = maxForTarget - countForTarget;
    if (remaining <= 0) return;

    const validFiles = Array.from(rawFiles)
      .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      .slice(0, remaining);
    if (validFiles.length === 0) { toast.error('Seuls les PDF sont acceptés.'); return; }

    const newItems = validFiles.map(file => ({
      id: crypto.randomUUID(), name: file.name, file, target,
      status: 'processing', zonesCount: 0, suggestedFilename: '', blob: null, objectUrl: null, error: null,
      pageImages: null, typeId: null, typeLabel: null, extracted: null,
    }));
    setFileItems(prev => [...prev, ...newItems]);

    await Promise.all(newItems.map(async item => {
      try {
        const result = await anonymizePdf(item.file, {
          prenom, nom, employeur, enabledLabels,
          logoEnabled: !disabledLabels.has('Logo employeur'), padding: 3,
        });
        const objectUrl = URL.createObjectURL(result.blob);
        blobUrlsRef.current.push(objectUrl);
        setFileItems(prev => prev.map(f =>
          f.id === item.id
            ? { ...f, status: 'done', zonesCount: result.zonesCount,
                suggestedFilename: result.suggestedFilename, blob: result.blob, objectUrl,
                pageImages: result.pageImages,
                typeId: result.typeId, typeLabel: result.typeLabel, extracted: result.extracted }
            : f
        ));
        toast.success(`Anonymisé · ${result.zonesCount} zone(s)`, { duration: 3000 });
      } catch (err) {
        setFileItems(prev => prev.map(f =>
          f.id === item.id ? { ...f, status: 'error', error: err?.message || 'Erreur' } : f
        ));
        if (err?.code === 'NO_TEXT_LAYER') toast.error(err.message, { duration: 9000 });
        else toast.error(`Échec : ${item.name}`);
      }
    }));
  }, [fileItems, prenom, nom, employeur, enabledLabels, disabledLabels, isCouple]);

  // Correction manuelle du type → ré-anonymise avec le bon profil + ré-extrait (local).
  const changeType = useCallback(async (id, newTypeId) => {
    const item = fileItems.find(f => f.id === id);
    if (!item?.file) return;
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    setFileItems(prev => prev.map(f => f.id === id ? { ...f, status: 'processing' } : f));
    try {
      const result = await anonymizePdf(item.file, {
        prenom, nom, employeur, enabledLabels,
        forcedTypeId: newTypeId || null,
        logoEnabled: !disabledLabels.has('Logo employeur'), padding: 3,
      });
      const objectUrl = URL.createObjectURL(result.blob);
      blobUrlsRef.current.push(objectUrl);
      setFileItems(prev => prev.map(f =>
        f.id === id
          ? { ...f, status: 'done', zonesCount: result.zonesCount,
              suggestedFilename: result.suggestedFilename, blob: result.blob, objectUrl,
              pageImages: result.pageImages,
              typeId: result.typeId, typeLabel: result.typeLabel, extracted: result.extracted }
          : f
      ));
    } catch (err) {
      setFileItems(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'error', error: err?.message || 'Erreur' } : f
      ));
      if (err?.code === 'NO_TEXT_LAYER') toast.error(err.message, { duration: 9000 });
      else toast.error('Échec du changement de type');
    }
  }, [fileItems, prenom, nom, employeur, enabledLabels, disabledLabels]);

  // Handlers zone solo
  function onDragEnter(e) { e.preventDefault(); if (++dragCounterRef.current === 1) setIsDragging(true); }
  function onDragLeave(e) { e.preventDefault(); if (--dragCounterRef.current === 0) setIsDragging(false); }
  function onDragOver(e)  { e.preventDefault(); }
  function onDrop(e)      { e.preventDefault(); dragCounterRef.current = 0; setIsDragging(false); processFiles(e.dataTransfer.files, 'solo'); }
  function onFileInputChange(e) { processFiles(e.target.files, 'solo'); e.target.value = ''; }

  function removeFile(id) {
    setFileItems(prev => {
      const item = prev.find(f => f.id === id);
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
      return prev.filter(f => f.id !== id);
    });
  }

  async function downloadAllAsZip() {
    const done = fileItems.filter(f => f.status === 'done');
    if (done.length < 2) return;
    setIsZipping(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const item of done)
        zip.file(item.suggestedFilename || `anonymisé-${item.id.slice(0, 6)}.pdf`, await item.blob.arrayBuffer());
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(zipBlob);
      Object.assign(document.createElement('a'), { href: url, download: 'bulletins-anonymisés.zip' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`ZIP — ${done.length} fichiers`);
    } catch { toast.error('Erreur ZIP'); }
    finally  { setIsZipping(false); }
  }

  const doneCount       = fileItems.filter(f => f.status === 'done').length;
  const processingCount = fileItems.filter(f => f.status === 'processing').length;
  const maxReached      = fileItems.length >= MAX_FILES_SOLO;
  const enabledCount    = allPatterns.filter(p => !disabledLabels.has(p.label)).length;

  // Limites par cible en mode couple
  const d1MaxReached = fileItems.filter(f => f.target === 'd1').length >= MAX_FILES_TARGET;
  const d2MaxReached = fileItems.filter(f => f.target === 'd2').length >= MAX_FILES_TARGET;
  const detectedIds  = fileItems.filter(f => f.status === 'done' && f.typeId).map(f => f.typeId);
  // Contrôle de cohérence déclaré ↔ détecté (affiché dès qu'au moins un doc est traité).
  const coherenceAlerts = doneCount > 0
    ? checkCoherence(collectProfile.modules || {}, detectedIds)
    : [];

  // ── Gate étape 0 : la situation se renseigne AVANT le dépôt ─────────────────
  if (showWizard) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape préalable</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Votre situation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quelques questions pour personnaliser les documents à préparer et la collecte.
          </p>
        </div>
        <OnboardingWizard
          initialMode={state.mode}
          onComplete={handleWizardComplete}
          onSkip={handleWizardSkip}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape 1 / 5</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Anonymisation des PDF</h1>
        <p className="text-sm text-gray-500 mt-1">
          Détection du type, extraction et masquage <strong>100 % en local</strong> — aucune donnée ne quitte votre navigateur. Étape optionnelle.
        </p>
        {isCouple && (
          <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 w-fit">
            <Users size={13} /> Mode couple — déposez séparément les documents de chaque déclarant
          </div>
        )}
      </div>

      {/* Checklist de documents personnalisée (filtrée par l'étape 0) */}
      <DocumentChecklist modules={collectProfile.modules || {}} detectedIds={detectedIds} />

      {/* Personnalisation */}
      <Accordion icon={Settings} title="Personnalisation" badge="(optionnel)"
        open={isCustomOpen} onToggle={() => setIsCustomOpen(v => !v)}>
        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-xs text-gray-400">Patterns dynamiques pour votre nom, prénom et employeur.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Prénom', val: prenom, set: setPrenom, ph: 'Guillaume' },
              { label: 'Nom',    val: nom,    set: setNom,    ph: 'Martin'    },
              { label: 'Employeur', val: employeur, set: setEmployeur, ph: 'Schneider Electric' },
            ].map(({ label, val, set, ph }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">{label}</label>
                <input type="text" value={val} placeholder={ph} onChange={e => set(e.target.value)}
                  className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50
                    focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-300 transition-all" />
              </div>
            ))}
          </div>
          {fileItems.length > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
              ⚠️ N'affecte pas les fichiers déjà traités.
            </p>
          )}
        </div>
      </Accordion>

      {/* Patterns */}
      <Accordion icon={ShieldCheck} title="Patterns activés"
        badge={`(${enabledCount}/${allPatterns.length} actifs)`}
        open={isPatternsOpen} onToggle={() => setIsPatternsOpen(v => !v)}>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {Object.entries(patternGroups).map(([group, patterns]) => (
            <div key={group}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                {GROUP_LABELS[group] ?? group}
              </p>
              <div className="flex flex-col gap-1.5">
                {patterns.map(p => (
                  <label key={p.label} className="flex items-center gap-2 text-sm cursor-pointer select-none group">
                    <input type="checkbox" checked={!disabledLabels.has(p.label)}
                      onChange={() => setDisabledLabels(prev => {
                        const next = new Set(prev);
                        next.has(p.label) ? next.delete(p.label) : next.add(p.label);
                        return next;
                      })}
                      className="accent-teal-600 w-3.5 h-3.5 shrink-0 rounded" />
                    <span className={`leading-tight transition-colors ${
                      disabledLabels.has(p.label) ? 'text-gray-300 line-through' : 'text-gray-700'
                    }`}>{p.label}</span>
                    {p.dyn && (
                      <span className="text-2xs px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600 font-bold tracking-wide">
                        DYN
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      {/* ── Zones de drop ─────────────────────────────────────────────── */}
      {isCouple ? (
        /* Mode couple : 2 blocs côte à côte */
        <div className="flex flex-col sm:flex-row gap-3">
          <DropZoneCard
            target="d1"
            items={fileItems}
            maxReached={d1MaxReached}
            onFiles={processFiles}
            onRemove={removeFile}
            onChangeType={changeType}
          />
          <DropZoneCard
            target="d2"
            items={fileItems}
            maxReached={d2MaxReached}
            onFiles={processFiles}
            onRemove={removeFile}
            onChangeType={changeType}
          />
        </div>
      ) : (
        /* Mode solo : zone unique */
        !maxReached ? (
          <div
            role="button" tabIndex={0}
            aria-label="Zone de dépôt de PDF"
            onDragEnter={onDragEnter} onDragLeave={onDragLeave}
            onDragOver={onDragOver}   onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            className={[
              'relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4',
              'cursor-pointer transition-all duration-300 select-none outline-none',
              'focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
              isDragging
                ? 'border-teal-500 bg-teal-50 scale-[1.01] shadow-lg shadow-teal-100'
                : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-gray-50/80',
            ].join(' ')}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
              multiple className="hidden" onChange={onFileInputChange} />

            <div className={[
              'w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300',
              isDragging
                ? 'bg-teal-gradient text-white shadow-md scale-110'
                : 'bg-gray-100 text-gray-400',
            ].join(' ')}>
              <Upload size={24} className={isDragging ? 'animate-bounce' : ''} />
            </div>

            <div className="text-center">
              <p className={`font-semibold text-sm transition-colors ${isDragging ? 'text-teal-700' : 'text-gray-700'}`}>
                {isDragging ? 'Déposez vos PDF ici ✓' : 'Glissez-déposez vos PDF ou cliquez'}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                Bulletins de paie, avis d&apos;imposition · PDF uniquement
                {fileItems.length > 0 && ` · ${MAX_FILES_SOLO - fileItems.length} restant(s)`}
              </p>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center bg-white">
            <p className="text-sm text-gray-400">
              Limite de {MAX_FILES_SOLO} fichiers.{' '}
              <button type="button" onClick={() => setFileItems([])}
                className="text-teal-600 hover:underline font-medium">Tout effacer</button>
            </p>
          </div>
        )
      )}

      {/* ── Liste des fichiers solo (hors mode couple) ─────────────── */}
      {!isCouple && fileItems.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              Fichiers
              {processingCount > 0 && <Spinner size={13} />}
              <span className="font-normal text-gray-400">({fileItems.length})</span>
            </p>
            {doneCount >= 2 && (
              <Button variant="secondary" size="sm" onClick={downloadAllAsZip} loading={isZipping}>
                <Archive size={13} /> ZIP
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {fileItems.map(item => <FileRow key={item.id} item={item} onRemove={removeFile} onChangeType={changeType} />)}
          </div>
        </div>
      )}

      {/* Bouton ZIP pour le mode couple */}
      {isCouple && doneCount >= 2 && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={downloadAllAsZip} loading={isZipping}>
            <Archive size={13} /> Télécharger ZIP ({doneCount} fichiers)
          </Button>
        </div>
      )}

      {/* Résumé */}
      {doneCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-teal-50 border border-teal-100 rounded-xl text-sm text-teal-700">
          <div className="w-7 h-7 rounded-lg bg-teal-gradient flex items-center justify-center text-white shrink-0">
            <FileText size={13} />
          </div>
          <span>
            <strong>{doneCount} fichier(s)</strong> anonymisé(s) et prêts pour l&apos;étape suivante.
            {isCouple && (
              <span className="text-teal-600">
                {' '}(D1 : {fileItems.filter(f => f.target === 'd1' && f.status === 'done').length},
                D2 : {fileItems.filter(f => f.target === 'd2' && f.status === 'done').length})
              </span>
            )}
          </span>
        </div>
      )}

      {/* Cohérence déclaré ↔ détecté (filet anti-oubli, non bloquant) */}
      <CoherenceAlerts alerts={coherenceAlerts} onEnableModule={handleEnableModule} />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/setup')}>
          <ArrowLeft size={14} /> Retour
        </Button>
        <Button onClick={() => navigate('/collect')} size="md">
          {doneCount > 0 ? `Continuer avec ${doneCount} fichier(s) →` : 'Passer cette étape →'}
        </Button>
      </div>

    </div>
  );
}
