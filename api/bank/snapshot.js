import { requireSecret } from '../_lib/auth.js';
import { listRequisitions } from '../_lib/store.js';
import { getAccessToken, getRequisitionAccounts, getAccountDetails, getAccountBalance } from '../_lib/gocardlessClient.js';
import { normalizeAccounts } from '../_lib/normalizeGocardless.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const token = await getAccessToken();
    const requisitions = await listRequisitions();
    const raw = [];
    for (const r of requisitions) {
      const accountIds = await getRequisitionAccounts(r.id, token);
      for (const id of accountIds) {
        const details = await getAccountDetails(id, token);
        const balance = await getAccountBalance(id, token);
        raw.push({ id, bankName: r.bank, owner: r.owner, ...details, balance });
      }
    }
    return res.status(200).json({ positions: normalizeAccounts(raw) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
