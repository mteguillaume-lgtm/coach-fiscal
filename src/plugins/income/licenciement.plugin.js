import { n, section } from '../../lib/profileParserUtils.js';
import { PLAFOND_LICENCIEMENT_MAX } from '../../lib/taxCalculator.js';

// CGI art. 80 duodecies : exonération de l'indemnité de licenciement.
// Formule : exo = min(indem_totale, max(2×rémun_annuelle, légale_conventionnelle, 50%×indem_totale))
//           plafonnée à PLAFOND_LICENCIEMENT_MAX = 5 × PASS = 235 500 € (2025).
// Imposable (excédent) → case 1AJ/1BJ.
// Non-imposable (exonéré) → case 1AD/1BD (informatif, non saisissable sur 2042).

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'licenciement',
  label: 'Indemnité de licenciement — art. 80 duodecies CGI (1AJ/1BD)',
  version: '1.0.0',

  fields: [
    { key: 'indem_totale',        label: 'Indemnité totale reçue (€)',                   type: 'number', required: false, declarant: null },
    { key: 'indem_legale',        label: 'Montant légal ou conventionnel (€)',            type: 'number', required: false, declarant: null },
    { key: 'remuneration_annuelle', label: 'Rémunération annuelle de référence (€)',      type: 'number', required: false, declarant: null },
  ],

  parser(text, mode) {
    const secD1 = mode === 'couple'
      ? section(text, '== INDEMNITÉ DE LICENCIEMENT — DÉCLARANT 1 ==')
      : section(text, '== INDEMNITÉ DE LICENCIEMENT ==');
    const secD2 = mode === 'couple'
      ? section(text, '== INDEMNITÉ DE LICENCIEMENT — DÉCLARANT 2 ==')
      : '';

    const readFields = (sec) => ({
      indemTotale:         n(sec, /Indemnité totale\s*:\s*([\d\s,]+)\s*€/i),
      indemLegale:         n(sec, /Indemnité légale ou conventionnelle\s*:\s*([\d\s,]+)\s*€/i),
      remunerationAnnuelle: n(sec, /Rémunération annuelle de référence\s*:\s*([\d\s,]+)\s*€/i),
    });

    const d1 = readFields(secD1);
    const d2 = readFields(secD2);
    return {
      indemTotaleD1:          d1.indemTotale,
      indemLegaleD1:          d1.indemLegale,
      remunerationAnnuelleD1: d1.remunerationAnnuelle,
      indemTotaleD2:          d2.indemTotale,
      indemLegaleD2:          d2.indemLegale,
      remunerationAnnuelleD2: d2.remunerationAnnuelle,
    };
  },

  generator(formData, d1Data, d2Data, mode) {
    const renderLicenciement = (data, declarantNum) => {
      const tot  = parseFloat(data?.indem_totale        || 0);
      const leg  = parseFloat(data?.indem_legale        || 0);
      const rem  = parseFloat(data?.remuneration_annuelle || 0);
      if (!tot) return '';
      const exoCandidate = Math.max(leg, 2 * rem, 0.5 * tot);
      const exo = Math.min(tot, Math.min(exoCandidate, PLAFOND_LICENCIEMENT_MAX));
      const imp = Math.max(0, tot - exo);
      const header = mode === 'couple'
        ? `== INDEMNITÉ DE LICENCIEMENT — DÉCLARANT ${declarantNum} ==`
        : '== INDEMNITÉ DE LICENCIEMENT ==';
      return [
        header,
        `Indemnité totale : ${fmtN(tot)}`,
        `Indemnité légale ou conventionnelle : ${fmtN(leg)}`,
        `Rémunération annuelle de référence : ${fmtN(rem)}`,
        `Exonération IR (art. 80 duodecies) : ${fmtN(exo)}`,
        `Net imposable (1AJ) : ${fmtN(imp)}`,
      ].join('\n');
    };

    const parts = [renderLicenciement(d1Data || {}, '1')];
    if (mode === 'couple') parts.push(renderLicenciement(d2Data || {}, '2'));
    return parts.filter(Boolean).join('\n');
  },

  validator(formData) {
    const errors = [];
    const tot = parseFloat(formData?.indem_totale);
    const leg = parseFloat(formData?.indem_legale);
    const rem = parseFloat(formData?.remuneration_annuelle);
    if (formData?.indem_totale && (isNaN(tot) || tot < 0))
      errors.push({ field: 'indem_totale', message: 'Indemnité totale invalide (≥ 0)' });
    if (formData?.indem_legale && (isNaN(leg) || leg < 0))
      errors.push({ field: 'indem_legale', message: 'Indemnité légale invalide (≥ 0)' });
    if (formData?.remuneration_annuelle && (isNaN(rem) || rem < 0))
      errors.push({ field: 'remuneration_annuelle', message: 'Rémunération annuelle invalide (≥ 0)' });
    if (!isNaN(leg) && !isNaN(tot) && leg > tot)
      errors.push({ field: 'indem_legale', message: 'Le montant légal ne peut excéder l\'indemnité totale' });
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    const calcExo = (tot, leg, rem) => {
      if (!tot) return { exo: 0, imp: 0 };
      const exoCandidate = Math.max(leg || 0, 2 * (rem || 0), 0.5 * tot);
      const exo = Math.min(tot, Math.min(exoCandidate, PLAFOND_LICENCIEMENT_MAX));
      return { exo: Math.round(exo), imp: Math.max(0, Math.round(tot - exo)) };
    };
    const d1 = calcExo(v1.indemTotaleD1, v1.indemLegaleD1, v1.remunerationAnnuelleD1);
    const d2 = calcExo(v1.indemTotaleD2, v1.indemLegaleD2, v1.remunerationAnnuelleD2);
    return {
      // Imposable → s'additionne en 1AJ/1BJ
      rniLicenciementD1: d1.imp,
      rniLicenciementD2: d2.imp,
      // Exonéré → case 1AD/1BD (informatif)
      exoLicenciementD1: d1.exo,
      exoLicenciementD2: d2.exo,
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1AJ', label: 'Licenciement — part imposable D1', declarant: 'D1', required: false },
      { caseCode: '1BJ', label: 'Licenciement — part imposable D2', declarant: 'D2', required: false },
      { caseCode: '1AD', label: 'Licenciement — part exonérée D1 (informatif)', declarant: 'D1', required: false },
      { caseCode: '1BD', label: 'Licenciement — part exonérée D2 (informatif)', declarant: 'D2', required: false },
    ];
  },
};
