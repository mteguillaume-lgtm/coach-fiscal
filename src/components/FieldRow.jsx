// FieldRow — rendu d'un champ du formulaire de collecte (extrait de Collect.jsx,
// audit E6). Accessible : label associé (htmlFor/id), hint lié (aria-describedby),
// groupe Oui/Non sémantique (role=group + aria-pressed), retour de calcul annoncé
// (aria-live). Défini hors du composant page pour éviter la perte de focus au re-render.

import { Sparkles } from 'lucide-react';
import { fieldVisible } from '../lib/fieldVisibility';

// Champs numériques qui NE sont PAS des montants (âges, comptes, taux, durées…)
// → on n'y applique pas le formatage monétaire (séparateurs de milliers + €).
const NON_MONEY_KEY = /age|parts|enfants|retraite|duree|distance|frais_jours|frais_cv|taux|tmi|_nb$|pension_nb|invalidite_demiparts|scol_/i;
const isMoneyField = (f) => f.type === 'number' && !NON_MONEY_KEY.test(f.key);

// Détecte un champ Oui/Non (rendu en boutons segmentés plutôt qu'en menu déroulant).
const isYesNo = (f) =>
  f.type === 'select' && Array.isArray(f.opts) && f.opts.length === 2 &&
  f.opts.every(o => o === 'Oui' || o === 'Non');

export default function FieldRow({ f, value, onChange, autoFKeys, formData = {} }) {
  if (!fieldVisible(f, formData)) return null;

  const isAuto = !!(autoFKeys && autoFKeys[f.key]);
  const money  = isMoneyField(f);
  const base = [
    'w-full rounded-xl border px-3 py-2.5 text-sm bg-white',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all',
    'font-sans placeholder:text-gray-300',
    money ? 'text-right tabular-nums pr-7' : '',
    isAuto ? 'border-teal-300 focus:ring-teal-300/50' : 'border-gray-200 focus:ring-teal-300/50',
  ].join(' ');

  const computedInfo = f.compute ? f.compute(formData, value) : null;
  const hintWarn = f.hint && f.hint.trimStart().startsWith('⚠️');

  // Identifiants d'accessibilité dérivés de la clé du champ.
  const inputId = `field-${f.key}`;
  const hintId  = f.hint ? `${inputId}-hint` : undefined;
  const labelId = `${inputId}-label`;

  // Montant : on stocke des chiffres bruts (le générateur/parseur lit parseFloat),
  // mais on AFFICHE un format français avec séparateurs de milliers.
  const moneyDisplay = (() => {
    if (!money || value === '' || value == null) return '';
    const digits = String(value).replace(/[^\d]/g, '');
    return digits ? Number(digits).toLocaleString('fr-FR') : '';
  })();

  return (
    <div>
      <label htmlFor={isYesNo(f) ? undefined : inputId} id={labelId} className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
        <span>{f.label}</span>
        {f.essential && (
          <span className="inline-flex items-center px-1.5 py-px rounded-full bg-teal-100 text-teal-700 text-[10px] font-semibold uppercase tracking-wide">
            essentiel
          </span>
        )}
        {isAuto && (
          <span className="inline-flex items-center gap-0.5 text-teal-500 text-xs font-normal">
            <Sparkles size={10} /> auto
          </span>
        )}
      </label>

      {isYesNo(f) ? (
        <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={labelId} aria-describedby={hintId}>
          {['Oui', 'Non'].map(opt => {
            const active = value === opt;
            return (
              <button
                key={opt} type="button"
                aria-pressed={active}
                onClick={() => onChange(f.key, active ? '' : opt)}
                className={[
                  'py-2.5 rounded-xl border-2 text-sm font-semibold transition-all',
                  active
                    ? (opt === 'Oui' ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-gray-300 bg-gray-50 text-gray-600')
                    : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300',
                ].join(' ')}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : f.type === 'select' ? (
        <select
          id={inputId}
          aria-describedby={hintId}
          value={value || ''}
          onChange={e => onChange(f.key, e.target.value)}
          className={base}
        >
          <option value="">— Choisir —</option>
          {f.opts.map(o => {
            const val = typeof o === 'object' ? o.value : o;
            const lab = typeof o === 'object' ? o.label : o;
            return <option key={val} value={val}>{lab}</option>;
          })}
        </select>
      ) : money ? (
        <div className="relative">
          <input
            id={inputId}
            aria-describedby={hintId}
            type="text"
            inputMode="numeric"
            placeholder={f.ph}
            value={moneyDisplay}
            onChange={e => onChange(f.key, e.target.value.replace(/[^\d]/g, ''))}
            className={base}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
        </div>
      ) : (
        <input
          id={inputId}
          aria-describedby={hintId}
          type={f.type}
          inputMode={f.type === 'number' ? 'numeric' : undefined}
          placeholder={f.ph}
          value={value || ''}
          onChange={e => onChange(f.key, e.target.value)}
          className={base}
        />
      )}

      {f.hint && (
        <p id={hintId} className={`mt-1.5 text-xs leading-snug ${hintWarn ? 'text-amber-600' : 'text-gray-400'}`}>{f.hint}</p>
      )}
      {computedInfo && (
        <p aria-live="polite" className={[
          'mt-1.5 text-xs leading-snug whitespace-pre-line',
          computedInfo.startsWith('✅') ? 'text-teal-600' :
          computedInfo.startsWith('⚠️') ? 'text-amber-600' :
          'text-blue-500',
        ].join(' ')}>
          {computedInfo}
        </p>
      )}
    </div>
  );
}
