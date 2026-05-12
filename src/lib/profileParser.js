/**
 * Parser centralisé — source de vérité unique pour toutes les extractions.
 * parseProfile(text) → objet structuré complet.
 * Tous les composants importent d'ici ; personne ne reparse le texte seul.
 */

// ─── Helpers internes ─────────────────────────────────────────────────────────

/** Extrait un entier depuis un groupe de capture (gère séparateur milliers FR). */
function n(src, rx) {
  const m = src.match(rx);
  if (!m?.[1]) return 0;
  // Supprime espaces normaux + espaces insécables (U+00A0) utilisés par toLocaleString('fr-FR')
  const v = parseInt(m[1].replace(/[\s .,]/g, ''), 10);
  return isNaN(v) ? 0 : v;
}

/** Extrait un flottant (ex : taux PAS "7,8"). */
function f(src, rx) {
  const m = src.match(rx);
  if (!m?.[1]) return 0;
  const v = parseFloat(m[1].replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

/** Extrait le texte du premier groupe de capture. */
function s(src, rx) {
  return src.match(rx)?.[1]?.trim() ?? '';
}

/** Extrait un montant au format "OUI ~5 000 €". Retourne 0 si "Néant". */
function oui(src, rx) {
  const m = src.match(rx);
  if (!m?.[1]) return 0;
  return parseInt(m[1].replace(/[\s ]/g, ''), 10) || 0;
}

/** TMI barème 2025 (par part) — fallback si non écrit dans le profil. */
function tmiFromRNI(rni, parts) {
  const base = parts > 0 ? rni / parts : rni;
  if (base <= 11_497) return 0;
  if (base <= 29_315) return 11;
  if (base <= 83_823) return 30;
  if (base <= 180_294) return 41;
  return 45;
}

// ─── Section extractor ────────────────────────────────────────────────────────

/** Extrait le texte d'une section délimitée par un header "== ... ==" . */
function section(text, header) {
  // Cherche le header, capture jusqu'au prochain == ou fin
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped + '\\s*([\\s\\S]*?)(?=\\n==|$)');
  return text.match(rx)?.[1] ?? '';
}

// ─── parseProfile ─────────────────────────────────────────────────────────────

/**
 * Analyse un profil fiscal en texte brut et retourne un objet structuré complet.
 * Retourne toujours un objet (0 / false si champ absent).
 */
export function parseProfile(text) {
  if (!text) return emptyProfile();

  // ── Mode ──────────────────────────────────────────────────────────────────
  const mode = /Mode\s*:\s*Déclaration commune|FOYER 2025|DÉCLARANT 2/i.test(text) ? 'couple' : 'solo';

  // ── Sections du profil ────────────────────────────────────────────────────
  const secRevD1 = mode === 'couple'
    ? section(text, '== REVENUS 2025 — DÉCLARANT 1 ==')
    : section(text, '== REVENUS 2025 ==');
  const secRevD2 = mode === 'couple'
    ? section(text, '== REVENUS 2025 — DÉCLARANT 2 ==')
    : '';
  const secEpD1  = mode === 'couple'
    ? section(text, '== ÉPARGNE — DÉCLARANT 1 ==')
    : section(text, '== ÉPARGNE ET PLACEMENTS ==');
  const secEpD2  = mode === 'couple'
    ? section(text, '== ÉPARGNE — DÉCLARANT 2 ==')
    : '';
  const secSynth = section(text, '== SYNTHÈSE FISCALE FOYER ==');
  const secDed   = section(text, '== DÉDUCTIONS ==') || section(text, '== DÉDUCTIONS DU FOYER ==');
  const secImmo  = section(text, '== IMMOBILIER ==');

  // ── SITUATION ─────────────────────────────────────────────────────────────
  const parts       = f(text, /Parts fiscales\s*:\s*([\d,\.]+)/);
  const departement = s(text, /Département\s*:\s*(\d{2,3})/);

  // ── REVENUS D1 ────────────────────────────────────────────────────────────
  const salaireNetImposableD1  = n(secRevD1, /Net imposable annuel\s*:\s*([\d\s ]+)\s*€/)
                              || n(text, /1AJ[^€\d]{0,15}([\d\s ]{2,12})/i);
  const salairesBrutImposableD1 = n(secRevD1, /Brut imposable annuel\s*:\s*([\d\s ]+)\s*€/);
  const pasD1     = n(secRevD1, /PAS prélevé 2025\s*:\s*([\d\s ]+)\s*€/)
                 || n(text, /8HV[^€\d]{0,15}([\d\s ]{2,12})/i);
  const tauxPasD1 = f(secRevD1, /Taux PAS\s*:\s*([\d,\.]+)\s*%/);
  const peroD1    = n(text, /PERO D1[^:\n]*?:\s*([\d\s ]+)\s*€/)
                 || n(text, /PERO[^D\n][^:\n]*?cotisations[^:\n]*?:\s*([\d\s ]+)\s*€/);

  // ── REVENUS D2 ────────────────────────────────────────────────────────────
  const salaireNetImposableD2  = n(secRevD2, /Net imposable annuel\s*:\s*([\d\s ]+)\s*€/)
                              || n(text, /1BJ[^€\d]{0,15}([\d\s ]{2,12})/i);
  const salairesBrutImposableD2 = n(secRevD2, /Brut imposable annuel\s*:\s*([\d\s ]+)\s*€/);
  const pasD2     = n(secRevD2, /PAS prélevé 2025\s*:\s*([\d\s ]+)\s*€/)
                 || n(text, /8IV[^€\d]{0,15}([\d\s ]{2,12})/i);
  const tauxPasD2 = f(secRevD2, /Taux PAS\s*:\s*([\d,\.]+)\s*%/);

  // ── RNI FOYER ─────────────────────────────────────────────────────────────
  const rniD1     = salaireNetImposableD1;
  const rniD2     = salaireNetImposableD2;
  const rniFoyer  = n(secSynth, /Revenu net imposable total estimé\s*:\s*([\d\s ]+)\s*€/)
                 || n(text, /RNI total foyer[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                 || (rniD1 + rniD2 || rniD1);

  // ── REVENUS FOYER ─────────────────────────────────────────────────────────
  const revensFonciers = n(text, /Revenus fonciers\s*:\s*([\d\s ]+)\s*€/)
                      || n(text, /4BE[^€\d]{0,15}([\d\s ]{2,12})/i);
  const dividendes     = n(text, /Dividendes\/intérêts\s*:\s*([\d\s ]+)\s*€/)
                      || n(text, /Dividendes[^:\n]*?:\s*([\d\s ]+)\s*€/i);
  const revenusLoc     = n(text, /Revenus locatifs 2025\s*:\s*([\d\s ]+)\s*€/);
  const revenusCrypto  = n(text, /Revenus crypto\s*:\s*([\d\s ]+)\s*€/);

  // ── FISCAL CALCULÉ ────────────────────────────────────────────────────────
  const pasTotal = n(secSynth, /PAS total foyer 2025\s*:\s*([\d\s ]+)\s*€/)
                || (pasD1 + pasD2);

  const tmi = n(text, /TMI[^\n%]*?:\s*(\d{1,2})\s*%/i)
           || (rniFoyer > 0 ? tmiFromRNI(rniFoyer, parts || 1) : 0);

  const irNet        = n(text, /IR net[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                    || n(text, /Impôt net[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                    || n(text, /Total dû[^:\n]*?:\s*([\d\s ]+)\s*€/i);
  const remboursement = n(text, /Remboursement[^:\n]*?:\s*([\d\s ]+)\s*€/i);
  const solde         = remboursement > 0 ? remboursement : -irNet;

  const rfr = n(text, /RFR[^:\n]*?:\s*([\d\s ]+)\s*€/i)
           || n(text, /Revenu fiscal de référence[^:\n]*?:\s*([\d\s ]+)\s*€/i)
           || rniFoyer;

  // ── PER ───────────────────────────────────────────────────────────────────
  const plafondPerD1 = n(text, /PLAFOND DISPONIBLE D1[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                    || n(text, /Plafond disponible[^D\n]*?D1[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                    || n(text, /Plafond[^P\n]*?PER[^:\n]*?D1[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                    || n(text, /Plafond[^:\n]*?PER[^:\n]*?:\s*([\d\s ]+)\s*€/i);
  const plafondPerD2 = n(text, /PLAFOND DISPONIBLE D2[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                    || n(text, /Plafond disponible[^D\n]*?D2[^:\n]*?:\s*([\d\s ]+)\s*€/i);
  const plafondsPrecedents = n(text, /Plafonds antérieurs[^:\n]*?:\s*([\d\s ]+)\s*€/i);
  const plafondPerTotal    = plafondPerD1 + plafondPerD2 || plafondPerD1;

  // ── ÉPARGNE D1 ────────────────────────────────────────────────────────────
  const livretAD1     = oui(secEpD1, /Livret A\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const lddsD1        = oui(secEpD1, /LDDS\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const lepD1         = oui(secEpD1, /LEP\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const livretPlusD1  = oui(secEpD1, /Livret\+[^:\n]*?:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const pelD1         = oui(secEpD1, /PEL\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const peaD1         = oui(secEpD1, /PEA\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const avD1          = oui(secEpD1, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const cryptoD1      = oui(secEpD1, /Crypto[^:\n]*?:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const percoD1       = n(secEpD1, /PER versements 2025\s*:\s*([\d\s ]+)\s*€/);

  // ── ÉPARGNE D2 ────────────────────────────────────────────────────────────
  const livretAD2     = oui(secEpD2, /Livret A\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const lddsD2        = oui(secEpD2, /LDDS\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const lepD2         = oui(secEpD2, /LEP\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const livretPlusD2  = oui(secEpD2, /Livret\+[^:\n]*?:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const pelD2         = oui(secEpD2, /PEL\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const peaD2         = oui(secEpD2, /PEA\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const avD2          = oui(secEpD2, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s ]+)\s*€/);
  const cryptoD2      = oui(secEpD2, /Crypto[^:\n]*?:\s*OUI\s*~\s*([\d\s ]+)\s*€/);

  // ── PATRIMOINE CALCULÉ ────────────────────────────────────────────────────
  const epargneLiquide  = livretAD1 + lddsD1 + lepD1 + livretAD2 + lddsD2 + lepD2;
  const epargneLongTerme = peaD1 + avD1 + percoD1 + peaD2 + avD2 + pelD1 + pelD2;
  const cryptoTotal     = cryptoD1 + cryptoD2;
  const immoTotal       = n(text, /Immobilier[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                       || n(text, /valeur du bien[^:\n]*?:\s*([\d\s ]+)\s*€/i)
                       || revensFonciers * 20; // rough estimate if only loyers known
  const patrimoineTotal = epargneLiquide + epargneLongTerme + cryptoTotal;

  // ── FONCIER ───────────────────────────────────────────────────────────────
  const regimeFoncier = /micro.foncier/i.test(text) ? 'micro'
                      : /régime réel/i.test(text) ? 'reel'
                      : null;

  // ── FLAGS BOOLÉENS ────────────────────────────────────────────────────────
  const hasCrypto              = cryptoTotal > 0 || /crypto|bitcoin|ethereum|binance|kraken|coinbase/i.test(text);
  const hasCompteEtranger      = /revolut|n26|wise|bunq|3916|compte.{0,10}étranger|étranger.{0,10}compte/i.test(text);
  const hasIndivision          = /indivision/i.test(text);
  const hasTestamentManquant   = !(/testament/i.test(text)) && /pacsé|pacs(?!\w)/i.test(text);
  const hasPelAncien           = /pel.{0,20}201[0-7]|ouvert.{0,20}201[0-7]/i.test(text);
  const hasChangementEmployeur = /changement.{0,10}employeur|employeur.{0,10}changement/i.test(text);
  const hasMultipleEmployeurs  = /plusieurs employeurs|multi.employeurs/i.test(text);

  const result = {
    // Situation
    mode,
    parts:       parts || 1,
    departement,

    // Revenus D1
    salaireNetImposableD1,
    salairesBrutImposableD1,
    pasD1,
    tauxPasD1,
    peroD1,

    // Revenus D2
    salaireNetImposableD2,
    salairesBrutImposableD2,
    pasD2,
    tauxPasD2,

    // Fiscal foyer
    rniD1,
    rniD2,
    rniFoyer,
    rfr,
    tmi,
    irNet,
    pasTotal,
    solde,
    remboursement,
    dividendes,
    revensFonciers,
    revenusLoc,
    revenusCrypto,

    // Épargne D1
    livretAD1, lddsD1, lepD1, livretPlusD1, pelD1, peaD1, avD1, cryptoD1, percoD1,

    // Épargne D2
    livretAD2, lddsD2, lepD2, livretPlusD2, pelD2, peaD2, avD2, cryptoD2,

    // Patrimoine calculé
    epargneLiquide,
    epargneLongTerme,
    cryptoTotal,
    immoTotal,
    patrimoineTotal,

    // Foncier
    regimeFoncier,

    // PER
    plafondPerD1,
    plafondPerD2,
    plafondPerTotal,
    plafondsPrecedents,

    // Flags
    hasCrypto,
    hasCompteEtranger,
    hasIndivision,
    hasTestamentManquant,
    hasPelAncien,
    hasChangementEmployeur,
    hasMultipleEmployeurs,
  };

  console.log('[parseProfile]', { mode, rniFoyer, tmi, epargneLiquide, epargneLongTerme, cryptoTotal });
  return result;
}

/** Retourne un objet vide avec toutes les clés à 0 / valeur par défaut. */
export function emptyProfile() {
  return {
    mode: 'solo', parts: 1, departement: '',
    salaireNetImposableD1: 0, salairesBrutImposableD1: 0, pasD1: 0, tauxPasD1: 0, peroD1: 0,
    salaireNetImposableD2: 0, salairesBrutImposableD2: 0, pasD2: 0, tauxPasD2: 0,
    rniD1: 0, rniD2: 0, rniFoyer: 0, rfr: 0,
    tmi: 0, irNet: 0, pasTotal: 0, solde: 0, remboursement: 0,
    dividendes: 0, revensFonciers: 0, revenusLoc: 0, revenusCrypto: 0,
    livretAD1: 0, lddsD1: 0, lepD1: 0, livretPlusD1: 0, pelD1: 0, peaD1: 0, avD1: 0, cryptoD1: 0, percoD1: 0,
    livretAD2: 0, lddsD2: 0, lepD2: 0, livretPlusD2: 0, pelD2: 0, peaD2: 0, avD2: 0, cryptoD2: 0,
    epargneLiquide: 0, epargneLongTerme: 0, cryptoTotal: 0, immoTotal: 0, patrimoineTotal: 0,
    regimeFoncier: null,
    plafondPerD1: 0, plafondPerD2: 0, plafondPerTotal: 0, plafondsPrecedents: 0,
    hasCrypto: false, hasCompteEtranger: false, hasIndivision: false,
    hasTestamentManquant: false, hasPelAncien: false,
    hasChangementEmployeur: false, hasMultipleEmployeurs: false,
  };
}
