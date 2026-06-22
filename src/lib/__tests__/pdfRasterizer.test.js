import { describe, it, expect } from 'vitest';
import { zoneToPixelRect, RASTER_SCALE, imagesToPdf } from '../pdfRasterizer';
import { extractRawText } from '../pdfReader';
import { createCanvas } from '@napi-rs/canvas';

function jpegImage(text) {
  const canvas = createCanvas(200, 80);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 200, 80);
  ctx.fillStyle = '#000'; ctx.font = '20px sans-serif'; ctx.fillText(text, 10, 40);
  const buf = canvas.toBuffer('image/jpeg');
  return { blob: new Blob([buf], { type: 'image/jpeg' }), mediaType: 'image/jpeg', width: 200, height: 80 };
}

describe('zoneToPixelRect', () => {
  it('convertit une zone points top-origin en rectangle pixels (point × scale)', () => {
    const zone = { x0: 10, x1: 30, top: 5, bottom: 25 };
    expect(zoneToPixelRect(zone, 2)).toEqual({ x: 20, y: 10, w: 40, h: 40 });
  });

  it('expose le scale par défaut « Équilibré »', () => {
    expect(RASTER_SCALE).toBe(1.85);
  });
});

describe('imagesToPdf', () => {
  it('produit un PDF sans couche texte extractible', async () => {
    const pdfBlob = await imagesToPdf([jpegImage('SECRET12345')]);
    const file = new File([await pdfBlob.arrayBuffer()], 'out.pdf', { type: 'application/pdf' });
    const text = await extractRawText(file);
    expect(text.trim()).toBe('');
  });
});
