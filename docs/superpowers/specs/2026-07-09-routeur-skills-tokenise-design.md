# Routeur de skills tokenisé — Design

> Statut : validé par Guillaume le 2026-07-09 (tokeniseur + sous-séquence + lexique dérivé DEFISC).
> Réf. audit : `docs/audit-2026-07-complet.md` §1.4 (priorité moyenne — routeur de skills).

## Problème

`detectRelevantSkills` (skillRouter.js) route les skills injectés dans le prompt chat par
`lower.includes(kw)` avec des hacks d'espaces (`'ir '`, `' ir,'`, `'is '`, `'per '`, `' ag '`,
`'lot '`, `'pas '`…). Deux défauts mesurables :

- **Faux positifs** sur les skills NON-fiscaliste (chacun injecte 2-5 k tokens de contenu erroné) :
  `'is '` (comptable) matche « je su**is** » ; `'ir '` matche « part**ir** », « aveni**r** demain ».
- **Faux négatifs** : « PER ? », « l'IR. », un terme en début de phrase sans l'espace de padding
  passent à travers.

Le skill `fiscaliste` étant le fallback (activé si rien ne matche), les faux positifs qui le visent
sont peu coûteux ; la précision compte surtout pour notaire/comptable/syndic/controleur/cac.

## Architecture

Périmètre strict : le **moteur de matching** de `detectRelevantSkills` + les **lexiques**.
`buildSystemPrompt`, `loadSkills`, l'activation sélective — inchangés.

### 1. Tokeniseur

```js
// minuscules + accents retirés (NFD) + découpe sur tout non-alphanumérique.
function tokenize(str) =>
  str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
     .split(/[^a-z0-9]+/).filter(Boolean);
```

- « l'IR. » → `['l', 'ir']` ; « assurance-vie » ET « assurance vie » → `['assurance', 'vie']`
  (unifie tiret/espace) ; « PER ? » → `['per']`.
- Le retrait d'accents collapse `impôt`/`impot`, `déduction`/`deduction`, etc. → les listes de
  mots-clés perdent leurs doublons accentués.

### 2. Matching par sous-séquence

- Chaque mot-clé est **pré-tokenisé une fois** au chargement du module (`tokenize(kw)`).
- Un mot-clé matche si sa suite de tokens apparaît **consécutivement** dans les tokens du message
  (mono-token → simple appartenance ; multi-mots `['quotient','familial']` → sous-séquence contiguë).
- Fonction pure `matchesKeyword(msgTokens, kwTokens)` testable isolément.

### 3. Lexiques nettoyés + complétés

- Retrait des variantes accentuées (redondantes après strip) et des paddings d'espaces
  (`'ir '`→`'ir'`, `' sci,'` supprimé car `'sci'` suffit).
- Retrait du `pas` nu (négation française ultra-fréquente) — conservé uniquement via les phrases
  `taux pas` / `prelevement a la source`.
- **Ajouts** : `ifi`, `cehr` (fiscaliste) ; `holding` (comptable).
- **Dérivation DEFISC** : `deriveDefiscKeywords()` = `Object.keys(DEFISC_DISPOSITIFS)`
  éclatés sur `_`, tokenisés, filtrés des tokens génériques (`ir`, `pme` conservé ; termes < 3
  lettres écartés sauf `fip`), dédupliqués → `['fcpi','fip','madelin','sofica','malraux','pinel',
  'denormandie','censi','bouvard','girardin','pme']`. Fusionnés dans les mots-clés fiscaliste.
  Ajouter un dispositif au JSON le route automatiquement (paperasse-first appliqué au routeur).

### 4. `detectRelevantSkills` (comportement externe inchangé)

- gcp toujours actif ; fallback `fiscaliste` si seul gcp l'est ; retourne un tableau de clés.
- Seule la mécanique interne (tokenize + matchesKeyword) change.

## Tests (`src/lib/__tests__/skill-router.test.js` — le routeur n'en a aucun)

1. **Word-boundary** : `ir` matche « comment calculer mon IR ? » ; PAS « je dois partir demain ».
2. **`is` comptable** : matche « l'IS de ma société » ; PAS « je suis salarié ».
3. **`per`** : matche « mon PER », « PER ? », « PER, c'est quoi » ; PAS « hyperactif ».
4. **Dispositifs** : « investir en Pinel », « souscrire un FCPI », « Girardin outre-mer »
   → fiscaliste (dérivés du JSON).
5. **Ajouts** : `ifi`, `cehr` → fiscaliste ; `holding` → comptable.
6. **Tiret = espace** : « assurance-vie » et « assurance vie » → fiscaliste (même résultat).
7. **Invariants** : gcp toujours présent ; charabia → `['gcp','fiscaliste']` (fallback) ;
   multi-skills (« succession et TVA ») → notaire + comptable + gcp.
8. `deriveDefiscKeywords()` contient bien les 9 dispositifs (dérive l'attendu de `DEFISC_DISPOSITIFS`,
   pas de littéral figé) — reste synchro si le JSON évolue.
9. Suite complète + verrous (paperasse-first, cif-safe) verts.

## Hors périmètre

- Sémantique fine des lexiques over-broad (`alerte`/`opinion` pour cac, `partage` pour notaire) —
  amélioration itérative future, non traitée ici pour ne pas changer le comportement des cas légitimes.
- Logging des questions tombées en fallback (idée audit, séparée).
- `buildSystemPrompt` / `loadSkills` / `debug` — inchangés.
