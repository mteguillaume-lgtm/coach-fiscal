import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Copy, Download, ArrowLeft, Check, FileText, Sparkles,
  ClipboardList, TrendingUp, BookOpen, FolderOpen, Wand2,
  Loader2, LayoutDashboard, CheckCircle2, ArrowRight, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useApp } from '../context/AppContext';
import { parseProfile } from '../lib/profileParser';
import { detectOpportunities } from '../lib/opportunitiesDetector';
import OpportunitiesPanel from '../components/OpportunitiesPanel';
import { chatWithClaude } from '../lib/claudeApi';
import { detectRelevantSkills, buildSystemPrompt } from '../lib/skillRouter';
import { MASTER_PROMPT } from '../data/masterPrompt';

import AnimatedNumber from '../components/motion/AnimatedNumber';
import ScrollReveal from '../components/motion/ScrollReveal';
import GlowCard from '../components/motion/GlowCard';
import MagneticButton from '../components/motion/MagneticButton';
import AuroraBackground from '../components/motion/AuroraBackground';
import SpotlightCursor from '../components/motion/SpotlightCursor';
import Grain from '../components/motion/Grain';
import SplitText from '../components/motion/SplitText';

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

// ============================================================================
// COMPOSANT ACTION BUTTON
// ============================================================================

function ActionButton({ Icon, label, onClick, variant, badge }) {
  const base = 'group flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 relative';

  let classes = base;
  if (variant === 'primary') {
    classes += ' btn-kapio shimmer-btn';
  } else {
    classes += ' bg-ink-700 border border-white/[0.06] text-ink-50 hover:bg-ink-600 hover:border-kapio-500/30 hover:text-kapio-300';
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, rotateX: 6, rotateY: 4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformStyle: 'preserve-3d', transformPerspective: 800 }}
      className={classes}
    >
      <Icon size={13} className="transition-transform duration-300 group-hover:scale-110" />
      {label}
      {badge != null && badge > 0 ? (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-kapio-gradient text-ink-900 text-2xs font-bold shadow-glow-soft"
        >
          {badge}
        </motion.span>
      ) : null}
    </motion.button>
  );
}

// ============================================================================
// PROFILE PAGE
// ============================================================================

export default function Profile() {
  const { state, dispatch, getApiKey } = useApp();
  const navigate = useNavigate();
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const opportunities = useMemo(
    () => detectOpportunities(state.parsedProfile || {}),
    [state.parsedProfile],
  );

  if (!state.profile) return null;

  const profile = state.profile;
  const lines = profile.split('\n').length;
  const chars = profile.length;

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
        dispatch({ type: 'SET_MODE', payload: pp.mode });
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
    if (!apiKey) {
      toast.error('Clé API manquante — configurez-la dans Paramètres.');
      return;
    }
    setEnriching(true);
    toast('Analyse en cours avec Claude Sonnet…', { icon: '🤖' });
    try {
      const skills = detectRelevantSkills('déclaration impôts cases 2042 PER plafond optimisation');
      const system = buildSystemPrompt({ skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: 'sonnet' });
      let enrichedText = '';
      await chatWithClaude({
        apiKey,
        model: 'sonnet',
        system,
        messages: [{ role: 'user', content: ENRICHMENT_PROMPT }],
        onChunk: chunk => { enrichedText += chunk; },
      });
      if (enrichedText.trim()) {
        const newProfile = state.profile.trimEnd() + '\n\n' + enrichedText.trim();
        dispatch({ type: 'SET_PROFILE', payload: newProfile });
        toast.success('Profil enrichi — données actualisées !');
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
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `profil-fiscal-${date}.txt`,
    }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Fichier téléchargé.');
  };

  return (
    <div className="relative bg-ink-900 overflow-hidden">

      {/* AURORA ANIMÉE (3 blobs en mouvement continu, grille, beam) */}
      <AuroraBackground showGrid showBeam intensity={0.85} />

      {/* SPOTLIGHT CURSEUR — halo qui suit la souris */}
      <SpotlightCursor size={500} intensity={0.18} />

      {/* GRAIN OVERLAY — texture noise subtile */}
      <Grain opacity={0.025} />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">

        {/* HERO HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-ink-50 text-xs font-medium mb-6"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-kapio-300 opacity-75 animate-pulse2" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-kapio-300" />
            </span>
            Étape 3 / 5
            <FileText size={11} className="text-kapio-300" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="text-display-sm sm:text-display mb-4 text-center"
            style={{ letterSpacing: '-0.03em' }}
          >
            <SplitText text="Profil " delay={0.25} stagger={0.04} />
            <SplitText text="Fiscal" gradient delay={0.55} stagger={0.04} />
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-base sm:text-lg text-ink-100 leading-relaxed max-w-xl mx-auto"
          >
            Synthèse structurée. Enrichissez-le avec l'IA, puis consultez le rapport complet.
          </motion.p>

          {/* Stats animées */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex items-center justify-center gap-6 mt-6 text-xs"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-kapio-300 font-bold font-mono text-lg">
                <AnimatedNumber value={lines} />
              </span>
              <span className="text-ink-200">lignes</span>
            </div>
            <span className="text-ink-400">·</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-kapio-300 font-bold font-mono text-lg">
                <AnimatedNumber value={chars} />
              </span>
              <span className="text-ink-200">caractères</span>
            </div>
            {opportunities.length > 0 ? (
              <>
                <span className="text-ink-400">·</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-kapio-300 font-bold font-mono text-lg">
                    <AnimatedNumber value={opportunities.length} />
                  </span>
                  <span className="text-ink-200">opportunité{opportunities.length > 1 ? 's' : ''}</span>
                </div>
              </>
            ) : null}
          </motion.div>
        </motion.div>

        <div className="flex flex-col gap-6">

          {/* CODE VIEWER avec border conique */}
          <ScrollReveal delay={0.3}>
            <div className="relative card-dark overflow-hidden">

              {/* Border conique animée subtile */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-2xl pointer-events-none opacity-50"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0%, rgba(46,184,138,0.2) 25%, transparent 50%, rgba(46,184,138,0.1) 75%, transparent 100%)',
                  animation: 'spin 12s linear infinite',
                  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  padding: '1px',
                }}
              />

              {/* Barre éditeur */}
              <div className="relative flex items-center justify-between px-4 py-3 bg-ink-950/60 border-b border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5" aria-hidden="true">
                    <span className="w-3 h-3 rounded-full bg-danger-500/80" />
                    <span className="w-3 h-3 rounded-full bg-warning-500/80" />
                    <span className="w-3 h-3 rounded-full bg-success-500/80" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-200 font-mono">
                    <FileText size={12} aria-hidden="true" />
                    profil-fiscal.txt
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-ink-300">
                  <span>{lines} lignes</span>
                  <span className="text-ink-400">·</span>
                  <span>{chars.toLocaleString('fr-FR')} car.</span>
                </div>
              </div>

              {/* Contenu */}
              <div className="relative bg-ink-950/40">
                <pre
                  className="font-mono text-xs leading-relaxed text-ink-50 p-6 whitespace-pre-wrap break-words overflow-y-auto"
                  style={{ maxHeight: '55vh' }}
                >
                  {profile}
                </pre>
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                  style={{ background: 'linear-gradient(to top, rgba(7,7,8,0.95), transparent)' }}
                />
              </div>
            </div>
          </ScrollReveal>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={handleImport}
          />

          {/* Bouton enrichissement IA — magnetic + glow pulse + beam */}
          <ScrollReveal delay={0.45}>
            <div className="relative">
              {/* Glow pulse continu autour du bouton */}
              {!enriching ? (
                <motion.div
                  aria-hidden="true"
                  className="absolute -inset-1 rounded-2xl pointer-events-none"
                  animate={{
                    boxShadow: [
                      '0 0 0 0 rgba(46, 184, 138, 0)',
                      '0 0 48px 6px rgba(46, 184, 138, 0.28)',
                      '0 0 0 0 rgba(46, 184, 138, 0)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
              ) : null}

              <MagneticButton
                onClick={handleEnrich}
                disabled={enriching}
                strength={enriching ? 0 : 0.2}
                className={
                  'relative w-full flex items-center justify-center gap-2 rounded-2xl px-5 py-5 text-sm font-semibold transition-all overflow-hidden ' +
                  (enriching ? 'opacity-60 cursor-not-allowed' : '')
                }
                style={{
                  background: 'linear-gradient(145deg, rgba(46, 184, 138, 0.1) 0%, rgba(46, 184, 138, 0.03) 100%)',
                  border: '2px dashed rgba(46, 184, 138, 0.35)',
                  color: '#2EB88A',
                }}
              >
                {/* Beam qui traverse */}
                {!enriching ? (
                  <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: '200%' }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      repeatDelay: 2,
                      ease: 'easeInOut',
                    }}
                    className="absolute inset-y-0 w-32 -skew-x-12 pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(46,184,138,0.15), transparent)' }}
                  />
                ) : null}

                {enriching ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span className="font-bold">Analyse en cours (30-60 s)…</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    <span className="font-bold">Enrichir avec l'IA</span>
                    <span className="text-ink-200">·</span>
                    <span className="text-ink-100 font-normal">cases 2042, points critiques, objectifs</span>
                  </>
                )}
              </MagneticButton>
            </div>
          </ScrollReveal>

          {/* Bannière post-enrichissement */}
          <AnimatePresence>
            {enriched ? (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.95 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-2xl border border-kapio-500/40 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 overflow-hidden"
                style={{
                  background: 'linear-gradient(145deg, rgba(46, 184, 138, 0.12) 0%, rgba(46, 184, 138, 0.04) 100%)',
                  boxShadow: '0 0 40px rgba(46, 184, 138, 0.15)',
                }}
              >
                {/* Particules subtiles */}
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{
                      opacity: [0, 1, 0],
                      y: [30, -20, -40],
                      x: [0, i * 10 - 10, 0],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      delay: i * 0.7,
                      ease: 'easeOut',
                    }}
                    className="absolute w-1 h-1 rounded-full bg-kapio-300 pointer-events-none"
                    style={{ left: `${15 + i * 12}%`, bottom: 20 }}
                  />
                ))}

                <motion.div
                  animate={{
                    rotate: [0, 360],
                  }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  className="relative z-10"
                >
                  <CheckCircle2 size={24} className="text-kapio-300" />
                </motion.div>
                <div className="flex-1 relative z-10">
                  <p className="text-base font-bold text-ink-0">Analyse IA complète</p>
                  <p className="text-xs text-ink-100 mt-0.5">Toutes les données sont à jour dans l'application</p>
                </div>
                <div className="flex gap-2 sm:ml-auto flex-wrap relative z-10">
                  <ActionButton Icon={FileText} label="Voir le rapport" onClick={() => navigate('/rapport')} variant="primary" />
                  <ActionButton Icon={LayoutDashboard} label="Dashboard" onClick={() => navigate('/dashboard')} />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Actions */}
          <ScrollReveal delay={0.55}>
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <ActionButton
                Icon={copied ? Check : Copy}
                label={copied ? 'Copié !' : 'Copier'}
                onClick={handleCopy}
              />
              <ActionButton Icon={Download} label="Télécharger .txt" onClick={handleDownload} />
              <ActionButton Icon={FolderOpen} label="Importer .txt" onClick={() => fileInputRef.current?.click()} />
              <ActionButton Icon={ClipboardList} label="Checklist" onClick={() => navigate('/checklist')} />
              <ActionButton Icon={BookOpen} label="Déclaration" onClick={() => navigate('/declaration')} />
              <ActionButton
                Icon={TrendingUp}
                label="Opportunités"
                onClick={() => navigate('/opportunites')}
                badge={opportunities.length}
              />
            </div>
          </ScrollReveal>

          {/* Opportunités */}
          {opportunities.length > 0 ? (
            <ScrollReveal delay={0.65}>
              <OpportunitiesPanel opportunities={opportunities} />
            </ScrollReveal>
          ) : null}

          {/* CTA principal — GlowCard premium */}
          <ScrollReveal delay={0.75}>
            <GlowCard className="p-7" glowColor="rgba(46,184,138,0.2)" glowSize={500}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <motion.div
                  animate={{
                    boxShadow: [
                      '0 0 0 0 rgba(46,184,138,0)',
                      '0 0 32px rgba(46,184,138,0.4)',
                      '0 0 0 0 rgba(46,184,138,0)',
                    ],
                  }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="w-14 h-14 rounded-2xl bg-kapio-gradient flex items-center justify-center text-ink-900 shrink-0"
                >
                  <FileText size={22} />
                </motion.div>
                <div className="flex-1">
                  <p className="font-bold text-ink-0 text-base mb-1">Étape suivante : le rapport complet</p>
                  <p className="text-sm text-ink-100 leading-relaxed">
                    Tableaux de calcul étape par étape, analyse IA, objectifs prioritaires.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                  <MagneticButton
                    onClick={() => navigate('/rapport')}
                    strength={0.2}
                    className="btn-kapio shimmer-btn !px-5 !py-3 !text-sm"
                  >
                    <FileText size={14} /> Voir le rapport
                    <ArrowRight size={14} />
                  </MagneticButton>
                  <MagneticButton
                    onClick={() => navigate('/chat')}
                    strength={0.18}
                    className="btn-ghost-dark !px-5 !py-3 !text-sm"
                  >
                    <Sparkles size={14} /> Chat IA
                  </MagneticButton>
                </div>
              </div>
            </GlowCard>
          </ScrollReveal>

          {/* Retour */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex justify-start pt-4"
          >
            <button
              type="button"
              onClick={() => navigate('/collect')}
              className="inline-flex items-center gap-1.5 text-xs text-ink-200 hover:text-kapio-300 transition-all duration-300 hover:gap-2.5"
            >
              <ArrowLeft size={13} /> Modifier mes données
            </button>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
