# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Vite dev server (localhost:5173)
npm run build          # Production build → dist/
npm run lint           # ESLint
npm test               # Vitest single run
npm run test:watch     # Vitest watch mode
npm run update-bareme  # Update annual tax tables from official sources
npm run update-bareme:dry  # Dry-run (preview without writing files)
npm run sync:all       # Sync external paperasse + skills data
```

Run a single test file:
```bash
npx vitest run src/plugins/income/__tests__/salaires.test.js
```

## Architecture overview

Kapio is a **100% client-side** French tax coaching SPA (React + Vite + Tailwind). No backend. The Claude API is called directly from the browser using `anthropic-dangerous-direct-browser-access: true`.

### Data flow (the key invariant)

```
Collect.jsx (form) → profileGenerator.js → TXT profil (source of truth)
    → profileParser.js → flat v1 object → migrations/v1-to-v2.js → plugins
    → taxCalculator.js + registry → Dashboard / Rapport / Simulator / Chat
```

**The TXT profile is the single source of truth.** No data flows directly from the form to calculations — everything goes through the plain-text profile format.

### State management

`AppContext.jsx` holds global state via `useReducer`. Key fields:

- `mode`: `"solo" | "couple"` — drives all per-declarant logic
- `model`: `"sonnet" | "opus"` — Claude model choice
- `formData / d1Data / d2Data`: raw form inputs
- `profile`: the generated plain-text profile
- `parsedProfile`: auto-synced result of `parseProfile(profile)` — never set manually
- `apiKey`: stored separately in `localStorage` (`kapio.apiKey`)

State is persisted to `localStorage` with a 500ms debounce. `anonymizedFiles` (Blob URLs) are session-only and not persisted.

### Plugin system (`src/plugins/`)

Every income type is a plugin in `src/plugins/income/*.plugin.js`. The registry auto-discovers all `*.plugin.js` files via `import.meta.glob` — no registration step needed.

Each plugin must export a default object implementing `IncomePlugin` (see `src/plugins/types.js`):
- `id` (unique kebab-case), `label`, `version`
- `fields[]` — form field descriptors (used by `Collect.jsx`)
- `parser(text, mode)` — TXT → flat v1 partial object
- `generator(formData, d1Data, d2Data, mode)` — form data → TXT fragment
- `validator(formData)` → `{ valid, errors[] }`
- `calculator(v1)` → derived values (tax impact, etc.)
- `declarativeCases()` → list of 2042 form codes handled

See `docs/adding-a-plugin.md` for a complete annotated example and the test template to follow.

### Tax calculations (`src/lib/taxCalculator.js`)

No hardcoded values. All tax parameters come from JSON files in `src/data/paperasse/fiscaliste/data/`. The calculator auto-selects the most recent `bareme-ir-YYYY.json` by year. Adding a new year's file activates it automatically with no code changes.

### Profile text format

Sections are delimited by `== SECTION NAME ==`. In couple mode, sections are duplicated as `== SECTION — DÉCLARANT 1 ==` / `== DÉCLARANT 2 ==`. Amounts use French formatting with narrow non-breaking spaces as thousands separators (e.g. `45 162 €`). The helpers in `src/lib/profileParserUtils.js` (`n()`, `f()`, `s()`, `section()`) handle these conventions.

### AI skills system

`src/data/skills/*.md` files are imported as raw strings via Vite's `?raw` syntax and concatenated into the Claude system prompt in `Chat.jsx`. The `src/data/paperasse/` tree contains structured reference data (JSON + Markdown) for each professional role (fiscaliste, notaire, comptable, etc.).

### Routes

| Path | Page | Guard |
|------|------|-------|
| `/` | Home | — |
| `/setup` | API key + mode config | — |
| `/anonymize` | PDF anonymization | needs API key |
| `/collect` | Data collection form | needs API key |
| `/profile` | Generated profile view | needs profile |
| `/dashboard` | Tax summary + breakdown | needs profile |
| `/rapport` | AI-generated report | needs profile |
| `/opportunites` | Optimization opportunities | needs profile |
| `/simulator` | Savings envelope simulator | needs profile |
| `/chat` | Expert chat with Claude | needs profile |
| `/checklist` | Declaration checklist | — |
| `/declaration` | Declaration guide | — |

### Annual tax table update

Every January, run `npm run update-bareme` (or the GitHub Action) to generate a new `bareme-ir-YYYY.json`. The app picks it up automatically. See `MISE_A_JOUR_BAREME.md` for the full process.

## Locale conventions

Format all monetary amounts with `toLocaleString('fr-FR')` — never with `.toFixed()` or hardcoded separators. Regex parsing of profile text must handle both regular spaces and narrow non-breaking spaces (U+202F) in amounts; use `[\s ]+` instead of `\s+` when matching thousands separators in numbers.
