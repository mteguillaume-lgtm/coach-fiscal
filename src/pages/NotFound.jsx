import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center text-center gap-6 py-24">
      <div className="text-6xl font-bold text-gray-100 select-none">404</div>
      <div>
        <p className="text-xl font-semibold text-gray-800 mb-1">Page introuvable</p>
        <p className="text-sm text-gray-400">
          Cette page n'existe pas ou a été déplacée.
        </p>
      </div>
      <Button onClick={() => navigate('/')} size="md">
        ← Retour à l'accueil
      </Button>
    </div>
  );
}
