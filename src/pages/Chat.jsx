import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate }  from 'react-router-dom';
import toast            from 'react-hot-toast';
import Markdown         from 'react-markdown';
import remarkGfm        from 'remark-gfm';
import { Send, Menu, X, Trash2, Download, ArrowLeft, Zap, Sparkles } from 'lucide-react';

import { useApp }              from '../context/AppContext';
import { chatWithClaude }      from '../lib/claudeApi';
import { detectRelevantSkills, buildSystemPrompt } from '../lib/skillRouter';
import { MASTER_PROMPT }       from '../data/masterPrompt';
import Button                  from '../components/Button';

// ─── Suggestions (module-level) ───────────────────────────────────────────────

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

// ─── Composants Markdown personnalisés ────────────────────────────────────────

const MD_COMPONENTS = {
  p:          ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul:         ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li:         ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  h1:         ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 text-gray-900">{children}</h1>,
  h2:         ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-3 text-gray-900">{children}</h2>,
  h3:         ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 text-gray-800">{children}</h3>,
  pre:        ({ children }) => <pre className="bg-gray-100 rounded-lg p-3 text-xs overflow-x-auto my-2 font-mono">{children}</pre>,
  code:       ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-teal-300 pl-3 text-gray-500 italic my-2">{children}</blockquote>,
  a:          ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-teal-600 underline hover:text-teal-700">{children}</a>,
};

// ─── Sidebar suggestions ──────────────────────────────────────────────────────

function Sidebar({ onSelect, onClose }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <span className="text-sm font-semibold text-gray-700">Suggestions</span>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 md:hidden" aria-label="Fermer">
            <X size={18} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {SUGGESTIONS.map(cat => (
          <div key={cat.category}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
              {cat.category}
            </p>
            <div className="space-y-1">
              {cat.questions.map(q => (
                <button
                  key={q}
                  onClick={() => { onSelect(q); onClose?.(); }}
                  className="w-full text-left text-sm text-gray-600 hover:text-teal-700 hover:bg-teal-50 px-2 py-1.5 rounded-lg transition-colors"
                >
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

// ─── Indicateur de frappe ─────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

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

  // ── Garde-fou : attend l'hydratation AppContext avant de vérifier le profil
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

  // ── Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  // ── Envoi du message ──────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      toast.error('Clé API manquante — configure-la dans Réglages.');
      return;
    }

    setInput('');

    const prevMessages = messages; // snapshot avant setState
    const userMsg  = { role: 'user',      content: text };
    const draftMsg = { role: 'assistant', content: '', streaming: true };
    setMessages(prev => [...prev, userMsg, draftMsg]);
    setStreaming(true);

    // Détection skills + system prompt
    const skills = detectRelevantSkills(text);
    setActiveSkills(skills);
    const system = buildSystemPrompt({
      userMessage:  text,
      profile:      state.profile,
      masterPrompt: MASTER_PROMPT,
    });

    // Historique propre pour l'API (pas de champs internes)
    const historyForApi = [
      ...prevMessages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    try {
      await chatWithClaude({
        apiKey,
        messages: historyForApi,
        system,
        model: state.model,
        onChunk: (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            const last    = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
            return updated;
          });
        },
      });

      // Marque le message final (supprime le flag streaming) et persiste
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
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: `❌ ${errText}`, error: true };
        dispatch({ type: 'SET_CHAT_HISTORY', payload: updated });
        return updated;
      });
      toast.error(errText);
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, state.profile, state.model, getApiKey, dispatch]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSuggestion = (q) => {
    setInput(q);
    textareaRef.current?.focus();
  };

  const handleClear = () => {
    if (!window.confirm('Effacer toute la conversation ? Cette action est irréversible.')) return;
    setMessages([]);
    setActiveSkills([]);
    dispatch({ type: 'CLEAR_CHAT' });
    toast.success('Conversation effacée.');
  };

  const handleExport = () => {
    if (messages.length === 0) { toast.error('Aucun message à exporter.'); return; }
    const date = new Date().toISOString().slice(0, 10);
    const body = messages
      .map(m => `**${m.role === 'user' ? 'Vous' : 'Coach Fiscal'}**\n\n${m.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([`# Conversation Coach Fiscal — ${date}\n\n${body}`], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `conversation-fiscal-${date}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Export téléchargé.');
  };

  if (!state.profile) return null;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Sidebar desktop ──────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-gray-100 bg-white overflow-hidden">
        <Sidebar onSelect={handleSuggestion} />
      </aside>

      {/* ── Sidebar mobile overlay ───────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-64 bg-white border-r border-gray-100 flex flex-col shadow-xl">
            <Sidebar onSelect={handleSuggestion} onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* ── Zone chat ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50">

        {/* Header */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            className="md:hidden text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir les suggestions"
          >
            <Menu size={20} />
          </button>

          <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            CF
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-none">Coach Fiscal expert</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Skills français actifs
              {activeSkills.length > 0 && ` · ${activeSkills.join(', ')}`}
            </p>
          </div>

          {/* Toggle mode économique / premium */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5 shrink-0">
            <button
              onClick={() => dispatch({ type: 'SET_MODEL', payload: 'sonnet' })}
              title="Mode économique — claude-sonnet-4-5"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                state.model !== 'opus'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Zap size={11} />
              Sonnet
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_MODEL', payload: 'opus' })}
              title="Mode premium — claude-opus-4-5"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                state.model === 'opus'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Sparkles size={11} />
              Opus
            </button>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => navigate('/profile')}
              title="Retour au profil"
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleExport}
              title="Exporter la conversation en .md"
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Download size={16} />
            </button>
            <button
              onClick={handleClear}
              title="Effacer la conversation"
              className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 select-none">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-2xl">
                💬
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Posez votre première question</p>
                <p className="text-xs text-gray-400 mt-1">
                  Utilisez les suggestions à gauche, ou tapez directement.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-2xl mx-auto">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                      CF
                    </div>
                  )}
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0 mt-0.5">
                      U
                    </div>
                  )}

                  <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white rounded-tr-sm'
                      : msg.error
                        ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-sm'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
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
                          <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-middle" />
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

        {/* Zone de saisie */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-4 pt-3 pb-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white disabled:bg-gray-50 disabled:text-gray-400 leading-relaxed"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
              />
              <Button
                variant="primary"
                size="md"
                loading={streaming}
                disabled={!input.trim()}
                onClick={handleSend}
                className="shrink-0 !h-[42px] !w-[42px] !p-0 rounded-xl"
                aria-label="Envoyer"
              >
                {!streaming && <Send size={16} />}
              </Button>
            </div>

            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-gray-400">
                💡 Conseil indicatif — pour les décisions importantes, consultez un professionnel agréé.
              </p>
              {activeSkills.length > 0 && (
                <p className="text-xs font-mono text-gray-300 ml-2 shrink-0">
                  {activeSkills.join(' · ')}
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
