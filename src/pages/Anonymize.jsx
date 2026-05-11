import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate }   from 'react-router-dom';
import toast             from 'react-hot-toast';
import {
  Upload, Settings, ChevronDown, ShieldCheck,
  CheckCircle, AlertCircle, Eye, Download, X, Archive, FileText,
} from 'lucide-react';

import { useApp }         from '../context/AppContext';
import { anonymizePdf }   from '../lib/anonymizer';
import { buildPatterns }  from '../lib/patterns';
import Button             from '../components/Button';
import Card               from '../components/Card';
import PrivacyBadge       from '../components/PrivacyBadge';

const MAX_FILES = 10;

const GROUP_LABELS = {
  identite: 'Identité',
  employeur: 'Employeur',
  nss: 'N° Sécurité Sociale',
  admin: 'Administratif',
  adresse: 'Adresse',
  banque: 'Banque',
  salaire: 'Salaires',
};

// ─── Spinner inline ──────────────────────────────────────────────────────────
function Spinner({ size = 18 }) {
  return (
    <svg
      className="animate-spin shrink-0"
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Ligne de fichier ─────────────────────────────────────────────────────────
function FileRow({ item, onRemove }) {
  return (
    <Card className="flex items-center gap-3 py-3 px-4">
      {/* Icône statut */}
      <div className="shrink-0 w-8 h-8 flex items-center justify-center">
        {item.status === 'processing' && <Spinner />}
        {item.status === 'done' && (
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <CheckCircle size={18} className="text-teal-600" aria-hidden="true" />
          </div>
        )}
        {item.status === 'error' && (
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <AlertCircle size={18} className="text-red-500" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        {item.status === 'processing' && (
          <p className="text-xs text-teal-600 mt-0.5">Anonymisation en cours…</p>
        )}
        {item.status === 'done' && (
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="text-teal-600 font-medium">{item.zonesCount} zone(s)</span> noircies
            {item.suggestedFilename ? ` · ${item.suggestedFilename}` : ''}
          </p>
        )}
        {item.status === 'error' && (
          <p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1">
        {item.status === 'done' && item.objectUrl && (
          <>
            <a
              href={item.objectUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Aperçu"
              title="Aperçu dans un nouvel onglet"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
            >
              <Eye size={15} aria-hidden="true" />
            </a>
            <a
              href={item.objectUrl}
              download={item.suggestedFilename || 'anonymisé.pdf'}
              aria-label="Télécharger"
              title="Télécharger le PDF anonymisé"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
            >
              <Download size={15} aria-hidden="true" />
            </a>
          </>
        )}
        <button
          type="button"
          aria-label="Supprimer"
          title="Retirer ce fichier"
          onClick={() => onRemove(item.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Anonymize() {
  const navigate        = useNavigate();
  const { dispatch }    = useApp();

  // Personnalisation
  const [prenom,     setPrenom]     = useState('');
  const [nom,        setNom]        = useState('');
  const [employeur,  setEmployeur]  = useState('');

  // Accordéons
  const [isCustomOpen,   setIsCustomOpen]   = useState(false);
  const [isPatternsOpen, setIsPatternsOpen] = useState(false);

  // Patterns désactivés
  const [disabledLabels, setDisabledLabels] = useState(new Set());

  // Fichiers en cours / traités
  const [fileItems,  setFileItems]  = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isZipping,  setIsZipping]  = useState(false);

  const fileInputRef   = useRef(null);
  const dragCounterRef = useRef(0);
  const blobUrlsRef    = useRef([]);   // pour cleanup au unmount

  // ── Cleanup des URL objets au démontage ──────────────────────────
  useEffect(() => {
    return () => blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
  }, []);

  // ── Sync des fichiers anonymisés dans le state global ────────────
  useEffect(() => {
    const done = fileItems
      .filter(f => f.status === 'done')
      .map(f => ({ name: f.suggestedFilename, objectUrl: f.objectUrl, blob: f.blob }));
    dispatch({ type: 'SET_ANONYMIZED_FILES', payload: done });
  }, [fileItems, dispatch]);

  // ── Patterns calculés selon la personnalisation ──────────────────
  const allPatterns = useMemo(
    () => buildPatterns(prenom, nom, employeur),
    [prenom, nom, employeur]
  );

  // enabledLabels : null si tout actif (optimisation), sinon liste filtrée
  const enabledLabels = useMemo(() => {
    if (disabledLabels.size === 0) return null;
    return allPatterns
      .filter(p => !disabledLabels.has(p.label))
      .map(p => p.label);
  }, [allPatterns, disabledLabels]);

  // Groupes de patterns pour l'affichage
  const patternGroups = useMemo(() => {
    const groups = {};
    for (const p of allPatterns) {
      (groups[p.group] ??= []).push(p);
    }
    return groups;
  }, [allPatterns]);

  // ── Traitement des fichiers ──────────────────────────────────────
  const processFiles = useCallback(async (rawFiles) => {
    const remaining = MAX_FILES - fileItems.length;
    if (remaining <= 0) return;

    const validFiles = Array.from(rawFiles)
      .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      .slice(0, remaining);

    if (validFiles.length === 0) {
      toast.error('Seuls les fichiers PDF sont acceptés.');
      return;
    }
    if (Array.from(rawFiles).length > validFiles.length && validFiles.length === 0) {
      toast.error('Aucun PDF valide dans la sélection.');
      return;
    }

    // Créer les entrées "processing" immédiatement
    const newItems = validFiles.map(file => ({
      id:                crypto.randomUUID(),
      name:              file.name,
      file,
      status:            'processing',
      zonesCount:        0,
      suggestedFilename: '',
      blob:              null,
      objectUrl:         null,
      error:             null,
    }));

    setFileItems(prev => [...prev, ...newItems]);

    // Traitement en parallèle — les erreurs sont isolées par fichier
    await Promise.all(newItems.map(async (item) => {
      try {
        const result = await anonymizePdf(item.file, {
          prenom,
          nom,
          employeur,
          enabledLabels,
          logoEnabled: !disabledLabels.has('Logo employeur'),
          padding: 3,
        });

        const objectUrl = URL.createObjectURL(result.blob);
        blobUrlsRef.current.push(objectUrl);

        setFileItems(prev => prev.map(f =>
          f.id === item.id
            ? { ...f, status: 'done', zonesCount: result.zonesCount,
                suggestedFilename: result.suggestedFilename, blob: result.blob, objectUrl }
            : f
        ));

        toast.success(`Anonymisé · ${result.zonesCount} zone(s) noircies`, { duration: 3000 });

      } catch (err) {
        const msg = err?.message || 'Erreur inconnue';
        setFileItems(prev => prev.map(f =>
          f.id === item.id ? { ...f, status: 'error', error: msg } : f
        ));
        toast.error(`Échec : ${item.name}`);
      }
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileItems.length, prenom, nom, employeur, enabledLabels, disabledLabels]);

  // ── Drag & Drop ──────────────────────────────────────────────────
  function onDragEnter(e) {
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragging(true);
  }
  function onDragLeave(e) {
    e.preventDefault();
    if (--dragCounterRef.current === 0) setIsDragging(false);
  }
  function onDragOver(e) { e.preventDefault(); }
  function onDrop(e) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }
  function onFileInputChange(e) {
    processFiles(e.target.files);
    e.target.value = '';
  }

  // ── Retrait d'un fichier ─────────────────────────────────────────
  function removeFile(id) {
    setFileItems(prev => {
      const item = prev.find(f => f.id === id);
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
      return prev.filter(f => f.id !== id);
    });
  }

  // ── Téléchargement ZIP ───────────────────────────────────────────
  async function downloadAllAsZip() {
    const done = fileItems.filter(f => f.status === 'done');
    if (done.length < 2) return;
    setIsZipping(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const item of done) {
        zip.file(item.suggestedFilename || `anonymisé-${item.id.slice(0, 6)}.pdf`,
          await item.blob.arrayBuffer());
      }
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(zipBlob);
      Object.assign(document.createElement('a'), {
        href: url, download: 'bulletins-anonymisés.zip',
      }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`ZIP créé — ${done.length} fichiers`);
    } catch {
      toast.error('Erreur lors de la création du ZIP');
    } finally {
      setIsZipping(false);
    }
  }

  // ── Dérivations ──────────────────────────────────────────────────
  const doneCount       = fileItems.filter(f => f.status === 'done').length;
  const processingCount = fileItems.filter(f => f.status === 'processing').length;
  const maxReached      = fileItems.length >= MAX_FILES;
  const enabledCount    = allPatterns.filter(p => !disabledLabels.has(p.label)).length;

  return (
    <div className="flex flex-col gap-6">

      {/* En-tête */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Étape 1 / 4</p>
        <h1 className="text-2xl font-bold text-gray-900">Anonymisation des PDF</h1>
        <p className="text-sm text-gray-500">
          Noircissez les données sensibles avant de les envoyer à Claude.
          Cette étape est optionnelle si vous n'avez pas de PDF.
        </p>
      </div>

      <PrivacyBadge />

      {/* ── Personnalisation ────────────────────────────────────── */}
      <Card className="gap-0 p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsCustomOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <Settings size={15} className="text-teal-600" aria-hidden="true" />
            Personnalisation
            <span className="text-xs font-normal text-gray-400">(optionnel)</span>
          </span>
          <ChevronDown
            size={15}
            className={`text-gray-400 transition-transform duration-200 ${isCustomOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {isCustomOpen && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 mt-3 mb-4">
              Ajoute des patterns dynamiques pour votre nom, prénom et employeur.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Prénom',    val: prenom,    set: setPrenom,    ph: 'Guillaume' },
                { label: 'Nom',       val: nom,       set: setNom,       ph: 'Martin' },
                { label: 'Employeur', val: employeur, set: setEmployeur, ph: 'Schneider Electric' },
              ].map(({ label, val, set, ph }) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">{label}</label>
                  <input
                    type="text"
                    value={val}
                    placeholder={ph}
                    onChange={e => set(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50
                               focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
            {fileItems.length > 0 && (
              <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                ⚠️ Ces champs n'affectent pas les fichiers déjà traités. Re-déposez-les pour les retraiter.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── Patterns activés ────────────────────────────────────── */}
      <Card className="gap-0 p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsPatternsOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <ShieldCheck size={15} className="text-teal-600" aria-hidden="true" />
            Patterns activés
            <span className="text-xs font-normal text-gray-400">
              ({enabledCount}&thinsp;/&thinsp;{allPatterns.length} actifs)
            </span>
          </span>
          <ChevronDown
            size={15}
            className={`text-gray-400 transition-transform duration-200 ${isPatternsOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {isPatternsOpen && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              {Object.entries(patternGroups).map(([group, patterns]) => (
                <div key={group}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {GROUP_LABELS[group] ?? group}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {patterns.map(p => (
                      <label
                        key={p.label}
                        className="flex items-center gap-2 text-sm cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={!disabledLabels.has(p.label)}
                          onChange={() => setDisabledLabels(prev => {
                            const next = new Set(prev);
                            next.has(p.label) ? next.delete(p.label) : next.add(p.label);
                            return next;
                          })}
                          className="accent-teal-600 w-4 h-4 shrink-0"
                        />
                        <span className={`leading-tight transition-colors ${
                          disabledLabels.has(p.label)
                            ? 'text-gray-300 line-through'
                            : 'text-gray-700'
                        }`}>
                          {p.label}
                        </span>
                        {p.dyn && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 font-semibold leading-none">
                            dyn
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Zone drag & drop ────────────────────────────────────── */}
      {!maxReached ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Zone de dépôt de PDF"
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          className={[
            'relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3',
            'cursor-pointer transition-all duration-200 select-none outline-none',
            'focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
            isDragging
              ? 'border-teal-500 bg-teal-50 scale-[1.01] shadow-md'
              : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-gray-50',
          ].join(' ')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={onFileInputChange}
          />
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
            ${isDragging ? 'bg-teal-100' : 'bg-gray-100'}`}
          >
            <Upload size={24} className={isDragging ? 'text-teal-600' : 'text-gray-400'} aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className={`font-medium text-sm ${isDragging ? 'text-teal-700' : 'text-gray-700'}`}>
              {isDragging
                ? 'Déposez vos PDF ici'
                : 'Glissez vos PDF ici ou cliquez pour sélectionner'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Bulletins de paie, avis d'imposition · PDF uniquement
              {fileItems.length > 0 && ` · ${MAX_FILES - fileItems.length} emplacement(s) restant(s)`}
            </p>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-white">
          <p className="text-sm text-gray-400">
            Limite de {MAX_FILES} fichiers atteinte.{' '}
            <button
              type="button"
              onClick={() => setFileItems([])}
              className="text-teal-600 hover:underline font-medium"
            >
              Tout effacer
            </button>
          </p>
        </div>
      )}

      {/* ── Liste des fichiers ───────────────────────────────────── */}
      {fileItems.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              Fichiers
              {processingCount > 0 && (
                <span className="ml-2 text-xs font-normal text-teal-600">
                  <Spinner size={12} />
                </span>
              )}
              <span className="ml-1 font-normal text-gray-400">({fileItems.length})</span>
            </p>
            {doneCount >= 2 && (
              <Button variant="secondary" size="sm" onClick={downloadAllAsZip} loading={isZipping}>
                <Archive size={14} aria-hidden="true" />
                Tout télécharger en ZIP
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {fileItems.map(item => (
              <FileRow key={item.id} item={item} onRemove={removeFile} />
            ))}
          </div>
        </div>
      )}

      {/* ── Résumé ──────────────────────────────────────────────── */}
      {doneCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-teal-50 border border-teal-100 rounded-xl text-sm text-teal-700">
          <FileText size={15} aria-hidden="true" />
          <span>
            <strong>{doneCount} fichier(s)</strong> anonymisé(s) et prêt(s) à être utilisés à l'étape suivante.
          </span>
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={() => navigate('/setup')}>
          ← Retour
        </Button>
        <Button onClick={() => navigate('/collect')}>
          {doneCount > 0
            ? `Continuer avec ${doneCount} fichier(s) →`
            : 'Passer cette étape →'}
        </Button>
      </div>

    </div>
  );
}
