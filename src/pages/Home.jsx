import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Layers, Bot, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';

const STORAGE_KEY = 'coachFiscal.state';

function hasActiveSession() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    return (
      Object.keys(parsed.formData ?? {}).length > 0 ||
      (parsed.profile ?? '').length > 0 ||
      (parsed.chatHistory ?? []).length > 0
    );
  } catch { return false; }
}

const STEPS = [
  { n: '1', label: 'Anonymisation' },
  { n: '2', label: 'Collecte'      },
  { n: '3', label: 'Profil'        },
  { n: '4', label: 'Conseil IA'    },
];

const FEATURES = [
  {
    icon: <Lock size={20} />,
    color: 'from-teal-500 to-teal-600',
    bg:    'bg-teal-50',
    title: '100 % local',
    stat:  '0 donnée envoyée',
    desc:  'Vos PDF ne quittent jamais votre appareil. Seul votre profil synthétique part à Claude.',
  },
  {
    icon: <Layers size={20} />,
    color: 'from-violet-500 to-violet-600',
    bg:    'bg-violet-50',
    title: '4 étapes guidées',
    stat:  '~30 minutes',
    desc:  'Anonymisation → Collecte → Profil → Conseil expert. Sauvegardé en local à chaque étape.',
  },
  {
    icon: <Bot size={20} />,
    color: 'from-emerald-500 to-emerald-600',
    bg:    'bg-emerald-50',
    title: '7 experts IA',
    stat:  'Barèmes 2025',
    desc:  'Fiscaliste, notaire, comptable, contrôleur fiscal et plus — activés selon votre question.',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const [sessionActive, setSessionActive] = useState(false);

  useEffect(() => { setSessionActive(hasActiveSession()); }, []);

  const handleStart = () => {
    dispatch({ type: 'RESET_ALL' });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    navigate('/setup');
  };

  return (
    <div className="flex flex-col gap-8">

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="-mx-4 relative overflow-hidden rounded-3xl bg-hero-gradient px-6 pt-14 pb-12 text-center shadow-hero">

        {/* Orbs décoratifs */}
        <div aria-hidden="true" className="pointer-events-none">
          <div className="absolute -top-12 -left-12 w-72 h-72 rounded-full bg-teal-400/20 blur-3xl animate-glow" />
          <div className="absolute -bottom-16 -right-8 w-64 h-64 rounded-full bg-emerald-400/15 blur-3xl animate-glow-delay" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-teal-600/10 blur-3xl animate-float-slow" />
        </div>

        {/* Badge */}
        <div className="animate-slide-up relative z-10 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-teal-200 text-xs font-semibold mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse2" aria-hidden="true" />
          100 % privé · open source MIT
          <ShieldCheck size={12} className="text-teal-400" aria-hidden="true" />
        </div>

        {/* Headline */}
        <h1 className="animate-slide-up-d1 relative z-10 text-4xl sm:text-5xl font-extrabold text-white leading-[1.1] tracking-tight mb-4">
          Votre bilan fiscal
          <br />
          <span className="text-gradient">personnalisé</span>
          {' '}en 30&nbsp;min
        </h1>

        {/* Sous-titre */}
        <p className="animate-slide-up-d2 relative z-10 text-teal-100/65 text-base sm:text-lg leading-relaxed mb-8 max-w-md mx-auto">
          Analyse de vos documents fiscaux, profil synthétique et conseil expert IA —
          entièrement dans votre navigateur.
        </p>

        {/* CTAs */}
        <div className="animate-slide-up-d3 relative z-10 flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Button size="lg" onClick={handleStart}
            className="!px-7 !py-3.5 !text-base !rounded-2xl !shadow-lg">
            Démarrer mon bilan <ArrowRight size={18} aria-hidden="true" />
          </Button>
          {sessionActive && (
            <Button variant="dark" size="lg" onClick={() => navigate('/collect')}
              className="!rounded-2xl">
              Reprendre mon bilan
            </Button>
          )}
        </div>

        {/* Étapes pill */}
        <div className="relative z-10 flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 border border-white/12 text-xs text-teal-200/80 font-medium">
                <span className="w-4 h-4 rounded-full bg-teal-500/40 flex items-center justify-center text-[10px] font-bold text-white">
                  {s.n}
                </span>
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="text-white/20 text-xs">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FEATURES.map(({ icon, color, bg, title, stat, desc }) => (
          <div
            key={title}
            className="group relative flex flex-col gap-4 rounded-2xl bg-white border border-gray-100 shadow-sm p-6 card-lift overflow-hidden"
          >
            {/* Fond hover subtil */}
            <div aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-br from-teal-50/0 to-teal-50/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
            />

            <div className="relative z-10 flex items-start justify-between">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm`}>
                {icon}
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} text-gray-600`}>
                {stat}
              </span>
            </div>

            <div className="relative z-10">
              <p className="font-bold text-gray-900 mb-1.5">{title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Bandeau confidentialité ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-teal-gradient px-6 py-4 flex items-center justify-between gap-4 shadow-sm">
        <div aria-hidden="true"
          className="absolute right-0 top-0 w-32 h-full bg-white/5 rounded-l-full blur-2xl"
        />
        <div className="flex items-center gap-2.5 text-white text-sm font-medium">
          <Lock size={15} className="shrink-0" aria-hidden="true" />
          <span>
            Données fiscales 100 % locales —{' '}
            <span className="opacity-75 font-normal">
              vérifiez dans DevTools › Network
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-teal-100 text-xs font-medium">
          <Sparkles size={13} aria-hidden="true" />
          Open source
        </div>
      </div>

    </div>
  );
}
