# Rachats d'assurance-vie (cases 2CG / 2BH) — Design

> Statut : validé par Guillaume le 2026-07-09 (part de gains fournie par l'assureur, cas dominant + routage des bords).
> Réf. audit : `docs/audit-2026-07-complet.md` §2.3 (priorité moyenne — rachats AV, le manque le plus fréquent pour la cible).

## Problème

La fiscalité des **rachats de vivant** d'assurance-vie n'est pas couverte : Collect n'a pas de
champ de rachat, aucune fonction de calcul, aucun plugin. Or les données (`assurance_vie_rachats`)
et les exports (`AV_ABATTEMENT_8ANS_SOLO/COUPLE`, `AV_TAUX_IR_APRES_8ANS`,
`AV_SEUIL_PRIMES_TAUX_REDUIT`) existent depuis le lot E5 — seule la chaîne
collecte→calcul→parsing→total→rapport manque.

## Décisions de cadrage (validées)

- **Entrée** : l'utilisateur saisit la **part de produits/gains imposable** du rachat, telle que
  fournie par l'assureur (IFU/relevé). Pas de recalcul de proportionnalité (cohérent avec
  l'approche IFU du reste de l'app).
- **Périmètre** : cas dominant calculé, bords signalés + routés.
- **Case 2042** : le référentiel projet `references/pea-assurance-vie.md` (source de vérité
  paperasse-first) donne **2CG** (gains au PFU) et **2BH** (gains au barème sur option) —
  **pas « 2CH »** comme l'écrivait le titre de l'audit. On suit le référentiel.

## Insight simplificateur (millésime 2025)

En 2025, un contrat dont des versements datent d'**avant le 27/09/2017** a nécessairement **≥ 8 ans**.
Le cas « < 8 ans + PFL dégressif 35/15 % » est donc **impossible cette année**. Le régime ne dépend
plus que de l'ancienneté du contrat → deux branches exactes, et le champ « versements après 2017 »
devient inutile.

## Modèle fiscal (calcRachatAV)

```js
calcRachatAV({
  gainsRachat = 0,        // part de produits imposable (assureur)
  contratHuitAns = false, // contrat ≥ 8 ans
  primesNettesFoyer = 0,  // total versements nets foyer (pour le flag 150 k)
  rniFoyer = 0, parts = 1, isCouple = false,
}) => {
  gainsRachat, abattement, baseIR, ir, ps, total, tauxIR, case2042,
  bareme: { ir, total, recommande: 'pfu'|'bareme', economie },
  flags: { primesSuperieur150k },
}
```

- **Abattement** (IR uniquement) : `contratHuitAns ? (isCouple ? AV_ABATTEMENT_8ANS_COUPLE : AV_ABATTEMENT_8ANS_SOLO) : 0`.
- **baseIR** = `max(0, gainsRachat − abattement)`.
- **tauxIR** = `contratHuitAns ? AV_TAUX_IR_APRES_8ANS (0,075) : PFU_TAUX_IR (0,128)`.
- **ir** = `round(baseIR × tauxIR)` ; **ps** = `round(gainsRachat × TAUX_PS_CAPITAL)` (assiette pleine).
- **total** = ir + ps ; **case2042** = `'2CG'` (défaut PFU) — le barème via 2BH est l'option.
- **Arbitrage barème (informatif, case 2BH)** : `irBareme = calcIR(rniFoyer + baseIR, parts, isCouple) − calcIR(rniFoyer, parts, isCouple)` ; `totalBareme = irBareme + ps` ; `recommande = totalBareme ≤ total ? 'bareme' : 'pfu'` ; `economie = |total − totalBareme|`.
- **flags.primesSuperieur150k** = `primesNettesFoyer > AV_SEUIL_PRIMES_TAUX_REDUIT` → la fraction
  au-delà de 150 k est taxée à 12,8 % (non calculée finement, signalée).
- Aucun littéral fiscal (verrou paperasse-first).

## Chaîne end-to-end

### Collecte (Collect.jsx, module `assuranceVie`)
Champs conditionnels (affichés dès qu'un rachat est saisi) :
- `av_rachat_gains` — « Rachat AV — part de gains imposable (fournie par l'assureur) (€) ».
- `av_rachat_8ans` — « Contrat ≥ 8 ans ? » (Oui/Non), `dependsOn` gains > 0.
Le seuil 150 k est estimé depuis `av_verse` existant (best-effort ; flag informatif).

### Générateur (profileGenerator.js)
Nouveau bloc `_avRachatBlock(d, isCouple, rniFoyer, parts)` : si `av_rachat_gains > 0`, appelle
`calcRachatAV`, émet une section « RACHAT ASSURANCE-VIE » avec les lignes parsables + consolide
`avRachatIR` (IR retenu, régime PFU par défaut) et `avRachatPsBase` (= gainsRachat) au foyer.
Note informative « option barème 2BH plus avantageuse (~X €) » si `recommande === 'bareme'`.
Note routage si `flags.primesSuperieur150k`.

### Plugin `src/plugins/income/assurance-vie-rachat.plugin.js`
- `parser(text)` → `avRachatIR`, `avRachatPsBase`, `avRachatGains`, `avRachat8ans`, `avRachatBaremeEco`.
- `declarativeCases()` → `2CG` (gains imposables au PFU), `2BH` (gains au barème si option).
- `validator(formData)` : `av_rachat_gains` ≥ 0.
- generator/calculator vides (consolidation dans profileGenerator/computeFoyerSummary).

### computeFoyerSummary (taxCalculator.js)
`avRachatIR = profile.avRachatIR || 0` ; `avRachatPS = round((profile.avRachatPsBase || 0) × TAUX_PS_CAPITAL)`.
`totalDu = … + avRachatIR + avRachatPS`. Exposés dans le résumé + `hasCapitalBase` inclut avRachat.

### Rapport + opportunité
- Ligne dédiée dans la section capital (IR + PS du rachat, régime, case 2CG).
- Opportunité `arbitrage_av_rachat` (type gain) si `recommande === 'bareme'` et économie ≥ 50 € :
  « option barème (2BH) plus avantageuse de X € » ; + rappel pédagogique CIF-safe
  « fractionner les rachats sur plusieurs années pour rester sous l'abattement annuel
  renouvelable » (formulé « à étudier », conforme au verrou cif-safe).

## Tests

1. `calcRachatAV` : ≥ 8 ans gains < abattement (IR 0, PS plein) ; ≥ 8 ans gains > abattement
   (IR = (gains−abatt)×7,5 %) ; < 8 ans (IR = gains×12,8 %, pas d'abattement) ; arbitrage barème
   gagnant à TMI 0/11 % ; flag 150 k ; gains 0 → tout nul. Couple : abattement 9 200 €.
2. Chaîne complète : form `{ av_rachat_gains, av_rachat_8ans }` → generator → parser →
   computeFoyerSummary : `totalDu` inclut IR + PS du rachat ; cases 2CG/2BH présentes.
3. Verrous paperasse-first + cif-safe verts ; suite complète verte.

## Hors périmètre (flaggé / routé)

- Fraction de versements > 150 000 € (12,8 % sur l'excédent) — signalée, non calculée.
- Contrats souscrits avant 1983 (exonération totale IR) — mention, non modélisé.
- Recalcul de proportionnalité (on fait confiance à la part assureur).
- Câblage dans l'arbitre 2OP global d'E3 : le rachat AV garde son arbitrage propre (2BH),
  documenté ; l'option barème reste globale et irrévocable (mention).
