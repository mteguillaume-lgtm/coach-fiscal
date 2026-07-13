// Retour de la banque : échange le code d'autorisation contre une session
// Enable Banking et la persiste, rattachée au pending créé par /connect.
import { requireSecret } from '../_lib/auth.js';
import { createSession } from '../_lib/enableBankingClient.js';
import { takePending, saveSession } from '../_lib/store.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { code, state } = req.body || {};
    if (!code || !state) return res.status(400).json({ error: 'code et state requis' });

    const pending = await takePending(state);
    if (!pending) return res.status(404).json({ error: 'Connexion inconnue ou expirée — relancez la connexion' });

    const { sessionId, validUntil } = await createSession(code);
    await saveSession({ id: sessionId, owner: pending.owner, bank: pending.bank, validUntil });
    return res.status(200).json({ ok: true, bank: pending.bank });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
