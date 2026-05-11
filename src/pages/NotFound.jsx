import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import Button from '../components/Button';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center text-center gap-6 py-20">
      <div className="relative select-none">
        <div
          className="text-[96px] font-black leading-none tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #9FE1CB 0%, #1D9E75 50%, #0F6E56 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          404
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 text-[96px] font-black leading-none tracking-tight blur-2xl opacity-20 text-teal-400"
        >
          404
        </div>
      </div>

      <div className="flex flex-col gap-2 max-w-xs">
        <p className="text-xl font-bold text-gray-800">Page introuvable</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          Cette page n'existe pas ou a été déplacée.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="md" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Retour
        </Button>
        <Button size="md" onClick={() => navigate('/')}>
          <Home size={14} /> Accueil
        </Button>
      </div>
    </div>
  );
}
