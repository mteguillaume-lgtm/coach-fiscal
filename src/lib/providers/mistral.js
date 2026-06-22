// Adaptateur fournisseur — Mistral AI (européen, souverain, tier gratuit).
// Même contrat que providers/anthropic.js :
//   chat({ apiKey, messages, system, onChunk, model }) => Promise<string>
//   analyzeDoc(file, apiKey) => Promise<string>
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
 * Analyse un document via la vision Mistral (modèle multimodal).
 *
 * ⚠️ Limitation : l'endpoint chat/completions de Mistral n'accepte que des
 * IMAGES (data URL `image_url`), pas les PDF. Pour un PDF, on lève une erreur
 * explicite invitant à fournir une image ou à utiliser Claude.
 *
 * @param {File}   file   - Fichier image
 * @param {string} apiKey - Clé API Mistral
 * @returns {Promise<string>} Texte brut retourné par Mistral
 */
export async function analyzeDoc(file, apiKey) {
  const isImg = file.type.startsWith('image/');
  const isPDF = file.type === 'application/pdf';
  if (isPDF) {
    throw new Error(
      "Mistral n'analyse pas les PDF par vision : convertissez le document en " +
      'image (JPG/PNG), ou sélectionnez Claude comme fournisseur pour les PDF.'
    );
  }
  if (!isImg) throw new Error('Format non supporté (uniquement images avec Mistral)');

  const b64 = await toBase64(file);
  const dataUrl = `data:${file.type};base64,${b64}`;
  const content = [
    { type: 'text', text: EXTRACT_PROMPT },
    { type: 'image_url', image_url: dataUrl },
  ];

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
