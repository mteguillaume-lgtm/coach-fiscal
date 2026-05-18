import { n, s, section } from '../../lib/profileParserUtils.js';
import {
  PLAFOND_PPV_SANS_ACCORD,
  PLAFOND_PPV_AVEC_ACCORD,
  SEUIL_3_SMIC_2025,
} from '../../lib/taxCalculator.js';

// Loi n° 2022-1158 — PPV (Prime de partage de la valeur).
// Exonération IR jusqu'au 31/12/2026 si :
//   - Entreprise < 50 salariés ET rémunération < 3 SMIC (64 866 € en 2025)
//   - OU affectation PEE/PERECO (toutes entreprises, sans limite de salaire)
// Plafond : 3 000 € sans accord intéressement, 6 000 € avec accord.
// Depuis 01/01/2024 : entreprises ≥ 50 salariés → toujours imposable (sauf PEE/PERECO).

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

function _isOui(val) {
  return /^oui$/i.test((val || '').trim());
}

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'ppv',
  label: 'Prime de partage de la valeur (PPV) — loi 2022-1158',
  version: '1.0.0',

  fields: [
    { key: 'montant_ppv',            label: 'Montant PPV reçu (€)',                         type: 'number',  required: false, declarant: null },
    { key: 'remuneration_ref_12mois', label: 'Rémunération brute 12 mois précédents (€)',    type: 'number',  required: false, declarant: null },
    { key: 'accord_interessement',    label: 'Accord d\'intéressement (OUI/NON)',             type: 'boolean', required: false, declarant: null },
    { key: 'taille_entreprise_50plus', label: 'Entreprise ≥ 50 salariés (OUI/NON)',          type: 'boolean', required: false, declarant: null },
    { key: 'affectation_pee',         label: 'Affectation PEE/PERECO (OUI/NON)',             type: 'boolean', required: false, declarant: null },
  ],

  parser(text, mode) {
    const secD1 = mode === 'couple'
      ? section(text, '== PRIME DE PARTAGE DE LA VALEUR — DÉCLARANT 1 ==')
      : section(text, '== PRIME DE PARTAGE DE LA VALEUR ==');
    const secD2 = mode === 'couple'
      ? section(text, '== PRIME DE PARTAGE DE LA VALEUR — DÉCLARANT 2 ==')
      : '';

    const readPpv = (sec) => ({
      montantPpv:          n(sec, /Montant PPV\s*:\s*([\d\s,]+)\s*€/i),
      remunerationRef12:   n(sec, /Rémunération brute 12 mois précédents\s*:\s*([\d\s,]+)\s*€/i),
      accordInteressement: _isOui(s(sec, /Accord d'intéressement\s*:\s*([^\n]+)/i)),
      tailleEntreprise50p: !s(sec, /Taille entreprise\s*:\s*([^\n]+)/i).includes('< 50'),
      affectationPee:      _isOui(s(sec, /Affectation PEE\/PERECO\s*:\s*([^\n]+)/i)),
    });

    const d1 = readPpv(secD1);
    const d2 = readPpv(secD2);
    return {
      montantPpvD1:          d1.montantPpv,
      remunerationRef12D1:   d1.remunerationRef12,
      accordInteressementD1: d1.accordInteressement,
      tailleEntreprise50pD1: d1.tailleEntreprise50p,
      affectationPeeD1:      d1.affectationPee,
      montantPpvD2:          d2.montantPpv,
      remunerationRef12D2:   d2.remunerationRef12,
      accordInteressementD2: d2.accordInteressement,
      tailleEntreprise50pD2: d2.tailleEntreprise50p,
      affectationPeeD2:      d2.affectationPee,
    };
  },

  generator(formData, d1Data, d2Data, mode) {
    const renderPpv = (data, declarantNum) => {
      const montant = parseFloat(data?.montant_ppv || 0);
      if (!montant) return '';
      const remRef    = parseFloat(data?.remuneration_ref_12mois || 0);
      const accord    = data?.accord_interessement  ? 'OUI' : 'NON';
      const taille50p = data?.taille_entreprise_50plus ? '≥ 50 salariés' : '< 50 salariés';
      const pee       = data?.affectation_pee       ? 'OUI' : 'NON';
      const header = mode === 'couple'
        ? `== PRIME DE PARTAGE DE LA VALEUR — DÉCLARANT ${declarantNum} ==`
        : '== PRIME DE PARTAGE DE LA VALEUR ==';
      return [
        header,
        `Montant PPV : ${fmtN(montant)}`,
        `Rémunération brute 12 mois précédents : ${fmtN(remRef)}`,
        `Accord d'intéressement : ${accord}`,
        `Taille entreprise : ${taille50p}`,
        `Affectation PEE/PERECO : ${pee}`,
      ].join('\n');
    };

    const parts = [renderPpv(d1Data || {}, '1')];
    if (mode === 'couple') parts.push(renderPpv(d2Data || {}, '2'));
    return parts.filter(Boolean).join('\n');
  },

  validator(formData) {
    const errors = [];
    const montant = parseFloat(formData?.montant_ppv);
    const remRef  = parseFloat(formData?.remuneration_ref_12mois);
    if (formData?.montant_ppv && (isNaN(montant) || montant < 0))
      errors.push({ field: 'montant_ppv', message: 'Montant PPV invalide (≥ 0)' });
    if (formData?.remuneration_ref_12mois && (isNaN(remRef) || remRef < 0))
      errors.push({ field: 'remuneration_ref_12mois', message: 'Rémunération de référence invalide (≥ 0)' });
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    const calcPpv = (montant, remRef, accord, taille50p, pee) => {
      if (!montant) return { imposable: 0, exonere: 0, exoReason: 'aucun montant' };
      const plafond = accord ? PLAFOND_PPV_AVEC_ACCORD : PLAFOND_PPV_SANS_ACCORD;
      // PEE/PERECO : exonéré IR sans limite de salaire (toutes entreprises)
      if (pee) return { imposable: 0, exonere: montant, exoReason: 'pee-pereco' };
      // Entreprise ≥ 50 salariés : imposable depuis 01/01/2024
      if (taille50p) return { imposable: montant, exonere: 0, exoReason: 'grande-entreprise' };
      // Entreprise < 50 : exo si remuneration < 3 SMIC et montant ≤ plafond
      if (remRef < SEUIL_3_SMIC_2025 && montant <= plafond)
        return { imposable: 0, exonere: montant, exoReason: 'petite-entreprise' };
      // Hors conditions : imposable
      return { imposable: montant, exonere: 0, exoReason: 'hors-conditions' };
    };

    const d1 = calcPpv(
      v1.montantPpvD1, v1.remunerationRef12D1,
      v1.accordInteressementD1, v1.tailleEntreprise50pD1, v1.affectationPeeD1
    );
    const d2 = calcPpv(
      v1.montantPpvD2, v1.remunerationRef12D2,
      v1.accordInteressementD2, v1.tailleEntreprise50pD2, v1.affectationPeeD2
    );
    return {
      rniPpvD1: d1.imposable,
      rniPpvD2: d2.imposable,
      ppvExoD1: d1.exonere,
      ppvExoD2: d2.exonere,
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1AJ', label: 'PPV imposable D1 (grande entreprise ou hors conditions)', declarant: 'D1', required: false },
      { caseCode: '1BJ', label: 'PPV imposable D2 (grande entreprise ou hors conditions)', declarant: 'D2', required: false },
    ];
  },
};
