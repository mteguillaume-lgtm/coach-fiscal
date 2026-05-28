import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, Home, Building2, ArrowRight, MessageCircle, Save,
  ChevronDown, ChevronUp,
} from 'lucide-react';

import Button from './Button';
import { useApp } from '../context/AppContext';

const STORAGE_KEY = 'coachFiscal.immobilier';
const fmt = n => Math.round(n).toLocaleString('fr-FR');

const LOAN_TYPES = [
  { id: 'immo',      label: 'Prêt immobilier classique' },
  { id: 'accession', label: 'Prêt accession sociale (PAS)' },
  { id: 'ptz',       label: 'PTZ / PTZ+' },
  { id: 'employeur', label: 'Prêt employeur / Action Logement' },
  { id: 'familial',  label: 'Prêt familial' },
  { id: 'autre',     label: 'Autre dispositif' },
];

const makeId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

const newLoan = (n = 1) => ({
  id: makeId(),
  type: 'immo',
  label: `Prêt ${n}`,
  capitalInitial: 0,
  crd: 0,
  taux: 0,            // taux nominal (%)
  assuranceTaux: 0,   // taux assurance emprunteur (%)
  mensualite: 0,
  dureeRestanteMois: 0,
});

// Taux global simplifié (proche du TAEG) = taux nominal + assurance.
// Approximation valable quand l'assurance est calculée sur le capital initial.
const tauxGlobalLoan = l => (+l.taux || 0) + (+l.assuranceTaux || 0);

const newProject = (type = 'rp') => ({
  id: makeId(),
  label: type === 'rp' ? 'Ma résidence principale' : 'Bien locatif',
  type,
  valeur: 0,
  taxeFonciere: 0,
  loans: [newLoan()],
  locatif: {
    loyersAnnuels: 0,
    chargesNonRecup: 0,
    assurance: 0,
    fraisGestionPct: 0,
    travaux: 0,
  },
});

/**
 * Métriques d'un projet :
 *  - taux moyen pondéré par capital restant dû (approximation du TAEG global)
 *  - CRD, mensualité, durée max, coût des intérêts restants
 *  - locatif : rendement brut, rendement net, cash-flow annuel
 */
function computeProjectMetrics(project) {
  const loans       = project.loans || [];
  const crdTotal    = loans.reduce((s, l) => s + (+l.crd || 0), 0);
  const ciTotal     = loans.reduce((s, l) => s + (+l.capitalInitial || 0), 0);
  const mensTotal   = loans.reduce((s, l) => s + (+l.mensualite || 0), 0);
  const dureeMaxMois = loans.reduce((m, l) => Math.max(m, +l.dureeRestanteMois || 0), 0);
  // Moyennes pondérées par capital restant dû : taux nominal et taux global (intérêts + assurance).
  const tauxMoyen = crdTotal > 0
    ? loans.reduce((s, l) => s + (+l.crd || 0) * (+l.taux || 0), 0) / crdTotal
    : 0;
  const tauxGlobalMoyen = crdTotal > 0
    ? loans.reduce((s, l) => s + (+l.crd || 0) * tauxGlobalLoan(l), 0) / crdTotal
    : 0;
  const remboursementRestant = loans.reduce(
    (s, l) => s + (+l.mensualite || 0) * (+l.dureeRestanteMois || 0), 0,
  );
  const coutInteretsRestant = Math.max(0, remboursementRestant - crdTotal);

  let locatif = null;
  if (project.type === 'locatif') {
    const l       = project.locatif || {};
    const loyers  = +l.loyersAnnuels || 0;
    const charges = (+l.chargesNonRecup     || 0)
                  + (+project.taxeFonciere  || 0)
                  + (+l.assurance           || 0)
                  + loyers * ((+l.fraisGestionPct || 0) / 100)
                  + (+l.travaux             || 0);
    const valeur  = +project.valeur || 0;
    const netAnnuel = loyers - charges;
    locatif = {
      loyers,
      charges,
      netAnnuel,
      rendementBrut: valeur > 0 ? (loyers / valeur) * 100 : 0,
      rendementNet:  valeur > 0 ? (netAnnuel / valeur) * 100 : 0,
      cashflowAnnuel: netAnnuel - mensTotal * 12,
    };
  }

  return { crdTotal, ciTotal, mensTotal, dureeMaxMois, tauxMoyen, tauxGlobalMoyen, coutInteretsRestant, locatif };
}

// ─── Champ numérique ─────────────────────────────────────────────────────────

function NumField({ label, value, onChange, placeholder, step = '1', suffix }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={value || ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300/50 placeholder:text-gray-300 font-mono tabular-nums"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-mono pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ─── Carte prêt (édition inline) ─────────────────────────────────────────────

function LoanCard({ loan, idx, onChange, onRemove, canRemove }) {
  const [open, setOpen] = useState(idx === 0);

  const dureeAnnees = loan.dureeRestanteMois > 0
    ? (loan.dureeRestanteMois / 12).toFixed(1)
    : '—';
  const tauxGlobal = tauxGlobalLoan(loan);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-gray-700 truncate">
            {loan.label || `Prêt ${idx + 1}`}
          </span>
          <span className="text-xs text-gray-400 truncate">
            {LOAN_TYPES.find(t => t.id === loan.type)?.label || ''}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 font-mono shrink-0">
          <span>CRD {fmt(loan.crd)} €</span>
          <span title="Taux global = nominal + assurance" className="text-teal-700 font-semibold">
            {tauxGlobal.toFixed(2)} %
          </span>
          <span>{dureeAnnees} ans</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom du prêt</label>
              <input
                type="text"
                value={loan.label || ''}
                onChange={e => onChange({ ...loan, label: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                value={loan.type}
                onChange={e => onChange({ ...loan, type: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300/50"
              >
                {LOAN_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Capital initial"        value={loan.capitalInitial}    onChange={v => onChange({ ...loan, capitalInitial: v })}    placeholder="250 000" suffix="€" />
            <NumField label="Capital restant dû"     value={loan.crd}               onChange={v => onChange({ ...loan, crd: v })}               placeholder="180 000" suffix="€" />
            <NumField label="Taux nominal"           value={loan.taux}              onChange={v => onChange({ ...loan, taux: v })}              placeholder="1.50"    suffix="%" step="0.01" />
            <NumField label="Taux assurance"         value={loan.assuranceTaux}     onChange={v => onChange({ ...loan, assuranceTaux: v })}     placeholder="0.36"    suffix="%" step="0.01" />
            <NumField label="Mensualité (assurance incluse)" value={loan.mensualite} onChange={v => onChange({ ...loan, mensualite: v })}        placeholder="950"     suffix="€" />
            <NumField label="Durée restante"         value={loan.dureeRestanteMois} onChange={v => onChange({ ...loan, dureeRestanteMois: v })} placeholder="180"     suffix="mois" />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-teal-50/60 border border-teal-100 px-3 py-2">
            <span className="text-xs text-teal-700">
              Taux global (≈ TAEG) = {(+loan.taux || 0).toFixed(2)} % + {(+loan.assuranceTaux || 0).toFixed(2)} % assurance
            </span>
            <span className="text-sm font-bold font-mono text-teal-700">{tauxGlobal.toFixed(2)} %</span>
          </div>

          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
            >
              <Trash2 size={12} /> Supprimer ce prêt
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panneau locatif ─────────────────────────────────────────────────────────

function LocatifPanel({ locatif, onChange }) {
  const upd = (k, v) => onChange({ ...locatif, [k]: v });
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Rentabilité locative</p>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Loyers annuels (hors charges)" value={locatif.loyersAnnuels}    onChange={v => upd('loyersAnnuels',    v)} placeholder="12 000" suffix="€" />
        <NumField label="Charges non récupérables"      value={locatif.chargesNonRecup}  onChange={v => upd('chargesNonRecup',  v)} placeholder="800"    suffix="€" />
        <NumField label="Assurance PNO"                 value={locatif.assurance}        onChange={v => upd('assurance',        v)} placeholder="150"    suffix="€" />
        <NumField label="Frais de gestion"              value={locatif.fraisGestionPct}  onChange={v => upd('fraisGestionPct',  v)} placeholder="8"      suffix="%" step="0.1" />
        <NumField label="Travaux annuels moyens"        value={locatif.travaux}          onChange={v => upd('travaux',          v)} placeholder="0"      suffix="€" />
      </div>
      <p className="mt-2 text-xs text-gray-400 leading-snug">
        La taxe foncière est saisie au niveau du bien (ci-dessus).
      </p>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function SimImmobilier() {
  const navigate     = useNavigate();
  const { dispatch, state } = useApp();

  const [projects, setProjects] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch { /* ignore */ }
    return [];
  });
  const [activeId, setActiveId] = useState(projects[0]?.id || null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch { /* quota */ }
  }, [projects]);

  const active = projects.find(p => p.id === activeId) || null;

  const updateActive = patch => {
    setProjects(prev => prev.map(p => p.id === activeId ? { ...p, ...patch } : p));
  };

  const addProject = type => {
    const np = newProject(type);
    setProjects(prev => [...prev, np]);
    setActiveId(np.id);
  };

  const removeProject = id => {
    if (!confirm('Supprimer ce projet ?')) return;
    setProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      if (id === activeId) setActiveId(next[0]?.id || null);
      return next;
    });
  };

  const addLoan = () => {
    if (!active) return;
    updateActive({ loans: [...active.loans, newLoan(active.loans.length + 1)] });
  };

  const updateLoan = (loanId, next) => {
    if (!active) return;
    updateActive({ loans: active.loans.map(l => l.id === loanId ? next : l) });
  };

  const removeLoan = loanId => {
    if (!active) return;
    updateActive({ loans: active.loans.filter(l => l.id !== loanId) });
  };

  const metrics = useMemo(
    () => active ? computeProjectMetrics(active) : null,
    [projects, activeId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ─── Agrégat foyer (pour report dans la collecte) ──────────────────────────
  const aggregate = useMemo(() => {
    const rp        = projects.filter(p => p.type === 'rp');
    const locatif   = projects.filter(p => p.type === 'locatif');
    const allLoans  = projects.flatMap(p => p.loans || []);

    const sum = (arr, fn) => arr.reduce((s, x) => s + (+fn(x) || 0), 0);

    const crd       = sum(allLoans, l => l.crd);
    const mens      = sum(allLoans, l => l.mensualite);
    const dureeMois = allLoans.reduce((m, l) => Math.max(m, +l.dureeRestanteMois || 0), 0);
    // Taux global moyen (nominal + assurance) pondéré par CRD — c'est le coût réel.
    const tauxMoyen = crd > 0
      ? sum(allLoans, l => (+l.crd || 0) * tauxGlobalLoan(l)) / crd
      : 0;

    return {
      hasRP:       rp.length > 0,
      hasLocatif:  locatif.length > 0,
      rpValeur:    sum(rp, p => p.valeur),
      rpTaxeFonc:  sum(rp, p => p.taxeFonciere),
      loyers:      sum(locatif, p => p.locatif?.loyersAnnuels || 0),
      crd, mens, dureeMois, tauxMoyen,
    };
  }, [projects]);

  const reporterDansCollecte = () => {
    if (projects.length === 0) {
      toast.error('Aucun projet à reporter.');
      return;
    }
    const patch = {};
    if (aggregate.hasRP) {
      patch.proprio       = 'Oui';
      patch.rp_valeur     = aggregate.rpValeur ? String(aggregate.rpValeur) : '';
      patch.taxe_fonciere = aggregate.rpTaxeFonc ? String(aggregate.rpTaxeFonc) : '';
    }
    if (aggregate.crd > 0) {
      patch.credit_en_cours   = 'Oui';
      patch.credit_crd        = String(aggregate.crd);
      patch.credit_taux       = aggregate.tauxMoyen.toFixed(2);
      patch.credit_mensualite = String(Math.round(aggregate.mens));
      patch.credit_duree      = String(Math.max(1, Math.round(aggregate.dureeMois / 12)));
    }
    if (aggregate.hasLocatif) {
      patch.locatif = 'Oui — micro';
      patch.rev_loc = String(Math.round(aggregate.loyers));
    }
    dispatch({ type: 'SET_FORM_DATA', payload: { ...state.formData, ...patch } });
    toast.success('Données reportées dans la collecte.');
  };

  const handleChat = () => {
    if (!active || !metrics) return;
    const lines = [
      `Projet immobilier : "${active.label}" (${active.type === 'rp' ? 'résidence principale' : 'locatif'}).`,
      active.valeur > 0 ? `Valeur estimée : ${fmt(active.valeur)} €.` : null,
      metrics.crdTotal > 0
        ? `${active.loans.length} prêt(s), CRD total ${fmt(metrics.crdTotal)} €, taux moyen pondéré ${metrics.tauxMoyen.toFixed(2)} %, mensualité ${fmt(metrics.mensTotal)} €/mois, durée max restante ${Math.round(metrics.dureeMaxMois / 12)} ans, intérêts restants ${fmt(metrics.coutInteretsRestant)} €.`
        : null,
      metrics.locatif
        ? `Loyers ${fmt(metrics.locatif.loyers)} €/an, charges ${fmt(metrics.locatif.charges)} €/an, rendement brut ${metrics.locatif.rendementBrut.toFixed(2)} %, rendement net ${metrics.locatif.rendementNet.toFixed(2)} %, cash-flow ${fmt(metrics.locatif.cashflowAnnuel)} €/an.`
        : null,
      'Peux-tu analyser la cohérence de ce montage et suggérer des optimisations (renégociation, regroupement, fiscalité) ?',
    ].filter(Boolean);
    navigate('/chat', { state: { prefill: lines.join(' ') } });
  };

  // ─── Empty state ───────────────────────────────────────────────────────────
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="text-center">
          <p className="text-sm text-gray-600">Aucun projet immobilier enregistré.</p>
          <p className="text-xs text-gray-400 mt-1">Ajoutez votre résidence principale ou un bien locatif pour suivre vos prêts et la rentabilité.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => addProject('rp')}>
            <Home size={13} /> Ajouter ma RP
          </Button>
          <Button variant="secondary" size="sm" onClick={() => addProject('locatif')}>
            <Building2 size={13} /> Ajouter un locatif
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Sélecteur de projet */}
      <div className="flex flex-wrap gap-1.5">
        {projects.map(p => {
          const Icon = p.type === 'rp' ? Home : Building2;
          const isActive = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                isActive
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              <Icon size={12} />
              <span className="max-w-[120px] truncate">{p.label}</span>
            </button>
          );
        })}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => addProject('rp')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-teal-700 border border-dashed border-teal-300 hover:bg-teal-50"
          >
            <Plus size={12} /> RP
          </button>
          <button
            type="button"
            onClick={() => addProject('locatif')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-teal-700 border border-dashed border-teal-300 hover:bg-teal-50"
          >
            <Plus size={12} /> Locatif
          </button>
        </div>
      </div>

      {active && metrics && (
        <>
          {/* Identité projet */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Nom du projet</label>
                <input
                  type="text"
                  value={active.label}
                  onChange={e => updateActive({ label: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select
                  value={active.type}
                  onChange={e => updateActive({ type: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300/50"
                >
                  <option value="rp">Résidence principale</option>
                  <option value="locatif">Bien locatif</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField
                label="Valeur estimée du bien"
                value={active.valeur}
                onChange={v => updateActive({ valeur: v })}
                placeholder="280 000"
                suffix="€"
              />
              <NumField
                label="Taxe foncière annuelle"
                value={active.taxeFonciere}
                onChange={v => updateActive({ taxeFonciere: v })}
                placeholder="1 200"
                suffix="€"
              />
            </div>
            <button
              type="button"
              onClick={() => removeProject(active.id)}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 self-start"
            >
              <Trash2 size={12} /> Supprimer ce projet
            </button>
          </div>

          {/* Prêts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Prêts en cours</p>
              <button
                type="button"
                onClick={addLoan}
                className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
              >
                <Plus size={12} /> Ajouter un prêt
              </button>
            </div>
            <div className="space-y-2">
              {active.loans.map((l, i) => (
                <LoanCard
                  key={l.id}
                  loan={l}
                  idx={i}
                  onChange={next => updateLoan(l.id, next)}
                  onRemove={() => removeLoan(l.id)}
                  canRemove={active.loans.length > 1}
                />
              ))}
            </div>
          </div>

          {/* Synthèse prêts */}
          <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4">
            <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">Synthèse financement</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between"><span className="text-gray-600">Capital restant dû</span><span className="font-bold font-mono text-gray-800">{fmt(metrics.crdTotal)} €</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Mensualité totale</span><span className="font-bold font-mono text-gray-800">{fmt(metrics.mensTotal)} €</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Taux nominal moyen pondéré</span><span className="font-bold font-mono text-gray-700">{metrics.tauxMoyen.toFixed(2)} %</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Taux global moyen (≈ TAEG)</span><span className="font-bold font-mono text-teal-700">{metrics.tauxGlobalMoyen.toFixed(2)} %</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Durée max restante</span><span className="font-bold font-mono text-gray-800">{(metrics.dureeMaxMois / 12).toFixed(1)} ans</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Intérêts restants à payer</span><span className="font-bold font-mono text-red-500">{fmt(metrics.coutInteretsRestant)} €</span></div>
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-snug">
              Taux global ≈ TAEG = taux nominal + assurance emprunteur. Pondération par capital restant dû.
            </p>
          </div>

          {/* Locatif */}
          {active.type === 'locatif' && (
            <>
              <LocatifPanel
                locatif={active.locatif}
                onChange={loc => updateActive({ locatif: loc })}
              />

              {metrics.locatif && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">Rentabilité</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex justify-between"><span className="text-gray-600">Loyers / an</span><span className="font-bold font-mono text-gray-800">{fmt(metrics.locatif.loyers)} €</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Charges / an</span><span className="font-bold font-mono text-gray-800">{fmt(metrics.locatif.charges)} €</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Revenu net / an</span><span className="font-bold font-mono text-gray-800">{fmt(metrics.locatif.netAnnuel)} €</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Cash-flow / an</span><span className={`font-bold font-mono ${metrics.locatif.cashflowAnnuel < 0 ? 'text-red-500' : 'text-teal-700'}`}>{fmt(metrics.locatif.cashflowAnnuel)} €</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Rendement brut</span><span className="font-bold font-mono text-blue-700">{metrics.locatif.rendementBrut.toFixed(2)} %</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Rendement net</span><span className="font-bold font-mono text-blue-700">{metrics.locatif.rendementNet.toFixed(2)} %</span></div>
                  </div>
                  <p className="mt-3 text-xs text-gray-400 leading-snug">
                    Rendement net = (loyers − charges) / valeur du bien. Hors fiscalité (impôt sur loyers à simuler dans l'onglet Foncier). Cash-flow = net annuel − mensualités totales.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Actions globales */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => toast.success('Sauvegarde automatique active.')}
              >
                <Save size={13} /> Auto-sauvegardé
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={reporterDansCollecte}
              >
                <ArrowRight size={13} /> Reporter dans la collecte
              </Button>
            </div>
            <button
              type="button"
              onClick={handleChat}
              className="text-xs text-teal-600 hover:text-teal-700 underline self-center"
            >
              <MessageCircle size={11} className="inline -mt-0.5" /> Discuter de ce projet avec Claude
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center leading-snug">
            Taux moyen pondéré par le capital restant dû — utile pour comparer plusieurs prêts (immo + PTZ + accession).
            Données persistées localement, jamais transmises.
          </p>
        </>
      )}
    </div>
  );
}
