// Extraction LOCALE de données fiscales depuis le texte d'un document.
//
// ⚠️ 100 % LOCAL — aucune donnée personnelle ne quitte le navigateur.
// L'extraction se fait par regex sur le texte déjà extrait par pdf.js
// (src/lib/pdfReader.js), AVANT tout masquage, et JAMAIS via l'API Claude.
// Le pipeline IA (src/lib/extractor.js) reste disponible en enrichissement
// optionnel côté /collect, mais n'est jamais déclenché à l'anonymisation.
//
// Séparation des responsabilités :
//   • le registre (data/documentTypes/registry.json) déclare CE QU'ON peut extraire
//     par type (champ `extract` : ids sémantiques) ;
//   • ce module sait COMMENT (EXTRACTORS) et VERS QUEL champ de formulaire (EXTRACT_MAP).
//
// Les champs non implémentés ci-dessous sont ignorés silencieusement : déclarer un
// nouvel id dans le registre + ajouter son extracteur ici suffit (extensibilité).

import { getType } from '../data/documentTypes/index.js';

// ─────────────────────────────────────────────────────────────────
//  PARSERS — formats français (espaces / U+202F insécables / virgule décimale)
// ─────────────────────────────────────────────────────────────────

/**
 * Montant français → entier (string) prêt pour le formulaire.
 * Gère les séparateurs de milliers (espace normal, U+202F, U+00A0, point)
 * et la virgule décimale. Ex : "45 162,30" → "45162", "1.300.000" → "1300000".
 */
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  // Retirer le symbole € et les espaces (normaux + insécables)
  s = s.replace(/[€\s]/g, '');
  // Virgule décimale → on tronque la partie décimale (montants formulaire = entiers)
  if (s.includes(',')) s = s.split(',')[0];
  // Points = séparateurs de milliers ici (pas de décimale française au point)
  s = s.replace(/\./g, '');
  if (!/^\d+$/.test(s)) return null;
  return String(parseInt(s, 10));
}

/**
 * Taux/pourcentage français → nombre (string). Ex : "11,80" → "11.8".
 */
export function parseRate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/[%\s]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : String(n);
}

/**
 * Date JJ/MM/AAAA (ou avec points/tirets) → "MM/AAAA" (format attendu par le
 * formulaire de collecte : computeAvDate / computePeaDate / computePelDate).
 */
export function parseDateToMMYYYY(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  const month = m[2].padStart(2, '0');
  const year = m[3].length === 4 ? m[3] : '20' + m[3];
  return `${month}/${year}`;
}

// ─────────────────────────────────────────────────────────────────
//  EXTRACTORS — { semanticId: { regex, parse } }
//  Une fonction de parsing par id ; `regex` doit capturer la valeur en groupe 1.
//  Bulletins : PRINCIPE STRICT — on vise le CUMUL annuel (décembre), jamais le mois.
// ─────────────────────────────────────────────────────────────────

const AMT = '([\\d \\u202f\\u00a0.,]+)'; // capture d'un montant français

const EXTRACTORS = {
  // ── Avis d'imposition ──────────────────────────────────────────
  rfr: {
    regex: new RegExp(`revenu fiscal de r[ée]f[ée]rence[^\\d]{0,40}${AMT}`, 'i'),
    parse: parseAmount,
  },
  nbParts: {
    regex: /nombre de parts[^\d]{0,20}(\d+[.,]?\d*)/i,
    parse: parseRate,
  },
  tauxPAS: {
    regex: /taux (?:personnalis[ée]|de pr[ée]l[èe]vement|moyen)[^\d]{0,30}(\d{1,2}[.,]\d{1,2})\s*%/i,
    parse: parseRate,
  },
  plafondPER: {
    regex: new RegExp(`plafond[^\\n]{0,60}[ée]pargne retraite[^\\d]{0,40}${AMT}`, 'i'),
    parse: parseAmount,
  },

  // ── Bulletin de salaire (cumul annuel) ─────────────────────────
  netImposable: {
    // « Net imposable » suivi, sur la même portion de ligne, du cumul annuel.
    regex: new RegExp(`net imposable[^\\n]{0,60}?(?:cumul|annuel|01/01)[^\\d]{0,20}${AMT}`, 'i'),
    parse: parseAmount,
  },
  brutImposable: {
    regex: new RegExp(`(?:brut imposable|total brut)[^\\n]{0,60}?(?:cumul|annuel)[^\\d]{0,20}${AMT}`, 'i'),
    parse: parseAmount,
  },
  pasAnnuel: {
    regex: new RegExp(`(?:imp[ôo]t (?:sur le revenu )?pr[ée]lev[ée]|pr[ée]l[èe]vement [àa] la source)[^\\n]{0,60}?(?:cumul|annuel)[^\\d]{0,20}${AMT}`, 'i'),
    parse: parseAmount,
  },
  peroCotisations: {
    regex: new RegExp(`(?:PERO|PER obligatoire|retraite suppl[ée]mentaire|art(?:icle)?\\.? ?83)[^\\n]{0,40}?${AMT}`, 'i'),
    parse: parseAmount,
  },

  // ── IFU ────────────────────────────────────────────────────────
  div2DC: {
    regex: new RegExp(`(?:2DC|dividendes(?:[^\\n]{0,30}?bruts)?)[^\\d]{0,30}${AMT}`, 'i'),
    parse: parseAmount,
  },
  int2TR: {
    regex: new RegExp(`(?:2TR|int[ée]r[êe]ts[^\\n]{0,20})[^\\d]{0,30}${AMT}`, 'i'),
    parse: parseAmount,
  },
  ci2CK: {
    regex: new RegExp(`(?:2CK|cr[ée]dit d'imp[ôo]t[^\\n]{0,20})[^\\d]{0,30}${AMT}`, 'i'),
    parse: parseAmount,
  },

  // ── Dates d'ouverture (forte valeur, souvent mal saisies) ──────
  avDate: {
    regex: /(?:date d['e]?\s?(?:effet|souscription|ouverture|adh[ée]sion))[^\d]{0,15}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i,
    parse: parseDateToMMYYYY,
  },
  avEncours: {
    regex: new RegExp(`(?:valeur de rachat|encours|montant du contrat)[^\\d]{0,20}${AMT}`, 'i'),
    parse: parseAmount,
  },
  peaDate: {
    regex: /(?:date d['e]?\s?ouverture)[^\d]{0,15}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i,
    parse: parseDateToMMYYYY,
  },
  peaValo: {
    regex: new RegExp(`(?:valorisation|valeur (?:du )?portefeuille|encours)[^\\d]{0,20}${AMT}`, 'i'),
    parse: parseAmount,
  },
  pelDate: {
    regex: /(?:date d['e]?\s?ouverture)[^\d]{0,15}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i,
    parse: parseDateToMMYYYY,
  },
  pelSolde: {
    regex: new RegExp(`(?:solde|capital)[^\\d]{0,20}${AMT}`, 'i'),
    parse: parseAmount,
  },
};

// ─────────────────────────────────────────────────────────────────
//  EXTRACT_MAP — id sémantique → champ du formulaire de collecte
//
//  Convention de routage (alignée sur l'existant, cf. Collect.handleFiles) :
//   • scope 'declarant' = champ individuel à clé PLEINE (net_imp, av_date…).
//     Le routage D1/D2 se fait par OBJET de données (d1Data / d2Data en couple,
//     formData en solo), pas par suffixe de clé.
//   • scope 'foyer' = champ foyer, toujours dans formData (clé littérale).
//     `perDeclarantSuffix` : la clé foyer est suffixée _d1/_d2 (ex. pero_d1/pero_d2).
//
//  Les ids sans entrée (rfr, nbParts, tmi…) servent à l'affichage / la cohérence.
// ─────────────────────────────────────────────────────────────────

export const EXTRACT_MAP = {
  // Individuels (routés par objet de données)
  netImposable:  { formKey: 'net_imp',  scope: 'declarant' },
  brutImposable: { formKey: 'brut',     scope: 'declarant' },
  tauxPAS:       { formKey: 'taux_pas', scope: 'declarant' },
  pasAnnuel:     { formKey: 'pas_tot',  scope: 'declarant' },
  avEncours:     { formKey: 'av',       scope: 'declarant' },
  avDate:        { formKey: 'av_date',  scope: 'declarant' },
  peaValo:       { formKey: 'pea',      scope: 'declarant' },
  peaDate:       { formKey: 'pea_date', scope: 'declarant' },
  pelSolde:      { formKey: 'pel',      scope: 'declarant' },
  pelDate:       { formKey: 'pel_date', scope: 'declarant' },
  ctoValo:       { formKey: 'cto',      scope: 'declarant' },
  livretA:       { formKey: 'livret_a', scope: 'declarant' },
  ldds:          { formKey: 'ldd',      scope: 'declarant' },
  lep:           { formKey: 'lep',      scope: 'declarant' },

  // Foyer (toujours dans formData)
  plafondPER:      { formKey: 'per_n1',              scope: 'foyer' },
  div2DC:          { formKey: 'div_2dc',             scope: 'foyer' },
  int2TR:          { formKey: 'int_mob_2tr',         scope: 'foyer' },
  ci2CK:           { formKey: 'int_mob_2ck',         scope: 'foyer' },
  pv3VG:           { formKey: 'pv_mob_gain',         scope: 'foyer' },
  mv3VH:           { formKey: 'pv_mob_mv_reportees', scope: 'foyer' },
  peroCotisations: { formKey: 'pero',                scope: 'foyer', perDeclarantSuffix: true },
};

/**
 * Extrait les champs déclarés par le type, depuis le texte local.
 *
 * @param {string} text   - texte brut extrait par pdf.js (pdfReader.extractRawText)
 * @param {string} typeId - id du type détecté (registre)
 * @returns {Record<string, string>} { semanticId: valeur } (ids non extraits omis)
 */
export function extractFields(text, typeId) {
  const type = getType(typeId);
  if (!type || !text) return {};

  const out = {};
  for (const id of type.extract || []) {
    const ex = EXTRACTORS[id];
    if (!ex) continue; // déclaré mais pas encore implémenté → ignoré
    const m = text.match(ex.regex);
    if (!m) continue;
    const val = ex.parse(m[1]);
    if (val != null && val !== '') out[id] = val;
  }
  return out;
}

/**
 * Projette une extraction sémantique vers les clés du formulaire de collecte,
 * en séparant ce qui va dans l'objet du déclarant de ce qui va dans le foyer.
 *
 * @param {Record<string,string>} extracted - sortie de extractFields()
 * @param {'solo'|'d1'|'d2'} [target='solo']
 * @returns {{ declarant: Record<string,string>, foyer: Record<string,string> }}
 *   declarant : à fusionner dans d1Data/d2Data (couple) ou formData (solo).
 *   foyer     : à fusionner dans formData dans tous les cas.
 */
export function mapExtractToForm(extracted, target = 'solo') {
  const declarant = {};
  const foyer = {};
  for (const [id, value] of Object.entries(extracted)) {
    const map = EXTRACT_MAP[id];
    if (!map) continue; // valeur d'affichage/cohérence sans champ formulaire
    if (map.scope === 'foyer') {
      const key = map.perDeclarantSuffix
        ? `${map.formKey}_${target === 'd2' ? 'd2' : 'd1'}`
        : map.formKey;
      foyer[key] = value;
    } else {
      declarant[map.formKey] = value;
    }
  }
  return { declarant, foyer };
}
