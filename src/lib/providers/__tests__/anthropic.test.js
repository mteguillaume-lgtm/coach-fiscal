import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeDoc } from '../anthropic';

afterEach(() => vi.restoreAllMocks());

function stubFileReader() {
  vi.stubGlobal('FileReader', class {
    readAsDataURL() { this.result = 'data:image/jpeg;base64,QUJD'; queueMicrotask(() => this.onload?.()); }
  });
}

describe('anthropic.analyzeDoc', () => {
  it('envoie N blocs image + le prompt et renvoie le texte', async () => {
    stubFileReader();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Net imposable annuel : 30000' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const images = [
      { blob: new Blob(['a']), mediaType: 'image/jpeg' },
      { blob: new Blob(['b']), mediaType: 'image/jpeg' },
    ];
    const out = await analyzeDoc({ images, apiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx' });
    expect(out).toBe('Net imposable annuel : 30000');

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    const imgBlocks = sent.messages[0].content.filter(c => c.type === 'image');
    expect(imgBlocks).toHaveLength(2);
    expect(imgBlocks[0].source).toMatchObject({ type: 'base64', media_type: 'image/jpeg', data: 'QUJD' });
    expect(sent.messages[0].content.some(c => c.type === 'text')).toBe(true);
  });

  it('lève une erreur si aucune image', async () => {
    await expect(analyzeDoc({ images: [], apiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx' }))
      .rejects.toThrow(/Aucune image/);
  });
});
