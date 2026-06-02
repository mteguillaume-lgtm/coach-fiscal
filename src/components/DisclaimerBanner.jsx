import { Info, ExternalLink } from 'lucide-react';
import { DISCLAIMER_GLOBAL, LIEN_VERIF_OFFICIEL } from '../lib/conseilPatrimonial';

/**
 * Disclaimer global permanent (PHASE 7) — rappel que l'outil est une aide à la
 * décision, ne remplace pas un conseil professionnel, et invitation à vérifier sur
 * impots.gouv.fr. Rendu sur toutes les pages de résultats (Opportunités, Rapport,
 * Dashboard). `variant` adapte le contraste au fond clair ou sombre.
 */
export default function DisclaimerBanner({ variant = 'dark', className = '' }) {
  const isDark = variant === 'dark';
  const base = isDark
    ? 'bg-white/5 border-white/10 text-ink-100'
    : 'bg-slate-50 border-slate-200 text-slate-600';
  const linkCls = isDark ? 'text-kapio-300 hover:text-kapio-200' : 'text-teal-600 hover:text-teal-700';

  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed ${base} ${className}`}
    >
      <Info size={14} className="mt-0.5 shrink-0 opacity-70" aria-hidden="true" />
      <p>
        {DISCLAIMER_GLOBAL.replace(/\s*Vérifiez.*$/, '').trim()}{' '}
        <a
          href={LIEN_VERIF_OFFICIEL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline ${linkCls}`}
        >
          Vérifiez sur impots.gouv.fr
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </p>
    </div>
  );
}
