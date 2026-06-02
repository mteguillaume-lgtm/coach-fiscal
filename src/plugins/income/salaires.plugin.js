import { n, f, s, section } from '../../lib/profileParserUtils.js';
import { abattement10Auto, calculFraisKilometriques } from '../../lib/taxCalculator.js';

const fmtN = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

/** Extrait les blocs "Source N — Type : Organisme" d'une section de revenus. */
function _parseSources(sec) {
  if (!sec) return null;
  const blocks = sec.split(/\n\s*(?=Source\s+\d+\s+—)/);
  const sources = [];
  for (const block of blocks) {
    const hdr = block.match(/Source\s+\d+\s+—\s+([^:\n]+):\s*([^\n]+)/);
    if (!hdr) continue;
    const typeLabel = hdr[1].trim();
    const organisme = hdr[2].trim();
    const body = block.slice(hdr[0].length);
    const typeRaw = s(body, /Type source\s*:\s*([^\n]+)/)
      || (typeLabel === 'CPAM' ? 'cpam' : typeLabel === 'France Travail' ? 'france-travail' : 'employeur');
    sources.push({
      type:      typeRaw.trim(),
      organisme,
      brut:      n(body, /Brut imposable\s*:\s*([\d\s,]+)\s*€/),
      net:       n(body, /Net imposable\s*:\s*([\d\s,]+)\s*€/),
      pas:       n(body, /PAS prélevé\s*:\s*([\d\s,]+)\s*€/),
      tauxPas:   f(body, /Taux PAS\s*:\s*([\d,.]+)\s*%/),
    });
  }
  return sources.length > 0 ? sources : null;
}

/** Génère la section FRAIS RÉELS depuis les données formulaire d'un déclarant. */
function _generateFraisReels(data, mode, declarantNum) {
  const dist  = parseFloat(data?.frais_distance_aller || 0);
  const jours = parseFloat(data?.frais_jours || 0);
  const cv    = parseInt(data?.frais_cv || 0, 10);
  if (!dist || !jours || !cv) return '';
  const elec   = !!data?.frais_electrique;
  const autres = parseFloat(data?.frais_autres || 0);
  const option = !!data?.frais_option;
  const distAnnuelle = dist * 2 * jours;
  const fraisKm = calculFraisKilometriques(distAnnuelle, cv, elec);
  const header = mode === 'couple'
    ? `== FRAIS RÉELS — DÉCLARANT ${declarantNum} ==`
    : '== FRAIS RÉELS ==';
  return [
    header,
    `Distance aller (km) : ${dist}`,
    `Jours travaillés : ${jours}`,
    `Puissance fiscale (CV) : ${cv}`,
    `Véhicule électrique : ${elec ? 'OUI' : 'NON'}`,
    `Autres frais professionnels : ${fmtN(autres)}`,
    `Option frais réels : ${option ? 'OUI' : 'NON'}`,
    `--- Calcul ---`,
    `Distance annuelle (km) : ${distAnnuelle}`,
    `Frais kilométriques : ${fmtN(fraisKm)}`,
    `Total frais réels : ${fmtN(fraisKm + autres)}`,
  ].join('\n');
}

/** @type {import('../types.js').IncomePlugin} */
export default {
  id: 'salaires',
  label: 'Salaires et traitements (1AJ/1BJ)',
  version: '1.0.0',

  fields: [
    { key: 'net_imp',     label: 'Net imposable (1AJ/1BJ)', type: 'number', required: true,  declarant: null },
    { key: 'brut',        label: 'Brut imposable',           type: 'number', required: false, declarant: null },
    { key: 'pas_tot',     label: 'PAS prélevé 2025',         type: 'number', required: true,  declarant: null },
    { key: 'taux_pas',    label: 'Taux PAS (%)',             type: 'number', required: false, declarant: null },
    { key: 'ij_cpam',     label: 'IJ CPAM incluses dans net', type: 'number', required: false, declarant: null },
    { key: 'ij_cpam_org', label: 'Organisme attestation CPAM', type: 'string', required: false, declarant: null },
    // sources[] est géré via formData.d1Data.sources (tableau dynamique Collect.jsx)
    // ─── Frais réels (PR A5) ──────────────────────────────────────────────────
    { key: 'frais_distance_aller', label: 'Distance domicile-travail aller (km)', type: 'number', required: false, declarant: null },
    { key: 'frais_jours',          label: 'Jours travaillés dans l\'année',        type: 'number', required: false, declarant: null },
    { key: 'frais_cv',             label: 'Puissance fiscale du véhicule (CV)',   type: 'number', required: false, declarant: null },
    { key: 'frais_electrique',     label: 'Véhicule 100% électrique',             type: 'boolean', required: false, declarant: null },
    { key: 'frais_autres',         label: 'Autres frais professionnels (péage, stationnement...) €', type: 'number', required: false, declarant: null },
    { key: 'frais_option',         label: 'Option frais réels retenue',           type: 'boolean', required: false, declarant: null },
  ],

  parser(text, mode) {
    const secRevD1 = mode === 'couple'
      ? section(text, '== REVENUS 2025 — DÉCLARANT 1 ==')
      : section(text, '== REVENUS 2025 ==');
    const secRevD2 = mode === 'couple'
      ? section(text, '== REVENUS 2025 — DÉCLARANT 2 ==')
      : '';
    const secFrD1 = mode === 'couple'
      ? section(text, '== FRAIS RÉELS — DÉCLARANT 1 ==')
      : section(text, '== FRAIS RÉELS ==');
    const secFrD2 = mode === 'couple'
      ? section(text, '== FRAIS RÉELS — DÉCLARANT 2 ==')
      : '';

    const parseFraisReels = (sec) => ({
      distanceAller: n(sec, /Distance aller\s+\(km\)\s*:\s*(\d+)/i),
      jours:         n(sec, /Jours travaillés\s*:\s*(\d+)/i),
      cv:            n(sec, /Puissance fiscale\s+\(CV\)\s*:\s*(\d+)/i),
      electrique:    /^oui$/i.test(s(sec, /Véhicule électrique\s*:\s*([^\n]+)/i)),
      autres:        n(sec, /Autres frais professionnels\s*:\s*([\d\s,]+)\s*€/i),
      option:        /^oui$/i.test(s(sec, /Option frais réels\s*:\s*([^\n]+)/i)),
    });

    const frD1 = parseFraisReels(secFrD1);
    const frD2 = parseFraisReels(secFrD2);

    return {
      salaireNetImposableD1:   n(secRevD1, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      salairesBrutImposableD1: n(secRevD1, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      pasD1:       n(secRevD1, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/),
      tauxPasD1:   f(secRevD1, /Taux PAS\s*:\s*([\d,.]+)\s*%/),
      ijCpamD1:    n(secRevD1, /\(dont\s+([\d\s,]+)\s*€\s*IJ\s*CPAM/i),
      ijCpamOrgD1: s(secRevD1, /IJ\s*CPAM[^—\n]*—\s*attestation\s+([^)\n]+)/i),
      salaireSourcesD1: _parseSources(secRevD1),
      fraisDistanceAllerD1: frD1.distanceAller,
      fraisJoursD1:         frD1.jours,
      fraisCvD1:            frD1.cv,
      fraisElectriqueD1:    frD1.electrique,
      fraisAutresD1:        frD1.autres,
      fraisOptionD1:        frD1.option,

      salaireNetImposableD2:   n(secRevD2, /Net imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      salairesBrutImposableD2: n(secRevD2, /Brut imposable annuel[^:]*:\s*([\d\s,]+)\s*€/),
      pasD2:       n(secRevD2, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/),
      tauxPasD2:   f(secRevD2, /Taux PAS\s*:\s*([\d,.]+)\s*%/),
      ijCpamD2:    n(secRevD2, /\(dont\s+([\d\s,]+)\s*€\s*IJ\s*CPAM/i),
      ijCpamOrgD2: s(secRevD2, /IJ\s*CPAM[^—\n]*—\s*attestation\s+([^)\n]+)/i),
      salaireSourcesD2: _parseSources(secRevD2),
      fraisDistanceAllerD2: frD2.distanceAller,
      fraisJoursD2:         frD2.jours,
      fraisCvD2:            frD2.cv,
      fraisElectriqueD2:    frD2.electrique,
      fraisAutresD2:        frD2.autres,
      fraisOptionD2:        frD2.option,
    };
  },

  generator(formData, d1Data, d2Data, mode) {
    const d1 = d1Data || {};
    const net = parseFloat(d1.net_imp || 0);
    const pas = parseFloat(d1.pas_tot || 0);
    const ijCpam = parseFloat(d1.ij_cpam || 0);
    if (!net) return '';

    const brut = parseFloat(d1.brut || 0);
    const sources = Array.isArray(d1.sources) ? d1.sources : null;

    const lines = [];
    if (brut > 0) lines.push(`Brut imposable annuel : ${fmtN(brut)}`);

    const netLine = `Net imposable annuel (1AJ — case déclaration) : ${fmtN(net)}`
      + (ijCpam > 0 ? ` (dont ${fmtN(ijCpam)} IJ CPAM — attestation ${d1.ij_cpam_org || 'CPAM'})` : '');
    lines.push(netLine);

    if (d1.taux_pas && !sources) lines.push(`Taux PAS : ${d1.taux_pas}%`);
    if (pas > 0) lines.push(`PAS prélevé 2025 : ${fmtN(pas)}`);

    if (sources && sources.length > 0) {
      const TYPE_LABELS = { cpam: 'CPAM', 'france-travail': 'France Travail', assureur: 'Assureur' };
      sources.forEach((src, i) => {
        const typeLabel = TYPE_LABELS[src.type] || 'Employeur';
        const orgAndPeriod = [src.organisme, src.periode].filter(Boolean).join(' ');
        lines.push('');
        lines.push(`  Source ${i + 1} — ${typeLabel} : ${orgAndPeriod || 'Non renseigné'}`);
        lines.push(`  Type source : ${src.type || 'employeur'}`);
        if (src.brut) lines.push(`  Brut imposable : ${fmtN(parseFloat(src.brut))}`);
        if (src.net)  lines.push(`  Net imposable : ${fmtN(parseFloat(src.net))}`);
        lines.push(`  PAS prélevé : ${fmtN(parseFloat(src.pas || 0))}`);
        if (src.tauxPas) lines.push(`  Taux PAS : ${src.tauxPas}%`);
      });
    }

    // Frais réels section — émise uniquement si données présentes
    const fraisSection = _generateFraisReels(d1, mode, '1');
    if (fraisSection) lines.push('\n' + fraisSection);

    return lines.join('\n');
  },

  validator(formData) {
    const errors = [];
    const net = parseFloat(formData?.net_imp);
    if (!formData?.net_imp || isNaN(net) || net < 0) {
      errors.push({ field: 'net_imp', message: 'Net imposable annuel requis (≥ 0)' });
    }
    return { valid: errors.length === 0, errors };
  },

  calculator(v1) {
    const _calcDeclarant = (sal, typeRevenu, pension, distAller, jours, cv, elec, autresFrais, optionReels) => {
      const forfaitRni = abattement10Auto(sal || 0, typeRevenu || 'Salarié(e)', pension || 0);
      const forfaitMontant = (sal || 0) - forfaitRni; // abattement forfait 10%

      const distAnnuelle = (distAller || 0) * 2 * (jours || 0);
      const fraisKm = distAnnuelle > 0
        ? calculFraisKilometriques(distAnnuelle, cv || 5, elec || false)
        : 0;
      const fraisReelsTotaux = fraisKm + (autresFrais || 0);
      const recommandeReels = fraisReelsTotaux > 0 && fraisReelsTotaux > forfaitMontant;

      const useReels = optionReels === true;
      const rni = useReels ? Math.max(0, (sal || 0) - fraisReelsTotaux) : forfaitRni;

      return {
        rni,
        fraisKm,
        fraisReelsTotaux,
        forfaitMontant,
        recommandeReels,
        montant1AK: useReels ? fraisReelsTotaux : 0,
        distanceAnnuelle: distAnnuelle,
      };
    };

    const d1 = _calcDeclarant(
      v1.salaireNetImposableD1, v1.typeRevenuD1, v1.pensionNetImpD1,
      v1.fraisDistanceAllerD1, v1.fraisJoursD1, v1.fraisCvD1,
      v1.fraisElectriqueD1, v1.fraisAutresD1, v1.fraisOptionD1
    );
    const d2 = _calcDeclarant(
      v1.salaireNetImposableD2, v1.typeRevenuD2, v1.pensionNetImpD2,
      v1.fraisDistanceAllerD2, v1.fraisJoursD2, v1.fraisCvD2,
      v1.fraisElectriqueD2, v1.fraisAutresD2, v1.fraisOptionD2
    );

    return {
      rniD1: d1.rni,
      rniD2: d2.rni,
      fraisKmD1:          d1.fraisKm,
      fraisReelsTotauxD1: d1.fraisReelsTotaux,
      forfaitMontantD1:   d1.forfaitMontant,
      recommandeReelsD1:  d1.recommandeReels,
      montant1AKD1:       d1.montant1AK,
      distanceAnnuelleD1: d1.distanceAnnuelle,
      fraisKmD2:          d2.fraisKm,
      fraisReelsTotauxD2: d2.fraisReelsTotaux,
      forfaitMontantD2:   d2.forfaitMontant,
      recommandeReelsD2:  d2.recommandeReels,
      montant1AKD2:       d2.montant1AK,
      distanceAnnuelleD2: d2.distanceAnnuelle,
    };
  },

  declarativeCases() {
    return [
      { caseCode: '1AJ', label: 'Salaires nets imposables D1', declarant: 'D1', required: true },
      { caseCode: '1BJ', label: 'Salaires nets imposables D2', declarant: 'D2', required: false },
      { caseCode: '1AK', label: 'Frais réels D1 (si option frais réels)', declarant: 'D1', required: false },
      { caseCode: '1BK', label: 'Frais réels D2 (si option frais réels)', declarant: 'D2', required: false },
    ];
  },
};
