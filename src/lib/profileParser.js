/**
 * Parser centralisé — source de vérité unique pour toutes les extractions.
 * parseProfile(text) → objet structuré complet.
 *
 * Format des montants dans le profil : "45 161,77 €"
 *   - séparateur milliers = espace (ou   insécable de toLocaleString)
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

import { getTMI, abattement10 } from './taxCalculator';

// ─── Section extractor ────────────────────────────────────────────────────────

/**
 * Retourne le texte entre un header "== ... ==" et le suivant (ou fin de fichier).
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
  const mode = /FOYER 2025|Mode\s*:\s*Déclaration commune|DÉCLARANT 2/i.test(text)
    ? 'couple' : 'solo';

  // ── Sections ─────────────────────────────────────────────────────────────────
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

  // ── SITUATION ───────────────────────────────────────────────────────────────
  const parts       = f(text, /Parts fiscales\s*:\s*([\d,\.]+)/);
  const departement = s(text, /Département\s*:\s*(\w{2,3})/);

  // ── REVENUS D1 ──────────────────────────────────────────────────────────────
  // IMPORTANT: regex [^:]* au lieu de \s* pour gérer "(1AJ — case déclaration)"
  const salaireNetImposableD1   = n(secRevD1, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);
  const salairesBrutImposableD1 = n(secRevD1, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);
  const pasD1     = n(secRevD1, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);
  const tauxPasD1 = f(secRevD1, /Taux PAS\s*:\s*([\d,\.]+)\s*%/);
  const peroD1    = n(text, /PERO D1[^:\n]*:\s*([\d\s,]+)\s*€/)
                 || n(text, /PERO[^D][^:\n]*:\s*([\d\s,]+)\s*€/);

  // ── REVENUS D2 ──────────────────────────────────────────────────────────────
  const salaireNetImposableD2   = n(secRevD2, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);
  const salairesBrutImposableD2 = n(secRevD2, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/);
  const pasD2     = n(secRevD2, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);
  const tauxPasD2 = f(secRevD2, /Taux PAS\s*:\s*([\d,\.]+)\s*%/);
  const peroD2    = n(text, /PERO D2[^:\n]*:\s*([\d\s,]+)\s*€/);

  // ── RNI (post-abattement 10%) ─────────────────────────────────────────────
  // Cherche "RNI D1 après abattement..." ou "RNI D1 (après abat. salaires) :"
  // Sinon calcul par abattement10
  const rniD1 = n(text, /RNI D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
             || abattement10(salaireNetImposableD1);

  const rniD2 = n(text, /RNI D2[^:\n]*:\s*([\d\s,]+)\s*€/i)
             || abattement10(salaireNetImposableD2);

  // ── REVENUS FOYER ────────────────────────────────────────────────────────────
  const revensFonciers = n(text, /Revenus fonciers\s*:\s*([\d\s,]+)\s*€/);
  const dividendes     = n(text, /Dividendes\/intérêts\s*:\s*([\d\s,]+)\s*€/);
  const revenusLoc     = n(text, /Revenus locatifs 2025\s*:\s*([\d\s,]+)\s*€/);
  const revenusCrypto  = n(text, /Revenus crypto\s*:\s*([\d\s,]+)\s*€/);
  const foncierNet     = n(text, /fonciers nets imposables\s*:\s*([\d\s,]+)\s*€/i);

  // ── RNI FOYER ───────────────────────────────────────────────────────────────
  const rniFoyer = n(text, /RNI FOYER TOTAL[^:\n]*:\s*([\d\s,]+)\s*€/i)
                || n(text, /RNI total[^:\n]*:\s*([\d\s,]+)\s*€/i)
                || n(text, /Revenu net imposable total estimé\s*:\s*([\d\s,]+)\s*€/)
                || (rniD1 + rniD2 + foncierNet)
                || rniD1;

  // ── FISCAL ───────────────────────────────────────────────────────────────────
  const pasTotal = n(text, /PAS total foyer 2025\s*:\s*([\d\s,]+)\s*€/)
                || (pasD1 + pasD2)
                || n(text, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);

  // TMI depuis le texte (profil V5 ou enrichissement IA) ou calculé
  const tmi = n(text, /TMI[^\n%]*?:\s*(\d{1,2})\s*%/i)
           || getTMI(rniFoyer, parts || 1);

  // IR net, total dû, remboursement — présents après enrichissement IA
  const irNet         = n(text, /IR net[^:\n]*:\s*([\d\s,]+)\s*€/i)
                     || n(text, /Impôt net[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const totalDu       = n(text, /TOTAL DÛ[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const remboursement = n(text, /REMBOURSEMENT[^:\n]*:\s*\+?\s*([\d\s,]+)\s*€/i)
                     || n(text, /[Rr]emboursement[^:\n]*:\s*\+?\s*([\d\s,]+)\s*€/);
  const gainPacs      = n(text, /GAIN DU PACS[^:\n]*:\s*([\d\s,]+)\s*€/i)
                     || n(text, /gain.*?quotient[^:\n]*:\s*([\d\s,]+)\s*€/i);

  const solde = totalDu > 0 && pasTotal > 0
    ? pasTotal - totalDu
    : remboursement > 0 ? remboursement : 0;

  // RFR : depuis texte ou fallback RNI foyer
  const rfr = n(text, /RFR[^:\n]*:\s*([\d\s,]+)\s*€/i)
           || n(text, /Revenu fiscal de référence[^:\n]*:\s*([\d\s,]+)\s*€/i)
           || rniFoyer;

  // ── PER ─────────────────────────────────────────────────────────────────────
  const plafondPerD1 = n(text, /PLAFOND DISPONIBLE D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /Plafond disponible.*?D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /PLAFOND DISPONIBLE\s*:\s*([\d\s,]+)\s*€/i);
  const plafondPerD2 = n(text, /PLAFOND DISPONIBLE D2[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /Plafond disponible.*?D2[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const plafondsPrecedents = n(text, /Plafonds antérieurs[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const plafondPerTotal    = plafondPerD1 + plafondPerD2 || plafondPerD1;

  // ── ÉPARGNE D1 ──────────────────────────────────────────────────────────────
  const livretAD1    = oui(secEpD1, /Livret A\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lddsD1       = oui(secEpD1, /LDDS\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lepD1        = oui(secEpD1, /LEP\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const livretPlusD1 = oui(secEpD1, /Livret\+[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelD1        = oui(secEpD1, /PEL\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const peaD1        = oui(secEpD1, /PEA\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const avD1         = oui(secEpD1, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const cryptoD1     = oui(secEpD1, /Crypto[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const percoD1      = n(secEpD1,   /PER versements 2025\s*:\s*([\d\s,]+)\s*€/);

  // ── ÉPARGNE D2 ──────────────────────────────────────────────────────────────
  const livretAD2    = oui(secEpD2, /Livret A\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lddsD2       = oui(secEpD2, /LDDS\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lepD2        = oui(secEpD2, /LEP\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const livretPlusD2 = oui(secEpD2, /Livret\+[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelD2        = oui(secEpD2, /PEL\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const peaD2        = oui(secEpD2, /PEA\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const avD2         = oui(secEpD2, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const cryptoD2     = oui(secEpD2, /Crypto[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const percoD2      = n(secEpD2,   /PER versements 2025\s*:\s*([\d\s,]+)\s*€/);

  // ── PATRIMOINE CALCULÉ ───────────────────────────────────────────────────────
  const epargneLiquide   = livretAD1 + lddsD1 + lepD1 + livretPlusD1
                         + livretAD2 + lddsD2 + lepD2 + livretPlusD2;
  const epargneLongTerme = peaD1 + avD1 + percoD1 + pelD1 + peaD2 + avD2 + percoD2 + pelD2;
  const cryptoTotal      = cryptoD1 + cryptoD2;
  const immoTotal        = 0;

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
  const isEnriched             = /DÉCLARATION.*CASES|OBJECTIFS PRIORITAIRES|ANALYSE DES SITUATIONS/i.test(text);

  return {
    mode,
    parts:       parts || 1,
    departement,

    salaireNetImposableD1, salairesBrutImposableD1, pasD1, tauxPasD1, peroD1,
    salaireNetImposableD2, salairesBrutImposableD2, pasD2, tauxPasD2, peroD2,

    rniD1, rniD2, rniFoyer, rfr, foncierNet,
    tmi, irNet, totalDu, pasTotal, solde, remboursement, gainPacs,
    dividendes, revensFonciers, revenusLoc, revenusCrypto,

    livretAD1, lddsD1, lepD1, livretPlusD1, pelD1, peaD1, avD1, cryptoD1, percoD1,
    livretAD2, lddsD2, lepD2, livretPlusD2, pelD2, peaD2, avD2, cryptoD2, percoD2,

    epargneLiquide, epargneLongTerme, cryptoTotal, immoTotal,
    patrimoineTotal: epargneLiquide + epargneLongTerme + cryptoTotal,

    regimeFoncier,
    plafondPerD1, plafondPerD2, plafondPerTotal, plafondsPrecedents,

    hasCrypto, hasCompteEtranger, hasIndivision, hasTestamentManquant,
    hasPelAncien, hasChangementEmployeur, hasMultipleEmployeurs,
    isEnriched,
  };
}

export function emptyProfile() {
  return {
    mode: 'solo', parts: 1, departement: '',
    salaireNetImposableD1: 0, salairesBrutImposableD1: 0, pasD1: 0, tauxPasD1: 0, peroD1: 0,
    salaireNetImposableD2: 0, salairesBrutImposableD2: 0, pasD2: 0, tauxPasD2: 0, peroD2: 0,
    rniD1: 0, rniD2: 0, rniFoyer: 0, rfr: 0, foncierNet: 0,
    tmi: 0, irNet: 0, totalDu: 0, pasTotal: 0, solde: 0, remboursement: 0, gainPacs: 0,
    dividendes: 0, revensFonciers: 0, revenusLoc: 0, revenusCrypto: 0,
    livretAD1: 0, lddsD1: 0, lepD1: 0, livretPlusD1: 0, pelD1: 0, peaD1: 0, avD1: 0, cryptoD1: 0, percoD1: 0,
    livretAD2: 0, lddsD2: 0, lepD2: 0, livretPlusD2: 0, pelD2: 0, peaD2: 0, avD2: 0, cryptoD2: 0, percoD2: 0,
    epargneLiquide: 0, epargneLongTerme: 0, cryptoTotal: 0, immoTotal: 0, patrimoineTotal: 0,
    regimeFoncier: null,
    plafondPerD1: 0, plafondPerD2: 0, plafondPerTotal: 0, plafondsPrecedents: 0,
    hasCrypto: false, hasCompteEtranger: false, hasIndivision: false,
    hasTestamentManquant: false, hasPelAncien: false,
    hasChangementEmployeur: false, hasMultipleEmployeurs: false,
    isEnriched: false,
  };
}
