import { useEffect, useState } from 'react';
import DEMO_PROFILE from '../lib/__tests__/fixtures/profil-fiscal-ref.txt?raw';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Lock, Sparkles, Bot, FileSearch,
  ClipboardList, Layers, TrendingUp, GitFork, Zap, Brain,
  CheckCircle2, Building2, Scale, Calculator, Eye, Award,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

import AnimatedNumber from '../components/motion/AnimatedNumber';
import ScrollReveal from '../components/motion/ScrollReveal';
import MagneticButton from '../components/motion/MagneticButton';
import GlowCard from '../components/motion/GlowCard';
import AuroraBackground from '../components/motion/AuroraBackground';
import SpotlightCursor from '../components/motion/SpotlightCursor';
import SplitText from '../components/motion/SplitText';

const STORAGE_KEY = 'coachFiscal.state';

function hasActiveSession() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    const hasForm = Object.keys(parsed.formData || {}).length > 0;
    const hasProfile = (parsed.profile || '').length > 0;
    const hasChat = (parsed.chatHistory || []).length > 0;
    return hasForm || hasProfile || hasChat;
  } catch {
    return false;
  }
}

const STATS = [
  { value: 100, suffix: ' %',   label: 'Données locales',     desc: 'Aucune donnée envoyée' },
  { value: 7,                   label: 'Experts IA actifs',   desc: 'Skills fiscaux dynamiques' },
  { value: 30,  suffix: ' min', label: 'Pour un bilan',       desc: 'Du PDF au conseil' },
  { value: 0,   suffix: ' €',   label: 'Abonnement',          desc: '100 % open source' },
];

const STEPS = [
  {
    Icon: Lock,
    n: '01',
    title: 'Anonymisation',
    desc: 'Vos PDF (bulletins, avis IR, relevés) sont lus localement par pdf.js. Les données identifiantes sont masquées avant tout traitement.',
  },
  {
    Icon: ClipboardList,
    n: '02',
    title: 'Collecte',
    desc: 'Un formulaire guidé structure votre situation fiscale. Les chiffres extraits pré-remplissent les champs automatiquement.',
  },
  {
    Icon: FileSearch,
    n: '03',
    title: 'Profil',
    desc: 'Un profil fiscal synthétique est généré localement. C’est ce texte qui sera transmis à l’IA.',
  },
  {
    Icon: Bot,
    n: '04',
    title: 'Conseil expert',
    desc: 'Claude reçoit votre profil et les skills fiscaux actifs, puis répond avec des données chiffrées à jour.',
  },
];

const FEATURES = [
  {
    Icon: Eye,
    title: '100 % privé, vérifiable',
    desc: 'Tout le traitement se passe dans votre navigateur. Vérifiable en temps réel dans DevTools.',
    bullets: ['PDF lus localement', 'Profil chiffré côté client', 'Code open source MIT'],
  },
  {
    Icon: Brain,
    title: 'Alimenté par Claude',
    desc: 'L’IA la plus avancée pour le raisonnement fiscal. Barèmes 2025 à jour, références CGI et BOFiP intégrées.',
    bullets: ['Modèles Sonnet 4.5 / Opus 4.5', 'Skills experts contextuels', 'Citations sources juridiques'],
  },
  {
    Icon: Zap,
    title: 'Pensé pour l’action',
    desc: 'Chaque conseil est chiffré, sourcé, et débouche sur une case fiscale à remplir ou une action à mener.',
    bullets: ['Cases 2042 pré-remplies', 'Simulateurs PER, fonciers, AV', 'Checklist personnalisée'],
  },
];

const SKILLS = [
  { name: 'Fiscaliste',         Icon: Scale,       desc: 'IR, PEA, AV, PER, LMNP, IFI, crypto' },
  { name: 'Notaire',            Icon: Building2,   desc: 'Succession, donation, démembrement, SCI' },
  { name: 'Comptable',          Icon: Calculator,  desc: 'TVA, IS, liasse fiscale, FEC' },
  { name: 'Contrôleur fiscal',  Icon: ShieldCheck, desc: 'Redressement, prescription, pénalités' },
  { name: 'CAC',                Icon: Award,       desc: 'Audit légal, NEP, certification' },
  { name: 'Syndic',             Icon: Layers,      desc: 'Copropriété, AG, loi 1965' },
  { name: 'GCP',                Icon: TrendingUp,  desc: 'Patrimoine global, allocation d’épargne' },
];

function MockDashboard() {
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const opportunities = [
    { tag: 'PER',     gain: '+2 400 €', color: 'danger',  label: 'Versement PER avant 31/12' },
    { tag: 'PEA',     gain: '18 mois',  color: 'warning', label: 'Exonération PV proche' },
    { tag: 'Foncier', gain: 'À évaluer', color: 'kapio',  label: 'Régime réel envisageable' },
  ];

  return (
    <div className="relative w-full max-w-5xl mx-auto">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 blur-3xl opacity-60"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(46,184,138,0.3), transparent 70%)' }}
      />
      <motion.div
        initial={isTouch ? { opacity: 0, y: 20 } : { opacity: 0, y: 60, rotateX: 8 }}
        whileInView={isTouch ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, rotateX: 0 }}
        viewport={{ once: true, margin: '-15% 0px' }}
        transition={{ duration: isTouch ? 0.5 : 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={isTouch ? undefined : { transformPerspective: 1200 }}
        className="card-dark-elevated p-1 rounded-2xl overflow-hidden"
      >
        <div className="relative bg-ink-850 rounded-xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-danger-500" />
              <div className="w-2 h-2 rounded-full bg-warning-500" />
              <div className="w-2 h-2 rounded-full bg-success-500" />
              <span className="ml-3 text-xs font-mono text-ink-200">kapio.app/dashboard</span>
            </div>
            <span className="text-xs text-ink-200">Mode démo</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card-dark p-5">
              <p className="text-xs text-ink-200 mb-2 uppercase tracking-wider">Patrimoine net</p>
              <p className="text-3xl font-bold text-ink-0">
                <AnimatedNumber value={245800} suffix=" €" />
              </p>
              <p className="text-xs text-success-400 mt-2 flex items-center gap-1">
                <TrendingUp size={11} /> +12,4 % YoY
              </p>
            </div>
            <div className="card-dark p-5">
              <p className="text-xs text-ink-200 mb-2 uppercase tracking-wider">TMI actuel</p>
              <p className="text-3xl font-bold text-ink-0">
                <AnimatedNumber value={30} suffix=" %" duration={1200} />
              </p>
              <p className="text-xs text-warning-400 mt-2">Tranche marginale</p>
            </div>
            <div className="card-dark p-5">
              <p className="text-xs text-ink-200 mb-2 uppercase tracking-wider">IR 2025 estimé</p>
              <p className="text-3xl font-bold text-ink-0">
                <AnimatedNumber value={12450} suffix=" €" duration={1400} />
              </p>
              <p className="text-xs text-kapio-300 mt-2">Avant optimisations</p>
            </div>
          </div>

          <div className="card-dark p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-ink-0 flex items-center gap-2">
                <Sparkles size={14} className="text-kapio-300" />
                Opportunités détectées
              </p>
              <span className="text-xs text-ink-200">3 actions</span>
            </div>
            {opportunities.map((op, i) => {
              const tagClass = op.color === 'danger'
                ? 'bg-danger-500/10 text-danger-400'
                : op.color === 'warning'
                  ? 'bg-warning-500/10 text-warning-400'
                  : 'bg-kapio-500/10 text-kapio-300';
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + i * 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center justify-between py-3 border-t border-white/[0.05]"
                >
                  <div className="flex items-center gap-3">
                    <span className={'text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ' + tagClass}>
                      {op.tag}
                    </span>
                    <span className="text-sm text-ink-50">{op.label}</span>
                  </div>
                  <span className="text-sm font-mono text-ink-0">{op.gain}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const [sessionActive, setSessionActive] = useState(false);

  useEffect(() => {
    setSessionActive(hasActiveSession());
  }, []);

  const handleStart = () => {
    dispatch({ type: 'RESET_ALL' });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    navigate('/setup');
  };

  const handleDemo = () => {
    dispatch({ type: 'ENTER_DEMO', payload: DEMO_PROFILE });
    navigate('/dashboard');
  };

  return (
    <div className="bg-ink-900 text-ink-0 overflow-x-hidden">

      {/* SPOTLIGHT CURSEUR — halo qui suit la souris sur toute la page */}
      <SpotlightCursor size={520} intensity={0.22} />

      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
        <AuroraBackground showGrid showBeam intensity={1} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 py-24 text-center">

          {/* LOGO EN GROS AU CENTRE */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex justify-center mb-8"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 blur-3xl opacity-50"
              style={{ background: 'radial-gradient(circle, rgba(46,184,138,0.6), transparent 60%)' }}
            />
            <motion.img
              src="/kapio-logo.png"
              alt="Kapio"
              className="relative w-48 h-auto sm:w-72 mx-auto drop-shadow-2xl object-contain"
            />
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-ink-50 text-xs font-medium mb-8"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-kapio-300 opacity-75 animate-pulse2" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-kapio-300" />
            </span>
            Bilan fiscal · 100 % privé · Open source
            <ShieldCheck size={12} className="text-kapio-300" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="text-display-sm sm:text-display lg:text-display-lg text-gradient-hero mb-6"
            style={{ letterSpacing: '-0.03em' }}
          >
            <SplitText text="Votre patrimoine," delay={0.3} stagger={0.035} />
            <br />
            <SplitText text="optimisé par l’IA." gradient delay={0.75} stagger={0.035} />
          </motion.h1>

          {/* Sous-titre */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-base sm:text-lg text-ink-100 leading-relaxed mb-10 max-w-2xl mx-auto"
          >
            Bilan fiscal et patrimonial complet en 30 minutes.
            <br className="hidden sm:block" />
            7 experts IA, vos documents jamais transmis, alimenté par Claude.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <MagneticButton
              onClick={handleStart}
              strength={0.25}
              className="btn-kapio shimmer-btn !text-base !px-7 !py-3.5"
            >
              Démarrer mon bilan
              <ArrowRight size={18} />
            </MagneticButton>

            {sessionActive ? (
              <MagneticButton
                onClick={() => navigate('/dashboard')}
                strength={0.2}
                className="btn-ghost-dark !text-base !px-7 !py-3.5"
              >
                Reprendre ma session
              </MagneticButton>
            ) : (
              <MagneticButton
                onClick={() => navigate('/about')}
                strength={0.2}
                className="btn-ghost-dark !text-base !px-7 !py-3.5"
              >
                Voir comment ça marche
              </MagneticButton>
            )}
          </motion.div>

          {/* Lien démo — discret, sous les CTAs */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            className="flex justify-center mb-8"
          >
            <button
              onClick={handleDemo}
              className="inline-flex items-center gap-2 text-xs text-ink-300 hover:text-kapio-300 px-4 py-2 rounded-full border border-white/[0.07] hover:border-kapio-500/40 bg-white/[0.02] hover:bg-kapio-900/20 transition-all duration-200"
            >
              <Eye size={12} />
              Voir une démo interactive (sans clé API)
            </button>
          </motion.div>

          {/* Trust pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.9 }}
            className="flex items-center justify-center gap-3 flex-wrap text-xs text-ink-200"
          >
            <div className="inline-flex items-center gap-1.5">
              <Lock size={12} className="text-kapio-300" />
              Aucune donnée n’est envoyée
            </div>
            <span className="text-ink-400">·</span>
            <div className="inline-flex items-center gap-1.5">
              <GitFork size={12} />
              Code source vérifiable
            </div>
            <span className="text-ink-400">·</span>
            <div className="inline-flex items-center gap-1.5">
              <Sparkles size={12} className="text-kapio-300" />
              Barèmes 2025
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-ink-300"
        >
          <div className="w-5 h-8 border-2 border-ink-400 rounded-full flex justify-center pt-1.5">
            <div className="w-1 h-2 bg-ink-300 rounded-full" />
          </div>
        </motion.div>
      </section>

      {/* SECTION 2 - MOCKUP DASHBOARD */}
      <section className="relative py-24 sm:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="inline-block px-3 py-1 rounded-full bg-kapio-500/10 text-kapio-300 text-xs font-semibold uppercase tracking-widest mb-4">
                Dashboard
              </span>
              <h2 className="text-3xl sm:text-5xl font-bold text-ink-0 mb-4 tracking-tight">
                Une vue d’ensemble,
                <br />
                <span className="text-gradient">limpide et actionnable.</span>
              </h2>
              <p className="text-base sm:text-lg text-ink-100 max-w-2xl mx-auto leading-relaxed">
                Patrimoine, fiscalité, opportunités. Tout ce qui compte, mis à jour en temps réel.
              </p>
            </div>
          </ScrollReveal>
          <MockDashboard />
        </div>
      </section>

      {/* SECTION 3 - STATS */}
      <section className="relative py-20 px-6 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {STATS.map((stat, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="text-center">
                  <p className="text-4xl sm:text-5xl font-bold text-gradient mb-2">
                    <AnimatedNumber value={stat.value} suffix={stat.suffix || ''} />
                  </p>
                  <p className="text-sm font-semibold text-ink-0 mb-1">{stat.label}</p>
                  <p className="text-xs text-ink-200">{stat.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4 - COMMENT ÇA MARCHE */}
      <section className="relative py-24 sm:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="inline-block px-3 py-1 rounded-full bg-kapio-500/10 text-kapio-300 text-xs font-semibold uppercase tracking-widest mb-4">
                Process
              </span>
              <h2 className="text-3xl sm:text-5xl font-bold text-ink-0 mb-4 tracking-tight">
                4 étapes, 30 minutes.
              </h2>
              <p className="text-base sm:text-lg text-ink-100 max-w-2xl mx-auto leading-relaxed">
                Du document brut au conseil expert. Tout en local, sauf l’IA finale.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((step, i) => (
              <ScrollReveal key={step.n} delay={i * 0.1} direction="up">
                <div className="card-dark p-6 h-full card-lift">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-11 h-11 rounded-xl bg-kapio-gradient flex items-center justify-center">
                      <step.Icon size={20} className="text-ink-900" />
                    </div>
                    <span className="text-xl font-bold text-ink-300 font-mono">{step.n}</span>
                  </div>
                  <h3 className="text-base font-bold text-ink-0 mb-2">{step.title}</h3>
                  <p className="text-sm text-ink-100 leading-relaxed">{step.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5 - POURQUOI */}
      <section className="relative py-24 sm:py-32 px-6 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="inline-block px-3 py-1 rounded-full bg-kapio-500/10 text-kapio-300 text-xs font-semibold uppercase tracking-widest mb-4">
                Pourquoi Kapio
              </span>
              <h2 className="text-3xl sm:text-5xl font-bold text-ink-0 mb-4 tracking-tight">
                Conçu pour vous,
                <br />
                <span className="text-gradient">jamais pour vos données.</span>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <ScrollReveal key={f.title} delay={i * 0.12}>
                <GlowCard className="p-7 h-full">
                  <div className="w-12 h-12 rounded-xl bg-kapio-500/10 border border-kapio-500/30 flex items-center justify-center mb-5">
                    <f.Icon size={22} className="text-kapio-300" />
                  </div>
                  <h3 className="text-lg font-bold text-ink-0 mb-3">{f.title}</h3>
                  <p className="text-sm text-ink-100 leading-relaxed mb-5">{f.desc}</p>
                  <ul className="flex flex-col gap-2">
                    {f.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-ink-50">
                        <CheckCircle2 size={14} className="text-kapio-300 mt-0.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </GlowCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 6 - SKILLS */}
      <section className="relative py-24 sm:py-32 px-6 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="inline-block px-3 py-1 rounded-full bg-kapio-500/10 text-kapio-300 text-xs font-semibold uppercase tracking-widest mb-4">
                Skills
              </span>
              <h2 className="text-3xl sm:text-5xl font-bold text-ink-0 mb-4 tracking-tight">
                7 experts IA,
                <br />
                <span className="text-gradient">activés selon votre question.</span>
              </h2>
              <p className="text-base sm:text-lg text-ink-100 max-w-2xl mx-auto leading-relaxed">
                Claude charge dynamiquement les compétences nécessaires. Pas de réponse générique.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SKILLS.map((skill, i) => (
              <ScrollReveal key={skill.name} delay={i * 0.06}>
                <motion.div
                  whileHover={{ y: -4, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
                  className="card-dark p-5 h-full group cursor-default"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-ink-700 border border-white/[0.06] flex items-center justify-center group-hover:bg-kapio-500/10 group-hover:border-kapio-500/30 transition-all duration-300">
                      <skill.Icon size={16} className="text-ink-50 group-hover:text-kapio-300 transition-colors duration-300" />
                    </div>
                    <h3 className="text-sm font-semibold text-ink-0">{skill.name}</h3>
                  </div>
                  <p className="text-xs text-ink-200 leading-relaxed">{skill.desc}</p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 7 - CTA FINAL */}
      <section className="relative py-32 sm:py-40 px-6 overflow-hidden">
        <AuroraBackground intensity={0.7} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <h2 className="text-4xl sm:text-6xl font-bold text-ink-0 mb-6 tracking-tight">
              <SplitText text="Prêt à reprendre" delay={0.1} stagger={0.03} />
              <br />
              <SplitText text="le contrôle ?" gradient delay={0.5} stagger={0.04} />
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <p className="text-base sm:text-lg text-ink-100 mb-10 leading-relaxed max-w-xl mx-auto">
              Aucune inscription, aucune carte bancaire. Juste votre clé API Anthropic et 30 minutes.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <MagneticButton
              onClick={handleStart}
              strength={0.3}
              className="btn-kapio shimmer-btn !text-base !px-8 !py-4"
            >
              Démarrer mon bilan gratuitement
              <ArrowRight size={18} />
            </MagneticButton>
          </ScrollReveal>
          <ScrollReveal delay={0.45}>
            <p className="mt-6 text-xs text-ink-200">
              Coût d’utilisation : 5 à 15 €/mois via l’API Anthropic. Vous payez directement, pas d’intermédiaire.
            </p>
          </ScrollReveal>
        </div>
      </section>

    </div>
  );
}
