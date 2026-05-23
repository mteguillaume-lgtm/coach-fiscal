import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send, Menu, X, Trash2, Download, ArrowLeft, Zap,
  Sparkles, Bot, Calculator, MessageCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useApp } from '../context/AppContext';
import { chatWithClaude, detectComplexity } from '../lib/claudeApi';
import { detectRelevantSkills, buildSystemPrompt } from '../lib/skillRouter';
import { MASTER_PROMPT } from '../data/masterPrompt';
import PERBandeau from '../components/PERBandeau';

import MagneticButton from '../components/motion/MagneticButton';

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  {
    category: '💰 Fiscal',
    questions: [
      'Optimiser ma déclaration 2026',
      'Vérifier mon taux PAS',
      'PFU vs barème pour mes dividendes ?',
    ],
  },
  {
    category: '🏦 Patrimoine',
    questions: [
      'Allocation optimale de mon épargne',
      'Faut-il ouvrir un PER ?',
      'Stratégie crypto et fiscalité',
    ],
  },
  {
    category: '📜 Succession',
    questions: [
      'Préparer ma succession',
      'Donations aux enfants',
      'Démembrement de propriété',
    ],
  },
  {
    category: '🎯 Retraite',
    questions: [
      'Combien épargner pour ma retraite ?',
      'PEA vs Assurance-vie vs PER',
    ],
  },
];

// ─── Markdown ─────────────────────────────────────────────────────────────────

const MD_COMPONENTS = {
  p:          ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-ink-50">{children}</p>,
  ul:         ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-ink-50">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-ink-50">{children}</ol>,
  li:         ({ children }) => <li className="leading-relaxed text-ink-50">{children}</li>,
  strong:     ({ children }) => <strong className="font-semibold text-ink-0">{children}</strong>,
  h1:         ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 text-ink-0">{children}</h1>,
  h2:         ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-3 text-ink-0">{children}</h2>,
  h3:         ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 text-ink-50">{children}</h3>,
  pre:        ({ children }) => <pre className="bg-ink-950 text-ink-50 rounded-xl p-3 text-xs overflow-x-auto my-2 font-mono border border-white/[0.05]">{children}</pre>,
  code:       ({ children }) => <code className="bg-kapio-500/10 px-1.5 py-0.5 rounded-md text-xs font-mono text-kapio-300">{children}</code>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-kapio-300 pl-3 text-ink-100 italic my-2 bg-kapio-500/[0.04] py-1 rounded-r-lg">{children}</blockquote>,
  a:          ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-kapio-300 underline underline-offset-2 hover:text-kapio-200 transition-colors">
      {children}
    </a>
  ),
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ onSelect, onClose }) {
  return (
    <div className="flex flex-col h-full bg-ink-850/95 backdrop-blur-xl border-r border-white/[0.05]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(46,184,138,0)',
                '0 0 16px rgba(46,184,138,0.4)',
                '0 0 0 0 rgba(46,184,138,0)',
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="w-7 h-7 rounded-lg bg-kapio-gradient flex items-center justify-center"
          >
            <Bot size={13} className="text-ink-900" />
          </motion.div>
          <span className="text-sm font-bold text-ink-0">Suggestions</span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-200 hover:text-ink-0 hover:bg-white/[0.06] transition-colors md:hidden"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {SUGGESTIONS.map((cat, catIdx) => (
          <motion.div
            key={cat.category}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: catIdx * 0.08, duration: 0.4 }}
          >
            <p className="text-[10px] font-bold text-ink-300 uppercase tracking-widest mb-2 px-2">
              {cat.category}
            </p>
            <div className="space-y-0.5">
              {cat.questions.map((q, i) => (
                <motion.button
                  key={q}
                  type="button"
                  whileHover={{ x: 3 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => { onSelect(q); onClose && onClose(); }}
                  className="w-full text-left text-xs text-ink-100 hover:text-kapio-300 hover:bg-kapio-500/[0.08] px-2.5 py-2 rounded-xl transition-all duration-200 leading-relaxed group"
                >
                  <span className="inline-block w-0 group-hover:w-2 transition-all duration-200 overflow-hidden text-kapio-300">→ </span>
                  {q}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Lien simulateurs */}
      <div className="shrink-0 px-3 py-3 border-t border-white/[0.05]">
        <Link
          to="/simulator"
          onClick={onClose}
          className="flex items-center gap-2 w-full text-xs font-semibold text-ink-100 hover:text-kapio-300 hover:bg-kapio-500/[0.08] px-3 py-2.5 rounded-xl transition-all duration-200 group"
        >
          <Calculator size={13} className="shrink-0 transition-transform duration-300 group-hover:rotate-12" />
          Simulateurs fiscaux interactifs
        </Link>
      </div>
    </div>
  );
}

// ─── Typing dots premium ──────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
          className="w-1.5 h-1.5 rounded-full bg-kapio-300"
        />
      ))}
    </span>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export default function Chat() {
  const { state, dispatch, getApiKey } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [messages, setMessages] = useState(() => state.chatHistory || []);
  const [input, setInput] = useState(location.state?.prefill || '');
  const [streaming, setStreaming] = useState(false);
  const [activeSkills, setActiveSkills] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!state.profile) {
        toast.error('Génère ton profil fiscal avant de démarrer le conseil.');
        navigate('/collect', { replace: true });
      }
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  const inputComplexity = useMemo(() => {
    const text = input.trim();
    if (!text) return null;
    const skills = detectRelevantSkills(text);
    return { ...detectComplexity(text, skills), skills };
  }, [input]);

  const MODEL_RANK = { haiku: 0, sonnet: 1, opus: 2 };

  const effectiveModel = useMemo(() => {
    const auto = inputComplexity?.model || 'haiku';
    return MODEL_RANK[auto] >= MODEL_RANK[state.model] ? auto : state.model;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputComplexity, state.model]);

  const handleSend = useCallback(async (forceModel = null) => {
    const text = input.trim();
    if (!text || streaming) return;
    const apiKey = getApiKey();
    if (!apiKey) { toast.error('Clé API manquante.'); return; }

    setInput('');
    const prevMessages = messages;

    const skills = detectRelevantSkills(text);
    setActiveSkills(skills);
    const { model: autoModel } = detectComplexity(text, skills);
    const modelToUse = forceModel || (
      MODEL_RANK[autoModel] >= MODEL_RANK[state.model] ? autoModel : state.model
    );

    const userMsg = { role: 'user', content: text };
    const draftMsg = { role: 'assistant', content: '', streaming: true, model: modelToUse };
    setMessages(prev => [...prev, userMsg, draftMsg]);
    setStreaming(true);

    const system = buildSystemPrompt({ skills, profile: state.profile, masterPrompt: MASTER_PROMPT, model: modelToUse });
    const historyForApi = [
      ...prevMessages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    try {
      await chatWithClaude({
        apiKey, messages: historyForApi, system, model: modelToUse,
        onChunk: chunk => setMessages(prev => {
          const u = [...prev];
          const l = u[u.length - 1];
          u[u.length - 1] = { ...l, content: l.content + chunk };
          return u;
        }),
      });
      setMessages(prev => {
        const final = prev.map((m, i) =>
          i === prev.length - 1 ? { role: m.role, content: m.content, model: m.model } : m
        );
        dispatch({ type: 'SET_CHAT_HISTORY', payload: final });
        return final;
      });
    } catch (err) {
      const errText = err.message.length > 120 ? err.message.slice(0, 120) + '…' : err.message;
      setMessages(prev => {
        const u = [...prev];
        u[u.length - 1] = { role: 'assistant', content: `❌ ${errText}`, error: true };
        dispatch({ type: 'SET_CHAT_HISTORY', payload: u });
        return u;
      });
      toast.error(errText);
    } finally {
      setStreaming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, streaming, messages, state.profile, state.model, getApiKey, dispatch]);

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleSuggestion = q => {
    setInput(q);
    textareaRef.current?.focus();
  };

  const handleClear = () => {
    if (!window.confirm('Effacer la conversation ?')) return;
    setMessages([]);
    setActiveSkills([]);
    dispatch({ type: 'CLEAR_CHAT' });
    toast.success('Conversation effacée.');
  };

  const handleExport = () => {
    if (messages.length === 0) {
      toast.error('Aucun message à exporter.');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const body = messages.map(m => `**${m.role === 'user' ? 'Vous' : 'Kapio'}**\n\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([`# Conversation Kapio — ${date}\n\n${body}`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `conversation-kapio-${date}.md`,
    }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Export téléchargé.');
  };

  if (!state.profile) return null;

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden bg-ink-900">

      {/* AURORA ULTRA-SUBTILE EN FOND */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          aria-hidden="true"
          className="absolute -top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(46,184,138,0.12) 0%, rgba(46,184,138,0) 65%)',
            filter: 'blur(80px)',
          }}
          animate={{
            x: [0, 40, -20, 0],
            y: [0, -20, 10, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-25"
          style={{
            background: 'radial-gradient(circle, rgba(29,158,117,0.1) 0%, rgba(29,158,117,0) 60%)',
            filter: 'blur(90px)',
          }}
          animate={{
            x: [0, -30, 20, 0],
            y: [0, 20, -15, 0],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
      </div>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 overflow-hidden relative z-10">
        <Sidebar onSelect={handleSuggestion} />
      </aside>

      {/* Sidebar mobile overlay */}
      <AnimatePresence>
        {sidebarOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex md:hidden"
          >
            <motion.div
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-72 flex flex-col shadow-2xl"
            >
              <Sidebar onSelect={handleSuggestion} onClose={() => setSidebarOpen(false)} />
            </motion.div>
            <div
              className="flex-1 bg-black/60 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Zone chat principale */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 glass-darker border-b border-white/[0.05] px-4 py-3 flex items-center gap-3"
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Suggestions"
            className="md:hidden text-ink-200 hover:text-ink-0 transition-colors p-1.5 rounded-lg hover:bg-white/[0.06]"
          >
            <Menu size={18} />
          </button>

          <motion.div
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(46,184,138,0)',
                '0 0 20px rgba(46,184,138,0.4)',
                '0 0 0 0 rgba(46,184,138,0)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-9 h-9 rounded-xl bg-kapio-gradient flex items-center justify-center text-ink-900 text-xs font-bold shrink-0"
          >
            K
          </motion.div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink-0 leading-none">Kapio</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={activeSkills.join('-')}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.3 }}
                className="text-[10px] text-ink-200 mt-1 truncate"
              >
                {activeSkills.length > 0
                  ? `Skills : ${activeSkills.join(' · ')}`
                  : 'Expert fiscal IA · 7 skills disponibles'}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Toggle modèle */}
          <div className="flex items-center rounded-xl border border-white/[0.06] bg-ink-700/60 backdrop-blur-sm p-0.5 gap-0.5 shrink-0">
            {[
              { key: 'sonnet', label: 'Sonnet', Icon: Zap,      activeClass: 'bg-kapio-gradient text-ink-900 shadow-glow-soft' },
              { key: 'opus',   label: 'Opus',   Icon: Sparkles, activeClass: 'bg-violet-600 text-white shadow-[0_0_16px_rgba(139,92,246,0.4)]' },
            ].map(({ key, label, Icon, activeClass }) => (
              <button
                key={key}
                type="button"
                onClick={() => dispatch({ type: 'SET_MODEL', payload: key })}
                title={`Modèle ${label}`}
                className={
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-300 ' +
                  (state.model === key ? activeClass : 'text-ink-200 hover:text-ink-0')
                }
              >
                <Icon size={10} /> {label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => navigate('/profile')}
              title="Profil"
              className="w-8 h-8 flex items-center justify-center text-ink-200 hover:text-ink-0 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <ArrowLeft size={15} />
            </button>
            <button
              type="button"
              onClick={handleExport}
              title="Exporter"
              className="w-8 h-8 flex items-center justify-center text-ink-200 hover:text-ink-0 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Effacer"
              className="w-8 h-8 flex items-center justify-center text-ink-200 hover:text-danger-400 rounded-lg hover:bg-danger-500/10 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </motion.div>

        {/* PER bandeau */}
        <div className="shrink-0 px-4 pt-3">
          <PERBandeau />
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-5 select-none px-6">

              {/* Logo géant avec glow */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-0 blur-2xl"
                  style={{ background: 'radial-gradient(circle, rgba(46,184,138,0.5), transparent 60%)' }}
                />
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative w-20 h-20 rounded-3xl bg-kapio-gradient flex items-center justify-center text-3xl shadow-glow-kapio"
                >
                  <MessageCircle size={32} className="text-ink-900" />
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                <h2 className="text-2xl font-bold text-ink-0 mb-2 tracking-tight">
                  Posez votre <span className="text-gradient">première question</span>
                </h2>
                <p className="text-sm text-ink-100 max-w-md leading-relaxed">
                  Utilisez les suggestions ou tapez directement.<br />
                  Les skills fiscaux s'activent automatiquement.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="flex flex-wrap gap-2 justify-center mt-2 max-w-md"
              >
                {SUGGESTIONS[0].questions.slice(0, 3).map((q, i) => (
                  <motion.button
                    key={q}
                    type="button"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
                    whileHover={{ y: -3, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSuggestion(q)}
                    className="text-xs px-4 py-2 rounded-full border border-kapio-500/30 text-kapio-300 hover:bg-kapio-500/[0.08] hover:border-kapio-500/50 hover:shadow-glow-soft transition-all"
                  >
                    {q}
                  </motion.button>
                ))}
              </motion.div>
            </div>
          ) : (
            <div className="space-y-5 max-w-2xl mx-auto">
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 25,
                    delay: idx === messages.length - 1 ? 0 : 0,
                  }}
                  className={'flex flex-col gap-1.5 ' + (msg.role === 'user' ? 'items-end' : 'items-start')}
                >
                  <div className={'flex gap-3 items-end ' + (msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>

                    {/* Avatar */}
                    {msg.role === 'assistant' ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        className="w-8 h-8 rounded-xl bg-kapio-gradient flex items-center justify-center text-ink-900 text-[11px] font-bold shrink-0 mb-0.5 shadow-glow-soft"
                      >
                        K
                      </motion.div>
                    ) : null}
                    {msg.role === 'user' ? (
                      <div className="w-8 h-8 rounded-xl bg-ink-700 border border-white/[0.08] flex items-center justify-center text-ink-0 text-[11px] font-bold shrink-0 mb-0.5">
                        U
                      </div>
                    ) : null}

                    {/* Bubble */}
                    <motion.div
                      whileHover={{ scale: 1.005 }}
                      transition={{ duration: 0.2 }}
                      className={
                        'max-w-[78%] rounded-2xl px-4 py-3 text-sm transition-all ' +
                        (msg.role === 'user'
                          ? 'bg-kapio-gradient text-ink-900 rounded-br-sm shadow-glow-soft'
                          : msg.error
                            ? 'bg-danger-500/[0.08] border border-danger-500/30 text-danger-400 rounded-bl-sm'
                            : 'bg-ink-800/80 backdrop-blur-sm border border-white/[0.05] text-ink-50 rounded-bl-sm hover:border-white/[0.08]')
                      }
                    >
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed font-medium">{msg.content}</p>
                      ) : msg.streaming && msg.content === '' ? (
                        <TypingDots />
                      ) : (
                        <div className="prose-sm max-w-none">
                          <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                            {msg.content}
                          </Markdown>
                          {msg.streaming ? (
                            <motion.span
                              animate={{ opacity: [1, 0.3, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                              className="inline-block w-0.5 h-3.5 bg-kapio-300 ml-0.5 align-middle rounded-full"
                            />
                          ) : null}
                        </div>
                      )}
                    </motion.div>
                  </div>

                  {/* Badge modèle */}
                  {msg.role === 'assistant' && !msg.streaming && msg.content ? (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3, duration: 0.3 }}
                      className={
                        'ml-11 text-[10px] font-bold px-2 py-0.5 rounded-full border ' +
                        (
                          !msg.model || msg.model === 'haiku'
                            ? 'bg-ink-700 text-ink-100 border-white/[0.08]'
                            : msg.model === 'sonnet'
                              ? 'bg-kapio-500/[0.12] text-kapio-300 border-kapio-500/30'
                              : 'bg-violet-500/[0.12] text-violet-400 border-violet-500/30'
                        )
                      }
                    >
                      {(!msg.model || msg.model === 'haiku') ? '⚡ Haiku' : null}
                      {msg.model === 'sonnet' ? '🧠 Sonnet' : null}
                      {msg.model === 'opus' ? '🔮 Opus' : null}
                    </motion.span>
                  ) : null}
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Zone de saisie */}
        <div className="shrink-0 glass-darker border-t border-white/[0.05] px-4 pt-3 pb-4">
          <div className="max-w-2xl mx-auto flex flex-col gap-2">

            {/* Bannière Opus */}
            <AnimatePresence>
              {inputComplexity?.model === 'opus' && input.trim() ? (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="relative rounded-xl border border-violet-500/40 px-4 py-3 flex flex-col gap-2.5 overflow-hidden"
                  style={{
                    background: 'linear-gradient(145deg, rgba(139, 92, 246, 0.12) 0%, rgba(139, 92, 246, 0.04) 100%)',
                  }}
                >
                  {/* Border conique animée */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl pointer-events-none opacity-50"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent 0%, rgba(139,92,246,0.4) 25%, transparent 50%, rgba(139,92,246,0.2) 75%, transparent 100%)',
                      animation: 'spin 8s linear infinite',
                      WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                      padding: '1px',
                    }}
                  />

                  <div className="relative">
                    <p className="text-sm font-bold text-violet-400">
                      🔮 Question complexe détectée
                    </p>
                    <p className="text-xs text-violet-300/80 mt-0.5 leading-relaxed">
                      Notre meilleur modèle sera utilisé.<br />
                      Coût estimé : ~0,05–0,10 $ sur votre crédit API.
                    </p>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={streaming}
                      className="px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Envoyer quand même
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSend('sonnet')}
                      disabled={streaming}
                      className="px-3 py-1.5 text-xs font-medium text-violet-400 bg-white/[0.04] border border-violet-500/30 hover:bg-violet-500/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Simplifier
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Zone de saisie principale */}
            <motion.div
              whileFocus={{ scale: 1.005 }}
              className="flex items-end gap-2 bg-ink-800/80 backdrop-blur-sm rounded-2xl border border-white/[0.06] px-3 py-2 focus-within:border-kapio-500/40 focus-within:ring-2 focus-within:ring-kapio-500/20 focus-within:shadow-glow-soft transition-all duration-300"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question… (Entrée pour envoyer)"
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent text-sm focus:outline-none disabled:text-ink-300 leading-relaxed py-1.5 text-ink-0 placeholder:text-ink-300"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
              />
              <MagneticButton
                onClick={() => handleSend()}
                disabled={!input.trim() || streaming}
                strength={input.trim() && !streaming ? 0.3 : 0}
                aria-label="Envoyer"
                className={
                  'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ' +
                  (input.trim() && !streaming
                    ? 'bg-kapio-gradient text-ink-900 shadow-glow-kapio hover:brightness-110'
                    : 'bg-ink-700 text-ink-300 cursor-not-allowed')
                }
              >
                {streaming
                  ? <span className="w-3.5 h-3.5 border-2 border-ink-300 border-t-transparent rounded-full animate-spin" />
                  : <Send size={15} />
                }
              </MagneticButton>
            </motion.div>

            {/* Ligne bas */}
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-ink-200 leading-relaxed">
                💡 Conseil indicatif — consultez un professionnel agréé.
              </p>
              {inputComplexity ? (
                <span className="text-[10px] text-ink-200 font-mono">
                  Modèle : <span className="text-kapio-300 font-semibold">{effectiveModel}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
