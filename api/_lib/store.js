// Persistance (Upstash Redis REST) : sessions Enable Banking (liste JSON sous
// une clé) + connexions en attente indexées par state, avec expiration.
import { Redis } from '@upstash/redis';

const SESSIONS_KEY = 'kapio:sessions';
const PENDING_PREFIX = 'kapio:pending:';
const PENDING_TTL_S = 3600;
const redis = () => Redis.fromEnv();

export async function listSessions() {
  return (await redis().get(SESSIONS_KEY)) || [];
}

export async function saveSession({ id, owner, bank, validUntil }) {
  const list = await listSessions();
  const next = [...list.filter((s) => s.id !== id), { id, owner, bank, validUntil, createdAt: new Date().toISOString() }];
  await redis().set(SESSIONS_KEY, next);
}

export async function removeSession(id) {
  const list = await listSessions();
  await redis().set(SESSIONS_KEY, list.filter((s) => s.id !== id));
}

export async function savePending(state, { owner, bank }) {
  await redis().set(`${PENDING_PREFIX}${state}`, { owner, bank }, { ex: PENDING_TTL_S });
}

export async function takePending(state) {
  const key = `${PENDING_PREFIX}${state}`;
  const pending = await redis().get(key);
  if (pending) await redis().del(key);
  return pending || null;
}
