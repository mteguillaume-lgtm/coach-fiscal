// Source « Enable Banking » côté client : appelle le backend Kapio, qui seul
// détient la clé privée. Ne parle jamais directement à Enable Banking.
export const id = 'enablebanking';

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
  const { positions, errors } = await call(url, secret, '/api/bank/snapshot', {}, fetchImpl);
  return { positions: positions || [], errors: errors || [] };
}

export async function startConnect({ url, secret, institutionId, institutionName, owner }, fetchImpl = fetch) {
  return call(url, secret, '/api/bank/connect', {
    method: 'POST',
    body: JSON.stringify({ institutionId, institutionName, owner }),
  }, fetchImpl);
}

export async function completeConnect({ url, secret, code, state }, fetchImpl = fetch) {
  return call(url, secret, '/api/bank/callback', {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  }, fetchImpl);
}

export async function listInstitutions({ url, secret, country = 'fr' }, fetchImpl = fetch) {
  const { institutions } = await call(url, secret, `/api/bank/institutions?country=${country}`, {}, fetchImpl);
  return institutions || [];
}
