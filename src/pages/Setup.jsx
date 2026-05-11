import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Card from '../components/Card';
import PrivacyBadge from '../components/PrivacyBadge';

const API_CONSOLE_URL = 'https://console.anthropic.com/settings/keys';

function isValidKey(k) {
  return typeof k === 'string' && k.startsWith('sk-ant-') && k.length > 20;
}

export default function Setup() {
  const navigate = useNavigate();
  const { state, dispatch, getApiKey, setApiKey } = useApp();

  const [apiKey, setLocalApiKey]   = useState('');
  const [mode, setMode]            = useState(state.mode ?? 'solo');
  const [showKey, setShowKey]      = useState(false);
  const [touched, setTouched]      = useState(false);

  // Pré-remplir avec la clé déjà stockée
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
    <div className="flex flex-col gap-6 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Étape 0 / 4</p>
        <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
        <p className="text-gray-500 text-sm">Renseignez votre clé API et votre situation en 1 minute.</p>
      </div>

      <PrivacyBadge />

      {/* Clé API */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-800">Clé API Anthropic</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Utilisée uniquement pour le conseil expert (étape 4).
            </p>
          </div>
          <a
            href={API_CONSOLE_URL}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors"
          >
            Obtenir une clé <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>

        {/* Champ clé */}
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              placeholder="sk-ant-..."
              autoComplete="off"
              spellCheck={false}
              onChange={e => { setLocalApiKey(e.target.value); setTouched(true); }}
              onBlur={() => setTouched(true)}
              className={[
                'w-full pr-10 pl-3 py-2.5 text-sm border rounded-lg bg-gray-50',
                'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent',
                'font-mono placeholder:font-sans placeholder:text-gray-400',
                showError   ? 'border-red-300 focus:ring-red-400' : 'border-gray-200',
                valid       ? 'border-teal-300' : '',
              ].join(' ')}
            />
            <button
              type="button"
              aria-label={showKey ? 'Masquer la clé' : 'Afficher la clé'}
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showKey
                ? <EyeOff size={16} aria-hidden="true" />
                : <Eye    size={16} aria-hidden="true" />
              }
            </button>
          </div>

          {/* Feedback validation */}
          {showError && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle size={13} aria-hidden="true" />
              La clé doit commencer par <code className="font-mono">sk-ant-</code>
            </p>
          )}
          {valid && (
            <p className="flex items-center gap-1.5 text-xs text-teal-600">
              <CheckCircle size={13} aria-hidden="true" />
              Clé valide
            </p>
          )}
        </div>

        {/* Avertissement stockage */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            La clé est stockée <strong>uniquement sur votre navigateur</strong> (localStorage).
            Ne partagez pas cet onglet ni vos DevTools avec une autre personne.
          </span>
        </div>
      </Card>

      {/* Situation */}
      <Card className="flex flex-col gap-4">
        <div>
          <p className="font-semibold text-gray-800">Situation du foyer</p>
          <p className="text-sm text-gray-500 mt-0.5">Détermine les sections du formulaire de collecte.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'solo',   label: 'Célibataire',         sub: 'Une déclaration' },
            { value: 'couple', label: 'Couple',               sub: 'PACS ou mariage' },
          ].map(({ value, label, sub }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={[
                'flex flex-col items-start gap-0.5 p-4 rounded-xl border-2 text-left transition-all',
                mode === value
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300',
              ].join(' ')}
            >
              <span className={`font-semibold text-sm ${mode === value ? 'text-teal-700' : 'text-gray-800'}`}>
                {label}
              </span>
              <span className="text-xs text-gray-500">{sub}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* CTA */}
      <Button
        size="lg"
        disabled={!valid}
        onClick={handleContinue}
        className="w-full"
      >
        Continuer vers l&apos;anonymisation →
      </Button>

      {!valid && touched && apiKey.length === 0 && (
        <p className="text-center text-xs text-gray-400">
          Saisissez votre clé API pour continuer.
        </p>
      )}

    </div>
  );
}
