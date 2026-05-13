import { useMemo, useEffect } from 'react';
import { useNavigate }       from 'react-router-dom';
import toast                 from 'react-hot-toast';
import { ArrowLeft, Sparkles } from 'lucide-react';

import { useApp }              from '../context/AppContext';
import { detectOpportunities } from '../lib/opportunitiesDetector';
import OpportunitiesPanel      from '../components/OpportunitiesPanel';
import Button                  from '../components/Button';
import PERBandeau              from '../components/PERBandeau';

export default function Opportunites() {
  const { state } = useApp();
  const navigate  = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      if (!state.profile) {
        toast.error('Génère ton profil fiscal d\'abord.');
        navigate('/collect', { replace: true });
      }
    }, 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opportunities = useMemo(
    () => detectOpportunities(state.parsedProfile ?? {}),
    [state.parsedProfile]
  );

  if (!state.profile) return null;

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Analyse patrimoniale</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Opportunités fiscales</h1>
        <p className="text-sm text-gray-500 mt-1">
          {opportunities.length > 0
            ? `${opportunities.length} opportunité${opportunities.length > 1 ? 's' : ''} identifiée${opportunities.length > 1 ? 's' : ''} dans votre profil.`
            : 'Analyse de votre profil fiscal.'}
        </p>
      </div>

      <PERBandeau />

      {/* Panel */}
      <OpportunitiesPanel opportunities={opportunities} />

      {/* État vide */}
      {opportunities.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm font-semibold text-gray-700">Aucune opportunité détectée automatiquement</p>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
            Votre profil ne déclenche pas de détection automatique. Posez directement vos questions au Coach Fiscal.
          </p>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="mt-4 px-4 py-2 text-xs font-semibold text-teal-600 border border-teal-200 rounded-xl hover:bg-teal-50 transition-colors"
          >
            Démarrer le conseil →
          </button>
        </div>
      )}

      {/* Actions bas de page */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>
          <ArrowLeft size={14} /> Retour au profil
        </Button>
        <Button variant="primary" size="md" className="sm:ml-auto" onClick={() => navigate('/chat')}>
          <Sparkles size={14} /> Démarrer le conseil →
        </Button>
      </div>

    </div>
  );
}
