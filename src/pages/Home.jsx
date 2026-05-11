import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, MapPin, Bot, ArrowRight } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';

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
  } catch {
    return false;
  }
}

const PROMISES = [
  {
    icon: <Lock size={22} className="text-teal-600" aria-hidden="true" />,
    title: '100% local',
    desc: 'Vos données ne quittent jamais votre navigateur.',
  },
  {
    icon: <MapPin size={22} className="text-teal-600" aria-hidden="true" />,
    title: '4 étapes guidées',
    desc: 'Anonymisation · Collecte · Profil · Conseil expert.',
  },
  {
    icon: <Bot size={22} className="text-teal-600" aria-hidden="true" />,
    title: 'Conseil expert IA',
    desc: '7 skills fiscaux actifs, personnalisés sur votre profil.',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [sessionActive, setSessionActive] = useState(false);

  useEffect(() => {
    setSessionActive(hasActiveSession());
  }, []);

  return (
    <div className="flex flex-col items-center text-center gap-10 py-8">

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 max-w-lg">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 text-teal-700 text-sm font-medium rounded-full border border-teal-100">
          <Lock size={13} aria-hidden="true" />
          100% privé · open source
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
          Coach Fiscal
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          Votre bilan fiscal personnalisé en 30 minutes,&nbsp;100%&nbsp;privé.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Button size="lg" onClick={() => navigate('/setup')}>
            Démarrer mon bilan <ArrowRight size={18} aria-hidden="true" />
          </Button>
          {sessionActive && (
            <Button size="lg" variant="secondary" onClick={() => navigate('/collect')}>
              Reprendre mon bilan
            </Button>
          )}
        </div>
      </div>

      {/* Promesses */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        {PROMISES.map(({ icon, title, desc }) => (
          <Card key={title} className="flex flex-col items-center text-center gap-3 py-8">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              {icon}
            </div>
            <p className="font-semibold text-gray-800">{title}</p>
            <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
          </Card>
        ))}
      </div>

      {/* Bandeau confidentialité */}
      <div className="w-full bg-teal-600 text-white rounded-xl px-6 py-4 flex items-center justify-center gap-2 text-sm font-medium">
        <Lock size={15} aria-hidden="true" />
        Vos données fiscales ne quittent jamais votre navigateur — vérifié dans&nbsp;
        <span className="underline underline-offset-2">DevTools › Network</span>
      </div>

    </div>
  );
}
