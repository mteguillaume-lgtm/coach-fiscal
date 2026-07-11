// Source « GoCardless » côté client : appelle le backend Kapio, qui seul
// détient les secrets. Ne parle jamais directement à GoCardless.
export const id = 'gocardless';

async function call(url, secret, path, init = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`${url}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-kapio-secret': secret, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Backend patrimoine ${res.status} : ${detail}`);
  }
  return res.json();
}

export async function getPositions({ url, secret }, fetchImpl = fetch) {
  const { positions } = await call(url, secret, '/api/bank/snapshot', {}, fetchImpl);
  return positions || [];
}

export async function startConnect({ url, secret, institutionId, owner }, fetchImpl = fetch) {
  return call(url, secret, '/api/bank/connect', {
    method: 'POST',
    body: JSON.stringify({ institutionId, owner }),
  }, fetchImpl);
}

export async function listInstitutions({ url, secret, country = 'fr' }, fetchImpl = fetch) {
  const { institutions } = await call(url, secret, `/api/bank/institutions?country=${country}`, {}, fetchImpl);
  return institutions || [];
}
