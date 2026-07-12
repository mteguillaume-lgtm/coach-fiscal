// Calculs patrimoine — fonctions pures, sans effet de bord ni réseau.
import { isDebt } from './model';

const sum = (arr) => arr.reduce((a, v) => a + Number(v || 0), 0);

export function summary(positions) {
  const values = positions.map((p) => Number(p.value || 0));
  const assets = sum(values.filter((v) => v > 0));
  const debts = Math.max(0, -sum(values.filter((v) => v < 0))); // magnitude positive, no -0
  return { netWorth: assets - debts, assets, debts, count: positions.length };
}

function groupBy(positions, keyFn) {
  const out = {};
  for (const p of positions) {
    const k = keyFn(p);
    out[k] = (out[k] || 0) + Number(p.value || 0);
  }
  return out;
}

export const byBank = (positions) => groupBy(positions, (p) => p.bank || '—');
export const byType = (positions) => groupBy(positions, (p) => p.type);

export function byOwner(positions) {
  const out = { d1: 0, d2: 0, joint: 0 };
  for (const p of positions) {
    const k = out[p.owner] !== undefined ? p.owner : 'd1';
    out[k] += Number(p.value || 0);
  }
  return out;
}

// Ré-export pratique (évite un import supplémentaire côté UI).
export { isDebt };
