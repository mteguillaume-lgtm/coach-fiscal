// Rendu pixel des pages PDF + assemblage d'un PDF image-only.
// Sépare le RENDU (canvas) de la détection/masquage (anonymizer.js).

import { PDFDocument } from 'pdf-lib';

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
