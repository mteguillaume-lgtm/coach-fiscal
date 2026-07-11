// CRUD des postes patrimoniaux saisis à la main (PEA, AV, PER, prêts, immo).
// Stockage localStorage dédié, distinct du profil fiscal. `storage` injectable.
import { makePosition } from './model';

export const MANUAL_KEY = 'kapio.patrimoine.manual';

let lastTimestamp = 0;

function getNewTimestamp() {
  const now = Date.now();
  if (now <= lastTimestamp) {
    lastTimestamp += 1;
  } else {
    lastTimestamp = now;
  }
  return new Date(lastTimestamp).toISOString();
}

export function listManual(storage = localStorage) {
  try {
    const raw = storage.getItem(MANUAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(list, storage) {
  storage.setItem(MANUAL_KEY, JSON.stringify(list));
  return list;
}

export function addManual(partial, storage = localStorage) {
  const pos = makePosition({ ...partial, source: 'manual', manual: true, updatedAt: getNewTimestamp() });
  return save([...listManual(storage), pos], storage);
}

export function updateManual(id, patch, storage = localStorage) {
  const list = listManual(storage).map((p) =>
    p.id === id ? { ...p, ...patch, updatedAt: getNewTimestamp() } : p,
  );
  return save(list, storage);
}

export function removeManual(id, storage = localStorage) {
  return save(listManual(storage).filter((p) => p.id !== id), storage);
}
