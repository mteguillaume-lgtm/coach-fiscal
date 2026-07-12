// Modèle normalisé « Position » — contrat partagé entre sources (GoCardless,
// saisie manuelle) et calculs. value > 0 = actif, value < 0 = dette.

export const POSITION_TYPES = [
  'checking', 'savings', 'life_insurance', 'pea',
  'securities', 'per', 'loan', 'real_estate',
];

export const DEBT_TYPES = new Set(['loan']);
export const ASSET_TYPES = new Set(
  POSITION_TYPES.filter((t) => !DEBT_TYPES.has(t)),
);

export const isAsset = (pos) => Number(pos.value) > 0;
export const isDebt = (pos) => Number(pos.value) < 0;

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Complète un poste partiel avec les défauts du contrat. */
export function makePosition(partial = {}) {
  const type = partial.type ?? 'checking';
  const v = Number(partial.value ?? 0);
  return {
    id: partial.id ?? `pos-${randomId()}`,
    source: partial.source ?? 'manual',
    bank: partial.bank ?? '',
    type,
    label: partial.label ?? '',
    value: DEBT_TYPES.has(type) ? -Math.abs(v) : v,
    currency: partial.currency ?? 'EUR',
    ...(partial.iban_last4 ? { iban_last4: partial.iban_last4 } : {}),
    owner: partial.owner ?? 'd1',
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    manual: partial.manual ?? (partial.source ? partial.source === 'manual' : true),
  };
}
