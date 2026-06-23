import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { zoneToPixelRect, RASTER_SCALE, imagesToPdf, pdfToImages } from '../pdfRasterizer';
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

async function textPdfFile() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('HELLO RASTER', { x: 40, y: 100, size: 18, font, color: rgb(0, 0, 0) });
  const bytes = await doc.save();
  return new File([bytes], 'in.pdf', { type: 'application/pdf' });
}

describe('pdfToImages', () => {
  it('rend chaque page en image JPEG aux bonnes dimensions', async () => {
    const file = await textPdfFile();
    const images = await pdfToImages(file, { createCanvas });
    expect(images).toHaveLength(1);
    expect(images[0].mediaType).toBe('image/jpeg');
    // 300 pt × 1.85 = 555 px de large (exact, pour détecter un mauvais scale)
    expect(images[0].width).toBe(Math.ceil(300 * 1.85));
    expect(images[0].blob.size).toBeGreaterThan(0);
    // Vérifier que le blob est un vrai JPEG (magic bytes 0xFF 0xD8)
    const buf = new Uint8Array(await images[0].blob.arrayBuffer());
    expect(buf[0]).toBe(0xFF);
    expect(buf[1]).toBe(0xD8);
  });

  it('rejette un PDF corrompu avec une erreur pdfjs naturelle', async () => {
    // Note: PDFDocument.create() with no pages, once saved and re-loaded by pdfjs,
    // reports numPages = 1 (not 0), so a truly 0-page PDF is not constructible via
    // pdf-lib. Instead we feed corrupt binary data to verify the realistic failure
    // path on unusable input. The error comes from pdfjs itself (not a faked message).
    const badFile = new File([new Uint8Array([1, 2, 3, 4, 5])], 'bad.pdf', { type: 'application/pdf' });
    await expect(pdfToImages(badFile, { createCanvas })).rejects.toThrow();
  });
});
