// Bloc « chiffres officiels » injecté dans le system prompt (Chat + enrichissement).
// Source : computeFoyerSummary (740+ tests) — Claude CITE ces montants, il ne les
// recalcule jamais (audit E4). Module pur, sans dépendance UI ni skills.

const eur = (v) => `${Math.round(v || 0).toLocaleString('fr-FR')} €`;

/**
 * @param {object|null} summary            - résultat computeFoyerSummary (null → '')
 * @param {object}      [parsedProfile={}] - pour les plafonds PER par déclarant
 * @returns {string} bloc Markdown, '' si pas de summary
 */
export function buildChiffresOfficiels(summary, parsedProfile = {}) {
  if (!summary) return '';
  const p = parsedProfile || {};
  const lignes = [
    "## CHIFFRES OFFICIELS DU FOYER (calculés par l'application — font autorité)",
    `RNI foyer : ${eur(summary.rniFoyer)} · Parts fiscales : ${summary.partsFiscales} · TMI : ${summary.tmi} %`,
    `IR net : ${eur(summary.irNet)}${summary.decote > 0 ? ` · Décote : ${eur(summary.decote)}` : ''}${summary.cehr > 0 ? ` · CEHR : ${eur(summary.cehr)}` : ''}`,
    `TOTAL DÛ : ${eur(summary.totalDu)} · PAS prélevé : ${eur(summary.pasTotal)} · Solde : ${eur(Math.abs(summary.solde))} ${summary.solde >= 0 ? 'à payer' : 'de remboursement'}`,
  ];
  if ((p.plafondPerD1 || 0) > 0 || (p.plafondPerD2 || 0) > 0) {
    lignes.push(`Plafond PER disponible : D1 ${eur(p.plafondPerD1)}${(p.plafondPerD2 || 0) > 0 ? ` · D2 ${eur(p.plafondPerD2)}` : ''}`);
  }
  const arb = summary.arbitrageCapital;
  if (arb && (arb.pfu > 0 || arb.bareme > 0)) {
    lignes.push(`Arbitrage 2OP (global div + intérêts + PV) : recommandé ${arb.recommande === 'bareme' ? 'barème' : 'PFU'} · PFU ${eur(arb.pfu)} vs barème ${eur(arb.bareme)} · économie ${eur(arb.economie)}`);
  }
  lignes.push('Ne recalcule JAMAIS ces montants : cite-les tels quels. Tout calcul libre doit être annoncé comme une simulation hypothétique.');
  return lignes.join('\n');
}
