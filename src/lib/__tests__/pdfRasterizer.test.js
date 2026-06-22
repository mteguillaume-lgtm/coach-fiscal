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
    // 300 pt × 1.85 ≈ 555 px de large
    expect(images[0].width).toBeGreaterThan(500);
    expect(images[0].blob.size).toBeGreaterThan(0);
  });

  it('lève une erreur claire sur un PDF sans page', async () => {
    // Create a truly empty PDF file
    const minimalPDF = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A,  // %PDF-1.4\n
      0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A,                      // %\xE2\xE3\xCF\xD3\n
      0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A,          // 1 0 obj\n
      0x3C, 0x3C, 0x3E, 0x3E, 0x0A,                            // <</StackEntry>>\n
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A,                // endobj\n
      0x78, 0x72, 0x65, 0x66, 0x0A, 0x30, 0x20, 0x31, 0x0A,   // xref\n0 1\n
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33, 0x35, 0x20, 0x66, 0x0A,  // 0000000000 65535 f\n
      0x74, 0x72, 0x61, 0x69, 0x6C, 0x65, 0x72, 0x0A,          // trailer\n
      0x3C, 0x3C, 0x2F, 0x53, 0x69, 0x7A, 0x65, 0x20, 0x31, 0x3E, 0x3E, 0x0A,  // <</Size 1>>\n
      0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66, 0x0A,  // startxref\n
      0x39, 0x0A, 0x25, 0x45, 0x4F, 0x46                       // 9\n%EOF
    ]);
    const file = new File([minimalPDF], 'empty.pdf', { type: 'application/pdf' });
    await expect(pdfToImages(file, { createCanvas })).rejects.toThrow(/vide/i);
  });
});
