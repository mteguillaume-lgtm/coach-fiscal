import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, ExternalLink, AlertTriangle, CheckCircle2,
  ArrowLeft, ArrowRight, Key, User, Users, Lock, Sparkles,
  Shield,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';

import AuroraBackground from '../components/motion/AuroraBackground';
import MagneticButton from '../components/motion/MagneticButton';
import GlowCard from '../components/motion/GlowCard';
import ScrollReveal from '../components/motion/ScrollReveal';

const API_CONSOLE_URL = 'https://console.anthropic.com/settings/keys';

function isValidKey(k) {
  return typeof k === 'string' && k.startsWith('sk-ant-') && k.length > 20;
}

const MODES = [
  { value: 'solo',   label: 'Célibataire', sub: 'Une déclaration', Icon: User },
  { value: 'couple', label: 'Couple',      sub: 'PACS ou mariage', Icon: Users },
];

export default function Setup() {
  const navigate = useNavigate();
  const { state, dispatch, getApiKey, setApiKey } = useApp();

  const [apiKey, setLocalApiKey] = useState('');
  const [mode, setMode] = useState(state.mode || 'solo');
  const [showKey, setShowKey] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const stored = getApiKey();
    if (stored) setLocalApiKey(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = isValidKey(apiKey);
  const showError = touched && apiKey.length > 0 && !valid;

  function handleContinue() {
    if (!valid) return;
    setApiKey(apiKey);
    dispatch({ type: 'SET_MODE', payload: mode });
    navigate('/anonymize');
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-ink-900 overflow-hidden">

      {/* AURORA BACKGROUND */}
      <AuroraBackground showGrid intensity={0.7} />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-16">

        {/* HERO HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 text-center"
        >
          {/* Logo qui pulse */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative inline-block mb-6"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 blur-2xl opacity-60"
              style={{ background: 'radial-gradient(circle, rgba(46,184,138,0.5), transparent 60%)' }}
            />
            <motion.img
              src="/kapio-mark.svg"
              alt="Kapio"
              className="relative w-20 h-20 mx-auto drop-shadow-2xl"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Badge étape */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-ink-50 text-xs font-medium mb-6"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-kapio-300 opacity-75 animate-pulse2" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-kapio-300" />
            </span>
            Étape 0 / 4
            <Sparkles size={11} className="text-kapio-300" />
          </motion.div>

          {/* Titre display */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-display-sm sm:text-display text-gradient-hero mb-4"
            style={{ letterSpacing: '-0.03em' }}
          >
            <span className="text-gradient">Configuration</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-base sm:text-lg text-ink-100 leading-relaxed max-w-md mx-auto"
          >
            Clé API et situation du foyer en moins d'une minute.
          </motion.p>
        </motion.div>

        {/* CONTENT */}
        <div className="flex flex-col gap-5">

          {/* CARD CLÉ API avec GlowCard */}
          <ScrollReveal delay={0.5}>
            <GlowCard className="p-7" liftOnHover={false}>

              {/* Border conique animée quand clé valide */}
              <AnimatePresence>
                {valid ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent 0%, rgba(46,184,138,0.4) 25%, transparent 50%, rgba(46,184,138,0.2) 75%, transparent 100%)',
                      animation: 'spin 6s linear infinite',
                      WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                      padding: '1px',
                    }}
                  />
                ) : null}
              </AnimatePresence>

              <div className="flex items-start justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={valid ? {
                      boxShadow: [
                        '0 0 0 0 rgba(46,184,138,0)',
                        '0 0 0 8px rgba(46,184,138,0.15)',
                        '0 0 0 0 rgba(46,184,138,0)',
                      ],
                    } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                    className={
                      'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ' +
                      (valid
                        ? 'bg-kapio-gradient text-ink-900 shadow-glow-kapio'
                        : 'bg-ink-700 border border-white/[0.06] text-ink-200')
                    }
                  >
                    <Key size={18} aria-hidden="true" />
                  </motion.div>
                  <div>
                    <p className="font-bold text-ink-0 text-base">Clé API Anthropic</p>
                    <p className="text-xs text-ink-200 mt-0.5">Étape Conseil uniquement · jamais partagée</p>
                  </div>
                </div>
                <a
                  href={API_CONSOLE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-xs text-kapio-300 hover:text-kapio-200 font-medium transition-colors mt-2 hover:gap-1.5"
                >
                  Obtenir <ExternalLink size={11} aria-hidden="true" />
                </a>
              </div>

              {/* Input avec glow */}
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  placeholder="sk-ant-api03-..."
                  autoComplete="off"
                  spellCheck={false}
                  onChange={e => {
                    setLocalApiKey(e.target.value);
                    setTouched(true);
                  }}
                  onBlur={() => setTouched(true)}
                  className={
                    'w-full pr-10 pl-4 py-3.5 text-sm rounded-xl bg-ink-700/60 text-ink-0 placeholder:text-ink-300 font-mono backdrop-blur-sm ' +
                    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-300 ' +
                    (showError
                      ? 'border border-danger-500/50 focus:ring-danger-500/30 shadow-[0_0_24px_rgba(239,68,68,0.15)]'
                      : valid
                        ? 'border border-kapio-500/50 focus:ring-kapio-500/30 shadow-[0_0_24px_rgba(46,184,138,0.2)]'
                        : 'border border-white/[0.08] focus:ring-kapio-500/30 focus:border-kapio-500/40')
                  }
                />

                {/* Shimmer quand valide */}
                {valid ? (
                  <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: '200%' }}
                      transition={{ duration: 2, ease: 'easeInOut', delay: 0.2 }}
                      className="absolute inset-y-0 w-24"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(46,184,138,0.15), transparent)' }}
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  aria-label={showKey ? 'Masquer' : 'Afficher'}
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-200 hover:text-ink-0 transition-colors p-1"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Feedback avec animations */}
              <AnimatePresence mode="wait">
                {showError ? (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -4, height: 0 }}
                    className="flex items-center gap-1.5 text-xs text-danger-400 mt-3"
                  >
                    <AlertTriangle size={12} />
                    Doit commencer par <code className="font-mono bg-danger-500/10 px-1.5 py-0.5 rounded">sk-ant-</code>
                  </motion.p>
                ) : null}

                {valid ? (
                  <motion.p
                    key="valid"
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    className="flex items-center gap-1.5 text-xs text-kapio-300 mt-3"
                  >
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <CheckCircle2 size={12} />
                    </motion.span>
                    Clé valide
                  </motion.p>
                ) : null}
              </AnimatePresence>

              {/* Warning */}
              <div className="flex items-start gap-2 bg-warning-500/[0.08] border border-warning-500/20 rounded-xl p-3 text-xs text-warning-400 mt-5">
                <Lock size={13} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Stockée <strong className="text-warning-400">uniquement dans votre navigateur</strong>.
                  Ne partagez pas cet onglet.
                </span>
              </div>
            </GlowCard>
          </ScrollReveal>

          {/* CARD FOYER */}
          <ScrollReveal delay={0.65}>
            <GlowCard className="p-7" liftOnHover={false}>
              <div className="mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-kapio-500/10 border border-kapio-500/30 flex items-center justify-center">
                  <Shield size={16} className="text-kapio-300" />
                </div>
                <div>
                  <p className="font-bold text-ink-0 text-base">Situation du foyer</p>
                  <p className="text-xs text-ink-200 mt-0.5">Détermine les sections du formulaire</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {MODES.map(({ value, label, sub, Icon }, i) => {
                  const isActive = mode === value;
                  return (
                    <motion.button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className={
                        'relative flex flex-col items-start gap-3 p-5 rounded-2xl text-left transition-all duration-300 overflow-hidden ' +
                        (isActive
                          ? 'border-2 border-kapio-500/50 bg-kapio-500/[0.06] shadow-glow-soft'
                          : 'border-2 border-white/[0.06] bg-ink-700/40 hover:border-white/[0.12] hover:bg-ink-700/60')
                      }
                    >
                      {/* Glow background quand actif */}
                      {isActive ? (
                        <motion.div
                          layoutId="mode-glow"
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: 'radial-gradient(circle at 30% 30%, rgba(46,184,138,0.15), transparent 70%)',
                          }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      ) : null}

                      <motion.div
                        animate={isActive ? {
                          boxShadow: [
                            '0 0 0 0 rgba(46,184,138,0)',
                            '0 0 24px rgba(46,184,138,0.3)',
                            '0 0 0 0 rgba(46,184,138,0)',
                          ],
                        } : {}}
                        transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.5 }}
                        className={
                          'relative z-10 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ' +
                          (isActive
                            ? 'bg-kapio-gradient text-ink-900'
                            : 'bg-ink-600 border border-white/[0.06] text-ink-200')
                        }
                      >
                        <Icon size={17} />
                      </motion.div>

                      <div className="relative z-10">
                        <p className={
                          'font-bold text-sm transition-colors ' +
                          (isActive ? 'text-kapio-300' : 'text-ink-0')
                        }>
                          {label}
                        </p>
                        <p className="text-xs text-ink-200 mt-0.5">{sub}</p>
                      </div>

                      {/* Check icon en haut à droite quand actif */}
                      <AnimatePresence>
                        {isActive ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute top-3 right-3 w-5 h-5 rounded-full bg-kapio-gradient flex items-center justify-center"
                          >
                            <CheckCircle2 size={11} className="text-ink-900" />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </GlowCard>
          </ScrollReveal>

          {/* CTA MAGNETIC */}
          <ScrollReveal delay={0.8}>
            <div className="pt-2">
              <MagneticButton
                onClick={handleContinue}
                strength={valid ? 0.25 : 0}
                disabled={!valid}
                className={
                  'w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm transition-all duration-300 ' +
                  (valid
                    ? 'btn-kapio shimmer-btn !text-base'
                    : 'bg-ink-700 text-ink-300 cursor-not-allowed border border-white/[0.06]')
                }
              >
                <Sparkles size={16} />
                Continuer vers l'anonymisation
                <ArrowRight size={16} />
              </MagneticButton>

              {!valid && touched && apiKey.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-xs text-ink-200 mt-3"
                >
                  Saisissez votre clé API pour continuer.
                </motion.p>
              ) : null}
            </div>
          </ScrollReveal>

          {/* Retour */}
          <ScrollReveal delay={0.95}>
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-1.5 text-xs text-ink-200 hover:text-kapio-300 transition-all duration-300 hover:gap-2.5"
              >
                <ArrowLeft size={13} /> Retour à l'accueil
              </button>
            </div>
          </ScrollReveal>

        </div>
      </div>
    </div>
  );
}
