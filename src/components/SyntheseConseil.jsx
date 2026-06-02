import { ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

const fmt = (v) => Math.round(v || 0).toLocaleString('fr-FR');

/**
 * Synthèse patrimoniale (PHASE 7) — vue « sans action / avec action » chiffrée
 * + zones non couvertes orientant vers un professionnel. Alimentée par
 * conseilPatrimonial.genererSynthese(). Thème sombre (page Opportunités).
 */
export default function SyntheseConseil({ synthese }) {
  if (!synthese) return null;
  const { totalDuActuel, gainTotal, totalDuApresAction, synthese: texte, zonesNonCouvertes = [] } = synthese;

  return (
    <div className="flex flex-col gap-4">

      {/* Synthèse rédigée */}
      <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={15} className="text-kapio-300" />
          <h2 className="text-base font-bold text-ink-0">Synthèse patrimoniale</h2>
        </div>
        <p className="text-sm text-ink-100 leading-relaxed">{texte}</p>

        {/* Comparaison sans / avec action */}
        {gainTotal > 0 && (
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="rounded-xl bg-ink-700/50 border border-white/[0.06] px-4 py-3 text-center">
              <p className="text-[11px] uppercase tracking-widest text-ink-300 font-bold">Sans action</p>
              <p className="text-lg font-bold text-ink-50 font-mono">{fmt(totalDuActuel)} €</p>
            </div>
            <ArrowRight size={18} className="text-kapio-300" />
            <div className="rounded-xl bg-kapio-500/[0.08] border border-kapio-500/30 px-4 py-3 text-center">
              <p className="text-[11px] uppercase tracking-widest text-kapio-300 font-bold">Avec action</p>
              <p className="text-lg font-bold text-kapio-200 font-mono">{fmt(totalDuApresAction)} €</p>
            </div>
          </div>
        )}
        {gainTotal > 0 && (
          <p className="mt-2 text-center text-xs text-kapio-300 font-semibold">
            Gain potentiel : {fmt(gainTotal)} €
          </p>
        )}
      </div>

      {/* Zones non couvertes → orientation professionnelle */}
      {zonesNonCouvertes.length > 0 && (
        <div className="rounded-2xl border border-warning-500/30 bg-warning-500/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={15} className="text-warning-400" />
            <h3 className="text-sm font-bold text-ink-0">Points à confier à un professionnel</h3>
          </div>
          <ul className="flex flex-col gap-3">
            {zonesNonCouvertes.map(z => (
              <li key={z.id} className="text-xs leading-relaxed">
                <p className="font-semibold text-ink-50">{z.signal}</p>
                <p className="text-ink-200">{z.pourquoi}</p>
                <p className="mt-0.5 text-warning-300 font-medium">→ {z.professionnel}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
