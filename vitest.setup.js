// 1) Polyfills canvas pour pdfjs en env node
// jsdom/node ne fournissent pas de canvas natif : on expose les globals dont
// pdfjs a besoin pour rendre en environnement de test, via @napi-rs/canvas.
import { Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';

if (typeof globalThis.Path2D === 'undefined')    globalThis.Path2D    = Path2D;
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;

import { beforeAll } from 'vitest';
import { resolve } from 'node:path';

// 2) Worker pdfjs — chemin fichier réel en env node (test-only)
beforeAll(async () => {
  // En env node, pointer le worker pdfjs sur le fichier réel (le main-thread
  // fake-worker l'importe). Posé après l'import de pdfReader → gagne l'ordre.
  // process.cwd() plutôt qu'import.meta.url : sous jsdom, import.meta.url est
  // une URL http:// et fileURLToPath lèverait (les tests UI partagent ce setup).
  const { GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
});
