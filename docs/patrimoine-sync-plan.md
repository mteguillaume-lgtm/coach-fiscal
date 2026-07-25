# Synchronisation patrimoniale — spécification et plan

> Statut : **spec validée, non implémentée**
> Date : 25 juillet 2026
> Objet : alimenter automatiquement le profil Kapio (solo et couple) avec l'état
> réel du patrimoine, sans coût récurrent et sans exposer d'identifiants bancaires.

---

## 1. Le fait structurel qui commande tout le reste

**La DSP2 ne couvre que les « comptes de paiement ».** Les API bancaires
officielles françaises (standard STET) exposent les comptes courants, les comptes
en devises et les cartes à débit différé. **PEA, compte-titres, assurance-vie,
PER, PEL/CEL, livrets réglementés et crédits immobiliers sont hors du périmètre
réglementaire** : aucune banque française ne les expose par API.

Powens (ex-Budget Insight) chiffre le phénomène : **~80 % des comptes agrégés en
France ne sont pas des comptes de paiement**. C'est la raison pour laquelle tous
les agrégateurs commerciaux français (Powens, Bridge, Linxo, Finary) complètent
la DSP2 par du scraping en mode « credentials ».

### Conséquences directes

1. **Enable Banking — l'intégration actuelle de Kapio — ne remontera jamais le
   PEA, l'assurance-vie, le PER ni les crédits.** Ce n'est pas une limite de
   l'outil, c'est la loi. Les livrets sont exposés au cas par cas selon la banque.
2. **Aucune API gratuite ne peut couvrir le patrimoine complet en 2026.** Pour
   les enveloppes hors DSP2, la seule voie gratuite est le scraping avec ses
   propres identifiants — c'est-à-dire **Woob**.
3. **Ça ne changera pas avant 2027 au plus tôt.** Le règlement FiDA, qui étendra
   l'open banking à l'épargne, aux investissements et à la retraite, s'applique
   par phases **de 2027 à 2030**. PSD3/PSR : application effective pas avant fin
   2027.

> **La conclusion à retenir** : il n'existe aucune solution gratuite, légitime et
> sans maintenance pour agréger PEA, AV, PER et crédits en France en 2026. Toute
> architecture doit donc être conçue pour **survivre à la panne d'une source**,
> pas pour supposer qu'une source unique suffira.

---

## 2. Architecture retenue — hybride à trois sources

```
┌─ Enable Banking (Vercel, api/bank/*)   → comptes courants, cartes
│                                          [fiable, légal, déjà implémenté]
├─ Agent local (Kresus/Woob, Docker)     → livrets, PEA, AV, PER, crédits
│                                          [complet, gratuit, casse régulièrement]
└─ Saisie manuelle Kapio                 → immobilier, SCPI, résiduel
                                           [filet de sécurité permanent]
        ↓
   contrat JSON normalisé  →  snapshot consolidé  →  profil TXT Kapio
```

### Pourquoi ces trois sources et pas une seule

| | Enable Banking | Agent local (Woob) | Manuel |
|---|---|---|---|
| Identifiants bancaires stockés | **Aucun** (redirection banque) | Login + mot de passe, sur la machine perso | Aucun |
| Périmètre | Comptes de paiement | **Tout** | Tout |
| Réauthentification | ~180 jours | ~90 jours | — |
| Fréquence max | 4 sync/jour (limite ASPSP) | 1–3 sync/jour | — |
| Mode de panne | Rare (API officielle) | **2 à 5 pannes/banque/an** | Aucun |
| Statut CGU | Prestataire agréé, sans ambiguïté | Zone grise contractuelle | — |

Enable Banking n'est **pas** remplacé par Woob : il reste la source de vérité des
comptes courants, parce qu'il est le seul chemin où aucun mot de passe bancaire
n'existe nulle part. Woob comble uniquement le trou réglementaire.

### Les trois contraintes dures

**(a) Woob a besoin d'un humain, pas d'un serveur.**
Les modules lèvent `AppValidation` (validation dans l'appli bancaire) ou
`BrowserQuestion`/`SentOTPQuestion` (code SMS), puis persistent l'état du
navigateur pour une durée bornée :

```python
# modules/boursorama/browser.py
TWOFA_DURATION = 60 * 24 * 90     # 90 jours
# modules/creditmutuel/browser.py, modules/caissedepargne/browser.py : idem
```

En pratique : **4 validations manuelles par banque et par an**. Entre deux SCA,
un cron fonctionne sans intervention. Aucune topologie serverless ne supprime
cette contrainte — elle la déplace seulement.

**(b) Les identifiants bancaires ne peuvent vivre que sur une machine possédée
physiquement.** Woob stocke login et mot de passe dans `~/.config/woob/backends`,
**non chiffré par défaut**. Sur Vercel : exclu (variables d'env lisibles, logs,
redéploiements). Dans le navigateur : exclu (une XSS = perte totale). Cette seule
contrainte élimine toute option « VPS qui fait tourner Woob ».

**(c) Un serveur HTTP local appelé depuis une SPA en HTTPS est un cul-de-sac.**
Safari/WebKit bloque `http://127.0.0.1` depuis une page HTTPS (déviation de la
spec Mixed Content), Chrome introduit une permission Local Network Access, et il
faudrait élargir `connect-src` dans `vercel.json`. **L'échange se fait donc par
fichier (phase 1) puis par le backend same-origin déjà existant (phase 4).**

**(d) Corollaire opérationnel** : les IP de datacenter déclenchent les règles
anti-fraude des banques (blocage, SMS supplémentaires, verrouillage de compte).
**L'agent tourne à la maison, sur une IP résidentielle. Il ne se déploie pas.**

---

## 3. Le choix d'outil : Kresus plutôt que Woob brut

### État de Woob (vérifié le 25 juillet 2026)

Le projet est **vivant** : dernier commit sur `master` le 18 juillet 2026, 32 des
100 derniers commits touchent des modules bancaires (`[cragr] support the new
CA-Connect login and JSON API`, `[creditmutuel] fix parsing of PEA accounts`…).

**Piège d'installation** : la dernière release PyPI est la **3.7 d'octobre 2024**.
Aucun correctif bancaire de 2025-2026 n'y figure. **Installer depuis git master**
(via `pipx`), jamais depuis PyPI. Le dépôt `woob/modules` est mort depuis 2021 —
les modules sont dans le dépôt principal.

**Fiabilité réelle** : les tickets ouverts au 25/07/2026 couvrent Boursorama,
Crédit Mutuel, Caisse d'Épargne, LCL, Fortuneo, Société Générale, BNP, Hello Bank,
La Banque Postale, AXA et Crédit Agricole. **Aucune grande banque française n'est
épargnée.** Prévoir 2 à 5 pannes par banque et par an, de quelques jours à
quelques semaines. À savoir : les correctifs existent souvent en merge request
avant d'être mergés (goulot de review documenté, issue #844) — chercher dans les
MR ouvertes avant de renoncer.

**Modèle de données** : match direct avec le besoin Kapio — `TYPE_LIVRET_A`,
`TYPE_LDDS`, `TYPE_LEP`, `TYPE_PEL`, `TYPE_CEL`, `TYPE_PEA`, `TYPE_LIFE_INSURANCE`,
`TYPE_PER`, `TYPE_PERP`, `TYPE_PEE`, `TYPE_PERCO`, `TYPE_MORTGAGE`,
`TYPE_CONSUMER_CREDIT`, `TYPE_MARKET`, `TYPE_REAL_ESTATE`. L'objet `Investment`
porte `code` (ISIN), `quantity`, `unitvalue`, `valuation`.

**Point d'attention Crédit Agricole** : le module `cragr` n'implémente que
`CapBank`, **pas `CapBankWealth`** → comptes, livrets et crédits oui, détail
PEA/AV non.

### Pourquoi Kresus

[Kresus](https://kresus.org/) est un gestionnaire de finances auto-hébergé
français (AGPL-3.0, Docker) qui **utilise Woob comme moteur** et résout ce qui
rend Woob pénible :

- **Une interface web pour la 2FA** — le pont Python gère explicitement
  `BrowserQuestion` et `DecoupledValidation`, avec des flags `--interactive` et
  `--resume`. Concrètement : un formulaire pour saisir le code SMS, ou un message
  « validez dans votre appli », puis reprise de la synchro.
- **Synchro nocturne automatique.**
- **94 banques** dans `server/providers/woob/banks.json`, dont toutes les grandes
  enseignes françaises, les assureurs-vie (`spirica`, `suravenir`, `afer`,
  `swisslife`, `apivie`) et l'épargne salariale (`amundi`).
- **Maintenance active** : releases toutes les 2-3 semaines (0.25.2 le 23/07/2026).

**Limite connue** : Kresus **n'appelle jamais `iter_investment`**. On obtient la
**valorisation totale** d'un PEA ou d'une AV, pas le détail des supports (ISIN,
UC vs fonds euros). **C'est suffisant pour l'objectif 1.** Le détail des supports
nécessiterait un appel Woob direct (`woob bank investment -f json`).

**Deux avertissements** :
1. Kresus **n'a aucune authentification intégrée** → strictement sur `localhost`,
   ou derrière un reverse-proxy authentifié. Jamais exposé sur Internet.
2. Kresus stocke les identifiants bancaires de façon réversible (nécessaire pour
   rejouer le login) → machine locale chiffrée, sauvegardes incluses dans la
   réflexion (Time Machine copiera ces fichiers).

### Statut légal — à lire avant de décider

- La DSP2 interdit le screen scraping **aux prestataires régulés agissant comme
  tiers**. Un particulier accédant à ses propres comptes avec ses propres
  identifiants depuis sa propre machine **n'est pas un AISP** et n'entre pas dans
  le champ de cette régulation.
- Le risque réel est **contractuel** : les CGU des banques françaises interdisent
  généralement de communiquer ses identifiants à un tiers. Ici, ils ne quittent
  pas la machine — argument fort, pas une garantie.
- **Risque concret** : en cas de fraude, la banque pourrait invoquer la
  « négligence grave » pour refuser un remboursement. La jurisprudence récente
  protège plutôt le client, mais c'est un débat à éviter.
- **Ceci n'est pas un avis juridique.** Les CGU sont à lire banque par banque.

---

## 4. État des lieux du code (vérifié)

| Élément | Réalité constatée | Fichier |
|---|---|---|
| Contrat Position | 8 types, `owner`, `value < 0` = dette, `manual` dérivé de `source` | `src/lib/patrimoine/model.js` |
| Registre de sources | fusionne `manual` (toujours) + `enablebanking` (si `config.url && config.secret`) | `src/lib/providers/bank/index.js` |
| **Filtre UI codé en dur** | `positions.filter((p) => p.source === 'enablebanking')` | `src/components/patrimoine/AccountsList.jsx:6` |
| Backend | 4 fonctions Vercel + auth par secret partagé + Upstash Redis | `api/bank/*`, `api/_lib/auth.js` |
| CSP | backend same-origin → **rien à ouvrir aujourd'hui** | `vercel.json` |
| Génération du profil | `buildProfile()` appelé à **un seul endroit** | `src/pages/Collect.jsx:1267` |
| Reverse-mapping existant | `handleImportProfile` fait déjà `parsedProfile → formData` (~140 lignes) | `src/pages/Collect.jsx:1298-1450` |
| Format épargne | `fmtOui` → `OUI ~12 400 €`, lu par le helper `oui()` | `profileGenerator.js:91`, `profileParserUtils.js:28` |
| Champs immobilier | `rp_valeur`, `credit_crd` sont dans `== IMMOBILIER ==`, **pas** dans `== ÉPARGNE ==` | `profileGenerator.js:672-674`, `profileParser.js:262-263` |

### Deux pièges identifiés

**Piège nº1 — les sections IA sont détruites par toute régénération.**
`src/pages/Profile.jsx:224` fait `state.profile.trimEnd() + '\n\n' + sectionsPropres`.
Les 5 sections rédigées par l'IA (`AI_TITLES` dans `src/lib/aiSections.js`) sont
**ajoutées** au profil. Un appel à `buildProfile()` régénère le TXT **entier** et
les perd. Tout mécanisme automatique touchant au profil doit les préserver.

**Piège nº2 — `kapio.state` est réécrit intégralement toutes les 500 ms.**
(`src/context/AppContext.jsx:219-231`). Il est **interdit** d'y stocker des
transactions : gel de l'UI et dépassement du quota localStorage garantis.

**Constat de fond** : le patrimoine est aujourd'hui un **silo** — `Patrimoine.jsx`
ne touche jamais à `state.profile`. C'est exactement le pont qui manque.

---

## 5. Le contrat de données — `kapio.patrimoine.snapshot` v1

C'est **la pièce maîtresse**. Elle rend Kapio indépendant de l'agrégateur : le
même import accepte un JSON produit par Kresus, par Woob, converti d'un CSV, ou
tapé à la main. Le jour où un connecteur casse, rien dans Kapio ne casse.

```json
{
  "schema": "kapio.patrimoine.snapshot",
  "version": 1,
  "generatedAt": "2026-07-25T08:12:04.000Z",
  "agent": { "name": "kapio-kresus-export", "version": "0.1.0" },
  "positions": [
    {
      "externalId": "kresus:boursorama:cc-8841",
      "source": "agent",
      "sourceDetail": "kresus/boursorama",
      "bank": "BoursoBank",
      "type": "checking",
      "subtype": null,
      "label": "Compte courant",
      "value": 3421.55,
      "currency": "EUR",
      "iban_last4": "4412",
      "owner": "d1",
      "asOf": "2026-07-25T06:00:00.000Z"
    },
    {
      "externalId": "kresus:boursorama:liva-9981",
      "source": "agent", "bank": "BoursoBank",
      "type": "savings", "subtype": "livret_a",
      "label": "Livret A", "value": 13100, "currency": "EUR",
      "owner": "d1", "asOf": "2026-07-25T06:00:00.000Z"
    },
    {
      "externalId": "kresus:fortuneo:pea-2210",
      "source": "agent", "bank": "Fortuneo",
      "type": "pea", "subtype": null,
      "label": "PEA", "value": 48210.32, "currency": "EUR",
      "owner": "d2", "asOf": "2026-07-25T06:00:00.000Z"
    },
    {
      "externalId": "kresus:ca:credit-immo",
      "source": "agent", "bank": "Crédit Agricole",
      "type": "loan", "subtype": "credit_immo",
      "label": "Prêt RP", "value": -184300, "currency": "EUR",
      "owner": "joint", "asOf": "2026-07-25T06:00:00.000Z"
    }
  ],
  "errors": [
    { "scope": "Crédit Mutuel", "message": "SCA expirée — relancer la connexion" }
  ],
  "transactions": []
}
```

### Règles du contrat

- **Obligatoires** : `schema`, `version`, `generatedAt`, et par position `type`,
  `value`, `owner`. Tout le reste retombe sur les défauts de `makePosition()` —
  aucune duplication de logique.
- **`externalId`** (nouveau) : identifiant stable côté source. Permet le diff
  entre deux synchros (« Livret A : 12 400 → 13 100 € ») et évite les doublons.
  `id` reste dérivé (`ag-<hash(externalId)>`), jamais fourni par l'agent.
- **`subtype`** (nouveau, indispensable) : sans lui, `type: 'savings'` est
  inexploitable fiscalement — le profil distingue Livret A / LDDS / LEP / PEL,
  chacun avec ses plafonds et sa fiscalité. Énumération :
  `livret_a | ldds | lep | pel | cel | livret_bancaire | pee | perco |
  per_individuel | av_euro | av_uc | immo_rp | immo_locatif | credit_immo |
  credit_conso`.
- **`asOf` ≠ `updatedAt`** : date d'arrêté du solde côté banque, vs date
  d'écriture dans Kapio. Sans ça, impossible de savoir si le snapshot est périmé.
- **Aucun champ propriétaire** : pas de `session_id`, pas de nom de module ailleurs
  que dans `sourceDetail` (purement informatif). C'est ce qui garantit
  l'indépendance vis-à-vis de l'agrégateur.
- **`transactions: []` déclaré dès v1 mais ignoré** par le client. Crochet de
  compatibilité ascendante pour l'objectif 2.
- **Interdits** : IBAN complet, numéro de compte, nom du titulaire, identifiants.
  Seul `iban_last4` — convention déjà en place dans
  `api/_lib/normalizeEnableBanking.js:36`. Le validateur applique une **allowlist**
  (supprime tout champ non listé), pas une denylist.

---

## 6. Intégration côté client

La source `agent` est ajoutée **par symétrie avec `manual`**, pas avec
`enablebanking` : elle lit un store local, n'est pas conditionnée par la config
backend, et ne peut pas échouer en réseau.

### Fichiers à créer

| Fichier | Rôle |
|---|---|
| `src/lib/patrimoine/snapshotSchema.js` | `parseSnapshot(json) → { positions, errors, generatedAt, warnings }`. **Fonction pure** : valide `schema`/`version`, rejette les types inconnus, applique l'allowlist, mappe via `makePosition()`, dérive les `id`. Toute la robustesse est ici, testable sans DOM. |
| `src/lib/patrimoine/agentStore.js` | Jumeau de `manualStore.js` : clé `kapio.patrimoine.agent`, `listAgent(storage)`, `setAgentSnapshot(snapshot, storage)`, `clearAgent(storage)`. `storage` injectable. |
| `src/lib/providers/bank/agent.js` | 4 lignes, calqué sur `manual.js`. |
| `src/components/patrimoine/ImportSnapshot.jsx` | `<input type="file" accept=".json">` + `FileReader` (même pattern que `Collect.jsx:1298`). Affiche le diff **avant** validation — jamais d'application silencieuse. |
| Tests correspondants | `snapshotSchema.test.js`, `agentStore.test.js`, `agent.test.js`, `ImportSnapshot.test.jsx` |

### Fichiers à modifier

| Fichier | Modification |
|---|---|
| `src/lib/patrimoine/model.js` | Ajouter `subtype`, `externalId`, `asOf` (optionnels, omis si absents — même style que `iban_last4`). Ajouter `'agent'` aux sources connues. |
| `src/lib/providers/bank/index.js` | `positions.push(...agentProvider.getPositions(storage))` **hors** du bloc conditionné par `hasConfig`. Remonter aussi les `errors` du dernier snapshot agent. |
| `src/components/patrimoine/AccountsList.jsx:6` | `p.source === 'enablebanking'` → `p.source !== 'manual'`, grouper par `bank` avec un badge de source. **Seul point de rupture du code existant.** |
| `src/pages/Patrimoine.jsx` | Monter `<ImportSnapshot onChange={refresh} />` à côté de `<ConnectBankButton>`. |

### Dédoublonnage — le bug le plus probable de cette feature

Un compte courant peut remonter **à la fois** par Enable Banking et par l'agent.
Sans règle, le patrimoine net est faux.

Règle à implémenter dans `getConsolidatedSnapshot` :
- Clé de dédoublonnage : `(owner, iban_last4, type)`
- Priorité : **`enablebanking` > `agent` > `manual`**

---

## 7. Le pont patrimoine → profil TXT

### Décision : PAS de section `== PATRIMOINE ==`, PAS de plugin

- Une nouvelle section **dupliquerait** des montants déjà portés par
  `== ÉPARGNE ET PLACEMENTS ==` et `== IMMOBILIER ==`, que `_patrimoine()`
  (`profileParser.js:306`) somme déjà. Deux sources dans le TXT = **double
  comptage garanti**.
- Un plugin d'income n'est pas le bon outil : `IncomePlugin` modélise un **flux**
  imposable avec des cases 2042, pas un **stock**.
- Les champs cibles **existent déjà**.

### Le flux retenu

```
Position[]  →  toProfilePatch()  →  patch { formData, d1Data, d2Data }
            →  revue humaine du diff (écran dédié)
            →  buildProfile(...)  +  réappend des sections IA
            →  SET_PROFILE  →  parseProfile  →  plugins  →  taxCalculator
```

L'invariant est **intégralement respecté** : rien ne court-circuite
`formData → profileGenerator → TXT → profileParser`. C'est exactement le chemin
qu'emprunte déjà `handleImportProfile`, en sens inverse.

### Table de correspondance

| type / subtype | Champ cible | Section TXT | Remarque |
|---|---|---|---|
| `savings/livret_a` | `livret_a` | ÉPARGNE | agrégation par owner ; contrôle de plafond recalculé |
| `savings/ldds` | `ldd` | ÉPARGNE | |
| `savings/lep` | `lep` | ÉPARGNE | |
| `savings/livret_bancaire` | `livret_plus` | ÉPARGNE | |
| `savings/pel` | `pel` | ÉPARGNE | `pel_date` reste **manuel** (antériorité fiscale absente des API) |
| `pea` | `pea` | ÉPARGNE | `pea_date`, `pea_verse` restent **manuels**, jamais écrasés |
| `securities` | `cto` | ÉPARGNE | |
| `life_insurance` | `av` | ÉPARGNE | `av_date`, `av_verse` **manuels** |
| `per/pee` | `pee` | ÉPARGNE | |
| `per/per_individuel` | `per_valorisation` (**nouveau**) | ÉPARGNE | à créer |
| `checking` | `compte_courant` (**nouveau**) | ÉPARGNE | à créer ; non fiscal, sert au conseil (capacité d'épargne, matelas) |
| `loan/credit_immo` | `credit_crd` | **IMMOBILIER** | ⚠️ c'est un **capital restant dû** |
| `loan/credit_conso` | *non mappé* | — | laisser manuel : une mensualité ne se déduit pas d'un CRD |
| `real_estate/immo_rp` | `rp_valeur` | **IMMOBILIER** | proposé, jamais imposé (estimation, pas un solde) |

> ⚠️ **Piège à ne pas rater** : le champ existant `per` correspond aux
> **versements PER 2025** (un flux, parsé par `PER versements 2025`), **pas** à
> une valorisation. Ne jamais y écrire un solde — ça fausserait le calcul du
> plafond de déduction. D'où le nouveau champ `per_valorisation`.

> ⚠️ Ne pas confondre `credit_crd` (**capital**) et `autres_credits`
> (**mensualité**).

### Mode couple

- `owner: 'd1'` → `d1Data` ; `'d2'` → `d2Data` ; en solo, tout va dans `formData`.
- `owner: 'joint'` : le profil n'a pas de notion de compte joint.
  - Règle : **50/50 sur `d1Data`/`d2Data`** pour `checking` et `real_estate`.
  - **Garde-fou** : `savings/livret_a`, `lep`, `pea` et `per` sont **nominatifs
    par la loi**. Si l'agent remonte `owner: 'joint'` sur ces types,
    `snapshotSchema.js` émet un `warning` et force `d1` — découper un Livret A en
    deux fausserait le contrôle du plafond de 22 950 €.
- L'écran de revue **doit afficher la colonne titulaire** : c'est là qu'une erreur
  de mapping se voit. Un `owner` erroné est une fuite entre déclarants — dans un
  couple, ce n'est pas anodin.

### Préservation des sections IA

```js
// src/lib/profileRebuilder.js  (à créer)
export function rebuildPreservingAi(oldProfile, { formData, d1Data, d2Data, docs, isCouple }) {
  const base = buildProfile(formData, d1Data, d2Data, docs, isCouple);
  const ai   = extractAiSections(oldProfile);
  return ai ? `${base.trimEnd()}\n\n${ai}` : base;
}
```

Et signaler que l'analyse IA repose désormais sur des montants modifiés → proposer
un ré-enrichissement. **Ne jamais appliquer la synchro au profil
automatiquement** : action explicite, avec diff, depuis `/patrimoine`.

### Fichiers du pont

| Fichier | Action |
|---|---|
| `src/lib/patrimoine/toProfilePatch.js` | **créer** — pure : `(positions, mode) → { formData, d1Data, d2Data, diff[], warnings[] }` |
| `src/lib/profileRebuilder.js` | **créer** — rebuild + réappend IA |
| `src/components/patrimoine/SyncToProfile.jsx` | **créer** — écran de revue du diff + bouton « Appliquer au profil » |
| `src/lib/profileGenerator.js` | **modifier** — 2 lignes dans les 3 blocs épargne (solo ~L634-645, D1 ~L846-857, D2 ~L859-870) : `Compte courant : …`, `PER — valorisation : …`. Utiliser `fmtOui` par cohérence. |
| `src/lib/profileParser.js` | **modifier** — 2 regex dans `_epargneDecl` (L197). **Impérativement `[\s ]+`** pour l'espace insécable étroit (U+202F). |
| `src/pages/Collect.jsx` | **modifier** — 2 descripteurs dans `EP_INDIV_FIELDS` + 2 lignes dans `handleImportProfile` (aller-retour symétrique) |

---

## 8. Objectif 2 — conseil sur les dépenses

### Le plafond réel

| Source | Fréquence réaliste | Périmètre |
|---|---|---|
| Enable Banking | **4×/jour max** (limite ASPSP, 429 au-delà) | transactions comptes courants |
| Kresus/Woob | 1×/jour (nocturne), 2–3×/jour au forcing | tout, mais fragile |

**« Quasi temps réel » = quelques heures de latence, pas quelques minutes.** Aucune
option gratuite ne fait mieux : les banques françaises limitent structurellement
la fréquence de récupération en arrière-plan.

### Trois conséquences

1. Le conseil sur les dépenses ne concerne **que les comptes courants et cartes** —
   seul périmètre avec des transactions pertinentes. PEA/AV/PER n'ont pas de flux
   quotidien exploitable.
2. **Enable Banking suffit donc pour l'objectif 2**, et c'est même la meilleure
   source (API officielle, plus stable, réauth 180 j). Woob y devient facultatif.
3. Synchroniser plus souvent = subir plus de pannes. **Argument pour cantonner
   Woob à l'objectif 1, en fréquence mensuelle.**

### Briques à ajouter le moment venu

1. Transport A3 : `api/patrimoine/snapshot.js` (POST agent authentifié par
   `requireSecret`, GET SPA) + `saveAgentSnapshot`/`getAgentSnapshot` dans
   `api/_lib/store.js`. **Zéro changement CSP** (same-origin), zéro nouveau secret.
2. Store **IndexedDB** dédié (`src/lib/patrimoine/transactionStore.js`),
   rigoureusement séparé de `kapio.state`.
3. Catégorisation locale par règles de libellé (pas d'IA au départ) + agrégat
   mensuel injecté dans le contexte du Chat.
4. Cron Vercel (gratuit sur Hobby, granularité quotidienne) rafraîchissant le
   snapshot Enable Banking dans Redis.

### Ce qu'il ne faut surtout PAS faire aujourd'hui

- ❌ Mettre positions ou transactions dans `kapio.state` (réécriture toutes les
  500 ms → gel UI, quota localStorage explosé).
- ❌ Faire entrer les transactions dans le profil TXT. Le TXT est un instantané
  **fiscal annuel** ; les transactions sont un flux hebdomadaire. Les mélanger
  rendrait le parsing ingérable et exploserait le prompt système.
- ❌ Coder le diff ou le mapping dans un composant React — tout en lib pure, sinon
  rien n'est testable et l'objectif 2 devra tout réécrire.
- ❌ Ouvrir `connect-src` à quoi que ce soit. Toute topologie qui l'exige est le
  signal qu'on prend la mauvaise route.
- ❌ Mettre `type: 'transaction'` dans `POSITION_TYPES`. Deux contrats distincts,
  une seule enveloppe.
- ❌ **Attendre Woob pour livrer.** Le contrat JSON + l'import fichier ont de la
  valeur seuls.

---

## 9. Phasage

| Phase | Contenu | Valeur livrée | Effort |
|---|---|---|---|
| **1 — Le contrat** | `snapshotSchema.js`, `agentStore.js`, source `agent`, `ImportSnapshot.jsx`, correctif `AccountsList.jsx`, dédoublonnage, `subtype`/`externalId`/`asOf` | Kapio alimentable depuis n'importe quelle source. **Zéro nouveau secret, zéro backend, zéro CSP, zéro Python.** | 1 session |
| **2 — Le pont profil** | `toProfilePatch.js`, `profileRebuilder.js`, `SyncToProfile.jsx`, champs `compte_courant` + `per_valorisation` (generator + parser + Collect) | Le patrimoine sort du silo et met à jour le profil fiscal des deux déclarants. **C'est ici que se réalise l'objectif 1.** | 1 session |
| **3 — L'agent local** | Kresus en Docker sur la machine perso + script d'export `kresus → snapshot JSON`. Hors `src/`, hors build Vite, hors npm. | Le JSON se produit tout seul chaque nuit ; reste à le déposer dans Kapio | 1 soirée + débogage par banque |
| **4 — La boîte aux lettres** | `api/patrimoine/snapshot.js` + extension `api/_lib/store.js` + mode `remote` dans `providers/bank/agent.js` | Plus de glisser-déposer : on ouvre Kapio, c'est à jour | 0,5 session (l'infra existe) |
| **5 — Objectif 2** | `transactionStore.js` (IndexedDB), catégorisation par règles, tableau de bord dépenses, cron Vercel | Conseil sur les dépenses | À rediscuter après 1-4 en production |

**Les phases 1 et 2 seules répondent à l'objectif 1** côté Kapio. Les phases 3 et 4
sont du confort. Si Kresus/Woob s'avère trop pénible, **les phases 1-2 gardent
toute leur valeur** avec un JSON produit autrement.

---

## 10. Points de vigilance sécurité

1. **Identifiants bancaires : uniquement sur la machine perso, jamais en clair.**
   `woob config` avec le trousseau macOS. Le fichier `~/.config/woob/backends`
   non chiffré est le comportement **par défaut** — c'est un piège. Penser aussi
   aux sauvegardes Time Machine, qui copieront ces fichiers.
2. **Kresus sur `localhost` uniquement** — aucune authentification intégrée.
3. **`KAPIO_BACKEND_SECRET` dans l'agent (phase 4)** : jamais en dur dans le
   script, jamais dans git. Le lire via
   `security find-generic-password -s kapio-backend -w`. Config en `chmod 600`.
4. **`POST /api/patrimoine/snapshot` n'est protégé que par le secret partagé** :
   borner la taille du payload (~256 Ko), **valider le schéma côté serveur aussi**,
   ne rien logger du corps. Le tier Upstash gratuit se remplit vite.
5. **Jamais d'IBAN complet ni de nom de titulaire** dans le snapshot. Le backend
   tronque déjà (`iban_last4`) — le contrat rend la règle explicite et
   `snapshotSchema.js` applique une **allowlist**.
6. **CSP** : la seule bonne réponse à « comment j'appelle X depuis la SPA ? » est
   « X est sur la même origine ». Toute demande d'élargissement de `connect-src`
   mérite un refus par défaut.
7. **Ne jamais écraser le profil TXT sans revue.** C'est la source de vérité et il
   contient du travail IA non reproductible. Diff obligatoire, application explicite.
8. **`localStorage` reste lisible par tout script de la page.** Le snapshot y sera,
   comme la clé API l'est déjà. C'est un choix assumé du projet, mais il justifie
   de n'y mettre que des **soldes** — jamais d'identifiants ni d'IBAN.
9. **Faire tourner l'agent depuis chez soi, sur IP résidentielle.** Les IP de
   datacenter déclenchent les règles anti-fraude des banques.

---

## 11. Questions ouvertes — à trancher avant la phase 3

1. **Enable Banking autorise-t-il les comptes de la conjointe ?** Le mode gratuit
   parle de « your own accounts » / « individual non-commercial use ». Pour un
   couple, c'est une zone grise. **À confirmer auprès de `sales@enablebanking.com`.**
   C'est la question la plus importante — elle conditionne la valeur d'Enable
   Banking en mode couple.
2. **Quels livrets les banques concernées exposent-elles réellement ?** L'endpoint
   `/aspsps?country=FR` exige un JWT. **À tester dès l'obtention d'une clé** —
   c'est ce qui déterminera le périmètre réel d'Enable Banking.
3. **Nombre max de comptes liables en restricted production** : non documenté.
4. **Le mode restricted production a-t-il une durée de validité ?** Non documenté.
5. **Tolérance réelle de chaque banque vis-à-vis de Woob** : très variable. Seul
   moyen de savoir : essayer, un compte à la fois.
6. **CGU des banques concernées** — à lire soi-même, banque par banque.

---

## 12. Le plan B assumé

Si la maintenance des connecteurs devient épuisante, **Finary Premium (~79 €/an)**
couvre l'intégralité du périmètre (comptes, livrets, PEA, AV, PER, crédits,
immobilier, crypto) sans aucune maintenance — c'est Finary qui absorbe la casse.
Le plan Free est limité à **3 comptes**, donc hors sujet pour un couple.
L'API n'est pas publique, mais [`finary_uapi`](https://github.com/lasconic/finary_uapi)
(Python, actif en mai 2026) permet de la piloter — au risque qu'elle casse sans
préavis.

**L'architecture de ce document rend cette bascule indolore** : Finary
deviendrait simplement une source de plus produisant le même contrat JSON. C'est
tout l'intérêt de commencer par le contrat.

---

## Sources

- [woob / GitLab](https://gitlab.com/woob/woob) · [issues](https://gitlab.com/woob/woob/-/issues) · [doc install](https://woob.dev/guides/install/) · [doc MFA](https://woob.dev/api/browser/mfa/)
- [Kresus](https://kresus.org/) · [GitHub](https://github.com/kresusapp/kresus) · [FAQ](https://kresus.org/faq.html) · [Docker](https://hub.docker.com/r/bnjbvr/kresus)
- [Enable Banking — FAQ](https://enablebanking.com/docs/faq/) · [linked accounts](https://enablebanking.com/docs/api/linked-accounts/)
- [Powens — agrégation multi-sources](https://www.powens.com/fr/blog/agregation-bancaire-multi-sources/) · [API BPCE AIS](https://apistore.groupebpce.com/api/account-information-services-2)
- [Capco — FiDA primer 2026](https://www.capco.com/intelligence/capco-intelligence/fida-primer-for-2026-and-beyond) · [Norton Rose Fulbright — PSD3/PSR](https://www.nortonrosefulbright.com/en/knowledge/publications/cedd39c6/psd3-and-psr-from-provisional-agreement-to-2026-readiness)
- [MDN — Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content) · [Chrome — Local Network Access](https://developer.chrome.com/blog/local-network-access)
- [finary_uapi](https://github.com/lasconic/finary_uapi)
