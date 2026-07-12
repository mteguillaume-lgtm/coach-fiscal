// Historique léger de la valeur nette (date + totaux, sans détail sensible).
// Un point par jour, en localStorage. Alimente le graphe d'évolution.
export const HISTORY_KEY = 'kapio.patrimoine.history';
export const MAX_POINTS = 500;

export function listHistory(storage = localStorage) {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function appendSnapshot({ netWorth, assets, debts }, storage = localStorage, now = new Date()) {
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const point = { date, netWorth, assets, debts };
  const rest = listHistory(storage).filter((p) => p.date !== date);
  const list = [...rest, point]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_POINTS);
  storage.setItem(HISTORY_KEY, JSON.stringify(list));
  return list;
}
