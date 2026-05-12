/**
 * Parser centralisé — source de vérité unique pour toutes les extractions.
 * parseProfile(text) → objet structuré complet.
 *
 * Format des montants dans le profil : "45 161,77 €"
 *   - séparateur milliers = espace (ou   insécable de toLocaleString)
 *   - séparateur décimal  = virgule
 *   - les regex capturent ([\d\s,]+) ; parseInt s'arrête naturellement à la virgule
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Entier depuis "45 161,77 €" → 45161. parseInt s'arrête à la virgule. */
function n(src, rx) {
  const m = src.match(rx);
  if (!m?.[1]) return 0;
  const v = parseInt(m[1].replace(/[\s ]/g, ''), 10);
  return isNaN(v) ? 0 : v;
}

/** Flottant depuis "11,80" ou "11.80" → 11.8. */
function f(src, rx) {
  const m = src.match(rx);
  if (!m?.[1]) return 0;
  const v = parseFloat(m[1].replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

/** Texte brut du premier groupe. */
function s(src, rx) {
  return src.match(rx)?.[1]?.trim() ?? '';
}

/** Format "OUI ~1 014,77 €" → 1014. parseInt s'arrête à la virgule. */
function oui(src, rx) {
  const m = src.match(rx);
  if (!m?.[1]) return 0;
  const v = parseInt(m[1].replace(/[\s ]/g, ''), 10);
  return isNaN(v) ? 0 : v;
}

import { getTMI, baseIRFoyer, abattement10 } from './taxCalculator';

// ─── Section extractor ────────────────────────────────────────────────────────

/**
 * Retourne le texte entre un header "== ... ==" et le suivant (ou fin de fichier).
 * Exemple : section(text, '== REVENUS 2025 — DÉCLARANT 1 ==')
 */
function section(text, header) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped + '\\s*([\\s\\S]*?)(?=\\n==|$)');
  return text.match(rx)?.[1] ?? '';
}

// ─── parseProfile ─────────────────────────────────────────────────────────────

export function parseProfile(text) {
  if (!text) return emptyProfile();

  // ── Mode ────────────────────────────────────────────────────────────────────
  // "FOYER 2025" dans le titre OU "Mode : Déclaration commune" OU "DÉCLARANT 2"
  const mode = /FOYER 2025|Mode\s*:\s*Déclaration commune|DÉCLARANT 2/i.test(text)
    ? 'couple' : 'solo';

  // ── Sections ─────────────────────────────────────────────────────────────────
  // Solo : "== REVENUS 2025 ==" et "== ÉPARGNE ET PLACEMENTS =="
  // Couple : sections spécifiques D1 / D2
  const secRevD1 = mode === 'couple'
    ? section(text, '== REVENUS 2025 — DÉCLARANT 1 ==')
    : section(text, '== REVENUS 2025 ==');

  const secRevD2 = mode === 'couple'
    ? section(text, '== REVENUS 2025 — DÉCLARANT 2 ==')
    : '';

  const secEpD1 = mode === 'couple'
    ? section(text, '== ÉPARGNE — DÉCLARANT 1 ==')
    : section(text, '== ÉPARGNE ET PLACEMENTS ==');

  const secEpD2 = mode === 'couple'
    ? section(text, '== ÉPARGNE — DÉCLARANT 2 ==')
    : '';

  const secSynth = section(text, '== SYNTHÈSE FISCALE FOYER ==');

  // ── SITUATION ───────────────────────────────────────────────────────────────
  const parts       = f(text, /Parts fiscales\s*:\s*([\d,\.]+)/);
  const departement = s(text, /Département\s*:\s*(\w{2,3})/);

  // ── REVENUS D1 ──────────────────────────────────────────────────────────────
  // Format : "Net imposable annuel : 45 161,77 €"
  // → ([\d\s,]+) capture "45 161,77", parseInt s'arrête à "," → 45161
  const salaireNetImposableD1  = n(secRevD1, /Net imposable annuel\s*:\s*([\d\s,]+)\s*€/);
  const salairesBrutImposableD1 = n(secRevD1, /Brut imposable annuel\s*:\s*([\d\s,]+)\s*€/);
  const pasD1     = n(secRevD1, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);
  // "Taux PAS : 11.80%" — point décimal (concaténation JS directe)
  const tauxPasD1 = f(secRevD1, /Taux PAS\s*:\s*([\d,\.]+)\s*%/);

  // "PERO D1 — cotisations 2025 : 1 260,87 € → case 6QS…"
  const peroD1 = n(text, /PERO D1[^:\n]*:\s*([\d\s,]+)\s*€/);

  // ── REVENUS D2 ──────────────────────────────────────────────────────────────
  const salaireNetImposableD2  = n(secRevD2, /Net imposable annuel\s*:\s*([\d\s,]+)\s*€/);
  const salairesBrutImposableD2 = n(secRevD2, /Brut imposable annuel\s*:\s*([\d\s,]+)\s*€/);
  const pasD2     = n(secRevD2, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);
  const tauxPasD2 = f(secRevD2, /Taux PAS\s*:\s*([\d,\.]+)\s*%/);
  const peroD2    = n(text, /PERO D2[^:\n]*:\s*([\d\s,]+)\s*€/);

  // ── RNI FOYER ───────────────────────────────────────────────────────────────
  // Couple : "Revenu net imposable total estimé : 73 550,75 €" dans secSynth
  // Solo   : fallback sur le net D1
  const rniD1    = salaireNetImposableD1;
  const rniD2    = salaireNetImposableD2;
  const rniFoyer = n(secSynth, /Revenu net imposable total estimé\s*:\s*([\d\s,]+)\s*€/)
                || (rniD1 + rniD2 || rniD1);

  // ── REVENUS FOYER ────────────────────────────────────────────────────────────
  // "Revenus fonciers : 704,96 €"  (utilise fmt, pas fmtOui)
  const revensFonciers = n(text, /Revenus fonciers\s*:\s*([\d\s,]+)\s*€/);
  const dividendes     = n(text, /Dividendes\/intérêts\s*:\s*([\d\s,]+)\s*€/);
  const revenusLoc     = n(text, /Revenus locatifs 2025\s*:\s*([\d\s,]+)\s*€/);
  const revenusCrypto  = n(text, /Revenus crypto\s*:\s*([\d\s,]+)\s*€/);

  // ── FISCAL CALCULÉ ───────────────────────────────────────────────────────────
  // "PAS total foyer 2025 : 6 350,29 €" dans secSynth
  const pasTotal = n(secSynth, /PAS total foyer 2025\s*:\s*([\d\s,]+)\s*€/)
                || (pasD1 + pasD2);

  const tmi = n(text, /TMI[^\n%]*?:\s*(\d{1,2})\s*%/i)
           || getTMI(baseIRFoyer({ salaireNetImposableD1, salaireNetImposableD2, revensFonciers, regimeFoncier: null }), parts || 1);

  const irNet         = n(text, /IR net[^:\n]*:\s*([\d\s,]+)\s*€/i)
                     || n(text, /Impôt net[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const remboursement = n(text, /Remboursement[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const solde         = remboursement > 0 ? remboursement : -irNet;

  const rfr = n(text, /RFR[^:\n]*:\s*([\d\s,]+)\s*€/i)
           || n(text, /Revenu fiscal de référence[^:\n]*:\s*([\d\s,]+)\s*€/i)
           || rniFoyer;

  // ── PER ─────────────────────────────────────────────────────────────────────
  const plafondPerD1 = n(text, /Plafond disponible.*?D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /PLAFOND.*?D1[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const plafondPerD2 = n(text, /Plafond disponible.*?D2[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /PLAFOND.*?D2[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const plafondsPrecedents = n(text, /Plafonds antérieurs[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const plafondPerTotal    = plafondPerD1 + plafondPerD2 || plafondPerD1;

  // ── ÉPARGNE D1 ──────────────────────────────────────────────────────────────
  // Format : "Livret A : OUI ~1 014,77 €"
  // → ([\d\s,]+) capture "1 014,77", parseInt → 1014
  const livretAD1    = oui(secEpD1, /Livret A\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lddsD1       = oui(secEpD1, /LDDS\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lepD1        = oui(secEpD1, /LEP\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const livretPlusD1 = oui(secEpD1, /Livret\+[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelD1        = oui(secEpD1, /PEL\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const peaD1        = oui(secEpD1, /PEA\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const avD1         = oui(secEpD1, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const cryptoD1     = oui(secEpD1, /Crypto[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  // "PER versements 2025 : 3 000 €" (fmt, pas fmtOui)
  const percoD1      = n(secEpD1, /PER versements 2025\s*:\s*([\d\s,]+)\s*€/);

  // ── ÉPARGNE D2 ──────────────────────────────────────────────────────────────
  const livretAD2    = oui(secEpD2, /Livret A\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lddsD2       = oui(secEpD2, /LDDS\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lepD2        = oui(secEpD2, /LEP\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const livretPlusD2 = oui(secEpD2, /Livret\+[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelD2        = oui(secEpD2, /PEL\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const peaD2        = oui(secEpD2, /PEA\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const avD2         = oui(secEpD2, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const cryptoD2     = oui(secEpD2, /Crypto[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const percoD2      = n(secEpD2, /PER versements 2025\s*:\s*([\d\s,]+)\s*€/);

  // ── PATRIMOINE CALCULÉ ───────────────────────────────────────────────────────
  const epargneLiquide   = livretAD1 + lddsD1 + lepD1 + livretPlusD1
                         + livretAD2 + lddsD2 + lepD2 + livretPlusD2;
  const epargneLongTerme = peaD1 + avD1 + percoD1 + pelD1 + peaD2 + avD2 + percoD2 + pelD2;
  const cryptoTotal      = cryptoD1 + cryptoD2;
  const patrimoineTotal  = epargneLiquide + epargneLongTerme + cryptoTotal;

  // Immobilier : pas dans le profil textuel standard (pas de valeur €), on met 0
  const immoTotal = 0;

  // ── FONCIER ──────────────────────────────────────────────────────────────────
  const regimeFoncier = /micro.foncier/i.test(text) ? 'micro'
                      : /régime réel/i.test(text)   ? 'reel'
                      : null;

  // ── FLAGS BOOLÉENS ────────────────────────────────────────────────────────────
  const hasCrypto              = cryptoTotal > 0 || /crypto|bitcoin|ethereum|binance|kraken|coinbase/i.test(text);
  const hasCompteEtranger      = /revolut|n26|wise|bunq|3916|compte.{0,10}étranger/i.test(text);
  const hasIndivision          = /indivision/i.test(text);
  const hasTestamentManquant   = !(/testament/i.test(text)) && /pacsé|pacs(?!\w)/i.test(text);
  const hasPelAncien           = /pel.{0,20}201[0-7]|ouvert.{0,20}201[0-7]/i.test(text);
  const hasChangementEmployeur = /changement.{0,10}employeur/i.test(text);
  const hasMultipleEmployeurs  = /plusieurs employeurs/i.test(text);

  const result = {
    mode,
    parts:       parts || 1,
    departement,

    salaireNetImposableD1, salairesBrutImposableD1, pasD1, tauxPasD1, peroD1,
    salaireNetImposableD2, salairesBrutImposableD2, pasD2, tauxPasD2, peroD2,

    rniD1, rniD2, rniFoyer, rfr,
    tmi, irNet, pasTotal, solde, remboursement,
    dividendes, revensFonciers, revenusLoc, revenusCrypto,

    livretAD1, lddsD1, lepD1, livretPlusD1, pelD1, peaD1, avD1, cryptoD1, percoD1,
    livretAD2, lddsD2, lepD2, livretPlusD2, pelD2, peaD2, avD2, cryptoD2, percoD2,

    epargneLiquide, epargneLongTerme, cryptoTotal, immoTotal, patrimoineTotal,

    regimeFoncier,
    plafondPerD1, plafondPerD2, plafondPerTotal, plafondsPrecedents,

    hasCrypto, hasCompteEtranger, hasIndivision, hasTestamentManquant,
    hasPelAncien, hasChangementEmployeur, hasMultipleEmployeurs,
  };

  return result;
}

export function emptyProfile() {
  return {
    mode: 'solo', parts: 1, departement: '',
    salaireNetImposableD1: 0, salairesBrutImposableD1: 0, pasD1: 0, tauxPasD1: 0, peroD1: 0,
    salaireNetImposableD2: 0, salairesBrutImposableD2: 0, pasD2: 0, tauxPasD2: 0, peroD2: 0,
    rniD1: 0, rniD2: 0, rniFoyer: 0, rfr: 0,
    tmi: 0, irNet: 0, pasTotal: 0, solde: 0, remboursement: 0,
    dividendes: 0, revensFonciers: 0, revenusLoc: 0, revenusCrypto: 0,
    livretAD1: 0, lddsD1: 0, lepD1: 0, livretPlusD1: 0, pelD1: 0, peaD1: 0, avD1: 0, cryptoD1: 0, percoD1: 0,
    livretAD2: 0, lddsD2: 0, lepD2: 0, livretPlusD2: 0, pelD2: 0, peaD2: 0, avD2: 0, cryptoD2: 0, percoD2: 0,
    epargneLiquide: 0, epargneLongTerme: 0, cryptoTotal: 0, immoTotal: 0, patrimoineTotal: 0,
    regimeFoncier: null,
    plafondPerD1: 0, plafondPerD2: 0, plafondPerTotal: 0, plafondsPrecedents: 0,
    hasCrypto: false, hasCompteEtranger: false, hasIndivision: false,
    hasTestamentManquant: false, hasPelAncien: false,
    hasChangementEmployeur: false, hasMultipleEmployeurs: false,
  };
}
