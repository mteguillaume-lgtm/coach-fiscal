// Persistance des requisitions (Upstash Redis REST). Une liste JSON sous une clé.
import { Redis } from '@upstash/redis';

const KEY = 'kapio:requisitions';
const redis = () => Redis.fromEnv();

export async function listRequisitions() {
  return (await redis().get(KEY)) || [];
}

export async function saveRequisition({ id, owner, institutionId, bank }) {
  const list = await listRequisitions();
  const next = [...list.filter((r) => r.id !== id), { id, owner, institutionId, bank, createdAt: new Date().toISOString() }];
  await redis().set(KEY, next);
}

export async function removeRequisition(id) {
  const list = await listRequisitions();
  await redis().set(KEY, list.filter((r) => r.id !== id));
}
