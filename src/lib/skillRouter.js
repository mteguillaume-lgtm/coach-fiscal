// Routeur de skills : charge uniquement les skills pertinents pour chaque question.
// Évite d'envoyer tous les skills à Claude à chaque tour — économise les tokens.

import { SKILLS_MAP, SKILL_DATA, SKILL_REFS } from '../data/skillsLoader';
import { buildChiffresOfficiels } from './chiffresOfficiels';
import { debug } from './debug';

// ─── Mots-clés par skill ───────────────────────────────────────────────────────

const SKILL_RULES = [
  {
    skill: 'fiscaliste',
    keywords: [
      'impôt', 'impot', 'ir ', ' ir,', ' ir.', 'tmi', 'tranche', 'déclaration', 'declaration',
      'case ', ' case', 'plafond', 'per ', ' per,', ' per.', 'pea', 'assurance-vie', 'assurance vie',
      'déduction', 'deduction', 'crédit d\'impôt', "credit d'impot", 'réduction d\'impôt',
      'foncier', 'bic', 'bnc', 'micro', 'régime réel', 'regime reel',
      'pfu', 'flat tax', 'prélèvement forfaitaire', 'prelevement forfaitaire',
      'ps ', 'prélèvements sociaux', 'prelevements sociaux',
      'pas ', 'prélèvement à la source', 'taux pas',
      'déficit foncier', 'deficit foncier', 'lmnp', 'lmp',
      'abattement', 'exonération', 'exoneration',
      'frais réels', 'frais reels', 'forfait 10',
      'quotient familial', 'parts fiscales',
    ],
  },
  {
    skill: 'notaire',
    keywords: [
      'succession', 'héritage', 'heritage', 'donation', 'testament',
      'démembrement', 'demembrement', 'usufruit', 'nue-propriété', 'nue propriété',
      'indivision', 'sci ', ' sci,', 'partage', 'droit de succession',
      'droits de mutation', 'pacte dutreil', 'dutreil',
      'assurance vie succession', 'clause bénéficiaire', 'clause beneficiaire',
    ],
  },
  {
    skill: 'comptable',
    keywords: [
      'tva', 'liasse', 'is ', 'impôt sur les sociétés', 'bilan', 'compte de résultat',
      'écriture comptable', 'ecriture comptable', 'amortissement', 'facturation',
      'factur-x', 'fec', 'expert-comptable', 'expert comptable',
      'plan comptable', 'charge déductible', 'charge deductible',
    ],
  },
  {
    skill: 'commissaire-aux-comptes',
    keywords: [
      'cac', 'commissaire aux comptes', 'certification', 'nep', 'opinion',
      'audit légal', 'audit legal', 'rapport de gestion', 'alerte',
    ],
  },
  {
    skill: 'controleur-fiscal',
    keywords: [
      'dgfip', 'vérification', 'verification', 'redressement', 'contrôle fiscal', 'controle fiscal',
      'proposition de rectification', 'rectification', 'mise en demeure',
      'pénalité fiscale', 'penalite fiscale', 'majoration', 'intérêt de retard',
      'prescription', 'délai de reprise', 'delai de reprise',
    ],
  },
  {
    skill: 'syndic',
    keywords: [
      'syndic', 'copropriété', 'copropriete', ' ag ', 'assemblée générale',
      'assemblee generale', 'charges de copropriété', 'tantièmes', 'tantiemes',
      'règlement de copropriété', 'reglement de copropriete', 'lot ', 'parties communes',
    ],
  },
];

// ─── Détection des skills pertinents ──────────────────────────────────────────

/**
 * Analyse le message utilisateur et retourne la liste des skills à activer.
 * Toujours inclut "gcp". Retourne ["gcp", "fiscaliste"] si rien ne matche.
 *
 * @param {string} userMessage
 * @returns {string[]} skills identifiants (clés de SKILLS_MAP)
 */
export function detectRelevantSkills(userMessage) {
  const lower = userMessage.toLowerCase();
  const active = new Set(['gcp']); // toujours présent

  for (const rule of SKILL_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
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

export function buildSystemPrompt({ skills, profile, masterPrompt, model, summary = null, parsedProfile = {} }) {

  const skillsBlock = skills
    .map(id => {
      const content = SKILLS_MAP[id];
      if (!content) return '';

      const lines = [`## SKILL : ${SKILL_LABELS[id] ?? id}`, content.trim()];

      // Données chiffrées (JSON) — barèmes, abattements, plafonds, etc.
      const data = SKILL_DATA[id] ?? {};
      const dataEntries = Object.entries(data);
      if (dataEntries.length > 0) {
        lines.push('\n### Données de référence');
        for (const [name, raw] of dataEntries) {
          lines.push(`#### ${name}\n\`\`\`json\n${raw.trim()}\n\`\`\``);
        }
      }

      // Documentation procédurale (Markdown)
      const refs = SKILL_REFS[id] ?? {};
      const refEntries = Object.entries(refs);
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
