// jsdom/node ne fournissent pas de canvas natif : on expose les globals dont
// pdfjs a besoin pour rendre en environnement de test, via @napi-rs/canvas.
import { Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';

if (typeof globalThis.Path2D === 'undefined')    globalThis.Path2D    = Path2D;
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;
