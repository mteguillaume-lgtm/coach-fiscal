# Installer le module Patrimoine (agrégation bancaire)

> Ce guide est autonome : il vous accompagne pas à pas pour activer la page
> `/patrimoine` de Kapio, qui affiche votre valeur nette (comptes bancaires
> connectés automatiquement + PEA/assurance-vie saisis à la main).
>
> Rien de tout cela n'est obligatoire : sans backend configuré, `/patrimoine`
> fonctionne quand même en mode 100 % saisie manuelle. Ce guide ne concerne
> que la partie **connexion automatique aux banques**.

## Vue d'ensemble

Le module Patrimoine a deux sources de données :

1. **Comptes bancaires connectés** (comptes courants, livrets…) — via un petit
   backend (quelques fonctions serverless dans `api/`) qui parle à
   [GoCardless Bank Account Data](https://gocardless.com/bank-account-data/)
   (ex-Nordigen), l'agrégateur bancaire européen. Kapio ne stocke jamais vos
   identifiants bancaires : le backend ne fait que relayer un jeton chiffré.
2. **Placements saisis à la main** (PEA, assurance-vie, compte-titres, PER,
   immobilier, prêts…) — directement dans `/patrimoine`, sans rien à
   installer. GoCardless ne donne pas accès à ces enveloppes, donc cette
   saisie manuelle restera toujours nécessaire pour elles.

Ce guide couvre l'installation de la partie 1 (le backend). Comptez 15-20
minutes la première fois.

### Ce dont vous aurez besoin

- Un compte [Vercel](https://vercel.com) (gratuit) — c'est là que vit déjà la
  SPA Kapio si vous l'avez déployée ; le backend patrimoine se déploie dans
  **ce même projet**.
- Un compte [GoCardless Bank Account Data](https://bankaccountdata.gocardless.com/)
  (gratuit en usage modéré).
- Un compte [Upstash](https://upstash.com/) (offre gratuite, Redis).
- `openssl` en ligne de commande (préinstallé sur macOS et Linux ; sur
  Windows, utilisez Git Bash ou WSL).

---

## Étape 1 — Créer un compte GoCardless Bank Account Data

1. Rendez-vous sur https://bankaccountdata.gocardless.com/ et créez un compte
   gratuit (« Bank Account Data », anciennement Nordigen — ne pas confondre
   avec le GoCardless « prélèvements SEPA », c'est un produit différent).
2. Une fois connecté, allez dans **Developers → Create new secret**.
3. Notez les deux valeurs affichées : **Secret ID** et **Secret key**. La clé
   secrète ne sera affichée qu'une seule fois — copiez-la immédiatement dans
   un gestionnaire de mots de passe ou un fichier temporaire.

Vous obtenez ainsi :
```
GOCARDLESS_SECRET_ID=...
GOCARDLESS_SECRET_KEY=...
```

---

## Étape 2 — Créer une base Upstash Redis

Le backend a besoin d'un petit espace de stockage clé-valeur pour garder la
trace des connexions bancaires en cours (chiffrées) et limiter les abus
(rate-limiting). Upstash Redis convient très bien et son offre gratuite est
largement suffisante pour un usage personnel.

1. Créez un compte sur https://upstash.com/ (gratuit).
2. **Create Database** → choisissez une région proche de vous → type
   « Regional » (pas besoin de « Global » pour cet usage).
3. Une fois la base créée, ouvrez l'onglet **REST API** de sa page de détail.
4. Copiez les deux valeurs :
```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## Étape 3 — Générer les deux secrets internes

Le backend chiffre les jetons bancaires avant de les stocker, et exige un
mot de passe personnel pour éviter que n'importe qui puisse l'appeler.
Générez ces deux valeurs vous-même, avec `openssl` :

```bash
# Clé de chiffrement des jetons bancaires (32 octets = 64 caractères hexa)
openssl rand -hex 32
# → à mettre dans TOKEN_ENCRYPTION_KEY

# Votre jeton secret personnel (utilisé par Kapio pour s'authentifier au backend)
openssl rand -hex 24
# → à mettre dans KAPIO_BACKEND_SECRET
```

Conservez ces deux valeurs de côté : `TOKEN_ENCRYPTION_KEY` ne doit **jamais**
changer une fois des connexions bancaires actives (sinon elles deviennent
indéchiffrables), et `KAPIO_BACKEND_SECRET` est le mot de passe que vous
saisirez plus tard dans Kapio.

---

## Étape 4 — Déployer le backend sur Vercel

Le dossier `api/` de ce dépôt contient les fonctions serverless du backend
(`api/bank/connect.js`, `api/bank/institutions.js`, `api/bank/snapshot.js`).
**Il doit être déployé dans le même projet Vercel que la SPA Kapio** (voir
l'encadré CSP plus bas — c'est important, pas juste une commodité).

Si vous avez déjà déployé Kapio sur Vercel, il vous suffit de redéployer
(le dossier `api/` fait partie du même dépôt) :

```bash
vercel --prod
```

Si ce n'est pas encore fait, depuis la racine du dépôt :

```bash
vercel        # première fois : suit les questions (lier/créer un projet)
vercel --prod # déploiement de production
```

Ensuite, renseignez les variables d'environnement (reprenez les valeurs des
étapes 1 à 3, voir aussi `.env.example`) :

```bash
vercel env add GOCARDLESS_SECRET_ID production
vercel env add GOCARDLESS_SECRET_KEY production
vercel env add TOKEN_ENCRYPTION_KEY production
vercel env add KAPIO_BACKEND_SECRET production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add APP_ORIGIN production   # ex. https://mon-kapio.vercel.app
```

(Vous pouvez aussi les saisir depuis le dashboard Vercel : **Project →
Settings → Environment Variables**.)

Redéployez une dernière fois pour que les variables soient prises en compte :

```bash
vercel --prod
```

**Notez l'URL de production** (ex. `https://mon-kapio.vercel.app`) — vous en
aurez besoin à l'étape suivante. C'est la même URL que celle de la SPA
elle-même, puisque backend et frontend vivent dans le même projet.

---

## Étape 5 — Connecter Kapio à votre backend

1. Ouvrez Kapio, allez sur la page **`/patrimoine`**.
2. Un petit formulaire s'affiche (« Configure ton backend patrimoine, une
   seule fois ») :
   - **URL du backend** : l'URL notée à l'étape 4 (ex.
     `https://mon-kapio.vercel.app`).
   - **Jeton secret** : la valeur de `KAPIO_BACKEND_SECRET` générée à
     l'étape 3.
3. Cliquez sur **Enregistrer**. Ces deux valeurs sont sauvegardées dans le
   `localStorage` de votre navigateur (comme votre clé API Claude) — elles ne
   sont jamais envoyées ailleurs qu'à votre propre backend.
4. Le formulaire fait place à un second bloc : saisissez l'**identifiant
   GoCardless de votre banque** (« Banque (identifiant GoCardless) », ex.
   `BNP_FR...` — la liste des identifiants par établissement est disponible
   via l'API GoCardless, `institutions.js` dans `api/bank/`). En mode couple,
   choisissez aussi le **titulaire** (Déclarant 1 / Déclarant 2 / Commun).
5. Cliquez sur **« Connecter une banque »**. Vous êtes redirigé vers le
   parcours d'authentification bancaire officiel (site de votre banque ou
   partenaire GoCardless). Une fois le consentement donné, vous revenez sur
   Kapio et vos comptes apparaissent automatiquement dans `/patrimoine`
   (valeur nette, répartition en donut, historique).

---

## Rappels importants

- **Re-consentement tous les ~90 jours** : par réglementation bancaire
  européenne (DSP2), l'autorisation d'accès à vos comptes expire
  automatiquement au bout de 90 jours maximum. Kapio ne peut pas la
  renouveler tout seul — vous devrez recliquer sur « Connecter une banque »
  pour la banque concernée quand l'accès expire (l'affichage vous le
  signalera si les comptes ne se rafraîchissent plus).
- **PEA et assurance-vie restent en saisie manuelle** : GoCardless (comme la
  plupart des agrégateurs bancaires) ne couvre que les comptes bancaires
  courants/livrets, pas les enveloppes d'épargne réglementée par votre
  assureur ou courtier. Utilisez le bloc « Placements & prêts (saisie
  manuelle) » en bas de `/patrimoine` pour ces lignes — elles sont conservées
  localement et comptent dans le calcul de la valeur nette au même titre que
  les comptes connectés.
- Vos identifiants bancaires ne transitent jamais par Kapio ni par son
  backend : la connexion se fait directement entre vous et votre banque via
  le parcours officiel GoCardless.

---

## Note de sécurité — CSP et origine du backend

La Content-Security-Policy de Kapio (`vercel.json`) restreint par défaut les
appels réseau du navigateur à `connect-src 'self'` (plus les API IA
autorisées). **C'est pour cela que ce guide recommande de déployer `api/`
dans le même projet Vercel que la SPA** : le backend est alors servi sur la
même origine que la page (ex. `https://mon-kapio.vercel.app/api/bank/...`),
et la CSP l'autorise sans aucune modification.

Si vous choisissez malgré tout d'héberger le backend sur une **autre
origine** (un autre domaine ou projet Vercel), le navigateur **bloquera**
l'appel `fetch` de Kapio vers ce backend tant que vous n'aurez pas ajouté
cette origine à la directive `connect-src` de `vercel.json` de la SPA, par
exemple :

```json
"connect-src 'self' https://api.anthropic.com https://api.mistral.ai https://mon-backend-separe.vercel.app"
```

puis redéployé la SPA. Cette même consigne figure en tête de `.env.example`.

---

## Dépannage rapide

| Symptôme | Piste |
|---|---|
| Le bouton « Connecter une banque » reste inactif | Vérifiez que l'identifiant GoCardless de la banque n'est pas vide. |
| Erreur affichée après clic sur « Connecter une banque » | Vérifiez `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY` côté Vercel, et que le backend est bien redéployé après ajout des variables d'environnement. |
| L'appel au backend est bloqué silencieusement (rien ne se passe, erreur CSP dans la console navigateur) | Le backend n'est probablement pas sur la même origine que la SPA — voir la note de sécurité ci-dessus. |
| Les comptes ne se rafraîchissent plus après un moment | Le consentement bancaire (~90 jours) a probablement expiré — reconnectez la banque concernée. |
| « URL du backend » ou « Jeton secret » oubliés | Ce sont les valeurs de l'étape 4 (URL de déploiement Vercel) et de l'étape 3 (`KAPIO_BACKEND_SECRET`) ; elles sont stockées dans le `localStorage` du navigateur, propres à cet appareil. |
