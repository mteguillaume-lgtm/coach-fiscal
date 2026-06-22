// Wrapper pdfjs-dist v5 pour l'extraction de texte avec positions
// Coordonnées de sortie : top-origin (top=0 en haut de page), comme pdfplumber

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

// Tolérance en points pour regrouper les mots sur la même ligne visuelle.
// Équivalent de round(w["top"]) dans build_lines() Python.
const LINE_Y_TOLERANCE = 3;

/**
 * Convertit un item pdf.js en mot avec coordonnées top-origin.
 * pdf.js : transform[4]=x, transform[5]=y depuis le BAS de la page.
 * Sortie  : { text, x0, x1, top, bottom } depuis le HAUT de la page.
 */
function itemToWord(item, pageHeight) {
  const x = item.transform[4];
  const y = item.transform[5];       // baseline depuis le bas
  const h = item.height > 0 ? item.height : 10; // fallback si height=0
  return {
    text:   item.str,
    x0:     x,
    x1:     x + item.width,
    top:    pageHeight - (y + h),    // haut du caractère depuis le haut de page
    bottom: pageHeight - y,          // bas du caractère (baseline) depuis le haut
  };
}

/**
 * Regroupe les mots par ligne visuelle (même y ± LINE_Y_TOLERANCE),
 * puis trie chaque ligne par x0.
 * Port de build_lines() Python (round(w["top"]) comme clé).
 */
function groupIntoLines(words) {
  if (words.length === 0) return [];

  // Trier par top croissant pour traiter les lignes dans l'ordre
  const sorted = [...words].sort((a, b) => a.top - b.top);
  const lines = [];

  for (const word of sorted) {
    let placed = false;
    for (const line of lines) {
      // Comparer par rapport au premier mot de chaque ligne (reference stable)
      if (Math.abs(word.top - line[0].top) <= LINE_Y_TOLERANCE) {
        line.push(word);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([word]);
  }

  return lines.map(line => line.sort((a, b) => a.x0 - b.x0));
}

/**
 * Extrait le texte et les positions de chaque page d'un PDF.
 *
 * @param {File} file - Fichier PDF (File ou Blob)
 * @returns {Promise<Array<{
 *   pageNumber: number,
 *   width: number,
 *   height: number,
 *   lines: Array<Array<{text, x0, x1, top, bottom}>>
 * }>>}
 */
export async function extractWordsWithPositions(file) {
  const arrayBuffer = await file.arrayBuffer();

  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    // Filtrer les items texte (ignorer les beginMarkedContent, etc.)
    const words = textContent.items
      .filter(item => typeof item.str === 'string' && item.str.trim().length > 0)
      .map(item => itemToWord(item, viewport.height));

    pages.push({
      pageNumber: i,
      width:  viewport.width,
      height: viewport.height,
      lines:  groupIntoLines(words),
    });
  }

  return pages;
}

/**
 * Extrait tout le texte brut d'un PDF (pour detect_period).
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractRawText(file) {
  const pages = await extractWordsWithPositions(file);
  return pages
    .map(p => p.lines.map(l => l.map(w => w.text).join(' ')).join('\n'))
    .join('\n\n');
}
