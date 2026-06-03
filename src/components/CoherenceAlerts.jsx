import { AlertTriangle, Plus } from 'lucide-react';

// Couleur par type d'écart : information douce (socle) vs alerte (missing/undeclared).
const TONE = {
  socle:      'border-gray-200 bg-gray-50 text-gray-700',
  missing:    'border-amber-200 bg-amber-50 text-amber-800',
  undeclared: 'border-amber-200 bg-amber-50 text-amber-800',
};

/**
 * Bannières NON BLOQUANTES du contrôle de cohérence déclaré ↔ détecté.
 *
 * @param {object}   props
 * @param {Array}    props.alerts          - sortie de checkCoherence()
 * @param {Function} props.onEnableModule  - (flag) => void  (active un module manquant)
 */
export default function CoherenceAlerts({ alerts = [], onEnableModule }) {
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
        <AlertTriangle size={13} className="text-amber-500" />
        Points à vérifier ({alerts.length})
      </p>
      {alerts.map((a, i) => (
        <div
          key={`${a.kind}-${a.flag || a.typeId || i}`}
          className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${TONE[a.kind] || TONE.missing}`}
        >
          <AlertTriangle size={15} className="shrink-0 mt-0.5 opacity-70" />
          <p className="flex-1 leading-snug">{a.message}</p>
          {a.action?.type === 'enableModule' && (
            <button
              type="button"
              onClick={() => onEnableModule?.(a.action.flag)}
              className="shrink-0 flex items-center gap-1 text-xs font-semibold border border-amber-300 bg-white text-amber-700 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors"
            >
              <Plus size={12} /> Ajouter à ma situation
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
