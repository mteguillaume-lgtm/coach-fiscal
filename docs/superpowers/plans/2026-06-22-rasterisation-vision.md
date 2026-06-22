# Rasterisation PDF → analyse vision — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caviarder les PDF anonymisés au niveau pixel (rendu canvas) pour détruire la couche texte, puis envoyer les pages en images à l'analyse vision unifiée Claude/Mistral.

**Architecture:** Un nouveau module `pdfRasterizer.js` (rendu pur + assemblage image-PDF), consommé par `anonymizer.js` (masquage sur canvas) et par `Collect.jsx` (uploads manuels). Les providers `analyzeDoc` passent d'un fichier PDF à un tableau d'images, supprimant toute branche PDF côté transport.

**Tech Stack:** React 19 + Vite, `pdfjs-dist` v5 (rendu), `pdf-lib` (assemblage), Vitest (env `node`), `@napi-rs/canvas` (rendu canvas en test node).

## Global Constraints

- Réglages rasterisation « Équilibré » (constantes dans `pdfRasterizer.js`) : `RASTER_SCALE = 1.85`, `MAX_LONG_EDGE = 1568`, `RASTER_FORMAT = 'image/jpeg'`, `RASTER_QUALITY = 0.85`.
- Toutes les pages sont traitées (pas de cap).
- Tier vision économique conservé (`VISION_MODEL` inchangé dans chaque provider).
- Coordonnées : zones en **points top-origin** (sortie de `pdfReader`), canvas en **pixels top-origin** → `pixel = point × scale`, pas d'inversion d'axe Y.
- Montants/locale : aucune nouvelle logique de formatage ici.
- Les blobs/images de session ne sont pas persistés (posture actuelle inchangée).
- Co-Author des commits : `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branche de travail : `feat/rasterisation-vision` (déjà créée).

---

### Task 1 : Outillage canvas de test + helper de coordonnées (`pdfRasterizer`)

**Files:**
- Create: `src/lib/pdfRasterizer.js`
- Create: `vitest.setup.js`
- Modify: `package.json` (devDependency `@napi-rs/canvas`)
- Modify: `vite.config.js` (champ `test.setupFiles`)
- Test: `src/lib/__tests__/pdfRasterizer.test.js`

**Interfaces:**
- Produces : `RASTER_SCALE`, `MAX_LONG_EDGE`, `RASTER_FORMAT`, `RASTER_QUALITY` (constantes) ; `zoneToPixelRect(zone, scale) → { x, y, w, h }` où `zone = { x0, x1, top, bottom }`. Outillage `@napi-rs/canvas` disponible pour toutes les tâches suivantes (rendu canvas en env node).

- [ ] **Step 1: Ajouter la dépendance de test**

Run:
```bash
npm install --save-dev @napi-rs/canvas
```
Expected: `@napi-rs/canvas` ajouté à `devDependencies` de `package.json`.

- [ ] **Step 2: Créer le fichier de setup vitest**

```js
// vitest.setup.js
// jsdom/node ne fournissent pas de canvas natif : on expose les globals dont
// pdfjs a besoin pour rendre en environnement de test, via @napi-rs/canvas.
import { Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';

if (typeof globalThis.Path2D === 'undefined')    globalThis.Path2D    = Path2D;
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;
```

- [ ] **Step 3: Brancher le setup dans vite.config.js**

Modifier le bloc `test` de `vite.config.js` :

```js
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,ts}'],
    setupFiles: ['./vitest.setup.js'],
  },
```

- [ ] **Step 4: Écrire le test qui échoue**

```js
// src/lib/__tests__/pdfRasterizer.test.js
import { describe, it, expect } from 'vitest';
import { zoneToPixelRect, RASTER_SCALE } from '../pdfRasterizer';

describe('zoneToPixelRect', () => {
  it('convertit une zone points top-origin en rectangle pixels (point × scale)', () => {
    const zone = { x0: 10, x1: 30, top: 5, bottom: 25 };
    expect(zoneToPixelRect(zone, 2)).toEqual({ x: 20, y: 10, w: 40, h: 40 });
  });

  it('expose le scale par défaut « Équilibré »', () => {
    expect(RASTER_SCALE).toBe(1.85);
  });
});
```

- [ ] **Step 5: Lancer le test → échec**

Run: `npx vitest run src/lib/__tests__/pdfRasterizer.test.js`
Expected: FAIL (`zoneToPixelRect is not a function` / module introuvable).

- [ ] **Step 6: Implémentation minimale**

```js
// src/lib/pdfRasterizer.js
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
```

- [ ] **Step 7: Lancer le test → succès**

Run: `npx vitest run src/lib/__tests__/pdfRasterizer.test.js`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/pdfRasterizer.js src/lib/__tests__/pdfRasterizer.test.js package.json package-lock.json vitest.setup.js vite.config.js
git commit -m "feat(raster): outillage @napi-rs/canvas + helper zoneToPixelRect + constantes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Assemblage PDF image-only (`imagesToPdf`)

**Files:**
- Modify: `src/lib/pdfRasterizer.js`
- Test: `src/lib/__tests__/pdfRasterizer.test.js`

**Interfaces:**
- Consumes : `extractRawText` (de `./pdfReader`) pour vérifier l'absence de texte.
- Produces : `imagesToPdf(images) → Promise<Blob>` où `images = [{ blob, mediaType, width, height }]` ; le Blob est un PDF `application/pdf` une page par image, sans aucune couche texte.

- [ ] **Step 1: Écrire le test qui échoue**

Ce test prouve la propriété de sécurité côté assemblage : un PDF construit à partir d'images ne contient **aucun texte extractible**. Il fabrique un vrai JPEG via `@napi-rs/canvas` (installé en Task 1).

```js
// Ajouter dans src/lib/__tests__/pdfRasterizer.test.js
import { imagesToPdf } from '../pdfRasterizer';
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

describe('imagesToPdf', () => {
  it('produit un PDF sans couche texte extractible', async () => {
    const pdfBlob = await imagesToPdf([jpegImage('SECRET12345')]);
    const file = new File([await pdfBlob.arrayBuffer()], 'out.pdf', { type: 'application/pdf' });
    const text = await extractRawText(file);
    expect(text.trim()).toBe('');
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run src/lib/__tests__/pdfRasterizer.test.js -t imagesToPdf`
Expected: FAIL (`imagesToPdf is not a function`).

- [ ] **Step 3: Implémentation**

Ajouter en tête de `src/lib/pdfRasterizer.js` :

```js
import { PDFDocument } from 'pdf-lib';
```

Puis ajouter la fonction :

```js
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
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run src/lib/__tests__/pdfRasterizer.test.js -t imagesToPdf`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfRasterizer.js src/lib/__tests__/pdfRasterizer.test.js
git commit -m "feat(raster): imagesToPdf — assemblage PDF image-only sans couche texte

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Rendu canvas des pages (`rasterizePages`, `pagesToImages`, `pdfToImages`)

**Files:**
- Modify: `src/lib/pdfRasterizer.js`
- Test: `src/lib/__tests__/pdfRasterizer.test.js`

**Interfaces:**
- Consumes : `getDocument`, `GlobalWorkerOptions` (`pdfjs-dist`) ; worker via `?url` ; outillage `@napi-rs/canvas` (installé en Task 1).
- Produces :
  - `rasterizePages(file, { scale?, createCanvas? }) → Promise<Array<{ canvas, ctx, width, height, scale }>>`
  - `pagesToImages(pages, { format?, quality? }) → Promise<Array<{ blob, mediaType, width, height }>>`
  - `pdfToImages(file, { scale?, format?, quality?, createCanvas? }) → Promise<Array<{ blob, mediaType, width, height }>>`
  - `createCanvas` injectable : signature `(width:number, height:number) => CanvasLike` (browser par défaut, `@napi-rs/canvas` en test).

- [ ] **Step 1: Écrire le test qui échoue**

```js
// Ajouter dans src/lib/__tests__/pdfRasterizer.test.js
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdfToImages } from '../pdfRasterizer';
import { createCanvas } from '@napi-rs/canvas';

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
    const empty = await PDFDocument.create();
    const file = new File([await empty.save()], 'empty.pdf', { type: 'application/pdf' });
    await expect(pdfToImages(file, { createCanvas })).rejects.toThrow(/vide/i);
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run src/lib/__tests__/pdfRasterizer.test.js -t pdfToImages`
Expected: FAIL (`pdfToImages is not a function`).

- [ ] **Step 3: Implémentation**

Ajouter en tête de `src/lib/pdfRasterizer.js` (après l'import `pdf-lib`) :

```js
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
```

Puis ajouter :

```js
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
  const pdf = await getDocument({ data }).promise;
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
```

- [ ] **Step 4: Lancer toute la suite du module → succès**

Run: `npx vitest run src/lib/__tests__/pdfRasterizer.test.js`
Expected: PASS (zoneToPixelRect, imagesToPdf, pdfToImages — tout vert).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfRasterizer.js src/lib/__tests__/pdfRasterizer.test.js
git commit -m "feat(raster): rendu canvas des pages (rasterizePages, pdfToImages)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Masquage sur canvas dans `anonymizer.js`

**Files:**
- Modify: `src/lib/anonymizer.js`
- Test: `src/lib/__tests__/anonymizer.test.js`

**Interfaces:**
- Consumes : `rasterizePages`, `pagesToImages`, `imagesToPdf`, `zoneToPixelRect`, `RASTER_FORMAT`, `RASTER_QUALITY` (de `./pdfRasterizer`).
- Produces : `anonymizePdf(file, options)` retourne en plus `pageImages: [{blob, mediaType, width, height}]` ; `blob` est désormais un PDF image-only ; `options.createCanvas` accepté (passé à `rasterizePages`, défaut navigateur). Champs existants conservés : `suggestedFilename`, `zonesCount`, `detections`, `period`, `typeId`, `typeLabel`, `confidence`, `extracted`.

- [ ] **Step 1: Écrire le test de sécurité qui échoue**

Test de non-régression de la fuite : un texte sensible présent dans le PDF source ne doit plus être extractible du PDF anonymisé.

```js
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
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run src/lib/__tests__/anonymizer.test.js`
Expected: FAIL — l'ancien chemin pdf-lib dessine des rectangles mais garde la couche texte ; `extractRawText` retrouve `DUPONT-SECRET-12345`.

- [ ] **Step 3: Implémenter le masquage sur canvas**

Dans `src/lib/anonymizer.js`, remplacer l'import pdf-lib en tête :

```js
import { rasterizePages, pagesToImages, imagesToPdf, zoneToPixelRect, RASTER_FORMAT, RASTER_QUALITY } from './pdfRasterizer';
```

(Supprimer `import { PDFDocument, rgb } from 'pdf-lib';` — l'assemblage passe par `imagesToPdf`.)

Remplacer toute la section « 3. Chargement du PDF … » jusqu'au `return` (boucle de dessin pdf-lib comprise) par :

```js
  // 3. Rendu pixel des pages (détruit la couche texte → vraie rédaction)
  const rasterPages = await rasterizePages(file, { createCanvas: options.createCanvas });

  let totalZones   = 0;
  const detections = [];
  const period     = detectPeriod(fullText);

  // 4. Masquage : on peint les zones en noir SUR les pixels de chaque page.
  for (let idx = 0; idx < pages.length; idx++) {
    const { lines } = pages[idx];
    const rp = rasterPages[idx];
    if (!rp) continue;
    const ctx = rp.ctx;
    ctx.fillStyle = '#000000';

    const allZones = [];
    for (const lineWords of lines) {
      allZones.push(...findZones(lineWords, patterns, padding));
    }
    if (logoApplies && (LOGO_ZONE.page === -1 || LOGO_ZONE.page === idx)) {
      allZones.push({
        label: 'Logo employeur', text: '(image)',
        x0: LOGO_ZONE.x0, x1: LOGO_ZONE.x1, top: LOGO_ZONE.top, bottom: LOGO_ZONE.bottom,
      });
    }

    for (const zone of allZones) {
      const r = zoneToPixelRect(zone, rp.scale);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    totalZones += allZones.length;
    detections.push({ page: idx + 1, zones: allZones });
  }

  // 5. Encodage des pages → images, puis PDF image-only pour le téléchargement.
  const pageImages = await pagesToImages(rasterPages, { format: RASTER_FORMAT, quality: RASTER_QUALITY });
  const blob = await imagesToPdf(pageImages);

  return {
    blob,
    pageImages,
    suggestedFilename: period.suggestedFilename,
    zonesCount: totalZones,
    detections,
    period,
    typeId,
    typeLabel:  type?.label ?? null,
    confidence: detected.confidence,
    extracted,
  };
}
```

Note : la section « 1. Extraction texte + positions » et « 2. Masquage PAR TYPE » (calcul de `patterns`, `effectiveLabels`, `logoApplies`, `type`, `typeId`, `extracted`) reste **inchangée** avant ce bloc.

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run src/lib/__tests__/anonymizer.test.js`
Expected: PASS — `extractRawText` du PDF de sortie est vide.

- [ ] **Step 5: Vérifier la non-régression du reste**

Run: `npx vitest run src/lib`
Expected: PASS (les tests existants de détection/zones restent verts ; aucune logique de détection n'a changé).

- [ ] **Step 6: Commit**

```bash
git add src/lib/anonymizer.js src/lib/__tests__/anonymizer.test.js
git commit -m "feat(anonymize): masquage sur canvas → PDF image-only + pageImages (fuite corrigée)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : `analyzeDoc` multi-images — Anthropic

**Files:**
- Modify: `src/lib/providers/anthropic.js:106-125`
- Create: `src/lib/providers/__tests__/anthropic.test.js`

**Interfaces:**
- Consumes : `toBase64` (de `../../extractor`), `EXTRACT_PROMPT`.
- Produces : `analyzeDoc({ images, apiKey }) → Promise<string>` où `images = [{ blob, mediaType }]`. Émet N blocs `{ type:'image', source:{ type:'base64', media_type, data } }` + 1 bloc texte `EXTRACT_PROMPT`. `throw` si `images` vide.

- [ ] **Step 1: Écrire le test qui échoue**

```js
// src/lib/providers/__tests__/anthropic.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeDoc } from '../anthropic';

afterEach(() => vi.restoreAllMocks());

function stubFileReader() {
  vi.stubGlobal('FileReader', class {
    readAsDataURL() { this.result = 'data:image/jpeg;base64,QUJD'; queueMicrotask(() => this.onload?.()); }
  });
}

describe('anthropic.analyzeDoc', () => {
  it('envoie N blocs image + le prompt et renvoie le texte', async () => {
    stubFileReader();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Net imposable annuel : 30000' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const images = [
      { blob: new Blob(['a']), mediaType: 'image/jpeg' },
      { blob: new Blob(['b']), mediaType: 'image/jpeg' },
    ];
    const out = await analyzeDoc({ images, apiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx' });
    expect(out).toBe('Net imposable annuel : 30000');

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    const imgBlocks = sent.messages[0].content.filter(c => c.type === 'image');
    expect(imgBlocks).toHaveLength(2);
    expect(imgBlocks[0].source).toMatchObject({ type: 'base64', media_type: 'image/jpeg', data: 'QUJD' });
    expect(sent.messages[0].content.some(c => c.type === 'text')).toBe(true);
  });

  it('lève une erreur si aucune image', async () => {
    await expect(analyzeDoc({ images: [], apiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx' }))
      .rejects.toThrow(/Aucune image/);
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run src/lib/providers/__tests__/anthropic.test.js`
Expected: FAIL (l'ancienne signature `analyzeDoc(file, apiKey)` ne gère pas `{ images }`).

- [ ] **Step 3: Réécrire `analyzeDoc` (anthropic.js)**

Remplacer la fonction `analyzeDoc` (lignes 98-125) par :

```js
/**
 * Envoie une ou plusieurs images (pages rasterisées) à Claude pour extraction.
 * Vision non-streaming, modèle Haiku.
 * @param {{ images: Array<{blob:Blob, mediaType:string}>, apiKey:string }} args
 * @returns {Promise<string>}
 */
export async function analyzeDoc({ images, apiKey }) {
  if (!images?.length) throw new Error('Aucune image à analyser.');

  const content = [];
  for (const img of images) {
    const b64 = await toBase64(img.blob);
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: b64 } });
  }
  content.push({ type: 'text', text: EXTRACT_PROMPT });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 1000, messages: [{ role: 'user', content }] }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Erreur API Claude');
  return data.content?.find(b => b.type === 'text')?.text || 'Aucune donnée extraite';
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run src/lib/providers/__tests__/anthropic.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/anthropic.js src/lib/providers/__tests__/anthropic.test.js
git commit -m "feat(provider): Claude analyzeDoc multi-images (vision)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : `analyzeDoc` multi-images — Mistral (suppression du blocage PDF)

**Files:**
- Modify: `src/lib/providers/mistral.js:103-143`
- Modify: `src/lib/providers/__tests__/mistral.test.js:177-211`

**Interfaces:**
- Produces : `analyzeDoc({ images, apiKey }) → Promise<string>` ; N blocs `{ type:'image_url', image_url: dataUrl }` + 1 bloc texte ; `throw` si vide. Plus de branche / erreur PDF.

- [ ] **Step 1: Réécrire le bloc de test `analyzeDoc` (mistral.test.js)**

Remplacer tout le `describe('mistral.analyzeDoc', …)` (lignes 177-211) par :

```js
describe('mistral.analyzeDoc', () => {
  function stubFileReader() {
    vi.stubGlobal('FileReader', class {
      readAsDataURL() { this.result = 'data:image/jpeg;base64,QUJD'; queueMicrotask(() => this.onload?.()); }
    });
  }

  it('envoie N blocs image_url et renvoie le contenu', async () => {
    stubFileReader();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Net imposable annuel : 30000' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const images = [
      { blob: new Blob(['a']), mediaType: 'image/jpeg' },
      { blob: new Blob(['b']), mediaType: 'image/jpeg' },
    ];
    const out = await analyzeDoc({ images, apiKey: 'key1234567890abcdefgh' });
    expect(out).toBe('Net imposable annuel : 30000');

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe('mistral-small-latest');
    const imgs = sent.messages[0].content.filter(c => c.type === 'image_url');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].image_url).toBe('data:image/jpeg;base64,QUJD');
  });

  it('lève une erreur si aucune image', async () => {
    await expect(analyzeDoc({ images: [], apiKey: 'key1234567890abcdefgh' }))
      .rejects.toThrow(/Aucune image/);
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run src/lib/providers/__tests__/mistral.test.js -t analyzeDoc`
Expected: FAIL (ancienne signature image-unique / branche PDF).

- [ ] **Step 3: Réécrire `analyzeDoc` (mistral.js)**

Remplacer la fonction `analyzeDoc` (lignes 103-143) par :

```js
/**
 * Analyse une ou plusieurs images (pages rasterisées) via la vision Mistral.
 * @param {{ images: Array<{blob:Blob, mediaType:string}>, apiKey:string }} args
 * @returns {Promise<string>}
 */
export async function analyzeDoc({ images, apiKey }) {
  if (!images?.length) throw new Error('Aucune image à analyser.');

  const content = [];
  for (const img of images) {
    const b64 = await toBase64(img.blob);
    content.push({ type: 'image_url', image_url: `data:${img.mediaType};base64,${b64}` });
  }
  content.push({ type: 'text', text: EXTRACT_PROMPT });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 1000, messages: [{ role: 'user', content }] }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || data.detail || 'Erreur API Mistral');
  }
  return data.choices?.[0]?.message?.content || 'Aucune donnée extraite';
}
```

Mettre aussi à jour le commentaire d'en-tête du fichier (lignes 11 et 103-113) qui mentionne « pas les PDF » : remplacer par « reçoit des images de page (PDF déjà rasterisé en amont) ».

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run src/lib/providers/__tests__/mistral.test.js`
Expected: PASS (toute la suite Mistral verte).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/mistral.js src/lib/providers/__tests__/mistral.test.js
git commit -m "feat(provider): Mistral analyzeDoc multi-images, suppression blocage PDF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Registre providers — signature + métadonnée Mistral

**Files:**
- Modify: `src/lib/providers/index.js:45` (note Mistral) et `:81-83` (signature)
- Modify: `src/lib/providers/__tests__/registry.test.js`

**Interfaces:**
- Produces : `analyzeDoc(provider, images, apiKey) → Promise<string>` (délègue à `resolve(provider).analyzeDoc({ images, apiKey })`).

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `registry.test.js` :

```js
import { vi, afterEach } from 'vitest';
import * as mistral from '../mistral';
import { analyzeDoc as analyzeViaRegistry } from '../index';

afterEach(() => vi.restoreAllMocks());

describe('registre — analyzeDoc', () => {
  it('aiguille vers le provider en passant { images, apiKey }', async () => {
    const spy = vi.spyOn(mistral, 'analyzeDoc').mockResolvedValue('ok');
    const images = [{ blob: new Blob(['x']), mediaType: 'image/jpeg' }];
    await analyzeViaRegistry('mistral', images, 'key1234567890abcdefgh');
    expect(spy).toHaveBeenCalledWith({ images, apiKey: 'key1234567890abcdefgh' });
  });

  it('annonce le support PDF côté Mistral (métadonnée)', () => {
    expect(getProviderMeta('mistral').note).toMatch(/PDF/);
  });
});
```

(`getProviderMeta` est déjà importé en tête du fichier ; ajouter `describe`/`it` aux imports si nécessaire — ils le sont déjà.)

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run src/lib/providers/__tests__/registry.test.js`
Expected: FAIL (l'ancienne signature `analyzeDoc(provider, file, apiKey)` n'appelle pas `{ images, apiKey }` ; la note Mistral dit « pas de PDF »).

- [ ] **Step 3: Implémentation**

Dans `src/lib/providers/index.js`, remplacer la fonction `analyzeDoc` :

```js
/**
 * Analyse d'images (pages rasterisées) auprès du fournisseur choisi.
 * @param {'anthropic'|'mistral'} provider
 * @param {Array<{blob:Blob, mediaType:string}>} images
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export function analyzeDoc(provider, images, apiKey) {
  return resolve(provider).analyzeDoc({ images, apiKey });
}
```

Et remplacer la note Mistral (`:45`) :

```js
    note: 'Européen, souverain, tier gratuit. Analyse PDF + images.',
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run src/lib/providers/__tests__/registry.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/index.js src/lib/providers/__tests__/registry.test.js
git commit -m "feat(provider): registre analyzeDoc(provider, images, apiKey) + meta Mistral PDF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 : Câblage Collect.jsx (dérivation images + fichiers anonymisés)

**Files:**
- Modify: `src/pages/Collect.jsx:1302-1336` (`handleFiles`), `:1378-1401` (`handleUseAnonymized`)

**Interfaces:**
- Consumes : `pdfToImages` (de `../lib/pdfRasterizer`), `analyzeDoc(provider, images, apiKey)` (registre).
- Le state `anonymizedFiles` porte désormais `pageImages` par item (cf. Task 9).

- [ ] **Step 1: Ajouter l'import**

En tête de `Collect.jsx`, près de `import { analyzeDoc } from '../lib/providers';` :

```js
import { pdfToImages } from '../lib/pdfRasterizer';
```

- [ ] **Step 2: Réécrire `handleFiles` pour accepter des sources (File OU { name, images })**

Remplacer la fonction `handleFiles` (`:1302-1336`) par :

```js
  const handleFiles = useCallback(async (input, target = 'solo') => {
    if (!input || !input.length) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      toast.error('Clé API manquante — configure-la dans Réglages.');
      return;
    }
    setUploading(true);

    // Normalise : un File brut ou un descripteur { name, images } (fichier anonymisé).
    const sources = Array.from(input).map(x =>
      x instanceof File ? { name: x.name, file: x } : x);

    const newDocs = sources.map(s => ({
      id: Math.random().toString(36).slice(2),
      name: s.name,
      status: 'loading', extracted: null, warning: null,
      file: s.file ?? null, images: s.images ?? null, target,
    }));
    setDocs(p => [...p, ...newDocs]);

    for (const doc of newDocs) {
      try {
        let images = doc.images;
        if (!images) {
          images = doc.file.type.startsWith('image/')
            ? [{ blob: doc.file, mediaType: doc.file.type }]
            : await pdfToImages(doc.file);   // PDF brut → rasterisé
        }
        const extracted = await analyzeDoc(state.provider, images, apiKey);
        const { map: mapped, warning } = mapExtracted(extracted);
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'done', extracted, warning } : d));
        if (Object.keys(mapped).length > 0) {
          const mark = Object.fromEntries(Object.keys(mapped).map(k => [k, true]));
          if      (target === 'd1') { setD1Data(p => ({ ...mapped, ...p }));   setAutoF1(p => ({ ...p, ...mark })); }
          else if (target === 'd2') { setD2Data(p => ({ ...mapped, ...p }));   setAutoF2(p => ({ ...p, ...mark })); }
          else                      { setFormData(p => ({ ...mapped, ...p })); setAutoFilled(p => ({ ...p, ...mark })); }
        }
      } catch (e) {
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'error', error: e.message } : d));
      }
    }
    setUploading(false);
  }, [getApiKey, state.provider]);
```

- [ ] **Step 3: Réécrire `handleUseAnonymized` pour passer les pageImages**

Remplacer la fonction (`:1379-1401`) par :

```js
  const handleUseAnonymized = useCallback(() => {
    const usable = anonymizedFiles.filter(f => f.pageImages?.length);
    if (usable.length === 0) {
      toast.error('Les fichiers ne sont plus disponibles — uploader manuellement.');
      return;
    }

    if (!isCouple) {
      handleFiles(usable.map(f => ({ name: f.name, images: f.pageImages })), 'solo');
      return;
    }

    const byTarget = { d1: [], d2: [] };
    for (const f of usable) {
      const t = f.target === 'd2' ? 'd2' : 'd1';
      byTarget[t].push({ name: f.name, images: f.pageImages });
    }
    if (byTarget.d1.length > 0) handleFiles(byTarget.d1, 'd1');
    if (byTarget.d2.length > 0) handleFiles(byTarget.d2, 'd2');
  }, [anonymizedFiles, handleFiles, isCouple]);
```

- [ ] **Step 4: Vérifier lint + build**

Run: `npm run lint && npm run build`
Expected: aucun nouvel avertissement bloquant ; build OK.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Collect.jsx
git commit -m "feat(collect): dérivation PDF→images + passage des pageImages anonymisées

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 : Câblage Anonymize.jsx (propager pageImages au state)

**Files:**
- Modify: `src/pages/Anonymize.jsx:304-320` (effet `SET_ANONYMIZED_FILES`), `:351-365` (`processFiles`), `:382-396` (`changeType`)

**Interfaces:**
- Consumes : `result.pageImages` de `anonymizePdf`.
- Produces : chaque item de `anonymizedFiles` porte `pageImages`.

- [ ] **Step 1: Stocker `pageImages` dans les items à l'anonymisation**

Dans `processFiles`, le `setFileItems` de succès (`:359-365`) : ajouter `pageImages: result.pageImages` au patch :

```js
            ? { ...f, status: 'done', zonesCount: result.zonesCount,
                suggestedFilename: result.suggestedFilename, blob: result.blob, objectUrl,
                pageImages: result.pageImages,
                typeId: result.typeId, typeLabel: result.typeLabel, extracted: result.extracted }
```

Faire le même ajout dans `changeType` (`:390-396`).

Ajouter aussi `pageImages: null` dans l'objet initial `newItems` de `processFiles` (`:344-348`) pour la cohérence de forme :

```js
      status: 'processing', zonesCount: 0, suggestedFilename: '', blob: null, objectUrl: null, error: null,
      pageImages: null, typeId: null, typeLabel: null, extracted: null,
```

- [ ] **Step 2: Propager `pageImages` dans le payload `SET_ANONYMIZED_FILES`**

Dans l'effet (`:306-312`) :

```js
    dispatch({
      type: 'SET_ANONYMIZED_FILES',
      payload: done.map(f => ({
        name: f.suggestedFilename, objectUrl: f.objectUrl, blob: f.blob,
        pageImages: f.pageImages, target: f.target, typeId: f.typeId,
      })),
    });
```

- [ ] **Step 3: Vérifier que le reducer est un passthrough**

Run: `grep -n "SET_ANONYMIZED_FILES" src/context/AppContext.jsx`
Expected: le case affecte `action.payload` à `anonymizedFiles` sans filtrer les champs (aucune modif nécessaire). Si le reducer reconstruit l'objet champ par champ, y ajouter `pageImages`.

- [ ] **Step 4: Vérifier lint + build**

Run: `npm run lint && npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Anonymize.jsx
git commit -m "feat(anonymize): propager pageImages jusqu'à la collecte

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : Vérification finale de bout en bout

**Files:** aucun (vérification).

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: PASS (tous les modules, dont `pdfRasterizer`, `anonymizer`, providers).

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: OK.

- [ ] **Step 3: Vérification manuelle navigateur**

Run: `npm run dev` puis dans le navigateur :
1. `/anonymize` → uploader un vrai bulletin PDF → vérifier l'aperçu caviardé.
2. Télécharger le PDF anonymisé → l'ouvrir → Ctrl+A / copier : **aucun texte sélectionnable** (preuve visuelle de la rédaction).
3. `/collect` → « Utiliser les fichiers anonymisés » → vérifier que les champs (net imposable, taux PAS…) se pré-remplissent.
4. Refaire l'étape 3 avec le fournisseur Mistral configuré → l'analyse fonctionne (plus d'erreur PDF).

- [ ] **Step 4: Commit éventuel de finitions**

Si des ajustements ont été nécessaires : committer avec un message descriptif et le Co-Author.

---

## Self-review (effectuée)

**Couverture spec :**
- Rasterisation/rendu → Task 3. Masquage canvas → Task 4. PDF image-only → Task 2 + 4. Multi-images vision Claude/Mistral → Tasks 5/6. Registre + meta → Task 7. Flux Collect (anonymisé + upload manuel) → Task 8. Propagation state → Task 9. Réglages « Équilibré » → constantes Task 1/3. Test sécurité non-régression fuite → Task 2 (assemblage) + Task 4 (bout en bout). Outillage @napi-rs/canvas → Task 3. Gestion erreurs (PDF vide, 0 image, encodage) → Tasks 3/5/6.
- Hors-périmètre respecté : pas d'OCR dédié, pas d'hybride texte, pas de cap pages.

**Placeholders :** aucun — code complet à chaque étape.

**Cohérence des types :** `pageImages: [{blob, mediaType, width, height}]` cohérent de Task 3 → 4 → 9 → 8 ; `analyzeDoc({ images, apiKey })` cohérent providers (5/6) ↔ registre (7) ↔ Collect (8) ; `zoneToPixelRect(zone, scale)` signature identique Task 1 ↔ 4.
