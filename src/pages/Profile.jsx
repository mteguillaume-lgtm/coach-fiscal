import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate }         from 'react-router-dom';
import toast                   from 'react-hot-toast';
import { Copy, Download, MessageCircle, ArrowLeft, Check, FileText, Sparkles, ClipboardList, TrendingUp, BookOpen, FolderOpen, Wand2, Loader2, LayoutDashboard, CheckCircle2 } from 'lucide-react';

import { useApp }                   from '../context/AppContext';
import { parseProfile }             from '../lib/profileParser';
import { detectOpportunities }      from '../lib/opportunitiesDetector';
import OpportunitiesPanel           from '../components/OpportunitiesPanel';
import Button                       from '../components/Button';
import { chatWithClaude }           from '../lib/claudeApi';
import { detectRelevantSkills, buildSystemPrompt } from '../lib/skillRouter';
import { MASTER_PROMPT }            from '../data/masterPrompt';

const ENRICHMENT_PROMPT = `Le profil fiscal ci-dessus contient les données brutes et les calculs vérifiés (RNI, IR, PER, régularisation). Les montants sont exacts — ne les recalcule pas.

En tant que fiscaliste expert, analyse CE profil spécifique et génère les 4 sections suivantes. Appuie-toi sur les skills fiscaliste, notaire, comptable et GCP injectés dans ce prompt pour identifier tout ce qui est pertinent. Ne mentionne que ce qui est réellement présent ou déductible des données du profil — n'invente aucune situation.

== DÉCLARATION — CASES FORMULAIRE 2042 ==
Liste toutes les cases à remplir pour ce foyer avec le montant exact du profil.
Pour chaque ligne de revenu, déduction ou crédit présent : indique la case, le montant, et si nécessaire [⚠️ À VÉRIFIER] quand la valeur doit être confirmée par un document externe.
Indique les formulaires annexes déclenchés par les données de ce profil (2044, 3916 bis, 2074, etc.) et pourquoi.

== ANALYSE DES SITUATIONS PARTICULIÈRES ==
Identifie toutes les situations fiscales spécifiques à CE profil qui ont un impact déclaratif ou patrimonial.
Pour chaque situation détectée : explique le régime applicable, les obligations, les pièges à éviter, et la référence légale (article CGI ou BOFiP).
Si le profil ne contient aucune situation particulière sur un thème, ne l'aborde pas.

== POINTS D'ATTENTION ==
[🔴 CRITIQUE] Risques de redressement, pénalités ou omissions légalement obligatoires — avec montant de la pénalité si connu
[🟡 À CONFIRMER] Documents à récupérer ou valeurs à vérifier avant le dépôt de la déclaration
[🟢 OPTIMISATION] Actions à réaliser avant le 31 décembre avec gain fiscal estimé en €

== OBJECTIFS PRIORITAIRES ==
3 à 8 actions concrètes pour ce foyer, classées par impact décroissant.
Pour chaque action : quoi faire, avant quelle date, gain estimé en €, et pourquoi c'est prioritaire compte tenu de la situation de ce foyer.`;

export default function Profile() {
  const { state, dispatch, getApiKey } = useApp();
  const navigate   = useNavigate();
  const [copied, setCopied] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enriched, setEnriched] = useState(false);
  const fileInputRef = useRef(null);

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
  const opportunities = useMemo(() => detectOpportunities(state.parsedProfile ?? {}), [state.parsedProfile]);

  const handleCopy = () => {
    navigator.clipboard.writeText(profile).then(() => {
      setCopied(true);
      toast.success('Copié dans le presse-papiers !');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => toast.error('Échec de la copie.'));
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string' && text.trim()) {
        const trimmed = text.trim();
        const pp = parseProfile(trimmed);
        dispatch({ type: 'SET_MODE',    payload: pp.mode });
        dispatch({ type: 'SET_PROFILE', payload: trimmed });
        toast.success('Profil importé — données rechargées.');
      } else {
        toast.error('Fichier vide ou invalide.');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleEnrich = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { toast.error('Clé API manquante — configurez-la dans Paramètres.'); return; }
    setEnriching(true);
    toast('Analyse en cours avec Claude Sonnet…', { icon: '🤖' });
    try {
      const skills  = detectRelevantSkills('déclaration impôts cases 2042 PER plafond optimisation');
      const system  = buildSystemPrompt({ skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: 'sonnet' });
      let enriched  = '';
      await chatWithClaude({
        apiKey,
        model: 'sonnet',
        system,
        messages: [{ role: 'user', content: ENRICHMENT_PROMPT }],
        onChunk: chunk => { enriched += chunk; },
      });
      if (enriched.trim()) {
        const newProfile = state.profile.trimEnd() + '\n\n' + enriched.trim();
        dispatch({ type: 'SET_PROFILE', payload: newProfile });
        toast.success('Profil enrichi — données actualisées dans toute l\'app !');
        setEnriched(true);
      } else {
        toast.error('Réponse vide — réessayez.');
      }
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setEnriching(false);
    }
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
      <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={handleImport} />

      {/* Bouton enrichissement IA */}
      <button
        onClick={handleEnrich}
        disabled={enriching}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/60 hover:bg-teal-50 px-5 py-4 text-sm font-semibold text-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {enriching
          ? <><Loader2 size={16} className="animate-spin" /> Analyse en cours (30-60 s)…</>
          : <><Wand2 size={16} /> Enrichir avec l'IA — cases 2042, points critiques, objectifs</>
        }
      </button>

      {/* Bannière post-enrichissement */}
      {enriched && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-teal-700">
            <CheckCircle2 size={18} className="shrink-0" />
            <p className="text-sm font-semibold">Analyse IA complète — toutes les données sont à jour</p>
          </div>
          <div className="flex gap-2 sm:ml-auto flex-wrap">
            <Button size="sm" onClick={() => navigate('/rapport')}>
              <FileText size={13} /> Voir le rapport
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard size={13} /> Tableau de bord
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <Button variant="secondary" size="md" className="flex-1" onClick={handleCopy}>
          {copied ? <><Check size={14} /> Copié !</> : <><Copy size={14} /> Copier</>}
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={handleDownload}>
          <Download size={14} /> Télécharger .txt
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => fileInputRef.current?.click()}>
          <FolderOpen size={14} /> Importer .txt
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate('/checklist')}>
          <ClipboardList size={14} /> Checklist
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate('/declaration')}>
          <BookOpen size={14} /> Déclaration
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => navigate('/opportunites')}>
          <TrendingUp size={14} /> Opportunités
          {opportunities.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-500 text-white text-[10px] font-bold">
              {opportunities.length}
            </span>
          )}
        </Button>
        <Button variant="primary" size="lg" className="flex-1 sm:flex-[2] !whitespace-nowrap !min-h-[44px]" onClick={() => navigate('/chat')}>
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
