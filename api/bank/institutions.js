import { requireSecret } from '../_lib/auth.js';
import { listAspsps } from '../_lib/enableBankingClient.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const country = (req.query?.country || 'fr').toString();
    const aspsps = await listAspsps(country);
    return res.status(200).json({
      institutions: aspsps.map((a) => ({ id: `${a.country}::${a.name}`, name: a.name })),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
