// Routeur de skills : charge uniquement les skills pertinents pour chaque question.
// Évite d'envoyer tous les skills à Claude à chaque tour — économise les tokens.

import { buildChiffresOfficiels } from './chiffresOfficiels';
import { debug } from './debug';
import { DEFISC_DISPOSITIFS } from './taxCalculator';

// ─── Tokeniseur & matching par mot entier ───────────────────────────────────

/** Minuscules, accents retirés (NFD), découpe sur tout non-alphanumérique. */
export function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Un mot-clé (déjà tokenisé) matche s'il apparaît comme sous-séquence contiguë
// des tokens du message. Mono-token → simple appartenance ; multi-mots → contigu.
function matchesKeyword(msgTokens, kwTokens) {
  if (kwTokens.length === 0) return false;
  if (kwTokens.length === 1) return msgTokens.includes(kwTokens[0]);
  for (let i = 0; i + kwTokens.length <= msgTokens.length; i++) {
    if (kwTokens.every((t, j) => msgTokens[i + j] === t)) return true;
  }
  return false;
}

/** Mots-clés defisc dérivés des clés de DEFISC_DISPOSITIFS (paperasse-first) :
 *  ajouter un dispositif au JSON le route automatiquement vers le fiscaliste. */
export function deriveDefiscKeywords() {
  const out = new Set();
  for (const key of Object.keys(DEFISC_DISPOSITIFS)) {
    for (const tok of key.split('_')) {
      if (tok === 'ir') continue;          // trop générique (déjà mot-clé fiscaliste)
      if (tok.length >= 3) out.add(tok);   // fcpi, fip, madelin, sofica, pinel, censi, bouvard…
    }
  }
  return [...out];
}

// ─── Mots-clés par skill ───────────────────────────────────────────────────────
// Le tokeniseur gère accents et tirets : pas de variantes accentuées ni de paddings
// d'espaces. Les phrases multi-mots sont matchées comme sous-séquences contiguës.

const SKILL_RULES = [
  {
    skill: 'fiscaliste',
    keywords: [
      'impot', 'ir', 'tmi', 'tranche', 'declaration', 'case', 'plafond',
      'per', 'pea', 'assurance vie', 'deduction', "credit d'impot", "reduction d'impot",
      'foncier', 'bic', 'bnc', 'micro', 'regime reel',
      'pfu', 'flat tax', 'prelevement forfaitaire',
      'ps', 'prelevements sociaux', 'taux pas', 'prelevement a la source',
      'deficit foncier', 'lmnp', 'lmp', 'abattement', 'exoneration',
      'frais reels', 'forfait 10', 'quotient familial', 'parts fiscales',
      'ifi', 'cehr',
      ...deriveDefiscKeywords(),
    ],
  },
  {
    skill: 'notaire',
    keywords: [
      'succession', 'heritage', 'donation', 'testament',
      'demembrement', 'usufruit', 'nue propriete',
      'indivision', 'sci', 'partage', 'droit de succession',
      'droits de mutation', 'pacte dutreil', 'dutreil',
      'assurance vie succession', 'clause beneficiaire',
    ],
  },
  {
    skill: 'comptable',
    keywords: [
      'tva', 'liasse', 'is', 'impot sur les societes', 'bilan', 'compte de resultat',
      'ecriture comptable', 'amortissement', 'facturation',
      'factur x', 'fec', 'expert comptable',
      'plan comptable', 'charge deductible', 'holding',
    ],
  },
  {
    skill: 'commissaire-aux-comptes',
    keywords: [
      'cac', 'commissaire aux comptes', 'certification', 'nep', 'opinion',
      'audit legal', 'rapport de gestion', 'alerte',
    ],
  },
  {
    skill: 'controleur-fiscal',
    keywords: [
      'dgfip', 'verification', 'redressement', 'controle fiscal',
      'proposition de rectification', 'rectification', 'mise en demeure',
      'penalite fiscale', 'majoration', 'interet de retard',
      'prescription', 'delai de reprise',
    ],
  },
  {
    skill: 'syndic',
    keywords: [
      'syndic', 'copropriete', 'ag', 'assemblee generale',
      'charges de copropriete', 'tantiemes',
      'reglement de copropriete', 'lot', 'parties communes',
    ],
  },
];

// Pré-tokenisation des mots-clés (une fois au chargement).
const SKILL_RULES_TOKENIZED = SKILL_RULES.map(r => ({
  skill: r.skill,
  kw: r.keywords.map(tokenize),
}));

// ─── Détection des skills pertinents ──────────────────────────────────────────

/**
 * Analyse le message utilisateur et retourne la liste des skills à activer.
 * Toujours inclut "gcp". Retourne ["gcp", "fiscaliste"] si rien ne matche.
 *
 * @param {string} userMessage
 * @returns {string[]} skills identifiants (clés de SKILLS_MAP)
 */
export function detectRelevantSkills(userMessage) {
  const msgTokens = tokenize(userMessage);
  const active = new Set(['gcp']); // toujours présent

  for (const rule of SKILL_RULES_TOKENIZED) {
    if (rule.kw.some(kwTokens => matchesKeyword(msgTokens, kwTokens))) {
      active.add(rule.skill);
    }
  }

  // Fallback si seul gcp est actif
  if (active.size === 1) {
    active.add('fiscaliste');
  }

  const result = [...active];
  debug('[skillRouter] Skills activés :', result.join(', '), '| Message :', userMessage.slice(0, 80));
  return result;
}

// ─── Construction du system prompt ────────────────────────────────────────────

const SKILL_LABELS = {
  'gcp':                    'Gestionnaire de patrimoine',
  'fiscaliste':             'Fiscaliste',
  'notaire':                'Notaire',
  'comptable':              'Comptable',
  'commissaire-aux-comptes':'Commissaire aux comptes',
  'controleur-fiscal':      'Contrôleur fiscal',
  'syndic':                 'Syndic',
};

/**
 * Construit le system prompt complet pour un tour de conversation.
 * Concatène masterPrompt + skills pertinents + profil utilisateur.
 *
 * @param {{ userMessage: string, profile: string, masterPrompt: string }} opts
 * @returns {string} system prompt prêt à envoyer à Claude
 */
const MODEL_LABELS = {
  haiku:  '⚡ Haiku — réponse rapide',
  sonnet: '🧠 Sonnet — analyse approfondie',
  opus:   '🔮 Opus — stratégie complexe',
};

export function buildSystemPrompt({ skills, skillsContent = [], profile, masterPrompt, model, summary = null, parsedProfile = {} }) {

  const byId = new Map(skillsContent.map(sc => [sc.id, sc]));
  const skillsBlock = skills
    .map(id => {
      const sc = byId.get(id);
      const content = sc?.content;
      if (!content) return '';

      const lines = [`## SKILL : ${SKILL_LABELS[id] ?? id}`, content.trim()];

      // Données chiffrées (JSON) — barèmes, abattements, plafonds, etc.
      const dataEntries = Object.entries(sc.data ?? {});
      if (dataEntries.length > 0) {
        lines.push('\n### Données de référence');
        for (const [name, raw] of dataEntries) {
          lines.push(`#### ${name}\n\`\`\`json\n${raw.trim()}\n\`\`\``);
        }
      }

      // Documentation procédurale (Markdown)
      const refEntries = Object.entries(sc.refs ?? {});
      if (refEntries.length > 0) {
        lines.push('\n### Documentation procédurale');
        for (const [name, raw] of refEntries) {
          lines.push(`#### ${name}\n${raw.trim()}`);
        }
      }

      debug(
        `[skillRouter] ${id} : ${dataEntries.length} data, ${refEntries.length} refs`,
      );

      return lines.join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');

  const profileBlock = profile?.trim()
    ? `\n\n## PROFIL FISCAL CLIENT\n${profile.trim()}`
    : '';

  // E4 : chiffres calculés par l'app (computeFoyerSummary) — Claude les cite,
  // il ne les recalcule pas. Absent si pas de summary (rétro-compat).
  const chiffresBloc  = buildChiffresOfficiels(summary, parsedProfile);
  const chiffresBlock = chiffresBloc ? `\n\n${chiffresBloc}` : '';

  const modelBlock = model
    ? `\n\n## IDENTITÉ\nTu es Kapio, un conseiller fiscal IA. Le routeur de complexité a sélectionné le niveau : **${MODEL_LABELS[model] ?? model}**.\nSi l'utilisateur te demande quel modèle tu utilises, réponds : "Je suis Kapio. Pour cette question, le niveau **${MODEL_LABELS[model] ?? model}** a été sélectionné automatiquement." Ne mentionne jamais de numéros de version (3.7, 4.5…) ni le nom "Claude" seul.`
    : '';

  return `${masterPrompt.trim()}\n\n${skillsBlock}${profileBlock}${chiffresBlock}${modelBlock}`.trim();
}
