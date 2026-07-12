import { describe, it, expect, beforeEach } from 'vitest';
import { requireSecret } from '../auth';

beforeEach(() => {
  process.env.KAPIO_BACKEND_SECRET = 'le-bon-secret';
});

describe('auth/requireSecret', () => {
  it('laisse passer le bon secret', () => {
    expect(() => requireSecret({ headers: { 'x-kapio-secret': 'le-bon-secret' } })).not.toThrow();
  });

  it('rejette un mauvais secret avec status 401', () => {
    try {
      requireSecret({ headers: { 'x-kapio-secret': 'mauvais' } });
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(e.status).toBe(401);
    }
  });

  it('rejette un secret absent avec status 401', () => {
    expect(() => requireSecret({ headers: {} })).toThrow();
  });

  it('rejette si la variable KAPIO_BACKEND_SECRET est absente', () => {
    delete process.env.KAPIO_BACKEND_SECRET;
    expect(() => requireSecret({ headers: { 'x-kapio-secret': 'peu-importe' } })).toThrow();
  });
});
