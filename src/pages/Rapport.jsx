import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Download, ArrowLeft, ArrowRight, Sparkles, Wand2, FileText, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from '../components/Button';
import DisclaimerBanner from '../components/DisclaimerBanner';
import {
  TRANCHES, DECOTE, ABT, calcIR, MIN_PLAFOND_PER, MAX_PLAFOND_PER,
  computePerOptimumCascade, calcCEHR, computeFoyerSummary,
  ABATTEMENT_DONATION_ENFANT, RAPPEL_FISCAL_DONATION_ANNEES, ABATTEMENT_DON_FAMILIAL,
  ABATTEMENT_AV_AVANT_70, ABATTEMENT_AV_APRES_70, SEUIL_AGE_AV_TRANSMISSION,
} from '../lib/taxCalculator';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { genererSynthese } from '../lib/conseilPatrimonial';
import { deriveRoadmapContext } from '../lib/lifeStage';

import AuroraBackground from '../components/motion/AuroraBackground';
import SpotlightCursor from '../components/motion/SpotlightCursor';
import Grain from '../components/motion/Grain';
import SplitText from '../components/motion/SplitText';

// ─── Float parser ─────────────────────────────────────────────────────────────

function pf(src, rx) {
  const m = (src || '').match(rx);
  if (!m?.[1]) return 0;
  const v = parseFloat(m[1].replace(/[\s ]/g, '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

function sec(text, header) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped + '\\s*([\\s\\S]*?)(?=\\n==|$)');
  return text.match(rx)?.[1] ?? '';
}

// ─── Formatage monétaire ──────────────────────────────────────────────────────

function eur(n, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n) + ' €';
}
const e2 = n => eur(n, 2);
const e0 = n => eur(Math.round(n), 0);
function pct(r) { return (r * 100).toFixed(0) + ' %'; }

// ─── Calculs barème ───────────────────────────────────────────────────────────

function baremeSteps(rniFoyer, parts) {
  if (!rniFoyer || !parts) return [];
  const quotient = rniFoyer / parts;
  const steps = [];
  for (const [lo, hi, rate] of TRANCHES) {
    if (quotient <= lo) break;
    const hiEff = Math.min(quotient, hi);
    steps.push({ rate, lo, hiEff, taxable: hiEff - lo, irParPart: (hiEff - lo) * rate });
  }
  return steps;
}

function irBrut(base, parts) {
  if (!base || !parts) return 0;
  return baremeSteps(base, parts).reduce((s, t) => s + t.irParPart, 0) * parts;
}

function decote(brut, isCouple) {
  const seuil   = isCouple ? DECOTE.seuil_couple   : DECOTE.seuil_celibataire;
  const plafond = isCouple ? DECOTE.plafond_couple  : DECOTE.plafond_celibataire;
  return brut < seuil ? Math.max(0, plafond - 0.4525 * brut) : 0;
}

// ─── Sections IA ─────────────────────────────────────────────────────────────

const AI_TITLES = ['DÉCLARATION', 'ANALYSE DES SITUATIONS', "POINTS D'ATTENTION", 'OBJECTIFS PRIORITAIRES', 'STRATÉGIE PATRIMONIALE'];
const isAiSection = t => AI_TITLES.some(k => t.toUpperCase().includes(k));

function parseProfileSections(text) {
  if (!text) return [];
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^==\s*(.+?)\s*==\s*$/);
    if (m) { if (cur) out.push(cur); cur = { title: m[1].trim(), lines: [] }; }
    else if (cur) cur.lines.push(line);
  }
  if (cur) out.push(cur);
  return out;
}

// ─── Extraction + calculs complets depuis le profil brut ─────────────────────

function computeData(profile, p = {}) {
  if (!profile) return null;

  const isCouple = p.mode === 'couple' || /FOYER 2025|DÉCLARANT 2/i.test(profile);

  const secD1 = isCouple
    ? sec(profile, '== REVENUS 2025 — DÉCLARANT 1 ==')
    : sec(profile, '== REVENUS 2025 ==');
  const secD2 = isCouple ? sec(profile, '== REVENUS 2025 — DÉCLARANT 2 ==') : '';

  const netD1 = pf(secD1, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);
  const netD2 = pf(secD2, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);

  const brutD1 = pf(secD1, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);
  const brutD2 = pf(secD2, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);

  const abt10D1 = netD1 > 0 ? Math.min(Math.max(netD1 * ABT.taux, ABT.minimum), ABT.maximum) : 0;
  const abt10D2 = netD2 > 0 ? Math.min(Math.max(netD2 * ABT.taux, ABT.minimum), ABT.maximum) : 0;
  // Salary-only retained component (for display)
  const salRetD1 = netD1 - abt10D1;
  const salRetD2 = netD2 - abt10D2;
  // Full per-declarant RNI (salary + rente + ARE + …) from parsedProfile
  const retD1 = p.rniD1 > 0 ? p.rniD1 : salRetD1;
  const retD2 = p.rniD2 > 0 ? p.rniD2 : salRetD2;

  const foncierBrut = pf(profile, /Revenus fonciers bruts\s*:\s*([\d\s,]+)\s*€/i)
                   || pf(profile, /(?<!nets? imposables? )Revenus fonciers\s*:\s*([\d\s,]+)\s*€/i);
  const isMicro   = /micro.foncier/i.test(profile);
  const foncierAbt = isMicro ? foncierBrut * 0.30 : 0;
  const foncierNet = foncierBrut - foncierAbt;

  const parts     = p.parts || pf(profile, /Parts fiscales\s*:\s*([\d,.]+)/) || (isCouple ? 2 : 1);
  // Prefer parsedProfile rniFoyer (handles pension/salary abattement differences)
  const rniFoyer  = (p.rniFoyer > 0 ? p.rniFoyer : null) ?? (retD1 + retD2 + foncierNet);
  const quotient  = parts > 0 ? rniFoyer / parts : rniFoyer;

  const steps       = baremeSteps(rniFoyer, parts);
  const irParPart   = steps.reduce((s, t) => s + t.irParPart, 0);
  const irBrutFoyer = irParPart * parts;

  const dec         = decote(irBrutFoyer, isCouple);
  const irNetFoyer  = Math.max(0, irBrutFoyer - dec);

  const psFoncier = foncierNet * 0.172;
  const totalDu   = irNetFoyer + psFoncier;

  const pasD1   = pf(secD1, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);
  const pasD2   = pf(secD2, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);
  const _fs     = computeFoyerSummary(p);
  const pasTotal = _fs?.pasTotal > 0 ? _fs.pasTotal : pasD1 + pasD2;
  const solde    = totalDu - pasTotal;

  let irD1Solo = 0, irD2Solo = 0, gainPacs = 0, totalSolo = 0;
  let contribD1 = 0, contribD2 = 0, regloD1 = 0, regloD2 = 0;

  if (isCouple && (retD1 > 0 || retD2 > 0)) {
    irD1Solo   = irBrut(retD1, 1);
    irD2Solo   = irBrut(retD2, 1);
    totalSolo  = irD1Solo + irD2Solo;
    // Gain PACS = écart entre la somme des IR célibataires et l'IR réel du foyer.
    // Toujours ≥ 0 — le quotient familial ne peut pas créer un surcoût.
    gainPacs   = Math.max(0, totalSolo - irNetFoyer);
    contribD1  = Math.max(0, irD1Solo - gainPacs / 2);
    contribD2  = Math.max(0, irD2Solo - gainPacs / 2);
    regloD1    = pasD1 - contribD1;
    regloD2    = pasD2 - contribD2;
  }

  const tmi = steps.length > 0 ? steps[steps.length - 1].rate * 100 : 0;

  const sections = parseProfileSections(profile);
  const hasAi    = sections.some(s => isAiSection(s.title));

  return {
    isCouple, parts, quotient, rniFoyer,
    netD1, netD2, brutD1, brutD2, abt10D1, abt10D2,
    salRetD1, salRetD2,
    retD1, retD2,
    foncierBrut, foncierAbt, foncierNet, isMicro,
    steps, irParPart, irBrutFoyer, dec, irNetFoyer, psFoncier, totalDu,
    pasD1, pasD2, pasTotal, solde,
    irD1Solo, irD2Solo, totalSolo, gainPacs,
    contribD1, contribD2, regloD1, regloD2,
    tmi,
    hasAi, sections,
  };
}

// ─── Composants UI de base ────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'gray' }) {
  const cls = {
    gray:   'bg-gray-50   border-gray-200   text-gray-900',
    teal:   'bg-teal-50   border-teal-200   text-teal-900',
    amber:  'bg-amber-50  border-amber-200  text-amber-800',
    violet: 'bg-violet-50 border-violet-200 text-violet-900',
    red:    'bg-red-50    border-red-200    text-red-900',
  }[color] ?? 'bg-gray-50 border-gray-200 text-gray-900';

  return (
    <div className={`rp-kpi rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs opacity-55 mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}

/* ── Section principale (01/02/03…) — titre avec badge noir ─────────────── */
function SectionSep({ num, label }) {
  return (
    <div className="rp-section-sep flex items-center gap-3 pt-5 pb-2 mt-2 border-b-2 border-gray-800 print:border-gray-700">
      <span className="rp-section-sep-num inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-800 text-white text-xs font-bold font-mono shrink-0 print:bg-gray-700">{num}</span>
      <h2 className="rp-section-sep-label text-base font-bold text-gray-900 tracking-tight">{label}</h2>
    </div>
  );
}

/* ── Sous-section (module interne) — carte avec en-tête gris clair ───────── */
function SectionBox({ title, badge, num, children, footer }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="rp-module rounded-xl border border-gray-200 overflow-hidden shadow-sm print:shadow-none"
    >
      <div className="rp-section-header flex items-center justify-between px-4 py-2.5 bg-gray-100 border-b border-gray-200">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
          {num && <span className="rp-module-num font-mono text-gray-400 mr-2">{num}</span>}
          {title}
        </h3>
        {badge && (
          <span className="text-xs font-semibold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{badge}</span>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
      {footer && <div className="border-t border-gray-100">{footer}</div>}
    </motion.div>
  );
}

function Tbl({ children }) {
  return <table className="w-full text-xs">{children}</table>;
}

function Th({ children, right, wide }) {
  return (
    <th className={[
      'rp-table-head px-4 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-100',
      'uppercase tracking-wide text-xs whitespace-nowrap',
      right ? 'text-right' : 'text-left',
      wide  ? 'w-1/2'     : '',
    ].join(' ')}>
      {children}
    </th>
  );
}

function Td({ children, right, bold, muted, minus, plus, subtotal, colSpan, className = '' }) {
  const color = minus ? 'text-red-600' : plus ? 'text-emerald-700' : muted ? 'text-gray-400' : 'text-gray-700';
  return (
    <td colSpan={colSpan} className={[
      'px-4 py-2.5 border-b border-gray-50 tabular-nums',
      right ? 'text-right whitespace-nowrap' : 'text-left',
      bold  ? 'font-semibold text-gray-900' : color,
      subtotal ? 'bg-gray-50/60' : '',
      className,
    ].join(' ')}>
      {children}
    </td>
  );
}

function TotalRow({ label, value, sub, color = 'teal', colSpan = 2 }) {
  const cls = {
    teal:  'bg-teal-50 border-t-2 border-teal-200 text-teal-900',
    gray:  'bg-gray-100 border-t border-gray-200 text-gray-900',
    amber: 'bg-amber-50 border-t-2 border-amber-200 text-amber-900',
  }[color];
  return (
    <tr className={cls}>
      <td className="px-4 py-3 font-bold text-sm">{label}{sub && <span className="text-xs font-normal opacity-60 ml-2">{sub}</span>}</td>
      <td colSpan={colSpan} className="px-4 py-3 font-bold text-sm text-right tabular-nums whitespace-nowrap">{value}</td>
    </tr>
  );
}

// ─── ProseCard — bloc narratif entre sections ────────────────────────────────

function ProseCard({ children, color = 'gray' }) {
  const cls = {
    gray:  'bg-gray-50 border-gray-200 text-gray-700',
    teal:  'bg-teal-50/60 border-teal-200 text-teal-900',
    amber: 'bg-amber-50/60 border-amber-200 text-amber-800',
    blue:  'bg-blue-50/60 border-blue-200 text-blue-900',
    navy:  'bg-slate-50 border-slate-200 text-slate-800',
  }[color] ?? 'bg-gray-50 border-gray-200 text-gray-700';
  return (
    <div className={`rounded-xl border px-5 py-4 text-sm leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}

// ─── Table récap revenus ──────────────────────────────────────────────────────

function RevenusTable({ d, p }) {
  const fmtTaux = t => t > 0 ? `${t} %` : '—';

  const Row = ({ label, v1, v2, sub = false, minus: isMinus = false }) => (
    <tr className={sub ? 'bg-gray-50/50' : ''}>
      <Td className={sub ? 'pl-8' : ''}>{label}</Td>
      <Td right bold={sub} minus={isMinus}>{v1}</Td>
      {d.isCouple && <Td right bold={sub} minus={isMinus}>{v2 ?? v1}</Td>}
    </tr>
  );

  return (
    <SectionBox title={d.isCouple ? 'Revenus 2025 — D1 & D2' : 'Revenus 2025'} num="02a">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Élément</Th>
            <Th right>{d.isCouple ? 'D1' : 'Montant'}</Th>
            {d.isCouple && <Th right>D2</Th>}
          </tr>
        </thead>
        <tbody>
          {(d.brutD1 > 0 || d.brutD2 > 0) && (
            <Row label="Brut imposable" v1={e2(d.brutD1)} v2={e2(d.brutD2)} />
          )}
          <Row label="Net imposable (case 1AJ)" v1={e2(d.netD1)} v2={e2(d.netD2)} />
          <Row label="− Abattement 10 % frais pro" v1={`− ${e2(d.abt10D1)}`} v2={`− ${e2(d.abt10D2)}`} sub isMinus />
          <tr className="bg-gray-50/60">
            <Td bold>Salaires retenus</Td>
            <Td right bold>{e2(d.salRetD1 ?? d.retD1)}</Td>
            {d.isCouple && <Td right bold>{e2(d.salRetD2 ?? d.retD2)}</Td>}
          </tr>
          {/* Rente 1AS/1BS */}
          {(p.rente1BsD1 > 0 || (d.isCouple && p.rente1BsD2 > 0)) && <>
            <tr>
              <td colSpan={d.isCouple ? 3 : 2} className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                Pensions / rentes viagères
              </td>
            </tr>
            {p.rente1BsD1 > 0 && (
              <Row label="Rente/pension 1AS D1 (après abat. 10%)" v1={e2(p.rniRenteD1 || Math.round(p.rente1BsD1 * 0.9))} v2="—" />
            )}
            {d.isCouple && p.rente1BsD2 > 0 && (
              <Row label="Rente/pension 1BS D2 (après abat. 10%)" v1={d.isCouple ? '—' : e2(p.rniRenteD2 || Math.round(p.rente1BsD2 * 0.9))} v2={e2(p.rniRenteD2 || Math.round(p.rente1BsD2 * 0.9))} />
            )}
          </>}
          {/* ARE */}
          {(p.rniAreD1 > 0 || p.rniAreD2 > 0) && (
            <Row label="Allocations chômage (ARE)" v1={p.rniAreD1 > 0 ? e2(p.rniAreD1) : '—'} v2={p.rniAreD2 > 0 ? e2(p.rniAreD2) : '—'} />
          )}
          <Row label="PAS prélevé 2025" v1={e2(d.pasD1)} v2={e2(d.pasD2)} />
          {(p.tauxPasD1 > 0 || p.tauxPasD2 > 0) && (
            <Row label="Taux PAS effectif" v1={fmtTaux(p.tauxPasD1)} v2={fmtTaux(p.tauxPasD2)} />
          )}
          {(p.peroD1 > 0 || p.peroD2 > 0) && (
            <Row label="PERO — déjà inclus dans 1AJ" v1={p.peroD1 > 0 ? e0(p.peroD1) : '—'} v2={p.peroD2 > 0 ? e0(p.peroD2) : '—'} />
          )}
          {/* Total revenus nets imposables par déclarant (avant agrégation foyer) */}
          <tr className="bg-teal-50/40 border-t-2 border-teal-100">
            <Td bold>Total revenus nets imposables{d.isCouple ? ' (par déclarant)' : ''}</Td>
            <Td right bold className="text-teal-700">{e2(d.retD1)}</Td>
            {d.isCouple && <Td right bold className="text-teal-700">{e2(d.retD2)}</Td>}
          </tr>
          {d.foncierBrut > 0 && <>
            <tr>
              <td colSpan={d.isCouple ? 3 : 2} className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                Revenus fonciers
              </td>
            </tr>
            <tr>
              <Td>Foncier brut (case 4BE)</Td>
              <Td right colSpan={d.isCouple ? 2 : 1}>{e2(d.foncierBrut)}</Td>
            </tr>
            {d.isMicro && (
              <tr>
                <Td className="pl-8">− Abattement 30 % micro-foncier</Td>
                <Td right minus colSpan={d.isCouple ? 2 : 1}>− {e2(d.foncierAbt)}</Td>
              </tr>
            )}
            <tr className="bg-gray-50/60">
              <Td bold>Foncier net imposable</Td>
              <Td right bold colSpan={d.isCouple ? 2 : 1}>{e2(d.foncierNet)}</Td>
            </tr>
          </>}
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Table récap épargne & placements ────────────────────────────────────────

function EpargneTable({ p }) {
  const isCouple = p.mode === 'couple';

  const rows = [
    { label: 'Livret A',                  d1: p.livretAD1,    d2: p.livretAD2    },
    { label: 'LDDS',                       d1: p.lddsD1,       d2: p.lddsD2       },
    { label: 'LEP',                        d1: p.lepD1,        d2: p.lepD2        },
    { label: 'Livret+ / Livret bancaire',  d1: p.livretPlusD1, d2: p.livretPlusD2 },
    { label: 'PEL',                        d1: p.pelD1,        d2: p.pelD2        },
    { label: 'PEA',                        d1: p.peaD1,        d2: p.peaD2        },
    { label: 'CTO (compte-titres)',        d1: p.ctoD1,        d2: p.ctoD2        },
    { label: 'Assurance-vie',              d1: p.avD1,         d2: p.avD2         },
    { label: 'PERCO / PER',               d1: p.percoD1,      d2: p.percoD2      },
    { label: 'PEE',                        d1: p.peeD1,        d2: p.peeD2        },
    { label: 'Crypto (wallet)',            d1: p.cryptoD1,     d2: p.cryptoD2     },
  ].filter(r => (r.d1 || 0) + (r.d2 || 0) > 0);

  if (rows.length === 0) return null;

  const totalD1 = rows.reduce((s, r) => s + (r.d1 || 0), 0);
  const totalD2 = rows.reduce((s, r) => s + (r.d2 || 0), 0);

  return (
    <SectionBox title="Épargne & placements" num="02b">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Enveloppe</Th>
            <Th right>{isCouple ? 'D1' : 'Montant'}</Th>
            {isCouple && <Th right>D2</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <Td>{r.label}</Td>
              <Td right>{r.d1 > 0 ? e0(r.d1) : '—'}</Td>
              {isCouple && <Td right>{r.d2 > 0 ? e0(r.d2) : '—'}</Td>}
            </tr>
          ))}
          <tr className="bg-gray-50 border-t-2 border-gray-200">
            <td className="px-4 py-3 text-xs font-bold text-gray-900">Total patrimoine financier</td>
            <td className="px-4 py-3 text-xs font-bold text-gray-900 text-right whitespace-nowrap tabular-nums">{e0(totalD1)}</td>
            {isCouple && (
              <td className="px-4 py-3 text-xs font-bold text-gray-900 text-right whitespace-nowrap tabular-nums">{e0(totalD2)}</td>
            )}
          </tr>
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Bloc déséquilibre patrimonial (couples) ──────────────────────────────────

function PatrimoineDesequilibreBlock({ p }) {
  if (p.mode !== 'couple') return null;

  const D1_FIELDS = ['livretAD1','lddsD1','lepD1','livretPlusD1','pelD1','peaD1','avD1','percoD1','peeD1','cryptoD1'];
  const D2_FIELDS = ['livretAD2','lddsD2','lepD2','livretPlusD2','pelD2','peaD2','avD2','percoD2','peeD2','cryptoD2'];

  const totalD1 = D1_FIELDS.reduce((s, f) => s + (p[f] || 0), 0);
  const totalD2 = D2_FIELDS.reduce((s, f) => s + (p[f] || 0), 0);
  const total = totalD1 + totalD2;
  if (total < 1000) return null;

  const pctD1 = total > 0 ? Math.round((totalD1 / total) * 100) : 0;
  const pctD2 = 100 - pctD1;
  const isImbalanced = Math.abs(pctD1 - 50) > 20;

  return (
    <ProseCard color={isImbalanced ? 'amber' : 'teal'}>
      <strong>Répartition patrimoniale :</strong>{' '}
      D1 détient {pctD1}&nbsp;% du patrimoine financier du foyer ({e0(totalD1)}), D2 en détient {pctD2}&nbsp;% ({e0(totalD2)}).
      {isImbalanced ? (
        <> Ce déséquilibre mérite attention : en cas de dissolution du PACS, chacun récupère ses actifs propres (sauf biens communs). Alimenter les enveloppes de D2 (PER, PEA, AV) permet de rééquilibrer progressivement.</>
      ) : (
        <> La répartition est équilibrée — bonne base pour une stratégie patrimoniale coordonnée.</>
      )}
    </ProseCard>
  );
}

// ─── Table 1 : Du brut au RNI ─────────────────────────────────────────────────

function RniTable({ d, p = {} }) {
  return (
    <SectionBox title="Étape 1 — Du brut imposable au revenu net imposable (RNI)" num="03a">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Élément</Th>
            <Th right>Montant</Th>
            <Th>Référence</Th>
          </tr>
        </thead>
        <tbody>
          {/* ── D1 salaires ── */}
          {d.netD1 > 0 && <>
            <tr>
              <Td>{d.isCouple ? 'Salaires nets imposables D1' : 'Salaires nets imposables'}</Td>
              <Td right>{e2(d.netD1)}</Td>
              <Td muted>{d.brutD1 > 0 ? `Bulletin déc. (brut ${e0(d.brutD1)})` : '1AJ — bulletin déc.'}</Td>
            </tr>
            <tr>
              <Td className="pl-8">
                {`− Abattement ${ABT.taux * 100} % frais pro${d.isCouple ? ' D1' : ''}`}
              </Td>
              <Td right minus>− {e2(d.abt10D1)}</Td>
              <Td muted>art. 83 3° CGI</Td>
            </tr>
            <tr className="bg-gray-50/50">
              <Td bold>{`= Salaires retenus${d.isCouple ? ' D1' : ''}`}</Td>
              <Td right bold>{e2(d.salRetD1 ?? d.retD1)}</Td>
              <Td muted />
            </tr>
          </>}

          {/* ── D1 rente 1AS ── */}
          {(p.rente1BsD1 > 0) && <>
            <tr>
              <Td>Rente/pension 1AS D1</Td>
              <Td right>{e2(p.rente1BsD1)}</Td>
              <Td muted>case 1AS</Td>
            </tr>
            <tr>
              <Td className="pl-8">− Abattement 10 % pensions D1</Td>
              <Td right minus>− {e2(Math.round(p.rente1BsD1 - (p.rniRenteD1 || Math.round(p.rente1BsD1 * 0.9))))}</Td>
              <Td muted>art. 158-5-a CGI</Td>
            </tr>
            <tr className="bg-gray-50/50">
              <Td bold>= Rente retenue D1</Td>
              <Td right bold>{e2(p.rniRenteD1 || Math.round(p.rente1BsD1 * 0.9))}</Td>
              <Td muted />
            </tr>
          </>}

          {/* ── D1 ARE ── */}
          {(p.rniAreD1 > 0) && <tr>
            <Td>Allocations chômage D1 (ARE)</Td>
            <Td right>{e2(p.rniAreD1)}</Td>
            <Td muted>case 1AP — imposable 100 %</Td>
          </tr>}

          {/* ── D2 salaires ── */}
          {d.isCouple && d.netD2 > 0 && <>
            <tr>
              <Td>Salaires nets imposables D2</Td>
              <Td right>{e2(d.netD2)}</Td>
              <Td muted>{d.brutD2 > 0 ? `Bulletin(s) (brut ${e0(d.brutD2)})` : '1BJ — cumul 2 employeurs'}</Td>
            </tr>
            <tr>
              <Td className="pl-8">{`− Abattement ${ABT.taux * 100} % frais pro D2`}</Td>
              <Td right minus>− {e2(d.abt10D2)}</Td>
              <Td muted>art. 83 3° CGI</Td>
            </tr>
            <tr className="bg-gray-50/50">
              <Td bold>= Salaires retenus D2</Td>
              <Td right bold>{e2(d.salRetD2 ?? d.retD2)}</Td>
              <Td muted />
            </tr>
          </>}

          {/* ── D2 rente 1BS ── */}
          {d.isCouple && (p.rente1BsD2 > 0) && <>
            <tr>
              <Td>Rente/pension 1BS D2</Td>
              <Td right>{e2(p.rente1BsD2)}</Td>
              <Td muted>case 1BS</Td>
            </tr>
            <tr>
              <Td className="pl-8">− Abattement 10 % pensions D2</Td>
              <Td right minus>− {e2(Math.round(p.rente1BsD2 - (p.rniRenteD2 || Math.round(p.rente1BsD2 * 0.9))))}</Td>
              <Td muted>art. 158-5-a CGI</Td>
            </tr>
            <tr className="bg-gray-50/50">
              <Td bold>= Rente retenue D2</Td>
              <Td right bold>{e2(p.rniRenteD2 || Math.round(p.rente1BsD2 * 0.9))}</Td>
              <Td muted />
            </tr>
          </>}

          {/* ── D2 ARE ── */}
          {d.isCouple && (p.rniAreD2 > 0) && <tr>
            <Td>Allocations chômage D2 (ARE)</Td>
            <Td right>{e2(p.rniAreD2)}</Td>
            <Td muted>case 1AP — imposable 100 %</Td>
          </tr>}

          {/* ── Foncier ── */}
          {d.foncierBrut > 0 && <>
            <tr>
              <Td>{d.isCouple ? 'Revenus fonciers bruts' : 'Revenus fonciers bruts'}</Td>
              <Td right>{e2(d.foncierBrut)}</Td>
              <Td muted>case 4BE</Td>
            </tr>
            {d.isMicro && <tr>
              <Td className="pl-8">− Abattement 30 % micro-foncier</Td>
              <Td right minus>− {e2(d.foncierAbt)}</Td>
              <Td muted>art. 32 CGI</Td>
            </tr>}
            <tr className="bg-gray-50/50">
              <Td bold>= Foncier net imposable</Td>
              <Td right bold>{e2(d.foncierNet)}</Td>
              <Td muted />
            </tr>
          </>}

          <TotalRow
            label="RNI total foyer"
            value={e2(d.rniFoyer)}
            sub={d.parts > 1
              ? `${d.parts} parts → quotient familial ${e2(d.quotient)} / part`
              : `${d.parts} part → quotient ${e2(d.quotient)}`}
          />
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Table 2 : Barème progressif ─────────────────────────────────────────────

function BaremeTable({ d }) {
  const { steps, irParPart, irBrutFoyer, parts, quotient } = d;
  const label0 = `Quotient familial = ${e2(d.rniFoyer)} ÷ ${parts} part${parts > 1 ? 's' : ''} = ${e2(quotient)} par part`;

  return (
    <SectionBox title="Étape 2 — Barème progressif appliqué au quotient familial" num="03b">
      <div className="px-5 py-2.5 text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
        {label0}
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Tranche</Th>
            <Th>Plage (par part)</Th>
            <Th>Calcul</Th>
            <Th right>IR par part</Th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const hiLabel = isFinite(s.hiEff) ? e2(s.hiEff) : '∞';
            const calcStr = `${e2(s.taxable)} × ${pct(s.rate)}`;
            return (
              <tr key={i}>
                <Td bold={s.rate > 0}>{pct(s.rate)}</Td>
                <Td muted>{e2(s.lo)} → {hiLabel}</Td>
                <Td muted={s.rate === 0}>{s.rate === 0 ? `${e2(s.taxable)} × 0 %` : calcStr}</Td>
                <Td right bold={s.rate > 0}>{e2(s.irParPart)}</Td>
              </tr>
            );
          })}
          <tr className="bg-gray-50 border-t border-gray-200">
            <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-700">
              IR par part
            </td>
            <td className="px-4 py-2.5 text-xs font-bold text-gray-900 text-right tabular-nums">
              {e2(irParPart)}
            </td>
          </tr>
          <TotalRow
            label={`IR brut foyer (${e2(irParPart)} × ${parts} part${parts > 1 ? 's' : ''})`}
            value={e2(irBrutFoyer)}
            colSpan={3}
          />
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Table : détail du calcul d'IR par déclarant (méthode célibataire) ───────

function IRParDeclarantTable({ d }) {
  if (!d.isCouple) return null;
  const { retD1, retD2 } = d;
  if ((retD1 || 0) <= 0 && (retD2 || 0) <= 0) return null;

  const stepsD1   = baremeSteps(retD1 || 0, 1);
  const stepsD2   = baremeSteps(retD2 || 0, 1);
  const irBrutD1  = stepsD1.reduce((s, t) => s + t.irParPart, 0);
  const irBrutD2  = stepsD2.reduce((s, t) => s + t.irParPart, 0);
  const decoteD1  = decote(irBrutD1, false);
  const decoteD2  = decote(irBrutD2, false);
  const irNetD1   = Math.max(0, irBrutD1 - decoteD1);
  const irNetD2   = Math.max(0, irBrutD2 - decoteD2);

  // Toutes les tranches qui interviennent pour au moins un déclarant.
  const ratesUsed = [...new Set([...stepsD1, ...stepsD2].map(s => s.rate))];
  const tranches  = TRANCHES.filter(([, , rate]) => ratesUsed.includes(rate));

  const findStep = (steps, rate) => steps.find(s => Math.abs(s.rate - rate) < 1e-6);

  return (
    <SectionBox title="Détail du calcul d'IR par déclarant (1 part chacun, méthode célibataire)" num="03c">
      <div className="px-5 py-2.5 text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
        Application du barème progressif à chaque RNI individuel, comme si chacun déclarait seul.
        Sert de référence pour le partage équitable du gain PACS dans la section suivante.
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Tranche</Th>
            <Th right>D1 — base × taux</Th>
            <Th right>IR D1</Th>
            <Th right>D2 — base × taux</Th>
            <Th right>IR D2</Th>
          </tr>
        </thead>
        <tbody>
          {tranches.map(([lo, hi, rate], i) => {
            const sD1 = findStep(stepsD1, rate);
            const sD2 = findStep(stepsD2, rate);
            const hiLabel = isFinite(hi) ? e2(hi) : '∞';
            return (
              <tr key={i}>
                <Td bold={rate > 0}>
                  {pct(rate)}
                  <span className="block text-xs text-gray-400 font-normal">{e0(lo)} → {hiLabel}</span>
                </Td>
                <Td right muted={!sD1}>
                  {sD1 ? `${e2(sD1.taxable)} × ${pct(rate)}` : '—'}
                </Td>
                <Td right bold={!!sD1 && rate > 0}>{sD1 ? e2(sD1.irParPart) : '—'}</Td>
                <Td right muted={!sD2}>
                  {sD2 ? `${e2(sD2.taxable)} × ${pct(rate)}` : '—'}
                </Td>
                <Td right bold={!!sD2 && rate > 0}>{sD2 ? e2(sD2.irParPart) : '—'}</Td>
              </tr>
            );
          })}
          <tr className="bg-gray-50 border-t border-gray-200">
            <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">IR brut solo (1 part)</td>
            <td className="px-4 py-2.5"></td>
            <td className="px-4 py-2.5 text-xs font-bold text-gray-900 text-right tabular-nums">{e2(irBrutD1)}</td>
            <td className="px-4 py-2.5"></td>
            <td className="px-4 py-2.5 text-xs font-bold text-gray-900 text-right tabular-nums">{e2(irBrutD2)}</td>
          </tr>
          {(decoteD1 > 0 || decoteD2 > 0) && (
            <tr>
              <td className="px-4 py-2.5 text-xs text-gray-600">− Décote célibataire</td>
              <td className="px-4 py-2.5"></td>
              <td className="px-4 py-2.5 text-xs text-red-600 text-right tabular-nums">{decoteD1 > 0 ? `− ${e2(decoteD1)}` : '—'}</td>
              <td className="px-4 py-2.5"></td>
              <td className="px-4 py-2.5 text-xs text-red-600 text-right tabular-nums">{decoteD2 > 0 ? `− ${e2(decoteD2)}` : '—'}</td>
            </tr>
          )}
          <tr className="bg-teal-50/60 border-t-2 border-teal-200">
            <td className="px-4 py-3 text-sm font-bold text-teal-900">IR net solo (1 part)</td>
            <td className="px-4 py-3"></td>
            <td className="px-4 py-3 text-sm font-bold text-teal-700 text-right tabular-nums">{e2(irNetD1)}</td>
            <td className="px-4 py-3"></td>
            <td className="px-4 py-3 text-sm font-bold text-teal-700 text-right tabular-nums">{e2(irNetD2)}</td>
          </tr>
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Prose TMI ────────────────────────────────────────────────────────────────

function TmiProseBlock({ d }) {
  if (!d.steps.length) return null;
  const lastStep = d.steps[d.steps.length - 1];
  const tmi = Math.round(lastStep.rate * 100);
  if (tmi === 0) return null;

  const amountInTopBracket = Math.round(lastStep.taxable * d.parts);
  const seuilTotal = Math.round(lastStep.lo * d.parts);

  const tranLabel = tmi === 11
    ? `tranche à 11 % (revenus de 11 600 € à 29 579 € par part)`
    : tmi === 30
    ? `tranche à 30 % (revenus de 29 579 € à 84 577 € par part)`
    : tmi === 41
    ? `tranche à 41 %`
    : `tranche à ${tmi} %`;

  return (
    <ProseCard color="navy">
      Le foyer entre dans la <strong>{tranLabel}</strong>. Sur le quotient familial de{' '}
      <strong>{e2(d.quotient)}/part</strong>, {e0(amountInTopBracket)} sont imposés au taux marginal
      de <strong>{tmi}&nbsp;%</strong> (seuil {e0(seuilTotal)} pour {d.parts} part{d.parts > 1 ? 's' : ''}).
      {tmi >= 30 && (
        <> Un versement PER réduit d'abord cette tranche haute — son rendement réel peut être légèrement inférieur
        au TMI si la déduction déborde sur la tranche{tmi > 30 ? ` 30 %` : ` 11 %`}.</>
      )}
    </ProseCard>
  );
}

// ─── Table 3 : IR foyer et solde ─────────────────────────────────────────────

function SoldeTable({ d, cehr = 0 }) {
  const { irBrutFoyer, dec, irNetFoyer, psFoncier, totalDu, pasTotal, pasD1, pasD2, solde, isCouple } = d;
  const isRemb = solde <= 0;

  return (
    <SectionBox title="Étape 3 — IR foyer et solde" num="03d">
      <Tbl>
        <tbody>
          <tr>
            <Td>IR brut foyer</Td>
            <Td right>{e2(irBrutFoyer)}</Td>
          </tr>
          <tr>
            <Td className="pl-8">
              Décote {isCouple ? 'couple' : 'célibataire'}
              {` (seuil ${isCouple ? DECOTE.seuil_couple : DECOTE.seuil_celibataire} €)`}
            </Td>
            <Td right muted>
              {dec > 0 ? `− ${e2(dec)}` : '— pas de décote'}
            </Td>
          </tr>
          {dec > 0 && <tr className="bg-gray-50/50">
            <Td bold>= IR net foyer</Td>
            <Td right bold>{e2(irNetFoyer)}</Td>
          </tr>}
          {cehr > 0 && (
            <tr className="bg-orange-50/40">
              <Td className="text-orange-700">
                + CEHR art. 223 sexies CGI
                <span className="ml-1 text-xs text-orange-500">(non retenue à la source — à régler)</span>
              </Td>
              <Td right className="text-orange-700 font-bold">+ {e2(cehr)}</Td>
            </tr>
          )}
          {psFoncier > 0 && <>
            <tr>
              <Td className="pl-8">+ Prélèvements sociaux 17,2 % sur foncier net</Td>
              <Td right plus>+ {e2(psFoncier)}</Td>
            </tr>
            <tr className="bg-gray-50/50">
              <Td bold>= Total dû foyer</Td>
              <Td right bold>{e2(totalDu + cehr)}</Td>
            </tr>
          </>}
          {psFoncier <= 0 && cehr > 0 && (
            <tr className="bg-gray-50/50">
              <Td bold>= Total dû foyer</Td>
              <Td right bold>{e2(totalDu + cehr)}</Td>
            </tr>
          )}
          <tr>
            <Td className="pl-8">
              − PAS prélevé 2025
              {isCouple && pasD1 > 0 && pasD2 > 0
                ? ` (D1 ${e0(pasD1)} + D2 ${e0(pasD2)})`
                : ''}
            </Td>
            <Td right minus>− {e2(pasTotal)}</Td>
          </tr>
          <TotalRow
            label={isRemb ? 'Remboursement attendu' : 'Complément à payer'}
            value={(isRemb ? '+ ' : '') + e2(Math.abs(solde))}
            color={isRemb ? 'teal' : 'amber'}
          />
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Table 4 : Gain PACS ─────────────────────────────────────────────────────

function GainPacsTable({ d }) {
  const { irD1Solo, irD2Solo, totalSolo, gainPacs, irNetFoyer,
          contribD1, contribD2, pasD1, pasD2, pasTotal, solde } = d;
  const isRemb = solde <= 0;

  return (
    <SectionBox title="Partage équitable du gain PACS — qui paie quoi" num="03e">
      <div className="px-5 py-2 text-xs text-gray-500 bg-gray-50/50 border-b border-gray-100">
        On compare l'IR réel (en couple, 2 parts) à ce que chacun paierait en célibataire (1 part).
        L'écart = gain du quotient familial, partagé 50 / 50.
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th wide> </Th>
            <Th right>D1</Th>
            <Th right>D2</Th>
            <Th right>Total</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>Si chacun en célibataire (1 part)</Td>
            <Td right>{e2(irD1Solo)}</Td>
            <Td right>{e2(irD2Solo)}</Td>
            <Td right bold>{e2(totalSolo)}</Td>
          </tr>
          <tr>
            <Td>IR réel PACS (2 parts)</Td>
            <Td right muted>—</Td>
            <Td right muted>—</Td>
            <Td right>{e2(irNetFoyer)}</Td>
          </tr>
          <tr className="bg-teal-50/40">
            <Td bold>Gain PACS total</Td>
            <Td right muted>—</Td>
            <Td right muted>—</Td>
            <Td right bold plus>{e2(gainPacs)}</Td>
          </tr>
          <tr>
            <Td className="pl-8">Part équitable du gain (50 / 50)</Td>
            <Td right minus>− {e2(gainPacs / 2)}</Td>
            <Td right minus>− {e2(gainPacs / 2)}</Td>
            <Td right minus>− {e2(gainPacs)}</Td>
          </tr>
          <tr className="bg-gray-50/60">
            <Td bold>Contribution équitable</Td>
            <Td right bold>{e2(contribD1)}</Td>
            <Td right bold>{e2(contribD2)}</Td>
            <Td right bold>{e2(irNetFoyer)}</Td>
          </tr>
          <tr>
            <Td>PAS prélevé 2025</Td>
            <Td right>{e2(pasD1)}</Td>
            <Td right>{e2(pasD2)}</Td>
            <Td right>{e2(pasTotal)}</Td>
          </tr>
          <tr className={`border-t-2 ${solde <= 0 ? 'bg-teal-50/60 border-teal-200' : 'bg-amber-50/60 border-amber-200'}`}>
            <td className="px-4 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">Régularisation foyer</td>
            <td className={`px-4 py-3 text-xs font-bold text-right tabular-nums whitespace-nowrap ${d.regloD1 >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>
              {d.regloD1 >= 0 ? 'récupère ' : 'verse '}{e2(Math.abs(d.regloD1))}
            </td>
            <td className={`px-4 py-3 text-xs font-bold text-right tabular-nums whitespace-nowrap ${d.regloD2 >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>
              {d.regloD2 >= 0 ? 'récupère ' : 'verse '}{e2(Math.abs(d.regloD2))}
            </td>
            <td className={`px-4 py-3 text-xs font-bold text-right tabular-nums whitespace-nowrap ${isRemb ? 'text-teal-700' : 'text-amber-700'}`}>
              {isRemb ? '+ ' : ''}{e2(Math.abs(solde))}
            </td>
          </tr>
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Accord couple — prose explicatif ────────────────────────────────────────

function AccordCoupleProseBlock({ d }) {
  if (!d.isCouple || d.gainPacs <= 0) return null;
  const { contribD1, contribD2, regloD1, regloD2 } = d;

  const regloMsg = () => {
    if (regloD1 > 50 && regloD2 > 50)
      return `Les deux déclarants récupèrent chacun une partie du remboursement : D1 perçoit ${e0(regloD1)}, D2 perçoit ${e0(regloD2)}.`;
    if (regloD1 < -50)
      return `D1 verse ${e0(Math.abs(regloD1))} à D2 pour équilibrer la répartition (D1 a été sous-prélevé relativement à sa contribution équitable).`;
    if (regloD2 < -50)
      return `D2 verse ${e0(Math.abs(regloD2))} à D1 pour équilibrer la répartition.`;
    return `La régularisation est équilibrée entre les deux déclarants.`;
  };

  return (
    <ProseCard color="blue">
      <strong>Accord couple — répartition interne :</strong>{' '}
      Sur la base d'une contribution proportionnelle aux revenus et d'un partage équitable du gain PACS (−{e0(d.gainPacs / 2)} chacun),
      D1 prend en charge <strong>{e0(contribD1)}</strong> d'IR et D2 <strong>{e0(contribD2)}</strong>.{' '}
      {regloMsg()}{' '}
      Cet accord ne modifie pas l'impôt dû à l'État — il régit uniquement la répartition interne au foyer.
    </ProseCard>
  );
}

// ─── Helper : plafonds PER effectifs avec reports N-1/N-2/N-3 (INC-03) ──────
// Les reports sont stockés au niveau foyer → pro-ratés par RNI en couple mode.
function getEffectivePlafondsWithReports(p) {
  const rniD1    = p.rniD1 || 0;
  const rniD2    = p.rniD2 || 0;
  const rniTot   = rniD1 + rniD2;
  const repTotal = (p.perReportableN1 || 0) + (p.perReportableN2 || 0) + (p.perReportableN3 || 0);
  const repD1    = rniTot > 0 ? Math.round(repTotal * (rniD1 / rniTot)) : repTotal;
  const repD2    = repTotal - repD1;
  return {
    plafondD1: (p.plafondPerD1 || 0) + repD1,
    plafondD2: (p.plafondPerD2 || 0) + repD2,
  };
}

// ─── Tableau 4 scénarios PER ─────────────────────────────────────────────────

// ─── Bloc zones PER par tranche ──────────────────────────────────────────────

function PerZonesBlock({ p, d, perSim }) {
  const isCouple = d.isCouple;
  const parts = p.parts || (isCouple ? 2 : 1);
  const stopRate = Math.min(p.tmiRetraiteD1 ?? 11, p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? 11)) / 100;

  // INC-03 : inclure les reports N-1/N-2/N-3
  const { plafondD1, plafondD2 } = getEffectivePlafondsWithReports(p);

  const rniD1 = p.rniD1 || 0;
  const rniD2 = p.rniD2 || 0;

  const opt = useMemo(
    () => computePerOptimumCascade(d.rniFoyer, parts, plafondD1, plafondD2, isCouple, rniD1, rniD2, stopRate),
    [d.rniFoyer, parts, plafondD1, plafondD2, isCouple, rniD1, rniD2, stopRate]
  );

  const simD1 = perSim?.versementD1 || 0;
  const simD2 = perSim?.versementD2 || 0;
  const hasSimState = (simD1 + simD2) > 0;

  if (opt.tmiDepart <= 11) {
    return (
      <SectionBox title="Stratégie PER — Optimum fiscal par tranche" num="04a">
        <div className="p-5">
          <p className="text-xs text-gray-700">
            <strong>TMI foyer = {d.tmi}&nbsp;%</strong> — PER non recommandé.
            Le rendement fiscal insuffisant ne justifie pas l'immobilisation des fonds jusqu'à la retraite.
            Privilégier : PEA (exonération plus-values après 5 ans), assurance-vie (fiscalité allégée après 8 ans) ou livrets garantis.
          </p>
        </div>
      </SectionBox>
    );
  }

  return (
    <SectionBox title="Stratégie PER — Optimum fiscal par tranche" num="04a">
      <div className="p-4 flex flex-col gap-3">

        {/* Zones prioritaires */}
        {opt.zones.map((z, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="w-5 h-5 rounded-full bg-gray-700 text-white text-2xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                Zone {i + 1} — PER prioritaire · Effacement tranche {z.taux}&nbsp;% · Rendement {z.taux}&nbsp;%
              </span>
              {z.partial && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Plafond épuisé avant effacement complet</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Fraction imposée à {z.taux}&nbsp;%</p>
                <p className="text-sm font-bold text-gray-900 tabular-nums">{e0(z.fractionFoyer)}</p>
                {z.partial && <p className="text-xs text-amber-600 mt-0.5">Couverture plafond&nbsp;: {e0(z.versement)}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Versement PER cible</p>
                <p className="text-sm font-bold text-gray-900 tabular-nums">{e0(z.versement)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Économie IR</p>
                <p className="text-sm font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{e0(z.versement)} × {z.taux}&nbsp;% = <strong>{e0(z.economie)}</strong></p>
              </div>
            </div>
            {isCouple && i === opt.zones.length - 1 && (plafondD1 > 0 || plafondD2 > 0) && (
              <p className="mt-2 text-xs text-gray-600 border-t border-gray-200 pt-2">
                Répartition suggérée&nbsp;:{' '}
                <strong>{opt.prioritaire === 'D1' ? 'D1' : 'D2'}&nbsp;{opt.prioritaire === 'D1' ? e0(opt.optimumD1) : e0(opt.optimumD2)}</strong>
                <span className="text-2xs bg-gray-200 text-gray-700 px-1 py-0.5 rounded font-semibold ml-1">prioritaire</span>
                {' · '}
                <strong>{opt.prioritaire === 'D1' ? 'D2' : 'D1'}&nbsp;{opt.prioritaire === 'D1' ? e0(opt.optimumD2) : e0(opt.optimumD1)}</strong>
              </p>
            )}
          </div>
        ))}

        {/* Récapitulatif */}
        <div className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-3 flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Versement optimum</p>
            <p className="text-sm font-bold text-gray-900 tabular-nums">{e0(opt.optimumTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Économie IR réelle</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">{e0(opt.economieOptimum)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Effort net réel</p>
            <p className="text-sm font-bold text-gray-900 tabular-nums">{e0(opt.effortNet)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Rendement fiscal</p>
            <p className="text-sm font-bold text-gray-900 tabular-nums">{opt.rendementMoyen}&nbsp;%</p>
          </div>
        </div>

        {/* Zone résiduelle 11% */}
        {opt.capaciteResiduelle > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">
              Zone PER à rendement réduit — Tranche 11&nbsp;% atteinte
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3">
              <div>
                <p className="text-xs text-amber-600 uppercase tracking-wide">Capacité PER résiduelle</p>
                <p className="text-sm font-bold text-amber-900 tabular-nums">
                  {e0(opt.capaciteResiduelle)} <span className="text-amber-500 font-normal text-xs">({e0(opt.plafondTotal)} − {e0(opt.optimumTotal)})</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-amber-600 uppercase tracking-wide">Rendement PER résiduel</p>
                <p className="text-sm font-semibold text-amber-800">11&nbsp;% seulement</p>
              </div>
            </div>
            <div className="border-t border-amber-200 pt-2 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800">Alternatives à privilégier pour cet excédent&nbsp;:</p>
              <p className="text-xs text-amber-700">→ <strong>PEA</strong>&nbsp;: pas d'économie IR immédiate, mais exonération des plus-values après 5 ans et meilleure liquidité</p>
              <p className="text-xs text-amber-700">→ <strong>Assurance-vie</strong>&nbsp;: fiscalité allégée après 8 ans, disponibilité des fonds</p>
              <p className="text-xs text-amber-700">→ <strong>LDDS / Livret A</strong>&nbsp;: liquidité totale, rendement garanti (mais faible)</p>
            </div>
          </div>
        )}

        {/* Simulation active depuis le Simulateur */}
        {hasSimState && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Versements retenus dans le Simulateur</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {isCouple ? (
                <>
                  <div>
                    <p className="text-xs text-blue-600 uppercase">D1 versé</p>
                    <p className="text-xs font-bold text-blue-900 tabular-nums">{e0(simD1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 uppercase">D2 versé</p>
                    <p className="text-xs font-bold text-blue-900 tabular-nums">{e0(simD2)}</p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-xs text-blue-600 uppercase">Versement simulé</p>
                  <p className="text-xs font-bold text-blue-900 tabular-nums">{e0(simD1)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-blue-600 uppercase">Économie IR (barème réel)</p>
                <p className="text-xs font-bold text-emerald-700 tabular-nums">
                  {e0(Math.max(0, d.irNetFoyer - calcIR(Math.max(0, d.rniFoyer - simD1 - simD2), parts, isCouple)))}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </SectionBox>
  );
}

function PerScenariosTable({ p, d }) {
  const isCouple = d.isCouple;
  // INC-03 : reports inclus
  const { plafondD1: plafD1, plafondD2: plafD2 } = getEffectivePlafondsWithReports(p);
  const irAvant = d.irNetFoyer;
  const parts = p.parts || (isCouple ? 2 : 1);
  const stopRate = Math.min(p.tmiRetraiteD1 ?? 11, p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? 11)) / 100;

  const perOpt = computePerOptimumCascade(d.rniFoyer, parts, plafD1, plafD2, isCouple, p.rniD1 || 0, p.rniD2 || 0, stopRate);

  const calcScen = (versement) => {
    if (versement === 0) return { versement: 0, irApres: irAvant, economie: 0, effort: 0, rendement: 0 };
    const rniApres = Math.max(0, d.rniFoyer - versement);
    const irApres = calcIR(rniApres, parts, isCouple);
    const economie = Math.max(0, irAvant - irApres);
    const effort = versement - economie;
    const rendement = Math.round((economie / versement) * 100);
    return { versement, irApres, economie, effort, rendement };
  };

  let scenarios;
  if (isCouple && (plafD1 > 0 || plafD2 > 0)) {
    const prio  = perOpt.prioritaire || 'D1';
    const sec   = prio === 'D1' ? 'D2' : 'D1';
    const prioOpt  = prio === 'D1' ? perOpt.optimumD1 : perOpt.optimumD2;
    const prioPlaf = prio === 'D1' ? plafD1 : plafD2;
    const secPlaf  = prio === 'D1' ? plafD2 : plafD1;
    scenarios = [
      { label: 'A — Statu quo',            desc: 'Aucun versement',                                    ...calcScen(0) },
      { label: `B — Optimum ${prio}`,      desc: `${prio} seul · ${e0(prioOpt)} (effacement tranche max)`,  ...calcScen(prioOpt) },
      { label: `C — Optimum ${prio}+${sec}`, desc: `Total optimal · ${e0(perOpt.optimumTotal)}`,        ...calcScen(perOpt.optimumTotal) },
      { label: 'D — Plafond max',          desc: `${prio} ${e0(prioPlaf)} + ${sec} ${e0(secPlaf)}`,     ...calcScen(plafD1 + plafD2) },
    ];
  } else if (!isCouple && plafD1 > 0) {
    const optV = perOpt.optimumTotal || 0;
    const t75  = Math.round((plafD1 * 0.75) / 100) * 100;
    scenarios = [
      { label: 'A — Statu quo',       desc: 'Aucun versement',                             ...calcScen(0) },
      { label: 'B — Optimum fiscal',  desc: `Effacement tranches > 11% · ${e0(optV)}`,     ...calcScen(optV) },
      { label: 'C — Partiel 75%',     desc: `${e0(t75)} versés`,                           ...calcScen(t75) },
      { label: 'D — Plafond max',     desc: `${e0(plafD1)} versés`,                        ...calcScen(plafD1) },
    ];
  } else return null;

  const bestScen = scenarios.reduce((best, s) => s.economie > best.economie ? s : best, scenarios[0]);

  return (
    <SectionBox
      title="Comparaison de scénarios PER — barème réel 2025"
      num="04c"
      footer={
        <p className="px-4 py-2.5 text-xs text-gray-500 italic">
          Économie calculée sur le barème progressif réel — souvent inférieure à TMI × versement car la déduction traverse plusieurs tranches.
        </p>
      }
    >
      <table className="w-full text-xs">
        <thead>
          <tr>
            <Th wide>Scénario</Th>
            <Th right>Versement</Th>
            <Th right>IR après</Th>
            <Th right>Économie</Th>
            <Th right>Effort net</Th>
            <Th right>Rendement</Th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s, i) => {
            const isBest = s.label === bestScen.label && i > 0;
            return (
              <tr key={i} className={isBest ? 'bg-teal-50/50' : i === 0 ? 'bg-gray-50/40' : ''}>
                <td className="px-4 py-2.5 border-b border-gray-50">
                  <span className={`font-semibold ${isBest ? 'text-teal-800' : 'text-gray-800'}`}>{s.label}</span>
                  <span className="text-gray-400 ml-2 text-xs">{s.desc}</span>
                  {isBest && <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-semibold">Optimal</span>}
                </td>
                <Td right muted={s.versement === 0}>{s.versement > 0 ? e0(s.versement) : '—'}</Td>
                <Td right>{e0(s.irApres)}</Td>
                <Td right plus={s.economie > 0} bold={isBest}>{s.economie > 0 ? e0(s.economie) : '—'}</Td>
                <Td right muted={s.effort === 0}>{s.effort > 0 ? e0(s.effort) : '—'}</Td>
                <Td right muted={s.rendement === 0}>{s.rendement > 0 ? `${s.rendement} %` : '—'}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionBox>
  );
}

// ─── Calendrier d'exécution PER ──────────────────────────────────────────────

function PerCalendarBlock({ p, d }) {
  const isCouple = d.isCouple;
  // INC-03 : reports inclus
  const { plafondD1: plafD1, plafondD2: plafD2 } = getEffectivePlafondsWithReports(p);
  const parts  = p.parts || (isCouple ? 2 : 1);
  const stopRate = Math.min(p.tmiRetraiteD1 ?? 11, p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? 11)) / 100;

  const perOpt = computePerOptimumCascade(d.rniFoyer, parts, plafD1, plafD2, isCouple, p.rniD1 || 0, p.rniD2 || 0, stopRate);
  const prio   = perOpt.prioritaire || 'D1';
  const sec    = prio === 'D1' ? 'D2' : 'D1';
  const amtPrio  = prio === 'D1' ? perOpt.optimumD1 : perOpt.optimumD2;
  const amtSec   = prio === 'D1' ? perOpt.optimumD2 : perOpt.optimumD1;
  const amtTotal = perOpt.optimumTotal;

  if (amtTotal === 0) return null;

  const showSec = isCouple && amtSec > 0;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 flex items-center justify-between flex-wrap gap-1">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Calendrier d'exécution — versements PER optimum avant 31/12</p>
        {isCouple && (
          <span className="text-xs text-gray-500 italic">
            {prio} prioritaire (salaire le plus élevé) · économie IR réelle {e0(perOpt.economieOptimum)}
          </span>
        )}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rythme</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
              {isCouple ? `${prio} ★` : 'Montant'}
            </th>
            {showSec && (
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{sec}</th>
            )}
            {isCouple && <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Total</th>}
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'Mensuel (× 12)', div: 12, suffix: '/mois' },
            { label: 'Trimestriel (× 4)', div: 4, suffix: '/trim.' },
          ].map(({ label, div, suffix }) => (
            <tr key={label} className="border-t border-gray-100">
              <td className="px-4 py-2 text-gray-700 font-medium">{label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">{e0(amtPrio / div)}{suffix}</td>
              {showSec && <td className="px-3 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">{e0(amtSec / div)}{suffix}</td>}
              {isCouple && <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-700 whitespace-nowrap">{e0(amtTotal / div)}{suffix}</td>}
            </tr>
          ))}
          <tr className="border-t border-gray-200 bg-gray-100">
            <td className="px-4 py-2.5 text-gray-900 font-bold">Versement unique (décembre)</td>
            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">{e0(amtPrio)}</td>
            {showSec && <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">{e0(amtSec)}</td>}
            {isCouple && <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900 whitespace-nowrap">{e0(amtTotal)}</td>}
          </tr>
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-gray-500 italic border-t border-gray-100">
        Montants basés sur l'optimum fiscal (effacement des tranches {perOpt.tmiDepart}&nbsp;% et supérieures).
        {isCouple ? ` Plafond max disponible : ${prio} ${e0(plafD1 > 0 ? (prio === 'D1' ? plafD1 : plafD2) : 0)} · ${sec} ${e0(prio === 'D1' ? plafD2 : plafD1)}.` : ` Plafond max disponible : ${e0(plafD1)}.`}
      </p>
    </div>
  );
}

// ─── Module 04 : Plafonds PER ────────────────────────────────────────────────

function PerPlafondsModule({ p, d }) {
  const isCouple = d.isCouple;
  const plafondPerD1 = p.plafondPerD1 || 0;
  const plafondPerD2 = p.plafondPerD2 || 0;
  const rniD1 = p.rniD1 || d.retD1 || 0;
  const rniD2 = p.rniD2 || d.retD2 || 0;
  const peroD1 = p.peroD1 || 0;
  const peroD2 = p.peroD2 || 0;

  const brut10D1 = Math.round(rniD1 * 0.1);
  const brut10D2 = Math.round(rniD2 * 0.1);
  // Plafond brut : plancher et plafond absolu (INC-04 display fix)
  const plafondBrutD1 = Math.min(Math.max(brut10D1, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  const plafondBrutD2 = Math.min(Math.max(brut10D2, MIN_PLAFOND_PER), MAX_PLAFOND_PER);

  // INC-03 : reports N-1/N-2/N-3 pro-ratés par RNI
  const { plafondD1: effectivePlafD1, plafondD2: effectivePlafD2 } = getEffectivePlafondsWithReports(p);
  const reportD1 = effectivePlafD1 - plafondPerD1;
  const reportD2 = effectivePlafD2 - plafondPerD2;
  const hasReports = (reportD1 + reportD2) > 0;

  const irAvant = d.irNetFoyer;
  // totalVersionable inclut les reports (INC-03)
  const totalVersionable = effectivePlafD1 + (isCouple ? effectivePlafD2 : 0);
  const irApres = calcIR(
    Math.max(0, d.rniFoyer - totalVersionable),
    p.parts || (isCouple ? 2 : 1),
    isCouple
  );
  const economie = Math.max(0, irAvant - irApres);
  const effort = totalVersionable - economie;
  const rendement = Math.round((economie / Math.max(1, totalVersionable)) * 100);

  return (
    <SectionBox title="Plafonds PER disponibles — calcul déclarant par déclarant" num="04b">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Élément</Th>
            <Th right>D1</Th>
            {isCouple && <Th right>D2</Th>}
            <Th>Case</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>RNI 2025 (post-abattement 10 %)</Td>
            <Td right>{e0(rniD1)}</Td>
            {isCouple && <Td right>{e0(rniD2)}</Td>}
            <Td muted>—</Td>
          </tr>
          <tr>
            <Td>10 % × RNI</Td>
            <Td right>{e0(brut10D1)}</Td>
            {isCouple && <Td right>{e0(brut10D2)}</Td>}
            <Td muted>—</Td>
          </tr>
          <tr>
            <Td>Minimum légal (10 % PASS — {e0(MIN_PLAFOND_PER)})</Td>
            <Td right>{e0(MIN_PLAFOND_PER)}</Td>
            {isCouple && <Td right>{e0(MIN_PLAFOND_PER)}</Td>}
            <Td muted>—</Td>
          </tr>
          <tr className="bg-gray-50/60">
            <Td bold>Plafond brut retenu (max des deux)</Td>
            <Td right bold>{e0(plafondBrutD1)}</Td>
            {isCouple && <Td right bold>{e0(plafondBrutD2)}</Td>}
            <Td muted>—</Td>
          </tr>
          {(peroD1 > 0 || peroD2 > 0) && (
            <tr>
              <Td>− PERO employeur (cotisations déjà déduites)</Td>
              <Td right minus>{peroD1 > 0 ? `− ${e0(peroD1)}` : '—'}</Td>
              {isCouple && <Td right minus>{peroD2 > 0 ? `− ${e0(peroD2)}` : '—'}</Td>}
              <Td muted>6QS</Td>
            </tr>
          )}
          <tr className="bg-teal-50/40">
            <Td bold>= Plafond net de réductions (hors reports)</Td>
            <Td right bold plus>{e0(plafondPerD1)}</Td>
            {isCouple && <Td right bold plus>{e0(plafondPerD2)}</Td>}
            <Td muted>{isCouple ? '6NS / 6NT' : '6NS'}</Td>
          </tr>
          {hasReports && (
            <tr>
              <Td>+ Reports plafonds N-1/N-2/N-3 (art. 163 quatervicies III)</Td>
              <Td right plus>{reportD1 > 0 ? `+ ${e0(reportD1)}` : '—'}</Td>
              {isCouple && <Td right plus>{reportD2 > 0 ? `+ ${e0(reportD2)}` : '—'}</Td>}
              <Td muted>—</Td>
            </tr>
          )}
          {hasReports && (
            <tr className="bg-teal-100/60">
              <Td bold>= Plafond total disponible (avec reports)</Td>
              <Td right bold plus>{e0(effectivePlafD1)}</Td>
              {isCouple && <Td right bold plus>{e0(effectivePlafD2)}</Td>}
              <Td muted>—</Td>
            </tr>
          )}
          {totalVersionable > 0 && <>
            <tr>
              <td colSpan={isCouple ? 4 : 3} className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                Simulation économie IR (si plafond total utilisé)
              </td>
            </tr>
            <tr>
              <Td>Économie IR réelle (barème progressif)</Td>
              <Td right colSpan={isCouple ? 2 : 1}>
                <span className="rp-gain text-teal-700 font-bold">{e0(economie)}</span>
              </Td>
              <Td muted>—</Td>
            </tr>
            <tr>
              <Td>Rendement immédiat</Td>
              <Td right colSpan={isCouple ? 2 : 1}>{rendement} %</Td>
              <Td muted>—</Td>
            </tr>
            <tr>
              <Td>Effort net réel (versé − économie)</Td>
              <Td right colSpan={isCouple ? 2 : 1}>{e0(effort)}</Td>
              <Td muted>—</Td>
            </tr>
          </>}
        </tbody>
      </Tbl>
      <div className="mx-4 my-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs text-blue-800">
        Versement avant le 31/12 — case 6NS (D1){isCouple ? ' et 6NT (D2)' : ''}. Déductible du RNI 2025 (art. 163 quatervicies CGI).
      </div>
    </SectionBox>
  );
}

// ─── Module 05 : Cases déclaratives formulaire 2042 ──────────────────────────

function CasesModule({ p, d }) {
  const isCouple = d.isCouple;
  const cases = [];
  // INC-03 : cases 6NS/6NT affichent le plafond total avec reports
  const { plafondD1: _casesPlafD1, plafondD2: _casesPlafD2 } = getEffectivePlafondsWithReports(p);

  if ((p.salaireNetImposableD1 || 0) > 0) {
    cases.push({ code: '1AJ', desc: 'Salaires nets D1', montant: e0(p.salaireNetImposableD1) });
  }
  if (isCouple && (p.salaireNetImposableD2 || 0) > 0) {
    cases.push({ code: '1BJ', desc: 'Salaires nets D2', montant: e0(p.salaireNetImposableD2) });
  }
  if ((p.revensFonciers || 0) > 0 && d.isMicro) {
    cases.push({ code: '4BE', desc: 'Revenus fonciers bruts (micro-foncier)', montant: e0(p.revensFonciers) });
  }
  if ((p.revensFonciers || 0) > 0 && !d.isMicro) {
    cases.push({ code: '4BA', desc: 'Revenus fonciers réels (2044)', montant: e0(p.revensFonciers) });
  }
  if ((p.peroD1 || 0) > 0) {
    cases.push({ code: '6QS', desc: 'PERO employeur D1 (pré-rempli)', montant: e0(p.peroD1) });
  }
  if (_casesPlafD1 > 0) {
    cases.push({ code: '6NS', desc: 'Versements PER volontaires D1 (plafond max)', montant: e0(_casesPlafD1), italic: true });
  }
  if (isCouple && _casesPlafD2 > 0) {
    cases.push({ code: '6NT', desc: 'Versements PER volontaires D2 (plafond max)', montant: e0(_casesPlafD2), italic: true });
  }
  if ((p.dividendes || 0) > 0) {
    cases.push({ code: '2DC', desc: 'Dividendes (PFU 30 %)', montant: e0(p.dividendes) });
  }
  if (p.hasCrypto) {
    cases.push({ code: '3AN', desc: 'Cessions crypto — formulaire 2086 requis', montant: '⚠ à calculer' });
  }
  if (p.hasCompteEtranger) {
    cases.push({ code: '3916', desc: 'Comptes étrangers — à déclarer même à solde zéro', montant: '⚠ obligatoire' });
  }

  if (cases.length === 0) return null;

  return (
    <SectionBox title="Cases déclaratives — formulaire 2042" num="08a">
      <Tbl>
        <thead>
          <tr>
            <Th>Case</Th>
            <Th wide>Description</Th>
            <Th right>Montant</Th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c, i) => (
            <tr key={i}>
              <Td bold><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{c.code}</code></Td>
              <Td className={c.italic ? 'italic' : ''}>{c.desc}</Td>
              <Td right>{c.montant}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
      <p className="px-4 py-2.5 text-xs text-gray-500 italic border-t border-gray-50">
        Les cases en italique sont des <strong>opportunités de versement</strong> à effectuer avant le 31/12 — pas des montants déjà versés.
      </p>
    </SectionBox>
  );
}

// ─── Module 06 : Vigilances & obligations ────────────────────────────────────

function VigilancesModule({ p, d }) {
  const isCouple = d.isCouple;
  // INC-03 : reports inclus dans totalVersionable
  const { plafondD1: _vigPlafD1, plafondD2: _vigPlafD2 } = getEffectivePlafondsWithReports(p);
  const totalVersionable = _vigPlafD1 + (isCouple ? _vigPlafD2 : 0);
  const irApres = calcIR(
    Math.max(0, d.rniFoyer - totalVersionable),
    p.parts || (isCouple ? 2 : 1),
    isCouple
  );
  const economie = Math.max(0, d.irNetFoyer - irApres);

  const peaD1 = p.peaD1 || 0;
  const peaD2 = p.peaD2 || 0;

  const alerts = [];

  if (p.hasCrypto) {
    alerts.push({
      level: 'red',
      icon: '🔴',
      title: 'CRITIQUE — Actifs crypto sur exchanges étrangers',
      msg: 'Exchanges crypto étrangers (Binance, Kraken, Coinbase…) → formulaire 3916 bis obligatoire pour chaque compte. Amende : 1 500 € par compte non déclaré (10 000 € si pays non coopératif). Chaque cession 2025 doit être reportée via le formulaire 2086.',
    });
  }
  if (p.hasCompteEtranger) {
    alerts.push({
      level: 'red',
      icon: '🔴',
      title: 'CRITIQUE — Compte bancaire étranger',
      msg: 'Tout compte bancaire à l\'étranger doit être déclaré via le formulaire 3916, même à solde zéro ou clôturé en cours d\'année. Amende : 1 500 € par compte (10 000 € si pays non coopératif). Source : art. 1649 A CGI.',
    });
  }
  if (p.hasTestamentManquant) {
    alerts.push({
      level: 'amber',
      icon: '🟠',
      title: 'ATTENTION — PACS sans testament',
      msg: 'En PACS sans testament, le partenaire n\'hérite pas automatiquement. Le décès d\'un partenaire entraîne la dévolution aux héritiers légaux (parents, frères/sœurs), non au partenaire. Conséquence : perte du logement commun possible. Solution : testament ou clause bénéficiaire AV.',
    });
  }
  if (totalVersionable > 0 && d.tmi >= 30) {
    alerts.push({
      level: 'teal',
      icon: '🟢',
      title: 'OPTIMISATION — Levier PER disponible',
      msg: `Plafond PER total : ${e0(totalVersionable)}. Économie IR simulée sur le barème réel : ${e0(economie)} (rendement immédiat ${Math.round((economie / Math.max(1, totalVersionable)) * 100)} %). À verser avant le 31/12.`,
    });
  }
  if (peaD1 === 0 && peaD2 === 0) {
    alerts.push({
      level: 'teal',
      icon: '🟢',
      title: 'OPTIMISATION — PEA non ouvert',
      msg: 'Aucun PEA ouvert — l\'horloge fiscale des 5 ans n\'a pas démarré. Ouvrir avec 1 € suffit à déclencher l\'antériorité. Après 5 ans : plus-values exonérées d\'IR (hors prélèvements sociaux 17,2 %). Plafond : 150 000 € par personne.',
    });
  }
  if (p.hasPelAncien) {
    alerts.push({
      level: 'yellow',
      icon: '🟡',
      title: 'À CONFIRMER — PEL ancien (avant 2018)',
      msg: 'PEL ouvert avant 2018 : intérêts exonérés d\'IR pendant les 12 premières années. Vérifier la date d\'ouverture exacte — si le PEL a plus de 12 ans, les intérêts sont imposables au barème ou sur option au PFU.',
    });
  }

  const clsMap = {
    red:    'rp-alert-red border-l-4 border-red-400 bg-red-50',
    amber:  'rp-alert-amber border-l-4 border-amber-400 bg-amber-50',
    teal:   'border-l-4 border-teal-400 bg-teal-50',
    yellow: 'rp-alert-amber border-l-4 border-yellow-400 bg-yellow-50',
  };
  const titleClsMap = { red: 'text-red-800', amber: 'text-amber-800', teal: 'text-teal-800', yellow: 'text-yellow-800' };
  const msgClsMap   = { red: 'text-red-700', amber: 'text-amber-700', teal: 'text-teal-700', yellow: 'text-yellow-700' };

  return (
    <SectionBox title="Vigilances & obligations" num="08b">
      <div className="p-4 flex flex-col gap-3">
        {alerts.length === 0 ? (
          <div className="border-l-4 border-teal-400 bg-teal-50 px-4 py-3 rounded-r-lg">
            <p className="text-sm font-semibold text-teal-800">Aucune alerte critique détectée.</p>
          </div>
        ) : alerts.map((a, i) => (
          <div key={i} className={`${clsMap[a.level]} px-4 py-3 rounded-r-lg`}>
            <p className={`text-xs font-bold mb-1 ${titleClsMap[a.level]}`}>{a.icon} {a.title}</p>
            <p className={`text-xs leading-relaxed ${msgClsMap[a.level]}`}>{a.msg}</p>
          </div>
        ))}
      </div>
    </SectionBox>
  );
}

// ─── Module 07 : PEA & Assurance-vie ─────────────────────────────────────────

function PeaAvModule({ p }) {
  const isCouple = p.mode === 'couple';
  const peaD1 = p.peaD1 || 0;
  const peaD2 = p.peaD2 || 0;
  const avD1 = p.avD1 || 0;
  const avD2 = p.avD2 || 0;
  const hasPea = peaD1 > 0 || peaD2 > 0;
  const hasAv  = avD1 > 0 || avD2 > 0;

  return (
    <SectionBox title="PEA & Assurance-vie" num="05b">
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Plan d'épargne en actions (PEA)</p>
          {hasPea ? (
            <>
              <p className="text-sm font-semibold text-teal-700 mb-2">PEA ouvert ✓</p>
              {peaD1 > 0 && <p className="text-xs text-gray-600">D1 : <span className="font-semibold tabular-nums">{e0(peaD1)}</span> — plafond restant : {e0(150000 - peaD1)}</p>}
              {isCouple && peaD2 > 0 && <p className="text-xs text-gray-600 mt-1">D2 : <span className="font-semibold tabular-nums">{e0(peaD2)}</span> — plafond restant : {e0(150000 - peaD2)}</p>}
              <p className="text-xs text-teal-600 mt-2 leading-snug">Exonéré IR sur plus-values après 5 ans (art. 150-0 A CGI).</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-600 mb-2">PEA non ouvert ⚠</p>
              <p className="text-xs text-gray-600 mb-1"><strong>Action immédiate :</strong> ouvrir avec 1 € pour démarrer l'horloge fiscale 5 ans.</p>
              <p className="text-xs text-gray-500">Plafond disponible : 150 000 € {isCouple ? '× 2 (un PEA par personne)' : ''}</p>
            </>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Assurance-vie</p>
          {hasAv ? (
            <>
              <p className="text-sm font-semibold text-teal-700 mb-2">Assurance-vie ouverte ✓</p>
              {avD1 > 0 && <p className="text-xs text-gray-600">D1 : <span className="font-semibold tabular-nums">{e0(avD1)}</span></p>}
              {isCouple && avD2 > 0 && <p className="text-xs text-gray-600 mt-1">D2 : <span className="font-semibold tabular-nums">{e0(avD2)}</span></p>}
              <p className="text-xs text-teal-600 mt-2 leading-snug">Abattement {isCouple ? '4 600 € / 4 600 €' : '4 600 €'}/an sur gains après 8 ans.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-600 mb-2">Assurance-vie non ouverte ⚠</p>
              <p className="text-xs text-gray-600"><strong>Action :</strong> ouvrir sans versement pour déclencher l'antériorité fiscale 8 ans.</p>
              <p className="text-xs text-gray-500 mt-1">Transmission hors succession jusqu'à 152 500 € par bénéficiaire (art. 990 I CGI).</p>
            </>
          )}
        </div>
      </div>
    </SectionBox>
  );
}

// ─── Module : Réallocation patrimoniale (plan étape par étape) ───────────────

/**
 * Construit un plan de réallocation pour un déclarant donné.
 * Hypothèses de rendement (à expliquer dans l'UI) :
 *  - Livret bancaire / Livret+ : ~1,5 % net
 *  - LDDS : 3 % net (= Livret A, exo IR + PS)
 *  - LEP : ~5 % net (éligibilité RFR)
 *  - AV multisupport : ~4 % net LT espéré
 *  - PEA (ETF Monde) : ~6 % net LT espéré, exo IR > 5 ans
 */
function _buildReallocationPlan(p, sfx) {
  const livretA    = p[`livretA${sfx}`]    || 0;
  const ldds       = p[`ldds${sfx}`]       || 0;
  const lep        = p[`lep${sfx}`]        || 0;
  const livretPlus = p[`livretPlus${sfx}`] || 0;
  const pea        = p[`pea${sfx}`]        || 0;
  const av         = p[`av${sfx}`]         || 0;

  const livretTotal = livretA + ldds + lep + livretPlus;
  if (livretTotal < 5_000) return null;

  const isCouple    = p.mode === 'couple';
  const rfr         = p.rfr || 0;
  const plafondLEPRfr = isCouple ? 34_393 : 22_419;
  const eligibleLEP = rfr > 0 && rfr <= plafondLEPRfr;

  const PLAFOND_LDDS = 12_000;
  const PLAFOND_LEP  = 10_000;
  // Coussin de précaution : 3-6 mois de charges. Sans info détaillée, 12 k€/déclarant.
  const liquidityFloor = 12_000;
  const excess = Math.max(0, livretTotal - liquidityFloor);
  if (excess < 3_000) return null;

  const steps = [];
  let remaining = excess;

  // 1. LDDS (taux 3 % vs Livret+ ~1,5 %)
  const lddsRoom = Math.max(0, PLAFOND_LDDS - ldds);
  if (lddsRoom > 0 && remaining > 1_000) {
    const move = Math.min(lddsRoom, remaining);
    steps.push({
      label: ldds > 0 ? 'Compléter LDDS jusqu\'au plafond' : 'Ouvrir et saturer LDDS',
      montant: move,
      gainAnnuel: Math.round(move * 0.015),
      detail: `Plafond ${e0(PLAFOND_LDDS)} · taux 3 % · exonéré IR + PS · disponibilité immédiate`,
    });
    remaining -= move;
  }

  // 2. LEP si éligible
  if (eligibleLEP) {
    const lepRoom = Math.max(0, PLAFOND_LEP - lep);
    if (lepRoom > 0 && remaining > 1_000) {
      const move = Math.min(lepRoom, remaining);
      steps.push({
        label: lep > 0 ? 'Compléter LEP jusqu\'au plafond' : 'Ouvrir et saturer LEP',
        montant: move,
        gainAnnuel: Math.round(move * 0.035),
        detail: `Plafond ${e0(PLAFOND_LEP)} · taux ~5 % · exonéré IR + PS · meilleur taux garanti de France`,
      });
      remaining -= move;
    }
  }

  // 3. AV multisupport (~30 k€)
  if (remaining > 5_000) {
    const move = Math.min(remaining, 30_000);
    steps.push({
      label: av > 0 ? 'Renforcer AV multisupport' : 'Ouvrir AV multisupport (lump sum)',
      montant: move,
      gainAnnuel: Math.round(move * 0.028),
      detail: 'Rendement LT ~4 % net espéré · abattement 4 600 €/an sur gains après 8 ans · transmission 152 500 €/bénéficiaire hors succession',
    });
    remaining -= move;
  }

  // 4. PEA (~20 k€)
  if (remaining > 5_000) {
    const move = Math.min(remaining, 20_000);
    steps.push({
      label: pea > 0 ? 'Renforcer PEA' : 'Ouvrir PEA (lump sum 20 k€ ou DCA 18-24 mois)',
      montant: move,
      gainAnnuel: Math.round(move * 0.045),
      detail: 'Rendement LT ~6 % espéré (ETF Monde) · exonéré IR après 5 ans (PS 17,2 % seulement) · plafond 150 000 €',
    });
    remaining -= move;
  }

  // 5. Surplus
  if (remaining > 5_000) {
    steps.push({
      label: 'Surplus → AV / PEA selon profil de risque',
      montant: remaining,
      gainAnnuel: Math.round(remaining * 0.03),
      detail: 'Arbitrage final selon horizon et tolérance — privilégier AV pour la souplesse, PEA pour la croissance LT',
    });
    remaining = 0;
  }

  const totalRealloue = steps.reduce((s, x) => s + x.montant, 0);
  const totalGain     = steps.reduce((s, x) => s + x.gainAnnuel, 0);

  return {
    declarant:     sfx,
    livretTotal,
    excess,
    liquidityFloor,
    eligibleLEP,
    livretPlusD:   livretPlus,
    steps,
    totalRealloue,
    totalGain,
  };
}

function ReallocationPlanTable({ plan, label }) {
  return (
    <>
      <div className="px-5 py-3 text-xs text-gray-600 bg-gray-50/40 border-b border-gray-100">
        <strong className="text-gray-800">{label}</strong> — Épargne liquide totale :{' '}
        <strong>{e0(plan.livretTotal)}</strong>{plan.livretPlusD > 0 && ` (dont ${e0(plan.livretPlusD)} sur Livret+/bancaire à ~1,5 %)`}.{' '}
        Coussin de précaution conservé : ~{e0(plan.liquidityFloor)} (3-6 mois de charges). À réallouer :{' '}
        <strong>{e0(plan.excess)}</strong>.{!plan.eligibleLEP && plan.livretTotal > 20_000 && ' (Non éligible LEP : RFR au-dessus du seuil.)'}
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th>Action</Th>
            <Th right>Montant</Th>
            <Th right>Gain annuel espéré</Th>
            <Th wide>Avantage / modalités</Th>
          </tr>
        </thead>
        <tbody>
          {plan.steps.map((s, i) => (
            <tr key={i}>
              <Td bold>{s.label}</Td>
              <Td right>{e0(s.montant)}</Td>
              <Td right plus>+ {e0(s.gainAnnuel)} €/an</Td>
              <Td muted>{s.detail}</Td>
            </tr>
          ))}
          <tr className="bg-teal-50/50 border-t-2 border-teal-200">
            <td className="px-4 py-3 text-sm font-bold text-teal-800">Total réalloué</td>
            <td className="px-4 py-3 text-sm font-bold text-teal-800 text-right tabular-nums">{e0(plan.totalRealloue)}</td>
            <td className="px-4 py-3 text-sm font-bold text-teal-700 text-right tabular-nums">+ {e0(plan.totalGain)} €/an</td>
            <td className="px-4 py-3 text-xs text-teal-600">Estimation indicative — à valider selon tolérance au risque</td>
          </tr>
        </tbody>
      </Tbl>
    </>
  );
}

function ReallocationModule({ p }) {
  const isCouple = p.mode === 'couple';
  const planD1 = _buildReallocationPlan(p, 'D1');
  const planD2 = isCouple ? _buildReallocationPlan(p, 'D2') : null;
  if (!planD1 && !planD2) return null;

  return (
    <SectionBox title="Plan de réallocation patrimoniale — épargne liquide → enveloppes optimisées" num="05c">
      <ProseCard color="gray">
        Les livrets bancaires non réglementés (Livret+, Livret bancaire) servent un taux net proche de
        <strong> 1-1,5 %</strong>. Saturer d'abord les enveloppes <strong>défiscalisées</strong> (LDDS, LEP)
        puis basculer vers <strong>AV après 8 ans</strong> et <strong>PEA après 5 ans</strong> améliore le
        rendement net annuel de 2 à 4 points sans risque déraisonnable. On conserve toujours un coussin de
        précaution équivalent à <strong>3-6 mois de charges</strong> sur les livrets disponibles immédiatement.
      </ProseCard>

      {planD1 && (
        <ReallocationPlanTable plan={planD1} label={isCouple ? 'Déclarant 1' : 'Plan de réallocation'} />
      )}
      {planD2 && (
        <ReallocationPlanTable plan={planD2} label="Déclarant 2" />
      )}
    </SectionBox>
  );
}

// ─── Module : PEL — modalités fiscales & décision à prendre ──────────────────

function _pelRegime(pelDate) {
  if (!pelDate) return null;
  let year, month;
  if (/^\d{2}\/\d{4}$/.test(pelDate)) {
    [month, year] = pelDate.split('/').map(Number);
  } else if (/^\d{4}$/.test(pelDate)) {
    year = Number(pelDate); month = 1;
  } else {
    return null;
  }
  const now = new Date().getFullYear();
  // Pré-mars 2011 : exo IR à vie. 2011-2017 : exo IR 12 ans. 2018+ : PFU dès origine.
  if (year < 2011 || (year === 2011 && month < 3)) {
    return { regime: 'pre-2011', label: 'Ouvert avant mars 2011 — exonération IR à vie',
             irExo: true, irExoEnd: null, now };
  }
  if (year <= 2017) {
    const exoEnd = year + 12;
    return { regime: '2011-2017', label: `Ouvert ${pelDate} — exo IR pendant 12 ans (échéance ${exoEnd})`,
             irExo: now < exoEnd, irExoEnd: exoEnd, now };
  }
  return { regime: '2018+', label: 'Ouvert à partir de 2018 — PFU 30 % dès la 1re année',
           irExo: false, irExoEnd: null, now };
}

function _pelDecision(regime) {
  if (!regime) return null;
  if (regime.regime === 'pre-2011') {
    return {
      title: 'À conserver — fiscalité optimale',
      body: 'PEL pré-mars 2011 = exonération IR à vie. Seuls les PS 17,2 % sont dus à la source. Aucune raison fiscale de fermer — c\'est l\'une des meilleures enveloppes garanties du marché.',
      tone: 'teal',
    };
  }
  if (regime.regime === '2011-2017' && regime.irExo) {
    return {
      title: `Décision à prendre fin ${regime.irExoEnd - 1} (avant l'échéance des 12 ans)`,
      body: `Le PEL reste exonéré d'IR jusqu'en ${regime.irExoEnd}. Au-delà, les intérêts annuels deviendront imposables au PFU 30 % par défaut — le rendement net (taux contractuel × 0,7) tombera sous celui d'une AV multisupport bien gérée. Deux options à arbitrer en ${regime.irExoEnd - 1} : (a) conserver pour un matelas stable garanti, (b) basculer vers AV (meilleur rendement LT, fiscalité plus douce après 8 ans) ou PEA.`,
      tone: 'amber',
    };
  }
  if (regime.regime === '2011-2017' && !regime.irExo) {
    const since = regime.now - regime.irExoEnd;
    return {
      title: `⚠️ Période d'exo IR échue depuis ${since} an${since > 1 ? 's' : ''} — fiscalité dégradée`,
      body: 'Les intérêts sont désormais imposés au PFU 30 %. Le rendement net (~1,75 % pour un PEL 2,5 %) est inférieur à celui d\'une AV multisupport ou d\'un PEA. À réallouer en priorité dans le cadre du plan de réallocation ci-dessus.',
      tone: 'red',
    };
  }
  return {
    title: 'PFU 30 % dès l\'origine — rentabilité fiscale limitée',
    body: 'PEL ouvert à partir de 2018 : intérêts imposés au PFU 30 % dès la 1re année (taux net ~1,75 % pour un taux contractuel 2,5 %). Si le PEL est ouvert pour un projet immobilier, le conserver donne droit au prêt PEL à taux figé. Sinon, réallouer vers AV ou PEA.',
    tone: 'amber',
  };
}

function PelDetailBlock({ p, sfx, label }) {
  const solde    = p[`pel${sfx}`] || 0;
  const date     = p[`pelDate${sfx}`] || null;
  const interets = p[`pelInterets${sfx}`] || 0;
  const regime   = _pelRegime(date);
  const decision = _pelDecision(regime);
  if (!regime || !decision) return null;

  const toneCls = {
    teal:  'bg-teal-50/60  border-teal-200  text-teal-900',
    amber: 'bg-amber-50/50 border-amber-200 text-amber-900',
    red:   'bg-red-50/50   border-red-200   text-red-900',
  }[decision.tone] || 'bg-gray-50 border-gray-200 text-gray-900';

  return (
    <>
      <div className="px-5 py-2.5 bg-gray-50/40 border-b border-gray-100">
        <p className="text-xs font-bold text-gray-700">{label} — {e0(solde)}</p>
      </div>
      <Tbl>
        <tbody>
          <tr><Td>Solde au 31/12/2025</Td><Td right bold>{e0(solde)}</Td></tr>
          <tr><Td>Date d&apos;ouverture</Td><Td right>{date || '—'}</Td></tr>
          <tr><Td>Régime fiscal IR</Td><Td right>{regime.label}</Td></tr>
          <tr><Td>Prélèvements sociaux</Td><Td right>17,2 % à la source par la banque</Td></tr>
          {interets > 0 && <tr><Td>Intérêts 2025</Td><Td right>{e0(interets)}</Td></tr>}
        </tbody>
      </Tbl>
      <div className={`px-5 py-3 border-t ${toneCls}`}>
        <p className="text-xs font-bold mb-1">{decision.title}</p>
        <p className="text-xs leading-relaxed opacity-90">{decision.body}</p>
      </div>
    </>
  );
}

function PelModule({ p }) {
  const isCouple = p.mode === 'couple';
  const pelD1 = p.pelD1 || 0;
  const pelD2 = p.pelD2 || 0;
  if (!pelD1 && !pelD2) return null;

  return (
    <SectionBox title="PEL — modalités fiscales & décision à prendre" num="05d">
      <ProseCard color="gray">
        Le régime fiscal d&apos;un PEL dépend de sa <strong>date d&apos;ouverture</strong> (et non de son ancienneté).
        Trois cas : <strong>avant mars 2011</strong> (exo IR à vie, PS 17,2 % uniquement),{' '}
        <strong>mars 2011 → 2017</strong> (exo IR pendant 12 ans, puis PFU 30 % par défaut),{' '}
        <strong>2018+</strong> (PFU 30 % dès la 1re année). Le taux contractuel est <strong>figé à l&apos;ouverture</strong>
        (~2,5 % pour un PEL 2015). Les PS 17,2 % sont prélevés à la source chaque année par la banque.
      </ProseCard>
      {pelD1 > 0 && <PelDetailBlock p={p} sfx="D1" label={isCouple ? 'PEL D1' : 'PEL'} />}
      {pelD2 > 0 && <PelDetailBlock p={p} sfx="D2" label="PEL D2" />}
    </SectionBox>
  );
}

// ─── Module PA-A : Allocation d'actifs ───────────────────────────────────────

const PIE_COLORS_ALLOC = [
  '#0d9488', // PEA
  '#0ea5e9', // CTO
  '#14b8a6', // Assurance-vie
  '#8b5cf6', // PER/PERCO
  '#f59e0b', // PEL
  '#94a3b8', // Livrets
  '#f97316', // Crypto
  '#3b82f6', // Immobilier
];

function diversificationScorePA(p) {
  let score = 0;
  if ((p.epargneLiquide  || 0) > 0) score += 2;
  if ((p.peaD1   || 0) + (p.peaD2   || 0) > 0) score += 2;
  if ((p.ctoD1   || 0) + (p.ctoD2   || 0) > 0) score += 1;
  if ((p.avD1    || 0) + (p.avD2    || 0) > 0) score += 2;
  if ((p.percoD1 || 0) > 0) score += 1;
  if ((p.peeD1   || 0) + (p.peeD2   || 0) > 0) score += 1;
  if ((p.patrimoineImmoNet || 0) > 0) score += 2;
  if ((p.cryptoTotal || 0) > 0) score += 1;
  return Math.min(score, 10);
}

function AllocationActifsModule({ p }) {
  const isCouple = p.mode === 'couple';
  const [view, setView] = useState('foyer');

  const livrets = (sfx) => (
    (p[`livretA${sfx}`] || 0) + (p[`ldds${sfx}`] || 0) +
    (p[`lep${sfx}`]    || 0) + (p[`livretPlus${sfx}`] || 0)
  );

  const buildData = (v) => {
    if (v === 'D1') return [
      { name: 'PEA',           value: p.peaD1    || 0 },
      { name: 'CTO',           value: p.ctoD1    || 0 },
      { name: 'Assurance-vie', value: p.avD1     || 0 },
      { name: 'PER / PERCO',  value: p.percoD1  || 0 },
      { name: 'PEL',           value: p.pelD1    || 0 },
      { name: 'PEE',           value: p.peeD1    || 0 },
      { name: 'Livrets',       value: livrets('D1') },
      { name: 'Crypto',        value: p.cryptoD1 || 0 },
    ].filter(d => d.value > 0);
    if (v === 'D2') return [
      { name: 'PEA',           value: p.peaD2    || 0 },
      { name: 'CTO',           value: p.ctoD2    || 0 },
      { name: 'Assurance-vie', value: p.avD2     || 0 },
      { name: 'PER / PERCO',  value: p.percoD2  || 0 },
      { name: 'PEL',           value: p.pelD2    || 0 },
      { name: 'PEE',           value: p.peeD2    || 0 },
      { name: 'Livrets',       value: livrets('D2') },
      { name: 'Crypto',        value: p.cryptoD2 || 0 },
    ].filter(d => d.value > 0);
    return [
      { name: 'PEA',            value: (p.peaD1   || 0) + (p.peaD2   || 0) },
      { name: 'CTO',            value: (p.ctoD1   || 0) + (p.ctoD2   || 0) },
      { name: 'Assurance-vie',  value: (p.avD1    || 0) + (p.avD2    || 0) },
      { name: 'PER / PERCO',   value: (p.percoD1 || 0) + (p.percoD2 || 0) },
      { name: 'PEL',            value: (p.pelD1   || 0) + (p.pelD2   || 0) },
      { name: 'PEE',            value: (p.peeD1   || 0) + (p.peeD2   || 0) },
      { name: 'Livrets',        value:  p.epargneLiquide     || 0 },
      { name: 'Crypto',         value:  p.cryptoTotal        || 0 },
      { name: 'Immobilier net', value:  p.patrimoineImmoNet  || 0 },
    ].filter(d => d.value > 0);
  };

  const pieData = buildData(view);
  const total   = pieData.reduce((s, d) => s + d.value, 0);
  const score   = diversificationScorePA(p);
  const scoreColor = score >= 7 ? 'text-teal-700'  : score >= 4 ? 'text-amber-600' : 'text-red-600';
  const scoreBg    = score >= 7 ? 'bg-teal-50 border-teal-200' : score >= 4 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const scoreLabel = score >= 7 ? 'Bonne diversification' : score >= 4 ? 'Diversification partielle' : 'Concentration élevée';

  const Tab = ({ v, label }) => (
    <button onClick={() => setView(v)}
      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
        view === v ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}>
      {label}
    </button>
  );

  const fouerTotal = buildData('foyer').reduce((s, d) => s + d.value, 0);

  return (
    <SectionBox title="Allocation d'actifs" num="09a" badge={fouerTotal > 0 ? e0(fouerTotal) : undefined}>
      {fouerTotal === 0 ? (
        <p className="text-xs text-gray-400 p-5">Non renseigné</p>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {isCouple && (
            <div className="flex gap-2">
              <Tab v="foyer" label="Foyer" />
              <Tab v="D1"    label="D1" />
              <Tab v="D2"    label="D2" />
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="shrink-0">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie data={pieData} cx={110} cy={110} innerRadius={65} outerRadius={100}
                    dataKey="value" nameKey="name" paddingAngle={2}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS_ALLOC[i % PIE_COLORS_ALLOC.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => e0(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 flex flex-col gap-4">
              {total === 0 ? (
                <p className="text-xs text-gray-400">Aucune donnée pour ce déclarant</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {pieData.map((entry, i) => {
                    const share = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm shrink-0 inline-block"
                            style={{ backgroundColor: PIE_COLORS_ALLOC[i % PIE_COLORS_ALLOC.length] }} />
                          <span className="text-gray-700">{entry.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400">{share} %</span>
                          <span className="font-semibold text-gray-800 tabular-nums w-24 text-right">{e0(entry.value)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {view === 'foyer' && (
                <div className={`rounded-xl border p-3 ${scoreBg}`}>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Score de diversification</p>
                  <p className={`text-2xl font-bold tabular-nums ${scoreColor}`}>
                    {score}<span className="text-sm font-normal opacity-60"> / 10</span>
                  </p>
                  <p className={`text-xs font-medium mt-0.5 ${scoreColor}`}>{scoreLabel}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </SectionBox>
  );
}

// ─── Module PA-B : Diagnostic fiscal ─────────────────────────────────────────

function DiagnosticFiscalModule({ p, d }) {
  const tmiActuel   = d.tmi || 0;
  const tmiRetraite = Math.min(
    p.tmiRetraiteD1 ?? tmiActuel,
    p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? tmiActuel),
  );
  const tauxEffectif = d.rniFoyer > 0 ? (d.irNetFoyer / d.rniFoyer) * 100 : null;

  const fParts   = p.parts || (d.isCouple ? 2 : 1);
  const stopRate = tmiRetraite / 100;
  // INC-03 : reports inclus
  const { plafondD1: _diagPlafD1, plafondD2: _diagPlafD2 } = getEffectivePlafondsWithReports(p);
  const opt = computePerOptimumCascade(
    d.rniFoyer, fParts,
    _diagPlafD1, _diagPlafD2,
    d.isCouple, p.rniD1 || 0, p.rniD2 || 0,
    stopRate,
  );

  const hasDividendes = (p.dividendes || 0) > 0;
  const tmiRate  = tmiActuel / 100;
  const pfuTax   = hasDividendes ? Math.round(p.dividendes * 0.30) : 0;
  const baremeTax = hasDividendes ? Math.round(
    p.dividendes * 0.60 * tmiRate
    - p.dividendes * 0.068 * tmiRate
    + p.dividendes * 0.172,
  ) : 0;
  const pfuWins  = pfuTax <= baremeTax;

  const tmiDelta = tmiRetraite - tmiActuel;

  return (
    <SectionBox title="Diagnostic fiscal" num="09b">
      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="TMI actuel"
            value={`${tmiActuel} %`}
            color={tmiActuel >= 41 ? 'amber' : tmiActuel >= 30 ? 'violet' : 'teal'}
          />
          <KpiCard
            label="TMI estimé retraite"
            value={`${tmiRetraite} %`}
            sub={tmiDelta < 0 ? `↓ ${-tmiDelta} pts` : tmiDelta === 0 ? 'Stable' : `↑ ${tmiDelta} pts`}
            color="gray"
          />
          <KpiCard
            label="Taux effectif"
            value={tauxEffectif != null ? `${tauxEffectif.toFixed(1)} %` : 'Non renseigné'}
            sub={tauxEffectif != null ? 'IR net / RNI' : undefined}
            color="gray"
          />
          <KpiCard
            label="Marge PER disponible"
            value={opt.optimumTotal > 0 ? e0(opt.optimumTotal) : 'Optimisé'}
            sub={opt.optimumTotal > 0 ? `Écon. ${e0(opt.economieOptimum)}` : undefined}
            color={opt.optimumTotal > 0 ? 'teal' : 'gray'}
          />
        </div>
        {hasDividendes && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">
              PFU vs barème — dividendes {e0(p.dividendes)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg border p-3 ${pfuWins ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-white'}`}>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Flat Tax 30 %</p>
                <p className="text-base font-bold text-gray-800 tabular-nums">{e0(pfuTax)}</p>
                {pfuWins && <p className="text-xs text-teal-600 font-semibold mt-0.5">Option recommandée</p>}
              </div>
              <div className={`rounded-lg border p-3 ${!pfuWins ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-white'}`}>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Option barème ({tmiActuel} %)</p>
                <p className="text-base font-bold text-gray-800 tabular-nums">{e0(baremeTax)}</p>
                {!pfuWins && <p className="text-xs text-teal-600 font-semibold mt-0.5">Option recommandée</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionBox>
  );
}

// ─── Module 09 : Feuille de route ────────────────────────────────────────────

function FeuilleRouteModule({ p, d }) {
  const isCouple = d.isCouple;
  const peaD1 = p.peaD1 || 0;
  const peaD2 = p.peaD2 || 0;
  const epargneLiquide = p.epargneLiquide || 0;

  // ── Cycle de vie : pilote la personnalisation des conseils par phase ──
  // Source de vérité unique : deriveRoadmapContext(parsedProfile). Aucun parsing d'âge ici.
  const {
    lifeStage: ls, enConstitution, enRetraite,
    transmissionPertinente, securisationRequise, peaHorlogeUtile, horizon,
  } = deriveRoadmapContext(p);

  const currentYear = new Date().getFullYear();
  const fParts = p.parts || (isCouple ? 2 : 1);
  const tmiRetraite = Math.min(p.tmiRetraiteD1 ?? 11, p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? 11));
  const stopRate = tmiRetraite / 100;
  // INC-03 : reports inclus
  const { plafondD1: _frPlafD1, plafondD2: _frPlafD2 } = getEffectivePlafondsWithReports(p);
  const opt = computePerOptimumCascade(d.rniFoyer, fParts, _frPlafD1, _frPlafD2, isCouple, p.rniD1 || 0, p.rniD2 || 0, stopRate);

  // ── Court terme (< 1 an) ──
  const ct = [];

  if (opt.optimumTotal > 0 && opt.tmiDepart > 11) {
    ct.push({
      title: `Versement PER avant 31/12/${currentYear}`,
      levier: `Efface la tranche ${opt.tmiDepart} % — économie IR réelle : ${e0(opt.economieOptimum)} (effort net : ${e0(opt.effortNet)})`,
      gain: `${e0(opt.economieOptimum)} d'économie IR`,
      deadline: `31 déc. ${currentYear}`,
      color: 'teal',
    });
  }

  if (d.solde > 500) {
    const hasPonctuel =
      (p.recurrentRente1BsD1 === false && (p.rniRenteD1 || 0) > 0) ||
      (p.recurrentRente1BsD2 === false && (p.rniRenteD2 || 0) > 0);
    if (hasPonctuel) {
      ct.push({
        title: 'PAS 2026 — aucune modification nécessaire',
        levier: 'Le complément 2025 découle d\'un revenu exceptionnel non récurrent (rente liquidée). En 2026 ce revenu disparaît : votre PAS sera automatiquement recalibré.',
        gain: `Complément 2025 : ${e0(d.solde)} — non représentatif de 2026`,
        deadline: 'Aucune action requise',
        color: 'gray',
      });
    } else {
      ct.push({
        title: 'Ajuster le taux PAS',
        levier: 'Éviter le complément à payer en septembre',
        gain: `${e0(Math.abs(d.solde))} de solde à régulariser`,
        deadline: 'Avant le 1er juillet',
        color: 'amber',
      });
    }
  }

  // Mode dégradé : âge non renseigné → conseils génériques inchangés + vigilance explicite.
  if (ls.degrade) {
    ct.push({
      title: 'Âge non renseigné',
      levier: ls.vigilance,
      gain: 'Conseil non personnalisé par cycle de vie',
      deadline: 'Compléter l\'âge',
      color: 'gray',
    });
  }

  // ── Moyen terme (1–5 ans) ──
  const mt = [];

  if (peaD1 === 0 && peaD2 === 0 && peaHorlogeUtile) {
    // En CONSTITUTION : priorité forte (« prendre date » tôt). En RETRAITE avec un
    // horizon de liquidité court, l'horloge 5 ans est peu utile → on ne le pousse pas.
    mt.push({
      title: 'Ouvrir un PEA' + (isCouple ? ' (deux pour le couple)' : ''),
      levier: enConstitution
        ? 'Priorité : ouvrir tôt pour démarrer l\'horloge fiscale 5 ans — l\'antériorité court dès l\'ouverture, même avec un versement symbolique'
        : 'Démarrer l\'horloge fiscale 5 ans — exonération IR sur plus-values après 5 ans',
      gain: enConstitution ? 'Antériorité fiscale acquise au plus tôt' : 'Exonération IR à terme',
      deadline: enConstitution ? 'En priorité' : 'Dès que possible',
      color: 'teal',
    });
  }

  if (epargneLiquide > 10000) {
    // Réallocation cohérente avec le glidepath : part actions décroissante avec l'âge.
    const cibleActions = securisationRequise
      ? 'sécuriser une large part en fonds € / supports prudents et n\'exposer aux actions qu\'une fraction réduite (glidepath)'
      : enConstitution
        ? 'viser une part actions élevée (PEA / AV UC) — l\'horizon long absorbe la volatilité'
        : 'investir le surplus en PEA ou AV UC pour améliorer le rendement net long terme';
    mt.push({
      title: 'Réallouer l\'épargne liquide dormante',
      levier: cibleActions,
      gain: `${e0(epargneLiquide)} à déployer`,
      deadline: 'Dans les 12 mois',
      color: securisationRequise ? 'amber' : 'gray',
    });
  }

  if ((p.avD1 || 0) + (p.avD2 || 0) === 0 && epargneLiquide > 5000) {
    mt.push({
      title: 'Ouvrir une assurance-vie',
      levier: 'Prendre date pour bénéficier de l\'abattement de 4 600 € / 9 200 € après 8 ans'
        + (transmissionPertinente ? ' — et préparer la transmission hors succession' : ''),
      gain: 'Abattement et souplesse de transmission',
      deadline: 'Dans les 12 mois',
      color: 'teal',
    });
  }

  // ── Long terme (> 5 ans) ──
  const lt = [];

  const revenuMensuel = p.revenuMensuelFoyer || 0;
  const tauxEpargne = p.tauxEpargneFoyer || 0;
  if (revenuMensuel > 0 && tauxEpargne > 0) {
    const depensesAnnuelles = revenuMensuel * 12 * (1 - tauxEpargne / 100);
    const capitalFire = depensesAnnuelles * 25;
    const patrimoineActuel = p.patrimoineNet || 0;
    const gap = Math.max(0, capitalFire - patrimoineActuel);
    const epargneAnnuelle = p.capaciteEpargneFoyer ? p.capaciteEpargneFoyer * 12 : revenuMensuel * 12 * (tauxEpargne / 100);
    const anneesEstimees = epargneAnnuelle > 0 ? Math.ceil(gap / epargneAnnuelle) : null;
    // Horizon réel jusqu'à la retraite (deriveLifeStage) plutôt qu'un horizon implicite.
    // S'il est connu, on confronte le rythme d'épargne à cet horizon.
    const horizonTexte = horizon != null
      ? `horizon retraite : ${horizon} an(s)`
      : 'Horizon > 5 ans';
    let leverFire = `Capital cible (règle des 25×) : ${e0(capitalFire)} — patrimoine actuel : ${e0(patrimoineActuel)}${gap > 0 ? ` — gap : ${e0(gap)}` : ' ✓ objectif atteint'}`;
    if (horizon != null && anneesEstimees != null && gap > 0) {
      leverFire += anneesEstimees <= horizon
        ? ` — atteignable avant la retraite (${horizon} an(s))`
        : ` — au-delà de la retraite estimée (${horizon} an(s)) au rythme actuel : augmenter l'effort d'épargne`;
    }
    lt.push({
      title: 'Trajectoire indépendance financière (FIRE)',
      levier: leverFire,
      gain: anneesEstimees != null && gap > 0 ? `~${anneesEstimees} ans au rythme actuel` : gap === 0 ? 'Objectif atteint' : 'Calculer l\'effort net',
      deadline: horizonTexte,
      color: 'violet',
    });
  }

  if ((p.tmiRetraiteD1 ?? null) !== null && tmiRetraite < (d.tmi || 0)) {
    lt.push({
      title: 'Alimenter le PER avant la retraite',
      levier: `Déduction à ${d.tmi} % aujourd'hui, retrait imposé à ${tmiRetraite} % — gain net par tranche ${d.tmi - tmiRetraite} pts de TMI`,
      gain: `Spread TMI : ${d.tmi - tmiRetraite} pts`,
      deadline: 'Avant départ en retraite',
      color: 'teal',
    });
  }

  // ── Conseils SPÉCIFIQUES par phase de cycle de vie ──
  // Montants/abattements issus de Paperasse (taxCalculator), jamais en dur ici.
  const patrimoineTransmissible = (p.patrimoineNet || 0);
  if (transmissionPertinente && patrimoineTransmissible > ABATTEMENT_DONATION_ENFANT) {
    lt.push({
      title: 'Amorcer la transmission',
      levier: `Donation en ligne directe : abattement de ${e0(ABATTEMENT_DONATION_ENFANT)} par parent et par enfant, renouvelable tous les ${RAPPEL_FISCAL_DONATION_ANNEES} ans (art. 779 CGI) — commencer tôt multiplie les cycles. Don familial de sommes d'argent : ${e0(ABATTEMENT_DON_FAMILIAL)} supplémentaires (art. 790 G). Étudier le démembrement (donation de la nue-propriété, art. 669 CGI) pour transmettre à moindre coût.`,
      gain: 'Droits de mutation réduits sur le long terme',
      deadline: enRetraite ? 'Transmission active dès maintenant' : 'À amorcer dès maintenant',
      color: 'violet',
    });
  }

  if (securisationRequise) {
    const avAnterioriteOk = (p.avDateD1 || p.avDateD2 || (p.avD1 || 0) + (p.avD2 || 0) > 0);
    lt.push({
      title: ls.flags.av70Proche
        ? `Optimiser l'assurance-vie AVANT ${SEUIL_AGE_AV_TRANSMISSION} ans`
        : 'Sécuriser et préparer la transmission de l\'assurance-vie',
      levier: `Verser sur l'assurance-vie tant que l'assuré a moins de ${SEUIL_AGE_AV_TRANSMISSION} ans : abattement de ${e0(ABATTEMENT_AV_AVANT_70)} par bénéficiaire (art. 990 I CGI). Après ${SEUIL_AGE_AV_TRANSMISSION} ans, l'abattement tombe à ${e0(ABATTEMENT_AV_APRES_70)} global (art. 757 B CGI). Vérifier l'antériorité des 8 ans${avAnterioriteOk ? '' : ' (ouvrir un contrat pour prendre date si ce n\'est pas fait)'} et rédiger soigneusement la clause bénéficiaire. Poursuivre le glidepath : sécuriser progressivement en fonds €.`,
      gain: ls.flags.av70Proche ? `Fenêtre 990 I avant ${SEUIL_AGE_AV_TRANSMISSION} ans` : 'Transmission optimisée + capital sécurisé',
      deadline: ls.flags.av70Proche ? `Avant le ${SEUIL_AGE_AV_TRANSMISSION}ᵉ anniversaire` : 'Avant / pendant la retraite',
      color: 'amber',
    });
  }

  const colorMap = {
    teal:   { border: 'border-teal-200',   bg: 'bg-teal-50',   dot: 'bg-teal-600',   text: 'text-teal-800',   sub: 'text-teal-600' },
    amber:  { border: 'border-amber-200',  bg: 'bg-amber-50',  dot: 'bg-amber-500',  text: 'text-amber-800',  sub: 'text-amber-600' },
    gray:   { border: 'border-gray-200',   bg: 'bg-gray-50',   dot: 'bg-gray-400',   text: 'text-gray-800',   sub: 'text-gray-500' },
    violet: { border: 'border-violet-200', bg: 'bg-violet-50', dot: 'bg-violet-500', text: 'text-violet-800', sub: 'text-violet-600' },
  };

  const Horizon = ({ label, badge, items }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</span>
          <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{badge}</span>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((pr, i) => {
            const c = colorMap[pr.color] || colorMap.gray;
            return (
              <div key={i} className={`rounded-xl border ${c.border} ${c.bg} p-4 flex gap-3 items-start`}>
                <div className={`shrink-0 mt-0.5 w-2.5 h-2.5 rounded-full ${c.dot}`} />
                <div className="flex-1">
                  <p className={`text-sm font-bold ${c.text}`}>{pr.title}</p>
                  <p className={`text-xs ${c.sub} mt-0.5 leading-relaxed`}>{pr.levier}</p>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Impact</p>
                      <p className="text-xs font-semibold text-gray-800">{pr.gain}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Échéance</p>
                      <p className="text-xs font-semibold text-gray-800">{pr.deadline}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const hasAny = ct.length + mt.length + lt.length > 0;

  return (
    <SectionBox title={`Feuille de route ${currentYear} — priorités d'action`} num="10">
      <div className="p-4 flex flex-col gap-5">
        {!hasAny ? (
          <p className="text-xs text-gray-500 py-2">Aucune priorité identifiée avec les données disponibles.</p>
        ) : (
          <>
            <Horizon label="Court terme" badge="< 1 an" items={ct} />
            <Horizon label="Moyen terme" badge="1 – 5 ans" items={mt} />
            <Horizon label="Long terme" badge="> 5 ans" items={lt} />
          </>
        )}
      </div>
    </SectionBox>
  );
}

// ─── Module 10 : Revenus fonciers détaillés ───────────────────────────────────

function FoncierModule({ d }) {
  const { foncierBrut, foncierAbt, foncierNet, isMicro, psFoncier } = d;
  const total = foncierNet + psFoncier;

  return (
    <SectionBox title="Revenus fonciers — détail" num="09c">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Élément</Th>
            <Th right>Montant</Th>
          </tr>
        </thead>
        <tbody>
          <tr><Td>Revenus fonciers bruts (case 4BE)</Td><Td right>{e0(foncierBrut)}</Td></tr>
          {isMicro && <tr><Td className="pl-8">− Abattement 30 % micro-foncier (art. 32 CGI)</Td><Td right minus>− {e0(foncierAbt)}</Td></tr>}
          <tr className="bg-gray-50/60"><Td bold>Net imposable</Td><Td right bold>{e0(foncierNet)}</Td></tr>
          <tr><Td className="pl-8">Prélèvements sociaux 17,2 %</Td><Td right plus>+ {e0(psFoncier)}</Td></tr>
          <tr className="bg-amber-50 border-t-2 border-amber-200">
            <td className="px-4 py-3 text-xs font-bold text-amber-900">Total foncier (IR + PS)</td>
            <td className="px-4 py-3 text-xs font-bold text-amber-900 text-right tabular-nums">{e0(total)}</td>
          </tr>
        </tbody>
      </Tbl>
      <p className="px-4 py-2.5 text-xs text-gray-500 border-t border-gray-50">
        Régime : {isMicro ? 'Micro-foncier (abattement 30 %)' : 'Régime réel (formulaire 2044)'}
        {isMicro && foncierBrut > 15000 && (
          <span className="ml-2 text-amber-600 font-medium">⚠ Seuil micro-foncier dépassé (15 000 €) — option régime réel à étudier.</span>
        )}
      </p>
    </SectionBox>
  );
}

// ─── Module 11 : Récapitulatif chiffres clés ─────────────────────────────────

function RecapModule({ p, d }) {
  // INC-03 : afficher le plafond total AVEC reports
  const { plafondD1: _recD1, plafondD2: _recD2 } = getEffectivePlafondsWithReports(p);
  const plafondPerTotal = _recD1 + _recD2 || _recD1;
  const patrimoineTotal = p.patrimoineTotal || 0;
  const epargneLiquide = p.epargneLiquide || 0;

  const rows = [
    { label: 'RNI foyer 2025',                      value: e0(d.rniFoyer) },
    { label: 'Quotient familial',                   value: `${e0(d.quotient)} / part (${d.parts} part${d.parts > 1 ? 's' : ''})` },
    { label: 'TMI',                                  value: `${d.tmi} %` },
    { label: 'IR net foyer',                         value: e0(d.irNetFoyer) },
    { label: 'PAS prélevé 2025',                     value: e0(d.pasTotal) },
    { label: 'Solde (rembours. / complément)',        value: (d.solde <= 0 ? '+ ' : '') + e0(Math.abs(d.solde)) },
    ...(plafondPerTotal > 0 ? [{ label: 'Plafonds PER disponibles',  value: e0(plafondPerTotal) }] : []),
    ...(patrimoineTotal > 0 ? [{ label: 'Patrimoine financier total', value: e0(patrimoineTotal) }] : []),
    ...(epargneLiquide > 0  ? [{ label: 'Épargne liquide',           value: e0(epargneLiquide) }] : []),
  ];

  return (
    <SectionBox title="Récapitulatif chiffres clés" num="11">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Indicateur</Th>
            <Th right>Valeur</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <Td>{r.label}</Td>
              <Td right bold>{r.value}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Module : Synthèse & conseil patrimonial (executive summary) ─────────────
// Bilan d'ouverture du rapport. Réutilise conseilPatrimonial.genererSynthese()
// (mêmes leviers que la page Opportunités) rendu en thème clair/imprimable.

function SyntheseConseilModule({ synthese }) {
  if (!synthese) return null;
  const {
    totalDuActuel, gainTotal, totalDuApresAction,
    synthese: texte, actions = [], zonesNonCouvertes = [],
  } = synthese;
  const topActions = actions.slice(0, 5);

  return (
    <SectionBox
      title="Synthèse & conseil patrimonial"
      num="01b"
      badge={gainTotal > 0 ? `Gain ${e0(gainTotal)}` : undefined}
    >
      <div className="p-4 sm:p-5 flex flex-col gap-5">

        {/* Synthèse rédigée, adaptée au profil */}
        <p className="text-sm text-gray-700 leading-relaxed">{texte}</p>

        {/* Bilan chiffré : sans action → avec action */}
        {gainTotal > 0 && (
          <div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
                <p className="text-[11px] uppercase tracking-widest text-gray-400 font-bold">Sans action</p>
                <p className="text-lg font-bold text-gray-800 tabular-nums">{e0(totalDuActuel)}</p>
              </div>
              <ArrowRight size={18} className="text-teal-500 mx-auto" />
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-center">
                <p className="text-[11px] uppercase tracking-widest text-teal-600 font-bold">Avec action</p>
                <p className="text-lg font-bold text-teal-700 tabular-nums">{e0(totalDuApresAction)}</p>
              </div>
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-teal-600">
              Gain potentiel estimé : {e0(gainTotal)}
            </p>
          </div>
        )}

        {/* Feuille de route — priorités classées par impact */}
        {topActions.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Priorités d&apos;action</p>
            <ol className="flex flex-col gap-2">
              {topActions.map((a, i) => (
                <li key={a.id || i} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-teal-gradient text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{a.titre}</p>
                    {a.action && <p className="text-xs text-gray-500 leading-snug mt-0.5">{a.action}</p>}
                  </div>
                  {a.impactEuros > 0 && (
                    <span className="shrink-0 text-xs font-bold text-emerald-700 tabular-nums">− {e0(a.impactEuros)}</span>
                  )}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-gray-400 mt-2">Détail des horizons court / moyen / long terme en section 10 — Feuille de route.</p>
          </div>
        )}

        {/* Zones hors périmètre → orientation professionnelle */}
        {zonesNonCouvertes.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={14} className="text-amber-600" />
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Points à confier à un professionnel</p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {zonesNonCouvertes.map(z => (
                <li key={z.id} className="text-xs leading-relaxed">
                  <p className="font-semibold text-gray-800">{z.signal}</p>
                  <p className="text-gray-500">{z.pourquoi}</p>
                  <p className="mt-0.5 text-amber-700 font-medium">→ {z.professionnel}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionBox>
  );
}

// ─── Module : Bilan patrimonial ──────────────────────────────────────────────

function BilanPatrimonialModule({ p }) {
  const liq = p.epargneLiquide || 0;
  const lt  = p.epargneLongTerme || 0;
  const cpt = p.cryptoTotal || 0;
  const rpv = p.rpValeur || 0;
  const crd = p.creditCrd || 0;
  const imm = p.patrimoineImmoNet || 0;
  const net = p.patrimoineNet || 0;
  const cap = p.capaciteEpargneFoyer || 0;
  const tep = p.tauxEpargneFoyer || 0;
  const obj = p.objectifPatrimonial || '';

  if (!net && !cap) return null;

  const objFooter = obj ? (
    <div className="px-4 py-2.5 text-xs text-blue-800 bg-blue-50">
      <strong>Objectif patrimonial :</strong> {obj}
    </div>
  ) : null;

  return (
    <SectionBox title="Bilan patrimonial" num="02c" footer={objFooter}>
      <Tbl>
        <thead>
          <tr><Th wide>Composante</Th><Th right>Valeur</Th></tr>
        </thead>
        <tbody>
          {liq > 0 && <tr><Td>Épargne liquide (livrets réglementés)</Td><Td right>{e0(liq)}</Td></tr>}
          {lt > 0  && <tr><Td>Épargne long terme (PEA, CTO, AV, PEL, PERCO)</Td><Td right>{e0(lt)}</Td></tr>}
          {cpt > 0 && <tr><Td>Actifs crypto</Td><Td right>{e0(cpt)}</Td></tr>}
          {rpv > 0 && <tr><Td>Résidence principale (valeur estimée)</Td><Td right>{e0(rpv)}</Td></tr>}
          {crd > 0 && <tr><Td className="pl-8">− Crédit restant dû</Td><Td right minus>− {e0(crd)}</Td></tr>}
          {imm > 0 && <tr className="bg-gray-50/50"><Td bold>= Immobilier net</Td><Td right bold>{e0(imm)}</Td></tr>}
          <TotalRow label="Patrimoine net estimé" value={e0(net)} />
          {cap > 0 && <tr><Td>Capacité d'épargne mensuelle</Td><Td right>{e0(cap)}</Td></tr>}
          {tep > 0 && <tr><Td>Taux d'épargne estimé</Td><Td right>{tep} %</Td></tr>}
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Module : Alertes critiques 🔴 ───────────────────────────────────────────

function AlertesCritiquesModule({ p }) {
  const aiAlerts = p.alertsCritiques || [];
  const staticAlerts = [];

  if (p.hasCrypto) staticAlerts.push(
    '[🔴 CRITIQUE] Actifs crypto — Formulaire 2086 (chaque cession) + 3916 bis (comptes étrangers) obligatoires. Amende : 1 500 € par compte non déclaré (10 000 € si pays non coopératif).'
  );
  if (p.hasCompteEtranger) staticAlerts.push(
    '[🔴 CRITIQUE] Compte bancaire étranger — Formulaire 3916 obligatoire (art. 1649 A CGI), même à solde zéro ou clôturé. Amende : 1 500 € par compte.'
  );
  if (p.hasTestamentManquant) staticAlerts.push(
    '[🔴 URGENT] PACS sans testament — Le partenaire ne perçoit rien automatiquement. Actifs légués aux héritiers légaux (parents, fratrie). Rédiger un testament et vérifier les clauses bénéficiaires des AV.'
  );

  const staticPrefixes = staticAlerts.map(s => s.slice(0, 25));
  const all = [
    ...staticAlerts,
    ...aiAlerts.filter(a => !staticPrefixes.some(p => a.startsWith(p.slice(0, 15)))),
  ];
  if (all.length === 0) return null;

  return (
    <SectionBox title="Alertes critiques" num="⚠">
      <div className="p-4 flex flex-col gap-2">
        {all.map((line, i) => (
          <div key={i} className="rp-alert-red border-l-4 border-red-400 bg-red-50 px-4 py-3 rounded-r-lg">
            <p className="text-xs text-red-800 leading-relaxed">{line}</p>
          </div>
        ))}
      </div>
    </SectionBox>
  );
}

// ─── Module : Enveloppes — dates, antériorité & espace ───────────────────────

function EnveloppesDetailModule({ p }) {
  const isCouple = p.mode === 'couple';
  const fmtAnt = y => (y !== null && y !== undefined) ? `${y} an${y !== 1 ? 's' : ''}` : null;

  const rows = [];

  if (p.peaD1 > 0 || p.peaD2 > 0) {
    rows.push({ sep: 'PEA — Plan d\'épargne en actions' });
    if (p.peaD1 > 0 || (isCouple && p.peaDateD1)) {
      const ant1 = p.peaAnterioriteD1;
      const antStr1 = fmtAnt(ant1);
      const status1 = ant1 !== null ? (ant1 >= 5 ? ' ✓ exonéré IR' : ` — encore ${5 - ant1} an${5 - ant1 > 1 ? 's' : ''} avant exon.`) : '';
      rows.push({ label: 'Valeur', d1: p.peaD1 > 0 ? e0(p.peaD1) : '—', d2: p.peaD2 > 0 ? e0(p.peaD2) : '—' });
      rows.push({ label: 'Ouverture', d1: p.peaDateD1 || '—', d2: p.peaDateD2 || '—', sub: true });
      const ant2 = p.peaAnterioriteD2;
      const antStr2 = fmtAnt(ant2);
      const status2 = ant2 !== null ? (ant2 >= 5 ? ' ✓ exonéré IR' : ` — encore ${5 - ant2} an${5 - ant2 > 1 ? 's' : ''} avant exon.`) : '';
      rows.push({ label: 'Antériorité', d1: antStr1 ? antStr1 + status1 : '—', d2: antStr2 ? antStr2 + status2 : '—', sub: true });
      rows.push({ label: 'Espace restant (plaf. 150 k€)', d1: e0(p.peaEspaceD1 ?? 150_000), d2: e0(p.peaEspaceD2 ?? 150_000), sub: true });
    }
  }

  if (p.avD1 > 0 || p.avD2 > 0) {
    rows.push({ sep: 'Assurance-vie' });
    rows.push({ label: 'Valeur', d1: p.avD1 > 0 ? e0(p.avD1) : '—', d2: p.avD2 > 0 ? e0(p.avD2) : '—' });
    rows.push({ label: 'Souscription', d1: p.avDateD1 || '—', d2: p.avDateD2 || '—', sub: true });
    const avSt = (ant) => {
      const s = fmtAnt(ant);
      if (!s) return '—';
      return s + (ant >= 8 ? ' ✓ abattement actif' : ` — encore ${8 - ant} an${8 - ant > 1 ? 's' : ''} avant abatt.`);
    };
    rows.push({ label: 'Antériorité', d1: avSt(p.avAnterioriteD1), d2: avSt(p.avAnterioriteD2), sub: true });
    if (p.avVerseD1 > 0 || p.avVerseD2 > 0) {
      rows.push({ label: 'Versements cumulés', d1: p.avVerseD1 > 0 ? e0(p.avVerseD1) : '—', d2: p.avVerseD2 > 0 ? e0(p.avVerseD2) : '—', sub: true });
    }
  }

  if (p.pelD1 > 0 || p.pelD2 > 0) {
    rows.push({ sep: 'PEL — Plan d\'épargne logement' });
    rows.push({ label: 'Valeur', d1: p.pelD1 > 0 ? e0(p.pelD1) : '—', d2: p.pelD2 > 0 ? e0(p.pelD2) : '—' });
    rows.push({ label: 'Ouverture', d1: p.pelDateD1 || '—', d2: p.pelDateD2 || '—', sub: true });
    const pelSt = (ant, regime) => {
      const s = fmtAnt(ant);
      if (!s) return '—';
      return s + (regime === 'imposable' ? ' ⚠ intérêts imposables' : ' ✓ exonéré');
    };
    rows.push({ label: 'Régime fiscal', d1: pelSt(p.pelAnterioriteD1, p.pelFiscalD1), d2: pelSt(p.pelAnterioriteD2, p.pelFiscalD2), sub: true });
    if (p.pelInteretsD1 > 0 || p.pelInteretsD2 > 0) {
      rows.push({ label: 'Intérêts 2025', d1: p.pelInteretsD1 > 0 ? e0(p.pelInteretsD1) : '—', d2: p.pelInteretsD2 > 0 ? e0(p.pelInteretsD2) : '—', sub: true });
    }
  }

  if ((p.livretPlusD1 || 0) + (p.livretPlusD2 || 0) > 0) {
    const g1 = p.livretPlusGainAnnuelD1 || 0;
    const g2 = p.livretPlusGainAnnuelD2 || 0;
    if (g1 > 0 || g2 > 0) {
      rows.push({ sep: 'Livret+ / Livret bancaire — gain si réallocation PEA' });
      rows.push({ label: 'Solde', d1: p.livretPlusD1 > 0 ? e0(p.livretPlusD1) : '—', d2: p.livretPlusD2 > 0 ? e0(p.livretPlusD2) : '—' });
      rows.push({ label: 'Gain net annuel estimé (+4 % net)', d1: g1 > 0 ? `+ ${e0(g1)}/an` : '—', d2: g2 > 0 ? `+ ${e0(g2)}/an` : '—', sub: true });
    }
  }

  if ((p.percoAbondD1 || 0) + (p.percoAbondD2 || 0) > 0) {
    rows.push({ sep: 'PERCO — abondement employeur' });
    rows.push({ label: 'Abondement annuel', d1: p.percoAbondD1 > 0 ? e0(p.percoAbondD1) : '—', d2: p.percoAbondD2 > 0 ? e0(p.percoAbondD2) : '—' });
    if (p.percoPlafondD1 > 0 || p.percoPlafondD2 > 0) {
      rows.push({ label: 'Plafond abondement', d1: p.percoPlafondD1 > 0 ? e0(p.percoPlafondD1) : '—', d2: p.percoPlafondD2 > 0 ? e0(p.percoPlafondD2) : '—', sub: true });
    }
  }

  if ((p.peeD1 || 0) + (p.peeD2 || 0) > 0) {
    rows.push({ sep: 'PEE — Plan d\'épargne entreprise' });
    rows.push({ label: 'Valorisation', d1: p.peeD1 > 0 ? e0(p.peeD1) : '—', d2: p.peeD2 > 0 ? e0(p.peeD2) : '—' });
    rows.push({ label: 'Blocage 5 ans', d1: 'Sauf déblocage anticipé', d2: '—', sub: true });
  }

  if (rows.length === 0) return null;

  return (
    <SectionBox title="Enveloppes — dates, antériorité & espace" num="05a">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Enveloppe</Th>
            <Th right>{isCouple ? 'D1' : 'Valeur / Statut'}</Th>
            {isCouple && <Th right>D2</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (r.sep) return (
              <tr key={i}>
                <td colSpan={isCouple ? 3 : 2} className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  {r.sep}
                </td>
              </tr>
            );
            return (
              <tr key={i} className={r.sub ? 'bg-gray-50/30' : ''}>
                <Td className={r.sub ? 'pl-8 text-gray-500 text-xs' : ''}>{r.label}</Td>
                <Td right muted={r.sub}>{r.d1}</Td>
                {isCouple && <Td right muted={r.sub}>{r.d2}</Td>}
              </tr>
            );
          })}
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Module : Transmission et protection ─────────────────────────────────────

function TransmissionModule({ p }) {
  const hasData = p.hasTestamentManquant
    || p.beneficiairesAvD1 || p.beneficiairesAvD2
    || p.donationsRecues > 0
    || p.hasNuPropriete
    || p.indivisionValeur > 0;
  if (!hasData) return null;

  return (
    <SectionBox title="Transmission et protection" num="06a">
      <div className="p-4 flex flex-col gap-3">
        {p.hasTestamentManquant && (
          <div className="rp-alert-red border-l-4 border-red-400 bg-red-50 px-4 py-3 rounded-r-lg">
            <p className="text-xs font-bold text-red-800 mb-0.5">⚠ PACS sans testament</p>
            <p className="text-xs text-red-700 leading-relaxed">Le partenaire n'hérite pas automatiquement — actifs légués aux héritiers légaux (parents, fratrie). Rédiger un testament et vérifier les clauses bénéficiaires des AV.</p>
          </div>
        )}
        {(p.beneficiairesAvD1 || p.beneficiairesAvD2) && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Clauses bénéficiaires AV</p>
            {p.beneficiairesAvD1 && <p className="text-xs text-gray-600"><span className="font-medium">D1 :</span> {p.beneficiairesAvD1}</p>}
            {p.beneficiairesAvD2 && <p className="text-xs text-gray-600 mt-0.5"><span className="font-medium">D2 :</span> {p.beneficiairesAvD2}</p>}
          </div>
        )}
        {p.donationsRecues > 0 && (
          <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3">
            <p className="text-xs font-semibold text-teal-700 mb-1">Donations reçues</p>
            <p className="text-xs text-teal-700">Montant reçu : <strong>{e0(p.donationsRecues)}</strong></p>
            {p.abattementDonRest > 0 && (
              <p className="text-xs text-teal-600 mt-0.5">Abattement restant : {e0(p.abattementDonRest)} (renouvelable tous les 15 ans)</p>
            )}
          </div>
        )}
        {p.hasNuPropriete && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Nu-propriété détectée</p>
            {p.nuProprieteValeur > 0 && <p className="text-xs text-gray-600">Valeur : {e0(p.nuProprieteValeur)}</p>}
            <p className="text-xs text-gray-500 mt-0.5">Attention aux règles IFI et succession — vérifier avec un notaire.</p>
          </div>
        )}
        {p.indivisionValeur > 0 && (
          <div className="rp-alert-amber rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">Indivision</p>
            <p className="text-xs text-amber-700">Quote-part estimée : <strong>{e0(p.indivisionValeur)}</strong>. Une convention d'indivision ou une SCI peut simplifier la gestion et la transmission.</p>
          </div>
        )}
      </div>
    </SectionBox>
  );
}

// ─── Module : Documents à récupérer 🟡 ───────────────────────────────────────

function DocumentsModule({ p }) {
  const aiDocs = p.alertsAVerifier || [];
  const computed = [];

  if (p.pelD1 > 0 || p.pelD2 > 0) {
    computed.push('[🟡 À CONFIRMER] Date exacte d\'ouverture du PEL — vérifier sur le livret ou auprès de la banque pour confirmer le régime fiscal applicable (exonéré / imposable selon l\'antériorité).');
  }
  if (p.peroD1 > 0 || p.peroD2 > 0) {
    computed.push('[🟡 À RÉCUPÉRER] Attestation PERO employeur (case 6QS) — document fourni par l\'employeur en début d\'année, à saisir dans la déclaration pour déduire les cotisations obligatoires.');
  }
  if (p.hasCrypto) {
    computed.push('[🟡 À PRÉPARER] Historique complet des cessions crypto 2025 — export depuis les exchanges pour remplir le formulaire 2086 (méthode FIFO obligatoire pour le calcul des plus-values).');
  }
  if (p.hasCompteEtranger) {
    computed.push('[🟡 À RASSEMBLER] RIB et justificatifs des comptes bancaires étrangers (Revolut, N26, Wise…) — nécessaires pour le formulaire 3916 à joindre à la déclaration.');
  }

  const computedPrefixes = computed.map(c => c.slice(0, 20));
  const all = [
    ...computed,
    ...aiDocs.filter(a => !computedPrefixes.some(pr => a.startsWith(pr.slice(0, 15)))),
  ];
  if (all.length === 0) return null;

  return (
    <SectionBox title="Documents à récupérer" num="07a">
      <div className="p-4 flex flex-col gap-2">
        {all.map((line, i) => (
          <div key={i} className="rp-alert-amber border-l-4 border-amber-400 bg-amber-50 px-4 py-3 rounded-r-lg">
            <p className="text-xs text-amber-800 leading-relaxed">{line}</p>
          </div>
        ))}
      </div>
    </SectionBox>
  );
}

// ─── Module : Actions avant 31/12 🟢 ─────────────────────────────────────────

function ActionsAnDecModule({ p, d }) {
  const isCouple = d?.isCouple || p.mode === 'couple';
  const parts    = p.parts || (isCouple ? 2 : 1);
  const stopRate = Math.min(p.tmiRetraiteD1 ?? 11, p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? 11)) / 100;
  const perOpt   = useMemo(
    () => computePerOptimumCascade(
      d?.rniFoyer || 0, parts, p.plafondPerD1 || 0, p.plafondPerD2 || 0,
      isCouple, p.rniD1 || 0, p.rniD2 || 0, stopRate
    ),
    [d?.rniFoyer, parts, p.plafondPerD1, p.plafondPerD2, isCouple, p.rniD1, p.rniD2, stopRate]
  );

  const aiOps = p.alertsOpportunites || [];
  const computed = [];

  if (perOpt.optimumTotal > 0 && perOpt.tmiDepart > 11) {
    computed.push(
      `[🟢 LEVIER FORT] Versement PER avant 31/12/2025 — ${e0(perOpt.optimumTotal)} effacent la tranche ${perOpt.tmiDepart} % · économie IR réelle : ${e0(perOpt.economieOptimum)} · effort net : ${e0(perOpt.effortNet)}.`
    );
  }
  if (!p.peaD1 && !p.peaD2) {
    computed.push('[🟢 OPPORTUNITÉ] Ouvrir un PEA (1 € suffit) — démarre l\'horloge fiscale 5 ans. Après 5 ans : plus-values exonérées d\'IR. Plafond 150 000 € par personne.');
  } else if (isCouple && (!p.peaD1 || !p.peaD2)) {
    const who = !p.peaD1 ? 'D1' : 'D2';
    computed.push(`[🟢 OPPORTUNITÉ] Ouvrir un PEA pour ${who} (1 € suffit) — démarre l'horloge fiscale 5 ans. Plafond : 150 000 €.`);
  }
  if ((p.percoAbondD1 || 0) + (p.percoAbondD2 || 0) > 0) {
    const totalAbond = (p.percoAbondD1 || 0) + (p.percoAbondD2 || 0);
    computed.push(`[🟢 LEVIER] PERCO — saturer l'abondement employeur avant la fin de l'année (${e0(totalAbond)} versés par l'employeur, hors impôts et charges sociales).`);
  }

  const computedPrefixes = computed.map(c => c.slice(0, 20));
  const all = [
    ...computed,
    ...aiOps.filter(a => !computedPrefixes.some(pr => a.startsWith(pr.slice(0, 15)))),
  ];
  if (all.length === 0) return null;

  return (
    <SectionBox title="Actions avant 31/12" num="08c">
      <div className="p-4 flex flex-col gap-2">
        {all.map((line, i) => (
          <div key={i} className="border-l-4 border-teal-400 bg-teal-50 px-4 py-3 rounded-r-lg">
            <p className="text-xs text-teal-800 leading-relaxed">{line}</p>
          </div>
        ))}
      </div>
    </SectionBox>
  );
}

// ─── Section IA ───────────────────────────────────────────────────────────────

function AttentionLine({ line }) {
  const t = line.trim();
  if (!t) return <div className="h-1" />;
  if (t.startsWith('[🔴')) return (
    <div className="rp-alert-red border-l-2 border-red-400 pl-3 py-1.5 my-1 bg-red-50 rounded-r-lg">
      <p className="text-xs text-red-800 leading-relaxed">{t}</p>
    </div>
  );
  if (t.startsWith('[🟡')) return (
    <div className="rp-alert-amber border-l-2 border-amber-400 pl-3 py-1.5 my-1 bg-amber-50 rounded-r-lg">
      <p className="text-xs text-amber-800 leading-relaxed">{t}</p>
    </div>
  );
  if (t.startsWith('[🟢')) return (
    <div className="border-l-2 border-teal-400 pl-3 py-1.5 my-1 bg-teal-50 rounded-r-lg">
      <p className="text-xs text-teal-800 leading-relaxed">{t}</p>
    </div>
  );
  return <p className="text-xs text-gray-700 leading-relaxed py-0.5">{t}</p>;
}

function AiSectionCard({ section }) {
  const content = section.lines.join('\n').trim();
  if (!content) return null;
  const isAttn = section.title.toUpperCase().includes("POINTS D'ATTENTION");

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/10 overflow-hidden shadow-sm print:shadow-none">
      <div className="flex items-center justify-between px-5 py-3 bg-violet-50 border-b border-violet-200">
        <h3 className="text-sm font-bold text-violet-900">{section.title}</h3>
        <span className="flex items-center gap-1 text-xs font-semibold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full print:hidden">
          <Sparkles size={9} /> Enrichi IA
        </span>
      </div>
      <div className="px-5 py-4">
        {isAttn
          ? <div className="space-y-0.5">{section.lines.map((l, i) => <AttentionLine key={i} line={l} />)}</div>
          : <pre className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap break-words">{content}</pre>
        }
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Rapport() {
  const { state } = useApp();
  const navigate  = useNavigate();
  const profile   = state.profile;
  const p         = state.parsedProfile ?? {};

  const d = useMemo(() => computeData(profile, p), [profile, p]);

  // Synthèse patrimoniale (executive summary) — on aligne « sans action » sur les
  // chiffres affichés en tête du rapport (d.totalDu / d.tmi) plutôt que de laisser
  // genererSynthese recalculer, pour ne pas afficher deux montants divergents.
  const synthese = useMemo(
    () => genererSynthese(p, { totalDu: d.totalDu, tmi: d.tmi }),
    [p, d.totalDu, d.tmi],
  );

  const handleExportPDF = () => {
    const title = document.title;
    document.title = `Rapport-IR-2025-${new Date().toISOString().slice(0, 10)}`;
    window.print();
    setTimeout(() => { document.title = title; }, 1000);
  };

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([profile || ''], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `rapport-fiscal-${date}.txt` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (!profile || !d) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <FileText size={36} className="text-gray-300" />
        <p className="text-sm text-gray-500">Aucun profil généré. Commencez par la collecte.</p>
        <Button onClick={() => navigate('/collect')}>Aller à la collecte →</Button>
      </div>
    );
  }

  const aiSections = d.sections.filter(s => isAiSection(s.title));
  const isRemb     = d.solde <= 0;
  const isCouple   = d.isCouple;
  const plafondPerTotal = p.plafondPerTotal || ((p.plafondPerD1 || 0) + (p.plafondPerD2 || 0));
  const perSimulation = state.perSimulation ?? {};

  // Cascade PER — optimum fiscal (source de vérité pour tout le rapport)
  const parts = p.parts || (isCouple ? 2 : 1);
  // stopRate = TMI retraite estimée (plus favorable du foyer) — n'optimiser que les tranches au-dessus
  const stopRate = Math.min(p.tmiRetraiteD1 ?? 11, p.tmiRetraiteD2 ?? (p.tmiRetraiteD1 ?? 11)) / 100;
  const perOpt = useMemo(
    () => computePerOptimumCascade(d.rniFoyer, parts, p.plafondPerD1 || 0, p.plafondPerD2 || 0, isCouple, p.rniD1 || 0, p.rniD2 || 0, stopRate),
    [d.rniFoyer, parts, p.plafondPerD1, p.plafondPerD2, isCouple, p.rniD1, p.rniD2, stopRate]
  );

  // CEHR — Contribution Exceptionnelle Hauts Revenus (art. 223 sexies CGI)
  const cehr = calcCEHR(p.rfr || d.rniFoyer, isCouple);

  return (
    <div className="relative bg-ink-900 overflow-x-hidden">
      <style>{`
        @media print {
          @page { size: A4; margin: 2cm 1.5cm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; font-size: 11px; }

          .print\\:hidden, nav, header, footer, .no-print { display: none !important; }

          .rp-section-header { background-color: #0F2A44 !important; color: white !important; }
          .rp-section-header * { color: white !important; }
          .rp-module-num { color: #0E7C7B !important; }

          .rp-table-head th { background-color: #0F2A44 !important; color: white !important; }

          .rp-kpi { border: 2px solid #0F2A44 !important; }

          .rp-gain { color: #2E8B57 !important; }

          .rp-alert-amber { background-color: #FEF6E4 !important; border-left-color: #D68910 !important; }
          .rp-alert-red { background-color: #FDECEA !important; border-left-color: #C0392B !important; }

          table { page-break-inside: avoid; }
          .rp-module { page-break-inside: avoid; margin-bottom: 0.8cm; }

          .rp-header { display: flex !important; justify-content: space-between; align-items: flex-end;
            border-bottom: 3px solid #0F2A44; padding-bottom: 10px; margin-bottom: 20px; }
          .rp-header-title { font-size: 18px; font-weight: 800; color: #0F2A44; }
          .rp-header-meta { font-size: 10px; color: #6b7280; }

          .rp-section-sep { border-bottom: 2px solid #0F2A44; margin-bottom: 12px; padding-bottom: 6px; }
          .rp-section-sep-num { color: #0E7C7B; font-weight: 700; font-size: 16px; margin-right: 8px; }
          .rp-section-sep-label { color: #0F2A44; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
        }
      `}</style>

      <AuroraBackground showGrid intensity={0.65} className="print:hidden" />
      <SpotlightCursor size={500} intensity={0.13} />
      <Grain opacity={0.02} />

      <div className="relative z-10 max-w-[1100px] mx-auto px-6 py-12">
      <div className="flex flex-col gap-5">

        {/* ── Header print ── */}
        <div className="rp-header hidden">
          <div>
            <p className="rp-header-title">Rapport Fiscal — Déclaration 2025 · Feuille de route 2026</p>
            <p className="rp-header-meta">Kapio · Généré le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · Confidentiel</p>
          </div>
          <p className="rp-header-meta">Document personnel — ne pas diffuser</p>
        </div>

        {/* ── Hero écran ── */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="print:hidden mb-8"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-ink-50 text-xs font-medium mb-5">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-kapio-300 opacity-75 animate-pulse2" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-kapio-300" />
            </span>
            Étape 4 / 5
            <FileText size={11} className="text-kapio-300" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ letterSpacing: '-0.03em' }}>
            <SplitText text="Rapport fiscal " delay={0.2} stagger={0.04} />
            <SplitText text="2025" gradient delay={0.5} stagger={0.06} />
          </h1>
          <p className="text-base text-ink-100 leading-relaxed max-w-2xl">
            {d.hasAi
              ? 'Profil enrichi IA — synthèse du foyer, calculs détaillés, analyse complète.'
              : 'Synthèse du foyer + calculs détaillés. Enrichissez avec l\'IA pour l\'analyse complète.'}
          </p>
        </motion.div>

        {/* ── Banner non enrichi ── */}
        {!d.hasAi && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 flex items-start gap-3 print:hidden">
            <Wand2 size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">Profil non encore enrichi</p>
              <p className="text-xs text-amber-400 mt-0.5 leading-relaxed">
                Les tableaux ci-dessous sont calculés depuis vos données saisies.
                Enrichissez avec l'IA pour les cases 2042, situations particulières, points critiques et objectifs.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/profile')} className="shrink-0">
              Enrichir →
            </Button>
          </div>
        )}

        {/* ── Actions haut ── */}
        <div className="flex gap-3 flex-wrap print:hidden">
          <Button variant="secondary" size="sm" onClick={handleExportPDF}>
            <Download size={14} /> Exporter en PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            <Download size={14} /> Télécharger .txt
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>
            <ArrowLeft size={14} /> Retour au profil
          </Button>
        </div>

        {/* ── Rapport papier — fond blanc pour lisibilité des tableaux ── */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-hidden print:bg-transparent print:shadow-none print:rounded-none">
        <div className="p-5 sm:p-8 flex flex-col gap-5 print:p-0">

        {/* ── Section 01 : Essentiel en un coup d'œil ── */}
        {d.rniFoyer > 0 && (
          <>
            <SectionSep num="01" label="Essentiel en un coup d'œil" />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label="IR foyer 2025 dû"
                value={e0(d.totalDu)}
                sub={`IR net ${e0(d.irNetFoyer)}${d.psFoncier > 0 ? ` + PS foncier ${e0(d.psFoncier)}` : ''}`}
                color="gray"
              />
              <KpiCard
                label={isRemb ? 'Remboursement attendu' : 'Complément à payer'}
                value={(isRemb ? '+ ' : '') + e0(Math.abs(d.solde))}
                sub={`PAS prélevé ${e0(d.pasTotal)}`}
                color={isRemb ? 'teal' : 'amber'}
              />
              <KpiCard
                label="TMI"
                value={pct(d.tmi / 100)}
                sub={`RNI ${e0(d.rniFoyer)} · ${d.parts} part${d.parts > 1 ? 's' : ''}`}
                color="violet"
              />
            </div>

            {/* Prose KPI */}
            <ProseCard color="navy">
              Le foyer {isCouple ? '(D1 + D2)' : ''} déclare un revenu net imposable de{' '}
              <strong>{e0(d.rniFoyer)}</strong> pour 2025{d.parts > 1 ? `, avec ${d.parts} parts fiscales (quotient familial ${e0(d.quotient)}/part)` : ''}.{' '}
              La tranche marginale d'imposition est de <strong>{d.tmi}&nbsp;%</strong>.{' '}
              {isRemb
                ? `Un remboursement de ${e0(d.solde)} est attendu après la déclaration (PAS excédentaire).`
                : `Un complément de ${e0(Math.abs(d.solde))} sera dû à l'automne 2026 (PAS insuffisant).`
              }
              {perOpt.optimumTotal > 0 && perOpt.economieOptimum > 0 && (
                <> Le principal levier fiscal est le versement PER&nbsp;: <strong>{e0(perOpt.optimumTotal)}</strong> permettent d'effacer la tranche à {perOpt.tmiDepart}&nbsp;% et de générer <strong>{e0(perOpt.economieOptimum)}</strong> d'économie IR (effort net réel&nbsp;: {e0(perOpt.effortNet)}).{perOpt.capaciteResiduelle > 0 ? ` La capacité résiduelle (${e0(perOpt.capaciteResiduelle)}) est à orienter vers PEA ou AV — le PER ne génère plus que 11 % sur cet excédent.` : ''}</>
              )}
            </ProseCard>

            <SyntheseConseilModule synthese={synthese} />
          </>
        )}

        {/* ── Section 02 : Synthèse du foyer ── */}
        {d.rniFoyer > 0 && (
          <>
            <SectionSep num="02" label="Synthèse du foyer" />
            <RevenusTable d={d} p={p} />
            <EpargneTable p={p} />
            <BilanPatrimonialModule p={p} />
            <PatrimoineDesequilibreBlock p={p} />
          </>
        )}

        {/* ── Section 03 : Calcul de l'impôt ── */}
        {d.rniFoyer > 0 && (
          <>
            <SectionSep num="03" label="Calcul de l'impôt — Revenus 2025" />

            <ProseCard color="gray">
              Le calcul de l'IR se déroule en trois étapes : <strong>(1)</strong> abattement forfaitaire de {ABT.taux * 100}&nbsp;% sur les salaires nets imposables
              (plancher {e0(ABT.minimum)}, plafond {e0(ABT.maximum)} — art. 83 3° CGI),{' '}
              <strong>(2)</strong> application du barème progressif sur le quotient familial,{' '}
              <strong>(3)</strong> décote si l'IR brut est inférieur à{' '}
              {isCouple ? `${DECOTE.seuil_couple.toLocaleString('fr-FR')} € (couple)` : `${DECOTE.seuil_celibataire.toLocaleString('fr-FR')} € (célibataire)`}.
            </ProseCard>

            <RniTable d={d} p={p} />
            {d.steps.length > 0 && <BaremeTable d={d} />}
            {isCouple && <IRParDeclarantTable d={d} />}
            {d.tmi > 0 && <TmiProseBlock d={d} />}
            <SoldeTable d={d} cehr={cehr} />
            {isCouple && d.totalSolo > 0 && <GainPacsTable d={d} />}
            {isCouple && d.gainPacs > 0 && <AccordCoupleProseBlock d={d} />}
          </>
        )}

        {/* ── Alertes critiques 🔴 (avant PER) ── */}
        <AlertesCritiquesModule p={p} />

        {/* ── Section 04 : Stratégie PER ── */}
        {(plafondPerTotal > 0 || (p.plafondPerD1 || 0) > 0 || (p.plafondPerD2 || 0) > 0) && (
          <>
            <SectionSep num="04" label="Stratégie PER — Plafonds & scénarios" />

            <ProseCard color="teal">
              Le Plan d'Épargne Retraite (PER) individuel est le principal levier de déduction fiscale disponible
              pour ce foyer (art. 163 quatervicies CGI). Chaque euro versé réduit directement le revenu net imposable.{' '}
              L'économie réelle dépend des tranches traversées — elle est souvent <em>inférieure</em> à TMI&nbsp;×&nbsp;versement
              lorsque la déduction empiète sur une tranche moins taxée. La comparaison de scénarios ci-dessous utilise le barème progressif exact.
            </ProseCard>

            <PerZonesBlock p={p} d={d} perSim={perSimulation} />
            <PerPlafondsModule p={p} d={d} />
            <PerScenariosTable p={p} d={d} />
            <PerCalendarBlock p={p} d={d} />
          </>
        )}

        {/* ── Section 05 : Enveloppes & suivi patrimonial ── */}
        <SectionSep num="05" label="Enveloppes & suivi patrimonial" />
        <EnveloppesDetailModule p={p} />
        {!p.isEnriched && <PeaAvModule p={p} />}
        <ReallocationModule p={p} />
        <PelModule p={p} />

        {/* ── Section 06 : Transmission et protection ── */}
        <SectionSep num="06" label="Transmission et protection" />
        <TransmissionModule p={p} />

        {/* ── Section 07 : Documents à récupérer ── */}
        <SectionSep num="07" label="Documents à récupérer" />
        <DocumentsModule p={p} />

        {/* ── Section 08 : Actions & obligations déclaratives ── */}
        <SectionSep num="08" label="Actions & obligations déclaratives" />
        <CasesModule p={p} d={d} />
        {!p.isEnriched && <VigilancesModule p={p} d={d} />}
        <ActionsAnDecModule p={p} d={d} />

        {/* ── Alertes conditionnelles (crypto, compte étranger) ── */}
        {p.hasCrypto && (
          <div className="rp-alert-red rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-bold text-red-800 mb-1">🔴 Crypto — obligations déclaratives 2025</p>
            <p className="text-xs text-red-700 leading-relaxed">
              <strong>Formulaire 2086 :</strong> déclarer chaque cession avec prix d'acquisition et de cession (FIFO obligatoire).
              <br /><strong>Formulaire 3916 bis :</strong> un formulaire par exchange étranger (Binance, Kraken, Coinbase, etc.), même sans cession.
              Amende : 1 500 € par compte non déclaré.
            </p>
          </div>
        )}

        {p.hasCompteEtranger && (
          <div className="rp-alert-red rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-bold text-red-800 mb-1">🔴 Compte étranger — formulaire 3916</p>
            <p className="text-xs text-red-700 leading-relaxed">
              Déclarer chaque compte bancaire étranger via le formulaire 3916, même à solde zéro ou clôturé en cours d'année.
              Amende : 1 500 € par compte (10 000 € si pays non coopératif — art. 1649 A CGI).
            </p>
          </div>
        )}

        {/* ── Section 09 : Analyse patrimoniale ── */}
        <SectionSep num="09" label="Analyse patrimoniale" />
        {d.foncierBrut > 0 && <FoncierModule d={d} />}
        <AllocationActifsModule p={p} />
        <DiagnosticFiscalModule p={p} d={d} />

        {/* ── Section IA : Analyse IA ── */}
        {aiSections.length > 0 && (
          <>
            <SectionSep num="IA" label="Analyse IA" />
            <div className="flex flex-col gap-4">
              {aiSections.map((s, i) => <AiSectionCard key={i} section={s} />)}
            </div>
          </>
        )}

        {/* ── Section 10 : Feuille de route ── */}
        <SectionSep num="10" label="Feuille de route" />
        <FeuilleRouteModule p={p} d={d} />

        {/* ── Section 11 : Récapitulatif ── */}
        <SectionSep num="11" label="Récapitulatif" />
        <RecapModule p={p} d={d} />

        {/* ── CTA Conseil IA ── */}
        <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 print:hidden">
          <div className="w-10 h-10 rounded-xl bg-teal-gradient flex items-center justify-center text-white shrink-0 shadow-sm">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">Étape suivante : le conseil expert</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Posez vos questions à Claude avec votre profil fiscal complet en contexte.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate('/chat')} className="shrink-0">
            Démarrer le conseil → <Sparkles size={12} />
          </Button>
        </div>

        </div>
        </div>{/* fin rapport papier */}

        {/* Disclaimer global permanent */}
        <div className="print:hidden">
          <DisclaimerBanner variant="dark" />
        </div>

        {/* ── Actions bas ── */}
        <div className="flex gap-3 flex-wrap pt-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={handleExportPDF}>
            <Download size={14} /> Exporter en PDF
          </Button>
        </div>

      </div>
      </div>
    </div>
  );
}
