# Design — Module Patrimoine & agrégation bancaire (GoCardless + saisie manuelle)

**Date :** 2026-07-10
**Statut :** Validé (brainstorming), prêt pour plan d'implémentation
**Auteur :** Guillaume Martine (+ Claude)

## Contexte & objectif

Kapio est aujourd'hui **100 % client-side, sans backend**, avec une posture vie-privée
forte (anonymisation PDF, clé API en local, aucune donnée sortante). L'utilisateur
souhaite un **dashboard patrimoine dynamique** reflétant l'état de ses comptes « à
l'instant T », avec un **bouton Actualiser dans Kapio**, sur **4+ banques** (la saisie
de chaque compte courant est trop fastidieuse), et faisant remonter ses placements
(PEA, assurance-vie).

### La contrainte fondamentale (le trilemme)

Aucune solution ne réunit *gratuit + simple + PEA/AV en auto + 4 banques* :

- La **DSP2 ne couvre que les comptes de paiement** (courants, souvent livrets). **PEA,
  assurance-vie, PER n'entrent PAS dans son périmètre** — seuls des connecteurs
  propriétaires **payants** (Powens, Bridge) les atteignent en automatique.
- Les agrégateurs riches (Bridge, Powens) sont **B2B, sur devis**, pas garantis pour un
  particulier.
- Finary agrège tout mais est **plafonné à ~3 établissements** en gratuit (→ ~14 €/mois
  au-delà, incompatible avec 4+ banques).
- woob (open-source) couvre PEA/AV gratuitement mais impose **terminal, install Python,
  identifiants confiés à l'outil, validation téléphone à chaque rafraîchissement** — à
  l'opposé de « simple ».

**Arbitrage retenu** (priorité utilisateur = simplicité + rafraîchissement dans Kapio) :
automatiser gratuitement et simplement le **fastidieux** (comptes/livrets des 4 banques
via GoCardless), et **saisir manuellement** le **peu et lent** (1-3 PEA/AV/PER).

## Décisions validées

| Décision | Choix retenu |
|---|---|
| Architecture | SPA Kapio + backend minimal (2 Vercel Functions) pour GoCardless uniquement |
| Source auto | **GoCardless Bank Account Data** (ex-Nordigen) — gratuit, self-service particulier, DSP2 |
| Périmètre auto | Comptes courants + livrets / épargne réglementée (ce que la DSP2 expose) |
| Placements (PEA/AV/PER) | **Saisie manuelle** (peu nombreux, valeur lente) |
| Prêts / immobilier | **Saisie manuelle** (hors périmètre DSP2 gratuit) |
| Adaptateur | `BankProvider` multi-sources (GoCardless + Manuel), extensible (woob plus tard) |
| Consentement | GoCardless requisition → écran sécurisé banque (SCA), multi-banques, re-consentement ~90 j |
| Données | Snapshot normalisé **sans transactions détaillées** au démarrage (YAGNI) |
| Historique | Instantanés (date + totaux) **en local** (localStorage) pour le graphe d'évolution |
| Auth backend | **Jeton secret perso** (posé une fois dans Kapio, comme la clé API) |
| Sécurité | `secret_id`/`secret_key` GoCardless + jeton chiffrés côté serveur uniquement ; pas d'IBAN complet au front |
| Mode couple | Chaque poste rattaché à un propriétaire (`d1`/`d2`/`joint`) ; dashboard consolidé foyer + par personne |

## Architecture

```
                      ┌─ Saisie manuelle (PEA, AV, PER, prêts, immo) ─┐
                      │        stockée en localStorage                 │
                      └───────────────────────┬────────────────────────┘
                                              │
┌─ Banque (écran sécurisé SCA) ─┐            │  (fusion en un patrimoine unique)
└──────────────┬─────────────────┘            │
               ↕                              │
   ┌─ GoCardless Bank Account Data (DSP2) ─┐  │
   └───────────────┬────────────────────────┘ │
                   ↕  jeton d'accès            │
   ┌─ Backend Kapio (2 Vercel Functions) ─┐    │
   │  • détient secret_id / secret_key      │  │   ← jamais exposés au navigateur
   │  • stocke la requisition/jeton chiffré │  │
   │  • normalise → JSON comptes            │  │
   └───────────────┬────────────────────────┘  │
                   ↕  snapshot comptes (JSON)    │
   ┌─ Kapio SPA (navigateur) ────────────────────┴──────────┐
   │  • src/lib/providers/bank/ (adaptateur multi-sources)   │
   │  • src/lib/patrimoine/ (calculs purs)                   │
   │  • page /patrimoine : dashboard + saisie manuelle       │
   │  • snapshot + saisies + historique en localStorage      │
   └─────────────────────────────────────────────────────────┘
```

**Principe directeur :** le backend est **le plus petit possible** et n'existe que pour
GoCardless (secret + jeton, qui ne peuvent pas vivre dans un navigateur). Tout le reste
— saisie manuelle, calculs, dashboard, historique — reste **client-side**. Le navigateur
ne détient **jamais** de secret GoCardless ni les identifiants bancaires (SCA côté banque).

### Composants nouveaux

1. **Backend minimal — 2 fonctions serverless (Vercel Functions)**
   - `POST /api/bank/connect` → crée une *requisition* GoCardless pour une banque
     choisie (`institution_id`), renvoie l'URL de consentement. Paramètre `owner`
     (`d1`/`d2`/`joint`) pour le mode couple.
   - `GET /api/bank/snapshot` → parcourt les requisitions valides, récupère
     comptes + soldes, normalise, renvoie le JSON.
   - `secret_id` / `secret_key` GoCardless et jetons vivent **uniquement** ici.
   - (Optionnel) `GET /api/bank/institutions?country=fr` → liste des banques pour l'UI
     de sélection, en proxy de GoCardless.

2. **Adaptateur `BankProvider` multi-sources** (`src/lib/providers/bank/`) — même pattern
   que les providers IA (`src/lib/providers/`). Interface générique agnostique + deux
   implémentations initiales : `gocardless.js` (via le backend) et `manual.js` (lecture
   des saisies localStorage). Les deux produisent le **même format normalisé**, fusionné
   en un patrimoine unique. **woob** pourra être ajouté plus tard comme 3ᵉ source sans
   toucher au reste.

3. **Module Patrimoine** (`src/lib/patrimoine/`) — fonctions **pures sans effet de bord**
   (comme `taxCalculator.js`) : valeur nette, répartition, consolidation foyer. Découplé
   du calcul fiscal (le profil fiscal reste la source de vérité pour l'impôt).

4. **Page `/patrimoine`** — dashboard + formulaire de saisie manuelle + gestion des
   connexions bancaires. Guard : jeton perso présent (pour la partie auto).

## Flux de consentement (GoCardless)

### Première connexion (par banque)

```
1. Clic « Connecter une banque » sur /patrimoine → choix de la banque (liste GoCardless)
2. Navigateur → POST /api/bank/connect { institution_id, owner }
3. Backend crée l'accord + la requisition GoCardless, renvoie le lien de consentement
4. Redirection vers l'écran SÉCURISÉ de la banque (SCA)
5. GoCardless redirige vers Kapio (/patrimoine?ref=<requisition_id>)
6. Navigateur → GET /api/bank/snapshot → backend récupère comptes + soldes → JSON
7. Dashboard mis à jour
```

- Les **identifiants bancaires ne transitent jamais** par Kapio ni le backend
  (uniquement entre l'utilisateur, GoCardless et la banque). Le backend ne détient que
  la *requisition* / le jeton fournis par GoCardless.
- **Multi-banques** : répéter « Connecter une banque » pour chacune (une requisition par
  banque, taguée `owner`).
- **Re-consentement DSP2 (~90 j)** : accès valable ~90 jours ; au-delà, statut
  `needs_reconnect` sur la banque concernée → bouton « Reconnecter » (re-valider la SCA).

### Rafraîchissement

Bouton **« Actualiser »** sur `/patrimoine` → `GET /api/bank/snapshot`. Rafraîchissement
**à la demande** (pas d'appel automatique), pour maîtriser les quotas GoCardless.

## Modèle de données (snapshot normalisé)

Format **stable et agnostique** (indépendant de la source : GoCardless, manuel, ou woob
plus tard). `type` = vocabulaire Kapio ; chaque adaptateur fait la traduction.

```jsonc
{
  "generatedAt": "2026-07-10T14:32:00Z",
  "positions": [
    {
      "id": "gc-acc-1",
      "source": "gocardless",        // gocardless | manual | woob(futur)
      "bank": "BNP Paribas",
      "type": "checking",            // checking|savings|life_insurance|pea|securities|per|loan|real_estate
      "label": "Compte courant",
      "value": 3250.42,              // positif = actif ; négatif = dette
      "currency": "EUR",
      "iban_last4": "1234",          // jamais l'IBAN complet côté navigateur
      "owner": "d1",                 // d1 | d2 | joint (toujours "d1" en solo)
      "updatedAt": "2026-07-10T14:32:00Z",
      "manual": false                // true pour les saisies manuelles
    },
    {
      "id": "man-pea-1",
      "source": "manual",
      "bank": "Boursorama",
      "type": "pea",
      "label": "PEA",
      "value": 42000.00,
      "currency": "EUR",
      "owner": "d1",
      "updatedAt": "2026-07-01T00:00:00Z",
      "manual": true
    }
  ]
}
```

**Minimisation :** on ne fait remonter au navigateur que soldes, type, `iban_last4`,
propriétaire. **Pas de transactions détaillées** au démarrage. Ajout possible plus tard
si besoin réel.

## Saisie manuelle (PEA, AV, PER, prêts, immobilier)

- Formulaire simple sur `/patrimoine` : type, libellé, banque/organisme, valeur,
  propriétaire (`d1`/`d2`/`joint`), date de mise à jour.
- Stockée en **localStorage** (dédié patrimoine, distinct du profil fiscal), persistée
  entre sessions. Éditable/supprimable.
- Fusionnée avec le snapshot GoCardless dans la vue consolidée. Un badge « saisi le … »
  et un rappel doux si une valeur manuelle est ancienne (> 3 mois).

## Module Patrimoine (calculs)

Fonctions pures dans `src/lib/patrimoine/`, testables sans réseau :

- **Valeur nette** = Σ `value` de tous les postes (les dettes sont négatives)
- **Actifs** = postes à `value` > 0 ; **Dettes** = postes à `value` < 0
- **Répartition** par banque/organisme et par type d'actif
- **Cas limites** : dette seule, aucun poste, devise ≠ EUR (affichée telle quelle, pas
  de conversion au démarrage)

### Mode couple

Kapio a déjà `mode: solo | couple` (`d1Data`/`d2Data` dans `AppContext`) :

- **Rattachement** : chaque poste (auto ou manuel) porte un `owner` (`d1`/`d2`/`joint`).
  Côté auto, l'`owner` vient de la requisition ; chaque membre fait **sa propre SCA**.
- **Consolidation** : patrimoine net **du foyer** + répartition par personne (d1/d2/joint).
  En solo, tout est `d1` et la dimension propriétaire est masquée.
- **Backend perso mono-secret** : un seul `KAPIO_BACKEND_SECRET` pour le foyer ; les
  connexions des deux membres cohabitent, distinguées par `owner`.

### Historique local

À chaque actualisation, un instantané **léger** (date + totaux : valeur nette, actifs,
dettes — sans détail sensible) est stocké en localStorage. Alimente le graphe d'évolution.
Limite assumée : effacé si l'utilisateur vide le navigateur.

## Dashboard `/patrimoine`

Réutilise Recharts (déjà présent) et les conventions Kapio.

```
┌──────────────────────────────────────────────────────────┐
│  Patrimoine net : 142 850 €        [↻ Actualiser]  10/07  │
│  Actifs 327 150 €   −   Dettes 184 300 €                   │
├──────────────────────────┬───────────────────────────────┤
│  Répartition (donut)     │  Évolution valeur nette (aire) │
├──────────────────────────┴───────────────────────────────┤
│  Comptes (auto, par banque, repliable) — état ✅/⚠/⛔     │
├────────────────────────────────────────────────────────────┤
│  Placements & prêts (saisie manuelle) [+ Ajouter]          │
│   PEA 42 000 € · MàJ 01/07   AV 45 000 € · MàJ 01/07       │
└────────────────────────────────────────────────────────────┘
```

- **États par banque** : ✅ à jour / ⚠ à reconnecter / ⛔ erreur, avec bouton adéquat.
- **Mode couple** : en-tête = patrimoine net **du foyer** ; segmentation par membre.
  Masquée en solo.
- **Écran vide** : si aucune source → accueil « Connecte ta première banque » + « Ajoute
  un placement ».
- **Format FR** partout via `toLocaleString('fr-FR')` (jamais `.toFixed()` ni séparateurs
  codés en dur).

## Sécurité

Non négociable :

- `secret_id` / `secret_key` GoCardless → variables d'environnement Vercel, **jamais**
  côté navigateur.
- Requisition / jeton d'accès → **chiffrés au repos** (clé en variable d'env), dans
  Upstash Redis.
- HTTPS partout (natif Vercel). Pas d'IBAN complet renvoyé au navigateur.
- **Auth backend (perso, évolutif)** : un **jeton secret perso** (secret aléatoire long)
  posé une fois dans Kapio — stocké en localStorage comme la clé API — envoyé à chaque
  appel. Les fonctions rejettent tout appel sans ce jeton. Suffisant pour un foyer ;
  migration vers une vraie auth (passkey/magic link) possible sans refonte du front.

## Stratégie de tests (Vitest, conventions Kapio)

- **Adaptateur/normaliseur GoCardless** : tests unitaires avec fixtures de réponses
  GoCardless → snapshot normalisé (comme les tests de plugins). Aucun réseau.
- **Adaptateur manuel** : saisie localStorage → postes normalisés.
- **Calculateur patrimoine** : fonctions pures (valeur nette, répartition, consolidation
  couple, cas limites).
- **Fonctions backend** : logique de normalisation extraite en module pur et testée ;
  appels HTTP GoCardless mockés.
- **Dashboard** : tests composant (Testing Library) — états vide / à jour / à reconnecter,
  fusion auto+manuel.

## Variables d'environnement (backend)

- `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY` — identifiants API GoCardless.
- `TOKEN_ENCRYPTION_KEY` — clé de chiffrement des requisitions/jetons au repos.
- `KAPIO_BACKEND_SECRET` — jeton secret perso attendu à chaque appel.
- `UPSTASH_REDIS_*` — connexion au stockage.

## Hors périmètre (démarrage)

- Transactions détaillées / catégorisation de dépenses.
- Auth multi-utilisateurs complète (jeton perso suffit pour le foyer).
- Historique côté serveur / multi-appareils.
- Conversion de devises.
- **woob** comme source auto pour PEA/AV : porte laissée ouverte dans l'adaptateur, mais
  non implémentée (YAGNI — 1-3 placements se saisissent à la main plus simplement).
- Intégration du patrimoine dans le calcul fiscal (reste un domaine séparé pour l'instant).

## Points à confirmer à l'implémentation

- Détails exacts du flux GoCardless Bank Account Data (endpoints agreements /
  requisitions / accounts / balances, quotas du tier gratuit).
- Couverture réelle des **livrets** (vs comptes courants seuls) selon les 4 banques.
- Choix du stockage (Upstash Redis vs alternative) et détails du chiffrement.
- Hébergement du backend (Vercel Functions) et intégration au build Vite existant.
```
