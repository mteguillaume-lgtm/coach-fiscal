# Module Patrimoine & agrégation bancaire — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à Kapio un dashboard patrimoine dynamique alimenté automatiquement (comptes + livrets via GoCardless) et par saisie manuelle (PEA/AV/PER/prêts), avec valeur nette consolidée, mode couple et historique local.

**Architecture:** Cœur client-side inchangé + un backend minimal (fonctions Vercel `api/bank/*`) qui, seul, détient les secrets GoCardless et normalise les comptes. Un adaptateur `BankProvider` multi-sources (GoCardless + manuel) produit un format `Position` normalisé unique ; des modules purs calculent la valeur nette ; une page `/patrimoine` affiche le tout.

**Tech Stack:** React 19 + Vite + Recharts (déjà présents), Vitest ; backend = Vercel Serverless Functions (Node 24+) + `@upstash/redis` + `node:crypto` ; API GoCardless Bank Account Data (ex-Nordigen).

## Global Constraints

- **Aucune valeur monétaire codée en dur** ; formatage via `toLocaleString('fr-FR')`, jamais `.toFixed()` ni séparateur manuel (convention Kapio).
- **Regex sur montants** : tolérer espace normal ET espace fine insécable (U+202F) → `[\s ]+`.
- **Providers = modules à exports nommés** enregistrés dans un `index.js` (pattern `src/lib/providers/`), PAS un objet `default`.
- **Tests** : Vitest, colocalisés dans `__tests__/`, nommés `*.test.js`, `environment: 'node'`, descriptions en français, mocks via `vi.stubGlobal('fetch', …)`.
- **Stores localStorage** : accepter un paramètre `storage = localStorage` injectable (pattern `apiKeyStore.js`) pour la testabilité.
- **Secrets GoCardless** (`GOCARDLESS_SECRET_ID/KEY`) : uniquement côté backend, jamais dans le bundle navigateur.
- **Pas d'IBAN complet** renvoyé au navigateur — seulement `iban_last4`.
- **Type `Position` normalisé** (contrat partagé, voir Task 1) : `{ id, source, bank, type, label, value, currency, iban_last4?, owner, updatedAt, manual }`.
  - `source` ∈ `'gocardless' | 'manual'`
  - `type` ∈ `'checking' | 'savings' | 'life_insurance' | 'pea' | 'securities' | 'per' | 'loan' | 'real_estate'`
  - `owner` ∈ `'d1' | 'd2' | 'joint'` (toujours `'d1'` en mode solo)
  - `value` : positif = actif, négatif = dette. Montants en unité (euros), nombre.

---

## Structure des fichiers

**Client — cœur pur (`src/lib/patrimoine/`)**
- `model.js` — constantes de types, prédicats `isAsset`/`isDebt`, `makePosition()`.
- `calculator.js` — fonctions pures : `summary`, `byBank`, `byType`, `byOwner`.
- `manualStore.js` — CRUD localStorage des postes manuels.
- `history.js` — instantanés (date + totaux) en localStorage.
- `backendConfigStore.js` — URL backend + jeton secret perso (localStorage).

**Client — adaptateurs (`src/lib/providers/bank/`)**
- `manual.js` — lit `manualStore` → `Position[]`.
- `gocardless.js` — appelle le backend (`connect`, `snapshot`, `institutions`).
- `index.js` — registre + `getConsolidatedSnapshot()` (fusion des sources).

**Backend (`api/`)**
- `_lib/auth.js` — vérifie `KAPIO_BACKEND_SECRET`.
- `_lib/crypto.js` — chiffrement AES-256-GCM des jetons.
- `_lib/store.js` — Upstash Redis (requisitions + cache jeton).
- `_lib/gocardlessClient.js` — appels HTTP GoCardless.
- `_lib/normalizeGocardless.js` — **pur** : réponse GoCardless → `Position[]`.
- `bank/connect.js`, `bank/snapshot.js`, `bank/institutions.js` — handlers.

**Client — UI (`src/pages/`, `src/components/patrimoine/`)**
- `Patrimoine.jsx` — page + orchestration.
- `components/patrimoine/SummaryHeader.jsx`, `AllocationDonut.jsx`, `NetWorthChart.jsx`, `AccountsList.jsx`, `ManualPositions.jsx`, `ConnectBankButton.jsx`.
- `src/App.jsx` — route `/patrimoine`.

**Config / docs**
- `vercel.json`, `.env.example`, `docs/patrimoine-setup.md`.

---

## Phase 1 — Cœur pur client (aucun réseau)

### Task 1: Modèle `Position`

**Files:**
- Create: `src/lib/patrimoine/model.js`
- Test: `src/lib/patrimoine/__tests__/model.test.js`

**Interfaces:**
- Produces:
  - `POSITION_TYPES: string[]`, `ASSET_TYPES: Set<string>`, `DEBT_TYPES: Set<string>`
  - `isAsset(pos): boolean` / `isDebt(pos): boolean` (basés sur le signe de `value`)
  - `makePosition(partial): Position` — complète les défauts (`source`, `owner:'d1'`, `manual:false`, `currency:'EUR'`, `updatedAt` ISO), génère un `id` si absent.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/patrimoine/__tests__/model.test.js
import { describe, it, expect } from 'vitest';
import { makePosition, isAsset, isDebt, POSITION_TYPES } from '../model';

describe('patrimoine/model', () => {
  it('makePosition applique les défauts et un id', () => {
    const p = makePosition({ bank: 'BNP', type: 'checking', label: 'CC', value: 100 });
    expect(p.id).toMatch(/^pos-/);
    expect(p).toMatchObject({ source: 'manual', owner: 'd1', manual: true, currency: 'EUR' });
    expect(typeof p.updatedAt).toBe('string');
  });

  it('makePosition conserve les valeurs fournies', () => {
    const p = makePosition({ id: 'x', source: 'gocardless', owner: 'joint', manual: false, value: -5, type: 'loan', bank: 'X', label: 'P' });
    expect(p).toMatchObject({ id: 'x', source: 'gocardless', owner: 'joint', manual: false });
  });

  it('isAsset/isDebt suivent le signe de value', () => {
    expect(isAsset(makePosition({ value: 10 }))).toBe(true);
    expect(isDebt(makePosition({ value: -10 }))).toBe(true);
    expect(isDebt(makePosition({ value: 0 }))).toBe(false);
  });

  it('POSITION_TYPES couvre les 8 types du contrat', () => {
    expect(POSITION_TYPES).toEqual(
      expect.arrayContaining(['checking','savings','life_insurance','pea','securities','per','loan','real_estate']),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/patrimoine/__tests__/model.test.js`
Expected: FAIL (`Cannot find module '../model'`).

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/patrimoine/model.js
// Modèle normalisé « Position » — contrat partagé entre sources (GoCardless,
// saisie manuelle) et calculs. value > 0 = actif, value < 0 = dette.

export const POSITION_TYPES = [
  'checking', 'savings', 'life_insurance', 'pea',
  'securities', 'per', 'loan', 'real_estate',
];

export const DEBT_TYPES = new Set(['loan']);
export const ASSET_TYPES = new Set(
  POSITION_TYPES.filter((t) => !DEBT_TYPES.has(t)),
);

export const isAsset = (pos) => Number(pos.value) > 0;
export const isDebt = (pos) => Number(pos.value) < 0;

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Complète un poste partiel avec les défauts du contrat. */
export function makePosition(partial = {}) {
  return {
    id: partial.id ?? `pos-${randomId()}`,
    source: partial.source ?? 'manual',
    bank: partial.bank ?? '',
    type: partial.type ?? 'checking',
    label: partial.label ?? '',
    value: Number(partial.value ?? 0),
    currency: partial.currency ?? 'EUR',
    ...(partial.iban_last4 ? { iban_last4: partial.iban_last4 } : {}),
    owner: partial.owner ?? 'd1',
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    manual: partial.manual ?? (partial.source ? partial.source === 'manual' : true),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/patrimoine/__tests__/model.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/patrimoine/model.js src/lib/patrimoine/__tests__/model.test.js
git commit -m "feat(patrimoine): modèle Position normalisé (types, prédicats, makePosition)"
```

---

### Task 2: Calculateur patrimoine

**Files:**
- Create: `src/lib/patrimoine/calculator.js`
- Test: `src/lib/patrimoine/__tests__/calculator.test.js`

**Interfaces:**
- Consumes: `isDebt` de `model.js`.
- Produces:
  - `summary(positions): { netWorth, assets, debts, count }` — `debts` = magnitude positive.
  - `byBank(positions): Record<string, number>`
  - `byType(positions): Record<string, number>`
  - `byOwner(positions): { d1, d2, joint }`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/patrimoine/__tests__/calculator.test.js
import { describe, it, expect } from 'vitest';
import { summary, byBank, byType, byOwner } from '../calculator';

const P = [
  { bank: 'BNP', type: 'checking', value: 3000, owner: 'd1' },
  { bank: 'BNP', type: 'savings',  value: 2000, owner: 'd1' },
  { bank: 'Bourso', type: 'pea',   value: 42000, owner: 'joint' },
  { bank: 'BNP', type: 'loan',     value: -184000, owner: 'd2' },
];

describe('patrimoine/calculator', () => {
  it('summary : actifs, dettes (magnitude), valeur nette', () => {
    expect(summary(P)).toEqual({ netWorth: -137000, assets: 47000, debts: 184000, count: 4 });
  });

  it('summary sur liste vide', () => {
    expect(summary([])).toEqual({ netWorth: 0, assets: 0, debts: 0, count: 0 });
  });

  it('byBank agrège par établissement (dettes incluses en négatif)', () => {
    expect(byBank(P)).toEqual({ BNP: -179000, Bourso: 42000 });
  });

  it('byType agrège par type', () => {
    expect(byType(P)).toEqual({ checking: 3000, savings: 2000, pea: 42000, loan: -184000 });
  });

  it('byOwner répartit d1/d2/joint', () => {
    expect(byOwner(P)).toEqual({ d1: 5000, d2: -184000, joint: 42000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/patrimoine/__tests__/calculator.test.js`
Expected: FAIL (`Cannot find module '../calculator'`).

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/patrimoine/calculator.js
// Calculs patrimoine — fonctions pures, sans effet de bord ni réseau.
import { isDebt } from './model';

const sum = (arr) => arr.reduce((a, v) => a + Number(v || 0), 0);

export function summary(positions) {
  const values = positions.map((p) => Number(p.value || 0));
  const assets = sum(values.filter((v) => v > 0));
  const debts = -sum(values.filter((v) => v < 0)); // magnitude positive
  return { netWorth: assets - debts, assets, debts, count: positions.length };
}

function groupBy(positions, keyFn) {
  const out = {};
  for (const p of positions) {
    const k = keyFn(p);
    out[k] = (out[k] || 0) + Number(p.value || 0);
  }
  return out;
}

export const byBank = (positions) => groupBy(positions, (p) => p.bank || '—');
export const byType = (positions) => groupBy(positions, (p) => p.type);

export function byOwner(positions) {
  const out = { d1: 0, d2: 0, joint: 0 };
  for (const p of positions) {
    const k = out[p.owner] !== undefined ? p.owner : 'd1';
    out[k] += Number(p.value || 0);
  }
  return out;
}

// Ré-export pratique (évite un import supplémentaire côté UI).
export { isDebt };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/patrimoine/__tests__/calculator.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/patrimoine/calculator.js src/lib/patrimoine/__tests__/calculator.test.js
git commit -m "feat(patrimoine): calculateur pur (summary, byBank, byType, byOwner)"
```

---

### Task 3: Store des saisies manuelles

**Files:**
- Create: `src/lib/patrimoine/manualStore.js`
- Test: `src/lib/patrimoine/__tests__/manualStore.test.js`

**Interfaces:**
- Consumes: `makePosition` de `model.js`.
- Produces (toutes acceptent `storage = localStorage`, renvoient le tableau à jour) :
  - `listManual(storage): Position[]`
  - `addManual(partial, storage): Position[]`
  - `updateManual(id, patch, storage): Position[]`
  - `removeManual(id, storage): Position[]`
  - `MANUAL_KEY = 'kapio.patrimoine.manual'`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/patrimoine/__tests__/manualStore.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { listManual, addManual, updateManual, removeManual, MANUAL_KEY } from '../manualStore';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('patrimoine/manualStore', () => {
  let s;
  beforeEach(() => { s = memStorage(); });

  it('listManual vide par défaut', () => {
    expect(listManual(s)).toEqual([]);
  });

  it('addManual force source/manual et persiste', () => {
    const list = addManual({ bank: 'Bourso', type: 'pea', label: 'PEA', value: 42000, owner: 'd1' }, s);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ source: 'manual', manual: true, type: 'pea', value: 42000 });
    expect(JSON.parse(s.getItem(MANUAL_KEY))).toHaveLength(1);
  });

  it('updateManual modifie par id', () => {
    const [p] = addManual({ type: 'pea', value: 1000 }, s);
    const list = updateManual(p.id, { value: 1500 }, s);
    expect(list[0].value).toBe(1500);
    expect(list[0].updatedAt).not.toBe(p.updatedAt);
  });

  it('removeManual supprime par id', () => {
    const [p] = addManual({ type: 'pea', value: 1000 }, s);
    expect(removeManual(p.id, s)).toEqual([]);
  });

  it('listManual ignore un JSON corrompu', () => {
    s.setItem(MANUAL_KEY, '{oops');
    expect(listManual(s)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/patrimoine/__tests__/manualStore.test.js`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/patrimoine/manualStore.js
// CRUD des postes patrimoniaux saisis à la main (PEA, AV, PER, prêts, immo).
// Stockage localStorage dédié, distinct du profil fiscal. `storage` injectable.
import { makePosition } from './model';

export const MANUAL_KEY = 'kapio.patrimoine.manual';

export function listManual(storage = localStorage) {
  try {
    const raw = storage.getItem(MANUAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(list, storage) {
  storage.setItem(MANUAL_KEY, JSON.stringify(list));
  return list;
}

export function addManual(partial, storage = localStorage) {
  const pos = makePosition({ ...partial, source: 'manual', manual: true });
  return save([...listManual(storage), pos], storage);
}

export function updateManual(id, patch, storage = localStorage) {
  const list = listManual(storage).map((p) =>
    p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
  );
  return save(list, storage);
}

export function removeManual(id, storage = localStorage) {
  return save(listManual(storage).filter((p) => p.id !== id), storage);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/patrimoine/__tests__/manualStore.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/patrimoine/manualStore.js src/lib/patrimoine/__tests__/manualStore.test.js
git commit -m "feat(patrimoine): store localStorage des saisies manuelles"
```

---

### Task 4: Historique local des instantanés

**Files:**
- Create: `src/lib/patrimoine/history.js`
- Test: `src/lib/patrimoine/__tests__/history.test.js`

**Interfaces:**
- Produces :
  - `HISTORY_KEY = 'kapio.patrimoine.history'`, `MAX_POINTS = 500`
  - `listHistory(storage): Array<{ date, netWorth, assets, debts }>`
  - `appendSnapshot({ netWorth, assets, debts }, storage, now = new Date()): Array` — un point par **jour** (remplace le point du jour), tronqué à `MAX_POINTS`.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/patrimoine/__tests__/history.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { listHistory, appendSnapshot, HISTORY_KEY } from '../history';

function memStorage(init) {
  const m = new Map(init ? [[HISTORY_KEY, init]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('patrimoine/history', () => {
  let s;
  beforeEach(() => { s = memStorage(); });

  it('appendSnapshot ajoute un point daté', () => {
    const h = appendSnapshot({ netWorth: 100, assets: 100, debts: 0 }, s, new Date('2026-07-10T09:00:00Z'));
    expect(h).toEqual([{ date: '2026-07-10', netWorth: 100, assets: 100, debts: 0 }]);
  });

  it('remplace le point du même jour au lieu de dupliquer', () => {
    appendSnapshot({ netWorth: 100, assets: 100, debts: 0 }, s, new Date('2026-07-10T09:00:00Z'));
    const h = appendSnapshot({ netWorth: 150, assets: 150, debts: 0 }, s, new Date('2026-07-10T18:00:00Z'));
    expect(h).toHaveLength(1);
    expect(h[0].netWorth).toBe(150);
  });

  it('conserve les jours distincts, triés', () => {
    appendSnapshot({ netWorth: 1, assets: 1, debts: 0 }, s, new Date('2026-07-09T09:00:00Z'));
    const h = appendSnapshot({ netWorth: 2, assets: 2, debts: 0 }, s, new Date('2026-07-10T09:00:00Z'));
    expect(h.map((p) => p.date)).toEqual(['2026-07-09', '2026-07-10']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/patrimoine/__tests__/history.test.js`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/patrimoine/history.js
// Historique léger de la valeur nette (date + totaux, sans détail sensible).
// Un point par jour, en localStorage. Alimente le graphe d'évolution.
export const HISTORY_KEY = 'kapio.patrimoine.history';
export const MAX_POINTS = 500;

export function listHistory(storage = localStorage) {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function appendSnapshot({ netWorth, assets, debts }, storage = localStorage, now = new Date()) {
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const point = { date, netWorth, assets, debts };
  const rest = listHistory(storage).filter((p) => p.date !== date);
  const list = [...rest, point]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_POINTS);
  storage.setItem(HISTORY_KEY, JSON.stringify(list));
  return list;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/patrimoine/__tests__/history.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/patrimoine/history.js src/lib/patrimoine/__tests__/history.test.js
git commit -m "feat(patrimoine): historique local des instantanés de valeur nette"
```

---

### Task 5: Store de configuration backend

**Files:**
- Create: `src/lib/patrimoine/backendConfigStore.js`
- Test: `src/lib/patrimoine/__tests__/backendConfigStore.test.js`

**Interfaces:**
- Produces (pattern `apiKeyStore.js`, `storage` injectable) :
  - `getBackendConfig(storage): { url: string, secret: string }`
  - `setBackendConfig({ url, secret }, storage): void`
  - `hasBackendConfig(storage): boolean`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/patrimoine/__tests__/backendConfigStore.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { getBackendConfig, setBackendConfig, hasBackendConfig } from '../backendConfigStore';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('patrimoine/backendConfigStore', () => {
  let s;
  beforeEach(() => { s = memStorage(); });

  it('vide par défaut', () => {
    expect(getBackendConfig(s)).toEqual({ url: '', secret: '' });
    expect(hasBackendConfig(s)).toBe(false);
  });

  it('persiste url + secret', () => {
    setBackendConfig({ url: 'https://x.vercel.app', secret: 'abc' }, s);
    expect(getBackendConfig(s)).toEqual({ url: 'https://x.vercel.app', secret: 'abc' });
    expect(hasBackendConfig(s)).toBe(true);
  });

  it('hasBackendConfig exige les deux champs', () => {
    setBackendConfig({ url: 'https://x', secret: '' }, s);
    expect(hasBackendConfig(s)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/patrimoine/__tests__/backendConfigStore.test.js`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/patrimoine/backendConfigStore.js
// URL du backend patrimoine + jeton secret perso, en localStorage (comme la clé API).
const URL_KEY = 'kapio.patrimoine.backendUrl';
const SECRET_KEY = 'kapio.patrimoine.backendSecret';

export function getBackendConfig(storage = localStorage) {
  return {
    url: storage.getItem(URL_KEY) || '',
    secret: storage.getItem(SECRET_KEY) || '',
  };
}

export function setBackendConfig({ url, secret }, storage = localStorage) {
  if (url) storage.setItem(URL_KEY, url); else storage.removeItem(URL_KEY);
  if (secret) storage.setItem(SECRET_KEY, secret); else storage.removeItem(SECRET_KEY);
}

export function hasBackendConfig(storage = localStorage) {
  const { url, secret } = getBackendConfig(storage);
  return Boolean(url && secret);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/patrimoine/__tests__/backendConfigStore.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/patrimoine/backendConfigStore.js src/lib/patrimoine/__tests__/backendConfigStore.test.js
git commit -m "feat(patrimoine): store config backend (url + jeton secret perso)"
```

---

## Phase 2 — Adaptateurs `BankProvider` (client)

### Task 6: Adaptateurs manuel + GoCardless (client)

**Files:**
- Create: `src/lib/providers/bank/manual.js`
- Create: `src/lib/providers/bank/gocardless.js`
- Test: `src/lib/providers/bank/__tests__/manual.test.js`
- Test: `src/lib/providers/bank/__tests__/gocardless.test.js`

**Interfaces:**
- `manual.js` — Consumes `listManual`. Produces `getPositions(storage): Position[]` (postes manuels tels quels).
- `gocardless.js` — Produces (côté client, appelle le backend) :
  - `getPositions({ url, secret }, fetchImpl = fetch): Promise<Position[]>` → `GET {url}/api/bank/snapshot`, header `x-kapio-secret`.
  - `startConnect({ url, secret, institutionId, owner }, fetchImpl = fetch): Promise<{ link: string }>` → `POST {url}/api/bank/connect`.
  - `listInstitutions({ url, secret, country = 'fr' }, fetchImpl = fetch): Promise<Array<{ id, name }>>`.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/providers/bank/__tests__/manual.test.js
import { describe, it, expect } from 'vitest';
import * as manual from '../manual';

function memStorage(list) {
  const m = new Map([['kapio.patrimoine.manual', JSON.stringify(list)]]);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: () => {}, removeItem: () => {} };
}

describe('bank/manual', () => {
  it('getPositions renvoie les postes manuels stockés', () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
    expect(manual.getPositions(s)).toEqual([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
  });
});
```

```js
// src/lib/providers/bank/__tests__/gocardless.test.js
import { describe, it, expect, vi } from 'vitest';
import * as gc from '../gocardless';

const cfg = { url: 'https://back.vercel.app', secret: 's3cr3t' };

describe('bank/gocardless (client)', () => {
  it('getPositions appelle /api/bank/snapshot avec le header secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ positions: [{ id: 'gc-1', value: 100 }] }),
    });
    const out = await gc.getPositions(cfg, fetchMock);
    expect(out).toEqual([{ id: 'gc-1', value: 100 }]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://back.vercel.app/api/bank/snapshot');
    expect(opts.headers['x-kapio-secret']).toBe('s3cr3t');
  });

  it('getPositions lève sur réponse non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'nope' });
    await expect(gc.getPositions(cfg, fetchMock)).rejects.toThrow(/401/);
  });

  it('startConnect POST institution + owner et renvoie le lien', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ link: 'https://bank/consent' }) });
    const out = await gc.startConnect({ ...cfg, institutionId: 'BNP_FR', owner: 'd2' }, fetchMock);
    expect(out).toEqual({ link: 'https://bank/consent' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ institutionId: 'BNP_FR', owner: 'd2' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/providers/bank/__tests__`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Write minimal implementations**

```js
// src/lib/providers/bank/manual.js
// Source « saisie manuelle » : lit le store patrimoine → Position[].
import { listManual } from '../../patrimoine/manualStore';

export const id = 'manual';
export const getPositions = (storage = localStorage) => listManual(storage);
```

```js
// src/lib/providers/bank/gocardless.js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/providers/bank/__tests__`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/bank/manual.js src/lib/providers/bank/gocardless.js src/lib/providers/bank/__tests__
git commit -m "feat(patrimoine): adaptateurs BankProvider manuel + GoCardless (client)"
```

---

### Task 7: Registre `bank/index.js` + fusion des sources

**Files:**
- Create: `src/lib/providers/bank/index.js`
- Test: `src/lib/providers/bank/__tests__/index.test.js`

**Interfaces:**
- Consumes: `manual.getPositions`, `gocardless.getPositions`.
- Produces:
  - `getConsolidatedSnapshot({ config, storage, includeAuto = true }, deps = {}): Promise<{ generatedAt, positions }>` — fusionne postes GoCardless (si `config` valide et `includeAuto`) + postes manuels. `deps.gocardless` injectable pour test. Une source auto en erreur ne casse pas le manuel (renvoie les manuels + un champ `errors`).

- [ ] **Step 1: Write the failing test**

```js
// src/lib/providers/bank/__tests__/index.test.js
import { describe, it, expect, vi } from 'vitest';
import { getConsolidatedSnapshot } from '../index';

function memStorage(list) {
  const m = new Map([['kapio.patrimoine.manual', JSON.stringify(list)]]);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: () => {}, removeItem: () => {} };
}

describe('bank/index.getConsolidatedSnapshot', () => {
  it('fusionne GoCardless + manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', type: 'pea', value: 42000 }]);
    const gocardless = { getPositions: vi.fn().mockResolvedValue([{ id: 'gc-1', source: 'gocardless', type: 'checking', value: 3000 }]) };
    const snap = await getConsolidatedSnapshot(
      { config: { url: 'u', secret: 's' }, storage: s },
      { gocardless },
    );
    expect(snap.positions).toHaveLength(2);
    expect(snap.positions.map((p) => p.source).sort()).toEqual(['gocardless', 'manual']);
    expect(typeof snap.generatedAt).toBe('string');
  });

  it('sans config valide : renvoie seulement le manuel', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const gocardless = { getPositions: vi.fn() };
    const snap = await getConsolidatedSnapshot({ config: { url: '', secret: '' }, storage: s }, { gocardless });
    expect(gocardless.getPositions).not.toHaveBeenCalled();
    expect(snap.positions).toHaveLength(1);
  });

  it('erreur GoCardless : conserve le manuel + remonte errors', async () => {
    const s = memStorage([{ id: 'man-1', source: 'manual', value: 1 }]);
    const gocardless = { getPositions: vi.fn().mockRejectedValue(new Error('boom')) };
    const snap = await getConsolidatedSnapshot({ config: { url: 'u', secret: 's' }, storage: s }, { gocardless });
    expect(snap.positions).toHaveLength(1);
    expect(snap.errors[0]).toMatch(/boom/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/providers/bank/__tests__/index.test.js`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/providers/bank/index.js
// Registre des sources patrimoine et fusion en un instantané unique.
// Une source auto en échec ne doit jamais faire perdre les saisies manuelles.
import * as manualProvider from './manual';
import * as gocardlessProvider from './gocardless';

export { manualProvider as manual, gocardlessProvider as gocardless };

export async function getConsolidatedSnapshot(
  { config, storage = localStorage, includeAuto = true },
  deps = {},
) {
  const gocardless = deps.gocardless || gocardlessProvider;
  const positions = [...manualProvider.getPositions(storage)];
  const errors = [];

  const hasConfig = Boolean(config?.url && config?.secret);
  if (includeAuto && hasConfig) {
    try {
      const auto = await gocardless.getPositions(config);
      positions.push(...auto);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }

  return { generatedAt: new Date().toISOString(), positions, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/providers/bank/__tests__/index.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/bank/index.js src/lib/providers/bank/__tests__/index.test.js
git commit -m "feat(patrimoine): registre bank + fusion sources (getConsolidatedSnapshot)"
```

---

## Phase 3 — Backend (fonctions Vercel)

> **Note d'exécution :** ajouter `@upstash/redis` aux dépendances (`npm i @upstash/redis`). Les handlers utilisent la signature Vercel Node `export default function handler(req, res)`. Les détails exacts des endpoints GoCardless (agreements/requisitions/accounts/balances, quotas du tier gratuit) sont à confirmer via la doc pendant l'exécution — les signatures ci-dessous fixent le contrat interne.

### Task 8: Normaliseur GoCardless (pur) + auth + crypto

**Files:**
- Create: `api/_lib/normalizeGocardless.js`
- Create: `api/_lib/auth.js`
- Create: `api/_lib/crypto.js`
- Test: `api/_lib/__tests__/normalizeGocardless.test.js`
- Test: `api/_lib/__tests__/crypto.test.js`
- Modify: `vite.config.js` — étendre `test.include` aux tests de `api/`.

**Interfaces:**
- `normalizeGocardless.js` — Produces `normalizeAccounts(rawAccounts): Position[]`, où `rawAccounts` = `Array<{ id, bankName, owner, cashAccountType?, product?, iban?, name?, balance: { amount, currency } }>`. Mappe vers le type `Position` (même contrat que Task 1, `source:'gocardless'`, `manual:false`).
- `auth.js` — Produces `requireSecret(req): void` (lève `{ status: 401 }` si `x-kapio-secret` ≠ `process.env.KAPIO_BACKEND_SECRET`).
- `crypto.js` — Produces `encrypt(plain): string`, `decrypt(token): string` (AES-256-GCM, clé hex `TOKEN_ENCRYPTION_KEY`).

- [ ] **Step 1: Write the failing tests**

```js
// api/_lib/__tests__/normalizeGocardless.test.js
import { describe, it, expect } from 'vitest';
import { normalizeAccounts } from '../normalizeGocardless';

describe('normalizeGocardless', () => {
  it('mappe un compte courant', () => {
    const [p] = normalizeAccounts([{
      id: 'acc-1', bankName: 'BNP', owner: 'd1',
      cashAccountType: 'CACC', iban: 'FR7630004000031234567890143', name: 'Compte courant',
      balance: { amount: '3250.42', currency: 'EUR' },
    }]);
    expect(p).toMatchObject({
      id: 'gc-acc-1', source: 'gocardless', manual: false, bank: 'BNP',
      type: 'checking', label: 'Compte courant', value: 3250.42, currency: 'EUR',
      iban_last4: '0143', owner: 'd1',
    });
  });

  it('mappe un livret vers savings', () => {
    const [p] = normalizeAccounts([{
      id: 'acc-2', bankName: 'BNP', owner: 'd1', cashAccountType: 'SVGS',
      name: 'Livret A', balance: { amount: '3450', currency: 'EUR' },
    }]);
    expect(p.type).toBe('savings');
    expect(p.iban_last4).toBeUndefined();
  });

  it('type par défaut = checking si inconnu', () => {
    const [p] = normalizeAccounts([{ id: 'a', bankName: 'X', owner: 'd1', balance: { amount: '0', currency: 'EUR' } }]);
    expect(p.type).toBe('checking');
  });
});
```

```js
// api/_lib/__tests__/crypto.test.js
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64); // 32 octets en hex
});

describe('crypto', () => {
  it('encrypt/decrypt fait un aller-retour', async () => {
    const { encrypt, decrypt } = await import('../crypto');
    const token = encrypt('secret-token');
    expect(token).not.toContain('secret-token');
    expect(decrypt(token)).toBe('secret-token');
  });
});
```

- [ ] **Step 2: Étendre la config de test puis lancer (échec attendu)**

Modifier `vite.config.js` — remplacer la ligne `include` :

```js
    include: ['src/**/*.test.{js,jsx,ts}', 'api/**/*.test.{js,jsx,ts}'],
```

Run: `npx vitest run api/_lib/__tests__`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Write minimal implementations**

```js
// api/_lib/normalizeGocardless.js
// PUR : réponse GoCardless (comptes + soldes) → Position[] (contrat Kapio).
const TYPE_BY_CASH = { CACC: 'checking', SVGS: 'savings', CARD: 'checking' };

function detectType(acc) {
  if (acc.cashAccountType && TYPE_BY_CASH[acc.cashAccountType]) return TYPE_BY_CASH[acc.cashAccountType];
  const hay = `${acc.product || ''} ${acc.name || ''}`.toLowerCase();
  if (/livret|ldds|epargne|épargne/.test(hay)) return 'savings';
  return 'checking';
}

export function normalizeAccounts(rawAccounts = []) {
  return rawAccounts.map((acc) => {
    const pos = {
      id: `gc-${acc.id}`,
      source: 'gocardless',
      bank: acc.bankName || '',
      type: detectType(acc),
      label: acc.name || acc.product || 'Compte',
      value: Number(acc.balance?.amount ?? 0),
      currency: acc.balance?.currency || 'EUR',
      owner: acc.owner || 'd1',
      updatedAt: new Date().toISOString(),
      manual: false,
    };
    if (acc.iban) pos.iban_last4 = String(acc.iban).slice(-4);
    return pos;
  });
}
```

```js
// api/_lib/auth.js
// Vérifie le jeton secret perso. Lève un objet { status } capté par le handler.
export function requireSecret(req) {
  const provided = req.headers['x-kapio-secret'];
  const expected = process.env.KAPIO_BACKEND_SECRET;
  if (!expected || provided !== expected) {
    const err = new Error('Non autorisé');
    err.status = 401;
    throw err;
  }
}
```

```js
// api/_lib/crypto.js
// Chiffrement AES-256-GCM des jetons au repos. Clé = TOKEN_ENCRYPTION_KEY (hex, 32 octets).
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const key = () => Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');

export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join('.');
}

export function decrypt(token) {
  const [ivHex, tagHex, dataHex] = token.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/__tests__`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/normalizeGocardless.js api/_lib/auth.js api/_lib/crypto.js api/_lib/__tests__ vite.config.js
git commit -m "feat(patrimoine): backend — normaliseur GoCardless pur, auth secret, crypto jetons"
```

---

### Task 9: Client GoCardless + store Redis (backend)

**Files:**
- Create: `api/_lib/gocardlessClient.js`
- Create: `api/_lib/store.js`
- Test: `api/_lib/__tests__/gocardlessClient.test.js`

**Interfaces:**
- `gocardlessClient.js` — Produces (chaque fn accepte `fetchImpl = fetch`) :
  - `getAccessToken(fetchImpl): Promise<string>` — POST `/token/new/` avec `secret_id/secret_key`.
  - `listInstitutions(country, token, fetchImpl): Promise<Array<{ id, name }>>`
  - `createRequisition({ institutionId, redirect, reference }, token, fetchImpl): Promise<{ id, link }>`
  - `getRequisitionAccounts(requisitionId, token, fetchImpl): Promise<string[]>`
  - `getAccountDetails(accountId, token, fetchImpl): Promise<object>` et `getAccountBalance(accountId, token, fetchImpl): Promise<{ amount, currency }>`
- `store.js` — Produces `saveRequisition({ id, owner, institutionId, bank }): Promise<void>`, `listRequisitions(): Promise<Array>`, `removeRequisition(id): Promise<void>` (via `@upstash/redis`, clé `kapio:requisitions`).

- [ ] **Step 1: Write the failing test** (client GoCardless, HTTP mocké)

```js
// api/_lib/__tests__/gocardlessClient.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccessToken, createRequisition } from '../gocardlessClient';

beforeEach(() => {
  process.env.GOCARDLESS_SECRET_ID = 'sid';
  process.env.GOCARDLESS_SECRET_KEY = 'skey';
});

describe('gocardlessClient', () => {
  it('getAccessToken poste les secrets et renvoie access', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access: 'tok-123' }) });
    const tok = await getAccessToken(fetchMock);
    expect(tok).toBe('tok-123');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ secret_id: 'sid', secret_key: 'skey' });
  });

  it('createRequisition renvoie id + link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'req-1', link: 'https://consent' }) });
    const out = await createRequisition({ institutionId: 'BNP', redirect: 'https://app', reference: 'd1:BNP' }, 'tok', fetchMock);
    expect(out).toEqual({ id: 'req-1', link: 'https://consent' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/__tests__/gocardlessClient.test.js`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementations**

```js
// api/_lib/gocardlessClient.js
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
```

```js
// api/_lib/store.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/__tests__/gocardlessClient.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/gocardlessClient.js api/_lib/store.js api/_lib/__tests__/gocardlessClient.test.js
git commit -m "feat(patrimoine): backend — client GoCardless + store Redis des requisitions"
```

---

### Task 10: Handlers `connect`, `snapshot`, `institutions`

**Files:**
- Create: `api/bank/connect.js`
- Create: `api/bank/snapshot.js`
- Create: `api/bank/institutions.js`
- Create: `vercel.json`
- Create: `.env.example`
- Test: `api/bank/__tests__/snapshot.test.js`

**Interfaces:**
- Consumes: `requireSecret`, `getAccessToken`, `listInstitutions`, `createRequisition`, `getRequisitionAccounts`, `getAccountDetails`, `getAccountBalance`, `normalizeAccounts`, `saveRequisition`, `listRequisitions`.
- Produces (contrat HTTP consommé par le client Task 6) :
  - `POST /api/bank/connect { institutionId, owner }` → `{ link }`
  - `GET /api/bank/snapshot` → `{ positions: Position[] }`
  - `GET /api/bank/institutions?country=fr` → `{ institutions: [{ id, name }] }`

- [ ] **Step 1: Write the failing test** (handler snapshot, deps mockées via modules)

```js
// api/bank/__tests__/snapshot.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../_lib/auth.js', () => ({ requireSecret: vi.fn() }));
vi.mock('../../_lib/store.js', () => ({
  listRequisitions: vi.fn().mockResolvedValue([{ id: 'req-1', owner: 'd1', bank: 'BNP' }]),
}));
vi.mock('../../_lib/gocardlessClient.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('tok'),
  getRequisitionAccounts: vi.fn().mockResolvedValue(['acc-1']),
  getAccountDetails: vi.fn().mockResolvedValue({ cashAccountType: 'CACC', name: 'CC', iban: 'FR760001' }),
  getAccountBalance: vi.fn().mockResolvedValue({ amount: '3000', currency: 'EUR' }),
}));

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
    expect(res.body.positions[0]).toMatchObject({ source: 'gocardless', type: 'checking', value: 3000, bank: 'BNP', owner: 'd1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/bank/__tests__/snapshot.test.js`
Expected: FAIL (module `../snapshot.js` introuvable).

- [ ] **Step 3: Write minimal implementations**

```js
// api/bank/snapshot.js
import { requireSecret } from '../_lib/auth.js';
import { listRequisitions } from '../_lib/store.js';
import { getAccessToken, getRequisitionAccounts, getAccountDetails, getAccountBalance } from '../_lib/gocardlessClient.js';
import { normalizeAccounts } from '../_lib/normalizeGocardless.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const token = await getAccessToken();
    const requisitions = await listRequisitions();
    const raw = [];
    for (const r of requisitions) {
      const accountIds = await getRequisitionAccounts(r.id, token);
      for (const id of accountIds) {
        const details = await getAccountDetails(id, token);
        const balance = await getAccountBalance(id, token);
        raw.push({ id, bankName: r.bank, owner: r.owner, ...details, balance });
      }
    }
    return res.status(200).json({ positions: normalizeAccounts(raw) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
```

```js
// api/bank/connect.js
import { requireSecret } from '../_lib/auth.js';
import { getAccessToken, createRequisition } from '../_lib/gocardlessClient.js';
import { saveRequisition } from '../_lib/store.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { institutionId, owner = 'd1' } = req.body || {};
    if (!institutionId) return res.status(400).json({ error: 'institutionId requis' });

    const token = await getAccessToken();
    const redirect = `${process.env.APP_ORIGIN}/patrimoine`;
    const { id, link } = await createRequisition({ institutionId, redirect, reference: `${owner}:${institutionId}:${Date.now()}` }, token);
    await saveRequisition({ id, owner, institutionId, bank: institutionId });
    return res.status(200).json({ link });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
```

```js
// api/bank/institutions.js
import { requireSecret } from '../_lib/auth.js';
import { getAccessToken, listInstitutions } from '../_lib/gocardlessClient.js';

export default async function handler(req, res) {
  try {
    requireSecret(req);
    const country = (req.query?.country || 'fr').toString();
    const token = await getAccessToken();
    return res.status(200).json({ institutions: await listInstitutions(country, token) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
```

```json
// vercel.json
{
  "functions": { "api/**/*.js": { "runtime": "nodejs22.x" } }
}
```

```bash
# .env.example
GOCARDLESS_SECRET_ID=
GOCARDLESS_SECRET_KEY=
TOKEN_ENCRYPTION_KEY=      # 32 octets en hexadécimal (64 caractères)
KAPIO_BACKEND_SECRET=      # jeton secret perso (long, aléatoire)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APP_ORIGIN=http://localhost:5173
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/bank/__tests__/snapshot.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add api/bank vercel.json .env.example
git commit -m "feat(patrimoine): backend — handlers connect/snapshot/institutions + config Vercel"
```

---

## Phase 4 — UI

### Task 11: Route `/patrimoine` + page squelette + lien de nav

**Files:**
- Create: `src/pages/Patrimoine.jsx`
- Modify: `src/App.jsx` (ajout route + import)
- Modify: le composant de navigation (`src/components/Layout.jsx` ou équivalent — repérer le fichier qui liste les liens `/dashboard`, `/chat`… et y ajouter `/patrimoine`)

**Interfaces:**
- Produces: composant `Patrimoine` monté sur `/patrimoine`.

- [ ] **Step 1: Créer la page squelette**

```jsx
// src/pages/Patrimoine.jsx
import { useState, useEffect, useCallback } from 'react';
import { getBackendConfig } from '../lib/patrimoine/backendConfigStore';
import { getConsolidatedSnapshot } from '../lib/providers/bank';
import { summary } from '../lib/patrimoine/calculator';
import { appendSnapshot } from '../lib/patrimoine/history';

export default function Patrimoine() {
  const [snap, setSnap] = useState({ positions: [], errors: [] });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const config = getBackendConfig();
      const next = await getConsolidatedSnapshot({ config });
      setSnap(next);
      appendSnapshot(summary(next.positions));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const s = summary(snap.positions);
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Patrimoine</h1>
        <button onClick={refresh} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {loading ? 'Actualisation…' : '↻ Actualiser'}
        </button>
      </div>
      <p className="mt-2 text-3xl font-semibold">{s.netWorth.toLocaleString('fr-FR')} €</p>
      {snap.positions.length === 0 && !loading && (
        <p className="mt-6 text-gray-500">Aucun compte. Connecte une banque ou ajoute un placement.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Enregistrer la route dans `src/App.jsx`**

Ajouter l'import près des autres pages :
```jsx
import Patrimoine from './pages/Patrimoine';
```
Ajouter la route à côté de `/dashboard` :
```jsx
                <Route path="/patrimoine" element={<Patrimoine />} />
```

- [ ] **Step 3: Ajouter le lien de navigation**

Repérer le fichier de navigation (celui contenant les liens `/dashboard`, `/chat`) :
```bash
grep -rln 'to="/dashboard"' src
```
Y ajouter un lien `/patrimoine` (libellé « Patrimoine »), en suivant exactement le style des liens voisins.

- [ ] **Step 4: Vérifier manuellement**

Run: `npm run dev` puis ouvrir `http://localhost:5173/patrimoine`.
Expected: la page s'affiche, titre « Patrimoine », valeur nette « 0 € », message d'état vide. `npm run lint` sans erreur.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Patrimoine.jsx src/App.jsx src/components
git commit -m "feat(patrimoine): route /patrimoine + page squelette + lien de nav"
```

---

### Task 12: Saisie manuelle (formulaire + liste)

**Files:**
- Create: `src/components/patrimoine/ManualPositions.jsx`
- Modify: `src/pages/Patrimoine.jsx` (intégrer le composant + rafraîchir après modif)
- Test: `src/components/patrimoine/__tests__/ManualPositions.test.jsx`

**Interfaces:**
- Consumes: `listManual`, `addManual`, `removeManual` de `manualStore`.
- Produces: `<ManualPositions mode={'solo'|'couple'} onChange={fn} />` — liste éditable + formulaire d'ajout (type, libellé, organisme, valeur, propriétaire).

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/patrimoine/__tests__/ManualPositions.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ManualPositions from '../ManualPositions';
import { MANUAL_KEY } from '../../../lib/patrimoine/manualStore';

beforeEach(() => localStorage.clear());

describe('ManualPositions', () => {
  it('ajoute un poste manuel via le formulaire', () => {
    const onChange = vi.fn();
    render(<ManualPositions mode="solo" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/libellé/i), { target: { value: 'Mon PEA' } });
    fireEvent.change(screen.getByLabelText(/valeur/i), { target: { value: '42000' } });
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(JSON.parse(localStorage.getItem(MANUAL_KEY))).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText('Mon PEA')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/patrimoine/__tests__/ManualPositions.test.jsx`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/components/patrimoine/ManualPositions.jsx
import { useState } from 'react';
import { listManual, addManual, removeManual } from '../../lib/patrimoine/manualStore';
import { POSITION_TYPES } from '../../lib/patrimoine/model';

const TYPE_LABELS = {
  checking: 'Compte courant', savings: 'Livret', life_insurance: 'Assurance-vie',
  pea: 'PEA', securities: 'Compte-titres', per: 'PER', loan: 'Prêt', real_estate: 'Immobilier',
};

export default function ManualPositions({ mode = 'solo', onChange }) {
  const [list, setList] = useState(() => listManual());
  const [form, setForm] = useState({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });

  const commit = (next) => { setList(next); onChange?.(); };
  const add = (e) => {
    e.preventDefault();
    commit(addManual({ ...form, value: Number(form.value) }));
    setForm({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Placements & prêts (saisie manuelle)</h2>
      <ul className="mt-3 divide-y">
        {list.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2">
            <span>{p.label || TYPE_LABELS[p.type]} — {Number(p.value).toLocaleString('fr-FR')} €</span>
            <button aria-label={`Supprimer ${p.label}`} onClick={() => commit(removeManual(p.id))} className="text-red-600">✕</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col text-sm">Type
          <select value={form.type} onChange={set('type')} className="rounded border p-2">
            {POSITION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">Libellé
          <input value={form.label} onChange={set('label')} className="rounded border p-2" />
        </label>
        <label className="flex flex-col text-sm">Organisme
          <input value={form.bank} onChange={set('bank')} className="rounded border p-2" />
        </label>
        <label className="flex flex-col text-sm">Valeur (€)
          <input type="number" step="0.01" value={form.value} onChange={set('value')} className="rounded border p-2" />
        </label>
        {mode === 'couple' && (
          <label className="flex flex-col text-sm">Titulaire
            <select value={form.owner} onChange={set('owner')} className="rounded border p-2">
              <option value="d1">Déclarant 1</option>
              <option value="d2">Déclarant 2</option>
              <option value="joint">Commun</option>
            </select>
          </label>
        )}
        <button type="submit" className="col-span-2 rounded bg-blue-600 px-4 py-2 text-white">Ajouter</button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/patrimoine/__tests__/ManualPositions.test.jsx`
Expected: PASS (1 test).

- [ ] **Step 5: Intégrer dans la page + commit**

Dans `src/pages/Patrimoine.jsx`, importer et monter `<ManualPositions mode={mode} onChange={refresh} />` sous la valeur nette. Récupérer `mode` depuis `AppContext` (même hook que les autres pages ; repérer via `grep -rln "useContext(AppContext)\|useApp(" src/pages`).

```bash
npx vitest run src/components/patrimoine
git add src/components/patrimoine src/pages/Patrimoine.jsx
git commit -m "feat(patrimoine): saisie manuelle des placements/prêts (formulaire + liste)"
```

---

### Task 13: Graphes (donut répartition + évolution) & liste des comptes auto

**Files:**
- Create: `src/components/patrimoine/AllocationDonut.jsx`
- Create: `src/components/patrimoine/NetWorthChart.jsx`
- Create: `src/components/patrimoine/AccountsList.jsx`
- Modify: `src/pages/Patrimoine.jsx`
- Test: `src/components/patrimoine/__tests__/AccountsList.test.jsx`

**Interfaces:**
- `AllocationDonut` — props `{ positions }` ; utilise `byType` + Recharts `PieChart`.
- `NetWorthChart` — props `{ history }` ; Recharts `AreaChart` sur `listHistory()`.
- `AccountsList` — props `{ positions }` ; groupe les postes `source==='gocardless'` par banque.

- [ ] **Step 1: Write the failing test** (AccountsList — logique de regroupement)

```jsx
// src/components/patrimoine/__tests__/AccountsList.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccountsList from '../AccountsList';

describe('AccountsList', () => {
  it('groupe les comptes auto par banque et ignore le manuel', () => {
    render(<AccountsList positions={[
      { id: 'gc-1', source: 'gocardless', bank: 'BNP', type: 'checking', label: 'CC', value: 3000 },
      { id: 'gc-2', source: 'gocardless', bank: 'BNP', type: 'savings', label: 'Livret', value: 2000 },
      { id: 'man-1', source: 'manual', bank: 'Bourso', type: 'pea', label: 'PEA', value: 42000 },
    ]} />);
    expect(screen.getByText('BNP')).toBeInTheDocument();
    expect(screen.getByText(/5[\s ]?000/)).toBeInTheDocument(); // total BNP
    expect(screen.queryByText('PEA')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/patrimoine/__tests__/AccountsList.test.jsx`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementations**

```jsx
// src/components/patrimoine/AccountsList.jsx
import { byBank } from '../../lib/patrimoine/calculator';

export default function AccountsList({ positions }) {
  const auto = positions.filter((p) => p.source === 'gocardless');
  if (auto.length === 0) return null;
  const totals = byBank(auto);
  const banks = [...new Set(auto.map((p) => p.bank))];
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Comptes (synchronisés)</h2>
      {banks.map((bank) => (
        <div key={bank} className="mt-3">
          <div className="flex justify-between font-medium">
            <span>{bank}</span>
            <span>{totals[bank].toLocaleString('fr-FR')} €</span>
          </div>
          <ul className="ml-4 text-sm text-gray-600">
            {auto.filter((p) => p.bank === bank).map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.label}</span><span>{Number(p.value).toLocaleString('fr-FR')} €</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

```jsx
// src/components/patrimoine/AllocationDonut.jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { byType } from '../../lib/patrimoine/calculator';

const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#dc2626', '#4b5563'];
const LABELS = { checking: 'Comptes', savings: 'Livrets', life_insurance: 'Assurance-vie', pea: 'PEA', securities: 'Titres', per: 'PER', loan: 'Prêts', real_estate: 'Immobilier' };

export default function AllocationDonut({ positions }) {
  const data = Object.entries(byType(positions))
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({ name: LABELS[type] || type, value }));
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

```jsx
// src/components/patrimoine/NetWorthChart.jsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function NetWorthChart({ history }) {
  if (!history || history.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={history}>
        <XAxis dataKey="date" fontSize={11} />
        <YAxis width={70} tickFormatter={(v) => `${Number(v).toLocaleString('fr-FR')}`} fontSize={11} />
        <Tooltip formatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} />
        <Area type="monotone" dataKey="netWorth" stroke="#2563eb" fill="#93c5fd" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/patrimoine/__tests__/AccountsList.test.jsx`
Expected: PASS.

- [ ] **Step 5: Intégrer dans la page + commit**

Dans `Patrimoine.jsx` : importer les 3 composants + `listHistory`. Sous la valeur nette, afficher `<AllocationDonut positions={snap.positions} />` et `<NetWorthChart history={listHistory()} />` côte à côte, puis `<AccountsList positions={snap.positions} />`. Afficher aussi une ligne « Actifs X € − Dettes Y € » via `summary`.

```bash
npx vitest run src/components/patrimoine
npm run lint
git add src/components/patrimoine src/pages/Patrimoine.jsx
git commit -m "feat(patrimoine): donut répartition, courbe d'évolution, liste des comptes"
```

---

### Task 14: Bouton « Connecter une banque » + config backend

**Files:**
- Create: `src/components/patrimoine/ConnectBankButton.jsx`
- Modify: `src/pages/Patrimoine.jsx`
- Test: `src/components/patrimoine/__tests__/ConnectBankButton.test.jsx`

**Interfaces:**
- Consumes: `getBackendConfig`/`setBackendConfig`, `gocardless.startConnect`, `gocardless.listInstitutions`.
- Produces: `<ConnectBankButton />` — si backend non configuré, affiche un mini-formulaire (URL + jeton secret) ; sinon, sélection banque + titulaire → redirige vers le lien de consentement.

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/patrimoine/__tests__/ConnectBankButton.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectBankButton from '../ConnectBankButton';

beforeEach(() => localStorage.clear());

describe('ConnectBankButton', () => {
  it('demande la config backend quand elle manque', () => {
    render(<ConnectBankButton />);
    expect(screen.getByLabelText(/URL du backend/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jeton secret/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/patrimoine/__tests__/ConnectBankButton.test.jsx`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/components/patrimoine/ConnectBankButton.jsx
import { useState } from 'react';
import { getBackendConfig, setBackendConfig, hasBackendConfig } from '../../lib/patrimoine/backendConfigStore';
import * as gocardless from '../../lib/providers/bank/gocardless';

export default function ConnectBankButton({ mode = 'solo' }) {
  const [configured, setConfigured] = useState(() => hasBackendConfig());
  const [cfg, setCfg] = useState(() => getBackendConfig());
  const [institutionId, setInstitutionId] = useState('');
  const [owner, setOwner] = useState('d1');
  const [error, setError] = useState('');

  const saveConfig = (e) => {
    e.preventDefault();
    setBackendConfig(cfg);
    setConfigured(hasBackendConfig());
  };

  const connect = async () => {
    setError('');
    try {
      const { link } = await gocardless.startConnect({ ...getBackendConfig(), institutionId, owner });
      window.location.href = link;
    } catch (e) {
      setError(e.message);
    }
  };

  if (!configured) {
    return (
      <form onSubmit={saveConfig} className="mt-4 space-y-2 rounded border p-4">
        <p className="text-sm text-gray-600">Configure ton backend patrimoine (une seule fois).</p>
        <label className="flex flex-col text-sm">URL du backend
          <input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} placeholder="https://…vercel.app" className="rounded border p-2" />
        </label>
        <label className="flex flex-col text-sm">Jeton secret
          <input value={cfg.secret} onChange={(e) => setCfg({ ...cfg, secret: e.target.value })} className="rounded border p-2" />
        </label>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">Enregistrer</button>
      </form>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-sm">Banque (identifiant GoCardless)
        <input value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} placeholder="ex. BNP_FR…" className="rounded border p-2" />
      </label>
      {mode === 'couple' && (
        <label className="flex flex-col text-sm">Titulaire
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded border p-2">
            <option value="d1">Déclarant 1</option><option value="d2">Déclarant 2</option><option value="joint">Commun</option>
          </select>
        </label>
      )}
      <button onClick={connect} disabled={!institutionId} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50">Connecter une banque</button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/patrimoine/__tests__/ConnectBankButton.test.jsx`
Expected: PASS.

- [ ] **Step 5: Intégrer dans la page + commit**

Monter `<ConnectBankButton mode={mode} />` en haut de la page. Après retour de consentement (`/patrimoine?ref=…`), `refresh()` s'exécute déjà via le `useEffect`.

```bash
npx vitest run src/components/patrimoine
git add src/components/patrimoine src/pages/Patrimoine.jsx
git commit -m "feat(patrimoine): connexion d'une banque + configuration backend depuis l'UI"
```

---

### Task 15: Guide d'installation + revue finale

**Files:**
- Create: `docs/patrimoine-setup.md`
- Modify: `CLAUDE.md` (ajouter `/patrimoine` au tableau des routes)

**Interfaces:** aucune (documentation).

- [ ] **Step 1: Rédiger le guide** `docs/patrimoine-setup.md`

Contenu (pas-à-pas, ton pédagogique) :
1. Créer un compte **GoCardless Bank Account Data** (gratuit) → obtenir `secret_id` / `secret_key`.
2. Créer une base **Upstash Redis** (gratuite) → `UPSTASH_REDIS_REST_URL` / `_TOKEN`.
3. Générer `TOKEN_ENCRYPTION_KEY` : `openssl rand -hex 32`.
4. Générer `KAPIO_BACKEND_SECRET` : `openssl rand -hex 24`.
5. Déployer sur **Vercel** (`vercel`), renseigner les variables d'env (cf. `.env.example`), noter l'URL.
6. Dans Kapio → `/patrimoine` → saisir URL backend + jeton secret, puis « Connecter une banque ».
7. Rappel : re-consentement bancaire tous les ~90 jours ; PEA/AV en saisie manuelle.

- [ ] **Step 2: Mettre à jour le tableau des routes dans `CLAUDE.md`**

Ajouter la ligne :
```
| `/patrimoine` | Patrimoine (comptes auto + saisie manuelle) | needs profile |
```

- [ ] **Step 3: Lancer toute la suite de tests + lint**

Run: `npm test && npm run lint`
Expected: tous les tests passent, aucun avertissement lint.

- [ ] **Step 4: Vérification manuelle bout-en-bout (sans backend réel)**

Run: `npm run dev` → `/patrimoine` : ajouter un PEA manuel (42 000 €), vérifier valeur nette, donut, persistance après rechargement, suppression.

- [ ] **Step 5: Commit**

```bash
git add docs/patrimoine-setup.md CLAUDE.md
git commit -m "docs(patrimoine): guide d'installation backend + route dans CLAUDE.md"
```

---

## Notes de revue (self-review)

- **Couverture spec** : GoCardless auto (Tasks 8-10, 14), saisie manuelle (Tasks 3, 12), calculs/valeur nette (Task 2), mode couple/owner (Tasks 1, 12, 14 + `byOwner` Task 2), historique local (Tasks 4, 13), snapshot normalisé sans transactions (Tasks 1, 8), adaptateur multi-sources + porte woob (Tasks 6-7), sécurité (secret/crypto/auth Tasks 5, 8, 10), tests par couche (chaque task), variables d'env (Task 10), dashboard (Tasks 11-14). ✅
- **Cohérence des types** : `Position` (Task 1) réutilisé partout ; `getPositions`/`startConnect`/`getConsolidatedSnapshot`/`normalizeAccounts`/`summary` cités avec signatures stables entre tasks.
- **Points à confirmer pendant l'exécution** (déjà signalés dans la spec) : endpoints/quotas exacts GoCardless, couverture réelle des livrets, runtime Vercel (`nodejs22.x` — ajuster si besoin).
