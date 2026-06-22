// jsdom/node ne fournissent pas de canvas natif : on expose les globals dont
// pdfjs a besoin pour rendre en environnement de test, via @napi-rs/canvas.
import { Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

if (typeof globalThis.Path2D === 'undefined')    globalThis.Path2D    = Path2D;
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;

// In Node test environment, pdfjs needs an absolute file: URL for the worker
// This must be set BEFORE pdfReader is imported
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerFile = resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
globalThis.PDF_WORKER_URL = `file://${workerFile}`;
