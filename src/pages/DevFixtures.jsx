/**
 * DevFixtures — page de chargement de profils de test
 * Accessible uniquement en mode dev (import.meta.env.DEV === true).
 * Route : /dev/fixtures
 *
 * Fonctionnalités :
 *  - Auto-découverte des fixtures via import.meta.glob
 *  - Chargement d'un profil de test en un clic (sauvegarde auto du profil réel)
 *  - Modale d'inspection (raw + parsedProfile côte à côte)
 *  - Restauration du profil utilisateur
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Upload, Eye, X, RotateCcw, ChevronRight, FileText } from 'lucide-react';
import { parseProfile } from '../lib/profileParser';
import { useApp } from '../context/AppContext';

// ── Auto-découverte des fichiers fixture ────────────────────────────────────
const FIXTURE_FILES = import.meta.glob(
  '/src/lib/__tests__/fixtures/*.txt',
  { query: '?raw', import: 'default', eager: true },
);

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extrait le nom court du chemin complet */
function fileName(path) {
  return path.split('/').pop();
}

/** Extrait la première ligne non vide (titre du profil) */
function firstLine(raw) {
  return (raw || '').split('\n').find(l => l.trim()) || '—';
}

/** Extrait le mode déclaration (solo/couple) depuis le texte brut */
function extractMode(raw) {
  const m = raw.match(/Mode\s*:\s*(.+)/i);
  return m ? m[1].trim() : null;
}

// ── Composants ───────────────────────────────────────────────────────────────

function FixtureCard({ path, raw, isActive, onLoad, onInspect }) {
  const name = fileName(path);
  const title = firstLine(raw);
  const mode = extractMode(raw);
  const lineCount = raw.split('\n').length;

  return (
    <div
      className={[
        'rounded-xl border p-4 flex flex-col gap-3 transition-all duration-200',
        isActive
          ? 'border-red-500/60 bg-red-500/[0.06] ring-1 ring-red-500/30'
          : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]',
      ].join(' ')}
    >
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <div className={[
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          isActive ? 'bg-red-500/20 text-red-400' : 'bg-white/[0.06] text-ink-300',
        ].join(' ')}>
          <FileText size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-kapio-300 truncate">{name}</p>
          <p className="text-sm text-ink-0 font-medium mt-0.5 leading-snug">{title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {mode && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-200">
                {mode}
              </span>
            )}
            <span className="text-xs text-ink-400">{lineCount} lignes</span>
            {isActive && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                ● Actif
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={() => onLoad(path, raw)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-kapio-600 hover:bg-kapio-500 text-white transition-colors"
        >
          <Upload size={13} aria-hidden="true" />
          Charger
        </button>
        <button
          type="button"
          onClick={() => onInspect(path)}
          className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-white/[0.10] text-ink-200 hover:text-ink-0 hover:bg-white/[0.06] transition-colors"
        >
          <Eye size={13} aria-hidden="true" />
          Inspect
        </button>
      </div>
    </div>
  );
}

function InspectModal({ path, raw, onClose }) {
  const parsed = useMemo(() => {
    try { return parseProfile(raw); } catch { return { error: 'Erreur de parsing' }; }
  }, [raw]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Inspection de ${fileName(path)}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-6xl bg-ink-900 border border-white/[0.10] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header modale */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <FlaskConical size={16} className="text-kapio-300" aria-hidden="true" />
            <span className="font-mono text-sm text-ink-0">{fileName(path)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-300 hover:text-ink-0 hover:bg-white/[0.06] transition-colors"
            aria-label="Fermer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Colonnes raw / parsed */}
        <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-white/[0.06]">
          {/* Texte brut */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-4 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider border-b border-white/[0.04] bg-white/[0.01]">
              Profil brut
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-ink-200 leading-relaxed whitespace-pre-wrap break-words">
              {raw}
            </pre>
          </div>

          {/* parsedProfile */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-4 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider border-b border-white/[0.04] bg-white/[0.01]">
              parsedProfile
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-kapio-200 leading-relaxed whitespace-pre-wrap break-words">
              {JSON.stringify(parsed, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function DevFixtures() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [inspectPath, setInspectPath] = useState(null);

  // Failsafe si le composant est accidentellement rendu en prod
  if (!import.meta.env.DEV) {
    return null;
  }

  const entries = Object.entries(FIXTURE_FILES).sort(([a], [b]) => a.localeCompare(b));

  const handleLoad = (path, raw) => {
    dispatch({ type: 'LOAD_FIXTURE', payload: raw });
    navigate('/profile');
  };

  const handleRestore = () => {
    dispatch({ type: 'RESTORE_USER_PROFILE' });
    navigate('/');
  };

  const activeFixtureName = state.isFixture
    ? entries.find(([, raw]) => raw === state.profile)?.[0] ?? null
    : null;

  const inspectEntry = inspectPath ? FIXTURE_FILES[inspectPath] : null;

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Hero */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-kapio-900/40 border border-kapio-500/20 flex items-center justify-center shrink-0">
            <FlaskConical size={22} className="text-kapio-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-0 tracking-tight">
              Fixtures de test
            </h1>
            <p className="text-sm text-ink-300 mt-1">
              Charge un profil de test pour valider les calculs PER, rapports et opportunités — sans toucher à ton profil réel.
            </p>
            <p className="text-xs font-mono text-amber-400/80 mt-1.5">
              ⚠️ Page disponible uniquement en <code className="bg-amber-400/10 px-1 rounded">npm run dev</code>
            </p>
          </div>
        </div>

        {/* Statut backup */}
        {state.isFixture && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-300">Profil de test actif</p>
                <p className="text-xs text-ink-300 mt-0.5">
                  {state.userProfileBackup
                    ? 'Ton profil réel est sauvegardé — tu peux le restaurer à tout moment.'
                    : 'Aucun profil réel à restaurer (session vide avant chargement).'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRestore}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-ink-800 border border-white/[0.10] text-ink-0 hover:bg-ink-700 transition-colors shrink-0"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Restaurer
            </button>
          </div>
        )}

        {/* Liste des fixtures */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-0">
              {entries.length} fixture{entries.length > 1 ? 's' : ''} disponible{entries.length > 1 ? 's' : ''}
            </h2>
            <span className="text-xs text-ink-400 font-mono">src/lib/__tests__/fixtures/*.txt</span>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.12] p-10 text-center text-ink-400 text-sm">
              Aucun fichier <code className="font-mono">.txt</code> trouvé dans le dossier fixtures.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {entries.map(([path, raw]) => (
                <FixtureCard
                  key={path}
                  path={path}
                  raw={raw}
                  isActive={path === activeFixtureName}
                  onLoad={handleLoad}
                  onInspect={setInspectPath}
                />
              ))}
            </div>
          )}
        </section>

        {/* Infos backup */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-4 space-y-2">
          <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Mécanique de sauvegarde</h3>
          <ul className="text-xs text-ink-400 space-y-1">
            <li className="flex items-start gap-2">
              <ChevronRight size={12} className="mt-0.5 shrink-0 text-kapio-400" />
              Avant tout chargement, le profil courant est sauvegardé dans l'état Redux (<code className="font-mono text-ink-200">userProfileBackup</code>).
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={12} className="mt-0.5 shrink-0 text-kapio-400" />
              La sauvegarde n'est écrasée qu'une seule fois par session — charger plusieurs fixtures de suite ne perd pas le backup initial.
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight size={12} className="mt-0.5 shrink-0 text-kapio-400" />
              "Restaurer" recharge le backup et remet <code className="font-mono text-ink-200">isFixture = false</code>.
            </li>
          </ul>
        </section>

      </div>

      {/* Modale d'inspection */}
      {inspectPath && inspectEntry && (
        <InspectModal
          path={inspectPath}
          raw={inspectEntry}
          onClose={() => setInspectPath(null)}
        />
      )}
    </>
  );
}
