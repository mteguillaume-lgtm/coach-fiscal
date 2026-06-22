import { useState, useMemo, useEffect } from 'react';
import { useNavigate }  from 'react-router-dom';
import toast            from 'react-hot-toast';
import {
  ChevronDown, ChevronRight, CheckSquare, Square,
  MessageCircle, Download, RotateCcw, Copy, ExternalLink,
  AlertCircle, AlertTriangle, Info, Sparkles, ClipboardList, ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useApp } from '../context/AppContext';
import {
  QUESTIONNAIRE_GROUPS,
  generateChecklist,
  extractProfileData,
  extractValues,
} from '../lib/checklistGenerator';

import AuroraBackground from '../components/motion/AuroraBackground';
import SpotlightCursor from '../components/motion/SpotlightCursor';
import Grain from '../components/motion/Grain';
import GlowCard from '../components/motion/GlowCard';
import MagneticButton from '../components/motion/MagneticButton';
import ScrollReveal from '../components/motion/ScrollReveal';
import AnimatedNumber from '../components/motion/AnimatedNumber';

const STORAGE_KEY = 'kapio.checklist';

// ─── Priorité config ───────────────────────────────────────────────────────────

const PRIORITE_CONFIG = {
  critique:  { label: 'Critique',  Icon: AlertCircle,   color: 'text-danger-400',   bg: 'bg-danger-500/[0.07]',   border: 'border-danger-500/30',  badge: 'bg-danger-500/10 text-danger-400'  },
  attention: { label: 'Attention', Icon: AlertTriangle, color: 'text-warning-400',  bg: 'bg-warning-500/[0.07]',  border: 'border-warning-500/30', badge: 'bg-warning-500/10 text-warning-400' },
  info:      { label: 'Info',      Icon: Info,          color: 'text-blue-400',     bg: 'bg-blue-500/[0.06]',     border: 'border-blue-500/30',    badge: 'bg-blue-500/10 text-blue-400'       },
};

// ─── Composant item ────────────────────────────────────────────────────────────

function ChecklistItem({ item, done, onToggle, extractedValues, onChat }) {
  const [open, setOpen] = useState(false);
  const cfg = PRIORITE_CONFIG[item.priorite];
  const valeur = item.case ? extractedValues[item.case] : null;

  const handleCopy = () => {
    if (!valeur) return;
    navigator.clipboard.writeText(valeur)
      .then(() => toast.success('Valeur copiée !'))
      .catch(() => toast.error('Échec de la copie.'));
  };

  return (
    <div className={[
      'rounded-2xl border transition-all duration-200 overflow-hidden',
      done
        ? 'border-white/[0.04] bg-ink-800/30 opacity-50'
        : `${cfg.border} bg-ink-800/60 backdrop-blur-sm`,
    ].join(' ')}>

      <div className="flex items-start gap-3 px-4 py-3.5">
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          className={`shrink-0 mt-0.5 transition-colors ${done ? 'text-kapio-400' : 'text-ink-400 hover:text-ink-200'}`}
          aria-label={done ? 'Marquer comme non traité' : 'Marquer comme traité'}
        >
          {done
            ? <CheckSquare size={18} className="text-kapio-400" />
            : <Square size={18} />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.badge}`}>
              <cfg.Icon size={10} />
              {cfg.label}
            </span>
            {item.case && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-ink-700 text-ink-300 border border-white/[0.06]">
                Case {item.case}
              </span>
            )}
          </div>

          <p className={`text-sm font-semibold mt-1.5 ${done ? 'line-through text-ink-400' : 'text-ink-0'}`}>
            {item.titre}
          </p>
          <p className="text-xs text-ink-200 mt-0.5 leading-relaxed">{item.description}</p>

          {valeur && !done && (
            <div className="mt-2 flex items-center gap-2 bg-kapio-500/[0.08] border border-kapio-500/20 rounded-xl px-3 py-2">
              <span className="text-xs text-ink-300">Valeur attendue :</span>
              <span className="text-sm font-bold text-kapio-300 font-mono">{valeur} €</span>
              <button
                type="button"
                onClick={handleCopy}
                className="ml-auto text-kapio-400 hover:text-kapio-200 transition-colors"
                title="Copier la valeur"
              >
                <Copy size={13} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-ink-400 hover:text-ink-200 transition-colors"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {open ? 'Réduire' : 'En savoir plus'}
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className={`mt-2 text-xs text-ink-200 leading-relaxed p-3 rounded-xl overflow-hidden ${cfg.bg} border ${cfg.border}`}
              >
                {item.detail}
                {item.lienImpots && (
                  <a
                    href={item.lienImpots}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-1 text-kapio-300 hover:text-kapio-200 font-medium"
                  >
                    <ExternalLink size={11} /> impots.gouv.fr
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!done && (
          <button
            type="button"
            onClick={() => onChat(item.questionChat)}
            title="Discuter avec Claude"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-ink-400 hover:text-kapio-300 hover:bg-kapio-500/10 transition-colors"
          >
            <MessageCircle size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Écran questionnaire ───────────────────────────────────────────────────────

function Questionnaire({ onGenerate, onSkip, initialAnswers }) {
  const [answers, setAnswers] = useState(initialAnswers);

  const toggle = (id) => setAnswers(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const totalChecked = answers.size;

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center mb-4"
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-ink-50 text-xs font-medium mb-4">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-kapio-300 opacity-75 animate-pulse2" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-kapio-300" />
          </span>
          Checklist fiscale 2026
          <ClipboardList size={11} className="text-kapio-300" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink-0 mb-2" style={{ letterSpacing: '-0.02em' }}>
          Personnalisez votre checklist
        </h1>
        <p className="text-sm text-ink-100">
          Cochez les situations qui vous concernent en 2025 pour n'afficher que les points pertinents.
        </p>
      </motion.div>

      {/* Groupes de questions */}
      {QUESTIONNAIRE_GROUPS.map((group, gi) => (
        <ScrollReveal key={group.id} delay={0.1 + gi * 0.05}>
          <div className="panel-dark rounded-2xl border border-white/[0.06] bg-ink-800/60 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.04] bg-ink-850/40">
              <p className="text-xs font-bold text-ink-300 uppercase tracking-widest">{group.label}</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {group.items.map(item => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className={[
                    'shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                    answers.has(item.id)
                      ? 'bg-kapio-500 border-kapio-500'
                      : 'border-white/20 bg-ink-700',
                  ].join(' ')}>
                    {answers.has(item.id) && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <input type="checkbox" className="sr-only" checked={answers.has(item.id)} onChange={() => toggle(item.id)} />
                  <span className={`text-sm leading-relaxed ${answers.has(item.id) ? 'text-ink-0 font-medium' : 'text-ink-200'}`}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </ScrollReveal>
      ))}

      {/* CTA */}
      <ScrollReveal delay={0.5}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <MagneticButton
            onClick={() => onGenerate(answers)}
            strength={0.2}
            className="btn-kapio shimmer-btn !text-sm w-full sm:w-auto"
          >
            <Sparkles size={15} />
            Générer ma checklist ({totalChecked} situation{totalChecked > 1 ? 's' : ''} sélectionnée{totalChecked > 1 ? 's' : ''})
            <ArrowRight size={14} />
          </MagneticButton>
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-ink-300 hover:text-ink-0 transition-colors"
          >
            Passer et voir la checklist complète
          </button>
        </div>
      </ScrollReveal>

    </div>
  );
}

// ─── Écran checklist ───────────────────────────────────────────────────────────

function ChecklistView({ items, extractedValues, onReset, onChat }) {
  const [doneIds, setDoneIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
    catch { return new Set(); }
  });
  const [filter, setFilter] = useState('all');
  const [openGroups, setOpenGroups] = useState(new Set(['critique', 'attention', 'info']));

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...doneIds])); }
    catch { /* ignore */ }
  }, [doneIds]);

  const toggle = (id) => setDoneIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleGroup = (g) => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(g) ? next.delete(g) : next.add(g);
    return next;
  });

  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(i => i.priorite === filter);
  }, [items, filter]);

  const totalDone = items.filter(i => doneIds.has(i.id)).length;
  const totalItems = items.length;
  const pct = totalItems > 0 ? Math.round(totalDone / totalItems * 100) : 0;

  const critiques = items.filter(i => i.priorite === 'critique').length;
  const attentions = items.filter(i => i.priorite === 'attention').length;
  const infos = items.filter(i => i.priorite === 'info').length;

  const grouped = useMemo(() => ({
    critique:  filtered.filter(i => i.priorite === 'critique'),
    attention: filtered.filter(i => i.priorite === 'attention'),
    info:      filtered.filter(i => i.priorite === 'info'),
  }), [filtered]);

  const handleExport = () => {
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `CHECKLIST FISCALE 2026 — ${date}`,
      `${totalDone}/${totalItems} points traités`,
      '',
    ];
    for (const [priorite, list] of Object.entries(grouped)) {
      if (list.length === 0) continue;
      lines.push(`\n${'='.repeat(40)}`);
      lines.push(priorite.toUpperCase());
      lines.push('='.repeat(40));
      for (const item of list) {
        const status = doneIds.has(item.id) ? '[✓]' : '[ ]';
        lines.push(`\n${status} ${item.titre}${item.case ? ` (Case ${item.case})` : ''}`);
        lines.push(`    ${item.description}`);
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `checklist-fiscale-${date}.txt` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Checklist exportée.');
  };

  const handleChat = (question) => {
    navigate('/chat', { state: { prefill: question } });
  };

  const FILTER_TABS = [
    { id: 'all',       label: `Tous (${totalItems})` },
    { id: 'critique',  label: `🔴 Critiques (${critiques})` },
    { id: 'attention', label: `🟠 Attention (${attentions})` },
    { id: 'info',      label: `🔵 Info (${infos})` },
  ];

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-3"
      >
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-dark text-ink-50 text-xs font-medium mb-3">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-kapio-300 opacity-75 animate-pulse2" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-kapio-300" />
            </span>
            Checklist fiscale 2026
          </div>
          <h1 className="text-2xl font-bold text-ink-0" style={{ letterSpacing: '-0.02em' }}>
            Ma checklist fiscale
          </h1>
          <p className="text-sm text-ink-200 mt-0.5">
            <AnimatedNumber value={totalItems} /> points à vérifier · <span className="text-danger-400">{critiques} critique{critiques > 1 ? 's' : ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <motion.button
            type="button"
            onClick={handleExport}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-ink-700 border border-white/[0.06] text-ink-100 hover:text-ink-0 hover:bg-ink-600 transition-all duration-200"
          >
            <Download size={12} /> Exporter
          </motion.button>
          <motion.button
            type="button"
            onClick={onReset}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-ink-200 hover:text-ink-0 hover:bg-white/[0.05] transition-all duration-200"
          >
            <RotateCcw size={12} /> Modifier
          </motion.button>
        </div>
      </motion.div>

      {/* Barre de progression */}
      <ScrollReveal delay={0.1}>
        <GlowCard className="p-4" liftOnHover={false} glowColor="rgba(46,184,138,0.12)">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-mono font-semibold text-ink-300 uppercase tracking-wider">Points traités</span>
            <span className={`text-xs font-bold font-mono ${pct === 100 ? 'text-kapio-300' : 'text-ink-100'}`}>
              {totalDone} / {totalItems}
            </span>
          </div>
          <div className="h-2 bg-ink-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-kapio-gradient"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          {pct === 100 && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-kapio-300 font-medium mt-2 flex items-center gap-1"
            >
              ✓ Tous les points ont été vérifiés — bravo !
            </motion.p>
          )}
        </GlowCard>
      </ScrollReveal>

      {/* Filtres */}
      <div className="flex items-center gap-1 p-1 bg-ink-800/80 border border-white/[0.06] rounded-2xl overflow-x-auto">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={[
              'flex-1 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200',
              filter === tab.id
                ? 'bg-ink-700 text-kapio-300 shadow-none'
                : 'text-ink-300 hover:text-ink-0',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items groupés par priorité */}
      {(['critique', 'attention', 'info']).map(priorite => {
        const list = grouped[priorite];
        if (list.length === 0) return null;
        const cfg = PRIORITE_CONFIG[priorite];
        const isOpen = openGroups.has(priorite);
        const doneInGroup = list.filter(i => doneIds.has(i.id)).length;

        return (
          <div key={priorite}>
            <button
              type="button"
              onClick={() => toggleGroup(priorite)}
              className="w-full flex items-center gap-2 mb-2 group"
            >
              <cfg.Icon size={14} className={cfg.color} />
              <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>
                {cfg.label}
              </span>
              <span className="text-xs text-ink-400 font-mono ml-1">{doneInGroup}/{list.length}</span>
              <ChevronDown size={13} className={`text-ink-400 ml-auto transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
            </button>

            {isOpen && (
              <div className="flex flex-col gap-2">
                {list.map(item => (
                  <ChecklistItem
                    key={item.id}
                    item={item}
                    done={doneIds.has(item.id)}
                    onToggle={toggle}
                    extractedValues={extractedValues}
                    onChat={handleChat}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────

export default function Checklist() {
  const { state }  = useApp();
  const navigate   = useNavigate();

  // Pré-remplissage depuis parsedProfile (source de vérité)
  const profileDetected = useMemo(
    () => extractProfileData(state.parsedProfile ?? state.profile),
    [state.parsedProfile, state.profile]
  );
  const extractedValues = useMemo(
    () => extractValues(state.parsedProfile ?? state.profile),
    [state.parsedProfile, state.profile]
  );
  const initialAnswers = useMemo(
    () => new Set(Object.keys(profileDetected).filter(k => profileDetected[k])),
    [profileDetected]
  );

  const [step, setStep]       = useState('questionnaire'); // 'questionnaire' | 'checklist'
  const [answers, setAnswers] = useState(initialAnswers);
  const [showAll, setShowAll] = useState(false);

  const ALL_IDS = useMemo(
    () => new Set(QUESTIONNAIRE_GROUPS.flatMap(g => g.items.map(i => i.id))),
    []
  );

  const items = useMemo(
    () => generateChecklist(showAll ? ALL_IDS : answers),
    [answers, showAll, ALL_IDS]
  );

  const handleGenerate = (ans) => {
    setAnswers(ans);
    setShowAll(false);
    setStep('checklist');
  };

  const handleSkip = () => {
    setShowAll(true);
    setStep('checklist');
  };

  const handleReset = () => {
    setShowAll(false);
    setStep('questionnaire');
  };

  const handleChat = (question) => {
    navigate('/chat', { state: { prefill: question } });
  };

  if (step === 'questionnaire') {
    return (
      <div className="relative bg-ink-900 overflow-hidden">
        <AuroraBackground showGrid intensity={0.75} />
        <SpotlightCursor size={500} intensity={0.15} />
        <Grain opacity={0.025} />
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">
          <Questionnaire
            initialAnswers={answers}
            onGenerate={handleGenerate}
            onSkip={handleSkip}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-ink-900 overflow-hidden">
      <AuroraBackground showGrid intensity={0.75} />
      <SpotlightCursor size={500} intensity={0.15} />
      <Grain opacity={0.025} />
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        <ChecklistView
          items={items}
          extractedValues={extractedValues}
          onReset={handleReset}
          onChat={handleChat}
        />
      </div>
    </div>
  );
}
