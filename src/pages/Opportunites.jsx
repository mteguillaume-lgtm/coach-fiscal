import { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Sparkles, TrendingUp, ArrowRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

import { useApp } from '../context/AppContext';
import { detectOpportunities } from '../lib/opportunitiesDetector';
import { genererSynthese } from '../lib/conseilPatrimonial';
import OpportunitiesPanel from '../components/OpportunitiesPanel';
import SyntheseConseil from '../components/SyntheseConseil';
import DisclaimerBanner from '../components/DisclaimerBanner';
import PERBandeau from '../components/PERBandeau';

import AuroraBackground from '../components/motion/AuroraBackground';
import SpotlightCursor from '../components/motion/SpotlightCursor';
import Grain from '../components/motion/Grain';
import SplitText from '../components/motion/SplitText';
import GlowCard from '../components/motion/GlowCard';
import MagneticButton from '../components/motion/MagneticButton';
import ScrollReveal from '../components/motion/ScrollReveal';
import AnimatedNumber from '../components/motion/AnimatedNumber';

export default function Opportunites() {
  const { state } = useApp();
  const navigate  = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      if (!state.profile) {
        toast.error('Génère ton profil fiscal d\'abord.');
        navigate('/collect', { replace: true });
      }
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opportunities = useMemo(
    () => detectOpportunities(state.parsedProfile ?? {}),
    [state.parsedProfile],
  );

  const synthese = useMemo(
    () => genererSynthese(state.parsedProfile ?? {}, null, opportunities),
    [state.parsedProfile, opportunities],
  );

  if (!state.profile) return null;

  return (
    <div className="relative bg-ink-900 overflow-hidden">

      <AuroraBackground showGrid intensity={0.75} />
      <SpotlightCursor size={500} intensity={0.15} />
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
            Analyse patrimoniale
            <TrendingUp size={11} className="text-kapio-300" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="text-display-sm sm:text-display text-gradient-hero mb-4"
            style={{ letterSpacing: '-0.03em' }}
          >
            <SplitText text="Opportunités " delay={0.25} stagger={0.04} />
            <SplitText text="fiscales" gradient delay={0.55} stagger={0.04} />
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-base sm:text-lg text-ink-100 leading-relaxed max-w-xl mx-auto"
          >
            {opportunities.length > 0
              ? `${opportunities.length} opportunité${opportunities.length > 1 ? 's' : ''} identifiée${opportunities.length > 1 ? 's' : ''} dans votre profil.`
              : 'Analyse de votre profil fiscal en cours.'}
          </motion.p>

          {opportunities.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex items-center justify-center gap-6 mt-6 text-xs"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-kapio-300 font-bold font-mono text-lg">
                  <AnimatedNumber value={opportunities.length} />
                </span>
                <span className="text-ink-200">opportunité{opportunities.length > 1 ? 's' : ''} détectée{opportunities.length > 1 ? 's' : ''}</span>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* CONTENT */}
        <div className="flex flex-col gap-6">

          <ScrollReveal delay={0.3}>
            <PERBandeau />
          </ScrollReveal>

          <ScrollReveal delay={0.35}>
            <SyntheseConseil synthese={synthese} />
          </ScrollReveal>

          <ScrollReveal delay={0.4}>
            <OpportunitiesPanel opportunities={opportunities} />
          </ScrollReveal>

          {/* État vide */}
          {opportunities.length === 0 && (
            <ScrollReveal delay={0.5}>
              <GlowCard className="p-8 text-center" glowColor="rgba(46,184,138,0.15)">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex w-16 h-16 rounded-2xl bg-success-500/10 border border-success-500/20 items-center justify-center mb-4"
                >
                  <Zap size={24} className="text-success-400" />
                </motion.div>
                <p className="text-base font-bold text-ink-0 mb-2">Aucune opportunité détectée automatiquement</p>
                <p className="text-sm text-ink-100 leading-relaxed max-w-sm mx-auto mb-6">
                  Votre profil ne déclenche pas de détection automatique. Posez directement vos questions au Coach Fiscal.
                </p>
                <MagneticButton
                  onClick={() => navigate('/chat')}
                  strength={0.2}
                  className="btn-kapio shimmer-btn !px-5 !py-2.5 !text-sm"
                >
                  <Sparkles size={14} /> Démarrer le conseil <ArrowRight size={14} />
                </MagneticButton>
              </GlowCard>
            </ScrollReveal>
          )}

          {/* CTA conseil */}
          {opportunities.length > 0 && (
            <ScrollReveal delay={0.7}>
              <GlowCard className="p-6" glowColor="rgba(46,184,138,0.18)">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <motion.div
                    animate={{ boxShadow: ['0 0 0 0 rgba(46,184,138,0)', '0 0 28px rgba(46,184,138,0.4)', '0 0 0 0 rgba(46,184,138,0)'] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="w-11 h-11 rounded-xl bg-kapio-gradient flex items-center justify-center text-ink-900 shrink-0"
                  >
                    <Sparkles size={18} />
                  </motion.div>
                  <div className="flex-1">
                    <p className="font-bold text-ink-0 text-sm mb-0.5">Passer à l'action avec l'IA</p>
                    <p className="text-xs text-ink-100 leading-relaxed">
                      Discutez de ces opportunités avec Claude — analyse personnalisée et plan d'action.
                    </p>
                  </div>
                  <MagneticButton
                    onClick={() => navigate('/chat')}
                    strength={0.18}
                    className="btn-kapio shimmer-btn !px-4 !py-2.5 !text-xs shrink-0"
                  >
                    <Sparkles size={12} /> Démarrer le conseil
                  </MagneticButton>
                </div>
              </GlowCard>
            </ScrollReveal>
          )}

          {/* Disclaimer global permanent */}
          <ScrollReveal delay={0.8}>
            <DisclaimerBanner variant="dark" />
          </ScrollReveal>

          {/* Retour */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex justify-start pt-2"
          >
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="inline-flex items-center gap-1.5 text-xs text-ink-200 hover:text-kapio-300 transition-all duration-300 hover:gap-2.5"
            >
              <ArrowLeft size={13} /> Retour au profil
            </button>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
