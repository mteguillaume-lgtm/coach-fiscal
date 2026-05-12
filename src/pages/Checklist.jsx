import { useState, useMemo, useEffect } from 'react';
import { useNavigate }  from 'react-router-dom';
import toast            from 'react-hot-toast';
import {
  ChevronDown, ChevronRight, CheckSquare, Square, ClipboardList,
  MessageCircle, Download, RotateCcw, Copy, ExternalLink, Filter,
  AlertCircle, AlertTriangle, Info, Sparkles,
} from 'lucide-react';

import { useApp } from '../context/AppContext';
import Button     from '../components/Button';
import {
  QUESTIONNAIRE_GROUPS,
  generateChecklist,
  extractProfileData,
  extractValues,
} from '../lib/checklistGenerator';

const STORAGE_KEY = 'coachFiscal.checklist';

// ─── Priorité config ───────────────────────────────────────────────────────────

const PRIORITE_CONFIG = {
  critique:  { label: 'Critique',  Icon: AlertCircle,   color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200',   badge: 'bg-red-100 text-red-700'   },
  attention: { label: 'Attention', Icon: AlertTriangle, color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700'},
  info:      { label: 'Info',      Icon: Info,          color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200',  badge: 'bg-blue-100 text-blue-700'  },
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
        ? 'border-gray-100 bg-gray-50/50 opacity-60'
        : `${cfg.border} bg-white shadow-sm`,
    ].join(' ')}>

      {/* Ligne principale */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          className={`shrink-0 mt-0.5 transition-colors ${done ? 'text-teal-500' : 'text-gray-300 hover:text-gray-400'}`}
          aria-label={done ? 'Marquer comme non traité' : 'Marquer comme traité'}
        >
          {done
            ? <CheckSquare size={18} className="text-teal-500" />
            : <Square size={18} />
          }
        </button>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {/* Badge priorité */}
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.badge}`}>
              <cfg.Icon size={10} />
              {cfg.label}
            </span>
            {/* Badge case */}
            {item.case && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                Case {item.case}
              </span>
            )}
          </div>

          <p className={`text-sm font-semibold mt-1.5 ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {item.titre}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>

          {/* Valeur extraite du profil */}
          {valeur && !done && (
            <div className="mt-2 flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
              <span className="text-xs text-gray-500">Valeur attendue :</span>
              <span className="text-sm font-bold text-teal-700 font-mono">{valeur} €</span>
              <button
                type="button"
                onClick={handleCopy}
                className="ml-auto text-teal-400 hover:text-teal-600 transition-colors"
                title="Copier la valeur"
              >
                <Copy size={13} />
              </button>
            </div>
          )}

          {/* Accordéon détail */}
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {open ? 'Réduire' : 'En savoir plus'}
          </button>

          {open && (
            <div className={`mt-2 text-xs text-gray-600 leading-relaxed p-3 rounded-xl ${cfg.bg} border ${cfg.border}`}>
              {item.detail}
              {item.lienImpots && (
                <a
                  href={item.lienImpots}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-1 text-teal-600 hover:text-teal-700 font-medium"
                >
                  <ExternalLink size={11} /> impots.gouv.fr
                </a>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {!done && (
          <button
            type="button"
            onClick={() => onChat(item.questionChat)}
            title="Discuter avec Claude"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-teal-600 hover:bg-teal-50 transition-colors"
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
      <div>
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Checklist fiscale 2026</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Personnalisez votre checklist</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cochez les situations qui vous concernent en 2025 pour n'afficher que les points pertinents.
        </p>
      </div>

      {/* Groupes de questions */}
      {QUESTIONNAIRE_GROUPS.map(group => (
        <div key={group.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{group.label}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {group.items.map(item => (
              <label
                key={item.id}
                className="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50/60 transition-colors"
              >
                <div className={[
                  'shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                  answers.has(item.id)
                    ? 'bg-teal-500 border-teal-500'
                    : 'border-gray-300 bg-white',
                ].join(' ')}>
                  {answers.has(item.id) && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <input type="checkbox" className="sr-only" checked={answers.has(item.id)} onChange={() => toggle(item.id)} />
                <span className={`text-sm leading-relaxed ${answers.has(item.id) ? 'text-gray-800 font-medium' : 'text-gray-600'}`}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Button
          size="lg"
          className="w-full sm:w-auto !rounded-2xl"
          onClick={() => onGenerate(answers)}
        >
          <Sparkles size={16} />
          Générer ma checklist ({totalChecked} situation{totalChecked > 1 ? 's' : ''} sélectionnée{totalChecked > 1 ? 's' : ''}) →
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Passer et voir la checklist complète
        </button>
      </div>

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Checklist fiscale 2026</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Ma checklist fiscale</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalItems} points à vérifier · {critiques} critique{critiques > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download size={13} /> Exporter
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw size={13} /> Modifier
          </Button>
        </div>
      </div>

      {/* Barre de progression */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">Points traités</span>
          <span className={`text-xs font-bold font-mono ${pct === 100 ? 'text-teal-600' : 'text-gray-600'}`}>
            {totalDone} / {totalItems}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-teal-gradient transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && (
          <p className="text-xs text-teal-600 font-medium mt-2 flex items-center gap-1">
            ✓ Tous les points ont été vérifiés — bravo !
          </p>
        )}
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-2xl overflow-x-auto">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={[
              'flex-1 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200',
              filter === tab.id
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
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
              <span className="text-xs text-gray-400 font-mono ml-1">{doneInGroup}/{list.length}</span>
              <ChevronDown size={13} className={`text-gray-400 ml-auto transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
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
      <Questionnaire
        initialAnswers={answers}
        onGenerate={handleGenerate}
        onSkip={handleSkip}
      />
    );
  }

  return (
    <ChecklistView
      items={items}
      extractedValues={extractedValues}
      onReset={handleReset}
      onChat={handleChat}
    />
  );
}
