import { useEffect, useState } from 'react';
import { useNavigate }         from 'react-router-dom';
import toast                   from 'react-hot-toast';
import { Copy, Download, MessageCircle, ArrowLeft, Check } from 'lucide-react';

import { useApp } from '../context/AppContext';
import Button     from '../components/Button';
import Card       from '../components/Card';

export default function Profile() {
  const { state }  = useApp();
  const navigate   = useNavigate();
  const [copied, setCopied] = useState(false);

  // Garde-fou : profil vide → retour à /collect
  useEffect(() => {
    if (!state.profile) {
      toast.error('Aucun profil généré — remplis le formulaire d\'abord.');
      navigate('/collect', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state.profile) return null;

  const profile = state.profile;

  const handleCopy = () => {
    navigator.clipboard.writeText(profile).then(() => {
      setCopied(true);
      toast.success('Profil copié dans le presse-papiers !');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => toast.error('Échec de la copie.'));
  };

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([profile], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `profil-fiscal-${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Fichier téléchargé.');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-20">

      {/* Titre */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Votre profil fiscal</h1>
        <p className="text-sm text-gray-500">
          Voici la synthèse structurée que Claude utilisera pour vous conseiller.
        </p>
      </div>

      {/* Aperçu du profil */}
      <Card className="mb-5 p-0 overflow-hidden">
        {/* Barre de titre style éditeur */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-mono text-teal-600 font-medium">📄 profil-fiscal.txt</span>
          <span className="text-xs font-mono text-gray-400">{profile.length} car.</span>
        </div>
        <pre
          className="font-mono text-xs leading-relaxed text-gray-600 p-5 whitespace-pre-wrap break-words overflow-y-auto"
          style={{ maxHeight: '60vh', background: '#f8f9fa' }}
        >
          {profile}
        </pre>
      </Card>

      {/* Actions principales */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={handleCopy}
        >
          {copied
            ? <><Check size={15} /> Copié !</>
            : <><Copy size={15} /> Copier</>}
        </Button>

        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={handleDownload}
        >
          <Download size={15} /> Télécharger .txt
        </Button>

        <Button
          variant="primary"
          size="md"
          className="flex-1 sm:flex-[2]"
          onClick={() => navigate('/chat')}
        >
          <MessageCircle size={15} /> Démarrer le conseil →
        </Button>
      </div>

      {/* Retour */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/collect')}
      >
        <ArrowLeft size={14} /> Modifier mes données
      </Button>

    </div>
  );
}
