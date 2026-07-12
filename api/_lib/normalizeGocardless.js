// PUR : réponse GoCardless (comptes + soldes) → Position[] (contrat Kapio).
const TYPE_BY_CASH = { CACC: 'checking', SVGS: 'savings', CARD: 'checking' };

function detectType(acc) {
  if (acc.cashAccountType && TYPE_BY_CASH[acc.cashAccountType]) return TYPE_BY_CASH[acc.cashAccountType];
  const hay = `${acc.product || ''} ${acc.name || ''}`.toLowerCase();
  if (/livret|ldds|epargne|épargne/.test(hay)) return 'savings';
  return 'checking';
}

export function normalizeAccounts(rawAccounts = []) {
  return rawAccounts.map((acc) => {
    const pos = {
      id: `gc-${acc.id}`,
      source: 'gocardless',
      bank: acc.bankName || '',
      type: detectType(acc),
      label: acc.name || acc.product || 'Compte',
      value: Number(acc.balance?.amount ?? 0),
      currency: acc.balance?.currency || 'EUR',
      owner: acc.owner || 'd1',
      updatedAt: new Date().toISOString(),
      manual: false,
    };
    if (acc.iban) pos.iban_last4 = String(acc.iban).slice(-4);
    return pos;
  });
}
