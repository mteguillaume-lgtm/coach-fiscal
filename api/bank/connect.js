import { requireSecret } from '../_lib/auth.js';
import { getAccessToken, createRequisition } from '../_lib/gocardlessClient.js';
import { saveRequisition } from '../_lib/store.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { institutionId, institutionName, owner = 'd1' } = req.body || {};
    if (!institutionId) return res.status(400).json({ error: 'institutionId requis' });
    if (!process.env.APP_ORIGIN) {
      return res.status(500).json({ error: 'APP_ORIGIN non configuré côté serveur' });
    }

    const token = await getAccessToken();
    const redirect = `${process.env.APP_ORIGIN}/patrimoine`;
    const { id, link } = await createRequisition({ institutionId, redirect, reference: `${owner}:${institutionId}:${Date.now()}` }, token);
    await saveRequisition({ id, owner, institutionId, bank: institutionName || institutionId });
    return res.status(200).json({ link });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
