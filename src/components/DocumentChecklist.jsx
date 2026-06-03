import { useState } from 'react';
import { CheckCircle, Circle, ChevronDown, ListChecks } from 'lucide-react';
import { documentsForFlags } from '../data/documentTypes/index.js';

// Ordre d'affichage + libellés des paliers (tiers) du registre.
const TIER_ORDER = ['socle', 'enveloppes', 'immobilier', 'specifique'];
const TIER_LABELS = {
  socle:      'Documents de base',
  enveloppes: 'Épargne & placements',
  immobilier: 'Immobilier',
  specifique: 'Situations spécifiques',
};

/**
 * Checklist de documents PERSONNALISÉE par les flags de l'étape 0 (situation).
 * Socle (toujours) + situationnel (révélé par les flags). Coche automatiquement
 * les types déjà détectés au dépôt (Couche 2). Purement informative.
 *
 * @param {object}   props
 * @param {Record<string,boolean>} props.modules     - collectProfile.modules
 * @param {string[]} [props.detectedIds]             - typeIds déjà détectés
 */
export default function DocumentChecklist({ modules = {}, detectedIds = [] }) {
  const [open, setOpen] = useState(true);
  const docs = documentsForFlags(modules);
  const detected = new Set(detectedIds);

  // Regroupement par tier, dans l'ordre canonique.
  const byTier = TIER_ORDER
    .map(tier => ({ tier, items: docs.filter(d => d.tier === tier) }))
    .filter(g => g.items.length > 0);

  const total = docs.length;
  const found = docs.filter(d => detected.has(d.id)).length;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/80 transition-colors"
      >
        <span className="flex items-center gap-2.5 text-sm font-medium text-gray-800">
          <ListChecks size={15} className="text-teal-600" />
          Documents à préparer
          <span className="text-xs font-normal text-gray-400">
            ({found}/{total} détecté{found > 1 ? 's' : ''})
          </span>
        </span>
        <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 flex flex-col gap-5">
          <p className="text-xs text-gray-400 -mt-1">
            Liste adaptée à votre situation. Les documents cochés ont été reconnus au dépôt.
          </p>
          {byTier.map(({ tier, items }) => (
            <div key={tier}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                {TIER_LABELS[tier] ?? tier}
              </p>
              <ul className="flex flex-col gap-1.5">
                {items.map(d => {
                  const ok = detected.has(d.id);
                  return (
                    <li key={d.id} className="flex items-center gap-2 text-sm">
                      {ok
                        ? <CheckCircle size={15} className="text-teal-500 shrink-0" />
                        : <Circle size={15} className="text-gray-300 shrink-0" />}
                      <span className={ok ? 'text-gray-700 font-medium' : 'text-gray-500'}>
                        {d.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
