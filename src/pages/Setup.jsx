import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ExternalLink, AlertTriangle, CheckCircle, ArrowLeft, Key, User, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';

const API_CONSOLE_URL = 'https://console.anthropic.com/settings/keys';

function isValidKey(k) {
  return typeof k === 'string' && k.startsWith('sk-ant-') && k.length > 20;
}

const MODES = [
  { value: 'solo',   label: 'Célibataire',  sub: 'Une déclaration',  Icon: User  },
  { value: 'couple', label: 'Couple',        sub: 'PACS ou mariage',  Icon: Users },
];

export default function Setup() {
  const navigate = useNavigate();
  const { state, dispatch, getApiKey, setApiKey } = useApp();

  const [apiKey, setLocalApiKey] = useState('');
  const [mode,   setMode]        = useState(state.mode ?? 'solo');
  const [showKey, setShowKey]    = useState(false);
  const [touched, setTouched]    = useState(false);

  useEffect(() => {
    const stored = getApiKey();
    if (stored) setLocalApiKey(stored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid     = isValidKey(apiKey);
  const showError = touched && apiKey.length > 0 && !valid;

  function handleContinue() {
    if (!valid) return;
    setApiKey(apiKey);
    dispatch({ type: 'SET_MODE', payload: mode });
    navigate('/anonymize');
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape 0 / 4</span>
        <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
        <p className="text-sm text-gray-500">Clé API et situation du foyer en 1 minute.</p>
      </div>

      {/* ── Clé API ─────────────────────────────────────────────── */}
      <div className={[
        'rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-200',
        valid
          ? 'border-teal-200 bg-teal-50/30 shadow-sm'
          : 'border-gray-100 bg-white shadow-sm',
      ].join(' ')}>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={[
              'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
              valid ? 'bg-teal-gradient text-white' : 'bg-gray-100 text-gray-400',
            ].join(' ')}>
              <Key size={16} aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">Clé API Anthropic</p>
              <p className="text-xs text-gray-400 mt-0.5">Étape 4 uniquement · jamais partagée</p>
            </div>
          </div>
          <a
            href={API_CONSOLE_URL}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors mt-1"
          >
            Obtenir <ExternalLink size={11} aria-hidden="true" />
          </a>
        </div>

        {/* Input */}
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder="sk-ant-api03-..."
            autoComplete="off"
            spellCheck={false}
            onChange={e => { setLocalApiKey(e.target.value); setTouched(true); }}
            onBlur={() => setTouched(true)}
            className={[
              'w-full pr-10 pl-4 py-3 text-sm border rounded-xl bg-white',
              'focus:outline-none focus:ring-2 focus:ring-offset-0',
              'font-mono placeholder:font-sans placeholder:text-gray-300 transition-all',
              showError  ? 'border-red-300 focus:ring-red-300/50' : '',
              valid      ? 'border-teal-300 focus:ring-teal-300/50' : '',
              !showError && !valid ? 'border-gray-200 focus:ring-teal-300/50' : '',
            ].join(' ')}
          />
          <button
            type="button"
            aria-label={showKey ? 'Masquer' : 'Afficher'}
            onClick={() => setShowKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Feedback */}
        {showError && (
          <p className="flex items-center gap-1.5 text-xs text-red-500 -mt-2">
            <AlertTriangle size={12} /> Doit commencer par <code className="font-mono">sk-ant-</code>
          </p>
        )}
        {valid && (
          <p className="flex items-center gap-1.5 text-xs text-teal-600 -mt-2">
            <CheckCircle size={12} /> Clé valide
          </p>
        )}

        {/* Warning */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            Stockée <strong>uniquement dans votre navigateur</strong>.
            Ne partagez pas cet onglet.
          </span>
        </div>
      </div>

      {/* ── Situation du foyer ──────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 flex flex-col gap-4">
        <div>
          <p className="font-semibold text-gray-800 text-sm">Situation du foyer</p>
          <p className="text-xs text-gray-400 mt-0.5">Détermine les sections du formulaire.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {MODES.map(({ value, label, sub, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={[
                'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all duration-200',
                mode === value
                  ? 'border-teal-500 bg-teal-50 shadow-sm'
                  : 'border-gray-150 bg-gray-50 hover:border-gray-300 hover:bg-white',
              ].join(' ')}
            >
              <div className={[
                'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                mode === value ? 'bg-teal-gradient text-white' : 'bg-white text-gray-400 border border-gray-200',
              ].join(' ')}>
                <Icon size={16} />
              </div>
              <div>
                <p className={`font-semibold text-sm ${mode === value ? 'text-teal-700' : 'text-gray-700'}`}>
                  {label}
                </p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <Button size="lg" disabled={!valid} onClick={handleContinue} className="w-full !rounded-2xl">
        Continuer vers l&apos;anonymisation →
      </Button>

      {!valid && touched && apiKey.length === 0 && (
        <p className="text-center text-xs text-gray-400 -mt-2">
          Saisissez votre clé API pour continuer.
        </p>
      )}

      <div className="flex justify-start -mt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> Accueil
        </Button>
      </div>

    </div>
  );
}
