import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate }  from 'react-router-dom';
import toast            from 'react-hot-toast';
import Markdown         from 'react-markdown';
import remarkGfm        from 'remark-gfm';
import { Send, Menu, X, Trash2, Download, ArrowLeft, Zap, Sparkles, Bot } from 'lucide-react';

import { useApp }                                    from '../context/AppContext';
import { chatWithClaude, detectComplexity }           from '../lib/claudeApi';
import { detectRelevantSkills, buildSystemPrompt }   from '../lib/skillRouter';
import { MASTER_PROMPT }                             from '../data/masterPrompt';
import Button                                        from '../components/Button';

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { category: '💰 Fiscal', questions: [
    'Optimiser ma déclaration 2026', 'Vérifier mon taux PAS', 'PFU vs barème pour mes dividendes ?',
  ]},
  { category: '🏦 Patrimoine', questions: [
    'Allocation optimale de mon épargne', 'Faut-il ouvrir un PER ?', 'Stratégie crypto et fiscalité',
  ]},
  { category: '📜 Succession', questions: [
    'Préparer ma succession', 'Donations aux enfants', 'Démembrement de propriété',
  ]},
  { category: '🎯 Retraite', questions: [
    'Combien épargner pour ma retraite ?', 'PEA vs Assurance-vie vs PER',
  ]},
];

// ─── Markdown ─────────────────────────────────────────────────────────────────

const MD_COMPONENTS = {
  p:          ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul:         ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li:         ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  h1:         ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 text-gray-900">{children}</h1>,
  h2:         ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-3 text-gray-900">{children}</h2>,
  h3:         ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 text-gray-800">{children}</h3>,
  pre:        ({ children }) => <pre className="bg-gray-900 text-gray-100 rounded-xl p-3 text-xs overflow-x-auto my-2 font-mono">{children}</pre>,
  code:       ({ children }) => <code className="bg-gray-100 px-1.5 py-0.5 rounded-md text-xs font-mono text-teal-700">{children}</code>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-teal-300 pl-3 text-gray-500 italic my-2 bg-teal-50/50 py-1 rounded-r-lg">{children}</blockquote>,
  a:          ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-teal-600 underline underline-offset-2 hover:text-teal-700">{children}</a>,
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ onSelect, onClose }) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-teal-gradient flex items-center justify-center">
            <Bot size={12} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800">Suggestions</span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Fermer"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors md:hidden">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {SUGGESTIONS.map(cat => (
          <div key={cat.category}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-2">
              {cat.category}
            </p>
            <div className="space-y-0.5">
              {cat.questions.map(q => (
                <button key={q} onClick={() => { onSelect(q); onClose?.(); }}
                  className="w-full text-left text-xs text-gray-600 hover:text-teal-700 hover:bg-teal-50 px-2.5 py-2 rounded-xl transition-all duration-150 leading-relaxed">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce"
          style={{ animationDelay: `${i * 0.18}s`, animationDuration: '0.9s' }} />
      ))}
    </span>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export default function Chat() {
  const { state, dispatch, getApiKey } = useApp();
  const navigate = useNavigate();

  const [messages,     setMessages]     = useState(() => state.chatHistory || []);
  const [input,        setInput]        = useState('');
  const [streaming,    setStreaming]     = useState(false);
  const [activeSkills, setActiveSkills] = useState([]);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  // Guard : attend l'hydratation
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

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  // Complexité temps réel (pour indicateur + bannière — recalcul à chaque frappe)
  const inputComplexity = useMemo(() => {
    const text = input.trim();
    if (!text) return null;
    const skills = detectRelevantSkills(text);
    return { ...detectComplexity(text, skills), skills };
  }, [input]);

  // state.model sert de plancher de qualité : l'auto-router ne peut pas descendre en-dessous
  const MODEL_RANK = { haiku: 0, sonnet: 1, opus: 2 };

  const handleSend = useCallback(async (forceModel = null) => {
    const text = input.trim();
    if (!text || streaming) return;
    const apiKey = getApiKey();
    if (!apiKey) { toast.error('Clé API manquante.'); return; }

    setInput('');
    const prevMessages = messages;
    const userMsg  = { role: 'user',      content: text };
    const draftMsg = { role: 'assistant', content: '', streaming: true };
    setMessages(prev => [...prev, userMsg, draftMsg]);
    setStreaming(true);

    const skills           = detectRelevantSkills(text);
    setActiveSkills(skills);
    const { model: autoModel } = detectComplexity(text, skills);
    const modelToUse = forceModel ?? (
      MODEL_RANK[autoModel] >= MODEL_RANK[state.model] ? autoModel : state.model
    );
    const system = buildSystemPrompt({ skills, profile: state.profile, masterPrompt: MASTER_PROMPT });
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
          i === prev.length - 1 ? { role: m.role, content: m.content } : m
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
  }, [input, streaming, messages, state.profile, state.model, getApiKey, dispatch]);

  const handleKeyDown    = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleSuggestion = q => { setInput(q); textareaRef.current?.focus(); };

  const handleClear = () => {
    if (!window.confirm('Effacer la conversation ?')) return;
    setMessages([]); setActiveSkills([]);
    dispatch({ type: 'CLEAR_CHAT' });
    toast.success('Conversation effacée.');
  };

  const handleExport = () => {
    if (messages.length === 0) { toast.error('Aucun message à exporter.'); return; }
    const date = new Date().toISOString().slice(0, 10);
    const body = messages.map(m => `**${m.role === 'user' ? 'Vous' : 'Coach Fiscal'}**\n\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([`# Conversation Coach Fiscal — ${date}\n\n${body}`], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `conversation-fiscal-${date}.md` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Export téléchargé.');
  };

  if (!state.profile) return null;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Sidebar desktop ─────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-gray-100 bg-white overflow-hidden">
        <Sidebar onSelect={handleSuggestion} />
      </aside>

      {/* ── Sidebar mobile overlay ───────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-72 flex flex-col shadow-2xl">
            <Sidebar onSelect={handleSuggestion} onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* ── Zone chat principale ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50">

        {/* Header */}
        <div className="shrink-0 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 py-2.5 flex items-center gap-3">
          <button className="md:hidden text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)} aria-label="Suggestions">
            <Menu size={18} />
          </button>

          {/* Avatar */}
          <div className="w-8 h-8 rounded-xl bg-teal-gradient flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            CF
          </div>

          {/* Titre + skills */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-none">Coach Fiscal</p>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">
              {activeSkills.length > 0
                ? `Skills : ${activeSkills.join(' · ')}`
                : 'Expert fiscal IA · 7 skills disponibles'}
            </p>
          </div>

          {/* Toggle modèle */}
          <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50/80 p-0.5 gap-0.5 shrink-0">
            {[
              { key: 'sonnet', label: 'Sonnet', Icon: Zap,      activeClass: 'bg-teal-gradient text-white shadow-sm' },
              { key: 'opus',   label: 'Opus',   Icon: Sparkles, activeClass: 'bg-purple-600 text-white shadow-sm'    },
            ].map(({ key, label, Icon, activeClass }) => (
              <button key={key}
                onClick={() => dispatch({ type: 'SET_MODEL', payload: key })}
                title={`Modèle ${label}`}
                className={[
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-200',
                  state.model === key ? activeClass : 'text-gray-400 hover:text-gray-600',
                ].join(' ')}>
                <Icon size={10} /> {label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <button onClick={() => navigate('/profile')} title="Profil"
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft size={15} />
            </button>
            <button onClick={handleExport} title="Exporter"
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <Download size={15} />
            </button>
            <button onClick={handleClear} title="Effacer"
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 select-none">
              <div className="w-14 h-14 rounded-2xl bg-teal-gradient flex items-center justify-center text-2xl shadow-md">
                💬
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Posez votre première question</p>
                <p className="text-xs text-gray-400 mt-1.5 max-w-xs leading-relaxed">
                  Utilisez les suggestions à gauche ou tapez directement. Les skills fiscaux s&apos;activent automatiquement.
                </p>
              </div>
              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-2 justify-center mt-2 max-w-sm">
                {SUGGESTIONS[0].questions.slice(0, 2).map(q => (
                  <button key={q} onClick={() => handleSuggestion(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-teal-200 text-teal-600 hover:bg-teal-50 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 max-w-2xl mx-auto">
              {messages.map((msg, idx) => (
                <div key={idx}
                  className={`flex gap-3 items-end ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                  {/* Avatar */}
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-xl bg-teal-gradient flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-0.5 shadow-sm">
                      CF
                    </div>
                  )}
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-xl bg-gray-800 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-0.5">
                      U
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={[
                    'max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm',
                    msg.role === 'user'
                      ? 'bg-teal-gradient text-white rounded-br-sm'
                      : msg.error
                        ? 'bg-red-50 border border-red-200 text-red-700 rounded-bl-sm'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm',
                  ].join(' ')}>
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    ) : msg.streaming && msg.content === '' ? (
                      <TypingDots />
                    ) : (
                      <div className="prose-sm max-w-none">
                        <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                          {msg.content}
                        </Markdown>
                        {msg.streaming && (
                          <span className="inline-block w-0.5 h-3.5 bg-teal-400 ml-0.5 animate-pulse align-middle rounded-full" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Zone de saisie ────────────────────────────────────── */}
        <div className="shrink-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 px-4 pt-3 pb-4">
          <div className="max-w-2xl mx-auto flex flex-col gap-2">

            {/* Bannière Opus */}
            {inputComplexity?.model === 'opus' && input.trim() && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/80 px-4 py-3 flex flex-col gap-2.5">
                <div>
                  <p className="text-sm font-semibold text-purple-800">
                    🔮 Question complexe détectée
                  </p>
                  <p className="text-xs text-purple-600 mt-0.5 leading-relaxed">
                    Notre meilleur modèle sera utilisé.<br />
                    Coût estimé : ~0,05–0,10 $ sur votre crédit API.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={streaming}
                    className="px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    Envoyer quand même
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('sonnet')}
                    disabled={streaming}
                    className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                  >
                    Simplifier
                  </button>
                </div>
              </div>
            )}

            {/* Zone de saisie principale */}
            <div className="flex items-end gap-2 bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-2 focus-within:border-teal-300 focus-within:ring-2 focus-within:ring-teal-100 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question… (Entrée pour envoyer)"
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent text-sm focus:outline-none disabled:text-gray-400 leading-relaxed py-1.5"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || streaming}
                aria-label="Envoyer"
                className={[
                  'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200',
                  input.trim() && !streaming
                    ? 'bg-teal-gradient text-white shadow-sm hover:brightness-110'
                    : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {streaming
                  ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <Send size={14} />
                }
              </button>
            </div>

            {/* Ligne bas : disclaimer + indicateur de complexité */}
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                💡 Conseil indicatif — consultez un professionnel agréé.
              </p>
              {inputComplexity && (
                <span className={[
                  'text-[10px] font-semibold flex items-center gap-1 shrink-0 ml-2',
                  inputComplexity.model === 'haiku'  && 'text-gray-400',
                  inputComplexity.model === 'sonnet' && 'text-teal-600',
                  inputComplexity.model === 'opus'   && 'text-purple-600',
                ].filter(Boolean).join(' ')}>
                  {inputComplexity.model === 'haiku'  && '⚡ Haiku — Réponse rapide'}
                  {inputComplexity.model === 'sonnet' && '🧠 Sonnet — Analyse approfondie'}
                  {inputComplexity.model === 'opus'   && '🔮 Opus — Stratégie complexe'}
                </span>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
