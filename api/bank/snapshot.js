import { requireSecret } from '../_lib/auth.js';
import { listSessions } from '../_lib/store.js';
import { getSessionAccounts, getAccountDetails, getAccountBalances } from '../_lib/enableBankingClient.js';
import { normalizeAccounts } from '../_lib/normalizeEnableBanking.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const sessions = await listSessions();
    const raw = [];
    const errors = [];
    // Une banque en échec (consentement expiré, révoqué…) ne doit pas
    // empêcher les autres de remonter.
    for (const s of sessions) {
      try {
        const { accountUids } = await getSessionAccounts(s.id);
        for (const uid of accountUids) {
          const details = await getAccountDetails(uid);
          const balances = await getAccountBalances(uid);
          raw.push({ uid, bankName: s.bank, owner: s.owner, ...details, balances });
        }
      } catch (e) {
        errors.push(`${s.bank} : ${e.message} — reconnectez la banque si le consentement a expiré`);
      }
    }
    return res.status(200).json({ positions: normalizeAccounts(raw), errors });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
