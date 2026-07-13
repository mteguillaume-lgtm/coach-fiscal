import { randomUUID } from 'node:crypto';
import { requireSecret } from '../_lib/auth.js';
import { listAspsps, startAuthorization } from '../_lib/enableBankingClient.js';
import { savePending } from '../_lib/store.js';

// Maximum DSP2 ; borné par la validité maximale annoncée par chaque banque.
const MAX_CONSENT_S = 180 * 86400;

export default async function handler(req, res) {
  try {
    requireSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { institutionId, institutionName, owner = 'd1' } = req.body || {};
    if (!institutionId) return res.status(400).json({ error: 'institutionId requis' });
    if (!process.env.APP_ORIGIN) {
      return res.status(500).json({ error: 'APP_ORIGIN non configuré côté serveur' });
    }

    const sep = String(institutionId).indexOf('::');
    if (sep === -1) return res.status(400).json({ error: 'institutionId invalide (attendu PAYS::Nom)' });
    const country = institutionId.slice(0, sep);
    const name = institutionId.slice(sep + 2);

    const aspsps = await listAspsps(country);
    const aspsp = aspsps.find((a) => a.name === name);
    if (!aspsp) return res.status(400).json({ error: `Banque inconnue : ${name}` });

    const validitySeconds = Math.min(MAX_CONSENT_S, aspsp.maximumConsentValidity ?? MAX_CONSENT_S);
    const state = randomUUID();
    const { url } = await startAuthorization({
      aspsp: { name, country },
      redirectUrl: `${process.env.APP_ORIGIN}/patrimoine`,
      state,
      validUntil: new Date(Date.now() + validitySeconds * 1000).toISOString(),
    });
    await savePending(state, { owner, bank: institutionName || name });
    return res.status(200).json({ link: url });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
