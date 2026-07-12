// Appels HTTP GoCardless Bank Account Data. Base URL v2.
const BASE = 'https://bankaccountdata.gocardless.com/api/v2';

async function gcFetch(path, { token, ...init } = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GoCardless ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function getAccessToken(fetchImpl = fetch) {
  const data = await gcFetch('/token/new/', {
    method: 'POST',
    body: JSON.stringify({ secret_id: process.env.GOCARDLESS_SECRET_ID, secret_key: process.env.GOCARDLESS_SECRET_KEY }),
  }, fetchImpl);
  return data.access;
}

export async function listInstitutions(country, token, fetchImpl = fetch) {
  const data = await gcFetch(`/institutions/?country=${country}`, { token }, fetchImpl);
  return (data || []).map((i) => ({ id: i.id, name: i.name }));
}

export async function createRequisition({ institutionId, redirect, reference }, token, fetchImpl = fetch) {
  const data = await gcFetch('/requisitions/', {
    token, method: 'POST',
    body: JSON.stringify({ institution_id: institutionId, redirect, reference }),
  }, fetchImpl);
  return { id: data.id, link: data.link };
}

export async function getRequisitionAccounts(requisitionId, token, fetchImpl = fetch) {
  const data = await gcFetch(`/requisitions/${requisitionId}/`, { token }, fetchImpl);
  return data.accounts || [];
}

export async function getAccountDetails(accountId, token, fetchImpl = fetch) {
  const data = await gcFetch(`/accounts/${accountId}/details/`, { token }, fetchImpl);
  return data.account || {};
}

export async function getAccountBalance(accountId, token, fetchImpl = fetch) {
  const data = await gcFetch(`/accounts/${accountId}/balances/`, { token }, fetchImpl);
  const b = (data.balances || [])[0];
  return { amount: b?.balanceAmount?.amount ?? '0', currency: b?.balanceAmount?.currency ?? 'EUR' };
}
