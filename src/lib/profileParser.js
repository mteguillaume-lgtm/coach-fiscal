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
  const m = (src || '').match(rx);
  if (!m?.[1]) return 0;
  const str = m[1].replace(/[\s ]/g, '').replace(',', '.');
  const v = parseFloat(str);
  return isNaN(v) ? 0 : Math.round(v);
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

/** Entier signé — gère le moins Unicode U+2212 (−) en plus du tiret ASCII. */
function signed(src, rx) {
  const m = (src || '').match(rx);
  if (!m?.[1]) return null;
  const str = m[1].replace(/−/g, '-').replace(/[\s ]/g, '').replace(',', '.');
  const v = parseFloat(str);
  return isNaN(v) ? null : Math.round(v);
}

/** Format "OUI ~1 014,77 €" → 1014. parseInt s'arrête à la virgule. */
function oui(src, rx) {
  const m = src.match(rx);
  if (!m?.[1]) return 0;
  const v = parseInt(m[1].replace(/[\s ]/g, ''), 10);
  return isNaN(v) ? 0 : v;
}

import { getTMI, abattement10, abattement10Auto } from './taxCalculator';

// ─── Section extractor ────────────────────────────────────────────────────────

/**
 * Retourne le texte entre un header "== ... ==" et le suivant (ou fin de fichier).
 */
function section(text, header) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped + '\\s*([\\s\\S]*?)(?=\\n==|$)');
  return text.match(rx)?.[1] ?? '';
}

/**
 * Calcule l'antériorité en années entières depuis une date.
 * Accepte : DD/MM/YYYY · MM/YYYY · YYYY · YYYY-MM-DD
 */
function anteriorite(dateStr) {
  if (!dateStr) return null;
  const d = dateStr.trim();
  let dt;
  if (/^\d{4}$/.test(d))                 dt = new Date(parseInt(d), 0, 1);
  else if (/^\d{2}\/\d{4}$/.test(d))     { const [m, y] = d.split('/'); dt = new Date(parseInt(y), parseInt(m) - 1, 1); }
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dy, m, y] = d.split('/'); dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(dy)); }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dt = new Date(d);
  else return null;
  if (isNaN(dt.getTime())) return null;
  return Math.floor((Date.now() - dt.getTime()) / (365.25 * 24 * 3600 * 1000));
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

  const secCapacite = section(text, "== CAPACITÉ D'ÉPARGNE ==");
  const secImmo     = section(text, '== IMMOBILIER ==');

  // ── SITUATION ───────────────────────────────────────────────────────────────
  const parts       = f(text, /Parts fiscales\s*:\s*([\d,\.]+)/);
  const departement = s(text, /Département\s*:\s*(\w{2,3})/);
  // Statut : extrait depuis "Statut : Pacsé(e)" ou fallback depuis la ligne Mode
  const statut = s(text, /^Statut\s*:\s*([^\n]+)/im)
              || s(text, /Mode\s*:.*?Déclaration commune \(([^)]+)\)/i)
              || '';

  // ── PROFIL & RETRAITE ────────────────────────────────────────────────────────
  const secProfil = section(text, '== PROFIL & RETRAITE ==');
  // Solo : "Âge : 35 ans" ; Couple : "Âge D1 : 35 ans"
  const ageD1       = n(secProfil, /Âge D1\s*:\s*(\d+)/i)      || n(secProfil, /^Âge\s*:\s*(\d+)/im);
  const retraiteD1  = n(secProfil, /Âge retraite D1\s*:\s*(\d+)/i) || n(secProfil, /Âge retraite estimé\s*:\s*(\d+)/i);
  const horizonD1   = n(secProfil, /Horizon retraite D1\s*:\s*(\d+)/i) || n(secProfil, /Horizon retraite\s*:\s*(\d+)/i)
                   || (ageD1 > 0 && retraiteD1 > ageD1 ? retraiteD1 - ageD1 : 0);
  const tmiRetraiteD1Raw = s(secProfil, /TMI retraite D1\s*:\s*(\d+)/i) || s(secProfil, /TMI retraite estimée\s*:\s*(\d+)/i);
  const tmiRetraiteD1    = tmiRetraiteD1Raw !== '' ? parseInt(tmiRetraiteD1Raw, 10) : null;
  const typeRevenuD1     = s(secProfil, /Type de revenu D1\s*:\s*(.+)/i) || s(secProfil, /Type de revenu\s*:\s*(.+)/i) || 'Salarié(e)';
  const pensionNetImpD1  = n(secProfil, /Pension nette imposable 1AS D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                        || n(secProfil, /Pension nette imposable 1AS[^:\n]*:\s*([\d\s,]+)\s*€/i);

  const ageD2       = n(secProfil, /Âge D2\s*:\s*(\d+)/i);
  const retraiteD2  = n(secProfil, /Âge retraite D2\s*:\s*(\d+)/i);
  const horizonD2   = n(secProfil, /Horizon retraite D2\s*:\s*(\d+)/i)
                   || (ageD2 > 0 && retraiteD2 > ageD2 ? retraiteD2 - ageD2 : 0);
  const tmiRetraiteD2Raw = s(secProfil, /TMI retraite D2\s*:\s*(\d+)/i);
  const tmiRetraiteD2    = tmiRetraiteD2Raw !== '' ? parseInt(tmiRetraiteD2Raw, 10) : null;
  const typeRevenuD2     = s(secProfil, /Type de revenu D2\s*:\s*(.+)/i) || 'Salarié(e)';
  const pensionNetImpD2  = n(secProfil, /Pension nette imposable 1AS D2[^:\n]*:\s*([\d\s,]+)\s*€/i);

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

  // ── IJ CPAM (montant inclus dans net_imp — informatif) ──────────────────────
  const ijCpamD1    = n(secRevD1, /\(dont\s+([\d\s,]+)\s*€\s*IJ\s*CPAM/i);
  const ijCpamOrgD1 = s(secRevD1, /IJ\s*CPAM[^—\n]*—\s*attestation\s+([^\)\n]+)/i);
  const ijCpamD2    = n(secRevD2, /\(dont\s+([\d\s,]+)\s*€\s*IJ\s*CPAM/i);
  const ijCpamOrgD2 = s(secRevD2, /IJ\s*CPAM[^—\n]*—\s*attestation\s+([^\)\n]+)/i);

  // ── RENTE VIAGÈRE 1BS ────────────────────────────────────────────────────────
  const rente1BsD1    = n(secRevD1, /Montant (?:déclaré en 1[AB]S|1BS)[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const pasRente1BsD1 = n(secRevD1, /PAS rente[^:\n]*:\s*([\d\s,]+)\s*€/i)
                     || n(secRevD1, /PAS prélevé par[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const orgRente1BsD1 = s(secRevD1, /Organisme\s*:\s*([^\n]+)/i);
  const recurrentRente1BsD1 = /Récurrent\s*:\s*Non|NON RÉCURRENT/i.test(secRevD1) ? false
                             : /Récurrent\s*:\s*Oui/i.test(secRevD1) ? true : null;

  const rente1BsD2    = n(secRevD2, /Montant (?:déclaré en 1[AB]S|1BS)[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const pasRente1BsD2 = n(secRevD2, /PAS rente[^:\n]*:\s*([\d\s,]+)\s*€/i)
                     || n(secRevD2, /PAS prélevé par[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const orgRente1BsD2 = s(secRevD2, /Organisme\s*:\s*([^\n]+)/i);
  const recurrentRente1BsD2 = /Récurrent\s*:\s*Non|NON RÉCURRENT/i.test(secRevD2) ? false
                              : /Récurrent\s*:\s*Oui/i.test(secRevD2) ? true : null;

  // ── RNI (post-abattement 10%) ─────────────────────────────────────────────
  // Cherche "RNI D1 après abattement..." ou "RNI D1 (après abat. salaires) :"
  // Sinon calcul type-aware (salaire/pension/mixte) + rente 1BS à 90% — art. 158-5-a CGI
  const rniD1 = n(text, /RNI D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
             || abattement10Auto(salaireNetImposableD1, typeRevenuD1, pensionNetImpD1)
                + Math.round((rente1BsD1 || 0) * 0.9);

  // Préférer "RNI D2 TOTAL" (inclut rente 1BS) sinon "RNI D2 (après abat.)" puis calcul
  const rniD2 = n(text, /RNI D2 TOTAL[^:\n]*:\s*([\d\s,]+)\s*€/i)
             || n(text, /RNI D2 (?:après|[(])[^:\n]*:\s*([\d\s,]+)\s*€/i)
             || abattement10Auto(salaireNetImposableD2, typeRevenuD2, pensionNetImpD2)
                + Math.round((rente1BsD2 || 0) * 0.9);

  // ── REVENUS FOYER ────────────────────────────────────────────────────────────
  // "Revenus fonciers bruts :" (nouveau générateur) ou "Revenus fonciers :" (ancien/V5)
  const revensFonciers = n(text, /Revenus fonciers bruts\s*:\s*([\d\s,]+)\s*€/i)
                      || n(text, /Revenus fonciers\s*:\s*([\d\s,]+)\s*€/);
  const dividendes     = n(text, /Dividendes\/intérêts\s*:\s*([\d\s,]+)\s*€/);
  const revenusLoc     = n(text, /Revenus locatifs 2025\s*:\s*([\d\s,]+)\s*€/);
  const revenusCrypto  = n(text, /Revenus crypto\s*:\s*([\d\s,]+)\s*€/);
  const foncierNet     = n(text, /fonciers nets imposables\s*:\s*([\d\s,]+)\s*€/i);

  // ── INTÉRÊTS MOBILIERS (case 2TR / 2CK) ──────────────────────────────────────
  // Deux formats : ligne du générateur "Intérêts mobiliers bruts (case 2TR) : X €"
  // et ligne du profil enrichi "Intérêts Livret+ D2 (case 2TR) : X €"
  const intMob2TR = n(text, /Intérêts mobiliers bruts[^:\n]*:\s*([\d\s,]+)\s*€/i)
                 || n(text, /Intérêts[^(\n]*\(case 2TR\)[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const intMob2CK = n(text, /PFU[^(]*\(case 2CK\)[^:\n]*:\s*([\d\s,]+)\s*€/i)
                 || n(text, /Intérêts mobiliers.*?PFU[^:\n]*:\s*([\d\s,]+)\s*€/is)
                 || n(text, /2CK[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i);

  // ── ACOMPTES IR/PS (cases 8HW / 8IW / 8HX / 8IX) ────────────────────────────
  // Deux formats : générateur "Acompte IR D1 (8HW) : X €"
  // et analyse IA "- Case **8HW** (acompte IR D1) : **12 €**"
  const acompte8HW = n(text, /Acompte IR D1[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i)
                  || n(text, /\b8HW\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i);
  const acompte8IW = n(text, /Acompte IR D2[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i)
                  || n(text, /\b8IW\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i);
  const acompte8HX = n(text, /Acompte PS D1[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i)
                  || n(text, /\b8HX\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i);
  const acompte8IX = n(text, /Acompte PS D2[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i)
                  || n(text, /\b8IX\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i);

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

  // TMI depuis le texte — ligne "TMI : 30%" (ne pas capturer "TMI retraite D1 : 11%")
  const tmi = n(text, /^\s*TMI\s*:\s*(\d{1,2})\s*%/im)
           || n(text, /TMI foyer[^:\n]*:\s*(\d{1,2})\s*%/i)
           || getTMI(rniFoyer, parts || 1);

  // IR net, IR brut, total dû, remboursement — présents après enrichissement IA
  const irNet         = n(text, /IR net[^:\n]*:\s*([\d\s,]+)\s*€/i)
                     || n(text, /Impôt net[^:\n]*:\s*([\d\s,]+)\s*€/i);
  // IR brut : "IR brut foyer : 4 064,19 × 2 = 8 128,38 €" → dernière valeur avant €
  const irBrut        = n(text, /IR brut foyer[^€\n]*=\s*([\d\s,]+)\s*€/i)
                     || n(text, /IR brut foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const totalDu       = n(text, /TOTAL DÛ[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const remboursement = n(text, /REMBOURSEMENT[^:\n]*:\s*\+?\s*([\d\s,]+)\s*€/i)
                     || n(text, /[Rr]emboursement[^:\n]*:\s*\+?\s*([\d\s,]+)\s*€/);
  const gainPacs      = n(text, /GAIN DU PACS[^:\n]*:\s*([\d\s,]+)\s*€/i)
                     || n(text, /gain.*?quotient[^:\n]*:\s*([\d\s,]+)\s*€/i);

  // Solde réconcilié depuis "MONTANT RESTANT À PAYER" (signé : négatif = remboursement)
  // Priorité sur la formule pasTotal − totalDu qui omet acomptes et crédit 2CK
  const montantPayer = signed(text, /MONTANT RESTANT (?:À|A) PAYER[^:\n]*:\s*([-−]?[\d\s,]+)\s*€/i);
  const solde = montantPayer !== null ? montantPayer
              : totalDu > 0 && pasTotal > 0 ? pasTotal - totalDu
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
  const plafondsPrecedents  = n(text, /Plafonds antérieurs[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const plafondPerTotal     = plafondPerD1 + plafondPerD2 || plafondPerD1;
  const perReportableN1     = n(text, /Plafond reportable N-1[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const perReportableN2     = n(text, /Plafond reportable N-2[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const perReportableN3     = n(text, /Plafond reportable N-3[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const perReportableTotal  = n(text, /Plafond reportable total[^:\n]*:\s*([\d\s,]+)\s*€/i)
                           || (perReportableN1 + perReportableN2 + perReportableN3);

  // ── ÉPARGNE D1 ──────────────────────────────────────────────────────────────
  const livretAD1    = oui(secEpD1, /Livret A\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lddsD1       = oui(secEpD1, /LDDS\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lepD1        = oui(secEpD1, /LEP\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const livretPlusD1 = oui(secEpD1, /Livret\+[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelD1        = oui(secEpD1, /PEL\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelDateD1    = s(secEpD1,   /PEL date ouverture[^:\n]*:\s*(\S+)/i);
  const peaD1        = oui(secEpD1, /PEA\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const peaDateD1    = s(secEpD1,   /PEA date ouverture[^:\n]*:\s*(\S+)/i);
  const peaVerseD1   = n(secEpD1,   /PEA total versé[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const avD1         = oui(secEpD1, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const avDateD1     = s(secEpD1,   /AV date souscription[^:\n]*:\s*(\S+)/i);
  const avVerseD1    = n(secEpD1,   /AV versements nets cumulés[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const cryptoD1          = oui(secEpD1, /Crypto[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const percoD1           = n(secEpD1,   /PER versements 2025\s*:\s*([\d\s,]+)\s*€/);
  const cryptoPlateformeD1 = s(secEpD1, /Crypto plateforme\s*:\s*(.+)/i);
  const cryptoCessionsD1  = s(secEpD1,  /Crypto cessions 2025\s*:\s*(.+)/i);
  const cryptoMontantCedeD1 = n(secEpD1, /Crypto montant cédé[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const cryptoPvD1        = n(secEpD1,   /Crypto plus-value nette[^:\n]*:\s*([\d\s,]+)\s*€/i);

  // ── ÉPARGNE D2 ──────────────────────────────────────────────────────────────
  const livretAD2    = oui(secEpD2, /Livret A\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lddsD2       = oui(secEpD2, /LDDS\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const lepD2        = oui(secEpD2, /LEP\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const livretPlusD2 = oui(secEpD2, /Livret\+[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelD2        = oui(secEpD2, /PEL\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const pelDateD2    = s(secEpD2,   /PEL date ouverture[^:\n]*:\s*(\S+)/i);
  const peaD2        = oui(secEpD2, /PEA\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const peaDateD2    = s(secEpD2,   /PEA date ouverture[^:\n]*:\s*(\S+)/i);
  const peaVerseD2   = n(secEpD2,   /PEA total versé[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const avD2         = oui(secEpD2, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const avDateD2     = s(secEpD2,   /AV date souscription[^:\n]*:\s*(\S+)/i);
  const avVerseD2    = n(secEpD2,   /AV versements nets cumulés[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const cryptoD2          = oui(secEpD2, /Crypto[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/);
  const percoD2           = n(secEpD2,   /PER versements 2025\s*:\s*([\d\s,]+)\s*€/);
  const cryptoPlateformeD2 = s(secEpD2, /Crypto plateforme\s*:\s*(.+)/i);
  const cryptoCessionsD2  = s(secEpD2,  /Crypto cessions 2025\s*:\s*(.+)/i);
  const cryptoMontantCedeD2 = n(secEpD2, /Crypto montant cédé[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const cryptoPvD2        = n(secEpD2,   /Crypto plus-value nette[^:\n]*:\s*([\d\s,]+)\s*€/i);

  // ── CAPACITÉ D'ÉPARGNE ────────────────────────────────────────────────────────
  const chargesFixes       = n(secCapacite, /Charges (?:fixes|communes) mensuelles[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const creditRp           = n(secCapacite, /dont crédit RP[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const autresCredits      = n(secCapacite, /dont autres crédits[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const chargesPersoD1     = n(secCapacite, /Charges personnelles D1[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const chargesPersoD2     = n(secCapacite, /Charges personnelles D2[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const capaciteEpargneD1  = n(secCapacite, /Capacité d'épargne D1[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const capaciteEpargneD2  = n(secCapacite, /Capacité d'épargne D2[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const capaciteEpargneFoyer = n(secCapacite, /Capacité d'épargne (?:foyer|mensuelle)[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const objectifPatrimonial = s(secCapacite, /Objectif patrimonial\s*:\s*(.+)/i);

  // ── IMMOBILIER ENRICHI ────────────────────────────────────────────────────────
  const rpValeur        = n(secImmo, /RP — valeur estimée[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const creditCrd       = n(secImmo, /Capital restant dû[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const creditTaux      = f(secImmo, /Taux crédit\s*:\s*([\d,\.]+)/i);
  const creditMensualite = n(secImmo, /Mensualité crédit[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const taxeFonciere    = n(secImmo, /Taxe foncière[^:\n]*:\s*([\d\s,]+)\s*€/i);

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

  // ── ANTÉRIORITÉ DES ENVELOPPES ───────────────────────────────────────────────
  const avAnterioriteD1  = anteriorite(avDateD1);
  const avAnterioriteD2  = anteriorite(avDateD2);
  const peaAnterioriteD1 = anteriorite(peaDateD1);
  const peaAnterioriteD2 = anteriorite(peaDateD2);
  const pelAnterioriteD1 = anteriorite(pelDateD1);
  const pelAnterioriteD2 = anteriorite(pelDateD2);

  // ── PEA ESPACE RESTANT (plafond 150 000 €) ───────────────────────────────────
  const peaEspaceD1 = peaD1 > 0 ? Math.max(0, 150_000 - (peaVerseD1 || peaD1)) : 150_000;
  const peaEspaceD2 = peaD2 > 0 ? Math.max(0, 150_000 - (peaVerseD2 || peaD2)) : 150_000;

  // ── LIVRET A PLAFOND (22 950 € depuis févr. 2023) ────────────────────────────
  const livretAExceedsD1 = livretAD1 > 22_950;
  const livretAExceedsD2 = livretAD2 > 22_950;

  // ── PEL RÉGIME FISCAL (intérêts imposables si PEL > 12 ans) ─────────────────
  const pelFiscalD1 = pelAnterioriteD1 !== null
    ? (pelAnterioriteD1 >= 12 ? 'imposable' : 'exonéré') : null;
  const pelFiscalD2 = pelAnterioriteD2 !== null
    ? (pelAnterioriteD2 >= 12 ? 'imposable' : 'exonéré') : null;

  // ── PEL INTÉRÊTS (enrichissement IA) ────────────────────────────────────────
  const pelInteretsD1 = n(secEpD1, /PEL intérêts 2025[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const pelInteretsD2 = n(secEpD2, /PEL intérêts 2025[^:\n]*:\s*([\d\s,]+)\s*€/i);

  // ── LIVRET+ GAIN SI RÉALLOCATION PEA (hyp. 7 % PEA vs 3 % livret) ────────────
  const livretPlusGainAnnuelD1 = Math.round((livretPlusD1 || 0) * (0.07 - 0.03) * (1 - 0.172));
  const livretPlusGainAnnuelD2 = Math.round((livretPlusD2 || 0) * (0.07 - 0.03) * (1 - 0.172));

  // ── AV RACHATS 2025 ──────────────────────────────────────────────────────────
  const avRachatsD1 = n(secEpD1, /AV rachats?[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const avRachatsD2 = n(secEpD2, /AV rachats?[^:\n]*:\s*([\d\s,]+)\s*€/i);

  // ── PERCO ABONDEMENT ─────────────────────────────────────────────────────────
  const percoAbondD1   = n(secEpD1, /(?:PERCO|PER.*?col)[^:\n]*abondement[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const percoPlafondD1 = n(secEpD1, /(?:PERCO|PER.*?col)[^:\n]*plafond[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const percoAbondD2   = n(secEpD2, /(?:PERCO|PER.*?col)[^:\n]*abondement[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const percoPlafondD2 = n(secEpD2, /(?:PERCO|PER.*?col)[^:\n]*plafond[^:\n]*:\s*([\d\s,]+)\s*€/i);

  // ── TRANSMISSION ─────────────────────────────────────────────────────────────
  const secTransmission = section(text, '== TRANSMISSION ==')
                       || section(text, '== PROTECTION & TRANSMISSION ==')
                       || section(text, '== TRANSMISSION ET PROTECTION ==')
                       || '';
  const beneficiairesAvD1     = s(secTransmission, /Bénéficiaires AV D1[^:\n]*:\s*(.+)/i);
  const beneficiairesAvD2     = s(secTransmission, /Bénéficiaires AV D2[^:\n]*:\s*(.+)/i);
  const donationsRecues       = n(text, /Donations? reçues?[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const abattementDonRest     = n(text, /[Aa]battement.*?restant[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const hasNuPropriete        = /nu.?propriété/i.test(text);
  const nuProprieteValeur     = n(text, /nu.?propriété[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const indivisionValeur      = n(text, /indivision[^:\n]*:\s*([\d\s,]+)\s*€/i)
                             || n(text, /quote.?part[^:\n]*:\s*([\d\s,]+)\s*€/i);

  // ── ALERTES IA (depuis "== POINTS D'ATTENTION ==") ────────────────────────────
  const secAttn = section(text, "== POINTS D'ATTENTION ==");
  const attnLines = (secAttn || '').split('\n').map(l => l.trim()).filter(Boolean);
  const alertsCritiques    = attnLines.filter(l => l.startsWith('[🔴') || l.startsWith('🔴'));
  const alertsAVerifier    = attnLines.filter(l => l.startsWith('[🟡') || l.startsWith('🟡'));
  const alertsOpportunites = attnLines.filter(l => l.startsWith('[🟢') || l.startsWith('🟢'));

  // ── PATRIMOINE NET & TAUX D'ÉPARGNE ──────────────────────────────────────────
  const patrimoineImmoNet = Math.max(0, (rpValeur || 0) - (creditCrd || 0));
  const patrimoineNet     = epargneLiquide + epargneLongTerme + cryptoTotal + patrimoineImmoNet;
  const revenuMensuelFoyer = Math.round((rniFoyer || (rniD1 + rniD2)) / 12);
  const tauxEpargneFoyer   = revenuMensuelFoyer > 0 && capaciteEpargneFoyer > 0
    ? Math.round(capaciteEpargneFoyer / revenuMensuelFoyer * 100) : 0;

  return {
    mode,
    parts:       parts || 1,
    departement,
    statut,

    salaireNetImposableD1, salairesBrutImposableD1, pasD1, tauxPasD1, peroD1,
    salaireNetImposableD2, salairesBrutImposableD2, pasD2, tauxPasD2, peroD2,

    rniD1, rniD2, rniFoyer, rfr, foncierNet,
    tmi, irNet, irBrut, totalDu, pasTotal, solde, remboursement, gainPacs,
    dividendes, revensFonciers, revenusLoc, revenusCrypto,
    intMob2TR, intMob2CK,
    acompte8HW, acompte8IW, acompte8HX, acompte8IX,
    ijCpamD1, ijCpamOrgD1, ijCpamD2, ijCpamOrgD2,
    rente1BsD1, pasRente1BsD1, orgRente1BsD1, recurrentRente1BsD1,
    rente1BsD2, pasRente1BsD2, orgRente1BsD2, recurrentRente1BsD2,

    ageD1, retraiteD1, horizonD1, tmiRetraiteD1, typeRevenuD1, pensionNetImpD1,
    ageD2, retraiteD2, horizonD2, tmiRetraiteD2, typeRevenuD2, pensionNetImpD2,

    livretAD1, lddsD1, lepD1, livretPlusD1,
    pelD1, pelDateD1, peaD1, peaDateD1, peaVerseD1, avD1, avDateD1, avVerseD1,
    cryptoD1, percoD1, cryptoPlateformeD1, cryptoCessionsD1, cryptoMontantCedeD1, cryptoPvD1,
    livretAD2, lddsD2, lepD2, livretPlusD2,
    pelD2, pelDateD2, peaD2, peaDateD2, peaVerseD2, avD2, avDateD2, avVerseD2,
    cryptoD2, percoD2, cryptoPlateformeD2, cryptoCessionsD2, cryptoMontantCedeD2, cryptoPvD2,

    chargesFixes, creditRp, autresCredits, chargesPersoD1, chargesPersoD2,
    capaciteEpargneD1, capaciteEpargneD2, capaciteEpargneFoyer,
    objectifPatrimonial,
    rpValeur, creditCrd, creditTaux, creditMensualite, taxeFonciere,

    epargneLiquide, epargneLongTerme, cryptoTotal, immoTotal,
    patrimoineTotal: epargneLiquide + epargneLongTerme + cryptoTotal,

    regimeFoncier,
    plafondPerD1, plafondPerD2, plafondPerTotal, plafondsPrecedents,
    perReportableN1, perReportableN2, perReportableN3, perReportableTotal,

    hasCrypto, hasCompteEtranger, hasIndivision, hasTestamentManquant,
    hasPelAncien, hasChangementEmployeur, hasMultipleEmployeurs,
    isEnriched,

    avAnterioriteD1, avAnterioriteD2,
    peaAnterioriteD1, peaAnterioriteD2,
    pelAnterioriteD1, pelAnterioriteD2,
    pelFiscalD1, pelFiscalD2,
    peaEspaceD1, peaEspaceD2,
    livretAExceedsD1, livretAExceedsD2,
    pelInteretsD1, pelInteretsD2,
    livretPlusGainAnnuelD1, livretPlusGainAnnuelD2,
    avRachatsD1, avRachatsD2,
    percoAbondD1, percoPlafondD1, percoAbondD2, percoPlafondD2,
    beneficiairesAvD1, beneficiairesAvD2,
    donationsRecues, abattementDonRest,
    hasNuPropriete, nuProprieteValeur, indivisionValeur,
    alertsCritiques, alertsAVerifier, alertsOpportunites,
    patrimoineImmoNet, patrimoineNet,
    revenuMensuelFoyer, tauxEpargneFoyer,
  };
}

export function emptyProfile() {
  return {
    mode: 'solo', parts: 1, departement: '', statut: '',
    salaireNetImposableD1: 0, salairesBrutImposableD1: 0, pasD1: 0, tauxPasD1: 0, peroD1: 0,
    salaireNetImposableD2: 0, salairesBrutImposableD2: 0, pasD2: 0, tauxPasD2: 0, peroD2: 0,
    rniD1: 0, rniD2: 0, rniFoyer: 0, rfr: 0, foncierNet: 0,
    tmi: 0, irNet: 0, irBrut: 0, totalDu: 0, pasTotal: 0, solde: 0, remboursement: 0, gainPacs: 0,
    dividendes: 0, revensFonciers: 0, revenusLoc: 0, revenusCrypto: 0,
    ageD1: 0, retraiteD1: 0, horizonD1: 0, tmiRetraiteD1: null,
    typeRevenuD1: 'Salarié(e)', pensionNetImpD1: 0,
    ageD2: 0, retraiteD2: 0, horizonD2: 0, tmiRetraiteD2: null,
    typeRevenuD2: 'Salarié(e)', pensionNetImpD2: 0,
    livretAD1: 0, lddsD1: 0, lepD1: 0, livretPlusD1: 0,
    pelD1: 0, pelDateD1: '', peaD1: 0, peaDateD1: '', peaVerseD1: 0, avD1: 0, avDateD1: '', avVerseD1: 0,
    cryptoD1: 0, percoD1: 0, cryptoPlateformeD1: '', cryptoCessionsD1: '', cryptoMontantCedeD1: 0, cryptoPvD1: 0,
    livretAD2: 0, lddsD2: 0, lepD2: 0, livretPlusD2: 0,
    pelD2: 0, pelDateD2: '', peaD2: 0, peaDateD2: '', peaVerseD2: 0, avD2: 0, avDateD2: '', avVerseD2: 0,
    cryptoD2: 0, percoD2: 0, cryptoPlateformeD2: '', cryptoCessionsD2: '', cryptoMontantCedeD2: 0, cryptoPvD2: 0,
    chargesFixes: 0, creditRp: 0, autresCredits: 0,
    chargesPersoD1: 0, chargesPersoD2: 0,
    capaciteEpargneD1: 0, capaciteEpargneD2: 0, capaciteEpargneFoyer: 0,
    objectifPatrimonial: '',
    rpValeur: 0, creditCrd: 0, creditTaux: 0, creditMensualite: 0, taxeFonciere: 0,
    epargneLiquide: 0, epargneLongTerme: 0, cryptoTotal: 0, immoTotal: 0, patrimoineTotal: 0,
    regimeFoncier: null,
    plafondPerD1: 0, plafondPerD2: 0, plafondPerTotal: 0, plafondsPrecedents: 0,
    perReportableN1: 0, perReportableN2: 0, perReportableN3: 0, perReportableTotal: 0,
    intMob2TR: 0, intMob2CK: 0,
    acompte8HW: 0, acompte8IW: 0, acompte8HX: 0, acompte8IX: 0,
    ijCpamD1: 0, ijCpamOrgD1: '', ijCpamD2: 0, ijCpamOrgD2: '',
    rente1BsD1: 0, pasRente1BsD1: 0, orgRente1BsD1: '', recurrentRente1BsD1: null,
    rente1BsD2: 0, pasRente1BsD2: 0, orgRente1BsD2: '', recurrentRente1BsD2: null,
    hasCrypto: false, hasCompteEtranger: false, hasIndivision: false,
    hasTestamentManquant: false, hasPelAncien: false,
    hasChangementEmployeur: false, hasMultipleEmployeurs: false,
    isEnriched: false,

    avAnterioriteD1: null, avAnterioriteD2: null,
    peaAnterioriteD1: null, peaAnterioriteD2: null,
    pelAnterioriteD1: null, pelAnterioriteD2: null,
    pelFiscalD1: null, pelFiscalD2: null,
    peaEspaceD1: 150_000, peaEspaceD2: 150_000,
    livretAExceedsD1: false, livretAExceedsD2: false,
    pelInteretsD1: 0, pelInteretsD2: 0,
    livretPlusGainAnnuelD1: 0, livretPlusGainAnnuelD2: 0,
    avRachatsD1: 0, avRachatsD2: 0,
    percoAbondD1: 0, percoPlafondD1: 0, percoAbondD2: 0, percoPlafondD2: 0,
    beneficiairesAvD1: '', beneficiairesAvD2: '',
    donationsRecues: 0, abattementDonRest: 0,
    hasNuPropriete: false, nuProprieteValeur: 0, indivisionValeur: 0,
    alertsCritiques: [], alertsAVerifier: [], alertsOpportunites: [],
    patrimoineImmoNet: 0, patrimoineNet: 0,
    revenuMensuelFoyer: 0, tauxEpargneFoyer: 0,
  };
}
