// Appels HTTP Enable Banking. Auth : JWT RS256 signé avec la clé privée de
// l'application (node:crypto, aucune dépendance), généré à chaque requête.
import { createSign } from 'node:crypto';

const BASE = 'https://api.enablebanking.com';
const JWT_TTL_S = 3600;

function privateKeyPem() {
  const raw = process.env.ENABLE_BANKING_PRIVATE_KEY || '';
  return raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
}

export function makeJwt(now = Date.now()) {
  if (!process.env.ENABLE_BANKING_APP_ID || !process.env.ENABLE_BANKING_PRIVATE_KEY) {
    throw new Error('ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY non configurés côté serveur');
  }
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const header = b64({ typ: 'JWT', alg: 'RS256', kid: process.env.ENABLE_BANKING_APP_ID });
  const payload = b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + JWT_TTL_S });
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).end()
    .sign(privateKeyPem()).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function ebFetch(path, init = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${makeJwt()}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Enable Banking ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function listAspsps(country, fetchImpl = fetch) {
  const data = await ebFetch(`/aspsps?country=${encodeURIComponent(String(country).toUpperCase())}`, {}, fetchImpl);
  return (data.aspsps || []).map((a) => ({
    name: a.name, country: a.country, maximumConsentValidity: a.maximum_consent_validity,
  }));
}

export async function startAuthorization({ aspsp, redirectUrl, state, validUntil }, fetchImpl = fetch) {
  const data = await ebFetch('/auth', {
    method: 'POST',
    body: JSON.stringify({ aspsp, redirect_url: redirectUrl, state, access: { valid_until: validUntil }, psu_type: 'personal' }),
  }, fetchImpl);
  return { url: data.url };
}

export async function createSession(code, fetchImpl = fetch) {
  const data = await ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) }, fetchImpl);
  return { sessionId: data.session_id, accounts: data.accounts || [], validUntil: data.access?.valid_until };
}

export async function getSessionAccounts(sessionId, fetchImpl = fetch) {
  const data = await ebFetch(`/sessions/${sessionId}`, {}, fetchImpl);
  return { status: data.status, accountUids: data.accounts || [] };
}

export async function getAccountDetails(uid, fetchImpl = fetch) {
  return ebFetch(`/accounts/${uid}/details`, {}, fetchImpl);
}

export async function getAccountBalances(uid, fetchImpl = fetch) {
  const data = await ebFetch(`/accounts/${uid}/balances`, {}, fetchImpl);
  return data.balances || [];
}
