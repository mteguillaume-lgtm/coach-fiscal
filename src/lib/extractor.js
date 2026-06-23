// Analyse IA de données fiscales depuis un document (PDF ou image).
//
// Ce module porte les éléments PROVIDER-AGNOSTIC de l'extraction par vision :
//   • EXTRACT_PROMPT — l'instruction fiscale envoyée au modèle (identique quel
//     que soit le fournisseur) ;
//   • toBase64       — utilitaire d'encodage du fichier ;
//   • mapExtracted   — parsing de la réponse texte vers un objet formulaire.
// L'appel réseau lui-même (format Anthropic vs Mistral) vit dans
// src/lib/providers/* et est exposé via le registre providers/index.js
// (analyzeDoc(provider, images, apiKey)).
//
// ⚠️ À ne pas confondre avec src/lib/docExtract.js, qui fait l'extraction 100 %
//    LOCALE par regex (aucun appel IA) utilisée à l'anonymisation.

export const EXTRACT_PROMPT = `Tu es expert fiscal français. Analyse ce document (bulletin de salaire ou avis d'imposition).

RÈGLE CRITIQUE — CUMULS ANNUELS :
Ce document est idéalement le bulletin de décembre (ou le dernier bulletin de l'employeur si changement en cours d'année).
Tu dois IMPÉRATIVEMENT extraire les valeurs CUMULÉES annuelles, pas les valeurs du seul mois en cours.
Sur un bulletin de paie, les cumuls annuels sont dans la colonne "Cumul" ou "Cumul annuel" ou libellés "depuis le 01/01".
Ne jamais utiliser les montants mensuels bruts ou nets — uniquement les totaux annuels cumulés.
Si le document est un avis d'imposition, utiliser directement les montants indiqués.

Format de réponse STRICT, ligne par ligne (ne rien ajouter d'autre) :
Brut imposable annuel : XXXXX
Net imposable annuel : XXXXX
Taux PAS : XX.XX
PAS prélevé annuel : XXXX
Revenu fiscal de référence : XXXXX (uniquement si avis d'imposition)
Mois du bulletin : XX (indiquer le mois ex: 12 pour décembre)
Même employeur toute l'année : OUI ou NON ou INCONNU

Si une donnée est absente du document, ne pas l'inclure dans la réponse.
NE PAS inclure : noms, prénoms, adresses, numéros de sécurité sociale, IBAN, références employeur.`;

/**
 * Lit un fichier en base64 (sans le préfixe data URL).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parse la réponse texte de Claude et retourne un objet clé/valeur pour le formulaire.
 * Port de mapExtracted() — inchangé.
 *
 * @param {string} text - Texte brut retourné par analyzeDoc()
 * @returns {{ map: object, warning: string|null }}
 */
export function mapExtracted(text) {
  const map = {};
  let moisBulletin = null;
  let memeEmployeur = null;

  for (const line of text.split('\n')) {
    const lower = line.toLowerCase();
    const nums = (line.match(/[\d\s]+[.,]?\d*/g) || [])
      .map(s => parseFloat(s.replace(/\s/g, '').replace(',', '.')))
      .filter(n => !isNaN(n) && n > 0);
    const last = nums.length ? nums[nums.length - 1] : null;

    if      (lower.includes('mois du bulletin') && last)                                                            { moisBulletin = Math.round(last); }
    else if (lower.includes('même employeur'))                                                                      { memeEmployeur = lower.includes('oui') ? true : lower.includes('non') ? false : null; }
    else if ((lower.includes('brut imposable') || lower.includes('brut annuel'))     && last && !map.brut)         { map.brut     = String(Math.round(last)); }
    else if ((lower.includes('net imposable')  || lower.includes('net annuel'))      && last && !map.net_imp)      { map.net_imp  = String(Math.round(last)); }
    else if ((lower.includes('taux pas') || lower.includes('taux de prélèvement'))  && last && last < 100 && !map.taux_pas) { map.taux_pas = String(last); }
    else if ((lower.includes('pas prélevé')    || lower.includes('pas annuel') || lower.includes('prélèvement à la source annuel')) && last && !map.pas_tot) { map.pas_tot = String(Math.round(last)); }
    else if (lower.includes('revenu fiscal de référence')                            && last && !map.brut)         { map.brut     = String(Math.round(last)); }
  }

  const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  let warning = null;
  if (moisBulletin && moisBulletin !== 12) {
    warning = memeEmployeur === false
      ? `⚠️ Bulletin de ${MOIS[moisBulletin]} — changement d'employeur détecté. Les cumuls sont partiels : complète avec le bulletin du dernier mois chez cet employeur.`
      : `⚠️ Ce bulletin est celui de ${MOIS[moisBulletin]}, pas de décembre. Si même employeur toute l'année, uploade le bulletin de décembre pour avoir les cumuls annuels complets.`;
  } else if (moisBulletin === 12) {
    warning = '✅ Bulletin de décembre — cumuls annuels complets.';
  }

  return { map, warning };
}
