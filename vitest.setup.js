// jsdom/node ne fournissent pas de canvas natif : on expose les globals dont
// pdfjs a besoin pour rendre en environnement de test, via @napi-rs/canvas.
import { Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';

if (typeof globalThis.Path2D === 'undefined')    globalThis.Path2D    = Path2D;
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;

import { beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';

beforeAll(async () => {
  // En env node, pointer le worker pdfjs sur le fichier réel (le main-thread
  // fake-worker l'importe). Posé après l'import de pdfReader → gagne l'ordre.
  const { GlobalWorkerOptions } = await import('pdfjs-dist');
  const workerFile = fileURLToPath(new URL('./node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url));
  GlobalWorkerOptions.workerSrc = workerFile;
});
