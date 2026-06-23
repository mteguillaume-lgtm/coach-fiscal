// src/lib/__tests__/anonymizer.test.js
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { anonymizePdf } from '../anonymizer';
import { extractRawText } from '../pdfReader';

async function bulletinFile() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Bulletin de paie', { x: 40, y: 170, size: 12, font });
  page.drawText('Nom : DUPONT-SECRET-12345', { x: 40, y: 140, size: 12, font, color: rgb(0,0,0) });
  page.drawText('Net imposable : 30000', { x: 40, y: 110, size: 12, font });
  return new File([await doc.save()], 'bulletin.pdf', { type: 'application/pdf' });
}

describe('anonymizePdf — rasterisation', () => {
  it('produit un PDF image-only + des pageImages, sans texte extractible', async () => {
    const file = await bulletinFile();
    const res = await anonymizePdf(file, { nom: 'DUPONT', createCanvas });

    expect(Array.isArray(res.pageImages)).toBe(true);
    expect(res.pageImages.length).toBe(1);
    expect(res.pageImages[0].mediaType).toBe('image/jpeg');

    const out = new File([await res.blob.arrayBuffer()], 'out.pdf', { type: 'application/pdf' });
    const text = await extractRawText(out);
    expect(text).not.toMatch(/DUPONT|SECRET|30000/);
    expect(text.trim()).toBe('');
  });
});
