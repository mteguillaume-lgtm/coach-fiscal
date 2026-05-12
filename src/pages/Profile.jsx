import { useEffect, useState, useMemo } from 'react';
import { useNavigate }         from 'react-router-dom';
import toast                   from 'react-hot-toast';
import { Copy, Download, MessageCircle, ArrowLeft, Check, FileText, Sparkles, ClipboardList, TrendingUp, BookOpen } from 'lucide-react';

import { useApp }              from '../context/AppContext';
import { detectOpportunities } from '../lib/opportunitiesDetector';
import OpportunitiesPanel      from '../components/OpportunitiesPanel';
import Button                  from '../components/Button';

export default function Profile() {
  const { state }  = useApp();
  const navigate   = useNavigate();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!state.profile) {
      toast.error('Génère ton profil fiscal d\'abord.');
      navigate('/collect', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state.profile) return null;

  const profile       = state.profile;
  const lines         = profile.split('\n').length;
  const chars         = profile.length;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const opportunities = useMemo(() => detectOpportunities(profile), [profile]);

  const handleCopy = () => {
    navigator.clipboard.writeText(profile).then(() => {
      setCopied(true);
      toast.success('Copié dans le presse-papiers !');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => toast.error('Échec de la copie.'));
  };

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([profile], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `profil-fiscal-${date}.txt`,
    }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Fichier téléchargé.');
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape 3 / 4</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Votre profil fiscal</h1>
        <p className="text-sm text-gray-500 mt-1">
          Synthèse structurée que Claude utilisera pour vous conseiller.
        </p>
      </div>

      {/* ── Code viewer ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

        {/* Barre d'en-tête style éditeur */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {/* Traffic lights décoratifs */}
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="w-3 h-3 rounded-full bg-red-400/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
              <span className="w-3 h-3 rounded-full bg-green-400/80" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-mono">
              <FileText size={12} aria-hidden="true" />
              profil-fiscal.txt
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-gray-500">
            <span>{lines} lignes</span>
            <span className="text-gray-700">·</span>
            <span>{chars.toLocaleString('fr-FR')} car.</span>
          </div>
        </div>

        {/* Contenu */}
        <div className="relative bg-gray-950">
          <pre
            className="font-mono text-xs leading-relaxed text-gray-300 p-5 whitespace-pre-wrap break-words overflow-y-auto"
            style={{ maxHeight: '55vh' }}
          >
            {profile}
          </pre>
          {/* Fade bottom */}
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-950 to-transparent pointer-events-none"
          />
        </div>
      </div>

      {/* ── Actions ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="secondary" size="md" className="flex-1" onClick={handleCopy}>
          {copied ? <><Check size={14} /> Copié !</> : <><Copy size={14} /> Copier</>}
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={handleDownload}>
          <Download size={14} /> Télécharger .txt
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate('/checklist')}>
          <ClipboardList size={14} /> Checklist fiscale
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate('/declaration')}>
          <BookOpen size={14} /> Guide déclaration
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate('/opportunites')}>
          <TrendingUp size={14} /> Opportunités
          {opportunities.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-500 text-white text-[10px] font-bold">
              {opportunities.length}
            </span>
          )}
        </Button>
        <Button variant="primary" size="md" className="flex-1 sm:flex-[2] !rounded-xl" onClick={() => navigate('/chat')}>
          <Sparkles size={14} /> Démarrer le conseil →
        </Button>
      </div>

      {/* ── Opportunités ──────────────────────────────────────────── */}
      {opportunities.length > 0 && (
        <OpportunitiesPanel opportunities={opportunities} />
      )}

      {/* CTA principal */}
      <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-gradient flex items-center justify-center text-white shrink-0 shadow-sm">
          <MessageCircle size={18} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">Prêt pour le conseil expert</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Ce profil + les skills fiscaux actifs seront transmis à Claude à chaque question.
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/chat')} className="shrink-0">
          Lancer → <Sparkles size={12} />
        </Button>
      </div>

      <div className="flex justify-start">
        <Button variant="ghost" size="sm" onClick={() => navigate('/collect')}>
          <ArrowLeft size={14} /> Modifier mes données
        </Button>
      </div>

    </div>
  );
}
