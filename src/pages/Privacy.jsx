import { useNavigate } from 'react-router-dom';
import { Lock, Shield, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';

const STORAGE_KEY     = 'coachFiscal.state';
const API_KEY_STORAGE = 'coachFiscal.apiKey';

const LOCAL_STORED = [
  { key: 'coachFiscal.state → mode',        what: 'Situation du foyer (solo / couple)' },
  { key: 'coachFiscal.state → model',       what: 'Modèle Claude sélectionné (Sonnet ou Opus)' },
  { key: 'coachFiscal.state → formData',    what: 'Données du formulaire de collecte (revenus, épargne, déductions, immobilier)' },
  { key: 'coachFiscal.state → d1Data',      what: 'Données déclarant 1 (mode couple)' },
  { key: 'coachFiscal.state → d2Data',      what: 'Données déclarant 2 (mode couple)' },
  { key: 'coachFiscal.state → profile',     what: 'Profil fiscal synthétique généré (texte brut)' },
  { key: 'coachFiscal.state → chatHistory', what: 'Historique de la conversation avec Claude' },
  { key: 'coachFiscal.apiKey',              what: 'Clé API Anthropic (stockée séparément, jamais dans coachFiscal.state)' },
];

const LOCAL_NOT_STORED = [
  'Fichiers PDF originaux (jamais écrits sur disque ni en mémoire persistante)',
  'Fichiers PDF anonymisés (Blob URLs session uniquement, perdus au rechargement)',
  'Texte brut extrait des PDF (utilisé pour le pré-remplissage, non persisté)',
];

const API_SENT = [
  { item: 'Profil fiscal synthétique', detail: 'Le texte généré à l\'étape 3, contenant uniquement les données chiffrées que vous avez saisies ou validées.' },
  { item: 'Vos messages', detail: 'Le contenu de chaque question posée dans le chat.' },
  { item: 'Historique de conversation', detail: 'Les échanges précédents du même fil, pour maintenir le contexte.' },
  { item: 'System prompt (skills)', detail: 'Le prompt maître + les fichiers de référence fiscaux (barèmes, procédures) correspondant aux skills actifs. Aucune donnée personnelle.' },
];

const API_NOT_SENT = [
  'Les PDF originaux (ils ne quittent jamais le navigateur)',
  'Les PDF anonymisés',
  'Votre nom, adresse, numéro fiscal ou toute donnée d\'identité',
  'Votre clé API (envoyée uniquement dans le header HTTP x-api-key, jamais dans le corps)',
  'Les données des formulaires Collect brutes (seul le profil synthétique agrégé est envoyé)',
];

function Row({ label, ok }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-gray-50 last:border-0">
      {ok
        ? <CheckCircle size={15} className="text-teal-500 shrink-0 mt-0.5" />
        : <XCircle    size={15} className="text-red-400  shrink-0 mt-0.5" />
      }
      <p className="text-sm text-gray-600 leading-relaxed">{label}</p>
    </div>
  );
}

export default function Privacy() {
  const navigate = useNavigate();

  function handleClearAll() {
    if (!window.confirm(
      'Supprimer TOUTES les données locales ?\n\n' +
      'Cela effacera votre clé API, votre profil fiscal et votre historique de conversation. ' +
      'Cette action est irréversible.'
    )) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(API_KEY_STORAGE);
    } catch {
      // Ignore (mode privé, quota)
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="flex flex-col gap-10">

      {/* Hero */}
      <div className="flex flex-col gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full border border-teal-100 w-fit">
          <Lock size={12} /> Politique de confidentialité
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Vos données</h1>
        <p className="text-gray-500 leading-relaxed max-w-lg">
          Cette page décrit précisément ce qui est stocké dans votre navigateur
          et ce qui est transmis à l'API Claude. Vous pouvez tout effacer en un clic.
        </p>
      </div>

      {/* localStorage */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-teal-600" />
          <h2 className="text-lg font-bold text-gray-900">Stockage local (localStorage)</h2>
        </div>

        <Card className="flex flex-col gap-0 px-5">
          <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide py-3 border-b border-gray-100">
            Ce qui est stocké
          </p>
          {LOCAL_STORED.map(({ key, what }) => (
            <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-gray-50 last:border-0">
              <code className="shrink-0 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono w-fit">
                {key}
              </code>
              <p className="text-sm text-gray-500 leading-relaxed">{what}</p>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-0 px-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide py-3 border-b border-gray-100">
            Ce qui n'est PAS stocké
          </p>
          {LOCAL_NOT_STORED.map(item => (
            <Row key={item} label={item} ok={false} />
          ))}
        </Card>
      </div>

      {/* API Anthropic */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h2 className="text-lg font-bold text-gray-900">Transmis à api.anthropic.com</h2>
        </div>
        <p className="text-sm text-gray-500 -mt-2">
          Uniquement lors de l'étape 4 (Conseil). Chaque message envoyé génère une requête HTTPS
          vers <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">api.anthropic.com/v1/messages</code>.
        </p>

        <Card className="flex flex-col gap-0 px-5">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide py-3 border-b border-gray-100">
            Ce qui est envoyé
          </p>
          {API_SENT.map(({ item, detail }) => (
            <div key={item} className="flex items-start gap-2.5 py-3 border-b border-gray-50 last:border-0">
              <CheckCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-gray-700">{item}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{detail}</p>
              </div>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-0 px-5">
          <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide py-3 border-b border-gray-100">
            Ce qui n'est PAS envoyé
          </p>
          {API_NOT_SENT.map(item => (
            <Row key={item} label={item} ok={false} />
          ))}
        </Card>

        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
          <Lock size={13} className="shrink-0 mt-0.5" />
          <span>
            Vous pouvez vérifier en temps réel dans <strong>DevTools → Onglet Network</strong> :
            filtrez sur <code className="font-mono bg-blue-100 px-1 rounded">anthropic.com</code> pour
            voir exactement ce qui part et ce qui revient.
          </span>
        </div>
      </div>

      {/* Tout effacer */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">Supprimer mes données</h2>
        <Card className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-red-50 border-red-100">
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">Tout effacer</p>
            <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">
              Supprime la clé API, le profil fiscal, le formulaire et l'historique de conversation
              du localStorage de ce navigateur. Irréversible.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearAll}
            className="!border-red-200 !text-red-600 hover:!bg-red-100 shrink-0"
          >
            <Trash2 size={14} />
            Tout effacer
          </Button>
        </Card>
      </div>

    </div>
  );
}
