// Adaptateur fournisseur — Mistral AI (européen, souverain, tier gratuit).
// Même contrat que providers/anthropic.js :
//   chat({ apiKey, messages, system, onChunk, model }) => Promise<string>
//   analyzeDoc({ images, apiKey }) => Promise<string>
//   isValidKey(key) => boolean
//
// Différences avec Anthropic gérées ici :
//   • Auth     : header `Authorization: Bearer <clé>` (pas de x-api-key).
//   • System   : injecté comme 1er message {role:'system'} DANS messages.
//   • SSE      : format OpenAI — `choices[0].delta.content`.
//   • Vision   : content `image_url` en data URL base64 (style OpenAI).

import { MAX_TOKENS } from '../complexity';
import { readSSEStream } from './_sse';
import { EXTRACT_PROMPT, toBase64 } from '../extractor';

export const id = 'mistral';

// Mapping des tiers logiques vers les modèles Mistral réels.
const MODELS = {
  haiku:  'mistral-small-latest',
  sonnet: 'mistral-medium-latest',
  opus:   'mistral-large-latest',
};

// Modèle d'analyse de document (vision) — `mistral-small-latest` est multimodal
// et correspond au tier économique (équivalent Haiku côté Anthropic).
const VISION_MODEL = 'mistral-small-latest';

const API_URL = 'https://api.mistral.ai/v1/chat/completions';

function headers(apiKey) {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

/**
 * Valide le format d'une clé Mistral. Mistral n'impose pas de préfixe fixe :
 * on se contente d'une chaîne alphanumérique non vide d'une longueur plausible.
 */
export function isValidKey(k) {
  return typeof k === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(k.trim());
}

/**
 * Appel Mistral en streaming. `model` reste 'haiku'|'sonnet'|'opus' et est
 * mappé en interne. Le `system` Anthropic (champ top-level) est converti en
 * premier message {role:'system'} comme l'attend l'API Mistral.
 */
export async function chat({ apiKey, messages, system, onChunk, model = 'sonnet' }) {
  const fullMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        model:      MODELS[model] ?? MODELS.sonnet,
        max_tokens: MAX_TOKENS[model] ?? MAX_TOKENS.sonnet,
        messages:   fullMessages,
        stream:     true,
      }),
    });
  } catch (networkErr) {
    throw new Error(`Pas de connexion — l'étape Conseil nécessite internet. (${networkErr.message})`, { cause: networkErr });
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body.error?.message || body.message || body.detail || errMsg;
    } catch { /* ignore */ }

    if (res.status === 401) throw new Error(`Clé API invalide — vérifiez votre clé dans la configuration. (${errMsg})`);
    if (res.status === 429) throw new Error(`Trop de requêtes — réessayez dans quelques secondes. (${errMsg})`);
    if (res.status === 400) throw new Error(`Profil ou conversation trop volumineuse — réduisez l'historique. (${errMsg})`);
    if (res.status >= 500) throw new Error(`Erreur serveur Mistral — réessayez dans un instant. (${errMsg})`);
    throw new Error(`Erreur API Mistral (${res.status}) : ${errMsg}`);
  }

  if (res.body?.getReader) {
    return readSSEStream(res.body, onChunk, extractDelta);
  }

  // Fallback non-streaming
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  onChunk?.(text);
  return text;
}

// Isole la forme du delta SSE Mistral (style OpenAI : choices[0].delta.content).
function extractDelta(event) {
  return event.choices?.[0]?.delta?.content ?? null;
}

/**
 * Analyse une ou plusieurs images (pages rasterisées) via la vision Mistral.
 * reçoit des images de page (PDF déjà rasterisé en amont).
 *
 * @param {{ images: Array<{blob:Blob, mediaType:string}>, apiKey:string }} args
 * @returns {Promise<string>}
 */
export async function analyzeDoc({ images, apiKey }) {
  if (!images?.length) throw new Error('Aucune image à analyser.');

  const content = [];
  for (const img of images) {
    const b64 = await toBase64(img.blob);
    content.push({ type: 'image_url', image_url: `data:${img.mediaType};base64,${b64}` });
  }
  content.push({ type: 'text', text: EXTRACT_PROMPT });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 1000, messages: [{ role: 'user', content }] }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || data.detail || 'Erreur API Mistral');
  }
  return data.choices?.[0]?.message?.content || 'Aucune donnée extraite';
}
