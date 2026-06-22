import { describe, it, expect } from 'vitest';
import { zoneToPixelRect, RASTER_SCALE } from '../pdfRasterizer';

describe('zoneToPixelRect', () => {
  it('convertit une zone points top-origin en rectangle pixels (point × scale)', () => {
    const zone = { x0: 10, x1: 30, top: 5, bottom: 25 };
    expect(zoneToPixelRect(zone, 2)).toEqual({ x: 20, y: 10, w: 40, h: 40 });
  });

  it('expose le scale par défaut « Équilibré »', () => {
    expect(RASTER_SCALE).toBe(1.85);
  });
});
