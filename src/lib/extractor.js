// Extraction IA de données fiscales depuis un document (PDF ou image).
// Port de analyzeDoc() + mapExtracted() depuis collecte-fiscal-v3.jsx.

// Extraction structurée simple → Haiku (rapide + économique, pas besoin de raisonnement)
const MODEL = 'claude-haiku-4-5-20251001';

const PROMPT = `Tu es expert fiscal français. Analyse ce document (bulletin de salaire ou avis d'imposition).

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
 * Lit un fichier en base64.
 * @param {File} file
 * @returns {Promise<string>}
 */
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Envoie un document (PDF ou image) à Claude pour extraction des données fiscales.
 * Port de analyzeDoc() — ajoute les headers API manquants dans l'original.
 *
 * @param {File}   file   - Fichier PDF ou image
 * @param {string} apiKey - Clé API Anthropic (sk-ant-...)
 * @returns {Promise<string>} Texte brut retourné par Claude
 */
export async function analyzeDoc(file, apiKey) {
  const isImg = file.type.startsWith('image/');
  const isPDF = file.type === 'application/pdf';
  if (!isImg && !isPDF) throw new Error('Format non supporté (uniquement images et PDF)');

  const b64 = await toBase64(file);
  const content = isImg
    ? [{ type: 'image',    source: { type: 'base64', media_type: file.type,            data: b64 } }, { type: 'text', text: PROMPT }]
    : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf',    data: b64 } }, { type: 'text', text: PROMPT }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: 'user', content }] }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Erreur API Claude');
  return data.content?.find(b => b.type === 'text')?.text || 'Aucune donnée extraite';
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
