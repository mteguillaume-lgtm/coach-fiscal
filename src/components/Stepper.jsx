import { useLocation, Link } from 'react-router-dom';
import { Check } from 'lucide-react';

const STEPS = [
  { label: 'Anonymisation', short: 'Anon.',   path: '/anonymize' },
  { label: 'Collecte',      short: 'Coll.',   path: '/collect'   },
  { label: 'Profil',        short: 'Profil',  path: '/profile'   },
  { label: 'Rapport',       short: 'Rapport', path: '/rapport'   },
  { label: 'Conseil IA',    short: 'IA',      path: '/chat'      },
];

export default function Stepper() {
  const { pathname } = useLocation();
  const currentIdx = STEPS.findIndex(s => pathname.startsWith(s.path));

  return (
    <nav aria-label="Progression du bilan" className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const done   = idx < currentIdx;
        const active = idx === currentIdx;
        const future = idx > currentIdx;

        return (
          <div key={step.path} className="flex items-center flex-1 last:flex-none">

            {/* Cercle + label */}
            <Link
              to={step.path}
              aria-current={active ? 'step' : undefined}
              className="flex flex-col items-center gap-1.5 shrink-0 group"
            >
              {/* Cercle */}
              <div className={[
                'relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                'transition-all duration-300 border-2',
                active && 'bg-teal-gradient border-transparent text-white shadow-md scale-110',
                done   && 'bg-teal-600 border-teal-600 text-white',
                future && 'bg-white border-gray-200 text-gray-400 group-hover:border-gray-300',
              ].filter(Boolean).join(' ')}>
                {/* Pulse sur l'étape active */}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-teal-500/30 animate-ping"
                    style={{ animationDuration: '2s' }}
                  />
                )}
                {done
                  ? <Check size={14} strokeWidth={3} aria-hidden="true" />
                  : <span className="relative z-10">{idx + 1}</span>
                }
              </div>

              {/* Label */}
              <span className={[
                'text-xs font-semibold leading-none transition-colors whitespace-nowrap',
                active && 'text-teal-600',
                done   && 'text-teal-500',
                future && 'text-gray-400',
              ].filter(Boolean).join(' ')}>
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{step.short}</span>
              </span>
            </Link>

            {/* Ligne de progression */}
            {idx < STEPS.length - 1 && (
              <div className="flex-1 mx-2 sm:mx-3 h-0.5 bg-gray-100 rounded-full overflow-hidden mt-[-10px]">
                <div
                  className="h-full bg-teal-gradient rounded-full transition-all duration-500 ease-out"
                  style={{ width: idx < currentIdx ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
