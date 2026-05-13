import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Printer, Download, ArrowLeft, Sparkles, Wand2, FileText } from 'lucide-react';
import Button from '../components/Button';
import { TRANCHES, DECOTE, ABT, calcIR, MIN_PLAFOND_PER, computePerOptimumCascade } from '../lib/taxCalculator';

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

const AI_TITLES = ['DÉCLARATION', 'ANALYSE DES SITUATIONS', "POINTS D'ATTENTION", 'OBJECTIFS PRIORITAIRES'];
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

function computeData(profile) {
  if (!profile) return null;

  const isCouple = /FOYER 2025|DÉCLARANT 2/i.test(profile);

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
  const retD1 = netD1 - abt10D1;
  const retD2 = netD2 - abt10D2;

  const foncierBrut = pf(profile, /Revenus fonciers bruts\s*:\s*([\d\s,]+)\s*€/i)
                   || pf(profile, /(?<!nets? imposables? )Revenus fonciers\s*:\s*([\d\s,]+)\s*€/i);
  const isMicro   = /micro.foncier/i.test(profile);
  const foncierAbt = isMicro ? foncierBrut * 0.30 : 0;
  const foncierNet = foncierBrut - foncierAbt;

  const parts     = pf(profile, /Parts fiscales\s*:\s*([\d,\.]+)/) || (isCouple ? 2 : 1);
  const rniFoyer  = retD1 + retD2 + foncierNet;
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
  const pasTotal = pasD1 + pasD2;
  const solde    = pasTotal - totalDu;

  let irD1Solo = 0, irD2Solo = 0, gainPacs = 0, totalSolo = 0;
  let contribD1 = 0, contribD2 = 0, regloD1 = 0, regloD2 = 0;

  if (isCouple && retD1 > 0) {
    irD1Solo   = irBrut(retD1, 1);
    irD2Solo   = irBrut(retD2, 1);
    totalSolo  = irD1Solo + irD2Solo;
    gainPacs   = totalSolo - irNetFoyer;
    contribD1  = irD1Solo - gainPacs / 2;
    contribD2  = irD2Solo - gainPacs / 2;
    regloD1    = pasD1 - contribD1;
    regloD2    = pasD2 - contribD2;
  }

  const tmi = steps.length > 0 ? steps[steps.length - 1].rate * 100 : 0;

  const sections = parseProfileSections(profile);
  const hasAi    = sections.some(s => isAiSection(s.title));

  return {
    isCouple, parts, quotient, rniFoyer,
    netD1, netD2, brutD1, brutD2, abt10D1, abt10D2, retD1, retD2,
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
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-50 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] opacity-55 mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}

function SectionBox({ title, badge, num, children }) {
  return (
    <div className="rp-module rounded-2xl border border-gray-200 overflow-hidden shadow-sm print:shadow-none">
      <div className="rp-section-header flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-800">
          {num && <span className="rp-module-num text-teal-600 font-mono mr-2">{num}</span>}
          {title}
        </h3>
        {badge && (
          <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{badge}</span>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Tbl({ children }) {
  return <table className="w-full text-xs">{children}</table>;
}

function Th({ children, right, wide }) {
  return (
    <th className={[
      'rp-table-head px-4 py-2 font-semibold text-gray-500 bg-gray-50 border-b border-gray-100',
      'uppercase tracking-wide text-[10px] whitespace-nowrap',
      right ? 'text-right' : 'text-left',
      wide  ? 'w-1/2'     : '',
    ].join(' ')}>
      {children}
    </th>
  );
}

function Td({ children, right, bold, muted, minus, plus, subtotal, colSpan, className = '' }) {
  const color = minus ? 'text-red-600' : plus ? 'text-teal-600' : muted ? 'text-gray-400' : 'text-gray-700';
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
    <SectionBox title={d.isCouple ? 'Revenus 2025 — D1 & D2' : 'Revenus 2025'}>
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
            <Td bold>Salaires retenus (RNI)</Td>
            <Td right bold>{e2(d.retD1)}</Td>
            {d.isCouple && <Td right bold>{e2(d.retD2)}</Td>}
          </tr>
          <Row label="PAS prélevé 2025" v1={e2(d.pasD1)} v2={e2(d.pasD2)} />
          {(p.tauxPasD1 > 0 || p.tauxPasD2 > 0) && (
            <Row label="Taux PAS effectif" v1={fmtTaux(p.tauxPasD1)} v2={fmtTaux(p.tauxPasD2)} />
          )}
          {(p.peroD1 > 0 || p.peroD2 > 0) && (
            <Row label="PERO — déjà inclus dans 1AJ" v1={p.peroD1 > 0 ? e0(p.peroD1) : '—'} v2={p.peroD2 > 0 ? e0(p.peroD2) : '—'} />
          )}
          {d.foncierBrut > 0 && <>
            <tr>
              <td colSpan={d.isCouple ? 3 : 2} className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
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
    { label: 'Assurance-vie',              d1: p.avD1,         d2: p.avD2         },
    { label: 'PERCO / PER',               d1: p.percoD1,      d2: p.percoD2      },
    { label: 'Crypto (wallet)',            d1: p.cryptoD1,     d2: p.cryptoD2     },
  ].filter(r => (r.d1 || 0) + (r.d2 || 0) > 0);

  if (rows.length === 0) return null;

  const totalD1 = rows.reduce((s, r) => s + (r.d1 || 0), 0);
  const totalD2 = rows.reduce((s, r) => s + (r.d2 || 0), 0);

  return (
    <SectionBox title="Épargne & placements">
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

  const D1_FIELDS = ['livretAD1','lddsD1','lepD1','livretPlusD1','pelD1','peaD1','avD1','percoD1','cryptoD1'];
  const D2_FIELDS = ['livretAD2','lddsD2','lepD2','livretPlusD2','pelD2','peaD2','avD2','percoD2','cryptoD2'];

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

function RniTable({ d }) {
  return (
    <SectionBox title="Étape 1 — Du brut imposable au revenu net imposable (RNI)">
      <Tbl>
        <thead>
          <tr>
            <Th wide>Élément</Th>
            <Th right>Montant</Th>
            <Th>Référence</Th>
          </tr>
        </thead>
        <tbody>
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
              <Td right bold>{e2(d.retD1)}</Td>
              <Td muted />
            </tr>
          </>}

          {d.isCouple && d.netD2 > 0 && <>
            <tr>
              <Td>Salaires nets imposables D2</Td>
              <Td right>{e2(d.netD2)}</Td>
              <Td muted>{d.brutD2 > 0 ? `Bulletin(s) (brut ${e0(d.brutD2)})` : '1AJ — cumul 2 employeurs'}</Td>
            </tr>
            <tr>
              <Td className="pl-8">{`− Abattement ${ABT.taux * 100} % frais pro D2`}</Td>
              <Td right minus>− {e2(d.abt10D2)}</Td>
              <Td muted>art. 83 3° CGI</Td>
            </tr>
            <tr className="bg-gray-50/50">
              <Td bold>= Salaires retenus D2</Td>
              <Td right bold>{e2(d.retD2)}</Td>
              <Td muted />
            </tr>
          </>}

          {d.foncierBrut > 0 && <>
            <tr>
              <Td>{d.isCouple ? 'Revenus fonciers bruts (D2)' : 'Revenus fonciers bruts'}</Td>
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
    <SectionBox title="Étape 2 — Barème progressif appliqué au quotient familial">
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

function SoldeTable({ d }) {
  const { irBrutFoyer, dec, irNetFoyer, psFoncier, totalDu, pasTotal, pasD1, pasD2, solde, isCouple } = d;
  const isRemb = solde >= 0;

  return (
    <SectionBox title="Étape 3 — IR foyer et solde">
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
          {psFoncier > 0 && <>
            <tr>
              <Td className="pl-8">+ Prélèvements sociaux 17,2 % sur foncier net</Td>
              <Td right plus>+ {e2(psFoncier)}</Td>
            </tr>
            <tr className="bg-gray-50/50">
              <Td bold>= Total dû foyer</Td>
              <Td right bold>{e2(totalDu)}</Td>
            </tr>
          </>}
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
            value={(isRemb ? '+ ' : '− ') + e2(Math.abs(solde))}
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
  const isRemb = solde >= 0;

  return (
    <SectionBox title="Partage équitable du gain PACS — qui paie quoi">
      <div className="px-5 py-2 text-[11px] text-gray-500 bg-gray-50/50 border-b border-gray-100">
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
          <tr className={`border-t-2 ${solde >= 0 ? 'bg-teal-50/60 border-teal-200' : 'bg-amber-50/60 border-amber-200'}`}>
            <td className="px-4 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">Régularisation foyer</td>
            <td className={`px-4 py-3 text-xs font-bold text-right tabular-nums whitespace-nowrap ${d.regloD1 >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>
              {d.regloD1 >= 0 ? 'récupère ' : 'verse '}{e2(Math.abs(d.regloD1))}
            </td>
            <td className={`px-4 py-3 text-xs font-bold text-right tabular-nums whitespace-nowrap ${d.regloD2 >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>
              {d.regloD2 >= 0 ? 'récupère ' : 'verse '}{e2(Math.abs(d.regloD2))}
            </td>
            <td className={`px-4 py-3 text-xs font-bold text-right tabular-nums whitespace-nowrap ${isRemb ? 'text-teal-700' : 'text-amber-700'}`}>
              {isRemb ? '+ ' : '− '}{e2(Math.abs(solde))}
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
  const { contribD1, contribD2, pasD1, pasD2, regloD1, regloD2, solde } = d;

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

// ─── Tableau 4 scénarios PER ─────────────────────────────────────────────────

// ─── Bloc zones PER par tranche ──────────────────────────────────────────────

function PerZonesBlock({ p, d, perSim }) {
  const isCouple = d.isCouple;
  const parts = p.parts || (isCouple ? 2 : 1);
  const plafondD1 = p.plafondPerD1 || 0;
  const plafondD2 = p.plafondPerD2 || 0;

  const opt = useMemo(
    () => computePerOptimumCascade(d.rniFoyer, parts, plafondD1, plafondD2, isCouple),
    [d.rniFoyer, parts, plafondD1, plafondD2, isCouple]
  );

  const simD1 = perSim?.versementD1 || 0;
  const simD2 = perSim?.versementD2 || 0;
  const hasSimState = (simD1 + simD2) > 0;

  const moduleHeader = (
    <div className="rp-section-header flex items-center gap-2 px-5 py-3 bg-teal-700 border-b border-teal-600">
      <h3 className="text-sm font-bold text-white">
        <span className="rp-module-num font-mono mr-2 opacity-70">04a</span>
        Stratégie PER — Optimum fiscal par tranche
      </h3>
    </div>
  );

  if (opt.tmiDepart <= 11) {
    return (
      <div className="rp-module rounded-2xl border border-gray-200 overflow-hidden shadow-sm print:shadow-none">
        {moduleHeader}
        <div className="p-5">
          <p className="text-xs text-gray-700">
            <strong>TMI foyer = {d.tmi}&nbsp;%</strong> — PER non recommandé.
            Le rendement fiscal insuffisant ne justifie pas l'immobilisation des fonds jusqu'à la retraite.
            Privilégier : PEA (exonération plus-values après 5 ans), assurance-vie (fiscalité allégée après 8 ans) ou livrets garantis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rp-module rounded-2xl border border-teal-200 overflow-hidden shadow-sm print:shadow-none">
      {moduleHeader}
      <div className="p-4 flex flex-col gap-3">

        {/* Zones prioritaires */}
        {opt.zones.map((z, i) => (
          <div key={i} className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">
                Zone {i + 1} — PER prioritaire · Effacement tranche {z.taux}&nbsp;% · Rendement {z.taux}&nbsp;%
              </span>
              {z.partial && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Plafond épuisé avant effacement complet</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-teal-600 uppercase tracking-wide">Fraction imposée à {z.taux}&nbsp;%</p>
                <p className="text-sm font-bold text-teal-900 tabular-nums">{e0(z.fractionFoyer)}</p>
                {z.partial && <p className="text-[10px] text-amber-600 mt-0.5">Couverture plafond&nbsp;: {e0(z.versement)}</p>}
              </div>
              <div>
                <p className="text-[10px] text-teal-600 uppercase tracking-wide">Versement PER cible</p>
                <p className="text-sm font-bold text-teal-900 tabular-nums">{e0(z.versement)}</p>
              </div>
              <div>
                <p className="text-[10px] text-teal-600 uppercase tracking-wide">Économie IR</p>
                <p className="text-sm font-semibold text-green-700 tabular-nums whitespace-nowrap">{e0(z.versement)} × {z.taux}&nbsp;% = <strong>{e0(z.economie)}</strong></p>
              </div>
            </div>
            {isCouple && i === opt.zones.length - 1 && (plafondD1 > 0 || plafondD2 > 0) && (
              <p className="mt-2 text-[11px] text-teal-700 border-t border-teal-200 pt-2">
                Répartition suggérée&nbsp;:{' '}
                <strong>{opt.prioritaire === 'D1' ? 'D1' : 'D2'}&nbsp;{opt.prioritaire === 'D1' ? e0(opt.optimumD1) : e0(opt.optimumD2)}</strong>
                <span className="text-[9px] bg-teal-200 text-teal-800 px-1 py-0.5 rounded font-semibold ml-1">prioritaire</span>
                {' · '}
                <strong>{opt.prioritaire === 'D1' ? 'D2' : 'D1'}&nbsp;{opt.prioritaire === 'D1' ? e0(opt.optimumD2) : e0(opt.optimumD1)}</strong>
              </p>
            )}
          </div>
        ))}

        {/* Récapitulatif */}
        <div className="rounded-xl border border-teal-300 bg-teal-100/70 px-4 py-3 flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <p className="text-[10px] text-teal-700 uppercase tracking-wide font-semibold">Versement optimum</p>
            <p className="text-sm font-bold text-teal-900 tabular-nums">{e0(opt.optimumTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] text-teal-700 uppercase tracking-wide font-semibold">Économie IR réelle</p>
            <p className="text-sm font-bold text-green-700 tabular-nums">{e0(opt.economieOptimum)}</p>
          </div>
          <div>
            <p className="text-[10px] text-teal-700 uppercase tracking-wide font-semibold">Effort net réel</p>
            <p className="text-sm font-bold text-teal-900 tabular-nums">{e0(opt.effortNet)}</p>
          </div>
          <div>
            <p className="text-[10px] text-teal-700 uppercase tracking-wide font-semibold">Rendement fiscal</p>
            <p className="text-sm font-bold text-teal-900 tabular-nums">{opt.rendementMoyen}&nbsp;%</p>
          </div>
        </div>

        {/* Zone résiduelle 11% */}
        {opt.capaciteResiduelle > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2">
              Zone PER à rendement réduit — Tranche 11&nbsp;% atteinte
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3">
              <div>
                <p className="text-[10px] text-amber-600 uppercase tracking-wide">Capacité PER résiduelle</p>
                <p className="text-sm font-bold text-amber-900 tabular-nums">
                  {e0(opt.capaciteResiduelle)} <span className="text-amber-500 font-normal text-[10px]">({e0(opt.plafondTotal)} − {e0(opt.optimumTotal)})</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-amber-600 uppercase tracking-wide">Rendement PER résiduel</p>
                <p className="text-sm font-semibold text-amber-800">11&nbsp;% seulement</p>
              </div>
            </div>
            <div className="border-t border-amber-200 pt-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-800">Alternatives à privilégier pour cet excédent&nbsp;:</p>
              <p className="text-[11px] text-amber-700">→ <strong>PEA</strong>&nbsp;: pas d'économie IR immédiate, mais exonération des plus-values après 5 ans et meilleure liquidité</p>
              <p className="text-[11px] text-amber-700">→ <strong>Assurance-vie</strong>&nbsp;: fiscalité allégée après 8 ans, disponibilité des fonds</p>
              <p className="text-[11px] text-amber-700">→ <strong>LDDS / Livret A</strong>&nbsp;: liquidité totale, rendement garanti (mais faible)</p>
            </div>
          </div>
        )}

        {/* Simulation active depuis le Simulateur */}
        {hasSimState && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-2">Versements retenus dans le Simulateur</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {isCouple ? (
                <>
                  <div>
                    <p className="text-[10px] text-blue-600 uppercase">D1 versé</p>
                    <p className="text-xs font-bold text-blue-900 tabular-nums">{e0(simD1)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-600 uppercase">D2 versé</p>
                    <p className="text-xs font-bold text-blue-900 tabular-nums">{e0(simD2)}</p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-[10px] text-blue-600 uppercase">Versement simulé</p>
                  <p className="text-xs font-bold text-blue-900 tabular-nums">{e0(simD1)}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-blue-600 uppercase">Économie IR (barème réel)</p>
                <p className="text-xs font-bold text-green-700 tabular-nums">
                  {e0(Math.max(0, d.irNetFoyer - calcIR(Math.max(0, d.rniFoyer - simD1 - simD2), parts, isCouple)))}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function PerScenariosTable({ p, d }) {
  const isCouple = d.isCouple;
  const plafD1 = p.plafondPerD1 || 0;
  const plafD2 = p.plafondPerD2 || 0;
  const irAvant = d.irNetFoyer;
  const parts = p.parts || (isCouple ? 2 : 1);

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
    scenarios = [
      { label: 'A — Statu quo',  desc: 'Aucun versement',          ...calcScen(0) },
      { label: 'B — D1 seul',    desc: `Plafond D1 (${e0(plafD1)})`,  ...calcScen(plafD1) },
      { label: 'C — D2 seul',    desc: `Plafond D2 (${e0(plafD2)})`,  ...calcScen(plafD2) },
      { label: 'D — D1 + D2',   desc: `Total (${e0(plafD1 + plafD2)})`, ...calcScen(plafD1 + plafD2) },
    ];
  } else if (!isCouple && plafD1 > 0) {
    const t1 = Math.round((plafD1 / 3) / 100) * 100;
    const t2 = Math.round((plafD1 * 2 / 3) / 100) * 100;
    scenarios = [
      { label: 'A — Statu quo',  desc: 'Aucun versement',      ...calcScen(0) },
      { label: 'B — Partiel 33%', desc: `${e0(t1)} versés`,    ...calcScen(t1) },
      { label: 'C — Partiel 66%', desc: `${e0(t2)} versés`,    ...calcScen(t2) },
      { label: 'D — Plafond',    desc: `${e0(plafD1)} versés`, ...calcScen(plafD1) },
    ];
  } else return null;

  const bestScen = scenarios.reduce((best, s) => s.economie > best.economie ? s : best, scenarios[0]);

  return (
    <div className="rp-module rounded-2xl border border-gray-200 overflow-hidden shadow-sm print:shadow-none">
      <div className="rp-section-header flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-800">
          <span className="rp-module-num text-teal-600 font-mono mr-2">04b</span>
          Comparaison de scénarios PER — barème réel 2025
        </h3>
      </div>
      <div className="overflow-x-auto">
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
                    <span className="text-gray-400 ml-2 text-[10px]">{s.desc}</span>
                    {isBest && <span className="ml-2 text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-semibold">Optimal</span>}
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
      </div>
      <p className="px-4 py-2.5 text-[11px] text-gray-500 italic border-t border-gray-50">
        Économie calculée sur le barème progressif réel — souvent inférieure à TMI × versement car la déduction traverse plusieurs tranches.
      </p>
    </div>
  );
}

// ─── Calendrier d'exécution PER ──────────────────────────────────────────────

function PerCalendarBlock({ p, d }) {
  const isCouple = d.isCouple;
  const plafD1 = p.plafondPerD1 || 0;
  const plafD2 = p.plafondPerD2 || 0;
  const total = plafD1 + plafD2;
  if (total === 0) return null;

  const showD2 = isCouple && plafD2 > 0;
  const showD1 = plafD1 > 0;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-teal-200 bg-teal-50/30 overflow-hidden">
      <div className="px-4 py-2 border-b border-teal-200 bg-teal-100/50">
        <p className="text-[10px] font-bold text-teal-800 uppercase tracking-wide">Calendrier d'exécution — versements PER avant 31/12</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-[10px] font-semibold text-teal-700 uppercase tracking-wide">Rythme</th>
            {showD1 && <th className="px-3 py-2 text-right text-[10px] font-semibold text-teal-700 uppercase tracking-wide whitespace-nowrap">{isCouple ? 'D1' : 'Montant'}</th>}
            {showD2 && <th className="px-3 py-2 text-right text-[10px] font-semibold text-teal-700 uppercase tracking-wide whitespace-nowrap">D2</th>}
            {isCouple && (showD1 || showD2) && <th className="px-4 py-2 text-right text-[10px] font-semibold text-teal-700 uppercase tracking-wide whitespace-nowrap">Total</th>}
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'Mensuel (× 12)', div: 12, suffix: '/mois' },
            { label: 'Trimestriel (× 4)', div: 4, suffix: '/trim.' },
          ].map(({ label, div, suffix }) => (
            <tr key={label} className="border-t border-teal-100">
              <td className="px-4 py-2 text-teal-800 font-medium">{label}</td>
              {showD1 && <td className="px-3 py-2 text-right tabular-nums text-teal-800">{e0(plafD1 / div)}{suffix}</td>}
              {showD2 && <td className="px-3 py-2 text-right tabular-nums text-teal-800">{e0(plafD2 / div)}{suffix}</td>}
              {isCouple && (showD1 || showD2) && <td className="px-4 py-2 text-right tabular-nums font-semibold text-teal-800">{e0(total / div)}{suffix}</td>}
            </tr>
          ))}
          <tr className="border-t border-teal-200 bg-teal-100/40">
            <td className="px-4 py-2.5 text-teal-900 font-bold">Versement unique (décembre)</td>
            {showD1 && <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-teal-900">{e0(plafD1)}</td>}
            {showD2 && <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-teal-900">{e0(plafD2)}</td>}
            {isCouple && (showD1 || showD2) && <td className="px-4 py-2.5 text-right tabular-nums font-bold text-teal-900">{e0(total)}</td>}
          </tr>
        </tbody>
      </table>
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
  const plafondBrutD1 = Math.max(brut10D1, MIN_PLAFOND_PER);
  const plafondBrutD2 = Math.max(brut10D2, MIN_PLAFOND_PER);

  const irAvant = d.irNetFoyer;
  const totalVersionable = plafondPerD1 + plafondPerD2;
  const irApres = calcIR(
    Math.max(0, d.rniFoyer - totalVersionable),
    p.parts || (isCouple ? 2 : 1),
    isCouple
  );
  const economie = Math.max(0, irAvant - irApres);
  const effort = totalVersionable - economie;
  const rendement = Math.round((economie / Math.max(1, totalVersionable)) * 100);

  return (
    <SectionBox title="Plafonds PER disponibles — calcul déclarant par déclarant" num="04">
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
            <Td bold>= Plafond disponible net (versements volontaires)</Td>
            <Td right bold plus>{e0(plafondPerD1)}</Td>
            {isCouple && <Td right bold plus>{e0(plafondPerD2)}</Td>}
            <Td muted>{isCouple ? '6NS / 6NT' : '6NS'}</Td>
          </tr>
          {totalVersionable > 0 && <>
            <tr>
              <td colSpan={isCouple ? 4 : 3} className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
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
  if ((p.plafondPerD1 || 0) > 0) {
    cases.push({ code: '6NS', desc: 'Versements PER volontaires D1 (plafond disponible)', montant: e0(p.plafondPerD1), italic: true });
  }
  if (isCouple && (p.plafondPerD2 || 0) > 0) {
    cases.push({ code: '6NT', desc: 'Versements PER volontaires D2 (plafond disponible)', montant: e0(p.plafondPerD2), italic: true });
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
    <SectionBox title="Cases déclaratives — formulaire 2042" num="05">
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
              <Td bold><code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{c.code}</code></Td>
              <Td className={c.italic ? 'italic' : ''}>{c.desc}</Td>
              <Td right>{c.montant}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
      <p className="px-4 py-2.5 text-[11px] text-gray-500 italic border-t border-gray-50">
        Les cases en italique sont des <strong>opportunités de versement</strong> à effectuer avant le 31/12 — pas des montants déjà versés.
      </p>
    </SectionBox>
  );
}

// ─── Module 06 : Vigilances & obligations ────────────────────────────────────

function VigilancesModule({ p, d }) {
  const isCouple = d.isCouple;
  const totalVersionable = (p.plafondPerD1 || 0) + (p.plafondPerD2 || 0);
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
    <SectionBox title="Vigilances & obligations" num="06">
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
    <SectionBox title="PEA & Assurance-vie" num="07">
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Plan d'épargne en actions (PEA)</p>
          {hasPea ? (
            <>
              <p className="text-sm font-semibold text-teal-700 mb-2">PEA ouvert ✓</p>
              {peaD1 > 0 && <p className="text-xs text-gray-600">D1 : <span className="font-semibold tabular-nums">{e0(peaD1)}</span> — plafond restant : {e0(150000 - peaD1)}</p>}
              {isCouple && peaD2 > 0 && <p className="text-xs text-gray-600 mt-1">D2 : <span className="font-semibold tabular-nums">{e0(peaD2)}</span> — plafond restant : {e0(150000 - peaD2)}</p>}
              <p className="text-[11px] text-teal-600 mt-2 leading-snug">Exonéré IR sur plus-values après 5 ans (art. 150-0 A CGI).</p>
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
              <p className="text-[11px] text-teal-600 mt-2 leading-snug">Abattement {isCouple ? '4 600 € / 4 600 €' : '4 600 €'}/an sur gains après 8 ans.</p>
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

// ─── Module 08 : Réallocation patrimoniale D2 ────────────────────────────────

function ReallocationModule({ p }) {
  if (p.mode !== 'couple') return null;

  const peaD2 = p.peaD2 || 0;
  const avD2 = p.avD2 || 0;
  const liquidD2 = (p.livretAD2 || 0) + (p.lddsD2 || 0) + (p.lepD2 || 0) + (p.livretPlusD2 || 0) + (p.pelD2 || 0);

  // Only show if D2 has meaningful liquid savings and lacks key envelopes
  if (liquidD2 < 3000 || (peaD2 > 0 && avD2 > 0)) return null;

  const options = [];
  if (peaD2 === 0) {
    options.push({
      label: 'Ouvrir PEA D2',
      montant: '1 € minimum',
      detail: 'Démarre l\'horloge fiscale 5 ans. Versements progressifs jusqu\'à 150 000 €. Plus-values exonérées IR après 5 ans.',
      couleur: 'teal',
    });
  }
  if (avD2 === 0) {
    options.push({
      label: 'Ouvrir AV D2',
      montant: '1 € minimum',
      detail: 'Antériorité fiscale 8 ans, abattement 4 600 €/an sur gains, transmission avantageuse (152 500 € par bénéficiaire hors succession).',
      couleur: 'teal',
    });
  }
  options.push({
    label: 'Arbitrage progressif (DCA)',
    montant: `${e0(liquidD2 * 0.5)} sur 12 mois`,
    detail: 'Réduire progressivement l\'exposition aux livrets réglementés (taux variable) vers des enveloppes à long terme.',
    couleur: 'gray',
  });

  return (
    <SectionBox title="Réallocation D2 — optimiser l'épargne liquide" num="08b">
      <div className="px-5 py-3 text-xs text-gray-600 bg-gray-50/50 border-b border-gray-100">
        D2 dispose de <strong>{e0(liquidD2)}</strong> d'épargne liquide sur livrets (rendement brut ~3 %, soumis aux PS 17,2 %)
        {peaD2 === 0 ? ', sans PEA ouvert' : ''}
        {avD2 === 0 ? ' et sans assurance-vie' : ''}.
        {' '}Une réallocation améliore le rendement net et la fiscalité à long terme.
      </div>
      <Tbl>
        <thead>
          <tr>
            <Th wide>Stratégie</Th>
            <Th right>Montant</Th>
            <Th>Avantage</Th>
          </tr>
        </thead>
        <tbody>
          {options.map((o, i) => (
            <tr key={i}>
              <Td bold>{o.label}</Td>
              <Td right>{o.montant}</Td>
              <Td muted>{o.detail}</Td>
            </tr>
          ))}
        </tbody>
      </Tbl>
    </SectionBox>
  );
}

// ─── Module 09 : Feuille de route ────────────────────────────────────────────

function FeuilleRouteModule({ p, d }) {
  const isCouple = d.isCouple;
  const peaD1 = p.peaD1 || 0;
  const peaD2 = p.peaD2 || 0;
  const epargneLiquide = p.epargneLiquide || 0;

  const fParts = p.parts || (isCouple ? 2 : 1);
  const opt = computePerOptimumCascade(d.rniFoyer, fParts, p.plafondPerD1 || 0, p.plafondPerD2 || 0, isCouple);

  const priorities = [];

  if (opt.optimumTotal > 0 && opt.tmiDepart > 11) {
    priorities.push({
      title: 'Versement PER avant 31/12/2025',
      levier: `Efface la tranche ${opt.tmiDepart} % — économie IR réelle : ${e0(opt.economieOptimum)} (effort net : ${e0(opt.effortNet)})`,
      gain: `${e0(opt.economieOptimum)} d'économie IR`,
      deadline: '31 décembre 2025',
      color: 'teal',
    });
  }
  if (peaD1 === 0 && peaD2 === 0) {
    priorities.push({
      title: 'Ouvrir un PEA (ou deux pour le couple)',
      levier: 'Démarrer l\'horloge fiscale 5 ans — exonération IR future',
      gain: 'Exonération plus-values à terme',
      deadline: 'Dès que possible',
      color: 'teal',
    });
  }
  if (d.solde < -500) {
    priorities.push({
      title: 'Ajuster le taux PAS',
      levier: 'Éviter le complément à payer en septembre',
      gain: `${e0(Math.abs(d.solde))} de solde à régulariser`,
      deadline: 'Avant le 1er juillet',
      color: 'amber',
    });
  }
  if (epargneLiquide > 10000) {
    priorities.push({
      title: 'Réallouer l\'épargne liquide dormante',
      levier: 'Investir le surplus en PEA ou AV pour améliorer le rendement net',
      gain: `${e0(epargneLiquide)} disponibles`,
      deadline: 'Avant fin d\'année',
      color: 'gray',
    });
  }

  const displayed = priorities.slice(0, 4);

  const colorMap = {
    teal:  { border: 'border-teal-200',  bg: 'bg-teal-50',  num: 'bg-teal-600',  text: 'text-teal-800',  sub: 'text-teal-600' },
    amber: { border: 'border-amber-200', bg: 'bg-amber-50', num: 'bg-amber-500', text: 'text-amber-800', sub: 'text-amber-600' },
    gray:  { border: 'border-gray-200',  bg: 'bg-gray-50',  num: 'bg-gray-500',  text: 'text-gray-800',  sub: 'text-gray-600' },
  };

  return (
    <SectionBox title="Feuille de route 2026 — priorités d'action" num="09">
      <div className="p-4 flex flex-col gap-3">
        {displayed.length === 0 ? (
          <p className="text-xs text-gray-500 py-2">Aucune priorité identifiée avec les données disponibles.</p>
        ) : displayed.map((pr, i) => {
          const c = colorMap[pr.color] || colorMap.gray;
          return (
            <div key={i} className={`rounded-xl border ${c.border} ${c.bg} p-4 flex gap-3 items-start`}>
              <div className={`shrink-0 w-8 h-8 rounded-full ${c.num} text-white text-xs font-bold flex items-center justify-center`}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-bold ${c.text}`}>{pr.title}</p>
                <p className={`text-xs ${c.sub} mt-0.5`}>{pr.levier}</p>
                <div className="flex flex-wrap gap-4 mt-2">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Impact estimé</p>
                    <p className="text-xs font-semibold text-gray-800">{pr.gain}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Deadline</p>
                    <p className="text-xs font-semibold text-gray-800">{pr.deadline}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionBox>
  );
}

// ─── Module 10 : Revenus fonciers détaillés ───────────────────────────────────

function FoncierModule({ d }) {
  const { foncierBrut, foncierAbt, foncierNet, isMicro, psFoncier } = d;
  const total = foncierNet + psFoncier;

  return (
    <SectionBox title="Revenus fonciers — détail" num="10">
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
      <p className="px-4 py-2.5 text-[11px] text-gray-500 border-t border-gray-50">
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
  const plafondPerTotal = p.plafondPerTotal || ((p.plafondPerD1 || 0) + (p.plafondPerD2 || 0));
  const patrimoineTotal = p.patrimoineTotal || 0;
  const epargneLiquide = p.epargneLiquide || 0;

  const rows = [
    { label: 'RNI foyer 2025',                      value: e0(d.rniFoyer) },
    { label: 'Quotient familial',                   value: `${e0(d.quotient)} / part (${d.parts} part${d.parts > 1 ? 's' : ''})` },
    { label: 'TMI',                                  value: `${d.tmi} %` },
    { label: 'IR net foyer',                         value: e0(d.irNetFoyer) },
    { label: 'PAS prélevé 2025',                     value: e0(d.pasTotal) },
    { label: 'Solde (rembours. / complément)',        value: (d.solde >= 0 ? '+ ' : '− ') + e0(Math.abs(d.solde)) },
    ...(plafondPerTotal > 0 ? [{ label: 'Plafonds PER disponibles',  value: e0(plafondPerTotal) }] : []),
    ...(patrimoineTotal > 0 ? [{ label: 'Patrimoine financier total', value: e0(patrimoineTotal) }] : []),
    ...(epargneLiquide > 0  ? [{ label: 'Épargne liquide',           value: e0(epargneLiquide) }] : []),
  ];

  return (
    <SectionBox title="Récapitulatif chiffres clés" num="12">
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
        <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full print:hidden">
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

  const d = useMemo(() => computeData(profile), [profile]);

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
  const isRemb     = d.solde >= 0;
  const isCouple   = d.isCouple;
  const plafondPerTotal = p.plafondPerTotal || ((p.plafondPerD1 || 0) + (p.plafondPerD2 || 0));
  const perSimulation = state.perSimulation ?? {};

  // Cascade PER — optimum fiscal (source de vérité pour tout le rapport)
  const parts = p.parts || (isCouple ? 2 : 1);
  const perOpt = useMemo(
    () => computePerOptimumCascade(d.rniFoyer, parts, p.plafondPerD1 || 0, p.plafondPerD2 || 0, isCouple),
    [d.rniFoyer, parts, p.plafondPerD1, p.plafondPerD2, isCouple]
  );

  return (
    <>
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

      <div className="flex flex-col gap-5">

        {/* ── Header print ── */}
        <div className="rp-header hidden">
          <div>
            <p className="rp-header-title">Rapport Fiscal — Déclaration 2025 · Feuille de route 2026</p>
            <p className="rp-header-meta">Coach Fiscal · Généré le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · Confidentiel</p>
          </div>
          <p className="rp-header-meta">Document personnel — ne pas diffuser</p>
        </div>

        {/* ── Header écran ── */}
        <div className="print:hidden">
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape 4 / 5</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Rapport fiscal — Déclaration 2025</h1>
          <p className="text-sm text-gray-500 mt-1">
            {d.hasAi
              ? 'Profil enrichi IA — synthèse du foyer, calculs détaillés, analyse complète.'
              : 'Synthèse du foyer + calculs détaillés. Enrichissez avec l\'IA pour l\'analyse complète.'}
          </p>
        </div>

        {/* ── Banner non enrichi ── */}
        {!d.hasAi && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3 print:hidden">
            <Wand2 size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Profil non encore enrichi</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
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

        {/* ── Section 01 : Essentiel en un coup d'œil ── */}
        {d.rniFoyer > 0 && (
          <>
            <div className="rp-section-sep flex items-center gap-2 border-b border-gray-200 pb-3">
              <span className="rp-section-sep-num rp-module-num text-teal-600 font-mono font-bold text-base">01</span>
              <h2 className="rp-section-sep-label text-sm font-bold text-gray-700 uppercase tracking-wider">Essentiel en un coup d'œil</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label="IR foyer 2025 dû"
                value={e0(d.totalDu)}
                sub={`IR net ${e0(d.irNetFoyer)}${d.psFoncier > 0 ? ` + PS foncier ${e0(d.psFoncier)}` : ''}`}
                color="gray"
              />
              <KpiCard
                label={isRemb ? 'Remboursement attendu' : 'Complément à payer'}
                value={(isRemb ? '+ ' : '− ') + e0(Math.abs(d.solde))}
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
          </>
        )}

        {/* ── Section 02 : Synthèse du foyer ── */}
        {d.rniFoyer > 0 && (
          <>
            <div className="rp-section-sep flex items-center gap-2 border-b border-gray-200 pb-3 mt-2">
              <span className="rp-section-sep-num rp-module-num text-teal-600 font-mono font-bold text-base">02</span>
              <h2 className="rp-section-sep-label text-sm font-bold text-gray-700 uppercase tracking-wider">Synthèse du foyer</h2>
            </div>
            <RevenusTable d={d} p={p} />
            <EpargneTable p={p} />
            <PatrimoineDesequilibreBlock p={p} />
          </>
        )}

        {/* ── Section 03 : Calcul de l'impôt ── */}
        {d.rniFoyer > 0 && (
          <>
            <div className="rp-section-sep flex items-center gap-2 border-b border-gray-200 pb-3 mt-2">
              <span className="rp-section-sep-num rp-module-num text-teal-600 font-mono font-bold text-base">03</span>
              <h2 className="rp-section-sep-label text-sm font-bold text-gray-700 uppercase tracking-wider">Calcul de l'impôt — Revenus 2025</h2>
            </div>

            <ProseCard color="gray">
              Le calcul de l'IR se déroule en trois étapes : <strong>(1)</strong> abattement forfaitaire de {ABT.taux * 100}&nbsp;% sur les salaires nets imposables
              (plancher {e0(ABT.minimum)}, plafond {e0(ABT.maximum)} — art. 83 3° CGI),{' '}
              <strong>(2)</strong> application du barème progressif sur le quotient familial,{' '}
              <strong>(3)</strong> décote si l'IR brut est inférieur à{' '}
              {isCouple ? `${DECOTE.seuil_couple.toLocaleString('fr-FR')} € (couple)` : `${DECOTE.seuil_celibataire.toLocaleString('fr-FR')} € (célibataire)`}.
            </ProseCard>

            <RniTable d={d} />
            {d.steps.length > 0 && <BaremeTable d={d} />}
            {d.tmi > 0 && <TmiProseBlock d={d} />}
            <SoldeTable d={d} />
            {isCouple && d.gainPacs > 0 && <GainPacsTable d={d} />}
            {isCouple && d.gainPacs > 0 && <AccordCoupleProseBlock d={d} />}
          </>
        )}

        {/* ── Section 04 : Stratégie PER ── */}
        {(plafondPerTotal > 0 || (p.plafondPerD1 || 0) > 0 || (p.plafondPerD2 || 0) > 0) && (
          <>
            <div className="rp-section-sep flex items-center gap-2 border-b border-gray-200 pb-3 mt-2">
              <span className="rp-section-sep-num rp-module-num text-teal-600 font-mono font-bold text-base">04</span>
              <h2 className="rp-section-sep-label text-sm font-bold text-gray-700 uppercase tracking-wider">Stratégie PER — Plafonds & scénarios</h2>
            </div>

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

        {/* ── Section 05 : Cases déclaratives ── */}
        <CasesModule p={p} d={d} />

        {/* ── Section 06 : Vigilances ── */}
        <VigilancesModule p={p} d={d} />

        {/* ── Section 07 : PEA & AV ── */}
        <PeaAvModule p={p} />

        {/* ── Section 08 : Réallocation D2 (couples seulement) ── */}
        <ReallocationModule p={p} />

        {/* ── Section 09 : Conditionnels ── */}
        {d.foncierBrut > 0 && <FoncierModule d={d} />}

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

        {/* ── Sections IA ── */}
        {aiSections.length > 0 && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <Sparkles size={14} className="text-violet-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Analyse IA</h2>
            </div>
            {aiSections.map((s, i) => <AiSectionCard key={i} section={s} />)}
          </div>
        )}

        {/* ── Section 09 : Feuille de route ── */}
        <FeuilleRouteModule p={p} d={d} />

        {/* ── Section 12 : Récapitulatif ── */}
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

        {/* ── Actions bas ── */}
        <div className="flex gap-3 flex-wrap pt-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={handleExportPDF}>
            <Download size={14} /> Exporter en PDF
          </Button>
        </div>

      </div>
    </>
  );
}
