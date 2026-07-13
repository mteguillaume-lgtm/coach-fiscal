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
