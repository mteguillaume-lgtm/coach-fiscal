# Accessibilité + hygiène React (audit E6) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formulaire Collect utilisable au lecteur d'écran et au clavier, animations respectant `prefers-reduced-motion`, 25 warnings React Compiler résorbés (dont restructuration des 3 composants render-scoped de Rapport), lint à 0 problème — le tout protégé par les premiers tests de composants du projet.

**Architecture:** Spec validée `docs/superpowers/specs/2026-07-08-accessibilite-e6-design.md`. Infra jsdom/@testing-library en pragma par fichier ; FieldRow extrait vers `src/components/FieldRow.jsx` ; smoke test Rapport écrit AVANT les hoists.

**Tech Stack:** Vitest + jsdom + @testing-library/react (nouveaux devDeps), framer-motion `MotionConfig`/`useReducedMotion`.

## Global Constraints

- Les 748 tests node existants restent en environnement `node` (pragma jsdom par fichier UI uniquement) et verts à chaque commit.
- Aucun changement visuel ni de comportement du formulaire (les ajouts a11y sont des attributs) ; les fixes `exhaustive-deps` doivent préserver « même valeur ⇒ même référence ».
- Chaque tâche : vérification `npx vitest run` + `npx eslint <fichiers touchés>` avant commit. Branche `accessibilite-e6`. Commits `feat(e6)/fix(e6)`.
- En cas de doute sur un fix d'effet (comportement ambigu) : STOP et demander, ne pas forcer.

---

### Task 1: Infra tests composants

**Files:**
- Modify: `package.json` (devDeps via npm)
- Test: `src/components/__tests__/smoke-jsdom.test.jsx` (create — sanity check de l'infra)

- [ ] **Step 0:** `git checkout -b accessibilite-e6`
- [ ] **Step 1:** `npm i -D @testing-library/react @testing-library/jest-dom jsdom` (vérifier exit 0 et lockfile mis à jour).
- [ ] **Step 2:** Créer `src/components/__tests__/smoke-jsdom.test.jsx` :

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

describe('Infra tests composants (jsdom par fichier)', () => {
  it('rend un élément et le retrouve par son rôle', () => {
    render(<button type="button">Bonjour</button>);
    expect(screen.getByRole('button', { name: 'Bonjour' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3:** Ajuster `vite.config.js` → `test.include` doit couvrir `.jsx` : remplacer `include: ['src/**/*.test.{js,ts}']` par `include: ['src/**/*.test.{js,jsx,ts}']`.
- [ ] **Step 4:** `npx vitest run` → 749 tests (748 + smoke) verts, les tests node inchangés.
- [ ] **Step 5:** Commit `chore(e6): infra tests composants (jsdom + testing-library, pragma par fichier)` (inclure package.json + package-lock.json).

---

### Task 2: FieldRow extrait + accessible (TDD)

**Files:**
- Create: `src/components/FieldRow.jsx` (extraction depuis Collect.jsx lignes ~592-726 : `_fieldVisible`, helpers `isMoneyField`/`isYesNo` s'ils ne servent qu'à FieldRow — vérifier par grep, sinon les importer/exporter)
- Modify: `src/pages/Collect.jsx` (suppression du bloc extrait + import)
- Test: `src/components/__tests__/field-row.test.jsx` (create)

**Interfaces:**
- Produces: `export default function FieldRow({ f, value, onChange, autoFKeys, formData })` — mêmes props qu'aujourd'hui. IDs : `field-${f.key}`, hint `field-${f.key}-hint`, label `field-${f.key}-label`.

- [ ] **Step 1: Tests qui échouent** — `src/components/__tests__/field-row.test.jsx` :

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldRow from '../FieldRow';

const noop = () => {};

describe('FieldRow — accessibilité (audit E6)', () => {
  it('champ texte : label associé + hint lié par aria-describedby', () => {
    render(<FieldRow
      f={{ key: 'employeur_nom', label: 'Nom de l\'employeur', type: 'text', hint: 'Tel qu\'il figure sur le bulletin' }}
      value="" onChange={noop} formData={{}}
    />);
    const input = screen.getByLabelText('Nom de l\'employeur');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('Tel qu\'il figure sur le bulletin');
  });

  it('champ montant : label associé, saisie numérique', () => {
    render(<FieldRow
      f={{ key: 'net_imp', label: 'Salaire net imposable', type: 'number' }}
      value="45000" onChange={noop} formData={{}}
    />);
    expect(screen.getByLabelText('Salaire net imposable')).toBeInTheDocument();
  });

  it('select : label associé', () => {
    render(<FieldRow
      f={{ key: 'regime', label: 'Régime foncier', type: 'select', opts: ['micro', 'réel'] }}
      value="" onChange={noop} formData={{}}
    />);
    expect(screen.getByLabelText('Régime foncier')).toBeInTheDocument();
  });

  it('Oui/Non : groupe nommé + aria-pressed reflète la sélection', () => {
    const onChange = vi.fn();
    render(<FieldRow
      f={{ key: 'pv_mob_option_bareme', label: 'Option barème global 2OP (dividendes + intérêts + PV) ?', type: 'select', opts: ['Non', 'Oui'], yesno: true }}
      value="Oui" onChange={onChange} formData={{}}
    />);
    const group = screen.getByRole('group', { name: /Option barème global 2OP/ });
    expect(group).toBeInTheDocument();
    const oui = screen.getByRole('button', { name: 'Oui' });
    expect(oui).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Non' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(oui);
    expect(onChange).toHaveBeenCalled();
  });
});
```

⚠️ Avant d'écrire le test Oui/Non, vérifier comment `isYesNo(f)` détecte un champ Oui/Non
(`grep -n "isYesNo" src/pages/Collect.jsx`) et adapter la prop `f` du test au vrai critère.

- [ ] **Step 2:** `npx vitest run src/components/__tests__/field-row.test.jsx` → FAIL (module inexistant).
- [ ] **Step 3: Extraction** — repérer les frontières exactes (`grep -n "_fieldVisible\|isMoneyField\|isYesNo\|^function FieldRow" src/pages/Collect.jsx`), déplacer FieldRow + helpers exclusifs vers `src/components/FieldRow.jsx` (imports : `Sparkles` de lucide-react + tout ce que les helpers référencent), export default. Dans Collect.jsx : supprimer le bloc, ajouter `import FieldRow from '../components/FieldRow';`.
- [ ] **Step 4: A11y** — dans le nouveau fichier :

```jsx
  const inputId = `field-${f.key}`;
  const hintId  = f.hint ? `${inputId}-hint` : undefined;
  const labelId = `${inputId}-label`;
```

  - `<label htmlFor={inputId} id={labelId} …>` (le label existant garde son contenu) ;
  - `select` / `input` texte / `input` montant : `id={inputId}` + `aria-describedby={hintId}` ;
  - hint : `<p id={hintId} …>` ;
  - bloc Oui/Non : `<div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={labelId}>` et chaque bouton `aria-pressed={active}` ;
  - `computedInfo` : ajouter `aria-live="polite"` sur le `<p>`.
- [ ] **Step 5:** `npx vitest run` complet → tout vert ; `npx eslint src/components/FieldRow.jsx src/pages/Collect.jsx` → 0 erreur. Vérif manuelle rapide : `npm run dev` → /collect s'affiche à l'identique.
- [ ] **Step 6:** Commit `feat(e6): FieldRow extrait et accessible (labels associés, hints, groupe Oui/Non)`.

---

### Task 3: Accordéons AccSection

**Files:**
- Modify: `src/pages/Collect.jsx` (AccSection, ~lignes 728-833)

- [ ] **Step 1:** Repérer le corps repliable (`sed -n 775,835p src/pages/Collect.jsx` — bloc rendu quand `open`). Éditer :
  - bouton d'en-tête : ajouter `aria-expanded={open} aria-controls={\`acc-body-${section.id}\`}` ;
  - conteneur du corps : `id={\`acc-body-${section.id}\`} role="region" aria-label={section.label}`.
- [ ] **Step 2:** `npx vitest run` + `npx eslint src/pages/Collect.jsx` → verts. Commit `feat(e6): accordéons Collect avec aria-expanded/aria-controls`.

---

### Task 4: Mouvement respectueux (reduced motion)

**Files:**
- Modify: `src/App.jsx` (MotionConfig racine)
- Modify: `src/components/motion/SpotlightCursor.jsx`

- [ ] **Step 1: MotionConfig** — dans App.jsx : `import { MotionConfig } from 'framer-motion';` et envelopper le contenu sous `<AppProvider>` :

```jsx
      <AppProvider>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            …
          </BrowserRouter>
        </MotionConfig>
      </AppProvider>
```

- [ ] **Step 2: SpotlightCursor** — `import { useReducedMotion } from 'framer-motion';` puis, APRÈS tous les hooks existants (règle des hooks) :

```jsx
  const reduced = useReducedMotion();
  if (reduced) return null;   // décoratif pur — invisible en reduced motion
```

  ⚠️ `useReducedMotion` est un hook : le déclarer avec les autres hooks en tête, le `return null` après.
- [ ] **Step 3:** Grain : vérifier qu'aucune animation n'existe (texture statique) — si confirmé, ne rien changer (documenter dans le commit).
- [ ] **Step 4:** Vérif manuelle : macOS → Réglages > Accessibilité > Animation réduite, puis `npm run dev` : plus de halo animé ni de spotlight. `npx vitest run` vert. Commit `feat(e6): MotionConfig reducedMotion=user + SpotlightCursor désactivé en animation réduite`.

---

### Task 5: Warnings faciles (2 set-state-in-effect + 8 exhaustive-deps)

**Files:**
- Modify: `src/components/motion/AuroraBackground.jsx:11-14`, `src/pages/Home.jsx:205-210`, `src/pages/Collect.jsx:1383`, `src/pages/Dashboard.jsx:744`, `src/pages/Rapport.jsx:2991`, `src/pages/Simulator.jsx:394`, `src/pages/Profile.jsx:155`

- [ ] **Step 1: set-state-in-effect → init paresseuse** —

AuroraBackground : remplacer

```jsx
  // Évalué après le mount pour éviter les faux positifs avec React 19 StrictMode + Babel
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia('(hover: none)').matches);
  }, []);
```

par

```jsx
  // Init paresseuse (SPA : window disponible au premier rendu) — pas de setState en effet.
  const [isTouch] = useState(() => window.matchMedia('(hover: none)').matches);
```

Home : même motif avec `const [sessionActive] = useState(() => hasActiveSession());` (supprimer l'effet). Vérifier que ni `setIsTouch` ni `setSessionActive` ne sont utilisés ailleurs (`grep`) — si oui, STOP et adapter.

- [ ] **Step 2: exhaustive-deps** — recette par site (lire chaque site avant d'éditer) :
  - Collect 1383, Dashboard 744, Rapport 2991 : fallback recréé (`|| []` / `|| {}`) → constante module en tête de fichier (`const AUCUN_FICHIER = [];` / `const PROFIL_VIDE = {};`) utilisée dans le fallback ;
  - Simulator 394 : retirer `versementD2` du tableau de dépendances (warning « unnecessary dependency ») ;
  - Profile 155 : supprimer la ligne `// eslint-disable-next-line react-hooks/exhaustive-deps` orpheline.
- [ ] **Step 3:** `npx vitest run` vert ; `npx eslint src 2>&1 | tail -3` → il ne doit rester QUE les 15 static-components. Vérif manuelle : `npm run dev`, Home + Dashboard + Simulator se comportent normalement.
- [ ] **Step 4:** Commit `fix(e6): set-state-in-effect et exhaustive-deps résorbés (10 warnings)`.

---

### Task 6: Rapport — smoke test PUIS hoists Row/Tab/Horizon + fix ×0,9

**Files:**
- Test: `src/pages/__tests__/rapport-smoke.test.jsx` (create — AVANT les hoists)
- Modify: `src/pages/Rapport.jsx` (hoists l.305/2027/2379 + usages ; fallbacks ×0.9 ~l.342-345)

- [ ] **Step 1: Smoke test (filet)** :

```jsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppProvider } from '../../context/AppContext';
import Rapport from '../Rapport';

const REF = readFileSync(
  fileURLToPath(new URL('../../lib/__tests__/fixtures/profil-fiscal-ref.txt', import.meta.url)), 'utf8',
);

describe('Rapport — smoke test de rendu complet (filet E6)', () => {
  beforeAll(() => {
    localStorage.setItem('kapio.state', JSON.stringify({ profile: REF, mode: 'couple' }));
  });

  it('rend la page avec le profil de référence (titres clés présents)', async () => {
    render(<MemoryRouter><AppProvider><Rapport /></AppProvider></MemoryRouter>);
    // L'hydratation localStorage est asynchrone (useEffect) → findBy.
    expect(await screen.findByText(/Revenus 2025/)).toBeInTheDocument();
    expect(await screen.findByText(/Salaires retenus/)).toBeInTheDocument();
  });
});
```

Run → PASS attendu AVANT toute modification (si FAIL : ajuster les assertions aux titres réels du rendu — `screen.debug()` — sans toucher Rapport). C'est la photographie de référence.

- [ ] **Step 2: Hoists** — un par un, suite verte entre chaque :
  1. `Row` : déplacer au niveau module (`function RevenusRow({ label, v1, v2, sub = false, isMinus = false, isCouple }) { … }` — renommé pour éviter toute collision) ; dans RevenusTable, remplacer `<Row …/>` par `<RevenusRow … isCouple={d.isCouple} />` (~12 usages, `replace_all` prudent).
  2. `Tab` : `function AllocTab({ v, label, active, onSelect }) { … }` module-level ; usages `<Tab v="foyer" label="Foyer" />` → `<AllocTab v="foyer" label="Foyer" active={view === 'foyer'} onSelect={setView} />` (3 usages).
  3. `Horizon` : hoist direct (aucune closure) — `function HorizonBloc({ label, badge, items })`.
- [ ] **Step 3: Fix ×0,9** — importer `abattement10Pension` (étendre l'import taxCalculator existant) et remplacer les deux occurrences `Math.round(p.rente1BsD1 * 0.9)` / `Math.round(p.rente1BsD2 * 0.9)` par `abattement10Pension(p.rente1BsD1)` / `abattement10Pension(p.rente1BsD2)` (les `p.rniRente* ||` devant restent).
- [ ] **Step 4:** `npx vitest run` (smoke inclus) → vert ; `npx eslint src/pages/Rapport.jsx` → 0 static-components.
- [ ] **Step 5:** Commit `fix(e6): Rapport — composants hoistés hors rendu (Row/Tab/Horizon) + abattement pension exact`.

---

### Task 7: Zéro warning + traçabilité + clôture

**Files:**
- Modify: `eslint.config.js` (retrait des 2 downgrades), `docs/audit-2026-07-complet.md` (ligne E6)

- [ ] **Step 1:** Retirer de `eslint.config.js` les deux lignes `'react-hooks/static-components': 'warn',` et `'react-hooks/set-state-in-effect': 'warn',` (et leur commentaire).
- [ ] **Step 2:** `npm run lint` → **0 erreur, 0 warning** (si un résidu apparaît : le corriger, pas le re-downgrader).
- [ ] **Step 3:** Ligne E6 de l'audit → `✅ {date} (branche accessibilite-e6) — lint 0 warning, premiers tests composants`.
- [ ] **Step 4:** `npx vitest run` + `npm run build` verts. Commit docs + clôture via finishing-a-development-branch (merge main + push selon le choix établi), CI surveillée, mémoire projet mise à jour.
- [ ] **Step 5 (manuel, avec Guillaume):** parcours clavier /collect, VoiceOver sur 3 champs, préférence « animations réduites » macOS.
