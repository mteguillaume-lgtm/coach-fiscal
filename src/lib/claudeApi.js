// Wrapper Anthropic API — streaming SSE avec fallback non-streaming.

const MODELS = {
  sonnet: 'claude-sonnet-4-5',
  opus:   'claude-opus-4-5',
};
const API_URL = 'https://api.anthropic.com/v1/messages';

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
        max_tokens: 4096,
        system,
        messages,
        stream:     true,
      }),
    });
  } catch (networkErr) {
    throw new Error(`Pas de connexion — l'étape Conseil nécessite internet. (${networkErr.message})`);
  }

  // Erreurs HTTP avant le début du stream
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

  // Streaming via ReadableStream (tous les navigateurs modernes)
  if (res.body?.getReader) {
    return readStream(res.body, onChunk);
  }

  // Fallback non-streaming (obsolète, sécurité)
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

      // Découper par lignes — garder la ligne incomplète en buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return fullText;

        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        // Erreur renvoyée dans le stream
        if (event.type === 'error') {
          throw new Error(event.error?.message ?? 'Erreur dans le stream Anthropic');
        }

        // Fragment de texte
        if (
          event.type   === 'content_block_delta' &&
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
