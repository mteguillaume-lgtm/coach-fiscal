// Adaptateur fournisseur — Anthropic (Claude).
// Contrat commun (cf. providers/index.js) :
//   chat({ apiKey, messages, system, onChunk, model }) => Promise<string>
//   analyzeDoc(file, apiKey) => Promise<string>
//   isValidKey(key) => boolean
// `model` reste 'haiku'|'sonnet'|'opus' — le mapping vers les modèles réels est
// interne à cet adaptateur.

import { MAX_TOKENS } from '../complexity';
import { readSSEStream } from './_sse';
import { EXTRACT_PROMPT, toBase64 } from '../extractor';

export const id = 'anthropic';

const MODELS = {
  haiku:  'claude-haiku-4-5-20251001',  // rapide, ~50× moins cher qu'Opus
  sonnet: 'claude-sonnet-4-6',           // équilibré — défaut recommandé
  opus:   'claude-opus-4-7',             // meilleur raisonnement complexe
};

// Modèle d'analyse de document (vision) — extraction structurée simple → Haiku.
const VISION_MODEL = 'claude-haiku-4-5-20251001';

const API_URL = 'https://api.anthropic.com/v1/messages';

function headers(apiKey) {
  return {
    'Content-Type':  'application/json',
    'x-api-key':     apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/** Valide le format d'une clé Anthropic. */
export function isValidKey(k) {
  return typeof k === 'string' && k.startsWith('sk-ant-') && k.length > 20;
}

/**
 * Appel Claude en streaming. Le modèle est sélectionné par la clé `model`
 * ('haiku'|'sonnet'|'opus') — max_tokens adapté automatiquement.
 */
export async function chat({ apiKey, messages, system, onChunk, model = 'sonnet' }) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        model:      MODELS[model] ?? MODELS.sonnet,
        max_tokens: MAX_TOKENS[model] ?? MAX_TOKENS.sonnet,
        system,
        messages,
        stream: true,
      }),
    });
  } catch (networkErr) {
    throw new Error(`Pas de connexion — l'étape Conseil nécessite internet. (${networkErr.message})`, { cause: networkErr });
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
    return readSSEStream(res.body, onChunk, extractDelta);
  }

  // Fallback non-streaming
  const data = await res.json();
  const text = data.content?.find(b => b.type === 'text')?.text ?? '';
  onChunk?.(text);
  return text;
}

// Isole la forme du delta SSE Anthropic (content_block_delta / text_delta).
function extractDelta(event) {
  if (event.type === 'error') {
    throw new Error(event.error?.message ?? 'Erreur dans le stream Anthropic');
  }
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text;
  }
  return null;
}

/**
 * Envoie un document (PDF ou image) à Claude pour extraction des données fiscales.
 * Vision non-streaming, modèle Haiku.
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
    ? [{ type: 'image',    source: { type: 'base64', media_type: file.type,            data: b64 } }, { type: 'text', text: EXTRACT_PROMPT }]
    : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf',    data: b64 } }, { type: 'text', text: EXTRACT_PROMPT }];

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 1000, messages: [{ role: 'user', content }] }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Erreur API Claude');
  return data.content?.find(b => b.type === 'text')?.text || 'Aucune donnée extraite';
}
