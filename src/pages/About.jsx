import { Link } from 'react-router-dom';
import { Lock, FileSearch, ClipboardList, Bot, ArrowRight, ExternalLink } from 'lucide-react';
import Card from '../components/Card';

const STEPS = [
  {
    icon: <Lock size={20} className="text-teal-600" />,
    label: 'Étape 1 — Anonymisation',
    desc: 'Vos PDF (bulletins de salaire, avis d\'imposition, relevés…) sont lus localement par pdf.js. Les données personnelles identifiantes sont masquées avant tout traitement.',
  },
  {
    icon: <ClipboardList size={20} className="text-teal-600" />,
    label: 'Étape 2 — Collecte',
    desc: 'Un formulaire guidé structure votre situation fiscale : revenus, épargne, déductions, immobilier. Les chiffres extraits de vos documents pré-remplissent les champs automatiquement.',
  },
  {
    icon: <FileSearch size={20} className="text-teal-600" />,
    label: 'Étape 3 — Profil',
    desc: 'Un profil fiscal synthétique est généré localement à partir de vos données. C\'est ce texte — et uniquement lui — qui sera transmis à Claude.',
  },
  {
    icon: <Bot size={20} className="text-teal-600" />,
    label: 'Étape 4 — Conseil expert IA',
    desc: 'Claude reçoit votre profil + les skills fiscaux actifs (fiscaliste, notaire, comptable…) et répond à vos questions avec des données chiffrées à jour (barèmes 2025, plafonds PER, abattements…).',
  },
];

const FAQ = [
  {
    q: 'Mes données sont-elles privées ?',
    a: 'Oui, à 100 % — avec une nuance. Tout le traitement (lecture des PDF, extraction, génération du profil) se passe dans votre navigateur. Seul le profil fiscal synthétique et vos messages sont envoyés à l\'API Claude (Anthropic) lors de l\'étape Conseil. Vos PDF originaux ne quittent jamais votre appareil.',
  },
  {
    q: 'Pourquoi dois-je fournir ma propre clé API ?',
    a: 'Coach Fiscal est un outil 100 % open source sans serveur intermédiaire. En utilisant votre propre clé, vous payez Anthropic directement, sans intermédiation ni surcoût. Personne d\'autre n\'a accès à vos requêtes ou à votre facturation.',
  },
  {
    q: 'Combien ça coûte ?',
    a: 'L\'application elle-même est gratuite. Vous payez uniquement l\'usage API Anthropic : comptez 5 à 15 €/mois pour un usage régulier (plusieurs bilans + questions par semaine) en mode Sonnet, davantage en mode Opus. Les tarifs sont affichés sur console.anthropic.com.',
  },
  {
    q: 'Puis-je modifier ou redistribuer l\'application ?',
    a: 'Oui. Coach Fiscal est publié sous licence MIT. Vous pouvez librement l\'étudier, le modifier, le fork et le redistribuer, à condition de conserver la notice de licence.',
  },
];

const CREDITS = [
  {
    name: 'Paperasse',
    desc: 'Base de skills fiscaux (fiscaliste, notaire, comptable, contrôleur fiscal, CAC, syndic) et données de référence (barèmes IR, PER, plus-values…)',
    author: 'romainsimon',
    url: 'https://github.com/romainsimon/paperasse',
  },
  {
    name: 'pdf.js',
    desc: 'Extraction du texte des PDF directement dans le navigateur, sans serveur.',
    author: 'Mozilla',
    url: 'https://mozilla.github.io/pdf.js/',
  },
  {
    name: 'pdf-lib',
    desc: 'Manipulation et anonymisation des PDF (masquage des champs texte).',
    author: 'Andrew Dillon',
    url: 'https://pdf-lib.js.org/',
  },
];

function Step({ step, index }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-bold">
        {index + 1}
      </div>
      <div className="flex flex-col gap-1 pb-6 border-l border-gray-100 pl-4 -ml-8 ml-4">
        <div className="flex items-center gap-2">
          {step.icon}
          <p className="font-semibold text-gray-800 text-sm">{step.label}</p>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  return (
    <div className="flex flex-col gap-2 py-4 border-b border-gray-100 last:border-0">
      <p className="font-semibold text-gray-800 text-sm">{q}</p>
      <p className="text-sm text-gray-500 leading-relaxed">{a}</p>
    </div>
  );
}

export default function About() {
  return (
    <div className="flex flex-col gap-10">

      {/* Hero */}
      <div className="flex flex-col gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full border border-teal-100 w-fit">
          <Lock size={12} /> 100 % local · open source MIT
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">À propos de Coach Fiscal</h1>
        <p className="text-gray-500 leading-relaxed max-w-lg">
          Un assistant fiscal personnel qui tourne entièrement dans votre navigateur.
          Vos données ne quittent jamais votre appareil — sauf votre profil synthétique,
          envoyé à Claude pour le conseil expert.
        </p>
        <div className="flex items-center gap-3 mt-1">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
          >
            Démarrer mon bilan <ArrowRight size={14} />
          </Link>
          <Link
            to="/privacy"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Politique de confidentialité
          </Link>
        </div>
      </div>

      {/* Comment ça marche */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">Comment ça marche</h2>
        <Card className="flex flex-col divide-y divide-gray-50 py-2">
          {STEPS.map((step, i) => (
            <div key={step.label} className="py-4 first:pt-2 last:pb-2 flex gap-4 items-start">
              <div className="shrink-0 w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {step.icon}
                  <p className="font-semibold text-gray-800 text-sm">{step.label.replace(/^Étape \d+ — /, '')}</p>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* FAQ */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">Questions fréquentes</h2>
        <Card className="px-6">
          {FAQ.map(item => (
            <FaqItem key={item.q} {...item} />
          ))}
        </Card>
      </div>

      {/* Crédits */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">Crédits & bibliothèques</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CREDITS.map(c => (
            <Card key={c.name} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-800 text-sm">{c.name}</p>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 hover:text-teal-600 transition-colors"
                  aria-label={`Voir ${c.name} sur le web`}
                >
                  <ExternalLink size={13} />
                </a>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{c.desc}</p>
              <p className="text-xs text-gray-400">par {c.author}</p>
            </Card>
          ))}
        </div>
      </div>

    </div>
  );
}
