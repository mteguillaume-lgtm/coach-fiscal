// Lecteur SSE générique partagé par les adaptateurs.
// Anthropic et Mistral utilisent tous deux des lignes `data: …` terminées par
// `data: [DONE]`. Seule la FORME du JSON de delta diffère — d'où le paramètre
// `extractDelta` qui isole cette différence (voir anthropic.js / mistral.js).

/**
 * Lit un flux SSE et reconstitue le texte complet, en poussant chaque fragment
 * via `onChunk`.
 *
 * @param {ReadableStream} body  - corps de la réponse (res.body)
 * @param {(chunk: string) => void} [onChunk]
 * @param {(event: object) => (string|null)} extractDelta
 *   Reçoit un évènement JSON parsé ; retourne le fragment de texte ou null
 *   si l'évènement ne porte pas de texte. Peut lever une Error pour un
 *   évènement d'erreur dans le flux.
 * @returns {Promise<string>} texte complet accumulé
 */
export async function readSSEStream(body, onChunk, extractDelta) {
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
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(line.indexOf(':') + 1).trim();
        if (raw === '[DONE]') return fullText;

        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        const chunk = extractDelta(event); // peut lever sur un évènement d'erreur
        if (chunk) {
          fullText += chunk;
          onChunk?.(chunk);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}
