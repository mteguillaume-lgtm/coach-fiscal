/**
 * storageMigration.js — Renommage de marque coachFiscal.* → kapio.* (rebrand Kapio).
 *
 * Copie idempotente et SANS perte des anciennes clés localStorage vers le nouveau
 * préfixe. À appeler une fois au démarrage (main.jsx), AVANT le premier render —
 * donc avant l'effet d'hydratation d'AppContext qui lit les clés kapio.*.
 *
 * - Ne récrit jamais une clé kapio.* déjà présente (relance sans effet).
 * - Conserve les anciennes clés coachFiscal.* (filet de sécurité, aucune suppression).
 *
 * NB : ce fichier est le SEUL à conserver volontairement le littéral « coachFiscal. »
 * (le préfixe historique à lire). Ne pas le renommer.
 */
const OLD_PREFIX = 'coachFiscal.';
const NEW_PREFIX = 'kapio.';

export function migrateStorageKeys() {
  try {
    if (typeof localStorage === 'undefined') return;
    // Snapshot des clés AVANT modification (on ajoute des clés pendant la boucle).
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith(OLD_PREFIX));
    for (const oldKey of oldKeys) {
      const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
    }
  } catch {
    // localStorage indisponible (mode privé / quota) — ignore silencieusement.
  }
}
