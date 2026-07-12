import { describe, it, expect } from 'vitest';
import { normalizeAccounts } from '../normalizeGocardless';

describe('normalizeGocardless', () => {
  it('mappe un compte courant', () => {
    const [p] = normalizeAccounts([{
      id: 'acc-1', bankName: 'BNP', owner: 'd1',
      cashAccountType: 'CACC', iban: 'FR7630004000031234567890143', name: 'Compte courant',
      balance: { amount: '3250.42', currency: 'EUR' },
    }]);
    expect(p).toMatchObject({
      id: 'gc-acc-1', source: 'gocardless', manual: false, bank: 'BNP',
      type: 'checking', label: 'Compte courant', value: 3250.42, currency: 'EUR',
      iban_last4: '0143', owner: 'd1',
    });
  });

  it('mappe un livret vers savings', () => {
    const [p] = normalizeAccounts([{
      id: 'acc-2', bankName: 'BNP', owner: 'd1', cashAccountType: 'SVGS',
      name: 'Livret A', balance: { amount: '3450', currency: 'EUR' },
    }]);
    expect(p.type).toBe('savings');
    expect(p.iban_last4).toBeUndefined();
  });

  it('type par défaut = checking si inconnu', () => {
    const [p] = normalizeAccounts([{ id: 'a', bankName: 'X', owner: 'd1', balance: { amount: '0', currency: 'EUR' } }]);
    expect(p.type).toBe('checking');
  });
});
