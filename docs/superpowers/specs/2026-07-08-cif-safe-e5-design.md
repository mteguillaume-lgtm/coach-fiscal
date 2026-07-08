# Reformulation CIF-safe des leviers (audit E5) — Design

> Statut : validé par Guillaume le 2026-07-08 (3 familles, reformulation ciblée + mention centralisée + verrou).
> Réf. audit : `docs/audit-2026-07-complet.md` §6.1 (élevée E5).
> **Ce document est le livrable à soumettre à l'avocat** (table avant/après complète).
> ⚠️ La validation juridique reste indispensable avant commercialisation — ce correctif
> réduit l'exposition, il ne constitue pas un avis de conformité.

## Problème

Les leviers du détecteur d'opportunités sont formulés à l'impératif décisionnel
(« Verser 4 200 € sur votre PER », « Cocher la case 2OP », « Ouvrir un PEA »…) :
recommandation personnalisée d'investissement — la zone grise CIF/ORIAS/AMF identifiée
par l'audit. Deux aggravants découverts au cadrage : des **noms d'établissements bancaires**
cités (levier LEP) et des **seuils RFR LEP en dur** (34 393 € / 22 419 € — violation
paperasse-first résiduelle).

## Principe : trois familles, trois traitements

| Famille | Traitement |
|---|---|
| **Décision d'investissement** (10 leviers) | Reformulation conditionnelle « À étudier : … », chiffrage conservé, décision explicitement rendue à l'utilisateur |
| **Aide déclarative/administrative** (2047, 3916 bis, RIB, taux PAS, reçus fiscaux, 3VH) | Inchangés — aide à l'obligation déclarative, pas du conseil en investissement |
| **Routage professionnel** (notaire, avocat fiscaliste, expert-comptable, CGP) | Inchangés — déjà la bonne posture |

Les champs `questionChat` (questions à la voix de l'utilisateur vers le chat) sont conservés —
à signaler à l'avocat pour avis (l'utilisateur y demande parfois « quels courtiers »).
Les `titre`/`description` restent factuels (détection + chiffrage) ; seuls les `action`
décisionnels changent, plus les retraits ci-dessous.

## Table avant/après (champs `action` de `src/lib/opportunitiesDetector.js`)

1. **PER optimal** (`per_optimal`)
   - Avant (couple) : `D1 (plus imposé·e, plafond X €) : verser Y € en priorité — puis D2 : Z € avant le 31/12`
   - Après (couple) : `À étudier : un versement de Y € par D1 (plus imposé·e, plafond X €) avant le 31/12 — puis Z € par D2 — réduirait l'IR d'environ E €. Décision à valider selon votre situation (blocage jusqu'à la retraite sauf cas légaux de déblocage).`
   - Avant (solo) : `Verser X € sur votre PER avant le 31/12 (plafond max : P €)`
   - Après (solo) : `À étudier : un versement de X € avant le 31/12 (plafond disponible P €) réduirait l'IR d'environ E €. Décision à valider selon votre situation (blocage jusqu'à la retraite sauf cas légaux de déblocage).`
2. **Arbitrage 2OP — vers barème** (`arbitrage_pfu_bareme`, branche 2op)
   - Avant : `Cocher la case 2OP lors de la déclaration — l'option est GLOBALE (dividendes + intérêts + PV), annuelle et irrévocable pour l'année.`
   - Après : `À étudier : l'option barème (case 2OP) serait plus avantageuse d'environ E €. Option GLOBALE (dividendes + intérêts + PV), annuelle et irrévocable — à valider avant de cocher.`
3. **Arbitrage 2OP — vers PFU** (même levier, sens inverse)
   - Avant : `Ne pas cocher la case 2OP cette année : le PFU 30 % est plus avantageux sur l'ensemble de vos revenus du capital.`
   - Après : `À étudier : ne pas cocher la case 2OP cette année — le PFU 30 % serait plus avantageux d'environ E € sur l'ensemble de vos revenus du capital.`
4. **Arbitrage 2OP — fallback anciens profils**
   - Avant : `Cocher la case 2OP (imposition au barème) lors de la déclaration — attention : l'option est GLOBALE pour tous les revenus du capital de l'année et irrévocable.`
   - Après : `À étudier : l'option barème (case 2OP) serait plus avantageuse. Option GLOBALE pour tous les revenus du capital de l'année et irrévocable — à valider avant de cocher.`
5. **Plafonnement niches — étalement** (`plafonnement_niches`)
   - Avant : `Étaler les investissements défiscalisants sur plusieurs années ou privilégier les dispositifs hors plafond (Malraux, déficit foncier) / la déduction PER.`
   - Après : `À étudier : étaler les investissements défiscalisants sur plusieurs années, ou examiner les dispositifs hors plafond (Malraux, déficit foncier) et la déduction PER.`
6. **Sortie de dispositif fermé** (`defisc_ferme` / Pinel)
   - Avant : `Anticiper la sortie : à l'échéance Pinel, arbitrer entre conservation, revente ou passage en location nue/meublée. Pour Censi-Bouvard, bascule possible en LMNP réel.`
   - Après : `À étudier à l'échéance : conservation, revente ou passage en location nue/meublée (Pinel) ; bascule possible en LMNP réel (Censi-Bouvard). Un CGP peut chiffrer chaque scénario.`
7. **Plan de réallocation épargne** (`epargne_mal_remuneree`)
   - Avant : `1. Saturer LDDS (X €) — … | 2. Ouvrir AV multisupport…` (liste impérative) ; fallback `Identifier le surplus…, puis alimenter LDDS/LEP saturés, AV, PEA`
   - Après : préfixe de cadrage `À étudier (ordre indicatif) : ` devant la liste ; fallback `À étudier : identifier le surplus au-delà de 3-6 mois de charges, puis envisager LDDS/LEP saturés, AV, PEA.`
   - Les items du plan gardent leurs verbes (gouvernés par le cadrage), mais `Ouvrir/Renforcer` deviennent `ouvrir/renforcer` (minuscule, sous le cadrage).
8. **Décision PEL** (`pel_decision`)
   - Avant : `Arbitrer fin de l'avant-dernière année : conserver le PEL comme matelas garanti, ou clôturer pour basculer vers AV multisupport (fiscalité plus douce après 8 ans, meilleur rendement LT)`
   - Après : `À étudier avant la fin de l'avant-dernière année : conserver le PEL comme matelas garanti, ou le clôturer au profit d'une AV multisupport (fiscalité plus douce après 8 ans). Les deux scénarios se chiffrent selon votre horizon.`
9. **PEA non ouvert** (`pea_non_ouvert`)
   - Avant : `Ouvrir un PEA (chacun) (même avec 1 €) pour faire partir le délai de 5 ans dès maintenant`
   - Après (solo) : `À étudier : ouvrir un PEA même avec un versement symbolique ferait courir le délai fiscal de 5 ans dès maintenant (« prendre date »).`
   - Après (couple) : `À étudier : ouvrir un PEA chacun, même avec un versement symbolique, ferait courir le délai fiscal de 5 ans dès maintenant (« prendre date »).`
10. **LEP accessible** (`lep_non_ouvert`)
    - Avant : `Ouvrir un LEP à La Banque Postale, Caisse d'Épargne ou votre banque` / `Ouvrir un LEP chacun (La Banque Postale, Caisse d'Épargne…) — plafond 10 000 €/personne`
    - Après (solo) : `À étudier : le LEP est ouvert dans la plupart des banques sur justificatif d'éligibilité (avis d'imposition).` — **noms d'établissements retirés**
    - Après (couple) : `À étudier : un LEP par personne (plafond 10 000 € chacun), ouvert dans la plupart des banques sur justificatif d'éligibilité.`

## Mention centralisée

- Nouvelle constante dans `src/lib/conseilPatrimonial.js` :

```js
export const MENTION_NON_CONSEIL =
  'Pistes pédagogiques chiffrées à partir de vos données — pas un conseil en '
  + 'investissement personnalisé. Chaque décision est à valider selon votre '
  + 'situation, le cas échéant avec un professionnel.';
```

- Affichée UNE fois en tête du composant `OpportunitiesPanel` (rendu partout où le panneau
  apparaît : Opportunités, Profile). Pas de répétition par carte.

## Paperasse-first (prise au passage)

- Seuils RFR d'éligibilité LEP (`34_393` / `22_419` en dur, opportunitiesDetector) →
  `src/data/epargne-reglementee.json` (`lep.seuil_rfr_celibataire` / `seuil_rfr_couple`,
  source service-public/legifrance, valeurs 2025), exportés par taxCalculator
  (`SEUIL_RFR_LEP_SOLO` / `SEUIL_RFR_LEP_COUPLE`).
- Verrou `paperasse-first.test.js` : motif `/\b(?:34_393|22_419)\b/` ajouté.

## Verrou anti-régression CIF

Nouveau test `src/lib/__tests__/cif-safe.test.js` : scan STATIQUE de la source
`opportunitiesDetector.js` — aucune chaîne `action:` ne doit COMMENCER par un verbe
d'ordre décisionnel (`Verser|Cocher|Ouvrir|Clôturer|Saturer|Investir|Basculer|Arbitrer|Étaler|Anticiper`).
Les impératifs déclaratifs/routage (`Reporter|Déclarer|Vérifier|Conserver|Consulter|
Rédiger|Augmenter|Comparer|Identifier|Concentrer`) restent autorisés — liste blanche documentée.
(Le verbe interdit en MILIEU de phrase sous cadrage « À étudier : … » est autorisé — seul
le début de chaîne est contrôlé.)

## Tests

1. `cif-safe.test.js` : verrou statique ci-dessus + `MENTION_NON_CONSEIL` non vide.
2. Seuils LEP : export = valeurs JSON ; levier `lep_non_ouvert` se déclenche/s'éteint aux
   bons RFR (profil fixture, RFR sous/au-dessus du seuil).
3. Non-régression : les tests existants qui matchent les textes des leviers (`arbitrage-2op.test.js`
   assertions `/PFU/`, `/barème/` sur titre+action) doivent rester verts — les reformulations
   conservent ces mots.
4. Suite complète (744) verte.

## Hors périmètre

- Textes déterministes du Rapport et du Simulator (pédagogiques, revue avocat globale).
- `questionChat` (voix utilisateur) — signalés pour avis avocat, non modifiés.
- masterPrompt/chat (le DISCLAIMER_GLOBAL et la posture « oriente vers un professionnel »
  existent déjà côté chat).
