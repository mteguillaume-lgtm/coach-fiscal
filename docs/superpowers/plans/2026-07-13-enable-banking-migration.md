# Migration GoCardless → Enable Banking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le connecteur GoCardless (inscriptions fermées) par Enable Banking derrière les mêmes routes backend et le même contrat `Position`, avec la nouvelle route de callback exigée par le flux Enable Banking.

**Architecture:** Le backend Vercel (`api/bank/*`) échange avec `api.enablebanking.com` authentifié par JWT RS256 signé avec la clé privée RSA de l'application (`node:crypto`, zéro dépendance). Le flux de connexion gagne une étape : au retour de la banque (`/patrimoine?code=…&state=…`), le front appelle `POST /api/bank/callback` qui échange le code contre une session persistée en Redis. Le snapshot parcourt les sessions et normalise vers le contrat `Position` inchangé.

**Tech Stack:** Vercel Functions (ESM, Node), `node:crypto` (JWT RS256), Upstash Redis (`@upstash/redis` déjà présent), React/Vite côté client, Vitest.

**Spec :** `docs/superpowers/specs/2026-07-13-enable-banking-migration-design.md`

## Global Constraints

- **Aucune dépendance npm ajoutée** — JWT signé avec `node:crypto` natif.
- Variables d'environnement backend : `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` (PEM encodé **base64**, ou PEM brut accepté), plus les existantes `KAPIO_BACKEND_SECRET`, `APP_ORIGIN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Identifiants : positions `id: eb-${uid}`, `source: 'enablebanking'` ; institutions `id: ${country}::${name}` (Enable Banking identifie une banque par le couple nom + pays).
- Consentement demandé : `min(180 jours, maximum_consent_validity de la banque)`.
- Commentaires de code **en français**, style bref du codebase existant.
- Tests : `npx vitest run <fichier>` ; suite complète `npm test` (~833 tests, doit rester verte à chaque commit).
- Travail sur la branche `feat/enable-banking` (déjà créée).
- Le code GoCardless n'est supprimé qu'en Task 8 (la suite reste verte entre-temps).

---

### Task 1: Client HTTP Enable Banking (JWT RS256 + wrappers)

**Files:**
- Create: `api/_lib/enableBankingClient.js`
- Test: `api/_lib/__tests__/enableBankingClient.test.js`

**Interfaces:**
- Consumes: env `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY`.
- Produces (utilisés par Tasks 3–5) :
  - `makeJwt(now = Date.now()) → string`
  - `listAspsps(country, fetchImpl?) → Promise<[{ name, country, maximumConsentValidity }]>`
  - `startAuthorization({ aspsp: {name, country}, redirectUrl, state, validUntil }, fetchImpl?) → Promise<{ url }>`
  - `createSession(code, fetchImpl?) → Promise<{ sessionId, accounts, validUntil }>`
  - `getSessionAccounts(sessionId, fetchImpl?) → Promise<{ status, accountUids }>`
  - `getAccountDetails(uid, fetchImpl?) → Promise<object>` (réponse brute : `name`, `product`, `cash_account_type`, `account_id.iban`, …)
  - `getAccountBalances(uid, fetchImpl?) → Promise<[{ name, balance_amount: {currency, amount}, balance_type }]>`

- [ ] **Step 1: Écrire les tests qui échouent**

```js
// api/_lib/__tests__/enableBankingClient.test.js
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';

let publicKey;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKey = pair.publicKey;
  process.env.ENABLE_BANKING_APP_ID = 'app-123';
  process.env.ENABLE_BANKING_PRIVATE_KEY = Buffer.from(pair.privateKey).toString('base64');
});

describe('enableBankingClient', () => {
  it('makeJwt produit un JWT RS256 vérifiable avec kid/aud/exp corrects', async () => {
    const { makeJwt } = await import('../enableBankingClient.js');
    const token = makeJwt(1_700_000_000_000);
    const [h, p, sig] = token.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(header).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-123' });
    expect(payload.iss).toBe('enablebanking.com');
    expect(payload.aud).toBe('api.enablebanking.com');
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.exp).toBe(1_700_000_000 + 3600);
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).end()
      .verify(publicKey, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });

  it('listAspsps appelle /aspsps avec Bearer JWT et mappe la réponse', async () => {
    const { listAspsps } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ aspsps: [{ name: 'BoursoBank', country: 'FR', maximum_consent_validity: 15552000 }] }),
    });
    const out = await listAspsps('fr', fetchMock);
    expect(out).toEqual([{ name: 'BoursoBank', country: 'FR', maximumConsentValidity: 15552000 }]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.enablebanking.com/aspsps?country=FR');
    expect(opts.headers.Authorization).toMatch(/^Bearer /);
  });

  it('startAuthorization POST /auth avec le corps attendu', async () => {
    const { startAuthorization } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://auth.enablebanking.com/start' }) });
    const out = await startAuthorization({
      aspsp: { name: 'BoursoBank', country: 'FR' },
      redirectUrl: 'https://kapio.app/patrimoine',
      state: 'st-1',
      validUntil: '2027-01-09T00:00:00.000Z',
    }, fetchMock);
    expect(out).toEqual({ url: 'https://auth.enablebanking.com/start' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      aspsp: { name: 'BoursoBank', country: 'FR' },
      redirect_url: 'https://kapio.app/patrimoine',
      state: 'st-1',
      access: { valid_until: '2027-01-09T00:00:00.000Z' },
      psu_type: 'personal',
    });
  });

  it('createSession échange le code et mappe session_id/valid_until', async () => {
    const { createSession } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'sess-1', accounts: [{ uid: 'acc-1' }], access: { valid_until: '2027-01-09T00:00:00Z' } }),
    });
    const out = await createSession('code-xyz', fetchMock);
    expect(out).toEqual({ sessionId: 'sess-1', accounts: [{ uid: 'acc-1' }], validUntil: '2027-01-09T00:00:00Z' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: 'code-xyz' });
  });

  it('getSessionAccounts renvoie status et uids', async () => {
    const { getSessionAccounts } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: 'AUTHORIZED', accounts: ['acc-1', 'acc-2'] }),
    });
    const out = await getSessionAccounts('sess-1', fetchMock);
    expect(out).toEqual({ status: 'AUTHORIZED', accountUids: ['acc-1', 'acc-2'] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.enablebanking.com/sessions/sess-1');
  });

  it('getAccountBalances renvoie le tableau balances', async () => {
    const { getAccountBalances } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ balances: [{ name: 'Booked', balance_amount: { currency: 'EUR', amount: '12.5' }, balance_type: 'CLBD' }] }),
    });
    const out = await getAccountBalances('acc-1', fetchMock);
    expect(out).toEqual([{ name: 'Booked', balance_amount: { currency: 'EUR', amount: '12.5' }, balance_type: 'CLBD' }]);
  });

  it('propage les erreurs HTTP avec le statut', async () => {
    const { listAspsps } = await import('../enableBankingClient.js');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad jwt' });
    await expect(listAspsps('fr', fetchMock)).rejects.toThrow(/Enable Banking 401/);
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run api/_lib/__tests__/enableBankingClient.test.js`
Expected: FAIL — `Cannot find module '../enableBankingClient.js'`

- [ ] **Step 3: Implémenter le client**

```js
// api/_lib/enableBankingClient.js
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
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run api/_lib/__tests__/enableBankingClient.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/enableBankingClient.js api/_lib/__tests__/enableBankingClient.test.js
git commit -m "feat(patrimoine): client HTTP Enable Banking (JWT RS256 natif)"
```

---

### Task 2: Normalisation Enable Banking → Position

**Files:**
- Create: `api/_lib/normalizeEnableBanking.js`
- Test: `api/_lib/__tests__/normalizeEnableBanking.test.js`

**Interfaces:**
- Consumes: rien (fonctions pures).
- Produces (utilisés par Task 5) :
  - `pickBalance(balances) → balance | undefined` — préférence `ITAV` > `CLAV` > `ITBD` > `CLBD` > premier.
  - `normalizeAccounts(rawAccounts) → Position[]` — entrée : `[{ uid, bankName, owner, name, product, cash_account_type, account_id, balances }]`.

- [ ] **Step 1: Écrire les tests qui échouent**

```js
// api/_lib/__tests__/normalizeEnableBanking.test.js
import { describe, it, expect } from 'vitest';
import { normalizeAccounts, pickBalance } from '../normalizeEnableBanking.js';

const eur = (amount) => ({ currency: 'EUR', amount });

describe('pickBalance', () => {
  it('préfère le solde disponible (ITAV) puis CLAV puis le premier', () => {
    expect(pickBalance([
      { balance_type: 'CLBD', balance_amount: eur('1') },
      { balance_type: 'ITAV', balance_amount: eur('2') },
    ]).balance_amount.amount).toBe('2');
    expect(pickBalance([
      { balance_type: 'CLBD', balance_amount: eur('1') },
      { balance_type: 'CLAV', balance_amount: eur('3') },
    ]).balance_amount.amount).toBe('3');
    expect(pickBalance([{ balance_type: 'XPCD', balance_amount: eur('9') }]).balance_amount.amount).toBe('9');
    expect(pickBalance([])).toBeUndefined();
  });
});

describe('normalizeAccounts', () => {
  it('mappe un compte courant CACC vers le contrat Position', () => {
    const [pos] = normalizeAccounts([{
      uid: 'acc-1', bankName: 'BoursoBank', owner: 'd2',
      name: 'Compte chèque', cash_account_type: 'CACC',
      account_id: { iban: 'FR7612345678901234567890123' },
      balances: [{ balance_type: 'ITAV', balance_amount: eur('3000.50') }],
    }]);
    expect(pos).toMatchObject({
      id: 'eb-acc-1', source: 'enablebanking', bank: 'BoursoBank', type: 'checking',
      label: 'Compte chèque', value: 3000.5, currency: 'EUR', owner: 'd2',
      manual: false, iban_last4: '0123',
    });
  });

  it('détecte les livrets via SVGS ou le libellé produit', () => {
    const out = normalizeAccounts([
      { uid: 'a', cash_account_type: 'SVGS', balances: [] },
      { uid: 'b', product: 'Livret A', balances: [] },
    ]);
    expect(out[0].type).toBe('savings');
    expect(out[1].type).toBe('savings');
  });

  it('valeurs par défaut : value 0, EUR, owner d1, label Compte, pas d iban_last4', () => {
    const [pos] = normalizeAccounts([{ uid: 'x', balances: [] }]);
    expect(pos).toMatchObject({ value: 0, currency: 'EUR', owner: 'd1', label: 'Compte' });
    expect(pos.iban_last4).toBeUndefined();
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run api/_lib/__tests__/normalizeEnableBanking.test.js`
Expected: FAIL — `Cannot find module '../normalizeEnableBanking.js'`

- [ ] **Step 3: Implémenter la normalisation**

```js
// api/_lib/normalizeEnableBanking.js
// PUR : réponses Enable Banking (détails + soldes) → Position[] (contrat Kapio).
const TYPE_BY_CASH = { CACC: 'checking', SVGS: 'savings', CARD: 'checking' };
const BALANCE_PREFERENCE = ['ITAV', 'CLAV', 'ITBD', 'CLBD'];

function detectType(acc) {
  if (acc.cash_account_type && TYPE_BY_CASH[acc.cash_account_type]) return TYPE_BY_CASH[acc.cash_account_type];
  const hay = `${acc.product || ''} ${acc.name || ''}`.toLowerCase();
  if (/livret|ldds|epargne|épargne/.test(hay)) return 'savings';
  return 'checking';
}

export function pickBalance(balances = []) {
  for (const type of BALANCE_PREFERENCE) {
    const hit = balances.find((b) => b.balance_type === type);
    if (hit) return hit;
  }
  return balances[0];
}

export function normalizeAccounts(rawAccounts = []) {
  return rawAccounts.map((acc) => {
    const balance = pickBalance(acc.balances);
    const pos = {
      id: `eb-${acc.uid}`,
      source: 'enablebanking',
      bank: acc.bankName || '',
      type: detectType(acc),
      label: acc.name || acc.product || 'Compte',
      value: Number(balance?.balance_amount?.amount ?? 0),
      currency: balance?.balance_amount?.currency || 'EUR',
      owner: acc.owner || 'd1',
      updatedAt: new Date().toISOString(),
      manual: false,
    };
    const iban = acc.account_id?.iban;
    if (iban) pos.iban_last4 = String(iban).slice(-4);
    return pos;
  });
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run api/_lib/__tests__/normalizeEnableBanking.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/normalizeEnableBanking.js api/_lib/__tests__/normalizeEnableBanking.test.js
git commit -m "feat(patrimoine): normalisation Enable Banking → Position"
```

---

### Task 3: Store sessions/pendings + handlers institutions et connect

**Files:**
- Modify: `api/_lib/store.js` (réécriture complète — requisitions → sessions + pendings)
- Modify: `api/bank/institutions.js`
- Modify: `api/bank/connect.js`
- Test: `api/bank/__tests__/connect.test.js` (nouveau)

**Interfaces:**
- Consumes: Task 1 (`listAspsps`, `startAuthorization`).
- Produces (utilisés par Tasks 4–5) :
  - `listSessions() → Promise<[{ id, owner, bank, validUntil, createdAt }]>`
  - `saveSession({ id, owner, bank, validUntil }) → Promise<void>`
  - `removeSession(id) → Promise<void>`
  - `savePending(state, { owner, bank }) → Promise<void>` (TTL 1 h)
  - `takePending(state) → Promise<{ owner, bank } | null>` (lecture destructive)
  - Route `POST /api/bank/connect` : body `{ institutionId: 'FR::Nom', institutionName?, owner? }` → `{ link }`.
  - Route `GET /api/bank/institutions?country=fr` → `{ institutions: [{ id: 'FR::Nom', name }] }`.

**Note :** `store.js` reste sans test dédié (wrapper Redis fin, pattern existant du projet). `api/bank/__tests__/snapshot.test.js` casse temporairement (il mocke `listRequisitions`) — il est réécrit en Task 5 ; ne pas lancer la suite complète entre les deux, seulement les fichiers cités.

- [ ] **Step 1: Écrire le test du handler connect qui échoue**

```js
// api/bank/__tests__/connect.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({ savePending: vi.fn().mockResolvedValue() }));
vi.mock('../../_lib/enableBankingClient.js', () => ({
  listAspsps: vi.fn().mockResolvedValue([{ name: 'BoursoBank', country: 'FR', maximumConsentValidity: 15552000 }]),
  startAuthorization: vi.fn().mockResolvedValue({ url: 'https://auth.enablebanking.com/start' }),
}));

import { savePending } from '../../_lib/store.js';
import { startAuthorization } from '../../_lib/enableBankingClient.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('POST /api/bank/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ORIGIN = 'https://kapio.app';
  });

  it('crée l autorisation et mémorise le pending (owner + banque)', async () => {
    const { default: handler } = await import('../connect.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { institutionId: 'FR::BoursoBank', institutionName: 'BoursoBank', owner: 'd2' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ link: 'https://auth.enablebanking.com/start' });
    const authArgs = startAuthorization.mock.calls[0][0];
    expect(authArgs.aspsp).toEqual({ name: 'BoursoBank', country: 'FR' });
    expect(authArgs.redirectUrl).toBe('https://kapio.app/patrimoine');
    expect(authArgs.state).toBeTruthy();
    expect(savePending).toHaveBeenCalledWith(authArgs.state, { owner: 'd2', bank: 'BoursoBank' });
  });

  it('400 si institutionId manquant ou mal formé', async () => {
    const { default: handler } = await import('../connect.js');
    let res = mockRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
    res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { institutionId: 'SansSeparateur' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 si la banque est inconnue d Enable Banking', async () => {
    const { default: handler } = await import('../connect.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { institutionId: 'FR::Inconnue' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Inconnue/);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run api/bank/__tests__/connect.test.js`
Expected: FAIL — connect.js importe encore `gocardlessClient.js` (mock inexistant) et n'appelle pas `startAuthorization`.

- [ ] **Step 3: Réécrire store.js**

```js
// api/_lib/store.js
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
```

- [ ] **Step 4: Réécrire institutions.js**

```js
// api/bank/institutions.js
import { requireSecret } from '../_lib/auth.js';
import { listAspsps } from '../_lib/enableBankingClient.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const country = (req.query?.country || 'fr').toString();
    const aspsps = await listAspsps(country);
    return res.status(200).json({
      institutions: aspsps.map((a) => ({ id: `${a.country}::${a.name}`, name: a.name })),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
```

- [ ] **Step 5: Réécrire connect.js**

```js
// api/bank/connect.js
import { randomUUID } from 'node:crypto';
import { requireSecret } from '../_lib/auth.js';
import { listAspsps, startAuthorization } from '../_lib/enableBankingClient.js';
import { savePending } from '../_lib/store.js';

// Maximum DSP2 ; borné par la validité maximale annoncée par chaque banque.
const MAX_CONSENT_S = 180 * 86400;

export default async function handler(req, res) {
  try {
    requireSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { institutionId, institutionName, owner = 'd1' } = req.body || {};
    if (!institutionId) return res.status(400).json({ error: 'institutionId requis' });
    if (!process.env.APP_ORIGIN) {
      return res.status(500).json({ error: 'APP_ORIGIN non configuré côté serveur' });
    }

    const sep = String(institutionId).indexOf('::');
    if (sep === -1) return res.status(400).json({ error: 'institutionId invalide (attendu PAYS::Nom)' });
    const country = institutionId.slice(0, sep);
    const name = institutionId.slice(sep + 2);

    const aspsps = await listAspsps(country);
    const aspsp = aspsps.find((a) => a.name === name);
    if (!aspsp) return res.status(400).json({ error: `Banque inconnue : ${name}` });

    const validitySeconds = Math.min(MAX_CONSENT_S, aspsp.maximumConsentValidity || MAX_CONSENT_S);
    const state = randomUUID();
    const { url } = await startAuthorization({
      aspsp: { name, country },
      redirectUrl: `${process.env.APP_ORIGIN}/patrimoine`,
      state,
      validUntil: new Date(Date.now() + validitySeconds * 1000).toISOString(),
    });
    await savePending(state, { owner, bank: institutionName || name });
    return res.status(200).json({ link: url });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
```

- [ ] **Step 6: Vérifier que les tests passent**

Run: `npx vitest run api/bank/__tests__/connect.test.js api/_lib/__tests__/enableBankingClient.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/_lib/store.js api/bank/institutions.js api/bank/connect.js api/bank/__tests__/connect.test.js
git commit -m "feat(patrimoine): connect + institutions sur Enable Banking, store sessions/pendings"
```

---

### Task 4: Route callback (échange du code contre une session)

**Files:**
- Create: `api/bank/callback.js`
- Test: `api/bank/__tests__/callback.test.js`

**Interfaces:**
- Consumes: Task 1 (`createSession`), Task 3 (`takePending`, `saveSession`).
- Produces: route `POST /api/bank/callback` body `{ code, state }` → `{ ok: true, bank }` (utilisée par le client Task 6).

- [ ] **Step 1: Écrire les tests qui échouent**

```js
// api/bank/__tests__/callback.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({
  takePending: vi.fn(),
  saveSession: vi.fn().mockResolvedValue(),
}));
vi.mock('../../_lib/enableBankingClient.js', () => ({
  createSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1', accounts: [], validUntil: '2027-01-09T00:00:00Z' }),
}));

import { takePending, saveSession } from '../../_lib/store.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('POST /api/bank/callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('échange le code et sauvegarde la session avec owner/bank du pending', async () => {
    takePending.mockResolvedValue({ owner: 'd2', bank: 'BoursoBank' });
    const { default: handler } = await import('../callback.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { code: 'code-xyz', state: 'st-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, bank: 'BoursoBank' });
    expect(saveSession).toHaveBeenCalledWith({ id: 'sess-1', owner: 'd2', bank: 'BoursoBank', validUntil: '2027-01-09T00:00:00Z' });
  });

  it('404 si le state est inconnu ou expiré', async () => {
    takePending.mockResolvedValue(null);
    const { default: handler } = await import('../callback.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { code: 'c', state: 'inconnu' } }, res);
    expect(res.statusCode).toBe(404);
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('400 si code ou state manquant', async () => {
    const { default: handler } = await import('../callback.js');
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { code: 'c' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run api/bank/__tests__/callback.test.js`
Expected: FAIL — `Cannot find module '../callback.js'`

- [ ] **Step 3: Implémenter le handler**

```js
// api/bank/callback.js
// Retour de la banque : échange le code d'autorisation contre une session
// Enable Banking et la persiste, rattachée au pending créé par /connect.
import { requireSecret } from '../_lib/auth.js';
import { createSession } from '../_lib/enableBankingClient.js';
import { takePending, saveSession } from '../_lib/store.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { code, state } = req.body || {};
    if (!code || !state) return res.status(400).json({ error: 'code et state requis' });

    const pending = await takePending(state);
    if (!pending) return res.status(404).json({ error: 'Connexion inconnue ou expirée — relancez la connexion' });

    const { sessionId, validUntil } = await createSession(code);
    await saveSession({ id: sessionId, owner: pending.owner, bank: pending.bank, validUntil });
    return res.status(200).json({ ok: true, bank: pending.bank });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run api/bank/__tests__/callback.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add api/bank/callback.js api/bank/__tests__/callback.test.js
git commit -m "feat(patrimoine): route callback — échange du code Enable Banking en session"
```

---

### Task 5: Snapshot sur les sessions Enable Banking (erreurs par banque)

**Files:**
- Modify: `api/bank/snapshot.js`
- Modify: `api/bank/__tests__/snapshot.test.js` (réécriture des mocks)

**Interfaces:**
- Consumes: Task 1 (`getSessionAccounts`, `getAccountDetails`, `getAccountBalances`), Task 2 (`normalizeAccounts`), Task 3 (`listSessions`).
- Produces: `GET /api/bank/snapshot` → `{ positions: Position[], errors: string[] }` — **nouveau champ `errors`** : une session en échec (consentement expiré…) n'empêche plus les autres banques de remonter.

- [ ] **Step 1: Réécrire le test**

```js
// api/bank/__tests__/snapshot.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({
  listSessions: vi.fn().mockResolvedValue([{ id: 'sess-1', owner: 'd1', bank: 'BNP' }]),
}));
vi.mock('../../_lib/enableBankingClient.js', () => ({
  getSessionAccounts: vi.fn().mockResolvedValue({ status: 'AUTHORIZED', accountUids: ['acc-1'] }),
  getAccountDetails: vi.fn().mockResolvedValue({ cash_account_type: 'CACC', name: 'CC', account_id: { iban: 'FR760001' } }),
  getAccountBalances: vi.fn().mockResolvedValue([{ balance_type: 'ITAV', balance_amount: { amount: '3000', currency: 'EUR' } }]),
}));

import { getSessionAccounts } from '../../_lib/enableBankingClient.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('GET /api/bank/snapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renvoie des positions normalisées', async () => {
    const { default: handler } = await import('../snapshot.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.positions[0]).toMatchObject({ source: 'enablebanking', type: 'checking', value: 3000, bank: 'BNP', owner: 'd1' });
    expect(res.body.errors).toEqual([]);
  });

  it('une session en échec remonte dans errors sans casser la réponse', async () => {
    getSessionAccounts.mockRejectedValueOnce(new Error('Enable Banking 401: consent expired'));
    const { default: handler } = await import('../snapshot.js');
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.positions).toEqual([]);
    expect(res.body.errors[0]).toMatch(/BNP/);
    expect(res.body.errors[0]).toMatch(/reconnectez/i);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run api/bank/__tests__/snapshot.test.js`
Expected: FAIL — snapshot.js importe encore `gocardlessClient.js` / `listRequisitions`.

- [ ] **Step 3: Réécrire le handler**

```js
// api/bank/snapshot.js
import { requireSecret } from '../_lib/auth.js';
import { listSessions } from '../_lib/store.js';
import { getSessionAccounts, getAccountDetails, getAccountBalances } from '../_lib/enableBankingClient.js';
import { normalizeAccounts } from '../_lib/normalizeEnableBanking.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const sessions = await listSessions();
    const raw = [];
    const errors = [];
    // Une banque en échec (consentement expiré, révoqué…) ne doit pas
    // empêcher les autres de remonter.
    for (const s of sessions) {
      try {
        const { accountUids } = await getSessionAccounts(s.id);
        for (const uid of accountUids) {
          const details = await getAccountDetails(uid);
          const balances = await getAccountBalances(uid);
          raw.push({ uid, bankName: s.bank, owner: s.owner, ...details, balances });
        }
      } catch (e) {
        errors.push(`${s.bank} : ${e.message} — reconnectez la banque si le consentement a expiré`);
      }
    }
    return res.status(200).json({ positions: normalizeAccounts(raw), errors });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run api/bank/__tests__/snapshot.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add api/bank/snapshot.js api/bank/__tests__/snapshot.test.js
git commit -m "feat(patrimoine): snapshot sur sessions Enable Banking, erreurs par banque"
```

---

### Task 6: Provider client enablebanking + registre

**Files:**
- Create: `src/lib/providers/bank/enablebanking.js` (remplace `gocardless.js`, supprimé en Task 8)
- Modify: `src/lib/providers/bank/index.js`
- Test: `src/lib/providers/bank/__tests__/enablebanking.test.js` (nouveau)
- Modify: `src/lib/providers/bank/__tests__/index.test.js` (adapter les mocks `deps.gocardless` → `deps.enablebanking` et le retour `{ positions, errors }`)

**Interfaces:**
- Consumes: routes backend Tasks 3–5 (`/api/bank/snapshot`, `/connect`, `/institutions`, `/callback`).
- Produces (utilisés par Task 7) :
  - `getPositions({ url, secret }, fetchImpl?) → Promise<{ positions: Position[], errors: string[] }>` — **changement de contrat** (renvoyait un tableau).
  - `startConnect({ url, secret, institutionId, institutionName, owner }, fetchImpl?) → Promise<{ link }>`
  - `listInstitutions({ url, secret, country? }, fetchImpl?) → Promise<[{ id, name }]>`
  - `completeConnect({ url, secret, code, state }, fetchImpl?) → Promise<{ ok, bank }>`
  - `getConsolidatedSnapshot` inchangé en signature, mais fusionne désormais aussi `errors` du backend.

- [ ] **Step 1: Écrire les tests qui échouent**

```js
// src/lib/providers/bank/__tests__/enablebanking.test.js
import { describe, it, expect, vi } from 'vitest';
import * as eb from '../enablebanking';

const cfg = { url: 'https://back.vercel.app', secret: 's3cr3t' };

describe('bank/enablebanking (client)', () => {
  it('getPositions appelle /api/bank/snapshot et renvoie positions + errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ positions: [{ id: 'eb-1', value: 100 }], errors: ['BNP : expiré'] }),
    });
    const out = await eb.getPositions(cfg, fetchMock);
    expect(out).toEqual({ positions: [{ id: 'eb-1', value: 100 }], errors: ['BNP : expiré'] });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://back.vercel.app/api/bank/snapshot');
    expect(opts.headers['x-kapio-secret']).toBe('s3cr3t');
  });

  it('getPositions lève sur réponse non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'nope' });
    await expect(eb.getPositions(cfg, fetchMock)).rejects.toThrow(/401/);
  });

  it('startConnect POST institution + owner et renvoie le lien', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: 'https://bank/consent' }) });
    const out = await eb.startConnect({ ...cfg, institutionId: 'FR::BoursoBank', institutionName: 'BoursoBank', owner: 'd2' }, fetchMock);
    expect(out).toEqual({ link: 'https://bank/consent' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ institutionId: 'FR::BoursoBank', institutionName: 'BoursoBank', owner: 'd2' });
  });

  it('completeConnect POST code + state sur /api/bank/callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, bank: 'BoursoBank' }) });
    const out = await eb.completeConnect({ ...cfg, code: 'c-1', state: 'st-1' }, fetchMock);
    expect(out).toEqual({ ok: true, bank: 'BoursoBank' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://back.vercel.app/api/bank/callback');
    expect(JSON.parse(opts.body)).toEqual({ code: 'c-1', state: 'st-1' });
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run src/lib/providers/bank/__tests__/enablebanking.test.js`
Expected: FAIL — `Cannot find module '../enablebanking'`

- [ ] **Step 3: Implémenter le provider client**

```js
// src/lib/providers/bank/enablebanking.js
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
```

- [ ] **Step 4: Mettre à jour le registre**

```js
// src/lib/providers/bank/index.js
// Registre des sources patrimoine et fusion en un instantané unique.
// Une source auto en échec ne doit jamais faire perdre les saisies manuelles.
import * as manualProvider from './manual';
import * as enablebankingProvider from './enablebanking';

export { manualProvider as manual, enablebankingProvider as enablebanking };

export async function getConsolidatedSnapshot(
  { config, storage = localStorage, includeAuto = true },
  deps = {},
) {
  const enablebanking = deps.enablebanking || enablebankingProvider;
  const positions = [...manualProvider.getPositions(storage)];
  const errors = [];

  const hasConfig = Boolean(config?.url && config?.secret);
  if (includeAuto && hasConfig) {
    try {
      const auto = await enablebanking.getPositions(config);
      positions.push(...auto.positions);
      errors.push(...auto.errors);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }

  return { generatedAt: new Date().toISOString(), positions, errors };
}
```

- [ ] **Step 5: Adapter le test du registre**

Remplacer intégralement le contenu de `src/lib/providers/bank/__tests__/index.test.js` par :

```js
import { describe, it, expect, vi } from 'vitest';
import { getConsolidatedSnapshot } from '../index';

function memStorage(list) {
  const m = new Map([['kapio.patrimoine.manual', JSON.stringify(list)]]);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: () => {}, removeItem: () => {} };
}

describe('bank/index.getConsolidatedSnapshot', () => {
  it('fusionne Enable Banking + manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
    const enablebanking = { getPositions: vi.fn().mockResolvedValue({ positions: [{ id: 'eb-1', source: 'enablebanking', type: 'checking', value: 3000 }], errors: [] }) };
    const snap = await getConsolidatedSnapshot(
      { config: { url: 'u', secret: 's' }, storage: s },
      { enablebanking },
    );
    expect(snap.positions).toHaveLength(2);
    expect(snap.positions.map((p) => p.source).sort()).toEqual(['enablebanking', 'manual']);
    expect(typeof snap.generatedAt).toBe('string');
  });

  it('sans config valide : renvoie seulement le manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const enablebanking = { getPositions: vi.fn() };
    const snap = await getConsolidatedSnapshot({ config: { url: '', secret: '' }, storage: s }, { enablebanking });
    expect(enablebanking.getPositions).not.toHaveBeenCalled();
    expect(snap.positions).toHaveLength(1);
  });

  it('erreur Enable Banking : conserve le manuel + remonte errors', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const enablebanking = { getPositions: vi.fn().mockRejectedValue(new Error('boom')) };
    const snap = await getConsolidatedSnapshot({ config: { url: 'u', secret: 's' }, storage: s }, { enablebanking });
    expect(snap.positions).toHaveLength(1);
    expect(snap.errors[0]).toMatch(/boom/);
  });

  it('erreurs par banque du backend : remontées sans perdre ni manuel ni positions', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const enablebanking = {
      getPositions: vi.fn().mockResolvedValue({
        positions: [{ id: 'eb-1', source: 'enablebanking', value: 100 }],
        errors: ['BNP : consentement expiré'],
      }),
    };
    const snap = await getConsolidatedSnapshot({ config: { url: 'u', secret: 's' }, storage: s }, { enablebanking });
    expect(snap.positions).toHaveLength(2);
    expect(snap.errors).toEqual(['BNP : consentement expiré']);
  });
});
```

- [ ] **Step 6: Vérifier que les tests passent**

Run: `npx vitest run src/lib/providers/bank/`
Expected: PASS (enablebanking, index, manual — gocardless.test.js passe encore, il est supprimé en Task 8)

- [ ] **Step 7: Commit**

```bash
git add src/lib/providers/bank/enablebanking.js src/lib/providers/bank/index.js src/lib/providers/bank/__tests__/enablebanking.test.js src/lib/providers/bank/__tests__/index.test.js
git commit -m "feat(patrimoine): provider client enablebanking + erreurs par banque dans le snapshot consolidé"
```

---

### Task 7: UI — détection du retour banque et bascule des imports

**Files:**
- Modify: `src/components/patrimoine/ConnectBankButton.jsx` (import + placeholder)
- Modify: `src/pages/Patrimoine.jsx` (effet de callback + erreur de connexion dans la bannière)

**Interfaces:**
- Consumes: Task 6 (`completeConnect`, `listInstitutions`, `startConnect`).
- Produces: comportement — au chargement de `/patrimoine?code=…&state=…`, la connexion est finalisée, l'URL nettoyée, le snapshot rafraîchi ; un échec s'affiche dans la bannière d'erreurs existante.

- [ ] **Step 1: ConnectBankButton — basculer l'import**

Dans `src/components/patrimoine/ConnectBankButton.jsx` :
- Remplacer `import * as gocardless from '../../lib/providers/bank/gocardless';` par `import * as enablebanking from '../../lib/providers/bank/enablebanking';` et les deux usages `gocardless.listInstitutions(...)` / `gocardless.startConnect(...)` par `enablebanking.…`.
- Ligne 105, remplacer le placeholder `"ex. BNP_FR…"` par `"ex. FR::BoursoBank"`.

- [ ] **Step 2: Patrimoine.jsx — finaliser la connexion au retour de la banque**

Ajouter les imports :

```jsx
import { completeConnect } from '../lib/providers/bank/enablebanking';
```

Ajouter l'état sous `const [loading, setLoading] = useState(false);` :

```jsx
const [connectError, setConnectError] = useState('');
```

Remplacer l'effet de montage existant (`useEffect(() => { refresh(); }, [refresh]);` et son commentaire) par :

```jsx
  // Chargement initial au montage (pattern data-fetching documenté react.dev :
  // https://react.dev/learn/synchronizing-with-effects#fetching-data — le setLoading(true)
  // synchrone en tête de `refresh` est un faux positif connu de cette règle stricte).
  // Si la banque vient de nous rediriger (?code=…&state=…), on finalise d'abord
  // la connexion auprès du backend, puis on rafraîchit.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code) { refresh(); return; }
    window.history.replaceState({}, '', window.location.pathname);
    completeConnect({ ...getBackendConfig(), code, state })
      .then(() => setConnectError(''))
      .catch((e) => setConnectError(`Connexion bancaire non finalisée : ${e.message}`))
      .finally(() => refresh());
  }, [refresh]);
```

Dans le JSX, adapter la bannière d'erreurs (bloc `{/* ERREURS DE SYNC */}`) pour inclure `connectError` :

```jsx
        {(snap.errors?.length > 0 || connectError) && (
```

et la liste :

```jsx
            <ul className="mt-2 list-disc pl-6 text-warning-400/80">
              {[...(connectError ? [connectError] : []), ...snap.errors].map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
```

- [ ] **Step 3: Vérifier lint + suite ciblée**

Run: `npm run lint && npx vitest run src/lib/providers/bank/ src/components/patrimoine/`
Expected: lint OK, tests PASS (les tests ManualPositions/patrimoine existants restent verts)

- [ ] **Step 4: Vérification manuelle rapide**

Run: `npm run dev` puis ouvrir `http://localhost:5173/patrimoine?code=test&state=test` (avec un backend configuré factice) : l'URL doit être nettoyée en `/patrimoine` et la bannière afficher « Connexion bancaire non finalisée : … ». Sans paramètres, la page se comporte comme avant.

- [ ] **Step 5: Commit**

```bash
git add src/components/patrimoine/ConnectBankButton.jsx src/pages/Patrimoine.jsx
git commit -m "feat(patrimoine): finalisation de connexion au retour banque (code/state)"
```

---

### Task 8: Suppression du code GoCardless + suite complète

**Files:**
- Delete: `api/_lib/gocardlessClient.js`, `api/_lib/normalizeGocardless.js`, `api/_lib/__tests__/gocardlessClient.test.js`, `api/_lib/__tests__/normalizeGocardless.test.js`, `src/lib/providers/bank/gocardless.js`, `src/lib/providers/bank/__tests__/gocardless.test.js`
- Modify: `src/lib/patrimoine/model.js:1` (commentaire)

**Interfaces:**
- Consumes: Tasks 3–7 (plus aucun import GoCardless restant).
- Produces: arbre sans référence GoCardless (hors specs/plans historiques).

- [ ] **Step 1: Supprimer les fichiers**

```bash
git rm api/_lib/gocardlessClient.js api/_lib/normalizeGocardless.js \
       api/_lib/__tests__/gocardlessClient.test.js api/_lib/__tests__/normalizeGocardless.test.js \
       src/lib/providers/bank/gocardless.js src/lib/providers/bank/__tests__/gocardless.test.js
```

- [ ] **Step 2: Mettre à jour le commentaire de model.js**

Ligne 1 de `src/lib/patrimoine/model.js` : remplacer

```js
// Modèle normalisé « Position » — contrat partagé entre sources (GoCardless,
```

par

```js
// Modèle normalisé « Position » — contrat partagé entre sources (Enable Banking,
```

- [ ] **Step 3: Vérifier qu'aucune référence ne subsiste**

Run: `grep -rn -i "gocardless" api/ src/ docs/patrimoine-setup.md`
Expected: uniquement des occurrences dans `docs/patrimoine-setup.md` (réécrit en Task 9). Aucune dans `api/` ni `src/`.

- [ ] **Step 4: Suite complète + lint**

Run: `npm test && npm run lint`
Expected: tous les tests PASS (~833 + les nouveaux − les 3 fichiers de tests supprimés), lint OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(patrimoine): suppression du connecteur GoCardless (inscriptions fermées)"
```

---

### Task 9: Réécriture du guide de setup

**Files:**
- Modify: `docs/patrimoine-setup.md` (réécriture complète)

**Interfaces:**
- Consumes: rien (documentation).
- Produces: guide utilisateur à jour pour Enable Banking.

- [ ] **Step 1: Réécrire le guide**

Remplacer intégralement le contenu de `docs/patrimoine-setup.md` par :

```markdown
# Patrimoine — mise en route de la synchronisation bancaire (Enable Banking)

La page Patrimoine remonte automatiquement vos comptes courants et livrets via
[Enable Banking](https://enablebanking.com) (agrégateur agréé, gratuit pour un
usage personnel en « Restricted Production » : seuls les comptes que **vous**
liez sont accessibles). Les placements (PEA, assurance-vie, PER) et les prêts
restent en saisie manuelle — la réglementation DSP2 ne les couvre pas.

## Prérequis

- Un compte [Enable Banking](https://enablebanking.com) (gratuit)
- Un compte [Upstash](https://upstash.com) (Redis gratuit)
- Un compte [Vercel](https://vercel.com) pour héberger le backend (dossier `api/`)

## 1. Créer l'application Enable Banking

1. Créez un compte sur https://enablebanking.com et ouvrez le Control Panel.
2. Créez une application : le portail génère une **clé privée RSA** (fichier
   `.pem`). **Téléchargez-la et conservez-la en lieu sûr — elle ne sera plus
   jamais affichée et ne doit jamais être commitée.** Notez l'**Application ID**.
3. Dans les réglages de l'application, ajoutez l'URL de redirection :
   `https://VOTRE-APP.vercel.app/patrimoine` (la même valeur que `APP_ORIGIN`
   ci-dessous, suivie de `/patrimoine`).
4. Activez l'application en **Restricted Production** via « Activate by linking
   accounts » : vous lierez vos propres comptes bancaires (et ceux du
   déclarant 2) — l'API ne pourra accéder qu'à ces comptes-là.

## 2. Variables d'environnement (Vercel)

| Variable | Valeur |
|---|---|
| `ENABLE_BANKING_APP_ID` | l'Application ID du Control Panel |
| `ENABLE_BANKING_PRIVATE_KEY` | le fichier `.pem` encodé en base64 (voir ci-dessous) |
| `KAPIO_BACKEND_SECRET` | un jeton long et aléatoire de votre choix (ex. `openssl rand -hex 32`) |
| `APP_ORIGIN` | l'URL de votre app (ex. `https://VOTRE-APP.vercel.app`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | fournis par Upstash |

Encoder la clé privée en base64 (une seule ligne, sans retour chariot) :

    base64 -i cle-privee.pem | tr -d '\n'

Ajouter les variables :

    vercel env add ENABLE_BANKING_APP_ID production
    vercel env add ENABLE_BANKING_PRIVATE_KEY production
    vercel env add KAPIO_BACKEND_SECRET production
    vercel env add APP_ORIGIN production

Redéployez ensuite le projet pour que les variables soient prises en compte.

## 3. Configurer Kapio

Sur la page Patrimoine, section « Synchronisation bancaire » : renseignez
l'URL du backend (votre déploiement Vercel) et le jeton secret
(`KAPIO_BACKEND_SECRET`). À faire une seule fois par navigateur.

## 4. Connecter une banque

1. « Connecter une banque » → choisissez la banque et le titulaire (D1/D2/commun).
2. Vous êtes redirigé vers l'écran sécurisé de votre banque (authentification
   forte). Validez l'accès en lecture.
3. De retour sur Kapio, la connexion se finalise automatiquement et les comptes
   apparaissent après actualisation.

Le consentement DSP2 dure au maximum **180 jours** (parfois moins selon la
banque). À expiration, la banque remonte en erreur dans le bandeau — refaites
simplement « Connecter une banque » pour elle.

## Limites à connaître

- **Périmètre** : comptes courants + livrets (ce que la banque expose en DSP2).
  PEA / assurance-vie / PER / prêts : saisie manuelle.
- **Rafraîchissement** : la DSP2 limite à ~4 actualisations automatiques par
  jour et par compte.
- **Restricted Production** : seuls les comptes liés dans le Control Panel
  Enable Banking sont accessibles — pensez à y lier les comptes des deux
  déclarants.

## Dépannage

| Symptôme | Piste |
|---|---|
| « Non autorisé » au refresh | Le jeton saisi dans Kapio diffère de `KAPIO_BACKEND_SECRET`. |
| Erreur affichée après « Connecter une banque » | Vérifiez `ENABLE_BANKING_APP_ID` / `ENABLE_BANKING_PRIVATE_KEY` (base64 sans retour chariot) et que le backend a été redéployé après l'ajout des variables. |
| « Connexion inconnue ou expirée » au retour de la banque | Le lien de consentement a plus d'une heure — relancez « Connecter une banque ». |
| Une banque en erreur dans le bandeau | Consentement expiré (≤ 180 j) : reconnectez cette banque. |
| Banque absente de la liste | Vérifiez qu'elle est proposée pour la France dans le Control Panel Enable Banking (`GET /aspsps?country=FR`). |
```

- [ ] **Step 2: Vérification**

Run: `grep -rn -i "gocardless" docs/patrimoine-setup.md`
Expected: aucune occurrence.

- [ ] **Step 3: Commit**

```bash
git add docs/patrimoine-setup.md
git commit -m "docs(patrimoine): guide de setup réécrit pour Enable Banking"
```

---

## Vérification finale (après Task 9)

- `npm test` — suite complète verte.
- `npm run lint` — aucun avertissement nouveau.
- `npm run build` — build de production OK.
- `grep -rn -i "gocardless" api/ src/` — aucune occurrence.
- Le déploiement réel (création du compte Enable Banking, clé, variables Vercel) est fait par l'utilisateur en suivant `docs/patrimoine-setup.md` — hors périmètre du code.
