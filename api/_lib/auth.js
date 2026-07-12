// Vérifie le jeton secret perso. Lève un objet { status } capté par le handler.
// Comparaison à temps constant (timingSafeEqual) pour ne pas fuiter le secret
// via le temps de réponse — le backend est exposé sur Internet.
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireSecret(req) {
  const provided = req.headers['x-kapio-secret'];
  const expected = process.env.KAPIO_BACKEND_SECRET;
  if (!expected || !safeEqual(provided, expected)) {
    const err = new Error('Non autorisé');
    err.status = 401;
    throw err;
  }
}
