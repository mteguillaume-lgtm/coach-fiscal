import { useState } from 'react';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import Button from './Button';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUTS = ['Célibataire', 'Marié(e)', 'Pacsé(e)', 'Divorcé(e)', 'Veuf/Veuve'];

const TYPES_REVENUS = [
  { value: 'Salarié(e)',         label: 'Salarié(e)',          desc: 'Fiche de paie, case 1AJ' },
  { value: 'Retraité(e)',        label: 'Retraité(e)',          desc: 'Pension, case 1AS' },
  { value: 'Mixte',              label: 'Mixte',               desc: 'Salaire + pension' },
  { value: 'Indépendant(e)/TNS', label: 'Indépendant / TNS',   desc: 'BNC, BIC, SE' },
  { value: 'Pas de revenus',     label: 'Pas de revenus',      desc: 'Conjoint inactif' },
];

const PLACEMENTS = [
  { value: 'dividendes', label: 'Dividendes / intérêts',   desc: 'Compte-titres, livret bancaire' },
  { value: 'crypto',     label: 'Cryptomonnaies',           desc: 'Bitcoin, Ethereum…' },
  { value: 'pv',         label: 'Plus-values mobilières',   desc: "Vente d'actions, ETF" },
  { value: 'loyers',     label: 'Loyers perçus',            desc: 'Location nue ou meublée' },
  { value: 'etranger',   label: 'Revenus de source étrangère', desc: 'Salaire/pension/loyers hors de France, frontalier' },
];

const BIENS = [
  { value: 'rp',         label: 'Résidence principale',    desc: 'Avec ou sans crédit' },
  { value: 'locatif',    label: 'Bien locatif',            desc: 'Nu, meublé, SCI' },
  { value: 'indivision', label: 'Terres / indivision',     desc: 'Fermage, parts agricoles' },
];

const CREDITS = [
  { value: 'garde',     label: "Garde d'enfant",           desc: 'Hors domicile — case 7GA' },
  { value: 'domicile',  label: 'Emploi à domicile',        desc: 'Aide ménagère, garde partagée' },
  { value: 'dons',      label: 'Dons aux associations',    desc: 'Case 7UD / 7UF' },
  { value: 'travaux',   label: 'Rénovation énergétique',   desc: 'MaPrimeRénov, CITE' },
  { value: 'pension',   label: 'Pension alimentaire versée', desc: 'Enfant majeur, ascendant, ex-conjoint' },
];

const EPARGNE = [
  { value: 'per',               label: 'PER (plan épargne retraite)', desc: 'Versements volontaires déductibles' },
  { value: 'epargne_salariale', label: 'Épargne salariale',           desc: 'PEE, PERCO, intéressement, participation' },
];

const TOTAL_STEPS = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeModules({ typeD1, typeD2, adults, placements, biens, credits, epargne }) {
  const isSalarie = t => t === 'Salarié(e)' || t === 'Mixte';
  const isTns     = t => t === 'Indépendant(e)/TNS';
  const ep = epargne || [];
  return {
    salaires:             isSalarie(typeD1) || (adults === 2 && isSalarie(typeD2)),
    tns:                  isTns(typeD1) || (adults === 2 && isTns(typeD2)),
    fraisReels:           false,
    foncier:              placements.includes('loyers') || biens.includes('indivision'),
    immobilier:           biens.includes('rp') || biens.includes('locatif') || biens.includes('indivision'),
    capitauxMobiliers:    placements.includes('dividendes') || placements.includes('pv'),
    crypto:               placements.includes('crypto'),
    epargneSalariale:     ep.includes('epargne_salariale'),
    perVolontaire:        ep.includes('per'),
    pensionsAlimentaires: credits.includes('pension'),
    creditsImpot:         credits.length > 0,
    investissementsLocatifs: biens.includes('locatif'),
    international:         placements.includes('etranger'),
  };
}

function computeParts(adults, statut, enfants, gardeAlternee) {
  let base = adults;
  // Enfants à charge entière
  const entiers = enfants - gardeAlternee;
  if (entiers >= 1) base += 0.5;
  if (entiers >= 2) base += 0.5;
  if (entiers >= 3) base += 1 * (entiers - 2);
  // Garde alternée = demi-demi-part
  base += gardeAlternee * 0.25;
  return Math.round(base * 4) / 4; // arrondi au quart de part
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function OptionCard({ label, desc, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-150',
        selected
          ? 'border-teal-400 bg-teal-50 text-teal-800'
          : 'border-gray-200 bg-white text-gray-700 hover:border-teal-200 hover:bg-teal-50/30',
      ].join(' ')}
    >
      <p className="font-semibold text-sm">{label}</p>
      {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
    </button>
  );
}

function MultiChip({ label, desc, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-150',
        selected
          ? 'border-teal-400 bg-teal-50'
          : 'border-gray-200 bg-white hover:border-teal-200 hover:bg-teal-50/30',
      ].join(' ')}
    >
      <span className={[
        'w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center border-2 text-white text-xs font-bold transition-colors',
        selected ? 'bg-teal-500 border-teal-500' : 'border-gray-300',
      ].join(' ')}>
        {selected && '✓'}
      </span>
      <div>
        <p className="font-semibold text-sm text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
    </button>
  );
}

function CountSelector({ value, onChange, min = 0, max = 6 }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-10 h-10 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-lg hover:border-teal-300 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        −
      </button>
      <span className="text-2xl font-bold text-gray-800 w-8 text-center tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-10 h-10 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-lg hover:border-teal-300 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        +
      </button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function OnboardingWizard({ onComplete, onSkip, initialMode = 'solo' }) {
  const [step, setStep]               = useState(0);
  const [adults, setAdults]           = useState(initialMode === 'couple' ? 2 : 1);
  const [statut, setStatut]           = useState('');
  const [enfants, setEnfants]         = useState(0);
  const [gardeAlternee, setGardeAlt]  = useState(0);
  const [typeD1, setTypeD1]           = useState('');
  const [typeD2, setTypeD2]           = useState('');
  const [placements, setPlacements]   = useState([]);
  const [biens, setBiens]             = useState([]);
  const [credits, setCredits]         = useState([]);
  const [epargne, setEpargne]         = useState([]);

  function toggle(arr, setArr, val) {
    setArr(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  }

  const QUESTIONS = [
    'Combien d\'adultes dans votre foyer fiscal ?',
    'Quelle est votre situation familiale ?',
    'Avez-vous des enfants à charge ?',
    adults === 1
      ? 'Quelle est votre source de revenus principale ?'
      : 'Quelle est la source de revenus de chaque déclarant ?',
    'Avez-vous des revenus de placements ?',
    'Avez-vous des biens immobiliers ?',
    'Épargne et retraite ?',
    'Avez-vous des dépenses ouvrant droit à crédit d\'impôt ?',
  ];

  function canGoNext() {
    if (step === 0) return true;
    if (step === 1) return !!statut;
    if (step === 3) return !!typeD1 && (adults === 1 || !!typeD2);
    return true;
  }

  function handleNext() {
    if (step < TOTAL_STEPS - 1) { setStep(s => s + 1); return; }
    const mods = computeModules({ typeD1, typeD2, adults, placements, biens, credits, epargne });
    const parts = computeParts(adults, statut, enfants, gardeAlternee);
    const collected = {
      foyer: { statut, parts, enfants, enfantsGardeAlternee: gardeAlternee },
      declarants: [
        { id: 'D1', actif: true,          type: typeD1 },
        { id: 'D2', actif: adults === 2,  type: adults === 2 ? typeD2 : '' },
      ],
      modules: mods,
      onboardingDone: true,
      expertMode:     false,
    };
    onComplete(collected, adults === 2 ? 'couple' : 'solo', { statut, parts: String(parts), enfants: String(enfants) });
  }

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  // ── Rendu de chaque étape ─────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      // Q1 — Nombre d'adultes
      case 0:
        return (
          <div className="flex gap-3">
            {[{ n: 1, label: 'Moi seul(e)', sub: 'Déclaration individuelle' },
              { n: 2, label: 'Nous sommes 2', sub: 'Déclaration commune' }].map(({ n, label, sub }) => (
              <button
                key={n} type="button" onClick={() => setAdults(n)}
                className={[
                  'flex-1 py-5 rounded-2xl border-2 text-center transition-all duration-150',
                  adults === n
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-teal-200 hover:bg-teal-50/30',
                ].join(' ')}
              >
                <p className={`text-3xl font-bold mb-1 ${adults === n ? 'text-teal-700' : 'text-gray-700'}`}>{n}</p>
                <p className={`text-sm font-semibold ${adults === n ? 'text-teal-700' : 'text-gray-700'}`}>{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
        );

      // Q2 — Statut
      case 1:
        return (
          <div className="grid grid-cols-1 gap-2">
            {STATUTS.map(s => (
              <OptionCard key={s} label={s} selected={statut === s} onClick={() => setStatut(s)} />
            ))}
          </div>
        );

      // Q3 — Enfants
      case 2:
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-3">Enfants à charge totale ou partagée</p>
              <CountSelector value={enfants} onChange={v => { setEnfants(v); if (gardeAlternee > v) setGardeAlt(v); }} max={8} />
            </div>
            {enfants > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">dont en garde alternée</p>
                <p className="text-xs text-gray-400 mb-3">Compte pour une demi-part au lieu d'une pleine part</p>
                <CountSelector value={gardeAlternee} onChange={setGardeAlt} max={enfants} />
              </div>
            )}
          </div>
        );

      // Q4 — Type revenus (par déclarant)
      case 3:
        return (
          <div className="space-y-5">
            {adults >= 1 && (
              <div>
                {adults === 2 && <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-2">Déclarant 1 — Vous</p>}
                <div className="grid grid-cols-1 gap-2">
                  {TYPES_REVENUS.map(({ value, label, desc }) => (
                    <OptionCard key={value} label={label} desc={desc} selected={typeD1 === value} onClick={() => setTypeD1(value)} />
                  ))}
                </div>
              </div>
            )}
            {adults === 2 && (
              <div>
                <p className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-2">Déclarant 2 — Conjoint(e)</p>
                <div className="grid grid-cols-1 gap-2">
                  {TYPES_REVENUS.map(({ value, label, desc }) => (
                    <OptionCard key={value} label={label} desc={desc} selected={typeD2 === value} onClick={() => setTypeD2(value)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      // Q5 — Placements
      case 4:
        return (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Cochez tout ce qui s'applique — laissez vide si aucun</p>
            {PLACEMENTS.map(({ value, label, desc }) => (
              <MultiChip
                key={value} label={label} desc={desc}
                selected={placements.includes(value)}
                onClick={() => toggle(placements, setPlacements, value)}
              />
            ))}
          </div>
        );

      // Q6 — Biens immo
      case 5:
        return (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Cochez tout ce qui s'applique — laissez vide si aucun</p>
            {BIENS.map(({ value, label, desc }) => (
              <MultiChip
                key={value} label={label} desc={desc}
                selected={biens.includes(value)}
                onClick={() => toggle(biens, setBiens, value)}
              />
            ))}
          </div>
        );

      // Q7 — Épargne & retraite
      case 6:
        return (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Cochez tout ce qui s'applique — laissez vide si aucun</p>
            {EPARGNE.map(({ value, label, desc }) => (
              <MultiChip
                key={value} label={label} desc={desc}
                selected={epargne.includes(value)}
                onClick={() => toggle(epargne, setEpargne, value)}
              />
            ))}
          </div>
        );

      // Q8 — Crédits d'impôt & charges
      case 7:
        return (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Cochez tout ce qui s'applique — laissez vide si aucun</p>
            {CREDITS.map(({ value, label, desc }) => (
              <MultiChip
                key={value} label={label} desc={desc}
                selected={credits.includes(value)}
                onClick={() => toggle(credits, setCredits, value)}
              />
            ))}
          </div>
        );

      default: return null;
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* En-tête */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">
              Étape {step + 1} / {TOTAL_STEPS}
            </span>
            <h2 className="text-xl font-bold text-gray-900 mt-1 leading-snug">
              {QUESTIONS[step]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors"
          >
            <Zap size={11} />
            Mode expert
          </button>
        </div>

        {/* Barre de progression */}
        <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-purple-500 transition-all duration-400"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Contenu de l'étape */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost" size="sm"
          disabled={step === 0}
          onClick={() => setStep(s => s - 1)}
        >
          <ChevronLeft size={14} /> Retour
        </Button>
        <Button
          variant="primary"
          disabled={!canGoNext()}
          onClick={handleNext}
        >
          {step === TOTAL_STEPS - 1
            ? 'Accéder à ma collecte →'
            : <><span>Suivant</span><ChevronRight size={14} /></>
          }
        </Button>
      </div>

      {/* Lien mode expert (répété en bas) */}
      <p className="text-center text-xs text-gray-400">
        Vous connaissez les cases fiscales ?{' '}
        <button type="button" onClick={onSkip} className="underline hover:text-teal-600 transition-colors">
          Accéder directement à la collecte complète
        </button>
      </p>

    </div>
  );
}
