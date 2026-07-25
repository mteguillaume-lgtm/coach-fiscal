# Synchronisation bancaire — tutoriel complet

> **Pour qui** : débutant, pas à pas, sans rien supposer d'acquis.
> **Durée** : environ 1 h la première fois. Prévoyez d'être au calme.
> **Coût** : 0 €. Les trois services utilisés ont une offre gratuite suffisante.

À la fin, la page Patrimoine de Kapio affichera les soldes de vos comptes
courants et livrets — les vôtres et ceux de votre conjoint·e — actualisés d'un
clic.

---

## Avant de commencer : comprendre ce qu'on monte

Trois services entrent en jeu. Ça paraît beaucoup, mais chacun a un rôle simple :

| Service | Rôle | Pourquoi on ne peut pas s'en passer |
|---|---|---|
| **Enable Banking** | Parle aux banques à votre place | C'est un prestataire agréé. Seuls les acteurs agréés ont le droit d'interroger les API bancaires. |
| **Vercel** | Héberge un petit bout de code serveur | La clé privée qui prouve votre identité auprès d'Enable Banking ne doit **jamais** se trouver dans un navigateur. Il faut donc un serveur. |
| **Upstash** | Petite base de données | Le serveur doit se souvenir des connexions bancaires ouvertes entre deux visites. |

Le schéma :

```
Votre navigateur (Kapio)
        │  « donne-moi mes soldes »  + jeton secret perso
        ▼
Backend Kapio (Vercel)  ──── clé privée RSA ────►  Enable Banking  ────►  Vos banques
        │
        └── Upstash Redis (ids de session uniquement)
```

**Ce qui n'existe nulle part dans cette chaîne : vos identifiants bancaires.**
Vous ne les taperez jamais dans Kapio. Vous les taperez uniquement sur le site de
votre banque, comme d'habitude.

### Le mode couple — la question à clarifier tout de suite

**Vous n'avez besoin que d'UNE seule application Enable Banking**, pas de deux
comptes. C'est une confusion fréquente.

En revanche, **chaque personne doit s'authentifier auprès de sa propre banque**,
et ce à deux moments distincts :

1. **Au moment de « lier » les comptes** dans le portail Enable Banking (étape 8).
   C'est ce qui autorise l'application à voir ces comptes-là.
2. **Au moment de connecter la banque dans Kapio** (étape 10), en choisissant le
   titulaire « Déclarant 2 ».

Concrètement : votre conjoint·e n'a rien à créer ni à configurer. Elle/il doit
juste être disponible avec son téléphone à deux moments, pour valider
l'authentification forte de sa banque.

> ⚠️ **Point non tranché, à vérifier vous-même.** La documentation d'Enable
> Banking parle de lier « vos propres comptes » et d'un « usage individuel non
> commercial », mais **n'aborde jamais explicitement le cas du conjoint**. Ce
> n'est ni autorisé ni interdit noir sur blanc. Si vous voulez être certain avant
> d'investir du temps, écrivez à `sales@enablebanking.com` — une question simple
> du type : *« Puis-je lier les comptes de ma conjointe, avec son consentement,
> à mon application en restricted production pour un usage strictement
> personnel ? »*
>
> En attendant la réponse, vous pouvez tout à fait monter l'installation avec vos
> seuls comptes et ajouter ceux de votre conjoint·e ensuite : rien n'est à refaire.

---

## Ce qu'il vous faut sous la main

- L'URL de votre Kapio déployé : **`https://kapio-coach.vercel.app`**.

  > ⚠️ Attention : le projet Vercel s'appelle `coach-fiscal`, mais son domaine de
  > production est `kapio-coach.vercel.app`. **`kapio.vercel.app` appartient à
  > quelqu'un d'autre** — s'y tromper fait échouer toute la configuration de façon
  > incompréhensible. Pour retrouver la bonne URL en cas de doute : tableau de bord
  > Vercel → projet `coach-fiscal` → l'adresse affichée sous **Domains**.
- Vos identifiants bancaires (à taper **uniquement** sur le site de vos banques).
- Votre téléphone, pour l'authentification forte.
- Le téléphone de votre conjoint·e, pour les étapes 8 et 10.
- Un terminal (l'application « Terminal » sur Mac). Deux commandes à copier-coller,
  pas plus.

---

## Étape 1 — Créer la base de données (Upstash)

1. Allez sur [upstash.com](https://upstash.com) et créez un compte (connexion
   possible avec GitHub ou Google).
2. Cliquez sur **Create Database**.
3. Choisissez :
   - un nom, par exemple `kapio-patrimoine` ;
   - le type **Regional** ;
   - une région proche, par exemple **eu-west-1 (Ireland)** ;
   - le plan **Free**.
4. Une fois la base créée, ouvrez-la et descendez jusqu'à la section
   **REST API**.
5. Copiez les deux valeurs et collez-les quelque part temporairement (une note) :
   - `UPSTASH_REDIS_REST_URL` — ressemble à `https://eu1-xxx-xxxxx.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN` — une longue chaîne de caractères

> ✅ **Vérification** : vous avez deux valeurs, l'une commençant par `https://`,
> l'autre étant une longue suite de caractères. Si vous ne voyez que « UPSTASH_REDIS_URL »
> (sans `REST`), vous regardez la mauvaise section — cherchez bien **REST API**.

---

## Étape 2 — Fabriquer votre jeton secret

C'est un mot de passe que vous inventez, qui protège votre backend. Personne
d'autre que vous ne le connaîtra.

Ouvrez le Terminal et tapez :

```bash
openssl rand -hex 32
```

Vous obtenez une longue suite de chiffres et de lettres. **Copiez-la dans votre
note temporaire**, à côté des valeurs Upstash. Ce sera votre
`KAPIO_BACKEND_SECRET`.

> ✅ **Vérification** : vous avez une chaîne de 64 caractères, uniquement des
> chiffres et des lettres de a à f.

---

## Étape 3 — Créer votre compte Enable Banking

1. Allez sur [enablebanking.com](https://enablebanking.com) et créez un compte.
2. Ouvrez le **Control Panel** (le tableau de bord).
3. Dans le menu du haut, trouvez la page des **applications** (« API applications »).

Ne créez pas encore l'application — lisez d'abord l'étape suivante, qui contient
le piège principal.

---

## Étape 4 — Créer l'application (l'étape où l'on bloque)

Cliquez sur le bouton pour enregistrer une nouvelle application. Un formulaire
s'ouvre.

**Choisissez l'environnement `Production`**, pas `Sandbox`. Le sandbox ne
contient que des fausses banques avec de fausses données — il ne sert à rien pour
votre usage réel.

C'est là que ça coince habituellement : **le formulaire Production exige plus de
champs que le Sandbox**, dont deux URL de documents juridiques que la plupart des
gens n'ont pas.

Bonne nouvelle : **ces deux pages existent déjà dans votre Kapio.** Elles ont été
créées pour ça (`public/confidentialite.html` et `public/conditions.html`).

Remplissez le formulaire ainsi :

| Champ du formulaire | Valeur à saisir |
|---|---|
| **Application name** | `Kapio` |
| **Description** | `Application personnelle de suivi fiscal et patrimonial. Consultation en lecture seule des soldes de mes propres comptes.` (ce texte est affiché à vous-même pendant le consentement bancaire) |
| **Data protection email** | votre adresse e-mail |
| **Privacy policy URL** | `https://kapio-coach.vercel.app/confidentialite.html` |
| **Terms of service URL** | `https://kapio-coach.vercel.app/conditions.html` |
| **Redirect URL** | `https://kapio-coach.vercel.app/patrimoine` |

> ⚠️ **Le champ Redirect URL est celui qui pardonne le moins.** Il doit
> correspondre **exactement**, au caractère près, à l'adresse où votre banque vous
> renverra. Pas de barre oblique finale, pas de `www`, et obligatoirement `https`.
> Si vous vous trompez, la connexion échouera au retour de la banque avec un
> message peu explicite.

**Pour la clé privée**, laissez l'option par défaut : **« générer la clé dans le
navigateur »**. Elle sera fabriquée sur votre ordinateur et ne sera jamais
transmise à Enable Banking.

Cliquez sur **Register**.

### Deux choses à récupérer immédiatement

1. **Le fichier `.pem` est tombé dans votre dossier Téléchargements.**
   ⚠️ Il ne sera **plus jamais affiché**. Si vous le perdez, il faudra recréer une
   application. Mettez-le en lieu sûr tout de suite.
2. **L'Application ID** est un identifiant au format UUID
   (`a1b2c3d4-e5f6-...`). Astuce utile : **le fichier `.pem` téléchargé porte
   exactement ce nom.** Si vous perdez l'ID, il est écrit sur le fichier.

> ✅ **Vérification** : dans le Control Panel, votre application apparaît avec le
> statut **« Inactive »**. C'est normal — on l'activera à l'étape 8.
>
> ⚠️ **Ne jamais mettre le fichier `.pem` dans le dossier du projet Kapio.** Il
> partirait sur GitHub au prochain envoi. Gardez-le dans vos Documents ou dans un
> gestionnaire de mots de passe.

---

## Étape 5 — Convertir la clé privée en une seule ligne

Vercel ne peut pas stocker un fichier, seulement du texte. On transforme donc la
clé en une longue ligne unique.

Dans le Terminal, remplacez le chemin par celui de votre fichier :

```bash
base64 -i ~/Downloads/VOTRE-FICHIER.pem | tr -d '\n' | pbcopy
```

Cette commande encode la clé et **la copie directement dans votre presse-papiers**.

Astuce pour ne pas se tromper de chemin : tapez `base64 -i ` (avec l'espace), puis
**glissez-déposez le fichier `.pem` depuis le Finder dans la fenêtre du Terminal** —
le chemin s'écrit tout seul. Complétez ensuite avec ` | tr -d '\n' | pbcopy`.

> ✅ **Vérification** : collez le résultat dans une note. Vous devez voir une très
> longue ligne continue de lettres et de chiffres, **sans aucun retour à la
> ligne**, et **sans** les mentions `-----BEGIN PRIVATE KEY-----`. Si vous voyez
> `BEGIN`, l'encodage n'a pas eu lieu.

---

## Étape 6 — Renseigner les variables sur Vercel

> Le guide précédent proposait des commandes `vercel env add`. Elles supposent le
> CLI Vercel installé et le projet lié en local — ce qui n'est pas votre cas.
> **On passe donc par le site web, qui fait exactement la même chose.**

1. Allez sur [vercel.com](https://vercel.com) et ouvrez votre projet Kapio.
2. Onglet **Settings** → rubrique **Environment Variables**.
3. Ajoutez les **six** variables ci-dessous, une par une. Pour chacune :
   collez le nom, collez la valeur, cochez l'environnement **Production**, puis
   **Save**.

| Nom | Valeur |
|---|---|
| `ENABLE_BANKING_APP_ID` | l'Application ID (UUID) de l'étape 4 |
| `ENABLE_BANKING_PRIVATE_KEY` | la longue ligne base64 de l'étape 5 |
| `KAPIO_BACKEND_SECRET` | le jeton de l'étape 2 |
| `APP_ORIGIN` | `https://kapio-coach.vercel.app` |
| `UPSTASH_REDIS_REST_URL` | valeur Upstash de l'étape 1 |
| `UPSTASH_REDIS_REST_TOKEN` | valeur Upstash de l'étape 1 |

> ⚠️ **`APP_ORIGIN` s'arrête au nom de domaine** : pas de `/patrimoine` à la fin,
> pas de barre oblique finale. C'est le code qui ajoute `/patrimoine` tout seul.
> Une erreur ici, et la redirection au retour de la banque ne tombera pas au bon
> endroit.

> 💡 Si Upstash vous a proposé une intégration Vercel automatique, les deux
> variables `UPSTASH_*` sont peut-être déjà présentes. Dans ce cas, ne les
> ajoutez pas une seconde fois.

---

## Étape 7 — Redéployer, puis vérifier que ça répond

**Les variables d'environnement ne sont prises en compte qu'au déploiement
suivant.** Tant que vous ne redéployez pas, rien ne fonctionnera — c'est une
source de blocage classique.

1. Onglet **Deployments** de votre projet.
2. Sur le déploiement le plus récent, menu « … » → **Redeploy**.
3. Attendez que le statut passe au vert (une à deux minutes).

Puis testez depuis le Terminal, en remplaçant `VOTRE_JETON` par le jeton de
l'étape 2 :

```bash
curl -s -H "x-kapio-secret: VOTRE_JETON" \
  "https://kapio-coach.vercel.app/api/bank/institutions?country=fr" | head -c 400
```

> ✅ **Vérification** : vous devez voir une liste de banques françaises
> (`{"institutions":[{"id":"FR::...`).
>
> Autres réponses possibles, et ce qu'elles signifient :
>
> | Réponse | Cause |
> |---|---|
> | `{"error":"Non autorisé"}` | Le jeton tapé ne correspond pas à `KAPIO_BACKEND_SECRET`. |
> | `... non configurés côté serveur` | Une variable manque, ou vous n'avez pas redéployé. |
> | `Enable Banking 401` | La clé privée est mal encodée (retour à la ligne resté) ou l'App ID est erroné. |
> | Page HTML au lieu de JSON | L'URL est incorrecte, ou le dossier `api/` n'est pas déployé dans ce projet. |

**Ne passez pas à la suite tant que cette commande ne renvoie pas la liste des
banques.** Tout le reste en dépend.

---

## Étape 8 — Activer l'application en liant vos comptes

Votre application est encore « Inactive ». Pour l'activer sans signer de contrat
commercial, Enable Banking propose le mode **Restricted Production** : vous
rattachez explicitement les comptes concernés, et l'application ne pourra jamais
voir autre chose.

1. Dans le Control Panel, ouvrez votre application.
2. Cliquez sur **« Activate by linking accounts »**.
3. Choisissez votre banque.
4. Vous êtes redirigé vers l'écran d'authentification de votre banque.
   Identifiez-vous et validez.
5. Confirmez le rattachement des comptes.

**Répétez l'opération pour chaque banque et chaque compte que vous voulez voir
dans Kapio** — y compris ceux de votre conjoint·e, qui devra s'authentifier
elle/lui-même sur le site de sa banque à ce moment-là.

> ⚠️ **Ce que vous ne liez pas ici sera invisible dans Kapio, définitivement.**
> C'est la cause nº 1 de « ma banque est connectée mais je ne vois qu'un seul
> compte ». Prenez le temps de tout cocher.

> ✅ **Vérification** : le statut de l'application passe de **« Inactive »** à
> **« Active »**.

---

## Étape 9 — Configurer Kapio

1. Ouvrez `https://kapio-coach.vercel.app/patrimoine`.
2. Dans l'encadré **« Synchronisation bancaire »**, renseignez :
   - **URL du backend** : `https://kapio-coach.vercel.app`
   - **Jeton secret** : celui de l'étape 2
3. Enregistrez.

> ✅ **Vérification** : le bouton **« Connecter une banque »** apparaît, et la
> liste déroulante des banques se remplit. Si elle reste vide, revenez à la
> vérification de l'étape 7.

> 💡 Cette configuration est stockée dans le navigateur. Elle est donc à refaire
> sur chaque appareil et chaque navigateur que vous utilisez.

---

## Étape 10 — Connecter les banques

1. Cliquez sur **« Connecter une banque »**.
2. Choisissez la banque **et le titulaire** : Déclarant 1, Déclarant 2, ou commun.
3. Vous êtes redirigé vers votre banque : authentifiez-vous et autorisez l'accès
   en lecture.
4. Au retour sur Kapio, la connexion se finalise automatiquement.
5. Actualisez : les comptes apparaissent.

Recommencez pour chaque banque. **Pour les comptes de votre conjoint·e :
choisissez « Déclarant 2 » et laissez-la/le s'authentifier.**

> ⚠️ Le titulaire choisi ici détermine à qui les montants seront attribués dans
> votre profil fiscal. Une erreur à ce niveau fausse la répartition entre
> déclarants — vérifiez avant de valider.

> ✅ **Vérification finale** : la page Patrimoine affiche vos comptes, regroupés
> par banque, avec les bons soldes.

---

## Ce qu'il faudra refaire, et à quelle fréquence

| Quand | Quoi |
|---|---|
| Tous les 180 jours au maximum | Reconnecter chaque banque (le consentement DSP2 expire). La banque concernée apparaît alors en erreur dans le bandeau. |
| Sur un nouvel appareil | Ressaisir l'URL du backend et le jeton (étape 9). |
| Jamais | Les étapes 1 à 8. Elles sont définitives. |

---

## Limites à connaître

- **Périmètre** : comptes courants et livrets uniquement — et encore, selon ce que
  chaque banque expose. **PEA, assurance-vie, PER et crédits ne sont pas
  synchronisables** : la réglementation DSP2 ne couvre que les « comptes de
  paiement ». Ce n'est pas une limite d'Enable Banking, c'est la loi, et ça ne
  changera pas avant 2027 au plus tôt. Ces produits restent en saisie manuelle.
  Voir `docs/patrimoine-sync-plan.md` pour les pistes à ce sujet.
- **Rafraîchissement** : environ 4 actualisations automatiques par jour et par
  compte, limite imposée par les banques.
- **Lecture seule** : Kapio ne peut initier aucun virement ni aucun paiement.
- **Restricted Production** : seuls les comptes liés à l'étape 8 sont accessibles.

---

## Dépannage

| Symptôme | Cause probable et solution |
|---|---|
| « Non autorisé » lors de l'actualisation | Le jeton saisi dans Kapio diffère de `KAPIO_BACKEND_SECRET`. Attention aux espaces collés par erreur. |
| La liste des banques reste vide | Refaites la vérification de l'étape 7 : le problème est côté backend, pas côté interface. |
| Erreur juste après « Connecter une banque » | `ENABLE_BANKING_APP_ID` ou `ENABLE_BANKING_PRIVATE_KEY` incorrect, **ou déploiement non refait** après l'ajout des variables. |
| `Enable Banking 401` | Clé privée mal encodée. Refaites l'étape 5 en vérifiant l'absence de retour à la ligne. |
| Retour de la banque sur une page blanche ou une erreur | L'URL de redirection déclarée dans le Control Panel ne correspond pas exactement à `APP_ORIGIN` + `/patrimoine`. |
| « Connexion inconnue ou expirée » au retour | Le lien de consentement a plus d'une heure. Relancez « Connecter une banque ». |
| Une banque en erreur dans le bandeau | Consentement expiré (180 j max). Reconnectez cette banque. |
| Banque connectée, mais des comptes manquent | Ces comptes n'ont pas été liés à l'étape 8. Retournez dans le Control Panel les rattacher. |
| Banque absente de la liste déroulante | Elle n'est pas couverte pour la France. Vérifiez avec la commande de l'étape 7. |
| Tout marchait, plus rien ne marche | Vérifiez d'abord la date d'expiration du consentement, puis relancez la commande de l'étape 7 pour situer la panne (backend ou interface). |

---

## En cas de blocage

Relancez la commande de vérification de l'étape 7 : elle sépare nettement les deux
moitiés du système. Si elle renvoie la liste des banques, le backend va bien et le
problème est côté navigateur ou côté consentement. Si elle échoue, le problème est
dans les variables d'environnement ou le déploiement — et le message d'erreur
renvoyé indique lequel.

---

## Notes de rédaction

Les libellés exacts du Control Panel Enable Banking (noms des boutons et des
champs) peuvent différer légèrement de ce guide selon les évolutions de leur
interface. La logique des étapes, elle, reste valable. Sources :
[Control Panel](https://enablebanking.com/docs/api/control-panel/) ·
[Linked accounts](https://enablebanking.com/docs/api/linked-accounts/) ·
[FAQ](https://enablebanking.com/docs/faq/)
