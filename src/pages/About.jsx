import { Link } from 'react-router-dom';
import {
  Lock, FileSearch, ClipboardList, Bot, ArrowRight, ExternalLink, Sparkles,
} from 'lucide-react';

const STEPS = [
  {
    Icon: Lock,
    label: 'Anonymisation',
    desc: 'Vos PDF (bulletins de salaire, avis d\'imposition, relevés…) sont lus localement par pdf.js. Les données personnelles identifiantes sont masquées avant tout traitement.',
    color: 'teal',
  },
  {
    Icon: ClipboardList,
    label: 'Collecte',
    desc: 'Un formulaire guidé structure votre situation fiscale : revenus, épargne, déductions, immobilier. Les chiffres extraits de vos documents pré-remplissent les champs automatiquement.',
    color: 'teal',
  },
  {
    Icon: FileSearch,
    label: 'Profil',
    desc: 'Un profil fiscal synthétique est généré localement à partir de vos données. C\'est ce texte — et uniquement lui — qui sera transmis à Claude.',
    color: 'teal',
  },
  {
    Icon: Bot,
    label: 'Conseil expert IA',
    desc: 'Claude reçoit votre profil + les skills fiscaux actifs (fiscaliste, notaire, comptable…) et répond à vos questions avec des données chiffrées à jour (barèmes 2025, plafonds PER, abattements…).',
    color: 'teal',
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

export default function About() {
  return (
    <div className="flex flex-col gap-10">

      {/* Hero */}
      <div className="flex flex-col gap-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full border border-teal-100 w-fit">
          <Lock size={11} /> 100 % local · open source MIT
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">À propos de Coach Fiscal</h1>
        <p className="text-gray-500 leading-relaxed max-w-lg text-sm">
          Un assistant fiscal personnel qui tourne entièrement dans votre navigateur.
          Vos données ne quittent jamais votre appareil — sauf votre profil synthétique,
          envoyé à Claude pour le conseil expert.
        </p>
        <div className="flex items-center gap-4 mt-1">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors"
          >
            Démarrer mon bilan <ArrowRight size={14} />
          </Link>
          <Link
            to="/privacy"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Confidentialité
          </Link>
        </div>
      </div>

      {/* Comment ça marche */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">Comment ça marche</h2>
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {STEPS.map(({ Icon, label, desc }, i) => (
            <div key={label} className="flex gap-4 items-start px-5 py-5 border-b border-gray-50 last:border-0">
              <div className="shrink-0 w-8 h-8 rounded-full bg-teal-gradient text-white flex items-center justify-center text-xs font-bold mt-0.5 shadow-sm">
                {i + 1}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon size={15} className="text-teal-500" aria-hidden="true" />
                  <p className="font-semibold text-gray-800 text-sm">{label}</p>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">Questions fréquentes</h2>
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="flex flex-col gap-2 px-5 py-5 border-b border-gray-50 last:border-0">
              <p className="font-semibold text-gray-800 text-sm">{q}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Crédits */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">Crédits & bibliothèques</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CREDITS.map(c => (
            <div
              key={c.name}
              className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 flex flex-col gap-2 hover:border-teal-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-800 text-sm">{c.name}</p>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-300 hover:text-teal-500 transition-colors"
                  aria-label={`Voir ${c.name}`}
                >
                  <ExternalLink size={13} />
                </a>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed flex-1">{c.desc}</p>
              <p className="text-xs text-gray-400 font-medium">par {c.author}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-gradient flex items-center justify-center text-white shrink-0 shadow-sm">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">Prêt à démarrer ?</p>
          <p className="text-xs text-gray-500 mt-0.5">Votre bilan fiscal complet en 4 étapes, 100 % dans votre navigateur.</p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-gradient text-white text-sm font-semibold rounded-xl shadow-sm hover:brightness-110 transition-all shrink-0"
        >
          Commencer <ArrowRight size={14} />
        </Link>
      </div>

    </div>
  );
}
