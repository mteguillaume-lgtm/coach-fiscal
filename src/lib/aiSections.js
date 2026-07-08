// Sections rédigées par l'IA (enrichissement Profile.jsx) — délimitées par des
// en-têtes « == TITRE == ». Le parser NE DOIT JAMAIS extraire de montant de ces
// blocs (audit E4) : stripAiSections nettoie le texte avant toute regex numérique,
// extractAiSections assainit la sortie d'enrichissement avant l'append au profil.

export const AI_TITLES = [
  'DÉCLARATION', 'ANALYSE DES SITUATIONS', "POINTS D'ATTENTION",
  'OBJECTIFS PRIORITAIRES', 'STRATÉGIE PATRIMONIALE',
];

export const isAiSection = (title) =>
  AI_TITLES.some(k => String(title).toUpperCase().includes(k));

// Découpe le texte en segments : [préambule, bloc1, bloc2…] où chaque bloc
// commence à une ligne d'en-tête « == TITRE == » et court jusqu'au prochain
// en-tête (ou la fin). Retourne [{ title|null, content }].
function segments(text) {
  const out = [];
  const re = /^==\s*(.+?)\s*==\s*$/gm;
  let last = 0, lastTitle = null, m;
  while ((m = re.exec(text)) !== null) {
    out.push({ title: lastTitle, content: text.slice(last, m.index) });
    lastTitle = m[1];
    last = m.index;
  }
  out.push({ title: lastTitle, content: text.slice(last) });
  return out;
}

/** Texte SANS les blocs IA — identité si aucun bloc IA (profil généré pur). */
export function stripAiSections(text) {
  if (!text) return text ?? '';
  const segs = segments(text);
  if (!segs.some(s => s.title && isAiSection(s.title))) return text;
  return segs.filter(s => !(s.title && isAiSection(s.title))).map(s => s.content).join('');
}

/** UNIQUEMENT les blocs IA (en-têtes inclus) — '' si aucun. */
export function extractAiSections(text) {
  if (!text) return '';
  return segments(text)
    .filter(s => s.title && isAiSection(s.title))
    .map(s => s.content.trimEnd())
    .join('\n\n')
    .trim();
}
