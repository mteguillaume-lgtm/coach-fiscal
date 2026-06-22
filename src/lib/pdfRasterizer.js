// Rendu pixel des pages PDF + assemblage d'un PDF image-only.
// Sépare le RENDU (canvas) de la détection/masquage (anonymizer.js).

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
