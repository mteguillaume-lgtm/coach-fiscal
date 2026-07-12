// Vérifie le jeton secret perso. Lève un objet { status } capté par le handler.
export function requireSecret(req) {
  const provided = req.headers['x-kapio-secret'];
  const expected = process.env.KAPIO_BACKEND_SECRET;
  if (!expected || provided !== expected) {
    const err = new Error('Non autorisé');
    err.status = 401;
    throw err;
  }
}
