// Helpers partagés entre profileParser.js et les plugins Phase3-B+.
// profileParser.js garde ses propres copies locales (inchangé en Phase3-B) ;
// le branchement définitif se fait en Phase3-C.

/** Entier depuis "45 161,77 €" → 45161. parseInt s'arrête à la virgule. */
export function n(src, rx) {
  const m = (src || '').match(rx);
  if (!m?.[1]) return 0;
  const str = m[1].replace(/[\s ]/g, '').replace(',', '.');
  const v = parseFloat(str);
  return isNaN(v) ? 0 : Math.round(v);
}

/** Flottant depuis "11,80" ou "11.80" → 11.8. */
export function f(src, rx) {
  const m = (src || '').match(rx);
  if (!m?.[1]) return 0;
  const v = parseFloat(m[1].replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

/** Texte brut du premier groupe. */
export function s(src, rx) {
  return (src || '').match(rx)?.[1]?.trim() ?? '';
}

/** Format "OUI ~1 014,77 €" → 1014. */
export function oui(src, rx) {
  const m = (src || '').match(rx);
  if (!m?.[1]) return 0;
  const v = parseInt(m[1].replace(/[\s ]/g, ''), 10);
  return isNaN(v) ? 0 : v;
}

/** Entier signé — gère le moins Unicode U+2212 (−) en plus du tiret ASCII. */
export function signed(src, rx) {
  const m = (src || '').match(rx);
  if (!m?.[1]) return null;
  const str = m[1].replace(/−/g, '-').replace(/[\s ]/g, '').replace(',', '.');
  const v = parseFloat(str);
  return isNaN(v) ? null : Math.round(v);
}

/**
 * Retourne le texte entre un header "== ... ==" et le suivant (ou fin de fichier).
 */
export function section(text, header) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped + '\\s*([\\s\\S]*?)(?=\\n==|$)');
  return (text || '').match(rx)?.[1] ?? '';
}
