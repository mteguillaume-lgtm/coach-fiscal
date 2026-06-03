// Contrôle de cohérence « déclaré vs détecté ».
//
// Compare les flags de l'étape 0 (ce que l'utilisateur a DÉCLARÉ via la situation)
// aux types réellement DÉTECTÉS au dépôt (Couche 2). Tout écart produit une alerte
// NON BLOQUANTE — c'est le filet anti-oubli qui garantit la complétude du profil.
//
// Trois familles d'écarts :
//   • socle      : un document de base universel (avis d'imposition) n'a pas été détecté.
//   • missing    : un flag déclaré n'a aucun document correspondant détecté.
//   • undeclared : un document détecté prouve une situation non cochée.

import { DOCUMENTS, getType } from '../data/documentTypes/index.js';

// Libellés « grand public » des flags de situation (modules).
export const FLAG_LABELS = {
  salaires:             'revenus salariés',
  tns:                  'activité indépendante (TNS)',
  foncier:              'revenus fonciers / locatifs',
  immobilier:           'biens immobiliers',
  capitauxMobiliers:    'revenus de capitaux mobiliers',
  crypto:               'cryptomonnaies',
  epargneSalariale:     'épargne salariale',
  perVolontaire:        'PER (épargne retraite)',
  pensionsAlimentaires: 'pensions alimentaires',
  creditsImpot:         "crédits / réductions d'impôt",
  investissementsLocatifs: 'investissements locatifs',
  international:         'revenus de source étrangère',
};

const flagLabel = f => FLAG_LABELS[f] || f;

/** Documents du registre rattachés à un flag de condition donné. */
function docsForFlag(flag) {
  return DOCUMENTS.filter(d => d.condition === flag);
}

/**
 * @param {Record<string, boolean>} modules        - collectProfile.modules (déclaré)
 * @param {string[]} detectedTypeIds                - typeIds détectés au dépôt
 * @returns {Array<{
 *   kind: 'socle'|'missing'|'undeclared',
 *   flag: string|null,
 *   typeId: string|null,
 *   message: string,
 *   action: { type: 'enableModule'|'addDocument', flag?: string, label?: string } | null
 * }>}
 */
export function checkCoherence(modules = {}, detectedTypeIds = []) {
  const detected = new Set(detectedTypeIds);
  const alerts = [];

  // 1. Socle universel attendu (tier socle + condition null = avis d'imposition)
  for (const d of DOCUMENTS.filter(x => x.tier === 'socle' && x.condition === null)) {
    if (!detected.has(d.id)) {
      alerts.push({
        kind: 'socle', flag: null, typeId: d.id,
        message: `Aucun document « ${d.label} » détecté — c'est un document de base pour un profil fiable.`,
        action: { type: 'addDocument', label: d.label },
      });
    }
  }

  // 2. Manque : flag déclaré sans aucun document correspondant détecté
  for (const [flag, on] of Object.entries(modules)) {
    if (!on) continue;
    const docs = docsForFlag(flag);
    if (docs.length === 0) continue; // aucun document rattaché → rien à vérifier
    if (docs.some(d => detected.has(d.id))) continue;
    const labels = docs.map(d => d.label).join(', ');
    alerts.push({
      kind: 'missing', flag, typeId: null,
      message: `Vous avez indiqué « ${flagLabel(flag)} », mais aucun document correspondant n'a été détecté (${labels}).`,
      action: { type: 'addDocument', label: labels },
    });
  }

  // 3. Non déclaré : document détecté prouvant une situation non cochée (1 alerte / flag)
  const seenFlags = new Set();
  for (const id of detected) {
    const t = getType(id);
    if (!t || !t.condition || modules[t.condition] || seenFlags.has(t.condition)) continue;
    seenFlags.add(t.condition);
    alerts.push({
      kind: 'undeclared', flag: t.condition, typeId: id,
      message: `Un document « ${t.label} » a été détecté, mais « ${flagLabel(t.condition)} » n'est pas indiqué dans votre situation.`,
      action: { type: 'enableModule', flag: t.condition },
    });
  }

  return alerts;
}
