import { requireSecret } from '../_lib/auth.js';
import { getAccessToken, listInstitutions } from '../_lib/gocardlessClient.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const country = (req.query?.country || 'fr').toString();
    const token = await getAccessToken();
    return res.status(200).json({ institutions: await listInstitutions(country, token) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
