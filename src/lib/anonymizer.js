// Port de run_pdf() + find_zones() + detect_period() depuis PDF_Anonymiseur_v8/app.py
// Utilise pdfjs-dist pour l'extraction et pdf-lib pour le dessin des rectangles noirs.

import { PDFDocument, rgb } from 'pdf-lib';
import { extractWordsWithPositions } from './pdfReader';
import { buildPatterns, applyEnabledLabels, LOGO_ZONE } from './patterns';

const DEFAULT_PADDING = 3; // identique à PADDING = 3 dans app.py

// ─────────────────────────────────────────────────────────────────
//  DÉTECTION DE LA PÉRIODE DE PAIE (port de detect_period())
// ─────────────────────────────────────────────────────────────────

const MOIS_TEXT = {
  'janvier': '01', 'février': '02', 'fevrier': '02', 'mars': '03',
  'avril': '04', 'mai': '05', 'juin': '06', 'juillet': '07',
  'août': '08', 'aout': '08', 'septembre': '09', 'octobre': '10',
  'novembre': '11', 'décembre': '12', 'decembre': '12',
};

/**
 * Détecte le type de document et extrait la période (mois/année).
 * Retourne toujours un objet — fallback sur la date du jour si aucune date trouvée.
 *
 * @param {string} text - Texte brut extrait du PDF (1–2 premières pages)
 * @returns {{ type: string, month: string, year: string, suggestedFilename: string }}
 *   type : 'salaire' | 'avis-impot' | 'releve' | 'document'
 *   month : '01'–'12' (toujours 2 chiffres)
 *   year  : '2025', '2026'…
 *   suggestedFilename : nom de fichier propre, sans espace ni accent
 */
export function detectPeriod(text) {
  const lower = text.toLowerCase();

  console.log('[detectPeriod] TEXTE EXTRAIT (300 premiers caractères):', lower.substring(0, 300));

  // ── 1. Type de document — ordre strict : spécifique → général ───
  // Les termes génériques (employeur, brut…) sont volontairement absents
  // pour éviter les faux positifs (PEE, contrats, etc.)
  let type;
  if (["plan d'épargne", 'pee', 'perco', 'pereco', 'souscription',
       'abondement', 'épargne salariale', 'fcpe', 'actionnariat'].some(m => lower.includes(m))) {
    type = 'epargne-salariale';
  } else if (['net à payer', 'bulletin de paie', 'bulletin de salaire',
              'fiche de paie', 'salaire brut', 'salaire net',
              'cotisations salariales', 'net imposable'].some(m => lower.includes(m))) {
    type = 'salaire';
  } else if (["avis d'imposition", 'impôt sur le revenu', 'dgfip',
              'contribuable', 'déclaration de revenus'].some(m => lower.includes(m))) {
    type = 'avis-impot';
  } else if (['relevé de compte', 'solde au', 'numéro de compte',
              'virement reçu', 'virement émis'].some(m => lower.includes(m))) {
    type = 'releve-bancaire';
  } else {
    type = 'document-anonymise';
  }

  // ── 2. Extraction mois / année (même logique que l'original) ────
  let month = null;
  let year  = null;
  let m;

  // "du JJ/MM/AAAA au JJ/MM/AAAA" (ou avec points)
  m = text.match(/du\s+\d{1,2}[/.]\d{1,2}[/.](\d{2,4})\s+au\s+\d{1,2}[/.](\d{1,2})[/.](\d{2,4})/i);
  if (m) {
    month = m[2].padStart(2, '0');
    year  = m[3].length === 4 ? m[3] : '20' + m[3];
  }

  // DATEDEBUT=JJ/MM/AAAA
  if (!month) {
    m = text.match(/DATEDEBUT=\d{1,2}\/(\d{1,2})\/(\d{4})/i);
    if (m) { month = m[1].padStart(2, '0'); year = m[2]; }
  }

  // "du 01 janvier 2026 au …"
  if (!month) {
    m = text.match(/du\s+\d{1,2}\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/i);
    if (m) {
      const mo = MOIS_TEXT[m[1].toLowerCase()];
      if (mo) { month = mo; year = m[2]; }
    }
  }

  // "Mois de paie : Janvier 2026" / "Période : Janvier 2026"
  if (!month) {
    m = text.match(/(?:mois\s+de\s+paie|p[ée]riode)\s*[:\s]+([A-Za-zÀ-ÿ]+)\s+(\d{4})/i);
    if (m) {
      const mo = MOIS_TEXT[m[1].toLowerCase()];
      if (mo) { month = mo; year = m[2]; }
    }
  }

  // "Période : 01/2026"
  if (!month) {
    m = text.match(/p[ée]riode\s*[:\s]+(\d{2})\/(\d{4})/i);
    if (m) { month = m[1]; year = m[2]; }
  }

  // "BULLETIN DE PAIE du 01/04/20"
  if (!month) {
    m = text.match(/(?:bulletin\s+de\s+paie\s+)?du\s+\d{1,2}\/(\d{2})\/(\d{2,4})/i);
    if (m) {
      month = m[1].padStart(2, '0');
      year  = m[2].length === 4 ? m[2] : '20' + m[2];
    }
  }

  // "Date de paie : 31/01/2026"
  if (!month) {
    m = text.match(/(?:date\s+de\s+paie|paiement)\s*[:\s]+\d{1,2}\/(\d{2})\/(\d{4})/i);
    if (m) { month = m[1]; year = m[2]; }
  }

  // ── 3. Fallback sur la date du jour ─────────────────────────────
  if (!month || !year) {
    const now = new Date();
    month ??= String(now.getMonth() + 1).padStart(2, '0');
    year  ??= String(now.getFullYear());
  }

  // ── 4. Nom de fichier propre ─────────────────────────────────────
  const suggestedFilename = {
    'salaire':           `salaire-${month}-${year}.pdf`,
    'avis-impot':        `avis-impot-${year}.pdf`,
    'releve-bancaire':   `releve-${month}-${year}.pdf`,
    'epargne-salariale': `epargne-salariale-${month}-${year}.pdf`,
    'document-anonymise': `document-anonymise-${month}-${year}.pdf`,
  }[type];

  console.log('[detectPeriod] TYPE DÉTECTÉ:', type);
  console.log('[detectPeriod] NOM FICHIER FINAL:', suggestedFilename);

  return { type, month, year, suggestedFilename };
}

// ─────────────────────────────────────────────────────────────────
//  MOTEUR : DÉTECTION DES ZONES (port de find_zones())
// ─────────────────────────────────────────────────────────────────

/**
 * Port exact de find_zones(line_words, patterns, padding) de app.py.
 *
 * Prend les mots D'UNE SEULE LIGNE (déjà groupés par pdfReader),
 * reconstruit la chaîne complète, applique les patterns regex,
 * puis retrouve les boîtes englobantes des mots matchés.
 *
 * Utilise le flag 'd' (ES2022) pour obtenir les indices des groupes capturants.
 *
 * @param {Array<{text,x0,x1,top,bottom}>} lineWords
 * @param {object[]} patterns - sortie de buildPatterns()
 * @param {number} padding
 * @returns {object[]} zones { label, text, x0, x1, top, bottom }
 */
export function findZones(lineWords, patterns, padding = DEFAULT_PADDING) {
  if (lineWords.length === 0) return [];

  // Reconstituer la ligne (mots séparés par un espace, comme en Python)
  const full = lineWords.map(w => w.text).join(' ');

  // Character map : pour chaque mot, [start, end) dans `full`
  const cmap = [];
  let pos = 0;
  for (const w of lineWords) {
    cmap.push({ word: w, start: pos, end: pos + w.text.length });
    pos += w.text.length + 1; // +1 pour l'espace
  }

  const zones = [];

  for (const p of patterns) {
    if (!p.enabled || p.fixed) continue;

    let regex;
    try {
      // Flag 'd' = indices des groupes (ES2022), 'i' = insensible à la casse,
      // 'm' = ^ et $ correspondent aux débuts/fins de lignes, 'g' = global
      regex = new RegExp(p.pattern, 'gimd');
    } catch {
      continue; // pattern invalide, on ignore
    }

    let match;
    while ((match = regex.exec(full)) !== null) {
      // Utiliser le groupe 1 si présent (comme m.lastindex en Python), sinon le match entier
      const hasGroup = match.indices?.length > 1 && match.indices[1] !== undefined;
      const [ms, me] = hasGroup ? match.indices[1] : match.indices[0];

      // Mots qui se chevauchent avec la plage [ms, me)
      const matchedWords = cmap
        .filter(({ start, end }) => end > ms && start < me)
        .map(c => c.word);

      if (matchedWords.length > 0) {
        zones.push({
          label: p.label,
          text:   (match[hasGroup ? 1 : 0] ?? '').slice(0, 60),
          x0:     Math.min(...matchedWords.map(w => w.x0))     - padding,
          x1:     Math.max(...matchedWords.map(w => w.x1))     + padding,
          top:    Math.min(...matchedWords.map(w => w.top))    - padding,
          bottom: Math.max(...matchedWords.map(w => w.bottom)) + padding,
        });
      }

      // Sécurité : éviter les boucles infinies sur les matches de largeur zéro
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  return zones;
}

// ─────────────────────────────────────────────────────────────────
//  ANONYMISATION PRINCIPALE
// ─────────────────────────────────────────────────────────────────

/**
 * Port de run_pdf() — anonymise un PDF en noircissant les zones sensibles.
 *
 * @param {File} file - Fichier PDF d'entrée
 * @param {object} options
 *   @param {string}   [options.prenom]        - Prénom du salarié
 *   @param {string}   [options.nom]            - Nom du salarié
 *   @param {string}   [options.employeur]      - Nom de l'employeur
 *   @param {string[]|null} [options.enabledLabels] - Labels à activer (null = tous)
 *   @param {boolean}  [options.logoEnabled=true]   - Noircir la zone logo
 *   @param {number}   [options.padding=3]           - Marge autour des zones (points)
 *
 * @returns {Promise<{blob: Blob, suggestedFilename: string, zonesCount: number, detections: object[]}>}
 */
export async function anonymizePdf(file, options = {}) {
  const {
    prenom       = '',
    nom          = '',
    employeur    = '',
    enabledLabels = null,
    logoEnabled  = true,
    padding      = DEFAULT_PADDING,
  } = options;

  // 1. Extraction texte + positions
  const pages = await extractWordsWithPositions(file);

  // 2. Construction des patterns
  const rawPatterns  = buildPatterns(prenom, nom, employeur);
  const patterns     = applyEnabledLabels(rawPatterns, enabledLabels);

  // 3. Chargement du PDF pour modification (pdf-lib)
  const arrayBuffer  = await file.arrayBuffer();
  const pdfDoc       = await PDFDocument.load(arrayBuffer);

  let totalZones     = 0;
  let detectedPeriod = null;
  const detections   = [];

  for (const { pageNumber, lines } of pages) {
    const pageIdx = pageNumber - 1;
    const pdfPage = pdfDoc.getPage(pageIdx);
    const { height: pdfHeight } = pdfPage.getSize(); // coordonnées pdf-lib (bottom-origin)

    // Détection de période sur les 2 premières pages
    if (pageNumber <= 2 && !detectedPeriod) {
      const pageText = lines.map(l => l.map(w => w.text).join(' ')).join('\n');
      detectedPeriod = detectPeriod(pageText);
    }

    // Trouver les zones à noircir sur chaque ligne
    const allZones = [];
    for (const lineWords of lines) {
      allZones.push(...findZones(lineWords, patterns, padding));
    }

    // Zone logo (fixe, définie dans LOGO_ZONE)
    if (logoEnabled && (LOGO_ZONE.page === -1 || LOGO_ZONE.page === pageIdx)) {
      allZones.push({
        label:  'Logo employeur',
        text:   '(image)',
        x0:     LOGO_ZONE.x0,
        x1:     LOGO_ZONE.x1,
        top:    LOGO_ZONE.top,
        bottom: LOGO_ZONE.bottom,
      });
    }

    totalZones += allZones.length;
    detections.push({ page: pageNumber, zones: allZones });

    // 4. Dessin des rectangles noirs avec pdf-lib
    // ⚠️ Conversion système de coordonnées :
    //   - Nos zones : top/bottom depuis le HAUT de la page (top-origin, comme pdfplumber)
    //   - pdf-lib  : y depuis le BAS de la page (bottom-origin, comme PDF spec / reportlab)
    //   Formule identique à reportlab Python :
    //     c.rect(z["x0"], ph - z["bottom"], z["x1"]-z["x0"], z["bottom"]-z["top"])
    for (const zone of allZones) {
      pdfPage.drawRectangle({
        x:      zone.x0,
        y:      pdfHeight - zone.bottom,   // bas du rectangle (bottom-origin)
        width:  zone.x1 - zone.x0,
        height: zone.bottom - zone.top,
        color:  rgb(0, 0, 0),
      });
    }
  }

  // 5. Sauvegarde et retour du Blob
  const bytes = await pdfDoc.save();
  const blob  = new Blob([bytes], { type: 'application/pdf' });

  // detectedPeriod est désormais un objet { type, month, year, suggestedFilename }
  // ou null si aucune page n'a été scannée (PDF vide)
  const period = detectedPeriod ?? detectPeriod('');
  const suggestedFilename = period.suggestedFilename;

  return { blob, suggestedFilename, zonesCount: totalZones, detections, period };
}
