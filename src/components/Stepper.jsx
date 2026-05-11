import { useLocation, Link } from 'react-router-dom';
import { Check } from 'lucide-react';

const STEPS = [
  { label: 'Anonymisation', path: '/anonymize' },
  { label: 'Collecte',      path: '/collect'   },
  { label: 'Profil',        path: '/profile'   },
  { label: 'Conseil',       path: '/chat'      },
];

export default function Stepper() {
  const { pathname } = useLocation();
  const currentIdx = STEPS.findIndex(s => pathname.startsWith(s.path));

  return (
    <nav aria-label="Progression du bilan" className="flex items-center">
      {STEPS.map((step, idx) => {
        const done   = idx < currentIdx;
        const active = idx === currentIdx;

        return (
          <div key={step.path} className="flex items-center flex-1 last:flex-none">
            {/* Cercle + label */}
            <Link
              to={step.path}
              aria-current={active ? 'step' : undefined}
              className="flex items-center gap-2 shrink-0"
            >
              <span
                className={[
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all',
                  active && 'bg-teal-600 border-teal-600 text-white',
                  done   && 'bg-teal-500 border-teal-500 text-white',
                  !active && !done && 'bg-white border-gray-300 text-gray-400',
                ].filter(Boolean).join(' ')}
              >
                {done
                  ? <Check size={13} strokeWidth={3} aria-hidden="true" />
                  : idx + 1
                }
              </span>
              <span
                className={[
                  'text-sm font-medium hidden sm:block',
                  active && 'text-teal-600',
                  done   && 'text-teal-500',
                  !active && !done && 'text-gray-400',
                ].filter(Boolean).join(' ')}
              >
                {step.label}
              </span>
            </Link>

            {/* Ligne de connexion */}
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  'flex-1 h-px mx-3 transition-colors',
                  idx < currentIdx ? 'bg-teal-400' : 'bg-gray-200',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
