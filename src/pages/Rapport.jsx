import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Printer, Download, ArrowLeft, Sparkles, Wand2, FileText } from 'lucide-react';
import Button from '../components/Button';

// ─── Sections IA (enrichissement) ─────────────────────────────────────────────

const AI_TITLES = ['DÉCLARATION', 'ANALYSE DES SITUATIONS', 'POINTS D\'ATTENTION', 'OBJECTIFS PRIORITAIRES'];

function isAiSection(title) {
  return AI_TITLES.some(k => title.toUpperCase().includes(k.toUpperCase()));
}

function sectionIcon(title) {
  const t = title.toUpperCase();
  if (t.includes('SITUATION'))    return '👤';
  if (t.includes('REVENUS 2025')) return '💼';
  if (t.includes('REVENUS DU'))   return '🏠';
  if (t.includes('DONNÉES POUR')) return '🧮';
  if (t.includes('PLAFOND'))      return '📈';
  if (t.includes('ÉPARGNE'))      return '🏦';
  if (t.includes('DÉDUCTIONS'))   return '✂️';
  if (t.includes('IMMOBILIER'))   return '🏘️';
  if (t.includes('DÉCLARATION'))  return '📋';
  if (t.includes('ANALYSE'))      return '🔍';
  if (t.includes('POINTS'))       return '⚠️';
  if (t.includes('OBJECTIFS'))    return '🎯';
  if (t.includes('DONNÉES BRUTES')) return '📄';
  return '📌';
}

// ─── Parsers de contenu ───────────────────────────────────────────────────────

function parseProfileSections(text) {
  if (!text) return [];
  const sections = [];
  let current = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^==\s*(.+?)\s*==\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

// ─── Renderers de contenu ─────────────────────────────────────────────────────

function AttentionLine({ line }) {
  const trimmed = line.trim();
  if (!trimmed) return <div className="h-1" />;

  const isCritique   = trimmed.startsWith('[🔴') || trimmed.startsWith('[\u{1F534}');
  const isConfirmer  = trimmed.startsWith('[🟡') || trimmed.startsWith('[\u{1F7E1}');
  const isOptimise   = trimmed.startsWith('[🟢') || trimmed.startsWith('[\u{1F7E2}');

  if (isCritique) return (
    <div className="border-l-2 border-red-400 pl-3 py-1.5 my-1 bg-red-50 rounded-r-lg">
      <p className="text-xs text-red-800 leading-relaxed">{trimmed}</p>
    </div>
  );
  if (isConfirmer) return (
    <div className="border-l-2 border-amber-400 pl-3 py-1.5 my-1 bg-amber-50 rounded-r-lg">
      <p className="text-xs text-amber-800 leading-relaxed">{trimmed}</p>
    </div>
  );
  if (isOptimise) return (
    <div className="border-l-2 border-teal-400 pl-3 py-1.5 my-1 bg-teal-50 rounded-r-lg">
      <p className="text-xs text-teal-800 leading-relaxed">{trimmed}</p>
    </div>
  );
  return <p className="text-xs text-gray-700 leading-relaxed py-0.5">{trimmed}</p>;
}

function SectionContent({ title, lines }) {
  const content = lines.join('\n').trim();
  if (!content) return null;

  const t = title.toUpperCase();

  if (t.includes('POINTS D\'ATTENTION') || t.includes("POINTS D'ATTENTION")) {
    return (
      <div className="space-y-0.5">
        {lines.map((line, i) => <AttentionLine key={i} line={line} />)}
      </div>
    );
  }

  return (
    <pre className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ section }) {
  const ai      = isAiSection(section.title);
  const icon    = sectionIcon(section.title);
  const content = section.lines.join('\n').trim();
  if (!content) return null;

  return (
    <div className={[
      'rounded-2xl border overflow-hidden shadow-sm print:shadow-none print:border print:rounded-none',
      ai ? 'border-violet-200 bg-violet-50/20' : 'border-gray-200 bg-white',
    ].join(' ')}>
      {/* Header */}
      <div className={[
        'px-5 py-3 flex items-center justify-between border-b',
        ai ? 'bg-violet-50 border-violet-200' : 'bg-gray-50 border-gray-100',
      ].join(' ')}>
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden="true">{icon}</span>
          <h3 className={`text-sm font-bold ${ai ? 'text-violet-900' : 'text-gray-800'}`}>
            {section.title}
          </h3>
        </div>
        {ai && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full print:hidden">
            <Sparkles size={9} aria-hidden="true" /> Enrichi IA
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-5 py-4">
        <SectionContent title={section.title} lines={section.lines} />
      </div>
    </div>
  );
}

// ─── Page Rapport ─────────────────────────────────────────────────────────────

export default function Rapport() {
  const { state } = useApp();
  const navigate  = useNavigate();
  const profile   = state.profile;

  const sections   = useMemo(() => parseProfileSections(profile), [profile]);
  const hasAi      = sections.some(s => isAiSection(s.title));

  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <FileText size={36} className="text-gray-300" />
        <p className="text-sm text-gray-500">Aucun profil généré. Commencez par la collecte.</p>
        <Button onClick={() => navigate('/collect')}>Aller à la collecte →</Button>
      </div>
    );
  }

  const handlePrint = () => window.print();

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([profile], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `rapport-fiscal-${date}.txt`,
    }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="print:hidden">
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Rapport</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Rapport fiscal complet</h1>
        <p className="text-sm text-gray-500 mt-1">
          {hasAi
            ? 'Profil enrichi par analyse IA — déclaration, situations, objectifs.'
            : 'Profil de base — enrichissez avec l\'IA pour l\'analyse complète.'}
        </p>
      </div>

      {/* Banner si non enrichi */}
      {!hasAi && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3 print:hidden">
          <Wand2 size={16} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Profil non encore enrichi</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              Retournez sur le profil et cliquez sur "Enrichir avec l'IA" pour obtenir
              l'analyse complète des cases 2042, situations particulières, points critiques et objectifs.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate('/profile')} className="shrink-0">
            Enrichir →
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap print:hidden">
        <Button variant="secondary" size="sm" onClick={handlePrint}>
          <Printer size={14} /> Imprimer / PDF
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownload}>
          <Download size={14} /> Télécharger .txt
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>
          <ArrowLeft size={14} /> Retour au profil
        </Button>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-4">
        {sections.map((section, i) => (
          <SectionCard key={i} section={section} />
        ))}
      </div>

      {/* Bas de page : imprimer */}
      <div className="flex gap-3 flex-wrap pt-2 print:hidden">
        <Button variant="secondary" size="sm" onClick={handlePrint}>
          <Printer size={14} /> Imprimer / PDF
        </Button>
      </div>

    </div>
  );
}
