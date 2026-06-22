// Détection de complexité — module partagé entre fournisseurs (provider-agnostic).
// La logique est volontairement INCHANGÉE : elle ne dépend d'aucun fournisseur,
// chaque adaptateur (anthropic/mistral) fait son propre mapping de 'haiku'|'sonnet'|'opus'
// vers ses modèles réels. Voir src/lib/providers/.

// Plafonds de tokens logiques par tier — valeurs canoniques, réutilisées par chaque
// adaptateur (compatibles Anthropic comme Mistral large ~128K de contexte).
export const MAX_TOKENS = {
  haiku:  4096,   // réponses courtes, définitions, calculs simples
  sonnet: 8192,   // analyse intermédiaire, optimisation mono-sujet
  opus:   16000,  // stratégie patrimoniale, plans multi-axes
};

// ─── Détection de complexité — scoring cumulatif ────────────────────────────

const KW_SIMPLE = [
  "c'est quoi", "qu'est-ce", 'définition', 'quel est le taux', 'quel taux',
  'explique', "c'est combien", 'kesako', 'kézako', 'comment ça marche',
  'vite fait', 'résumé', 'en 2 mots',
];
const KW_MEDIUM = [
  'optimise', 'compare', 'stratégie', 'recommande', 'simulation',
  'meilleur', 'analyse', 'calcule', 'que faire', 'vaut mieux',
  'avantage', 'inconvénient', 'différence entre',
];
const KW_COMPLEX = [
  'plan complet', 'stratégie globale', 'sur 10 ans', 'sur 20 ans',
  'transmission patrimoine', 'optimisation complète', 'bilan complet',
  'restructure', 'arbitrage global', 'succession', 'tout optimiser',
  'vue globale', 'scénarios', 'multi-actifs', 'démembrement',
  'donation', 'héritage', 'SCI', 'holding',
];

/**
 * Détermine le modèle optimal pour une question donnée.
 * Score cumulatif : longueur + mots-clés + nombre de skills activés.
 *
 * score < 1  → haiku  (questions simples, définitions, taux ponctuels)
 * score 1–3  → sonnet (optimisation mono-sujet, analyse comparative)
 * score ≥ 4  → opus   (stratégie patrimoniale multi-axes, plans longs)
 *
 * @param {string}   userMessage
 * @param {string[]} skills  — liste retournée par detectRelevantSkills
 * @returns {{ model: 'haiku'|'sonnet'|'opus', reason: string }}
 */
export function detectComplexity(userMessage, skills = []) {
  const lower      = userMessage.toLowerCase();
  const len        = userMessage.trim().length;
  const specialized = skills.filter(s => s !== 'gcp');
  const sc         = specialized.length;

  let score = 0;

  // Longueur du message
  if      (len >= 280) score += 3;
  else if (len >= 160) score += 2;
  else if (len >= 80)  score += 1;
  else if (len <  55)  score -= 2;
  else                 score -= 1;

  // Mots-clés
  if (KW_SIMPLE.some(kw => lower.includes(kw)))  score -= 2;
  if (KW_MEDIUM.some(kw => lower.includes(kw)))  score += 1;
  if (KW_COMPLEX.some(kw => lower.includes(kw))) score += 3;

  // Nombre de skills spécialisés activés
  if      (sc >= 3) score += 2;
  else if (sc >= 2) score += 1;
  else if (sc === 0) score -= 1;

  let model, reason;
  if      (score >= 4) { model = 'opus';   reason = `score +${score}`; }
  else if (score >= 1) { model = 'sonnet'; reason = `score +${score}`; }
  else                  { model = 'haiku';  reason = `score ${score}`; }

  console.log(
    `[Kapio Model] ${model.toUpperCase()} (score ${score >= 0 ? '+' : ''}${score})` +
    ` — ${len}c · ${sc} skills · max_tokens ${MAX_TOKENS[model]}`
  );
  return { model, reason };
}
