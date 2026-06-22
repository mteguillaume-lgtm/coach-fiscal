# Feuille de route — Ajouter Mistral AI comme fournisseur dans Kapio

> Document de passation, auto-portant : destiné à être donné à une session Claude
> Code "clean" qui n'a pas le contexte de la discussion d'origine.

## Contexte projet
Kapio est une SPA React + Vite + Tailwind, **100 % client-side** (pas de backend),
de coaching fiscal français. Aujourd'hui elle appelle l'API Claude (Anthropic)
directement depuis le navigateur. Objectif : permettre à l'utilisateur de choisir
entre **Claude** (actuel, premium) et **Mistral** (européen, souverain, tier gratuit),
en collant sa propre clé API du fournisseur choisi.

Lis `CLAUDE.md` à la racine avant de commencer. Ne touche pas à la logique fiscale
ni aux "skills" (`src/data/skills/*.md` + `src/data/paperasse/`) : ce sont des
fichiers texte injectés dans le system prompt, déjà 100 % portables entre modèles.

## Points d'appel IA existants (à connaître)
1. `src/lib/claudeApi.js` — `chatWithClaude({ apiKey, messages, system, onChunk, model })`
   Chat + génération du rapport. Streaming SSE via `fetch`.
   - Map `MODELS` { haiku, sonnet, opus } + `MAX_TOKENS`.
   - `detectComplexity(userMessage, skills)` retourne 'haiku'|'sonnet'|'opus' — NE PAS modifier.
   - Utilisé par `src/pages/Chat.jsx` et `src/pages/Profile.jsx`.
2. `src/lib/extractor.js` — `analyzeDoc(file, apiKey)` : analyse d'image/doc (vision),
   non-streaming, modèle haiku.
3. État : `src/context/AppContext.jsx` (`getApiKey`/`setApiKey`, localStorage `kapio.apiKey`,
   `state.model`). `src/pages/Setup.jsx` : `isValidKey()` + saisie clé.

## Différences techniques Mistral vs Anthropic (CRITIQUE)
| Aspect | Anthropic | Mistral |
|---|---|---|
| Endpoint | `https://api.anthropic.com/v1/messages` | `https://api.mistral.ai/v1/chat/completions` |
| Auth | header `x-api-key` | header `Authorization: Bearer <clé>` |
| System prompt | champ top-level `system` | 1er message `{role:"system", content}` DANS `messages` |
| Format SSE delta | `event.delta.text` (content_block_delta) | `choices[0].delta.content` (style OpenAI) |
| Fin de stream | `[DONE]` | `[DONE]` |
| Préfixe clé | `sk-ant-` | pas de préfixe fixe (~32 car. alphanumériques) |
| Header navigateur | `anthropic-dangerous-direct-browser-access: true` | aucun équivalent |

Modèles Mistral à mapper sur les tiers logiques :
- `haiku`  → `mistral-small-latest`
- `sonnet` → `mistral-medium-latest`
- `opus`   → `mistral-large-latest`

## ⚠️ RISQUE N°1 À VALIDER EN PREMIER (spike de 30 min, avant tout code)
Vérifier que l'API Mistral autorise les appels **directs depuis le navigateur** (CORS).
Anthropic a un header dédié pour ça ; Mistral n'en a pas. Test concret :
faire un `fetch` minimal vers `https://api.mistral.ai/v1/chat/completions` depuis
la console du navigateur sur localhost avec une vraie clé.
- ✅ Si CORS OK → continuer la roadmap telle quelle (architecture client-side conservée).
- ❌ Si CORS bloqué → STOP, remonter au commanditaire : il faudra un proxy backend
  (ex. fonction serverless Vercel), ce qui change la portée. Ne pas improviser le proxy.

## Architecture cible : couche d'abstraction "provider"
Découpler la logique métier du format Anthropic. Approche recommandée :

1. Créer `src/lib/providers/` avec :
   - `anthropic.js` — extraire le code actuel de `claudeApi.js` (mapping modèles,
     fetch, parsing SSE Anthropic).
   - `mistral.js` — même contrat d'interface, format Mistral.
   - `index.js` — un registre qui expose `chat(provider, {...})` et `analyzeDoc(provider, ...)`.
2. Contrat d'interface commun (identique pour les deux adaptateurs) :
   `chat({ apiKey, messages, system, onChunk, model }) => Promise<string>`
   où `model` reste 'haiku'|'sonnet'|'opus' (chaque adaptateur fait son propre mapping).
3. `claudeApi.js` devient un ré-export fin vers le registre pour ne pas casser les imports
   existants — OU mettre à jour les imports dans Chat.jsx/Profile.jsx (au choix, garder
   les diffs petits). `detectComplexity` reste dans un module partagé, inchangé.

## Phases d'implémentation
### Phase 0 — Spike CORS (bloquant, voir ci-dessus)

### Phase 1 — État & sélection du fournisseur
- `AppContext.jsx` : ajouter `state.provider` ('anthropic' | 'mistral'), persisté dans
  localStorage. Stocker la clé par fournisseur (ex. `kapio.apiKey.anthropic`,
  `kapio.apiKey.mistral`) pour ne pas écraser l'une avec l'autre. Adapter
  `getApiKey()`/`setApiKey()` pour prendre le provider courant en compte (rétro-compat :
  migrer l'ancienne clé `kapio.apiKey` vers la clé anthropic).

### Phase 2 — Adaptateur Mistral (chat)
- Implémenter `mistral.js` : Bearer auth, system injecté en 1er message, parsing SSE
  OpenAI (`choices[0].delta.content`), même gestion d'erreurs (401/429/400/5xx) que
  l'existant avec messages FR.
- Réutiliser `MAX_TOKENS` (valeurs compatibles ; Mistral large ~128K contexte).

### Phase 3 — UI Setup
- `Setup.jsx` : ajouter un sélecteur de fournisseur (Claude / Mistral) AVANT le champ clé.
- `isValidKey()` devient dépendant du provider (anthropic: préfixe `sk-ant-` ;
  mistral: chaîne alphanumérique non vide, longueur > 20).
- Adapter placeholder + lien console : Mistral = `https://console.mistral.ai/api-keys`.
- Mettre un court avertissement RGPD/données selon le tier choisi si utile.

### Phase 4 — Analyse de documents (extractor.js)
- Mistral a des modèles vision (Pixtral / `mistral-medium` vision). Soit :
  (a) implémenter le chemin Mistral pour `analyzeDoc`,
  (b) OU, si trop coûteux, garder l'extraction de docs sur Anthropic et désactiver
      proprement l'anonymisation IA quand le provider = mistral (avec message clair).
  Décider avec le commanditaire ; commencer par (b) si le temps manque.

### Phase 5 — Tests & vérif
- Tests unitaires du parsing SSE Mistral (mock d'un flux `data:`), du mapping modèles,
  et de la migration de clé. Suivre le template de test existant (`npm test`).
- Test manuel : `/setup` avec une clé Mistral gratuite → `/chat` (vérifier streaming +
  activation des skills) → `/rapport`.
- `npm run lint` + `npm run build` doivent passer.

## Garde-fous
- Ne PAS modifier la logique fiscale, les skills, le format du profil TXT, ni
  `detectComplexity`. La seule chose qui change est la couche transport vers le LLM.
- Garder les diffs petits et réversibles ; Claude doit rester le fournisseur par défaut.
- Toute clé reste côté navigateur (localStorage), comme aujourd'hui — ne pas centraliser
  de clé sans décision explicite.
- Respecter les conventions de `CLAUDE.md` (formatage FR, etc.).

## Questions ouvertes à confirmer avant de coder
- Résultat du spike CORS (Phase 0) : client-side direct, ou proxy nécessaire ?
- Phase 4 : vision Mistral implémentée, ou extraction docs restreinte à Claude ?
