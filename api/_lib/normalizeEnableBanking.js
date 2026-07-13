// PUR : réponses Enable Banking (détails + soldes) → Position[] (contrat Kapio).
const TYPE_BY_CASH = { CACC: 'checking', SVGS: 'savings', CARD: 'checking' };
const BALANCE_PREFERENCE = ['ITAV', 'CLAV', 'ITBD', 'CLBD'];

function detectType(acc) {
  if (acc.cash_account_type && TYPE_BY_CASH[acc.cash_account_type]) return TYPE_BY_CASH[acc.cash_account_type];
  const hay = `${acc.product || ''} ${acc.name || ''}`.toLowerCase();
  if (/livret|ldds|epargne|épargne/.test(hay)) return 'savings';
  return 'checking';
}

export function pickBalance(balances = []) {
  for (const type of BALANCE_PREFERENCE) {
    const hit = balances.find((b) => b.balance_type === type);
    if (hit) return hit;
  }
  return balances[0];
}

export function normalizeAccounts(rawAccounts = []) {
  return rawAccounts.map((acc) => {
    const balance = pickBalance(acc.balances);
    const pos = {
      id: `eb-${acc.uid}`,
      source: 'enablebanking',
      bank: acc.bankName || '',
      type: detectType(acc),
      label: acc.name || acc.product || 'Compte',
      value: Number(balance?.balance_amount?.amount ?? 0),
      currency: balance?.balance_amount?.currency || 'EUR',
      owner: acc.owner || 'd1',
      updatedAt: new Date().toISOString(),
      manual: false,
    };
    const iban = acc.account_id?.iban;
    if (iban) pos.iban_last4 = String(iban).slice(-4);
    return pos;
  });
}
