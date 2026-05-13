import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate }    from 'react-router-dom';
import toast              from 'react-hot-toast';
import {
  ChevronDown, X, CheckCircle, AlertCircle, Loader2, ArrowLeft,
  Upload, Sparkles, Users, User, Home, TrendingUp, Scissors, Building2, FolderOpen,
} from 'lucide-react';

import { useApp }                   from '../context/AppContext';
import { analyzeDoc, mapExtracted } from '../lib/extractor';
import { parseProfile }             from '../lib/profileParser';
import { buildProfile }             from '../lib/profileGenerator';
import { abattement10 }             from '../lib/taxCalculator';
import Button                       from '../components/Button';
import Card                         from '../components/Card';

// ─── Compute helpers (module-level — called by FieldRow at render time) ────────

function _parseMMAAAA(value) {
  if (!value || !value.includes('/')) return null;
  const [m, y] = value.split('/');
  const year = parseInt(y, 10); const month = parseInt(m, 10);
  if (isNaN(year) || isNaN(month) || year < 1970 || year > 2100) return null;
  const d = new Date(year, month - 1, 1);
  return d > new Date() ? null : d;
}

function computePeaDate(data, value) {
  const d = _parseMMAAAA(value);
  if (!d) return null;
  const ageYears = (Date.now() - d) / 31_557_600_000;
  const age  = Math.floor(ageYears);
  const ok   = ageYears >= 5;
  const verse = parseFloat(data.pea_verse || 0);
  const espace = Math.max(0, 150_000 - verse);
  const line1 = ok
    ? `✅ Antériorité ${age} ans — exonération IR acquise (PS 17,2 % toujours dus)`
    : `⚠️ Antériorité ${age} ans — encore ${Math.ceil((5 - ageYears) * 12)} mois avant exonération IR`;
  return verse > 0 ? `${line1}\nEspace versement restant : ${espace.toLocaleString('fr-FR')} €` : line1;
}

function computePelDate(_data, value) {
  const d = _parseMMAAAA(value);
  if (!d) return null;
  const year  = d.getFullYear();
  const month = d.getMonth() + 1; // getMonth() est 0-indexé
  // Changement de régime au 1er mars 2011 (BOI-RPPM-RCM-20-10-20-60)
  const avantMars2011 = year < 2011 || (year === 2011 && month < 3);
  if (avantMars2011) return '✅ Ouvert avant mars 2011 — exonération IR (PS 17,2 % toujours dus)';
  if (year <= 2017) {
    const exoEnd = year + 12;
    return new Date().getFullYear() < exoEnd
      ? `✅ Exonéré IR jusqu'en ${exoEnd} (PS 17,2 % toujours dus)`
      : `⚠️ Exonération IR échue en ${exoEnd} — PFU 30 % applicable`;
  }
  // 2018 et au-delà (le changement s'applique dès le 1er janvier 2018)
  return '⚠️ Ouvert à partir de 2018 — PFU 30 % dès la 1re année';
}

function computeAvDate(_data, value) {
  const d = _parseMMAAAA(value);
  if (!d) return null;
  const ageYears = (Date.now() - d) / 31_557_600_000;
  const age = Math.floor(ageYears);
  return ageYears >= 8
    ? `✅ Antériorité ${age} ans — abattement fiscal acquis`
    : `⚠️ Antériorité ${age} ans — encore ${Math.ceil((8 - ageYears) * 12)} mois avant l'abattement 8 ans`;
}

function computeCryptoPv(data, _value) {
  // Seuil 305 € = montant brut des cessions (pas la PV) — art. 150 VH bis CGI
  // Au-delà : 2086 obligatoire ET imposition sur toute la PV (pas seulement l'excédent)
  const cede = parseFloat(data.crypto_montant_cede || 0);
  if (cede > 305) return '⚠️ Cessions > 305 € — formulaire 2086 obligatoire (PV imposée en totalité)';
  if (cede > 0) return '✅ Cessions ≤ 305 € — exonération totale si pas d\'autres cessions 2025';
  return null;
}

const TMI_RET_HINT = 'Estimez votre tranche d\'imposition à la retraite. 11% par défaut (pension < ~29 000 €/an). Crucial pour comparer PER vs PEA.';

// ─── Section data (module-level — stable references) ──────────────────────────

const SECTION_SIT = {
  id: 'sit', Icon: User, label: 'Situation du foyer', fields: [
    { key: 'statut',  label: 'Situation familiale', type: 'select', opts: ['Célibataire', 'Marié(e)', 'Pacsé(e)', 'Divorcé(e)', 'Veuf/Veuve'] },
    { key: 'parts',   label: 'Parts fiscales',      type: 'number', ph: '1, 1.5, 2…' },
    { key: 'enfants', label: 'Enfants à charge',    type: 'number', ph: '0' },
    { key: 'dept',    label: 'Département',         type: 'text',   ph: 'Calvados (14)' },
  ],
};

const REV_FIELDS = [
  { key: 'brut',     label: 'Brut imposable annuel (€)', type: 'number', ph: '54 810' },
  { key: 'net_imp',  label: 'Net imposable annuel (€)',  type: 'number', ph: '43 875' },
  { key: 'taux_pas', label: 'Taux PAS (%)',              type: 'number', ph: '11.80'  },
  { key: 'pas_tot',  label: 'PAS prélevé 2025 (€)',      type: 'number', ph: '4 302'  },
  { key: 'frais_r',  label: 'Frais réels (€)',           type: 'number', ph: 'vide = forfait 10%' },
];

const EP_INDIV_FIELDS = [
  { key: 'livret_a',           label: 'Livret A — solde (€)',          type: 'number', ph: '0' },
  { key: 'ldd',                label: 'LDDS — solde (€)',              type: 'number', ph: '0' },
  { key: 'lep',                label: 'LEP — solde (€)',               type: 'number', ph: '0' },
  { key: 'livret_plus',        label: 'Livret+ / Livret bancaire (€)', type: 'number', ph: '0' },
  { key: 'pel',                label: 'PEL — solde (€)',               type: 'number', ph: '0' },
  { key: 'pel_date',           label: 'PEL — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePelDate },
  { key: 'pea',                label: 'PEA — valorisation (€)',        type: 'number', ph: '0' },
  { key: 'pea_date',           label: 'PEA — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePeaDate },
  { key: 'pea_verse',          label: 'PEA — total versé (€)',         type: 'number', ph: '0' },
  { key: 'per',                label: 'PER versements 2025 (€)',       type: 'number', ph: '0' },
  { key: 'av',                 label: 'Assurance-vie — valorisation (€)', type: 'number', ph: '0' },
  { key: 'av_date',            label: 'AV — date souscription',        type: 'text',   ph: 'MM/AAAA', compute: computeAvDate },
  { key: 'av_verse',           label: 'AV — versements nets cumulés (€)', type: 'number', ph: '0',
    dependsOn: { key: 'av', check: v => parseFloat(v || 0) > 0 },
    hint: 'Tous contrats AV de ce déclarant. Seuil 150 000 € (art. 125-0 A CGI).' },
  { key: 'crypto_wallet',      label: 'Crypto — valeur wallet (€)',    type: 'number', ph: '0' },
  { key: 'crypto_plateforme',  label: 'Crypto — plateforme',           type: 'select',
    opts: ['Binance', 'Coinbase', 'Kraken', 'Ledger (hardware)', 'Plateforme française', 'Autre'],
    dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
  { key: 'crypto_cessions',    label: 'Cessions crypto 2025 ?',        type: 'select', opts: ['Non', 'Oui'],
    dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
  { key: 'crypto_montant_cede',label: 'Crypto — montant cédé (€)',     type: 'number', ph: '0',
    dependsOn: { key: 'crypto_cessions', value: 'Oui' } },
  { key: 'crypto_pv',          label: 'Crypto — plus-value estimée (€)', type: 'number', ph: '0',
    dependsOn: { key: 'crypto_cessions', value: 'Oui' }, compute: computeCryptoPv },
];

const PROFIL_INDIV_FIELDS = [
  { key: 'age',            label: 'Âge (ans)',                 type: 'number', ph: '35' },
  { key: 'retraite',       label: 'Âge retraite estimé',       type: 'number', ph: '63' },
  { key: 'tmi_retraite',   label: 'TMI retraite (%)',           type: 'select', opts: ['', '0', '11', '30', '41', '45'], hint: TMI_RET_HINT },
  { key: 'type_revenu',    label: 'Type de revenu principal',  type: 'select', opts: ['Salarié(e)', 'Retraité(e)', 'Mixte'], hint: 'Salarié(e) = case 1AJ (abat. 10% min 509 €/max 14 555 €). Retraité(e) = case 1AS (abat. 10% min 450 €/max 4 446 €). Mixte = les deux.' },
  { key: 'pension_net_imp',label: 'Pension nette imposable 1AS (€)', type: 'number', ph: '18 000',
    dependsOn: { key: 'type_revenu', value: 'Mixte' },
    hint: 'Montant 1AS uniquement. Le champ "Net imposable" ci-dessus = salaire 1AJ uniquement.' },
];

const SECTION_REV_SOLO = {
  id: 'rev', Icon: TrendingUp, label: 'Revenus 2025', fields: [
    { key: 'brut',     label: 'Brut imposable annuel (€)', type: 'number', ph: '54 810' },
    { key: 'net_imp',  label: 'Net imposable annuel (€)',  type: 'number', ph: '43 875' },
    { key: 'taux_pas', label: 'Taux PAS (%)',              type: 'number', ph: '11.80'  },
    { key: 'pas_tot',  label: 'PAS prélevé 2025 (€)',      type: 'number', ph: '4 302'  },
    { key: 'foncier',  label: 'Revenus fonciers (€)',      type: 'number', ph: '0' },
    { key: 'divid',    label: 'Dividendes/intérêts (€)',   type: 'number', ph: '0' },
    { key: 'crypto',   label: 'Revenus crypto (€)',        type: 'number', ph: '0' },
  ],
};

const SECTION_PROFIL_SOLO = {
  id: 'profil', Icon: User, label: 'Profil & Retraite', fields: [
    { key: 'age_d1',              label: 'Âge (ans)',                  type: 'number', ph: '35' },
    { key: 'retraite_d1',         label: 'Âge retraite estimé',        type: 'number', ph: '63' },
    { key: 'tmi_retraite_d1',     label: 'TMI retraite (%)',            type: 'select', opts: ['', '0', '11', '30', '41', '45'], hint: TMI_RET_HINT },
    { key: 'type_revenu_d1',      label: 'Type de revenu principal',   type: 'select', opts: ['Salarié(e)', 'Retraité(e)', 'Mixte'], hint: 'Salarié(e) = 1AJ (abat. min 509 €/max 14 555 €). Retraité(e) = 1AS (abat. min 450 €/max 4 446 €). Mixte = les deux.' },
    { key: 'pension_net_imp_d1',  label: 'Pension nette imposable 1AS (€)', type: 'number', ph: '18 000',
      dependsOn: { key: 'type_revenu_d1', value: 'Mixte' },
      hint: 'Montant 1AS uniquement. "Net imposable" ci-dessus = part salaire 1AJ.' },
  ],
};

const SECTION_EP_SOLO = {
  id: 'ep', Icon: Building2, label: 'Épargne & Placements', fields: [
    { key: 'livret_a',           label: 'Livret A — solde (€)',          type: 'number', ph: '0' },
    { key: 'ldd',                label: 'LDDS — solde (€)',              type: 'number', ph: '0' },
    { key: 'lep',                label: 'LEP — solde (€)',               type: 'number', ph: '0' },
    { key: 'livret_plus',        label: 'Livret+ / Livret bancaire (€)', type: 'number', ph: '0' },
    { key: 'pel',                label: 'PEL — solde (€)',               type: 'number', ph: '0' },
    { key: 'pel_date',           label: 'PEL — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePelDate },
    { key: 'pea',                label: 'PEA — valorisation (€)',        type: 'number', ph: '0' },
    { key: 'pea_date',           label: 'PEA — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePeaDate },
    { key: 'pea_verse',          label: 'PEA — total versé (€)',         type: 'number', ph: '0' },
    { key: 'av',                 label: 'Assurance-vie — valorisation (€)', type: 'number', ph: '0' },
    { key: 'av_date',            label: 'AV — date souscription',        type: 'text',   ph: 'MM/AAAA', compute: computeAvDate },
    { key: 'av_verse',           label: 'AV — versements nets cumulés (€)', type: 'number', ph: '0',
      dependsOn: { key: 'av', check: v => parseFloat(v || 0) > 0 },
      hint: 'Tous vos contrats AV confondus. Seuil fiscal : 150 000 € (art. 125-0 A CGI). En dessous = taux 7,5 % IR post-8 ans. Au-delà = PFU 12,8 % sur la fraction excédentaire.' },
    { key: 'per',                label: 'PER versements 2025 (€)',       type: 'number', ph: '0' },
    { key: 'crypto_wallet',      label: 'Crypto — valeur wallet (€)',    type: 'number', ph: '0' },
    { key: 'crypto_plateforme',  label: 'Crypto — plateforme',           type: 'select',
      opts: ['Binance', 'Coinbase', 'Kraken', 'Ledger (hardware)', 'Plateforme française', 'Autre'],
      dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
    { key: 'crypto_cessions',    label: 'Cessions crypto 2025 ?',        type: 'select', opts: ['Non', 'Oui'],
      dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
    { key: 'crypto_montant_cede',label: 'Crypto — montant cédé (€)',     type: 'number', ph: '0',
      dependsOn: { key: 'crypto_cessions', value: 'Oui' } },
    { key: 'crypto_pv',          label: 'Crypto — plus-value estimée (€)', type: 'number', ph: '0',
      dependsOn: { key: 'crypto_cessions', value: 'Oui' }, compute: computeCryptoPv },
  ],
};

const SECTION_DED_SOLO = {
  id: 'ded', Icon: Scissors, label: 'Déductions', fields: [
    { key: 'dons',     label: 'Dons associations (€)',                  type: 'number', ph: '0' },
    { key: 'garde',    label: 'Frais garde enfants (€)',                type: 'number', ph: '0' },
    { key: 'domicile', label: 'Emploi à domicile (€)',                  type: 'number', ph: '0' },
    { key: 'travaux',  label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0' },
    { key: 'pero_d1',  label: 'PERO — cotisations 2025 (€)',            type: 'number', ph: '0', hint: 'Déjà déduit de votre 1AJ — renseignez uniquement pour calculer votre plafond PER disponible N+1.' },
    { key: 'pension',  label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0' },
    { key: 'syndicat', label: 'Cotisations syndicales (€)',             type: 'number', ph: '0' },
    { key: 'frais_r',  label: 'Frais réels (€)',                        type: 'number', ph: 'vide = forfait 10%' },
    { key: 'per_n1',   label: 'PER reportable N-1 (€)',                 type: 'number', ph: '0', hint: 'Plafond non utilisé 2024 — case 6PS de votre avis d\'imposition 2024.' },
    { key: 'per_n2',   label: 'PER reportable N-2 (€)',                 type: 'number', ph: '0' },
    { key: 'per_n3',   label: 'PER reportable N-3 (€)',                 type: 'number', ph: '0' },
  ],
};

const SECTION_REV_FOYER = {
  id: 'rev_foyer', Icon: TrendingUp, label: 'Revenus du foyer', fields: [
    { key: 'foncier', label: 'Revenus fonciers (€)',    type: 'number', ph: '0' },
    { key: 'divid',   label: 'Dividendes/intérêts (€)', type: 'number', ph: '0' },
    { key: 'crypto',  label: 'Revenus crypto (€)',      type: 'number', ph: '0' },
  ],
};

const SECTION_DED = {
  id: 'ded', Icon: Scissors, label: 'Déductions du foyer', fields: [
    { key: 'dons',     label: 'Dons associations (€)',                  type: 'number', ph: '0' },
    { key: 'garde',    label: 'Frais garde enfants (€)',                type: 'number', ph: '0' },
    { key: 'domicile', label: 'Emploi à domicile (€)',                  type: 'number', ph: '0' },
    { key: 'travaux',  label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0' },
    { key: 'pero_d1',  label: 'PERO D1 — cotisations 2025 (€)',         type: 'number', ph: '0', hint: 'Déjà déduit du 1AJ — renseignez uniquement pour calculer le plafond PER D1 disponible N+1.' },
    { key: 'pero_d2',  label: 'PERO D2 — cotisations 2025 (€)',         type: 'number', ph: '0', hint: 'Déjà déduit du 1AJ — renseignez uniquement pour calculer le plafond PER D2 disponible N+1.' },
    { key: 'pension',  label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0' },
    { key: 'syndicat', label: 'Cotisations syndicales (€)',             type: 'number', ph: '0' },
    { key: 'per_n1',   label: 'PER reportable N-1 (€)',                 type: 'number', ph: '0', hint: 'Plafond non utilisé 2024 — case 6PS de votre avis d\'imposition 2024.' },
    { key: 'per_n2',   label: 'PER reportable N-2 (€)',                 type: 'number', ph: '0' },
    { key: 'per_n3',   label: 'PER reportable N-3 (€)',                 type: 'number', ph: '0' },
  ],
};

const SECTION_IMMO = {
  id: 'immo', Icon: Home, label: 'Immobilier', fields: [
    { key: 'proprio',           label: 'Propriétaire RP ?',              type: 'select', opts: ['Non', 'Oui'] },
    { key: 'rp_valeur',         label: 'RP — valeur estimée (€)',         type: 'number', ph: '280 000',
      dependsOn: { key: 'proprio', value: 'Oui' } },
    { key: 'credit_en_cours',   label: 'Crédit immobilier en cours ?',    type: 'select', opts: ['Non', 'Oui'],
      dependsOn: { key: 'proprio', value: 'Oui' } },
    { key: 'credit_crd',        label: 'Capital restant dû (€)',          type: 'number', ph: '150 000',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'credit_taux',       label: 'Taux crédit (%)',                 type: 'number', ph: '1.5',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'credit_mensualite', label: 'Mensualité crédit (€)',           type: 'number', ph: '900',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'credit_duree',      label: 'Durée restante (ans)',            type: 'number', ph: '15',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'taxe_fonciere',     label: 'Taxe foncière annuelle (€)',      type: 'number', ph: '0',
      dependsOn: { key: 'proprio', value: 'Oui' } },
    { key: 'locatif',           label: 'Bien locatif ?',                  type: 'select', opts: ['Non', 'Oui — micro', 'Oui — réel'] },
    { key: 'rev_loc',           label: 'Revenus locatifs 2025 (€)',       type: 'number', ph: '0' },
  ],
};

// Champs capacité d'épargne (pour comptage progression)
const CAPACITE_KEYS = ['charges_fixes', 'credit_rp', 'autres_credits', 'objectif_patrimonial'];

const SOLO_SECTIONS = [SECTION_SIT, SECTION_PROFIL_SOLO, SECTION_REV_SOLO, SECTION_EP_SOLO, SECTION_DED_SOLO, SECTION_IMMO];

// ─── Sub-components (outside main component — prevents focus loss on re-render) ──

function _fieldVisible(f, formData) {
  if (!f.dependsOn) return true;
  const depVal = formData?.[f.dependsOn.key];
  return f.dependsOn.check ? f.dependsOn.check(depVal) : depVal === f.dependsOn.value;
}

function FieldRow({ f, value, onChange, autoFKeys, formData = {} }) {
  if (!_fieldVisible(f, formData)) return null;

  const isAuto = !!(autoFKeys && autoFKeys[f.key]);
  const base = [
    'w-full rounded-xl border px-3 py-2.5 text-sm bg-white',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all',
    'font-sans placeholder:text-gray-300',
    isAuto ? 'border-teal-300 focus:ring-teal-300/50' : 'border-gray-200 focus:ring-teal-300/50',
  ].join(' ');

  const computedInfo = f.compute ? f.compute(formData, value) : null;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {f.label}
        {isAuto && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-teal-500 text-xs font-normal">
            <Sparkles size={10} /> auto
          </span>
        )}
      </label>
      {f.type === 'select' ? (
        <select
          value={value || ''}
          onChange={e => onChange(f.key, e.target.value)}
          className={base}
        >
          <option value="">— Choisir —</option>
          {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={f.type}
          placeholder={f.ph}
          value={value || ''}
          onChange={e => onChange(f.key, e.target.value)}
          className={base}
        />
      )}
      {f.hint && (
        <p className="mt-1.5 text-xs text-amber-600 leading-snug">{f.hint}</p>
      )}
      {computedInfo && (
        <p className={[
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

function AccSection({ section, data, onChange, autoFKeys, activeAcc, setActiveAcc }) {
  const { Icon } = section;
  const visible = section.fields.filter(f => _fieldVisible(f, data));
  const filled  = visible.filter(f => data[f.key] && data[f.key] !== '').length;
  const pct     = visible.length > 0 ? Math.round(filled / visible.length * 100) : 0;
  const open    = activeAcc === section.id;

  return (
    <div className={[
      'rounded-2xl border mb-2 transition-all duration-200 overflow-hidden',
      open ? 'border-teal-200 shadow-sm' : 'border-gray-100 bg-white',
    ].join(' ')}>
      <button
        type="button"
        onClick={() => setActiveAcc(open ? null : section.id)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={[
            'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
            open ? 'bg-teal-gradient text-white' : 'bg-gray-100 text-gray-400',
          ].join(' ')}>
            <Icon size={14} aria-hidden="true" />
          </div>
          <span className="font-semibold text-sm text-gray-800">{section.label}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono text-gray-400">{filled}/{visible.length}</span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-teal-500' : 'bg-purple-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-teal-50/20" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-3">
            {section.fields.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocItem({ doc, onRemove }) {
  return (
    <div className={[
      'flex gap-2.5 items-start rounded-xl p-3 mt-2 border',
      doc.status === 'done'    ? 'bg-teal-50/50 border-teal-100'  : '',
      doc.status === 'error'   ? 'bg-red-50/50 border-red-100'    : '',
      doc.status === 'loading' ? 'bg-gray-50 border-gray-100'     : '',
    ].join(' ')}>
      <div className="shrink-0 mt-0.5">
        {doc.status === 'loading' && <Loader2 size={15} className="text-teal-500 animate-spin" />}
        {doc.status === 'done'    && <CheckCircle size={15} className="text-teal-500" />}
        {doc.status === 'error'   && <AlertCircle size={15} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-gray-400 mb-1 truncate">{doc.name}</p>
        {doc.status === 'loading' && (
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            Extraction IA…
          </p>
        )}
        {doc.status === 'done' && (
          <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{doc.extracted}</p>
        )}
        {doc.status === 'done' && doc.warning && (
          <div className={[
            'mt-2 text-xs px-2.5 py-1.5 rounded-lg',
            doc.warning.startsWith('✅')
              ? 'bg-teal-50 border border-teal-200 text-teal-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700',
          ].join(' ')}>
            {doc.warning}
          </div>
        )}
        {doc.status === 'error' && <p className="text-xs text-red-500 truncate">{doc.error}</p>}
      </div>
      <button
        type="button"
        onClick={() => onRemove(doc.id)}
        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors p-0.5"
        aria-label="Supprimer"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function UploadZone({ target, uploading, docs, onFiles, onRemove }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const mine = docs.filter(d => d.target === target);

  return (
    <div className="mb-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={e => onFiles(e.target.files, target)}
      />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files, target); }}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200',
          dragging
            ? 'border-teal-400 bg-teal-50/60 scale-[1.01] shadow-sm shadow-teal-100'
            : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/30',
        ].join(' ')}
      >
        <div className={[
          'w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2 transition-colors',
          uploading || dragging ? 'bg-teal-gradient' : 'bg-gray-100',
        ].join(' ')}>
          {uploading
            ? <Loader2 size={16} className="text-white animate-spin" />
            : <Upload size={16} className={dragging ? 'text-white' : 'text-gray-400'} />
          }
        </div>
        <p className="text-sm font-semibold text-gray-700">
          {uploading ? 'Analyse IA en cours…' : 'Glisse ici ou clique'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">JPG · PNG · PDF</p>
      </div>
      {mine.map(doc => (
        <DocItem key={doc.id} doc={doc} onRemove={onRemove} />
      ))}
    </div>
  );
}

function DeclarantBlock({ num, data, onChange, autoFKeys, uploadTarget, activeAcc, setActiveAcc, uploading, docs, onFiles, onRemove }) {
  const allFields = [...REV_FIELDS, ...EP_INDIV_FIELDS, ...PROFIL_INDIV_FIELDS];
  const visible   = allFields.filter(f => _fieldVisible(f, data));
  const filled    = visible.filter(f => data[f.key] && data[f.key] !== '').length;
  const pct       = visible.length > 0 ? Math.round(filled / visible.length * 100) : 0;
  const id     = `d${num}`;
  const open   = activeAcc === id;
  const isD1   = num === 1;

  return (
    <div className={[
      'rounded-2xl border mb-2 transition-all duration-200 overflow-hidden',
      open
        ? (isD1 ? 'border-teal-200 shadow-sm' : 'border-purple-200 shadow-sm')
        : 'border-gray-100 bg-white',
    ].join(' ')}>
      <button
        type="button"
        onClick={() => setActiveAcc(open ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={[
            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono border transition-colors',
            open && isD1  ? 'bg-teal-gradient border-transparent text-white'   : '',
            open && !isD1 ? 'bg-purple-500 border-transparent text-white'      : '',
            !open && isD1  ? 'bg-teal-50 border-teal-200 text-teal-600'        : '',
            !open && !isD1 ? 'bg-purple-50 border-purple-200 text-purple-600'  : '',
          ].join(' ')}>
            D{num}
          </div>
          <span className="font-semibold text-sm text-gray-800">Déclarant {num}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-mono ${
            pct === 100
              ? (isD1 ? 'text-teal-500' : 'text-purple-500')
              : 'text-gray-400'
          }`}>
            {filled}/{visible.length}
          </span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isD1 ? 'bg-teal-500' : 'bg-purple-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className={`px-4 pb-4 ${isD1 ? 'bg-teal-50/20' : 'bg-purple-50/10'}`} onClick={e => e.stopPropagation()}>
          <UploadZone target={uploadTarget} uploading={uploading} docs={docs} onFiles={onFiles} onRemove={onRemove} />
          {Object.keys(autoFKeys).length > 0 && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl mb-3 border ${
              isD1
                ? 'bg-teal-50 border-teal-200 text-teal-700'
                : 'bg-purple-50 border-purple-200 text-purple-700'
            }`}>
              <Sparkles size={12} />
              {Object.keys(autoFKeys).length} champ(s) pré-rempli(s) — vérifie les valeurs
            </div>
          )}
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-1">
            Revenus 2025
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {REV_FIELDS.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Épargne individuelle
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {EP_INDIV_FIELDS.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Profil &amp; Retraite
          </p>
          <div className="grid grid-cols-2 gap-3">
            {PROFIL_INDIV_FIELDS.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CapaciteSection ──────────────────────────────────────────────────────────

function CapaciteSection({ formData, onChange, d1Data, d2Data, isCouple, activeAcc, setActiveAcc }) {
  const id = 'capacite';
  const open = activeAcc === id;

  const netD1 = parseFloat(isCouple ? (d1Data?.net_imp || 0) : (formData.net_imp || 0));
  const netD2 = parseFloat(isCouple ? (d2Data?.net_imp || 0) : 0);
  const rniMensuel = Math.round((abattement10(netD1) + abattement10(netD2)) / 12);

  const charges = parseFloat(formData.charges_fixes || 0);
  const capacite = Math.max(0, rniMensuel - charges);
  const taux = rniMensuel > 0 ? Math.round(capacite / rniMensuel * 100) : 0;

  const color = taux < 10 ? 'red' : taux < 25 ? 'orange' : taux < 50 ? 'green' : 'blue';
  const msg = taux < 10 ? 'Capacité d\'investissement faible'
    : taux < 25 ? 'Capacité modérée'
    : taux < 50 ? 'Bonne capacité d\'épargne'
    : 'Capacité élevée — stratégie FIRE envisageable';

  const colorMap = {
    red:    { bg: 'bg-red-50',    border: 'border-red-100',    label: 'text-red-400',    val: 'text-red-700',    msg: 'text-red-500'    },
    orange: { bg: 'bg-amber-50',  border: 'border-amber-100',  label: 'text-amber-500',  val: 'text-amber-700',  msg: 'text-amber-500'  },
    green:  { bg: 'bg-teal-50',   border: 'border-teal-100',   label: 'text-teal-500',   val: 'text-teal-700',   msg: 'text-teal-500'   },
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   label: 'text-blue-400',   val: 'text-blue-700',   msg: 'text-blue-500'   },
  };
  const c = colorMap[color];

  const filled = CAPACITE_KEYS.filter(k => formData[k] && formData[k] !== '').length;
  const pct    = Math.round(filled / CAPACITE_KEYS.length * 100);

  return (
    <div className={['rounded-2xl border mb-2 transition-all duration-200 overflow-hidden', open ? 'border-teal-200 shadow-sm' : 'border-gray-100 bg-white'].join(' ')}>
      <button type="button" onClick={() => setActiveAcc(open ? null : id)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
        <div className="flex items-center gap-3">
          <div className={['w-7 h-7 rounded-lg flex items-center justify-center transition-colors', open ? 'bg-teal-gradient text-white' : 'bg-gray-100 text-gray-400'].join(' ')}>
            <TrendingUp size={14} aria-hidden="true" />
          </div>
          <span className="font-semibold text-sm text-gray-800">Capacité d&apos;épargne</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono text-gray-400">{filled}/{CAPACITE_KEYS.length}</span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-teal-500' : 'bg-purple-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-teal-50/20" onClick={e => e.stopPropagation()}>
          {rniMensuel > 0 && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 mb-3">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Revenus nets mensuels estimés</p>
              <p className="text-sm font-bold text-blue-800 font-mono">{rniMensuel.toLocaleString('fr-FR')} €/mois</p>
              <p className="text-[10px] text-blue-400 mt-0.5">Calculé depuis le RNI (après abattement 10 % salaires)</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <FieldRow f={{ key: 'charges_fixes', label: 'Charges fixes mensuelles (€)', type: 'number', ph: '2 500' }} value={formData.charges_fixes} onChange={onChange} autoFKeys={{}} />
            <FieldRow f={{ key: 'credit_rp', label: 'dont crédit RP / loyer (€)', type: 'number', ph: '900' }} value={formData.credit_rp} onChange={onChange} autoFKeys={{}} />
            <FieldRow f={{ key: 'autres_credits', label: 'dont autres crédits (€)', type: 'number', ph: '0' }} value={formData.autres_credits} onChange={onChange} autoFKeys={{}} />
            <FieldRow f={{ key: 'objectif_patrimonial', label: 'Objectif patrimonial', type: 'select', opts: ['', 'Optimisation fiscale annuelle', 'Constitution patrimoine long terme', 'Préparation retraite', 'Indépendance financière (FIRE)', 'Transmission'] }} value={formData.objectif_patrimonial} onChange={onChange} autoFKeys={{}} />
          </div>
          {rniMensuel > 0 && charges > 0 && (
            <div className={`rounded-xl border px-3 py-2.5 ${c.bg} ${c.border}`}>
              <div className="flex justify-between items-baseline mb-1">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${c.label}`}>Capacité d&apos;épargne</p>
                <span className={`text-xs font-bold font-mono ${c.val}`}>{taux} %</span>
              </div>
              <p className={`text-lg font-bold font-mono ${c.val}`}>{capacite.toLocaleString('fr-FR')} €/mois</p>
              <p className={`text-xs mt-0.5 ${c.msg}`}>{msg}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Collect() {
  const { state, dispatch, getApiKey } = useApp();
  const navigate = useNavigate();
  const isCouple = state.mode === 'couple';

  const [formData,   setFormData]   = useState(() => state.formData || {});
  const [d1Data,     setD1Data]     = useState(() => state.d1Data   || {});
  const [d2Data,     setD2Data]     = useState(() => state.d2Data   || {});
  const [docs,       setDocs]       = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [activeAcc,  setActiveAcc]  = useState('sit');
  const [autoFilled, setAutoFilled] = useState({});
  const [autoF1,     setAutoF1]     = useState({});
  const [autoF2,     setAutoF2]     = useState({});

  const handleChange   = (key, val) => { setFormData(p => ({ ...p, [key]: val })); setAutoFilled(p => { const n = { ...p }; delete n[key]; return n; }); };
  const handleD1Change = (key, val) => { setD1Data(p => ({ ...p, [key]: val }));   setAutoF1(p    => { const n = { ...p }; delete n[key]; return n; }); };
  const handleD2Change = (key, val) => { setD2Data(p => ({ ...p, [key]: val }));   setAutoF2(p    => { const n = { ...p }; delete n[key]; return n; }); };
  const removeDoc = id => setDocs(p => p.filter(d => d.id !== id));

  // Sync local states when a profile is imported (AppContext updated externally)
  useEffect(() => { if (state.formData) setFormData(state.formData); }, [state.formData]);
  useEffect(() => { if (state.d1Data)   setD1Data(state.d1Data);     }, [state.d1Data]);
  useEffect(() => { if (state.d2Data)   setD2Data(state.d2Data);     }, [state.d2Data]);

  useEffect(() => {
    console.log('Fichiers anonymisés disponibles:', state.anonymizedFiles);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(async (files, target = 'solo') => {
    if (!files || !files.length) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      toast.error('Clé API manquante — configure-la dans Réglages.');
      return;
    }
    setUploading(true);
    const newDocs = Array.from(files).map(f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      status: 'loading',
      extracted: null,
      warning: null,
      file: f,
      target,
    }));
    setDocs(p => [...p, ...newDocs]);
    for (const doc of newDocs) {
      try {
        const extracted = await analyzeDoc(doc.file, apiKey);
        const { map: mapped, warning } = mapExtracted(extracted);
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'done', extracted, warning } : d));
        if (Object.keys(mapped).length > 0) {
          const mark = Object.fromEntries(Object.keys(mapped).map(k => [k, true]));
          if      (target === 'd1') { setD1Data(p => ({ ...mapped, ...p }));   setAutoF1(p => ({ ...p, ...mark })); }
          else if (target === 'd2') { setD2Data(p => ({ ...mapped, ...p }));   setAutoF2(p => ({ ...p, ...mark })); }
          else                      { setFormData(p => ({ ...mapped, ...p })); setAutoFilled(p => ({ ...p, ...mark })); }
        }
      } catch (e) {
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'error', error: e.message } : d));
      }
    }
    setUploading(false);
  }, [getApiKey]);

  // Progress (visible fields only, including capacité keys)
  const { filled: totalF, total: totalAll, pct } = (() => {
    const capF = CAPACITE_KEYS.filter(k => formData[k] && formData[k] !== '').length;
    if (!isCouple) {
      const visF   = SOLO_SECTIONS.flatMap(s => s.fields.filter(f => _fieldVisible(f, formData)));
      const filled = visF.filter(f => formData[f.key] && formData[f.key] !== '').length + capF;
      const total  = visF.length + CAPACITE_KEYS.length;
      return { filled, total, pct: Math.round(filled / total * 100) };
    }
    const foyer  = [SECTION_SIT, SECTION_REV_FOYER, SECTION_DED, SECTION_IMMO];
    const visFoy = foyer.flatMap(s => s.fields.filter(f => _fieldVisible(f, formData)));
    const foyerF = visFoy.filter(f => formData[f.key] && formData[f.key] !== '').length;
    const dFields = [...REV_FIELDS, ...EP_INDIV_FIELDS, ...PROFIL_INDIV_FIELDS];
    const visD1 = dFields.filter(f => _fieldVisible(f, d1Data));
    const visD2 = dFields.filter(f => _fieldVisible(f, d2Data));
    const d1F = visD1.filter(f => d1Data[f.key] && d1Data[f.key] !== '').length;
    const d2F = visD2.filter(f => d2Data[f.key] && d2Data[f.key] !== '').length;
    const total  = visFoy.length + visD1.length + visD2.length + CAPACITE_KEYS.length;
    const filled = foyerF + d1F + d2F + capF;
    return { filled, total, pct: Math.round(filled / total * 100) };
  })();

  const handleGenerate = () => {
    dispatch({ type: 'SET_FORM_DATA', payload: formData });
    dispatch({ type: 'SET_D1_DATA',   payload: d1Data });
    dispatch({ type: 'SET_D2_DATA',   payload: d2Data });
    const profile = buildProfile(formData, d1Data, d2Data, docs, isCouple);
    dispatch({ type: 'SET_PROFILE',   payload: profile });
    navigate('/profile');
  };

  const anonymizedFiles = state.anonymizedFiles || [];
  const handleUseAnonymized = useCallback(() => {
    if (anonymizedFiles.filter(f => f.blob).length === 0) {
      toast.error('Les fichiers ne sont plus disponibles — uploader manuellement.');
      return;
    }

    if (!isCouple) {
      const files = anonymizedFiles
        .filter(f => f.blob)
        .map(f => new File([f.blob], f.name, { type: 'application/pdf' }));
      handleFiles(files, 'solo');
      return;
    }

    // Mode couple : router selon le target enregistré dans l'étape Anonymize
    const byTarget = { d1: [], d2: [] };
    for (const f of anonymizedFiles.filter(f => f.blob)) {
      const t = f.target === 'd2' ? 'd2' : 'd1'; // fallback → d1 si pas de target
      byTarget[t].push(new File([f.blob], f.name, { type: 'application/pdf' }));
    }
    if (byTarget.d1.length > 0) handleFiles(byTarget.d1, 'd1');
    if (byTarget.d2.length > 0) handleFiles(byTarget.d2, 'd2');
  }, [anonymizedFiles, handleFiles, isCouple]);

  const accProps    = { activeAcc, setActiveAcc };
  const uploadProps = { uploading, docs, onFiles: handleFiles, onRemove: removeDoc };

  const importFileRef = useRef(null);
  const handleImportProfile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string' && text.trim()) {
        const trimmed = text.trim();
        const pp = parseProfile(trimmed);

        // Reconstruit formData (champs partagés + solo)
        const str = v => (v && v !== 0) ? String(v) : '';
        const newFormData = {
          parts:      str(pp.parts),
          dept:       pp.departement || '',
          foncier:    str(pp.revensFonciers),
          divid:      str(pp.dividendes),
          crypto:     str(pp.revenusCrypto),
          pero_d1:    str(pp.peroD1),
          pero_d2:    str(pp.peroD2),
          per_n1:     str(pp.perReportableN1),
          per_n2:     str(pp.perReportableN2),
          per_n3:     str(pp.perReportableN3),
          // Solo : revenus, épargne et profil dans formData
          ...(pp.mode === 'solo' ? {
            brut:             str(pp.salairesBrutImposableD1),
            net_imp:          str(pp.salaireNetImposableD1),
            taux_pas:         str(pp.tauxPasD1),
            pas_tot:          str(pp.pasD1),
            livret_a:         str(pp.livretAD1),
            ldd:              str(pp.lddsD1),
            lep:              str(pp.lepD1),
            livret_plus:      str(pp.livretPlusD1),
            pel:              str(pp.pelD1),
            pel_date:         pp.pelDateD1 || '',
            pea:              str(pp.peaD1),
            pea_date:         pp.peaDateD1 || '',
            pea_verse:        str(pp.peaVerseD1),
            per:              str(pp.percoD1),
            av:               str(pp.avD1),
            av_date:          pp.avDateD1 || '',
            crypto_wallet:    str(pp.cryptoD1),
            age_d1:           str(pp.ageD1),
            retraite_d1:      str(pp.retraiteD1),
            tmi_retraite_d1:  pp.tmiRetraiteD1 != null ? String(pp.tmiRetraiteD1) : '',
          } : {}),
        };

        // Couple : revenus/épargne dans d1Data / d2Data séparés
        const newD1 = pp.mode === 'couple' ? {
          brut:            str(pp.salairesBrutImposableD1),
          net_imp:         str(pp.salaireNetImposableD1),
          taux_pas:        str(pp.tauxPasD1),
          pas_tot:         str(pp.pasD1),
          livret_a:        str(pp.livretAD1),
          ldd:             str(pp.lddsD1),
          lep:             str(pp.lepD1),
          livret_plus:     str(pp.livretPlusD1),
          pel:             str(pp.pelD1),
          pel_date:        pp.pelDateD1 || '',
          pea:             str(pp.peaD1),
          pea_date:        pp.peaDateD1 || '',
          pea_verse:       str(pp.peaVerseD1),
          per:             str(pp.percoD1),
          av:              str(pp.avD1),
          av_date:         pp.avDateD1 || '',
          crypto_wallet:   str(pp.cryptoD1),
          age:             str(pp.ageD1),
          retraite:        str(pp.retraiteD1),
          tmi_retraite:    pp.tmiRetraiteD1 != null ? String(pp.tmiRetraiteD1) : '',
        } : null;

        const newD2 = pp.mode === 'couple' ? {
          brut:            str(pp.salairesBrutImposableD2),
          net_imp:         str(pp.salaireNetImposableD2),
          taux_pas:        str(pp.tauxPasD2),
          pas_tot:         str(pp.pasD2),
          livret_a:        str(pp.livretAD2),
          ldd:             str(pp.lddsD2),
          lep:             str(pp.lepD2),
          livret_plus:     str(pp.livretPlusD2),
          pel:             str(pp.pelD2),
          pel_date:        pp.pelDateD2 || '',
          pea:             str(pp.peaD2),
          pea_date:        pp.peaDateD2 || '',
          pea_verse:       str(pp.peaVerseD2),
          per:             str(pp.percoD2),
          av:              str(pp.avD2),
          av_date:         pp.avDateD2 || '',
          crypto_wallet:   str(pp.cryptoD2),
          age:             str(pp.ageD2),
          retraite:        str(pp.retraiteD2),
          tmi_retraite:    pp.tmiRetraiteD2 != null ? String(pp.tmiRetraiteD2) : '',
        } : null;

        dispatch({ type: 'SET_MODE',      payload: pp.mode });
        dispatch({ type: 'SET_PROFILE',   payload: trimmed });
        dispatch({ type: 'SET_FORM_DATA', payload: newFormData });
        if (newD1) dispatch({ type: 'SET_D1_DATA', payload: newD1 });
        if (newD2) dispatch({ type: 'SET_D2_DATA', payload: newD2 });
        toast.success('Profil importé — vérifiez les données puis continuez.');
      } else {
        toast.error('Fichier vide ou invalide.');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <div className="flex gap-2 flex-wrap mb-2">
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape 2 / 4</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Collecte fiscale</h1>
        <p className="text-sm text-gray-500">
          Upload tes documents anonymisés → l'IA extrait les chiffres → tu vérifies et génères ton profil.
        </p>
        <div className="flex gap-2 flex-wrap mt-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-600 border border-teal-100">
            Fiscal 2025
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100">
            <Sparkles size={10} /> IA Auto-Fill
          </span>
          {isCouple && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100">
              <Users size={10} /> Mode couple
            </span>
          )}
        </div>
      </div>

      {/* Import profil existant */}
      <input ref={importFileRef} type="file" accept=".txt" className="hidden" onChange={handleImportProfile} />
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 px-4 py-3">
        <p className="text-xs text-gray-500">Vous avez déjà un profil .txt ?</p>
        <button
          type="button"
          onClick={() => importFileRef.current?.click()}
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 border border-teal-200 bg-white rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors shrink-0"
        >
          <FolderOpen size={13} /> Importer directement
        </button>
      </div>

      {/* Bannière fichiers anonymisés */}
      {anonymizedFiles.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-teal-800">
            <CheckCircle size={15} className="text-teal-500 shrink-0" />
            <span>
              <strong>{anonymizedFiles.length} fichier(s) anonymisé(s)</strong> depuis l'étape précédente.
              {isCouple && <span className="text-teal-600"> (sera chargé dans D1)</span>}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleUseAnonymized} disabled={uploading}>
            Utiliser →
          </Button>
        </div>
      )}

      {/* Mode couple info */}
      {isCouple && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-gray-700">
          <Users size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong className="text-amber-700">Marié(e) ou Pacsé(e) depuis 2024</strong> — déclaration commune obligatoire.
            Remplis les blocs D1 et D2 avec vos fiches de paie respectives.
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">Profil complété</span>
              <span className={`text-xs font-mono font-bold ${pct === 100 ? 'text-teal-600' : 'text-purple-500'}`}>
                {pct}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-purple-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-gray-800 font-mono">{totalF}</div>
            <div className="text-xs text-gray-400 font-mono">/{totalAll}</div>
          </div>
        </div>
      </div>

      {/* Upload zone — solo only */}
      {!isCouple && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Upload size={14} className="text-teal-500" /> Upload documents
          </h2>
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-gray-700">
            <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <span>
              <strong className="text-amber-700">Anonymise impérativement</strong> — masque nom, adresse, n° SS, IBAN.
              Garde les montants.
            </span>
          </div>
          <UploadZone target="solo" {...uploadProps} />
          {Object.keys(autoFilled).length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs bg-teal-50 border border-teal-200 text-teal-700 rounded-xl px-3 py-2">
              <Sparkles size={11} />
              {Object.keys(autoFilled).length} champ(s) pré-rempli(s) automatiquement par l'IA.
            </div>
          )}
        </div>
      )}

      {/* Form sections */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Compléter / vérifier</h2>

        <AccSection
          section={SECTION_SIT}
          data={formData}
          onChange={handleChange}
          autoFKeys={autoFilled}
          {...accProps}
        />

        {!isCouple ? (
          <>
            <AccSection section={SECTION_PROFIL_SOLO} data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
            <AccSection section={SECTION_REV_SOLO}    data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
            <CapaciteSection formData={formData} onChange={handleChange} isCouple={false} {...accProps} />
            <AccSection section={SECTION_EP_SOLO}     data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
            <AccSection section={SECTION_DED_SOLO}    data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
            <AccSection section={SECTION_IMMO}        data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} />
          </>
        ) : (
          <>
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-2 text-xs text-blue-700">
              <Upload size={12} className="shrink-0 mt-0.5" />
              <span>
                <strong>Upload séparé par déclarant</strong> — dépose les fiches dans le bloc correspondant pour un auto-fill précis.
              </span>
            </div>
            <DeclarantBlock
              num={1} data={d1Data} onChange={handleD1Change} autoFKeys={autoF1}
              uploadTarget="d1" {...accProps} {...uploadProps}
            />
            <DeclarantBlock
              num={2} data={d2Data} onChange={handleD2Change} autoFKeys={autoF2}
              uploadTarget="d2" {...accProps} {...uploadProps}
            />
            <AccSection section={SECTION_REV_FOYER} data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} />
            <AccSection section={SECTION_DED}        data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} />
            <CapaciteSection formData={formData} onChange={handleChange} d1Data={d1Data} d2Data={d2Data} isCouple={true} {...accProps} />
            <AccSection section={SECTION_IMMO}       data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} />
          </>
        )}
      </div>

      {/* Generate CTA */}
      <Button
        variant="primary"
        size="lg"
        className="w-full !rounded-2xl"
        onClick={handleGenerate}
      >
        <Sparkles size={16} /> Générer mon profil fiscal →
      </Button>

      <div className="flex justify-start -mt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/anonymize')}>
          <ArrowLeft size={14} /> Retour à l&apos;anonymisation
        </Button>
      </div>

    </div>
  );
}
