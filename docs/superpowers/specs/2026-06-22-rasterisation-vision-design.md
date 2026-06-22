# Rasterisation des PDF anonymisés pour analyse par vision

Date : 2026-06-22
Statut : design validé (sections 1→5)

## Contexte et problème

Kapio anonymise les documents (bulletins de paie, avis d'imposition…) côté
navigateur, puis les envoie à un modèle IA à l'étape Collecte pour en extraire
les montants (`Collect.jsx:1322` → `analyzeDoc`).

Deux problèmes ont été identifiés :

1. **Fuite de confidentialité (critique).** `anonymizer.js` fait de la
   *rédaction par superposition* : `pdf-lib drawRectangle` dessine des
   rectangles noirs **par-dessus** le texte, sans supprimer la couche texte
   sous-jacente. Vérifié empiriquement : un texte « masqué » reste extractible
   via le même `pdfjs-dist` que l'app (`getTextContent` renvoie le texte
   complet). Or le traitement PDF de Claude (`anthropic.js:114`, bloc
   `type: 'document'`) lit cette couche texte — donc l'IA reçoit les PII
   « masquées ». Idem pour le PDF téléchargé par l'utilisateur (export ZIP,
   `Anonymize.jsx:428`) et un simple copier-coller.

2. **Qualité d'analyse / support Mistral.** L'extraction texte brute aplatit la
   mise en page (colonnes « Cumul annuel » qui se mélangent). La vision préserve
   le contexte visuel du document. Par ailleurs Mistral ne gère pas les PDF en
   vision (`mistral.js:117` lève une erreur) : seules les images passent.

## Objectif

Rasteriser les pages : rendre chaque page en image, peindre les rectangles
noirs **sur les pixels** (la couche texte disparaît), puis envoyer ces images
aux modèles de vision. Une seule solution qui :

- corrige la fuite partout (fichier téléchargé **et** payload IA, Claude inclus) ;
- donne à l'IA un contexte visuel de qualité ;
- unifie les deux fournisseurs et débloque Mistral sur les PDF.

Périmètre validé : **lecture IA + fuite corrigée** (le PDF anonymisé devient
réellement caviardé). Fournisseurs : **Claude ET Mistral**, via une voie vision
unifiée par images.

## Architecture

Trois unités à frontières nettes :

- **`src/lib/pdfRasterizer.js`** (nouveau) — rendu pur, testable seul.
- **`src/lib/anonymizer.js`** (modifié) — détection + masquage, consomme le rasterizer.
- **`src/lib/providers/{anthropic,mistral}.js`** (modifiés) — transport vision,
  consomment des images, ignorent tout du PDF.

Inchangés : `extractor.js` (`EXTRACT_PROMPT`, `mapExtracted`), `pdfReader.js`
(extraction texte/positions, toujours utilisée par l'anonymiseur).

### `pdfRasterizer.js`

```
rasterizePages(file, { scale }) → [{ canvas, width, height, scale }]
    rend chaque page via pdfjs sur un canvas, séquentiellement. Aucune écriture.

pdfToImages(file, { scale, format, quality }) → [{ blob, mediaType, width, height }]
    rasterizePages puis encode chaque canvas en blob image.
    Utilisé pour les uploads manuels de PDF (non caviardés).
```

Constantes par défaut centralisées dans ce module (cf. § Réglages).

### `anonymizer.js`

La détection de zones est **conservée à l'identique** : extraction
texte+positions (`pdfReader`), `detectType`, `extractFields` (extraction locale
pré-masquage), `findZones`. Tout ce travail local reste avant tout masquage.

Changement : au lieu de `pdf-lib drawRectangle` sur du vectoriel, on rend chaque
page sur canvas (`rasterizePages`) et on **peint les rectangles noirs sur le
canvas**, avec conversion des coordonnées points top-origin → pixels :

```
rectPixel = { x: x0·scale, y: top·scale,
              w: (x1−x0)·scale, h: (bottom−top)·scale }
```

(les zones sont déjà en top-origin, comme le canvas — pas d'inversion d'axe Y,
contrairement au chemin pdf-lib actuel.)

Deux sorties :

- `pageImages: [{ blob, mediaType, width, height }]` — pour la vision (session-only).
- `blob` — PDF **image-only** réassemblé via `pdf-lib` (`embedJpg`/`embedPng`,
  une page par image, dimensionnée à l'image). Plus aucune couche texte. Pour le
  téléchargement.

Valeur de retour de `anonymizePdf`, champs existants conservés (`suggestedFilename`,
`zonesCount`, `detections`, `period`, `typeId`, `typeLabel`, `confidence`,
`extracted`) + nouveau champ `pageImages`.

### Providers

Le contrat `analyzeDoc` passe d'un fichier à un tableau d'images :

```
analyzeDoc({ images, apiKey }) → Promise<string>
    images: [{ blob, mediaType }, …]
```

- Anthropic : N blocs `{ type: 'image', source: { type:'base64', media_type, data } }`
  + `{ type:'text', text: EXTRACT_PROMPT }`.
- Mistral : N blocs `{ type:'image_url', image_url: dataUrl }`
  + `{ type:'text', text: EXTRACT_PROMPT }`.

La branche PDF disparaît des deux providers ; le `throw` PDF de Mistral
(`mistral.js:117`) est supprimé. Le registre `providers/index.js` adapte la
signature `analyzeDoc(provider, images, apiKey)`.

## Flux de données

### (a) Anonymize — 100 % local

```
PDF source → pdfReader (texte+positions) → detectType + extractFields (local)
          → findZones (zones, coords points top-origin)
          → rasterizePages (canvas/page)
          → peinture rectangles noirs (points×scale → pixels)
          → pageImages[] (JPEG) + PDF image-only (download)
```

State (`SET_ANONYMIZED_FILES`), payload enrichi :

```js
{ name, target, blob /* PDF image-only */, pageImages: [{blob, mediaType, width, height}], objectUrl }
```

`pageImages` = blobs session-only (même posture que `blob`/`objectUrl`
aujourd'hui — non persistés en localStorage).

### (b) Collect — fichiers anonymisés

`handleUseAnonymized` (`Collect.jsx:1379`) passe directement les `pageImages` de
chaque item à l'analyse. **Pas de re-rasterisation.**

### (c) Collect — upload manuel (PDF brut ou image)

`handleFiles` (`Collect.jsx:1302`) normalise en images avant l'appel :

```
image (jpg/png) → images = [fichier]
PDF             → images = await pdfToImages(file)   // rasterisé, non caviardé
→ analyzeDoc(provider, images, apiKey)
```

L'upload manuel n'est pas anonymisé : responsabilité de l'utilisateur qui a
sauté l'anonymisation.

### (d) Vision → champs (inchangé en aval)

Réponse texte du modèle → `mapExtracted` (`extractor.js:57`) → `brut`,
`net_imp`, `taux_pas`, `pas_tot` + warning → `formData`/`d1Data`/`d2Data`.

## Réglages (qualité vs coût) — profil « Équilibré »

Une page A4 = 595×842 points. Anthropic redimensionne au-delà d'un bord long de
1568 px → inutile de payer plus.

- `scale = 1.85` (≈ bord long 1568 px ; page ≈ 1100×1560 px ≈ 1,7 Mpx,
  ~1 200–1 600 tokens/page chez Claude).
- Format `JPEG`, qualité `0.85` (PNG inutilement 3-5× plus lourd sur du rendu).
- **Toutes les pages** envoyées (pas de cap ; un bulletin 1-2 pages ≈ 2-3 k tokens).
- Tier vision **économique** conservé (`VISION_MODEL` = Haiku / Mistral Small) :
  la résolution prime sur la taille du modèle pour lire des chiffres nets.

Constantes centralisées dans `pdfRasterizer.js` pour ajustement facile.

## Gestion des erreurs

- **Rasterisation** : PDF corrompu/protégé → `throw` clair ; échec rendu page →
  message avec n° de page ; `canvas.toBlob` null → erreur d'encodage. Tout
  remonte dans `Collect.handleFiles` qui marque déjà le doc en `status:'error'`
  (`Collect.jsx:1332`) — pas de changement UI.
- **Mémoire** : rendu page par page, canvas libéré après encodage (pic mémoire borné).
- **Vision** : gestion HTTP existante inchangée (401/429/400/5xx). 0 image →
  `throw` avant l'appel réseau (pas de requête vide).
- **PDF download** : si le réassemblage image-only échoue mais `pageImages`
  existe, l'analyse IA reste possible (elle n'utilise pas `blob`) ; on surface
  l'échec de génération du PDF sans bloquer la collecte.
- **Blobs session perdus** : `handleUseAnonymized` gère déjà ce cas
  (`Collect.jsx:1380`) ; on étend le garde-fou aux `pageImages` manquantes →
  fallback « ré-uploader manuellement ».

## Tests

- **Sécurité (non-régression de la fuite)** — le test clé : anonymiser un PDF
  avec un texte sensible connu, puis lancer `pdfjs getTextContent` sur le PDF
  image-only de sortie → assert `items.length === 0` (les `pageImages` étant des
  JPEG, elles n'ont par nature aucune couche texte). Échouait avant le
  correctif, doit passer après.
- **Mapping coordonnées** (`pdfRasterizer`) — unitaire pur : zone points
  top-origin + scale → rectangle pixel attendu.
- **Contrat providers** — `fetch` mocké : Claude émet N blocs `image`, Mistral N
  blocs `image_url` + `EXTRACT_PROMPT`, pour 1 et N images ; `throw` sur 0 image.
  Suit le pattern de `providers/__tests__/`.
- **Inchangés** : `mapExtracted`, `findZones`, `detectType`.
- **Outillage** : ajout de `@napi-rs/canvas` en `devDependency` pour rendre un
  canvas réel en node/vitest (jsdom ne rend pas le canvas) → test de sécurité
  authentique de bout en bout.

## Hors périmètre (YAGNI)

- Repli OCR dédié (Mistral OCR API) : non nécessaire, la vision sur image
  caviardée suffit.
- Approche hybride image + texte local : écartée (réintroduit le problème de
  rédaction du texte et la complexité de parsing).
- Cap sur le nombre de pages : non nécessaire au volume attendu.

## Impact résumé

| Fichier | Changement |
|---|---|
| `src/lib/pdfRasterizer.js` | **nouveau** — `rasterizePages`, `pdfToImages` |
| `src/lib/anonymizer.js` | masquage sur canvas, sortie `pageImages` + PDF image-only |
| `src/lib/providers/anthropic.js` | `analyzeDoc({images,apiKey})`, multi-images, plus de branche PDF |
| `src/lib/providers/mistral.js` | idem ; suppression du `throw` PDF |
| `src/lib/providers/index.js` | signature `analyzeDoc(provider, images, apiKey)` + meta Mistral « Analyse PDF + images » |
| `src/pages/Anonymize.jsx` | payload `SET_ANONYMIZED_FILES` + `pageImages` |
| `src/pages/Collect.jsx` | normalisation PDF→images, passage des `pageImages` |
| `package.json` | devDependency `@napi-rs/canvas` |
