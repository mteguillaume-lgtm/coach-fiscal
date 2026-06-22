import { describe, it, expect, vi, afterEach } from 'vitest';
import { chat, analyzeDoc, isValidKey } from '../mistral';

// ── Helpers ────────────────────────────────────────────────────────────────

// Construit une réponse façon fetch dont le corps est un flux SSE.
function sseResponse(lines, { ok = true, status = 200 } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(l));
      controller.close();
    },
  });
  return { ok, status, body, json: async () => ({}) };
}

// Réponse JSON d'erreur (non-streaming).
function errorResponse(status, payload) {
  return { ok: false, status, body: null, json: async () => payload };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── isValidKey ───────────────────────────────────────────────────────────────

describe('mistral.isValidKey', () => {
  it('accepte une clé alphanumérique d’au moins 20 caractères', () => {
    expect(isValidKey('abcDEF1234567890abcd')).toBe(true); // 20 car.
    expect(isValidKey('K9x_aB3-cD4eF5gH6iJ7kL8m')).toBe(true);
  });

  it('refuse une clé trop courte, vide ou non-chaîne', () => {
    expect(isValidKey('court')).toBe(false);
    expect(isValidKey('')).toBe(false);
    expect(isValidKey(null)).toBe(false);
    expect(isValidKey(undefined)).toBe(false);
  });

  it('refuse une clé contenant des espaces', () => {
    expect(isValidKey('clef avec des espaces aaaa')).toBe(false);
  });
});

// ── Mapping des modèles + format de requête ───────────────────────────────────

describe('mistral.chat — mapping modèles & format de requête', () => {
  it('mappe les tiers logiques vers les modèles Mistral et injecte le system en 1er message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n']));
    vi.stubGlobal('fetch', fetchMock);

    await chat({
      apiKey: 'key1234567890abcdefgh',
      messages: [{ role: 'user', content: 'Bonjour' }],
      system: 'Tu es un assistant.',
      model: 'opus',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer key1234567890abcdefgh');
    expect(init.headers['Content-Type']).toBe('application/json');

    const sent = JSON.parse(init.body);
    expect(sent.model).toBe('mistral-large-latest'); // opus → large
    expect(sent.stream).toBe(true);
    // system devient le 1er message {role:'system'}
    expect(sent.messages[0]).toEqual({ role: 'system', content: 'Tu es un assistant.' });
    expect(sent.messages[1]).toEqual({ role: 'user', content: 'Bonjour' });
  });

  it('mappe haiku → mistral-small-latest et sonnet → mistral-medium-latest', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n']));
    vi.stubGlobal('fetch', fetchMock);

    await chat({ apiKey: 'key1234567890abcdefgh', messages: [], model: 'haiku' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('mistral-small-latest');

    await chat({ apiKey: 'key1234567890abcdefgh', messages: [], model: 'sonnet' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('mistral-medium-latest');
  });

  it('n’ajoute pas de message system quand aucun system n’est fourni', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n']));
    vi.stubGlobal('fetch', fetchMock);

    await chat({ apiKey: 'key1234567890abcdefgh', messages: [{ role: 'user', content: 'Salut' }] });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages).toEqual([{ role: 'user', content: 'Salut' }]);
  });
});

// ── Parsing du flux SSE (style OpenAI : choices[0].delta.content) ─────────────

describe('mistral.chat — parsing SSE', () => {
  it('accumule les deltas et appelle onChunk pour chaque fragment', async () => {
    const lines = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n',
      'data: {"choices":[{"delta":{"content":"Bon"}}]}\n',
      'data: {"choices":[{"delta":{"content":"jour"}}]}\n',
      'data: {"choices":[{"delta":{"content":" !"}}]}\n',
      'data: [DONE]\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(lines)));

    const chunks = [];
    const full = await chat({
      apiKey: 'key1234567890abcdefgh',
      messages: [{ role: 'user', content: 'Salut' }],
      onChunk: c => chunks.push(c),
    });

    expect(chunks).toEqual(['Bon', 'jour', ' !']);
    expect(full).toBe('Bonjour !');
  });

  it('gère les lignes SSE découpées sur plusieurs chunks réseau', async () => {
    // Une même ligne `data:` arrive en deux morceaux.
    const lines = [
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\n',
      'data: [DONE]\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(lines)));

    const full = await chat({ apiKey: 'key1234567890abcdefgh', messages: [] });
    expect(full).toBe('Hello');
  });

  it('ignore les lignes non-data et les JSON invalides', async () => {
    const lines = [
      ': keep-alive\n',
      'event: message\n',
      'data: not-json\n',
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n',
      'data: [DONE]\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(lines)));

    const full = await chat({ apiKey: 'key1234567890abcdefgh', messages: [] });
    expect(full).toBe('OK');
  });
});

// ── Gestion d'erreurs (messages FR) ───────────────────────────────────────────

describe('mistral.chat — erreurs HTTP', () => {
  it('401 → message clé invalide en français', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(401, { message: 'Unauthorized' })));
    await expect(chat({ apiKey: 'mauvaise', messages: [] }))
      .rejects.toThrow(/Clé API invalide/);
  });

  it('429 → message trop de requêtes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(429, {})));
    await expect(chat({ apiKey: 'key1234567890abcdefgh', messages: [] }))
      .rejects.toThrow(/Trop de requêtes/);
  });

  it('500 → message serveur Mistral', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(503, {})));
    await expect(chat({ apiKey: 'key1234567890abcdefgh', messages: [] }))
      .rejects.toThrow(/serveur Mistral/);
  });

  it('échec réseau → message pas de connexion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));
    await expect(chat({ apiKey: 'key1234567890abcdefgh', messages: [] }))
      .rejects.toThrow(/Pas de connexion/);
  });
});

// ── analyzeDoc (vision) ───────────────────────────────────────────────────────

describe('mistral.analyzeDoc', () => {
  // FileReader n'existe pas en environnement node : on le stub pour toBase64.
  function stubFileReader() {
    vi.stubGlobal('FileReader', class {
      readAsDataURL() {
        this.result = 'data:image/jpeg;base64,QUJD';
        queueMicrotask(() => this.onload?.());
      }
    });
  }

  it('refuse les PDF avec un message explicite', async () => {
    const file = { type: 'application/pdf' };
    await expect(analyzeDoc(file, 'key1234567890abcdefgh'))
      .rejects.toThrow(/Mistral n'analyse pas les PDF/);
  });

  it('envoie une image en data URL et renvoie le contenu', async () => {
    stubFileReader();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Net imposable annuel : 30000' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = { type: 'image/jpeg' };
    const out = await analyzeDoc(file, 'key1234567890abcdefgh');
    expect(out).toBe('Net imposable annuel : 30000');

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe('mistral-small-latest');
    const img = sent.messages[0].content.find(c => c.type === 'image_url');
    expect(img.image_url).toBe('data:image/jpeg;base64,QUJD');
  });
});
