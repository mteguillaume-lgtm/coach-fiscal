#!/usr/bin/env node
/**
 * Mise à jour automatique du barème IR via Claude.
 *
 * Usage :
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/update-bareme.js
 *   node scripts/update-bareme.js --year 2026          # forcer l'année cible
 *   node scripts/update-bareme.js --dry-run            # affiche le JSON sans écrire
 *
 * Ce script :
 *   1. Détermine l'année cible (N+1 si décembre-janvier, sinon N)
 *   2. Télécharge le texte brut depuis BOFIP / service-public.fr
 *   3. Demande à Claude d'extraire les valeurs structurées
 *   4. Valide le JSON résultant
 *   5. Écrit bareme-ir-YYYY.json + met à jour per-plafonds.json
 *
 * Planification recommandée (GitHub Actions) :
 *   - Déclencheur : 20 janvier de chaque année (LFI publiée en décembre)
 *   - Variable d'environnement : ANTHROPIC_API_KEY (secret GitHub)
 */

const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const process = require('process');

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA_DIR      = path.join(__dirname, '../src/data/paperasse/fiscaliste/data');
const PER_FILE      = path.join(DATA_DIR, 'per-plafonds.json');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const yearArg = args.find(a => a.startsWith('--year='))?.split('=')[1]
             || args[args.indexOf('--year') + 1];

// Année des revenus cible (ex: 2025 → déclaration 2026)
const YEAR_REVENUS = yearArg
  ? parseInt(yearArg)
  : new Date().getMonth() >= 11 ? new Date().getFullYear() + 1 : new Date().getFullYear();

const OUT_FILE = path.join(DATA_DIR, `bareme-ir-${YEAR_REVENUS}.json`);

// ─── Sources officielles ───────────────────────────────────────────────────────
// BOFIP : Bulletin officiel des finances publiques
// Mis à jour après chaque LFI (publiée en décembre, applicable en janvier N+1)

const SOURCES = [
  `https://bofip.impots.gouv.fr/bofip/2049-PGP.html`,           // Barème IR
  `https://www.service-public.fr/particuliers/vosdroits/F1419`,   // Calcul IR
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Kapio/1.0' } }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text ?? '');
        } catch { reject(new Error('Réponse Claude invalide : ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 12000); // Claude context limit
}

function extractJSON(text) {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error('Aucun JSON trouvé dans la réponse Claude.');
  return JSON.parse(m[1]);
}

function validate(data, year) {
  const t = data.bareme_ir?.tranches;
  if (!Array.isArray(t) || t.length < 5) throw new Error('Tranches invalides');
  if (!data.decote?.seuil_celibataire)    throw new Error('Décote manquante');
  if (!data.abattement_salaires_10pct)    throw new Error('Abattement manquant');
  console.log(`✅ JSON validé — ${t.length} tranches, décote présente`);
}

// ─── Prompt extraction ────────────────────────────────────────────────────────

function buildPrompt(sourceText, year) {
  return `Tu es un expert en droit fiscal français. Extrait du texte ci-dessous le barème de l'impôt sur le revenu pour les revenus ${year} (déclaration ${year + 1}).

Retourne UNIQUEMENT un JSON valide avec cette structure exacte (sans commentaire, sans texte avant ou après) :

\`\`\`json
{
  "_meta": {
    "revenus": ${year},
    "declaration": ${year + 1},
    "lfi": "Loi n°XXXX-XXX du JJ mois AAAA",
    "indexation_bareme_ir": "+X.X%",
    "sources": ["${SOURCES[0]}", "${SOURCES[1]}"],
    "a_mettre_a_jour": "Chaque année après publication de la LFI (décembre-janvier). Remplacer ce fichier par bareme-ir-XXXX.json."
  },
  "bareme_ir": {
    "description": "Tranches appliquées par part de quotient familial (revenus ${year}, déclaration ${year + 1})",
    "tranches": [
      { "jusqu_a": XXXX, "taux": 0.00 },
      { "de": XXXX, "a": XXXX, "taux": 0.11 },
      { "de": XXXX, "a": XXXX, "taux": 0.30 },
      { "de": XXXX, "a": XXXX, "taux": 0.41 },
      { "au_dela": XXXX, "taux": 0.45 }
    ]
  },
  "quotient_familial": {
    "plafond_gain_par_demi_part": XXXX,
    "description": "Avantage fiscal maximum par demi-part supplémentaire liée aux enfants à charge."
  },
  "decote": {
    "seuil_celibataire": XXXX,
    "seuil_couple": XXXX,
    "plafond_celibataire": XXXX,
    "plafond_couple": XXXX,
    "formule_celibataire": "décote = XXXX - (0.4525 × impôt_brut) si impôt_brut < XXXX",
    "formule_couple": "décote = XXXX - (0.4525 × impôt_brut) si impôt_brut < XXXX",
    "note": "La décote ne peut pas rendre l'impôt négatif. Source : BOI-IR-LIQ-20-20-30."
  },
  "abattement_salaires_10pct": {
    "taux": 0.10,
    "minimum": XXXX,
    "maximum": XXXX,
    "description": "Abattement forfaitaire automatique sur traitements et salaires (case 1AJ)."
  },
  "cehr": {
    "description": "Contribution Exceptionnelle sur les Hauts Revenus",
    "seuils_celibataire": [
      { "de": 250000, "a": 500000, "taux": 0.03 },
      { "au_dela": 500000, "taux": 0.04 }
    ],
    "seuils_couple": [
      { "de": 500000, "a": 1000000, "taux": 0.03 },
      { "au_dela": 1000000, "taux": 0.04 }
    ]
  }
}
\`\`\`

Si une valeur est introuvable dans le texte, utilise la même que l'année précédente et marque-la avec un commentaire JSON _approximation: true.

TEXTE SOURCE :
${sourceText}`;
}

function buildPassPrompt(sourceText, year) {
  return `Extrait du texte ci-dessous la valeur du PASS (Plafond Annuel de la Sécurité Sociale) pour l'année ${year}.
Retourne UNIQUEMENT un nombre entier, sans unité, sans texte. Exemple : 47100

TEXTE SOURCE :
${sourceText.slice(0, 4000)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔄 Mise à jour barème IR — revenus ${YEAR_REVENUS}\n`);

  if (!ANTHROPIC_KEY) {
    console.error('❌ Variable ANTHROPIC_API_KEY manquante.');
    console.error('   export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  if (fs.existsSync(OUT_FILE) && !DRY_RUN) {
    console.log(`ℹ️  ${path.basename(OUT_FILE)} existe déjà.`);
    console.log('   Utiliser --dry-run pour voir la version extraite sans écraser.');
    process.exit(0);
  }

  // 1. Télécharger les sources
  console.log('📥 Téléchargement des sources BOFIP...');
  let sourceText = '';
  for (const url of SOURCES) {
    try {
      const html = await fetchText(url);
      sourceText += '\n\n--- SOURCE: ' + url + ' ---\n' + stripHtml(html);
      console.log(`   ✓ ${url}`);
    } catch (err) {
      console.warn(`   ⚠️  Impossible de charger ${url} : ${err.message}`);
    }
  }

  if (!sourceText.trim()) {
    console.error('❌ Aucune source téléchargée. Vérifiez la connexion.');
    process.exit(1);
  }

  // 2. Extraction barème via Claude
  console.log('\n🤖 Extraction du barème via Claude Haiku...');
  const baremeJson = await callClaude(buildPrompt(sourceText, YEAR_REVENUS));
  let baremeData;
  try {
    baremeData = extractJSON(baremeJson);
    validate(baremeData, YEAR_REVENUS);
  } catch (err) {
    console.error('❌ Extraction échouée :', err.message);
    console.error('Réponse brute :', baremeJson.slice(0, 500));
    process.exit(1);
  }

  // 3. Extraction PASS via Claude
  console.log('🤖 Extraction du PASS...');
  const passStr  = await callClaude(buildPassPrompt(sourceText, YEAR_REVENUS));
  const passNew  = parseInt(passStr.replace(/\D/g, ''));
  const plancher = isNaN(passNew) ? null : Math.round(passNew * 0.1);
  const plafond  = isNaN(passNew) ? null : Math.round(passNew * 8 * 0.1);

  // 4. Affichage
  console.log('\n📊 Résultat extrait :');
  console.log('   Tranches :', baremeData.bareme_ir.tranches.map(t =>
    t.jusqu_a  ? `0→${t.jusqu_a}€ (${t.taux*100}%)` :
    t.au_dela  ? `>${t.au_dela}€ (${t.taux*100}%)` :
    `${t.de}→${t.a}€ (${t.taux*100}%)`
  ).join(' | '));
  console.log(`   Décote : célib ${baremeData.decote?.seuil_celibataire}€ / couple ${baremeData.decote?.seuil_couple}€`);
  if (!isNaN(passNew)) console.log(`   PASS ${YEAR_REVENUS} : ${passNew.toLocaleString('fr-FR')} € → plancher PER ${plancher?.toLocaleString('fr-FR')} €`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] JSON qui serait écrit dans', path.basename(OUT_FILE), ':');
    console.log(JSON.stringify(baremeData, null, 2));
    return;
  }

  // 5. Écriture bareme-ir-YYYY.json
  fs.writeFileSync(OUT_FILE, JSON.stringify(baremeData, null, 2) + '\n', 'utf8');
  console.log(`\n✅ Écrit : ${OUT_FILE}`);

  // 6. Mise à jour per-plafonds.json (ajout du nouveau PASS)
  if (!isNaN(passNew) && fs.existsSync(PER_FILE)) {
    const perData = JSON.parse(fs.readFileSync(PER_FILE, 'utf8'));
    perData._meta[`pass_${YEAR_REVENUS}`] = passNew;
    perData.per_individuel.plancher_euros      = plancher;
    perData.per_individuel.plafond_absolu_euros = plafond;
    if (!DRY_RUN) {
      fs.writeFileSync(PER_FILE, JSON.stringify(perData, null, 2) + '\n', 'utf8');
      console.log(`✅ Mis à jour : per-plafonds.json (PASS ${YEAR_REVENUS} = ${passNew.toLocaleString('fr-FR')} €)`);
    }
  }

  console.log('\n🚀 Redéployer l\'app pour que les nouveaux calculs soient actifs.');
  console.log('   git add . && git commit -m "Barème IR ' + YEAR_REVENUS + ' — mise à jour auto" && git push\n');
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err.message);
  process.exit(1);
});
