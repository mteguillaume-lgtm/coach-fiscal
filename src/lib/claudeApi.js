// Wrapper Anthropic API — streaming SSE avec fallback non-streaming.

const MODELS = {
  haiku:  'claude-haiku-4-5-20251001',  // rapide, ~50× moins cher qu'Opus
  sonnet: 'claude-sonnet-4-6',           // équilibré — défaut recommandé
  opus:   'claude-opus-4-7',             // meilleur raisonnement complexe
};

// Tokens max adaptés à chaque modèle (économie + qualité)
const MAX_TOKENS = {
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

const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Appel Claude en streaming. Le modèle est sélectionné par la clé `model`
 * ('haiku'|'sonnet'|'opus') — max_tokens adapté automatiquement.
 */
export async function chatWithClaude({ apiKey, messages, system, onChunk, model = 'sonnet' }) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      MODELS[model] ?? MODELS.sonnet,
        max_tokens: MAX_TOKENS[model] ?? MAX_TOKENS.sonnet,
        system,
        messages,
        stream: true,
      }),
    });
  } catch (networkErr) {
    throw new Error(`Pas de connexion — l'étape Conseil nécessite internet. (${networkErr.message})`);
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body.error?.message || errMsg;
    } catch { /* ignore */ }

    if (res.status === 401) throw new Error(`Clé API invalide — vérifiez votre clé dans la configuration. (${errMsg})`);
    if (res.status === 429) throw new Error(`Trop de requêtes — réessayez dans quelques secondes. (${errMsg})`);
    if (res.status === 400) throw new Error(`Profil ou conversation trop volumineuse — réduisez l'historique. (${errMsg})`);
    if (res.status >= 500) throw new Error(`Erreur serveur Anthropic — réessayez dans un instant. (${errMsg})`);
    throw new Error(`Erreur API Claude (${res.status}) : ${errMsg}`);
  }

  if (res.body?.getReader) {
    return readStream(res.body, onChunk);
  }

  // Fallback non-streaming
  const data = await res.json();
  const text = data.content?.find(b => b.type === 'text')?.text ?? '';
  onChunk?.(text);
  return text;
}

// ─── Lecture du stream SSE ────────────────────────────────────────────────────

async function readStream(body, onChunk) {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let fullText  = '';
  let buffer    = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return fullText;

        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        if (event.type === 'error') {
          throw new Error(event.error?.message ?? 'Erreur dans le stream Anthropic');
        }

        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta'
        ) {
          const chunk = event.delta.text;
          fullText   += chunk;
          onChunk?.(chunk);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}
