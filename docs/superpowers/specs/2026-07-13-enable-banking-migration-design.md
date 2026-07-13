# Design — Migration GoCardless → Enable Banking (agrégation bancaire)

**Date :** 2026-07-13
**Statut :** Validé (brainstorming), prêt pour plan d'implémentation
**Auteur :** Guillaume Martine (+ Claude)
**Spec parente :** `2026-07-10-patrimoine-bank-aggregation-design.md`

## Contexte & objectif

Le module Patrimoine (mergé le 2026-07-12) s'appuie sur **GoCardless Bank Account
Data** pour l'agrégation automatique des comptes courants et livrets. Or GoCardless
a **fermé les inscriptions** aux nouveaux clients (mi-2025) : l'intégration est
inutilisable en l'état, le compte n'ayant jamais pu être créé.

Recherche d'alternatives (2026-07-13) : **Enable Banking** est retenu comme
remplaçant — AISP finlandais agréé, mode « **Restricted Production** » gratuit et
self-service (vraies données de production, limitées aux comptes que l'on lie
soi-même depuis leur Control Panel), couverture complète des grandes banques
françaises, consentement DSP2 de 180 jours.

**Décision : remplacement pur.** Le code GoCardless est supprimé (récupérable dans
l'historique git) ; Enable Banking prend sa place derrière les mêmes routes. Pas de
multi-fournisseur backend (YAGNI — GoCardless est fermé, aucun autre candidat).

## Ce qui ne change pas

- Les routes backend `/api/bank/institutions`, `/api/bank/connect`,
  `/api/bank/snapshot` et leur authentification par jeton `x-kapio-secret`
  (`api/_lib/auth.js` inchangé).
- Le contrat `Position` (`src/lib/patrimoine/model.js`) et la fusion
  auto + manuel de `getConsolidatedSnapshot` (une source auto en échec ne fait
  jamais perdre les saisies manuelles).
- Le stockage Redis Upstash (`api/_lib/store.js`, adapté mais même mécanique).
- La saisie manuelle (PEA / AV / PER / prêts / immo), l'historique localStorage,
  le mode couple (`owner: d1/d2/joint`), l'UI de la page Patrimoine.
- Le trilemme de la spec parente reste tranché à l'identique : la DSP2 ne couvre
  toujours pas PEA/AV/PER → saisie manuelle conservée.

## Décisions

| Décision | Choix retenu |
|---|---|
| Fournisseur | **Enable Banking** (`api.enablebanking.com`), application en Restricted Production |
| Stratégie | Remplacement pur — code GoCardless supprimé, mêmes routes backend |
| Auth Enable Banking | JWT **RS256** signé avec la clé privée RSA de l'application, via `node:crypto` natif (zéro dépendance ajoutée) |
| Variables d'env | `ENABLE_BANKING_APP_ID` + `ENABLE_BANKING_PRIVATE_KEY` (PEM **encodé base64**) remplacent `GOCARDLESS_SECRET_ID`/`GOCARDLESS_SECRET_KEY` |
| Consentement | 180 jours demandés (maximum DSP2) ; reconnexion via le même bouton à expiration |
| Callback | **Nouvelle route** `POST /api/bank/callback` : échange le `code` renvoyé par la banque contre une session Enable Banking |
| Identifiant source | `source: 'enablebanking'`, ids `eb-${uid}` ; anciens snapshots `gocardless` restent lisibles (chaîne libre, pas de migration) |
| Client | `providers/bank/gocardless.js` → `providers/bank/enablebanking.js` + fonction `completeConnect` |

## Architecture — flux de connexion

La seule différence structurelle avec GoCardless : l'échange du code au retour de
la banque (étapes 4–6).

```
1. Clic « Connecter une banque » (owner d1/d2)
2. POST /api/bank/connect {institutionId, institutionName, owner}
     → backend : POST /auth (Enable Banking) avec
         redirect_url = APP_ORIGIN/patrimoine, state = aléatoire,
         access.valid_until = +180 j
     → Redis : pending {state → owner, bank}
     → renvoie {link}
3. Redirection vers l'écran sécurisé de la banque (SCA)
4. Retour navigateur : /patrimoine?code=…&state=…
5. La page détecte `code` → POST /api/bank/callback {code, state}
     → backend : POST /sessions {code} (Enable Banking)
     → Redis : session {sessionId, owner, bank, validUntil}, pending supprimé
6. Le front nettoie l'URL (history.replaceState) et déclenche refresh()
```

### Snapshot (bouton Actualiser)

```
GET /api/bank/snapshot
  → pour chaque session Redis :
      GET /sessions/{id}            (liste des uid de comptes)
      GET /accounts/{uid}/details   + GET /accounts/{uid}/balances
  → normalizeEnableBanking → Position[]
```

## Composants

### Backend (Vercel Functions)

| Fichier | Rôle |
|---|---|
| `api/_lib/enableBankingClient.js` | **Nouveau.** Signe le JWT RS256 (header `kid` = app_id, `aud` = api.enablebanking.com, validité courte ~1 h, généré à chaque requête) ; wrappe les appels `GET /aspsps`, `POST /auth`, `POST /sessions`, `GET /sessions/{id}`, `GET /accounts/{uid}/details`, `GET /accounts/{uid}/balances`. Décode `ENABLE_BANKING_PRIVATE_KEY` depuis base64. Vérifier les chemins/champs exacts contre la doc officielle (enablebanking.com/docs) au moment de l'implémentation. |
| `api/_lib/normalizeEnableBanking.js` | **Nouveau** (remplace `normalizeGocardless.js`). PUR : réponses Enable Banking → `Position[]`. Réutilise l'heuristique de type existante (`CACC`/`SVGS` + regex livret). Soldes multiples : privilégier le disponible (`interimAvailable`), sinon le premier. |
| `api/_lib/store.js` | **Adapté.** `requisitions` → `sessions` (clé `kapio:sessions`) + gestion des `pending` de connexion (clé `kapio:pending`, indexés par `state`, avec expiration ~1 h). |
| `api/bank/institutions.js` | **Adapté.** `GET /aspsps?country=FR` ; Enable Banking identifie une banque par (nom, pays) — l'`id` exposé au front encode ce couple. |
| `api/bank/connect.js` | **Adapté.** Crée l'autorisation (`POST /auth`), stocke le pending, renvoie `{link}`. |
| `api/bank/callback.js` | **Nouveau.** `POST {code, state}` : retrouve le pending par `state` (404 si inconnu/expiré), échange le code (`POST /sessions`), stocke la session, supprime le pending. |
| `api/bank/snapshot.js` | **Adapté.** Parcourt les sessions au lieu des requisitions. |
| `api/_lib/gocardlessClient.js`, `api/_lib/normalizeGocardless.js` | **Supprimés** (+ leurs tests). |

### Client

| Fichier | Rôle |
|---|---|
| `src/lib/providers/bank/enablebanking.js` | **Renommage** de `gocardless.js`. Mêmes fonctions (`getPositions`, `startConnect`, `listInstitutions`) + **`completeConnect({url, secret, code, state})`** qui appelle `/api/bank/callback`. |
| `src/lib/providers/bank/index.js` | Registre mis à jour (export + injection de dépendance dans `getConsolidatedSnapshot`). |
| `src/components/patrimoine/ConnectBankButton.jsx` | Import mis à jour, comportement identique. |
| `src/pages/Patrimoine.jsx` | **Ajout** : au montage, si `?code=` présent dans l'URL → `completeConnect` → nettoyage de l'URL → `refresh()`. En cas d'échec de l'échange, message dans la bannière d'erreurs existante. |
| `src/lib/patrimoine/model.js` | Commentaire mis à jour (contrat inchangé). |

## Gestion des erreurs

- **Consentement expiré / révoqué** (~180 j) : l'erreur de la banque concernée
  remonte dans `errors[]` de la bannière existante avec un message actionnable
  (« Consentement expiré — reconnectez [banque] ») ; les autres sessions et la
  saisie manuelle continuent de fonctionner.
- **Callback invalide** (`state` inconnu, code déjà consommé, pending expiré) :
  400/404 explicite, message dans la bannière, l'URL est nettoyée dans tous les cas
  pour éviter les re-soumissions au rechargement.
- **Limite DSP2** : ~4 rafraîchissements non assistés par jour et par compte —
  documentée dans le guide ; pas de garde-fou logiciel au démarrage (YAGNI).

## Tests (TDD, patterns existants)

- `enableBankingClient` : JWT bien formé (header/claims/signature vérifiable avec la
  clé publique de test), appels HTTP avec `fetchImpl` mocké, erreurs HTTP propagées.
- `normalizeEnableBanking` : fonction pure — types de comptes, choix du solde,
  `iban_last4`, owner, valeurs par défaut.
- Handlers `connect` / `callback` / `snapshot` : auth requise, validations d'entrée,
  parcours nominal avec store et client mockés (mêmes patterns que
  `snapshot.test.js` actuel).
- Provider client `enablebanking` : miroir des tests `gocardless.test.js` existants
  + `completeConnect`.
- Suppression des tests GoCardless ; la suite complète (~833 tests) reste verte.

## Documentation

`docs/patrimoine-setup.md` réécrit pour Enable Banking : création du compte
(enablebanking.com), création de l'application (génération de la clé privée RSA —
**conservée en lieu sûr, jamais commitée**), enregistrement de l'URL de redirection
(`APP_ORIGIN/patrimoine`), activation en Restricted Production en liant ses propres
comptes, variables d'environnement Vercel, dépannage.

## Hors périmètre

- Multi-fournisseur backend (GoCardless supprimé, woob toujours écarté — voir spec
  parente).
- Transactions détaillées, webhooks, renouvellement automatique du consentement.
- Migration des données : aucune nécessaire (les snapshots historisés conservent
  leur `source` d'origine et restent lisibles).
