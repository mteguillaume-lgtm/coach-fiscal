import { describe, it, expect } from 'vitest';
import { normalizeAccounts, pickBalance } from '../normalizeEnableBanking.js';

const eur = (amount) => ({ currency: 'EUR', amount });

describe('pickBalance', () => {
  it('préfère le solde disponible (ITAV) puis CLAV puis le premier', () => {
    expect(pickBalance([
      { balance_type: 'CLBD', balance_amount: eur('1') },
      { balance_type: 'ITAV', balance_amount: eur('2') },
    ]).balance_amount.amount).toBe('2');
    expect(pickBalance([
      { balance_type: 'CLBD', balance_amount: eur('1') },
      { balance_type: 'CLAV', balance_amount: eur('3') },
    ]).balance_amount.amount).toBe('3');
    expect(pickBalance([{ balance_type: 'XPCD', balance_amount: eur('9') }]).balance_amount.amount).toBe('9');
    expect(pickBalance([])).toBeUndefined();
  });
});

describe('normalizeAccounts', () => {
  it('mappe un compte courant CACC vers le contrat Position', () => {
    const [pos] = normalizeAccounts([{
      uid: 'acc-1', bankName: 'BoursoBank', owner: 'd2',
      name: 'Compte chèque', cash_account_type: 'CACC',
      account_id: { iban: 'FR7612345678901234567890123' },
      balances: [{ balance_type: 'ITAV', balance_amount: eur('3000.50') }],
    }]);
    expect(pos).toMatchObject({
      id: 'eb-acc-1', source: 'enablebanking', bank: 'BoursoBank', type: 'checking',
      label: 'Compte chèque', value: 3000.5, currency: 'EUR', owner: 'd2',
      manual: false, iban_last4: '0123',
    });
  });

  it('détecte les livrets via SVGS ou le libellé produit', () => {
    const out = normalizeAccounts([
      { uid: 'a', cash_account_type: 'SVGS', balances: [] },
      { uid: 'b', product: 'Livret A', balances: [] },
    ]);
    expect(out[0].type).toBe('savings');
    expect(out[1].type).toBe('savings');
  });

  it('valeurs par défaut : value 0, EUR, owner d1, label Compte, pas d iban_last4', () => {
    const [pos] = normalizeAccounts([{ uid: 'x', balances: [] }]);
    expect(pos).toMatchObject({ value: 0, currency: 'EUR', owner: 'd1', label: 'Compte' });
    expect(pos.iban_last4).toBeUndefined();
  });
});
