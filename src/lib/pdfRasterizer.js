// Rendu pixel des pages PDF + assemblage d'un PDF image-only.
// Sépare le RENDU (canvas) de la détection/masquage (anonymizer.js).

import { PDFDocument } from 'pdf-lib';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export const RASTER_SCALE   = 1.85;          // ≈ bord long 1568 px sur A4
export const MAX_LONG_EDGE  = 1568;          // au-delà, Claude redimensionne
export const RASTER_FORMAT  = 'image/jpeg';
export const RASTER_QUALITY = 0.85;

/**
 * Convertit une zone (points, top-origin — sortie de pdfReader) en rectangle
 * pixels pour un canvas rendu à `scale`. Pas d'inversion d'axe Y : le canvas
 * est aussi top-origin.
 * @param {{x0:number,x1:number,top:number,bottom:number}} zone
 * @param {number} scale
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function zoneToPixelRect(zone, scale) {
  return {
    x: zone.x0 * scale,
    y: zone.top * scale,
    w: (zone.x1 - zone.x0) * scale,
    h: (zone.bottom - zone.top) * scale,
  };
}

/**
 * Réassemble un PDF image-only (une page par image). Aucun texte n'est dessiné,
 * donc le PDF de sortie n'a aucune couche texte — vraie rédaction.
 * @param {Array<{blob:Blob,mediaType:string}>} images
 * @returns {Promise<Blob>}
 */
export async function imagesToPdf(images) {
  if (!images?.length) throw new Error('Aucune image à assembler en PDF.');
  const doc = await PDFDocument.create();
  for (const img of images) {
    const bytes = new Uint8Array(await img.blob.arrayBuffer());
    const embedded = img.mediaType === 'image/png'
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
    const page = doc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

// Fabrique de canvas par défaut (navigateur). En test, on injecte celle de
// @napi-rs/canvas via l'option `createCanvas`.
function defaultCreateCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  return c;
}

// Encode un canvas (OffscreenCanvas | HTMLCanvas | @napi-rs/canvas) en Blob.
async function canvasToBlob(canvas, format, quality) {
  if (typeof canvas.convertToBlob === 'function') {       // OffscreenCanvas
    return canvas.convertToBlob({ type: format, quality });
  }
  if (typeof canvas.toBlob === 'function') {              // HTMLCanvasElement
    return new Promise((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error("Échec d'encodage du canvas"))), format, quality));
  }
  if (typeof canvas.toBuffer === 'function') {            // @napi-rs/canvas
    return new Blob([canvas.toBuffer(format)], { type: format });
  }
  throw new Error("Canvas sans méthode d'encodage disponible");
}

/**
 * Rend chaque page du PDF sur un canvas, séquentiellement (pic mémoire borné).
 * Le scale effectif est plafonné pour que le bord long ne dépasse pas
 * MAX_LONG_EDGE (au-delà, Claude redimensionne : payer plus ne sert à rien).
 * @returns {Promise<Array<{canvas,ctx,width,height,scale}>>}
 */
export async function rasterizePages(file, { scale = RASTER_SCALE, createCanvas = defaultCreateCanvas } = {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try {
    pdf = await getDocument({ data }).promise;
  } catch (err) {
    throw new Error('PDF vide ou invalide — aucune page à convertir.');
  }
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const longEdge = Math.max(base.width, base.height);
    const effScale = Math.min(scale, MAX_LONG_EDGE / longEdge);
    const viewport = page.getViewport({ scale: effScale });
    const w = Math.ceil(viewport.width);
    const h = Math.ceil(viewport.height);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({ canvas, ctx, width: w, height: h, scale: effScale });
  }
  return pages;
}

/** Encode des pages rendues en images. */
export async function pagesToImages(pages, { format = RASTER_FORMAT, quality = RASTER_QUALITY } = {}) {
  const images = [];
  for (const p of pages) {
    const blob = await canvasToBlob(p.canvas, format, quality);
    images.push({ blob, mediaType: format, width: p.width, height: p.height });
  }
  return images;
}

/** Rasterise un PDF entier en images (uploads manuels non caviardés). */
export async function pdfToImages(file, opts = {}) {
  const pages = await rasterizePages(file, opts);
  if (pages.length === 0) throw new Error('PDF vide — aucune page à convertir.');
  return pagesToImages(pages, opts);
}
