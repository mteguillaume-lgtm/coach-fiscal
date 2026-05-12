import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckSquare, Square, Copy, Check, ExternalLink,
  HelpCircle, ArrowLeft, ArrowRight, AlertTriangle,
  Info, Sparkles, Trophy, Save,
} from 'lucide-react';

import { useApp } from '../context/AppContext';
import Button     from '../components/Button';

// ─── Constants ────────────────────────────────────────────────────────────────

const SAVE_KEY  = 'coachFiscal.declaration.done';
const VAL_KEY   = 'coachFiscal.declaration.vals';
const IMPOTS    = 'https://www.impots.gouv.fr';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtEur = n => n != null ? n.toLocaleString('fr-FR') + ' €' : null;

function parseProfile(p) {
  if (!p) return { hasCrypto: false, hasFoncier: false, hasPER: false };
  const num = rx => {
    const m = p.match(rx);
    if (!m) return null;
    const n = parseInt(m[1].replace(/[\s.]/g, ''), 10);
    return isNaN(n) ? null : n;
  };
  const flt = rx => {
    const m = p.match(rx);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  };
  return {
    // Cases fiscales
    sal1AJ:     num(/(?:case\s*1aj|1aj\s*:|\b1aj\b)[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i)
             || num(/net imposable[^€]{0,40}(\d[\d\s.]{1,10})\s*€/i),
    sal1BJ:     num(/(?:case\s*1bj|1bj\s*:|d[eé]clarant\s*2.*net imposable)[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i),
    pas8HV:     num(/(?:8hv|pas\s+d1|pas\s+pr[eé]lev)[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i)
             || num(/pr[eé]l[eè]vement[^€]{0,40}(\d[\d\s.]{1,10})\s*€/i),
    pas8IV:     num(/(?:8iv|pas\s+d2|pr[eé]l[eè]vement.*d2)[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i),
    foncier4BE: num(/(?:4be|loyers?\s+bruts?)[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i),
    per6QS:     num(/(?:6qs|pero|cotisations?\s+retraite\s+oblig)[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i),
    rni:        num(/rni[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i)
             || num(/revenu\s+net\s+imposable[^€]{0,30}(\d[\d\s.]{1,10})\s*€/i),
    tmi:        num(/tmi[^%\d]{0,20}(\d{1,2})\s*%/i),
    tauxPAS:    flt(/taux.*?pas[^%\d]{0,20}(\d+[,.]?\d*)\s*%/i),
    // Flags
    hasCrypto:  /crypto|bitcoin|ethereum|binance|kraken|coinbase|bybit|okx/i.test(p),
    hasFoncier: /loyer|foncier|4be|sci\b|fermage|indivision/i.test(p),
    hasPER:     /\bper[^s]|pero\b|6qs\b/i.test(p),
  };
}

// Barème IR simplifié 2025 (1 part fiscale, indicatif)
function computeIR(rni) {
  if (!rni || rni <= 0) return null;
  const SLICES = [
    [0,      11_497,   0    ],
    [11_497, 29_315,   0.11 ],
    [29_315, 83_823,   0.30 ],
    [83_823, 180_294,  0.41 ],
    [180_294, Infinity, 0.45],
  ];
  return Math.round(SLICES.reduce(
    (ir, [lo, hi, r]) => rni > lo ? ir + (Math.min(rni, hi) - lo) * r : ir, 0
  ));
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CF_CSS = `
  @keyframes cfdrop {
    0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
    100% { transform: translateY(110vh)  rotate(700deg); opacity: 0; }
  }
  .cfp { animation: cfdrop linear forwards; position: absolute; top: 0; }
`;
const CF_COLORS = ['#0d9488','#3b82f6','#f97316','#8b5cf6','#ec4899','#fbbf24','#10b981'];
const CF_PARTS  = Array.from({ length: 72 }, (_, i) => ({
  id: i,
  x:    `${2 + (i / 72) * 96}%`,
  del:  `${(i / 72) * 1.8}s`,
  dur:  `${2.2 + (i % 4) * 0.4}s`,
  col:  CF_COLORS[i % CF_COLORS.length],
  size: 5 + (i % 4) * 3,
  circ: i % 5 === 0,
}));

function Confetti({ active }) {
  if (!active) return null;
  return (
    <>
      <style>{CF_CSS}</style>
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
        {CF_PARTS.map(p => (
          <div key={p.id} className="cfp"
            style={{ left: p.x, width: p.size, height: p.size, background: p.col,
              borderRadius: p.circ ? '50%' : '2px',
              animationDelay: p.del, animationDuration: p.dur }} />
        ))}
      </div>
    </>
  );
}

// ─── CaseField ────────────────────────────────────────────────────────────────

function CaseField({ fieldId, caseNum, label, extracted, manualVal, onManualChange, isDone, onToggle, warning, info, chatQ }) {
  const navigate     = useNavigate();
  const [copied, setCopied] = useState(false);
  const copyText = extracted != null ? String(extracted) : (manualVal || '');

  const handleCopy = () => {
    if (!copyText) { toast.error('Aucune valeur à copier'); return; }
    navigator.clipboard.writeText(copyText)
      .then(() => {
        setCopied(true);
        toast.success(`Case ${caseNum} copiée dans le presse-papiers`);
        setTimeout(() => setCopied(false), 2200);
      })
      .catch(() => toast.error('Copie impossible'));
  };

  return (
    <div className={`rounded-2xl border p-4 transition-all duration-200 ${
      isDone ? 'border-teal-200 bg-teal-50/25 opacity-80' : 'border-gray-200 bg-white shadow-sm'
    }`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            📋 Case {caseNum}
          </span>
          {extracted != null && (
            <span className="text-[9px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-full">
              Extrait du profil
            </span>
          )}
        </div>
        <button onClick={() => onToggle(fieldId)} aria-label={isDone ? 'Annuler' : 'Marquer comme fait'}
          className={`shrink-0 transition-colors ${isDone ? 'text-teal-500' : 'text-gray-300 hover:text-gray-400'}`}>
          {isDone ? <CheckSquare size={22} className="text-teal-500" /> : <Square size={22} />}
        </button>
      </div>

      {/* Label */}
      <p className={`text-sm font-semibold mb-3 ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
        {label}
      </p>

      {/* Value */}
      {extracted != null ? (
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 mb-3">
          <span className="text-2xl font-bold text-teal-700 font-mono tabular-nums flex-1">
            {fmtEur(extracted)}
          </span>
          <button onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              copied ? 'bg-teal-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300 hover:text-teal-600'
            }`}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      ) : (
        <div className="mb-3">
          <input type="text" placeholder="Saisir la valeur en €…"
            value={manualVal || ''}
            onChange={e => onManualChange(fieldId, e.target.value)}
            className="w-full text-xl font-bold font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100 placeholder:text-gray-300 placeholder:font-normal placeholder:text-sm"
          />
          <div className="flex items-center justify-between mt-1 px-1">
            <p className="text-[10px] text-gray-400">Non trouvé dans le profil — saisie manuelle</p>
            {manualVal && (
              <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700">
                <Copy size={10} /> Copier
              </button>
            )}
          </div>
        </div>
      )}

      {/* Warning */}
      {warning && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-2 leading-relaxed">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {warning}
        </div>
      )}

      {/* Info */}
      {info && (
        <div className="flex items-start gap-2 text-xs text-gray-500 mb-2 leading-relaxed">
          <Info size={12} className="shrink-0 mt-0.5 text-gray-400" /> {info}
        </div>
      )}

      {/* Chat link */}
      {chatQ && (
        <button
          onClick={() => navigate('/chat', { state: { prefill: chatQ } })}
          className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50 px-2 py-1.5 rounded-lg transition-colors -ml-1"
        >
          <HelpCircle size={12} /> Pourquoi cette valeur ?
        </button>
      )}
    </div>
  );
}

// ─── Pré-déclaration items ────────────────────────────────────────────────────

const PRE_ITEMS = [
  { id: 'pre_1', text: 'Numéro fiscal et mot de passe impots.gouv.fr prêts' },
  { id: 'pre_2', text: 'Bulletins de paie de décembre 2024 à portée de main' },
  { id: 'pre_3', text: 'IFU (Imprimé Fiscal Unique) reçu de votre banque / courtier' },
  { id: 'pre_4', text: 'Attestations fiscales PERO / PER reçues de votre employeur' },
  { id: 'pre_5', text: 'Relevés de tout compte à l\'étranger (Revolut, exchanges crypto…)' },
];

// ─── Stepper config ───────────────────────────────────────────────────────────

const makeSteps = (parsed, mode) => [
  { id: 'intro',     icon: '🚀', title: 'Introduction',     itemIds: PRE_ITEMS.map(i => i.id), show: true              },
  { id: 's1aj',      icon: '💼', title: 'Salaires D1',      itemIds: ['done_1aj'],               show: true              },
  { id: 's1bj',      icon: '👥', title: 'Salaires D2',      itemIds: ['done_1bj'],               show: mode === 'couple' },
  { id: 's_pas',     icon: '🏦', title: 'Prélèvement PAS',  itemIds: mode === 'couple' ? ['done_8hv','done_8iv'] : ['done_8hv'], show: true },
  { id: 's_foncier', icon: '🏠', title: 'Revenus fonciers', itemIds: ['done_4be'],               show: parsed.hasFoncier },
  { id: 's_per',     icon: '🏛️', title: 'PER / PERO',       itemIds: ['done_6qs'],               show: parsed.hasPER     },
  { id: 's_crypto',  icon: '🌍', title: 'Comptes étrangers', itemIds: ['done_3916bis'],           show: parsed.hasCrypto  },
  { id: 's_recap',   icon: '📊', title: 'Récapitulatif',    itemIds: ['done_submit'],             show: true              },
].filter(s => s.show);

// ─── Stepper sidebar ──────────────────────────────────────────────────────────

function StepperSidebar({ steps, current, doneItems, onSelect }) {
  return (
    <nav className="flex flex-col gap-0">
      {steps.map((step, idx) => {
        const allDone  = step.itemIds.every(id => doneItems.has(id));
        const anyDone  = step.itemIds.some(id => doneItems.has(id));
        const isCur    = idx === current;
        const isLast   = idx === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-3">
            {/* Ligne + dot */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => onSelect(idx)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                  allDone  ? 'bg-teal-500 text-white shadow-sm'
                  : isCur  ? 'bg-teal-gradient text-white shadow-md ring-2 ring-teal-200'
                  : anyDone? 'bg-teal-100 text-teal-600'
                  :          'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
                aria-current={isCur ? 'step' : undefined}
              >
                {allDone ? <Check size={14} /> : step.icon}
              </button>
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[20px] mt-1 mb-1 rounded-full transition-colors ${
                  allDone ? 'bg-teal-300' : 'bg-gray-100'
                }`} />
              )}
            </div>

            {/* Label */}
            <div className="pb-5 pt-1 min-w-0">
              <p className={`text-xs font-semibold leading-tight truncate ${
                isCur    ? 'text-teal-700'
                : allDone ? 'text-teal-500'
                :           'text-gray-400'
              }`}>
                {step.title}
              </p>
              {isCur && (
                <p className="text-[10px] text-gray-400 mt-0.5">En cours</p>
              )}
              {allDone && !isCur && (
                <p className="text-[10px] text-teal-400 mt-0.5">Terminé</p>
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ─── Step contents ────────────────────────────────────────────────────────────

function StepIntro({ doneItems, onToggle }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold text-blue-900">
          Ouvrez impots.gouv.fr dans un onglet séparé
        </p>
        <p className="text-xs text-blue-700 leading-relaxed">
          Gardez cette app à côté d'impots.gouv.fr pour suivre les instructions case par case.
          Les valeurs à saisir sont extraites automatiquement de votre profil.
        </p>
        <a
          href={IMPOTS}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl transition-colors w-fit"
        >
          <ExternalLink size={14} />
          Ouvrir impots.gouv.fr →
        </a>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
          Checklist pré-déclaration
        </p>
        <div className="flex flex-col gap-2">
          {PRE_ITEMS.map(item => {
            const done = doneItems.has(item.id);
            return (
              <label key={item.id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                  done ? 'border-teal-100 bg-teal-50/30' : 'border-gray-100 bg-white hover:bg-gray-50/50'
                }`}
              >
                <div className={`shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                  done ? 'bg-teal-500 border-teal-500' : 'border-gray-300'
                }`}>
                  {done && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <input type="checkbox" className="sr-only" checked={done} onChange={() => onToggle(item.id)} />
                <span className={`text-sm leading-relaxed ${done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                  {item.text}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Step1AJ({ parsed, doneItems, manualValues, onToggle, onManual }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        Sur impots.gouv.fr → <strong>Déclaration de revenus → Formulaire 2042</strong> → rubrique "Salaires".
        Le préremplissage devrait déjà afficher un montant.
      </div>
      <CaseField
        fieldId="done_1aj"
        caseNum="1AJ"
        label="Salaires nets imposables — Déclarant 1 (cumul annuel)"
        extracted={parsed.sal1AJ}
        manualVal={manualValues['done_1aj']}
        onManualChange={onManual}
        isDone={doneItems.has('done_1aj')}
        onToggle={onToggle}
        warning="Vérifiez que le préremplissage affiche bien ce montant. Si différent → corrigez manuellement avec le cumul de votre dernier bulletin de décembre."
        info="Source : bulletin de salaire décembre 2024, ligne « Cumul net imposable ». Si plusieurs employeurs : additionnez les cumuls de chacun."
        chatQ={parsed.sal1AJ
          ? `Ma case 1AJ est préremplie avec un montant différent de ${parsed.sal1AJ?.toLocaleString('fr-FR')} € trouvé dans mon profil. Laquelle est la bonne valeur et comment vérifier ?`
          : `Comment trouver le montant exact à saisir en case 1AJ (salaires nets imposables) sur mon bulletin de paie de décembre ?`}
      />
    </div>
  );
}

function Step1BJ({ parsed, doneItems, manualValues, onToggle, onManual }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        Même section que la case 1AJ, mais pour le <strong>Déclarant 2</strong>.
        Si D2 a eu plusieurs employeurs, additionnez tous les cumuls.
      </div>
      <CaseField
        fieldId="done_1bj"
        caseNum="1BJ"
        label="Salaires nets imposables — Déclarant 2 (cumul annuel)"
        extracted={parsed.sal1BJ}
        manualVal={manualValues['done_1bj']}
        onManualChange={onManual}
        isDone={doneItems.has('done_1bj')}
        onToggle={onToggle}
        warning={parsed.sal1BJ == null ? 'Valeur non détectée dans le profil — saisissez manuellement le cumul net imposable de décembre de D2.' : undefined}
        info="Source : bulletin de paie décembre D2. En cas de changement d'employeur, prenez le total des deux cumuls."
        chatQ="Comment vérifier la case 1BJ si le déclarant 2 a changé d'employeur en 2024 et que le préremplissage semble incomplet ?"
      />
    </div>
  );
}

function StepPAS({ parsed, mode, doneItems, manualValues, onToggle, onManual }) {
  const pasPasFaible = parsed.tmi != null && parsed.tauxPAS != null && parsed.tauxPAS < parsed.tmi - 4;
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        Sur impots.gouv.fr → <strong>Formulaire 2042 → Prélèvement à la source</strong>.
        Ces montants sont normalement préremplis par votre employeur.
      </div>
      {pasPasFaible && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 leading-relaxed">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            Votre taux PAS ({parsed.tauxPAS} %) semble inférieur à votre TMI ({parsed.tmi} %).
            Un solde à payer en septembre est probable — envisagez d'augmenter votre taux sur impots.gouv maintenant.
          </span>
        </div>
      )}
      <CaseField
        fieldId="done_8hv"
        caseNum="8HV"
        label="Prélèvement à la source prélevé — Déclarant 1"
        extracted={parsed.pas8HV}
        manualVal={manualValues['done_8hv']}
        onManualChange={onManual}
        isDone={doneItems.has('done_8hv')}
        onToggle={onToggle}
        warning="Si vous avez eu plusieurs employeurs en 2024, additionnez le PAS de chacun et vérifiez que la case 8HV correspond bien au total."
        info="Source : bulletin de paie décembre, ligne « Cumul PAS » ou « Prélèvement à la source prélevé »."
        chatQ="Comment vérifier que la case 8HV (PAS prélevé D1) est correcte si j'ai eu plusieurs employeurs en 2024 ?"
      />
      {mode === 'couple' && (
        <CaseField
          fieldId="done_8iv"
          caseNum="8IV"
          label="Prélèvement à la source prélevé — Déclarant 2"
          extracted={parsed.pas8IV}
          manualVal={manualValues['done_8iv']}
          onManualChange={onManual}
          isDone={doneItems.has('done_8iv')}
          onToggle={onToggle}
          warning="Risque d'oubli si D2 a changé d'employeur : le préremplissage peut n'afficher que le PAS du dernier employeur."
          chatQ="La case 8IV de mon conjoint semble incomplète car il/elle a eu 2 employeurs en 2024, comment corriger ?"
        />
      )}
    </div>
  );
}

function StepFoncier({ parsed, doneItems, manualValues, onToggle, onManual }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        Sur impots.gouv.fr → <strong>Formulaire 2042 → Revenus fonciers</strong>.
        Reportez vos loyers bruts annuels — l'administration applique automatiquement l'abattement de 30 %.
      </div>
      <CaseField
        fieldId="done_4be"
        caseNum="4BE"
        label="Revenus fonciers bruts — Micro-foncier (loyers bruts annuels)"
        extracted={parsed.foncier4BE}
        manualVal={manualValues['done_4be']}
        onManualChange={onManual}
        isDone={doneItems.has('done_4be')}
        onToggle={onToggle}
        info="Le régime micro-foncier s'applique si vos loyers bruts < 15 000 €. L'abattement de 30 % est appliqué automatiquement — ne déduisez pas les charges vous-même. Si vos charges réelles > 30 %, le régime réel (formulaire 2044) peut être plus avantageux."
        chatQ={`Mes loyers bruts annuels sont de ${parsed.foncier4BE != null ? fmtEur(parsed.foncier4BE) : 'X €'} en 2024. Est-ce que le micro-foncier (case 4BE) est plus avantageux que le régime réel, et comment choisir ?`}
      />
    </div>
  );
}

function StepPER({ parsed, doneItems, manualValues, onToggle, onManual }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        Sur impots.gouv.fr → <strong>Formulaire 2042 → Charges déductibles → Retraite</strong>.
        Reportez le montant figurant sur l'attestation fiscale annuelle de votre employeur (envoyée en mars-avril).
      </div>
      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 leading-relaxed">
        <Info size={13} className="shrink-0 mt-0.5" />
        Attestation fiscale PERO : si vous ne l'avez pas encore reçue, contactez votre service RH ou votre gestionnaire de fonds.
      </div>
      <CaseField
        fieldId="done_6qs"
        caseNum="6QS"
        label="Cotisations PERO obligatoires — Déclarant 1 (attestation fiscale)"
        extracted={parsed.per6QS}
        manualVal={manualValues['done_6qs']}
        onManualChange={onManual}
        isDone={doneItems.has('done_6qs')}
        onToggle={onToggle}
        warning="Ce montant doit correspondre exactement à l'attestation fiscale de votre employeur, et non aux sommes que vous pensez avoir versées."
        info="Si vous avez un PERO avec part salariale et part patronale, seule la part salariale est déductible en 6QS. La part patronale est indiquée en 6QT."
        chatQ="Comment remplir les cases 6QS / 6QT / 6QU pour mon PERO obligatoire et où trouver l'attestation fiscale auprès de mon employeur ?"
      />
    </div>
  );
}

function StepCrypto({ doneItems, onToggle }) {
  const done = doneItems.has('done_3916bis');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4">
        <AlertTriangle size={18} className="shrink-0 text-red-500 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-700 mb-1">Obligation déclarative — pénalité 1 500 € par oubli</p>
          <p className="text-xs text-red-600 leading-relaxed">
            Tout compte ou portefeuille sur un exchange <strong>non établi en France</strong> (Binance, Kraken,
            Coinbase, Bybit, OKX, Bitpanda…) doit être déclaré via le <strong>formulaire 3916 bis</strong>,
            même sans cession taxable en 2024. L'obligation s'applique à tout compte ouvert, détenu ou clôturé à un moment quelconque en 2024.
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        Sur impots.gouv.fr → <strong>Déclaration → Annexes → Formulaire 3916 bis</strong> → ajoutez un formulaire par exchange.
        Informations requises : nom de l'exchange, adresse, numéro de compte / identifiant, date d'ouverture.
      </div>

      <label className={`flex items-start gap-3 rounded-2xl border px-4 py-4 cursor-pointer transition-all ${
        done ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200 bg-white hover:bg-gray-50/50 shadow-sm'
      }`}>
        <div className={`shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          done ? 'bg-teal-500 border-teal-500' : 'border-gray-300'
        }`}>
          {done && (
            <svg viewBox="0 0 10 8" className="w-3 h-3">
              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <input type="checkbox" className="sr-only" checked={done} onChange={() => onToggle('done_3916bis')} />
        <div>
          <p className={`text-sm font-semibold ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
            ✅ J'ai déclaré tous mes exchanges via le formulaire 3916 bis
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Un formulaire séparé par exchange (Binance, Kraken, Coinbase…)
          </p>
        </div>
      </label>
    </div>
  );
}

function StepRecap({ parsed, mode, doneItems, onToggle, onShowConfetti }) {
  const pasTotal = (parsed.pas8HV || 0) + (mode === 'couple' ? (parsed.pas8IV || 0) : 0);
  const irBrut   = computeIR(parsed.rni);
  const solde    = irBrut != null && pasTotal > 0 ? irBrut - pasTotal : null;
  const rembours = solde != null && solde < 0;

  const items = [
    { label: 'RNI foyer (base de calcul)',        value: fmtEur(parsed.rni),   note: '1 part fiscale — indicatif' },
    { label: 'IR brut calculé (estimation)',       value: fmtEur(irBrut),       note: 'Barème progressif simplifié' },
    { label: 'PAS total prélevé en 2024',         value: fmtEur(pasTotal || null), note: '8HV' + (mode === 'couple' ? ' + 8IV' : '') },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Summary table */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Récapitulatif estimé</p>
        </div>
        <div className="divide-y divide-gray-50">
          {items.map(({ label, value, note }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3 gap-3">
              <div>
                <p className="text-sm text-gray-700">{label}</p>
                {note && <p className="text-[10px] text-gray-400">{note}</p>}
              </div>
              <span className="text-sm font-bold font-mono tabular-nums text-gray-800 shrink-0">
                {value || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Solde */}
      {solde != null && (
        <div className={`rounded-2xl border p-5 flex items-center gap-4 ${
          rembours ? 'border-teal-200 bg-teal-50/50' : 'border-amber-200 bg-amber-50/50'
        }`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
            rembours ? 'bg-teal-100' : 'bg-amber-100'
          }`}>
            {rembours ? '💰' : '⚠️'}
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold ${rembours ? 'text-teal-700' : 'text-amber-700'}`}>
              {rembours
                ? `Remboursement estimé : ${fmtEur(Math.abs(solde))}`
                : `Supplément estimé : ${fmtEur(solde)}`}
            </p>
            <p className={`text-xs mt-0.5 leading-relaxed ${rembours ? 'text-teal-600' : 'text-amber-600'}`}>
              {rembours
                ? 'Versement attendu en juillet-septembre après traitement de votre déclaration. Vérifiez que votre RIB est à jour sur impots.gouv.'
                : 'Ce montant sera prélevé progressivement via votre PAS à partir de septembre 2025. Vérifiez votre taux de PAS.'}
            </p>
          </div>
        </div>
      )}

      {solde == null && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-600 leading-relaxed">
          <Info size={12} className="inline mr-1.5" />
          Complétez les étapes précédentes pour obtenir une estimation du solde IR.
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        Estimation indicative basée sur 1 part fiscale. Le montant exact dépend du quotient familial,
        des réductions d'impôt et du calcul officiel de l'administration.
      </p>

      {/* Done button */}
      <div className={`rounded-2xl border p-4 transition-all ${
        doneItems.has('done_submit') ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200 bg-white shadow-sm'
      }`}>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
            doneItems.has('done_submit') ? 'bg-teal-500 border-teal-500' : 'border-gray-300 hover:border-teal-300'
          }`}>
            {doneItems.has('done_submit') && (
              <svg viewBox="0 0 10 8" className="w-3 h-3">
                <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <input type="checkbox" className="sr-only" checked={doneItems.has('done_submit')}
            onChange={() => onToggle('done_submit')} />
          <span className={`text-sm font-semibold ${doneItems.has('done_submit') ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
            J'ai soumis ma déclaration sur impots.gouv.fr
          </span>
        </label>
      </div>

      {doneItems.has('done_submit') && (
        <div className="flex justify-center">
          <button
            onClick={onShowConfetti}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-teal-gradient text-white font-bold text-sm shadow-lg hover:brightness-110 transition-all active:scale-95"
          >
            <Trophy size={18} />
            🎉 Déclaration terminée !
            <Sparkles size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeclarationGuide() {
  const { state }  = useApp();
  const navigate   = useNavigate();

  const parsed = useMemo(() => parseProfile(state.profile), [state.profile]);
  const mode   = state.mode || 'solo';

  const steps  = useMemo(() => makeSteps(parsed, mode), [parsed, mode]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const [doneItems, setDoneItems] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(SAVE_KEY) || '[]')); }
    catch { return new Set(); }
  });

  const [manualValues, setManualValues] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VAL_KEY) || '{}'); }
    catch { return {}; }
  });

  // Persist done items
  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify([...doneItems])); }
    catch { /* ignore */ }
  }, [doneItems]);

  // Persist manual values
  useEffect(() => {
    try { localStorage.setItem(VAL_KEY, JSON.stringify(manualValues)); }
    catch { /* ignore */ }
  }, [manualValues]);

  // Auto-hide confetti
  useEffect(() => {
    if (!showConfetti) return;
    const t = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(t);
  }, [showConfetti]);

  const onToggle = useCallback((id) => {
    setDoneItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const onManual = useCallback((id, val) => {
    setManualValues(prev => ({ ...prev, [id]: val }));
  }, []);

  const handleSave = () => toast.success('Progression sauvegardée automatiquement.');

  // Progress
  const allItemIds  = useMemo(() => steps.flatMap(s => s.itemIds), [steps]);
  const doneCount   = allItemIds.filter(id => doneItems.has(id)).length;
  const pct         = allItemIds.length > 0 ? Math.round((doneCount / allItemIds.length) * 100) : 0;

  const currentStep = steps[currentIdx];
  const canNext     = currentIdx < steps.length - 1;
  const canPrev     = currentIdx > 0;

  const stepProps = {
    parsed, mode, doneItems, manualValues,
    onToggle, onManual,
    onShowConfetti: () => setShowConfetti(true),
  };

  function renderStepContent(step) {
    switch (step.id) {
      case 'intro':     return <StepIntro     {...stepProps} />;
      case 's1aj':      return <Step1AJ       {...stepProps} />;
      case 's1bj':      return <Step1BJ       {...stepProps} />;
      case 's_pas':     return <StepPAS       {...stepProps} />;
      case 's_foncier': return <StepFoncier   {...stepProps} />;
      case 's_per':     return <StepPER       {...stepProps} />;
      case 's_crypto':  return <StepCrypto    {...stepProps} />;
      case 's_recap':   return <StepRecap     {...stepProps} />;
      default:          return null;
    }
  }

  return (
    <>
      <Confetti active={showConfetti} />

      <div className="flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Wizard déclaration</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Guide déclaration 2025</h1>
            <p className="text-sm text-gray-500 mt-1">
              Saisissez les valeurs case par case sur impots.gouv.fr en parallèle.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={handleSave}>
              <Save size={13} /> Sauvegarder
            </Button>
            <a href={IMPOTS} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm">
                <ExternalLink size={13} /> impots.gouv
              </Button>
            </a>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progression</span>
            <span className={`text-xs font-bold font-mono ${pct === 100 ? 'text-teal-600' : 'text-gray-600'}`}>
              {doneCount} / {allItemIds.length} points
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-gradient transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {pct === 100 && (
            <p className="text-xs text-teal-600 font-semibold mt-2 flex items-center gap-1">
              <Trophy size={12} /> Tous les points traités — votre déclaration est complète !
            </p>
          )}
        </div>

        {/* Banner profil manquant */}
        {!state.profile && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-700 leading-relaxed flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              Aucun profil généré — les valeurs ne seront pas pré-remplies.{' '}
              <button onClick={() => navigate('/collect')} className="underline font-semibold">
                Générer mon profil →
              </button>
            </span>
          </div>
        )}

        {/* Layout principal */}
        <div className="flex flex-col sm:flex-row gap-6">

          {/* Stepper vertical */}
          <aside className="sm:w-44 shrink-0">
            {/* Mobile : indicateur compact */}
            <div className="sm:hidden mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">
                Étape {currentIdx + 1} / {steps.length}
              </span>
              <span className="text-xs text-teal-600 font-semibold">{currentStep.icon} {currentStep.title}</span>
            </div>
            <div className="hidden sm:block">
              <StepperSidebar
                steps={steps}
                current={currentIdx}
                doneItems={doneItems}
                onSelect={setCurrentIdx}
              />
            </div>
          </aside>

          {/* Contenu de l'étape */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Step header */}
            <div className="flex items-center gap-2">
              <span className="text-xl">{currentStep.icon}</span>
              <h2 className="text-lg font-bold text-gray-900">{currentStep.title}</h2>
              <span className="text-xs text-gray-400 font-mono ml-1">
                {currentStep.itemIds.filter(id => doneItems.has(id)).length} / {currentStep.itemIds.length}
              </span>
            </div>

            {/* Step content */}
            {renderStepContent(currentStep)}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canPrev}
                onClick={() => setCurrentIdx(i => i - 1)}
              >
                <ArrowLeft size={14} /> Précédent
              </Button>
              <span className="text-xs text-gray-400 font-mono">{currentIdx + 1} / {steps.length}</span>
              <Button
                variant={canNext ? 'primary' : 'ghost'}
                size="sm"
                disabled={!canNext}
                onClick={() => setCurrentIdx(i => i + 1)}
              >
                Suivant <ArrowRight size={14} />
              </Button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
