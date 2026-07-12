# Refonte visuelle de la page Patrimoine — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner la page `/patrimoine` et ses 5 composants enfants sur le design system Kapio (dark ink/kapio, GlowCard, AnimatedNumber, framer-motion) sans toucher à la logique métier.

**Architecture:** Restyle en place (approche A de la spec) : chaque fichier garde sa logique (stores, providers, calculs) et seul le JSX de présentation change. Les briques réutilisées existent déjà (`GlowCard`, `AnimatedNumber`, `AuroraBackground`, `Grain`, classes `card-dark`/`btn-kapio`/`btn-ghost-dark`). Une seule classe CSS est ajoutée (`.input-dark`).

**Tech Stack:** React 18 + Vite, Tailwind (config custom `ink`/`kapio`), framer-motion, recharts, lucide-react, Vitest + Testing Library.

## Global Constraints

- Montants : `toLocaleString('fr-FR')` uniquement — jamais `.toFixed()` ni séparateurs codés en dur (CLAUDE.md).
- Libellés de champs inchangés : « URL du backend », « Jeton secret », « Libellé », « Valeur (€) », « Type », « Organisme », « Titulaire », « Banque », bouton « Ajouter » — les tests les ciblent par texte.
- Logique métier intacte : `refresh()`, `backendConfigStore`, `manualStore`, `history`, providers GoCardless, `calculator.js`.
- Mode couple (sélecteur Titulaire) et accessibilité (`role="alert"`, labels associés, `aria-label` suppression) conservés.
- Spec de référence : `docs/superpowers/specs/2026-07-13-patrimoine-redesign-design.md`.
- Easing maison : `[0.16, 1, 0.3, 1]` (constante `EASE` locale par fichier si besoin).
- Après chaque tâche : `npx vitest run` vert + `npx eslint <fichiers touchés>` propre avant commit.

---

### Task 1: Fondations — page pleine largeur + classe `.input-dark`

**Files:**
- Modify: `src/components/Layout.jsx:11` (constante `FULL_WIDTH_PAGES`)
- Modify: `src/index.css` (fin du bloc `@layer components`)

**Interfaces:**
- Produces: classe CSS `.input-dark` utilisée par les Tasks 4 et 5 ; `/patrimoine` rendu en `w-full` par le Layout (la page fournit son propre conteneur en Task 6).

- [ ] **Step 1: Ajouter `/patrimoine` aux pages pleine largeur**

Dans `src/components/Layout.jsx`, ligne 11 :

```js
// Avant
const FULL_WIDTH_PAGES = ['/', '/dashboard', '/profile', '/setup', '/rapport', '/opportunites', '/checklist', '/simulator', '/declaration'];
// Après
const FULL_WIDTH_PAGES = ['/', '/dashboard', '/patrimoine', '/profile', '/setup', '/rapport', '/opportunites', '/checklist', '/simulator', '/declaration'];
```

- [ ] **Step 2: Ajouter `.input-dark` dans `src/index.css`**

À la fin du bloc `@layer components` (après `.btn-ghost-dark` et ses variantes) :

```css
  /* Inputs sombres — formulaires Patrimoine */
  .input-dark {
    @apply w-full rounded-lg border border-white/[0.08] bg-ink-850 px-3 py-2 text-sm text-ink-0 placeholder:text-ink-300 outline-none transition-colors duration-200;
  }
  .input-dark:focus {
    @apply border-kapio-500/50 ring-1 ring-kapio-500/30;
  }
```

- [ ] **Step 3: Vérifier**

Run: `npx vitest run` → tous verts. `npx eslint src/components/Layout.jsx` → propre.

- [ ] **Step 4: Commit**

```bash
git add src/components/Layout.jsx src/index.css
git commit -m "feat(patrimoine): page pleine largeur + classe input-dark"
```

---

### Task 2: Restyle des graphiques (AllocationDonut + NetWorthChart)

**Files:**
- Modify: `src/components/patrimoine/AllocationDonut.jsx` (remplacement complet)
- Modify: `src/components/patrimoine/NetWorthChart.jsx` (remplacement complet)

**Interfaces:**
- Consumes: `byType(positions)` de `../../lib/patrimoine/calculator` (inchangé).
- Produces: `<AllocationDonut positions={[]} />` et `<NetWorthChart history={[]} />` — mêmes props qu'avant, mais chaque composant rend désormais sa propre `GlowCard` avec titre (la page ne les enveloppe plus). Retournent toujours `null` sans données.

- [ ] **Step 1: Réécrire `AllocationDonut.jsx`**

```jsx
// src/components/patrimoine/AllocationDonut.jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { byType } from '../../lib/patrimoine/calculator';
import GlowCard from '../motion/GlowCard';

const COLORS = ['#5ECFAE', '#2EB88A', '#1D9E75', '#F59E0B', '#34D399', '#FBBF24', '#F87171', '#71717A'];
const LABELS = { checking: 'Comptes', savings: 'Livrets', life_insurance: 'Assurance-vie', pea: 'PEA', securities: 'Titres', per: 'PER', loan: 'Prêts', real_estate: 'Immobilier' };

function DarkTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-white/[0.1] bg-ink-800 px-3 py-2 shadow-2xl">
      <p className="text-xs font-semibold text-ink-0">{d.name}</p>
      <p className="text-sm font-mono text-kapio-300 mt-0.5">{Number(d.value).toLocaleString('fr-FR')} €</p>
    </div>
  );
}

export default function AllocationDonut({ positions }) {
  const data = Object.entries(byType(positions))
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({ name: LABELS[type] || type, value }));
  if (data.length === 0) return null;
  return (
    <GlowCard className="p-6">
      <h3 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
        <PieIcon size={14} className="text-kapio-300" />
        Allocation
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<DarkTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs text-ink-100">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </GlowCard>
  );
}
```

- [ ] **Step 2: Réécrire `NetWorthChart.jsx`**

```jsx
// src/components/patrimoine/NetWorthChart.jsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import GlowCard from '../motion/GlowCard';

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/[0.1] bg-ink-800 px-3 py-2 shadow-2xl">
      <p className="text-xs font-semibold text-ink-0">{label}</p>
      <p className="text-sm font-mono text-kapio-300 mt-0.5">{Number(payload[0].value).toLocaleString('fr-FR')} €</p>
    </div>
  );
}

export default function NetWorthChart({ history }) {
  if (!history || history.length < 2) return null;
  return (
    <GlowCard className="p-6">
      <h3 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
        <TrendingUp size={14} className="text-kapio-300" />
        Évolution du patrimoine
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={history}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2EB88A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2EB88A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis width={70} tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false}
                 tickFormatter={(v) => Number(v).toLocaleString('fr-FR')} />
          <Tooltip content={<DarkTooltip />} />
          <Area type="monotone" dataKey="netWorth" stroke="#2EB88A" strokeWidth={2} fill="url(#netWorthFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </GlowCard>
  );
}
```

- [ ] **Step 3: Vérifier**

Run: `npx vitest run` → verts. `npx eslint src/components/patrimoine/AllocationDonut.jsx src/components/patrimoine/NetWorthChart.jsx` → propre.

- [ ] **Step 4: Commit**

```bash
git add src/components/patrimoine/AllocationDonut.jsx src/components/patrimoine/NetWorthChart.jsx
git commit -m "feat(patrimoine): graphiques aux couleurs kapio dans des GlowCards"
```

---

### Task 3: Restyle de la liste des comptes synchronisés

**Files:**
- Modify: `src/components/patrimoine/AccountsList.jsx` (remplacement complet)
- Test existant: `src/components/patrimoine/__tests__/AccountsList.test.jsx` (aucun changement — il cible `BNP` et `5 000` par texte)

**Interfaces:**
- Consumes: `byBank(positions)` de `../../lib/patrimoine/calculator` (inchangé).
- Produces: `<AccountsList positions={[]} />` — même prop, rend sa propre carte `card-dark`, retourne `null` sans compte synchronisé.

- [ ] **Step 1: Réécrire `AccountsList.jsx`**

```jsx
// src/components/patrimoine/AccountsList.jsx
import { Landmark } from 'lucide-react';
import { byBank } from '../../lib/patrimoine/calculator';

export default function AccountsList({ positions }) {
  const auto = positions.filter((p) => p.source === 'gocardless');
  if (auto.length === 0) return null;
  const totals = byBank(auto);
  const banks = [...new Set(auto.map((p) => p.bank || '—'))];
  return (
    <section className="card-dark card-static p-6 mt-6">
      <h2 className="text-sm font-bold text-ink-0 mb-4 flex items-center gap-2">
        <Landmark size={14} className="text-kapio-300" />
        Comptes (synchronisés)
      </h2>
      {banks.map((bank) => (
        <div key={bank} className="mt-4 first:mt-0">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <span className="text-sm font-semibold text-ink-0">{bank}</span>
            <span className="text-sm font-semibold text-kapio-300">{totals[bank].toLocaleString('fr-FR')} €</span>
          </div>
          <ul>
            {auto.filter((p) => (p.bank || '—') === bank).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                <span className="text-sm text-ink-100">{p.label}</span>
                <span className="text-sm font-semibold text-ink-0">{Number(p.value).toLocaleString('fr-FR')} €</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Vérifier que le test existant passe**

Run: `npx vitest run src/components/patrimoine/__tests__/AccountsList.test.jsx`
Expected: PASS (les textes `BNP` et le total `5 000` sont toujours rendus).

- [ ] **Step 3: Commit**

```bash
git add src/components/patrimoine/AccountsList.jsx
git commit -m "feat(patrimoine): comptes synchronisés en card-dark"
```

---

### Task 4: ManualPositions — formulaire replié + restyle (TDD)

**Files:**
- Modify: `src/components/patrimoine/__tests__/ManualPositions.test.jsx`
- Modify: `src/components/patrimoine/ManualPositions.jsx` (remplacement complet)

**Interfaces:**
- Consumes: classe `.input-dark` (Task 1) ; `listManual`/`addManual`/`removeManual` de `manualStore` (inchangés).
- Produces: `<ManualPositions mode onChange />` — mêmes props. Nouveau comportement : formulaire replié par défaut, ouvert par le bouton « Ajouter un placement » (`aria-expanded`).

- [ ] **Step 1: Mettre à jour le test (échec attendu d'abord)**

Remplacer le corps du `describe` dans `ManualPositions.test.jsx` :

```jsx
describe('ManualPositions', () => {
  it('replie le formulaire par défaut et l’ouvre via « Ajouter un placement »', () => {
    render(<ManualPositions mode="solo" />);
    expect(screen.queryByLabelText(/libellé/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ajouter un placement/i }));
    expect(screen.getByLabelText(/libellé/i)).toBeInTheDocument();
  });

  it('ajoute un poste manuel via le formulaire', () => {
    const onChange = vi.fn();
    render(<ManualPositions mode="solo" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /ajouter un placement/i }));
    fireEvent.change(screen.getByLabelText(/libellé/i), { target: { value: 'Mon PEA' } });
    fireEvent.change(screen.getByLabelText(/valeur/i), { target: { value: '42000' } });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }));
    expect(JSON.parse(localStorage.getItem(MANUAL_KEY))).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText('Mon PEA')).toBeInTheDocument();
  });
});
```

Note : le bouton de soumission est ciblé par `/^ajouter$/i` (exact) pour ne pas matcher le bouton de dépliage « Ajouter un placement ».

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/components/patrimoine/__tests__/ManualPositions.test.jsx`
Expected: FAIL — « Unable to find role button with name /ajouter un placement/i ».

- [ ] **Step 3: Réécrire `ManualPositions.jsx`**

```jsx
// src/components/patrimoine/ManualPositions.jsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, PiggyBank } from 'lucide-react';
import { listManual, addManual, removeManual } from '../../lib/patrimoine/manualStore';
import { POSITION_TYPES } from '../../lib/patrimoine/model';

const EASE = [0.16, 1, 0.3, 1];

const TYPE_LABELS = {
  checking: 'Compte courant', savings: 'Livret', life_insurance: 'Assurance-vie',
  pea: 'PEA', securities: 'Compte-titres', per: 'PER', loan: 'Prêt', real_estate: 'Immobilier',
};

export default function ManualPositions({ mode = 'solo', onChange }) {
  const [list, setList] = useState(() => listManual());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });

  const commit = (next) => { setList(next); onChange?.(); };
  const add = (e) => {
    e.preventDefault();
    commit(addManual({ ...form, value: Number(form.value) }));
    setForm({ type: 'pea', label: '', bank: '', value: '', owner: 'd1' });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="card-dark card-static p-6 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-ink-0 flex items-center gap-2">
          <PiggyBank size={14} className="text-kapio-300" />
          Placements &amp; prêts (saisie manuelle)
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="btn-ghost-dark !text-xs !px-3 !py-1.5"
        >
          <Plus size={13} className={'transition-transform duration-300 ' + (open ? 'rotate-45' : '')} aria-hidden="true" />
          Ajouter un placement
        </button>
      </div>

      {list.length > 0 && (
        <ul className="mt-4">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
              <span className="text-sm text-ink-100">
                <span className="text-ink-0 font-medium">{p.label || TYPE_LABELS[p.type]}</span>
                {' — '}{Number(p.value).toLocaleString('fr-FR')} €
              </span>
              <button
                type="button"
                aria-label={`Supprimer ${p.label}`}
                onClick={() => commit(removeManual(p.id))}
                className="text-ink-300 hover:text-danger-400 transition-colors p-1"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <form onSubmit={add} className="mt-5 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Type
                <select value={form.type} onChange={set('type')} className="input-dark">
                  {POSITION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Libellé
                <input value={form.label} onChange={set('label')} className="input-dark" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Organisme
                <input value={form.bank} onChange={set('bank')} className="input-dark" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Valeur (€)
                <input type="number" step="0.01" value={form.value} onChange={set('value')} className="input-dark" />
                {form.type === 'loan' && (
                  <span className="mt-1 text-xs font-normal text-ink-200">
                    Saisis le capital restant dû ; il sera compté comme une dette.
                  </span>
                )}
              </label>
              {mode === 'couple' && (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Titulaire
                  <select value={form.owner} onChange={set('owner')} className="input-dark">
                    <option value="d1">Déclarant 1</option>
                    <option value="d2">Déclarant 2</option>
                    <option value="joint">Commun</option>
                  </select>
                </label>
              )}
              <button type="submit" className="btn-kapio col-span-2 !text-sm">Ajouter</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/components/patrimoine/__tests__/ManualPositions.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/patrimoine/ManualPositions.jsx src/components/patrimoine/__tests__/ManualPositions.test.jsx
git commit -m "feat(patrimoine): saisie manuelle restylée, formulaire replié par défaut"
```

---

### Task 5: ConnectBankButton — restyle + sélecteur replié

**Files:**
- Modify: `src/components/patrimoine/ConnectBankButton.jsx` (remplacement complet)
- Test existant: `src/components/patrimoine/__tests__/ConnectBankButton.test.jsx` (inchangé — il teste l'état non configuré, dont le formulaire reste affiché directement)

**Interfaces:**
- Consumes: classe `.input-dark` (Task 1) ; `backendConfigStore` et `gocardless` (inchangés).
- Produces: `<ConnectBankButton mode />` — même prop. État non configuré : formulaire de config visible directement (spec §4). État configuré : sélecteur replié derrière « Connecter une banque ».

- [ ] **Step 1: Réécrire `ConnectBankButton.jsx`**

```jsx
// src/components/patrimoine/ConnectBankButton.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Landmark, Plus } from 'lucide-react';
import { getBackendConfig, setBackendConfig, hasBackendConfig } from '../../lib/patrimoine/backendConfigStore';
import * as gocardless from '../../lib/providers/bank/gocardless';

const EASE = [0.16, 1, 0.3, 1];

export default function ConnectBankButton({ mode = 'solo' }) {
  const [configured, setConfigured] = useState(() => hasBackendConfig());
  const [cfg, setCfg] = useState(() => getBackendConfig());
  const [open, setOpen] = useState(false);
  const [institutionId, setInstitutionId] = useState('');
  const [owner, setOwner] = useState('d1');
  const [error, setError] = useState('');
  const [institutions, setInstitutions] = useState([]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    gocardless.listInstitutions(getBackendConfig())
      .then((list) => { if (!cancelled) setInstitutions(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setInstitutions([]); });
    return () => { cancelled = true; };
  }, [configured]);

  const saveConfig = (e) => {
    e.preventDefault();
    setBackendConfig(cfg);
    setConfigured(hasBackendConfig());
  };

  const connect = async () => {
    setError('');
    try {
      const institutionName = institutions.find((i) => i.id === institutionId)?.name;
      const { link } = await gocardless.startConnect({ ...getBackendConfig(), institutionId, institutionName, owner });
      window.location.href = link;
    } catch (e) {
      setError(e.message);
    }
  };

  if (!configured) {
    return (
      <section className="card-dark card-static p-6 mt-6">
        <h2 className="text-sm font-bold text-ink-0 mb-1 flex items-center gap-2">
          <Landmark size={14} className="text-kapio-300" />
          Synchronisation bancaire
        </h2>
        <p className="text-xs text-ink-200 mb-4">Configure ton backend patrimoine (une seule fois).</p>
        <form onSubmit={saveConfig} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">URL du backend
            <input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
                   placeholder="https://…vercel.app" className="input-dark" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Jeton secret
            <input value={cfg.secret} onChange={(e) => setCfg({ ...cfg, secret: e.target.value })} className="input-dark" />
          </label>
          <button type="submit" className="btn-kapio sm:col-span-2 !text-sm">Enregistrer</button>
        </form>
      </section>
    );
  }

  return (
    <section className="card-dark card-static p-6 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-ink-0 flex items-center gap-2">
          <Landmark size={14} className="text-kapio-300" />
          Synchronisation bancaire
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="btn-ghost-dark !text-xs !px-3 !py-1.5"
        >
          <Plus size={13} className={'transition-transform duration-300 ' + (open ? 'rotate-45' : '')} aria-hidden="true" />
          Connecter une banque
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100 min-w-56 flex-1">Banque
                {institutions.length > 0 ? (
                  <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} className="input-dark">
                    <option value="">— Choisir une banque —</option>
                    {institutions.map((inst) => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                ) : (
                  <input value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}
                         placeholder="ex. BNP_FR…" className="input-dark" />
                )}
              </label>
              {mode === 'couple' && (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-100">Titulaire
                  <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input-dark">
                    <option value="d1">Déclarant 1</option>
                    <option value="d2">Déclarant 2</option>
                    <option value="joint">Commun</option>
                  </select>
                </label>
              )}
              <button onClick={connect} disabled={!institutionId} className="btn-kapio !text-sm disabled:opacity-50">
                Connecter
              </button>
              {error && <p className="w-full text-sm text-danger-400">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
```

- [ ] **Step 2: Vérifier que le test existant passe**

Run: `npx vitest run src/components/patrimoine/__tests__/ConnectBankButton.test.jsx`
Expected: PASS (l'état non configuré affiche toujours « URL du backend » et « Jeton secret »).

- [ ] **Step 3: Commit**

```bash
git add src/components/patrimoine/ConnectBankButton.jsx
git commit -m "feat(patrimoine): synchronisation bancaire restylée, sélecteur replié"
```

---

### Task 6: Refonte de la page `Patrimoine.jsx`

**Files:**
- Modify: `src/pages/Patrimoine.jsx` (remplacement complet)

**Interfaces:**
- Consumes: composants des Tasks 2-5 (mêmes props qu'avant) ; `GlowCard`, `AnimatedNumber`, `AuroraBackground`, `Grain` de `src/components/motion/` ; logique existante (`refresh`, `summary`, `listHistory`) inchangée.

- [ ] **Step 1: Réécrire `src/pages/Patrimoine.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { getBackendConfig } from '../lib/patrimoine/backendConfigStore';
import { getConsolidatedSnapshot } from '../lib/providers/bank';
import { summary } from '../lib/patrimoine/calculator';
import { appendSnapshot, listHistory } from '../lib/patrimoine/history';
import { useApp } from '../context/AppContext';
import ManualPositions from '../components/patrimoine/ManualPositions';
import AllocationDonut from '../components/patrimoine/AllocationDonut';
import NetWorthChart from '../components/patrimoine/NetWorthChart';
import AccountsList from '../components/patrimoine/AccountsList';
import ConnectBankButton from '../components/patrimoine/ConnectBankButton';
import GlowCard from '../components/motion/GlowCard';
import AnimatedNumber from '../components/motion/AnimatedNumber';
import AuroraBackground from '../components/motion/AuroraBackground';
import Grain from '../components/motion/Grain';

const EASE = [0.16, 1, 0.3, 1];

function StatCard({ Icon, label, value, accent }) {
  const accentColor = accent === 'success' ? 'text-success-400' : accent === 'danger' ? 'text-danger-400' : 'text-ink-0';
  return (
    <div className="card-dark p-6">
      <div className="w-10 h-10 rounded-xl bg-kapio-500/10 border border-kapio-500/20 flex items-center justify-center mb-4">
        <Icon size={18} className="text-kapio-300" />
      </div>
      <p className="text-xs uppercase tracking-widest text-ink-100 mb-2 font-semibold">{label}</p>
      <p className={'text-2xl font-bold tracking-tight ' + accentColor}>
        {value === 0 ? <span className="text-ink-300">—</span> : <AnimatedNumber value={value} suffix=" €" />}
      </p>
    </div>
  );
}

export default function Patrimoine() {
  const { state } = useApp();
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

  // Chargement initial au montage (pattern data-fetching documenté react.dev :
  // https://react.dev/learn/synchronizing-with-effects#fetching-data — le setLoading(true)
  // synchrone en tête de `refresh` est un faux positif connu de cette règle stricte).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  const s = summary(snap.positions);

  return (
    <div className="relative bg-ink-900 text-ink-0 overflow-hidden min-h-screen">
      <AuroraBackground showGrid intensity={0.6} />
      <Grain opacity={0.025} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10">

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        >
          <div>
            <span className="text-xs font-semibold text-kapio-300 uppercase tracking-widest mb-2 inline-block">
              Vue d&apos;ensemble
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-ink-0">Patrimoine</h1>
            <p className="text-sm text-ink-100 mt-1">Comptes synchronisés et placements saisis à la main.</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="btn-ghost-dark !text-sm shrink-0 disabled:opacity-50"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {loading ? 'Actualisation…' : 'Actualiser'}
          </button>
        </motion.div>

        {/* ERREURS DE SYNC */}
        {snap.errors?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            role="alert"
            className="mb-6 rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm text-warning-400"
          >
            <p className="font-semibold flex items-center gap-2">
              <AlertTriangle size={14} aria-hidden="true" />
              Synchronisation bancaire indisponible — reconnecte tes banques.
            </p>
            <ul className="mt-2 list-disc pl-6 text-warning-400/80">
              {snap.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* HERO — patrimoine net + actifs / dettes */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.08 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <GlowCard className="p-6 sm:row-span-1">
            <div className="w-10 h-10 rounded-xl bg-kapio-500/10 border border-kapio-500/20 flex items-center justify-center mb-4">
              <Wallet size={18} className="text-kapio-300" />
            </div>
            <p className="text-xs uppercase tracking-widest text-ink-100 mb-2 font-semibold">Patrimoine net</p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight text-kapio-300">
              <AnimatedNumber value={s.netWorth} suffix=" €" />
            </p>
          </GlowCard>
          <StatCard Icon={TrendingUp} label="Actifs" value={s.assets} accent="success" />
          <StatCard Icon={TrendingDown} label="Dettes" value={s.debts} accent="danger" />
        </motion.div>

        {/* EMPTY STATE */}
        {snap.positions.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE, delay: 0.16 }}
            className="card-dark card-static p-8 mt-6 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-kapio-500/10 border border-kapio-500/30 flex items-center justify-center mx-auto mb-4">
              <Wallet size={22} className="text-kapio-300" />
            </div>
            <p className="text-sm text-ink-100">Aucun compte. Connecte une banque ou ajoute un placement.</p>
          </motion.div>
        )}

        {/* GRAPHIQUES */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.16 }}
          className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <AllocationDonut positions={snap.positions} />
          <NetWorthChart history={listHistory()} />
        </motion.div>

        {/* COMPTES + SAISIE */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.24 }}
        >
          <AccountsList positions={snap.positions} />
          <ConnectBankButton mode={state.mode} />
          <ManualPositions mode={state.mode} onChange={refresh} />
        </motion.div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier**

Run: `npx vitest run` → tous verts. `npx eslint src/pages/Patrimoine.jsx` → propre.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Patrimoine.jsx
git commit -m "feat(patrimoine): refonte de la page — hero animé, aurora, sections motion"
```

---

### Task 7: Vérification visuelle et finale

**Files:**
- Aucun changement de code attendu (corrections mineures seulement si la vérification révèle un problème).

- [ ] **Step 1: Suite complète + lint global**

Run: `npx vitest run` → tous verts. `npm run lint` → propre (ou uniquement des warnings préexistants).

- [ ] **Step 2: Vérification visuelle Playwright (mode démo)**

Lancer `npm run dev`, puis un script Playwright (scratchpad) qui :
1. Ouvre `http://localhost:5173/`, clique le bouton « démo », navigue vers `/patrimoine`.
2. Capture la page à 390 px (mobile), 1280 px et 1440 px.
3. Vérifie `document.documentElement.scrollWidth <= window.innerWidth + 1` (pas de scroll horizontal).
4. Déplie les deux formulaires (« Connecter une banque », « Ajouter un placement ») et capture.

Expected: aucune couleur hors charte visible (pas de bleu `#2563eb`, pas de fonds clairs), formulaires lisibles, animations d'entrée visibles, pas de débordement.

- [ ] **Step 3: Inspection humaine**

Présenter les captures à l'utilisateur pour validation avant push.

- [ ] **Step 4: Push (après accord utilisateur)**

```bash
git push origin main
```
