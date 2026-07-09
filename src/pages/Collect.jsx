import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import toast              from 'react-hot-toast';
import {
  ChevronDown, X, CheckCircle, AlertCircle, Loader2, ArrowLeft,
  Upload, Sparkles, Users, User, Home, TrendingUp, Scissors, Building2, FolderOpen,
  Settings2, Eye,
} from 'lucide-react';

import { useApp }                   from '../context/AppContext';
import FieldRow from '../components/FieldRow';
import { fieldVisible } from '../lib/fieldVisibility';
import { mapExtracted }             from '../lib/extractor';
import { analyzeDoc }               from '../lib/providers';
import { pdfToImages }              from '../lib/pdfRasterizer';
import { mapExtractToForm }         from '../lib/docExtract';
import { parseProfile }             from '../lib/profileParser';
import { buildProfile }             from '../lib/profileGenerator';
import { abattement10 }             from '../lib/taxCalculator';
import { registry }                 from '../plugins/registry.js';
import Button                       from '../components/Button';

// ─── Compute helpers (module-level — called by FieldRow at render time) ────────

function _parseMMAAAA(value) {
  if (!value || !value.includes('/')) return null;
  const [m, y] = value.split('/');
  const year = parseInt(y, 10); const month = parseInt(m, 10);
  if (isNaN(year) || isNaN(month) || year < 1970 || year > 2100) return null;
  const d = new Date(year, month - 1, 1);
  return d > new Date() ? null : d;
}

function computePeaDate(data, value) {
  const d = _parseMMAAAA(value);
  if (!d) return null;
  const ageYears = (Date.now() - d) / 31_557_600_000;
  const age  = Math.floor(ageYears);
  const ok   = ageYears >= 5;
  const verse = parseFloat(data.pea_verse || 0);
  const espace = Math.max(0, 150_000 - verse);
  const line1 = ok
    ? `✅ Antériorité ${age} ans — exonération IR acquise (PS 17,2 % toujours dus)`
    : `⚠️ Antériorité ${age} ans — encore ${Math.ceil((5 - ageYears) * 12)} mois avant exonération IR`;
  return verse > 0 ? `${line1}\nEspace versement restant : ${espace.toLocaleString('fr-FR')} €` : line1;
}

function computePelDate(_data, value) {
  const d = _parseMMAAAA(value);
  if (!d) return null;
  const year  = d.getFullYear();
  const month = d.getMonth() + 1; // getMonth() est 0-indexé
  // Changement de régime au 1er mars 2011 (BOI-RPPM-RCM-20-10-20-60)
  const avantMars2011 = year < 2011 || (year === 2011 && month < 3);
  if (avantMars2011) return '✅ Ouvert avant mars 2011 — exonération IR (PS 17,2 % toujours dus)';
  if (year <= 2017) {
    const exoEnd = year + 12;
    return new Date().getFullYear() < exoEnd
      ? `✅ Exonéré IR jusqu'en ${exoEnd} (PS 17,2 % toujours dus)`
      : `⚠️ Exonération IR échue en ${exoEnd} — PFU 30 % applicable`;
  }
  // 2018 et au-delà (le changement s'applique dès le 1er janvier 2018)
  return '⚠️ Ouvert à partir de 2018 — PFU 30 % dès la 1re année';
}

function computeAvDate(_data, value) {
  const d = _parseMMAAAA(value);
  if (!d) return null;
  const ageYears = (Date.now() - d) / 31_557_600_000;
  const age = Math.floor(ageYears);
  return ageYears >= 8
    ? `✅ Antériorité ${age} ans — abattement fiscal acquis`
    : `⚠️ Antériorité ${age} ans — encore ${Math.ceil((8 - ageYears) * 12)} mois avant l'abattement 8 ans`;
}

function computeCryptoPv(data) {
  // Seuil 305 € = montant brut des cessions (pas la PV) — art. 150 VH bis CGI
  // Au-delà : 2086 obligatoire ET imposition sur toute la PV (pas seulement l'excédent)
  const cede = parseFloat(data.crypto_montant_cede || 0);
  if (cede > 305) return '⚠️ Cessions > 305 € — formulaire 2086 obligatoire (PV imposée en totalité)';
  if (cede > 0) return '✅ Cessions ≤ 305 € — exonération totale si pas d\'autres cessions 2025';
  return null;
}

const TMI_RET_HINT = 'Estimez votre tranche d\'imposition à la retraite. 11% par défaut (pension < ~29 000 €/an). Crucial pour comparer PER vs PEA.';

// ─── Plugin income UI metadata (ph / hint / dependsOn / opts / label overrides) ─

const INCOME_UI = {
  net_imp:              { label: 'Net imposable annuel (€)',           ph: '43 875', essential: true,
    hint: 'Le chiffre clé du calcul. Sur votre fiche de paie de décembre : ligne « Net imposable » cumul annuel. Ou case 1AJ de votre avis d\'impôt.' },
  brut:                 { label: 'Brut imposable annuel (€)',          ph: '54 810' },
  pas_tot:              { label: 'PAS prélevé 2025 (€)',               ph: '4 302', essential: true,
    hint: 'Total de l\'impôt déjà prélevé à la source sur l\'année (cumul « Impôt sur le revenu prélevé » de votre fiche de paie de décembre).' },
  taux_pas:             { label: 'Taux PAS (%)',                        ph: '11.80'  },
  ij_cpam:              { label: 'IJ CPAM dans net imposable (€)',      ph: '0',
    hint: "Indemnités journalières CPAM incluses dans 1AJ/1BJ. Déjà dans le net imposable — champ informatif uniquement." },
  ij_cpam_org:          { label: 'IJ CPAM — attestation (CPAM)',        ph: 'ex: Maine-et-Loire',
    dependsOn: { key: 'ij_cpam', check: v => parseFloat(v || 0) > 0 } },
  rente_1bs_montant:    { label: 'Rente viagère — case 1BS (€)',        ph: '0',
    hint: 'Montant net de CSG déductible déclaré en 1AS/1BS (retraite ou réversion). Abattement 10% appliqué (min 450 €/max 4 321 €).' },
  rente_1bs_pas:        { label: 'PAS sur rente 1BS (€)',               ph: '0',
    dependsOn: { key: 'rente_1bs_montant', check: v => parseFloat(v || 0) > 0 } },
  rente_1bs_organisme:  { label: 'Rente 1BS — organisme',               ph: 'ex: Crédit Agricole Assurance',
    dependsOn: { key: 'rente_1bs_montant', check: v => parseFloat(v || 0) > 0 } },
  rente_1bs_recurrent:  { label: 'Rente 1BS — récurrente ?',            type: 'select', opts: ['Oui', 'Non'],
    dependsOn: { key: 'rente_1bs_montant', check: v => parseFloat(v || 0) > 0 } },
  foncier:              { label: 'Revenus fonciers (€)',                 ph: '0' },
  int_mob_2tr:          { label: 'Intérêts Livret+/mobiliers — case 2TR (€)', ph: '0',
    requires: 'capitauxMobiliers',
    hint: "Intérêts d'un Livret bancaire, CTO ou produit hors Livret A/LDDS/LEP. Prérempli par la banque." },
  int_mob_2ck:          { label: 'PFU 12,8% déjà prélevé — case 2CK (€)',    ph: '0',
    requires: 'capitauxMobiliers',
    dependsOn: { key: 'int_mob_2tr', check: v => parseFloat(v || 0) > 0 },
    hint: "Crédit d'impôt = PFU 12,8% prélevé à la source. Figurera en case 2CK." },
};

function pluginFields(ids, excludeKeys = []) {
  return ids.flatMap(id => {
    const plugin = registry.getById(id);
    if (!plugin) return [];
    return plugin.fields
      .filter(f => !excludeKeys.includes(f.key))
      .map(f => ({ ...f, ...(INCOME_UI[f.key] || {}) }));
  });
}

// ─── Section data (module-level — stable references) ──────────────────────────

const SECTION_SIT = {
  id: 'sit', Icon: User, label: 'Situation du foyer', fields: [
    { key: 'statut',  label: 'Situation familiale', type: 'select', opts: ['Célibataire', 'Marié(e)', 'Pacsé(e)', 'Divorcé(e)', 'Veuf/Veuve'], essential: true },
    { key: 'enfants', label: 'Enfants à charge (résidence principale)', type: 'number', ph: '0' },
    { key: 'enfants_alternes', label: 'Enfants en résidence alternée', type: 'number', ph: '0',
      hint: 'Garde alternée : chaque enfant compte pour la moitié des majorations de parts (0,25 / 0,25 / 0,5).' },
    { key: 'parent_isole', label: 'Parent isolé (case T) ?', type: 'select', opts: ['Non', 'Oui'],
      dependsOn: { key: 'enfants', check: v => parseFloat(v || 0) > 0 },
      hint: 'Case T : vous vivez seul(e) (sans concubin) et assumez la charge principale d\'au moins un enfant. +0,5 part (1er enfant → part entière). Art. 194-II CGI.' },
    { key: 'enfants_invalides', label: 'Enfants titulaires CMI-invalidité', type: 'number', ph: '0',
      dependsOn: { key: 'enfants', check: v => parseFloat(v || 0) > 0 },
      hint: '+0,5 part par enfant invalide (plafond d\'avantage spécifique 1 079 €).' },
    { key: 'invalidite_demiparts', label: 'Demi-parts invalidité déclarant/conjoint', type: 'number', ph: '0',
      hint: 'Cases P/F/G/S/W : invalidité, ancien combattant, veuvage de guerre. 1 demi-part chacune (plafond 1 079 €).' },
    { key: 'enfants_rattaches', label: 'Enfants majeurs rattachés', type: 'number', ph: '0',
      hint: 'Enfant majeur < 21 ans (ou < 25 ans si étudiant) demandant le rattachement : compté comme enfant à charge pour les parts.' },
    { key: 'parts',   label: 'Parts fiscales (laisser vide = calcul auto)', type: 'number', ph: 'auto',
      hint: 'Laissez vide pour un calcul automatique depuis la composition du foyer (art. 194-195 CGI). Renseignez uniquement pour forcer une valeur.' },
    { key: 'dept',    label: 'Département',         type: 'text',   ph: 'Calvados (14)' },
  ],
};

// Champs frais-réels et IJ CPAM exclus de la collecte — gérés par le simulateur
// (frais réels) ou inutiles dans le flux UI (IJ CPAM déjà dans le net imposable).
const EXCLUDE_REV = [
  'pension_net_imp',
  'ij_cpam', 'ij_cpam_org',
  'frais_distance_aller', 'frais_jours', 'frais_cv',
  'frais_electrique', 'frais_autres', 'frais_option',
];

// PHASE 2 — Revenus des indépendants (TNS) au régime micro (BIC/BNC/BA).
// Les valeurs de tns_type sont les clés de regimes dans micro-tns.json.
const TNS_FIELDS = [
  { key: 'tns_type', label: 'Activité indépendante (régime micro)', type: 'select', requires: 'tns',
    opts: [
      { value: 'micro_bic_vente',   label: 'Micro-BIC — vente de marchandises (abat. 71 %)' },
      { value: 'micro_bic_service', label: 'Micro-BIC — prestations de services (abat. 50 %)' },
      { value: 'micro_bnc',         label: 'Micro-BNC — profession libérale (abat. 34 %)' },
      { value: 'micro_ba',          label: 'Micro-BA — bénéfice agricole (abat. 87 %)' },
    ],
    hint: 'Régime micro uniquement. Au régime réel (liasse 2031/2035) : faites établir le résultat par un expert-comptable, puis reportez le bénéfice.' },
  { key: 'tns_recettes', label: 'Recettes / CA brut annuel (€)', type: 'number', ph: '0', requires: 'tns',
    dependsOn: { key: 'tns_type', check: v => !!v },
    hint: 'Chiffre d\'affaires encaissé. Le bénéfice imposable = recettes − abattement forfaitaire, ajouté au revenu du foyer.' },
  { key: 'tns_vl', label: 'Versement libératoire de l\'IR ?', type: 'select', opts: ['Non', 'Oui'], requires: 'tns',
    dependsOn: { key: 'tns_type', check: v => !!v },
    hint: 'Option auto-entrepreneur : l\'IR est payé au fil de l\'eau (1 à 2,2 % du CA). Si choisie, ce revenu n\'est pas réintégré au barème progressif.' },
];

const REV_FIELDS = [
  ...pluginFields(['salaires', 'pensions-rentes'], EXCLUDE_REV),
  { key: 'frais_r', label: 'Frais réels (€)', type: 'number', ph: 'vide = forfait 10%',
    hint: 'Laissez vide pour utiliser l\'abattement forfaitaire 10 %. Renseignez uniquement si vos frais réels sont supérieurs — utilisez l\'onglet « Frais réels » du simulateur pour les calculer puis reporter ici.' },
  ...TNS_FIELDS,
];

// PHASE 3 — Immobilier locatif (foyer-level, émis par profileGenerator._immoBlock).
// Foncier réel (location nue, 2044) + déficit foncier, LMNP micro-BIC (loi Le Meur),
// LMNP réel (résultat saisi → expert-comptable), SCI à l'IR (transparence).
const IMMO_FIELDS = [
  { key: 'foncier_reel_recettes', label: 'Foncier réel — loyers bruts encaissés (€)', type: 'number', ph: '0', requires: 'foncier', advanced: true,
    hint: 'Location nue au régime réel (formulaire 2044). Si vos revenus fonciers bruts ≤ 15 000 €, le micro-foncier (champ ci-dessus) suffit.' },
  { key: 'foncier_reel_charges', label: 'Foncier réel — charges déductibles hors intérêts (€)', type: 'number', ph: '0', requires: 'foncier', advanced: true,
    dependsOn: { key: 'foncier_reel_recettes', check: v => parseFloat(v || 0) > 0 },
    hint: 'Travaux d\'entretien/réparation/amélioration, taxe foncière (hors TEOM), assurances, frais de gestion, charges de copropriété non récupérables. PAS les travaux de construction/agrandissement.' },
  { key: 'foncier_reel_interets', label: 'Foncier réel — intérêts d\'emprunt (€)', type: 'number', ph: '0', requires: 'foncier', advanced: true,
    dependsOn: { key: 'foncier_reel_recettes', check: v => parseFloat(v || 0) > 0 },
    hint: 'Intérêts d\'emprunt déductibles. Ils ne sont JAMAIS imputables sur le revenu global — uniquement sur les revenus fonciers.' },
  { key: 'foncier_reno_energ', label: 'Travaux de rénovation énergétique globale ?', type: 'select', opts: ['Non', 'Oui'], requires: 'foncier', advanced: true,
    dependsOn: { key: 'foncier_reel_recettes', check: v => parseFloat(v || 0) > 0 },
    hint: 'Si oui, le plafond d\'imputation du déficit foncier sur le revenu global passe de 10 700 € à 21 400 €.' },
  { key: 'sci_ir_net', label: 'Quote-part SCI à l\'IR — revenu foncier net (€)', type: 'number', ph: '0', requires: 'foncier', advanced: true,
    hint: 'SCI à l\'IR (transparence) : votre quote-part de revenu foncier net au prorata des parts. Transmission / démembrement → voir un notaire.' },
  { key: 'lmnp_type', label: 'Location meublée (LMNP) — régime micro', type: 'select', requires: 'foncier', advanced: true,
    opts: [
      { value: 'lmnp_longue_duree',          label: 'Meublé longue durée (abat. 50 %, ≤ 77 700 €)' },
      { value: 'meuble_tourisme_classe',     label: 'Meublé de tourisme classé / chambre d\'hôtes (abat. 50 %)' },
      { value: 'meuble_tourisme_non_classe', label: 'Meublé de tourisme non classé (abat. 30 %, ≤ 15 000 €)' },
    ],
    hint: 'Location meublée non professionnelle au micro-BIC. Réforme loi Le Meur (revenus 2025) : la distinction est désormais classé / non classé.' },
  { key: 'lmnp_recettes', label: 'LMNP micro — recettes brutes (€)', type: 'number', ph: '0', requires: 'foncier', advanced: true,
    dependsOn: { key: 'lmnp_type', check: v => !!v },
    hint: 'Loyers meublés encaissés. Bénéfice = recettes − abattement, ajouté au revenu (BIC) et soumis aux PS 17,2 %.' },
  { key: 'lmnp_reel_net', label: 'LMNP réel — résultat BIC net déjà établi (€)', type: 'number', ph: '0', requires: 'foncier', advanced: true,
    hint: 'Régime réel (amortissements) : reportez le résultat net établi par votre expert-comptable. Un bénéfice est ajouté au revenu ; un déficit n\'est pas imputable sur le revenu global (reportable 10 ans sur les BIC meublés).' },
  { key: 'lmnp_reel_recettes', label: 'LMNP réel — recettes meublées (€)', type: 'number', ph: '0', requires: 'foncier', advanced: true,
    dependsOn: { key: 'lmnp_reel_net', check: v => parseFloat(v || 0) !== 0 },
    hint: 'Recettes meublées au réel — sert uniquement à détecter une éventuelle bascule LMP (> 23 000 € ET > 50 % des revenus pro).' },
];

// Plus-values & capital (PHASE 4). PV mobilières (3VG) + moins-values reportables
// (3VH) → PFU 12,8 % + PS 17,2 % par défaut, option barème (abattement durée si
// titres acquis avant 2018). Crypto : option barème. PV immobilière (cession hors RP)
// = estimation prélevée chez le notaire, hors déclaration annuelle. Champs foyer.
const PV_FIELDS = [
  { key: 'pv_mob_gain', label: 'Plus-values mobilières — gain de l\'année (3VG) (€)', type: 'number', ph: '0', requires: 'capitauxMobiliers', advanced: true,
    hint: 'Plus-values de cession d\'actions/ETF/parts (compte-titres). Imposées au PFU 12,8 % + 17,2 % PS par défaut.' },
  { key: 'pv_mob_mv_reportees', label: 'Moins-values reportables (3VH) (€)', type: 'number', ph: '0', requires: 'capitauxMobiliers', advanced: true,
    dependsOn: { key: 'pv_mob_gain', check: v => parseFloat(v || 0) > 0 },
    hint: 'Moins-values de cession des 10 années précédentes non encore imputées. Elles s\'imputent en priorité sur les plus-values de même nature.' },
  { key: 'pv_mob_option_bareme', label: 'Option barème global 2OP (dividendes + intérêts + PV) ?', type: 'select', opts: ['Non', 'Oui'], requires: 'capitauxMobiliers', advanced: true,
    dependsOn: { key: 'pv_mob_gain', check: v => parseFloat(v || 0) > 0 },
    hint: 'L\'option barème est globale pour tous les revenus du capital de l\'année. Avantageuse à TMI faible et/ou pour les titres acquis avant 2018 (abattement durée).' },
  { key: 'pv_mob_anteriorite_2018', label: 'Titres acquis avant le 1er janvier 2018 ?', type: 'select', opts: ['Non', 'Oui'], requires: 'capitauxMobiliers', advanced: true,
    dependsOn: { key: 'pv_mob_option_bareme', value: 'Oui' },
    hint: 'L\'abattement pour durée de détention ne s\'applique qu\'aux titres acquis avant 2018 ET seulement si option barème (IR uniquement, pas les PS).' },
  { key: 'pv_mob_type_abattement', label: 'Type d\'abattement durée', type: 'select', requires: 'capitauxMobiliers', advanced: true,
    opts: [
      { value: 'droit_commun', label: 'Droit commun (50 % ≥ 2 ans, 65 % ≥ 8 ans)' },
      { value: 'renforce_pme', label: 'Renforcé PME (50/65/85 %)' },
    ],
    dependsOn: { key: 'pv_mob_anteriorite_2018', value: 'Oui' },
    hint: 'Abattement renforcé : cession de titres de PME de moins de 10 ans à la souscription (conditions strictes).' },
  { key: 'pv_mob_duree', label: 'Durée de détention (années)', type: 'number', ph: '0', requires: 'capitauxMobiliers', advanced: true,
    dependsOn: { key: 'pv_mob_anteriorite_2018', value: 'Oui' } },
  { key: 'crypto_option_bareme', label: 'Crypto — option barème progressif ?', type: 'select', opts: ['Non', 'Oui'], requires: 'crypto', advanced: true,
    dependsOn: { key: 'crypto_cessions', value: 'Oui' },
    hint: 'Option barème possible pour les plus-values crypto (avantageuse à TMI ≤ 11 %). Exonération totale si cessions annuelles ≤ 305 €.' },
  // PV immobilière — estimation (prélevée à la source par le notaire, hors déclaration annuelle).
  { key: 'pv_immo_cession', label: 'PV immo — prix de cession (€)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    hint: 'Vente d\'un bien immobilier (hors résidence principale, exonérée). L\'impôt est prélevé chez le notaire — estimation indicative.' },
  { key: 'pv_immo_residence_principale', label: 'Bien = résidence principale ?', type: 'select', opts: ['Non', 'Oui'], requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    dependsOn: { key: 'pv_immo_cession', check: v => parseFloat(v || 0) > 0 },
    hint: 'La cession de la résidence principale est totalement exonérée d\'IR et de PS.' },
  { key: 'pv_immo_acquisition', label: 'PV immo — prix d\'acquisition d\'origine (€)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    dependsOn: { key: 'pv_immo_cession', check: v => parseFloat(v || 0) > 0 } },
  { key: 'pv_immo_duree', label: 'PV immo — durée de détention (années)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    dependsOn: { key: 'pv_immo_cession', check: v => parseFloat(v || 0) > 0 },
    hint: 'Abattements : exonération IR à 22 ans, PS à 30 ans. Forfait travaux 15 % applicable si détention ≥ 5 ans.' },
  { key: 'pv_immo_frais_reels', label: 'PV immo — frais d\'acquisition réels (€)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    dependsOn: { key: 'pv_immo_cession', check: v => parseFloat(v || 0) > 0 },
    hint: 'Laissez vide pour appliquer le forfait 7,5 % du prix d\'acquisition.' },
  { key: 'pv_immo_travaux_reels', label: 'PV immo — travaux réels justifiés (€)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    dependsOn: { key: 'pv_immo_cession', check: v => parseFloat(v || 0) > 0 },
    hint: 'Laissez vide pour appliquer le forfait 15 % (si détention ≥ 5 ans). Non cumulable avec les travaux déjà déduits des revenus fonciers.' },
];

// Rachat d'assurance-vie (2CG/2BH) — part de gains fournie par l'assureur. Champs foyer.
const AV_RACHAT_FIELDS = [
  { key: 'av_rachat_gains', label: 'Rachat AV — part de gains imposable (fournie par l\'assureur) (€)', type: 'number', ph: '0', requires: 'assuranceVie', advanced: true,
    hint: 'Montant des produits/gains imposables de votre rachat, tel qu\'indiqué sur le relevé/IFU de l\'assureur (pas le montant total racheté).' },
  { key: 'av_rachat_8ans', label: 'Contrat ≥ 8 ans ?', type: 'select', opts: ['Non', 'Oui'], requires: 'assuranceVie', advanced: true,
    dependsOn: { key: 'av_rachat_gains', check: v => parseFloat(v || 0) > 0 },
    hint: 'Ancienneté du CONTRAT (pas des versements). ≥ 8 ans : abattement 4 600 €/9 200 € + taux 7,5 %. Sinon PFU 12,8 %.' },
];

// IFI — Impôt sur la Fortune Immobilière (PHASE 5). Impôt distinct, dû si patrimoine
// immobilier net ≥ 1,3 M€ au 1er janvier. Champs foyer.
const IFI_FIELDS = [
  { key: 'ifi_patrimoine_brut', label: 'IFI — patrimoine immobilier brut (€)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    hint: 'Valeur vénale au 1er janvier de tous vos biens immobiliers (RP, locatifs, SCI, parts de SCPI…). L\'IFI n\'est dû que si le net dépasse 1 300 000 €.' },
  { key: 'ifi_valeur_rp', label: 'IFI — valeur de la résidence principale (€)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    dependsOn: { key: 'ifi_patrimoine_brut', check: v => parseFloat(v || 0) > 0 },
    hint: 'Un abattement de 30 % s\'applique sur la valeur de la résidence principale.' },
  { key: 'ifi_passif', label: 'IFI — passif déductible (€)', type: 'number', ph: '0', requires: ['immobilier', 'investissementsLocatifs'], advanced: true,
    dependsOn: { key: 'ifi_patrimoine_brut', check: v => parseFloat(v || 0) > 0 },
    hint: 'Capital restant dû des emprunts immobiliers au 1er janvier, dettes de travaux, taxe foncière, IFI N-1.' },
];

// Défiscalisation — dispositifs ouvrant réduction d'impôt (PHASE 5). Champs foyer.
// Mode versement (taux × min(versement, plafond)) ; Pinel = report (engagement antérieur, fermé).
const DEFISC_FIELDS = [
  { key: 'defisc_fcpi_versement', label: 'FCPI — versement de l\'année (€)', type: 'number', ph: '0', requires: 'creditsImpot', advanced: true,
    hint: 'Réduction 18 %, plafond 12 000 € (24 000 € couple). Soumis au plafond global des niches (10 000 €).' },
  { key: 'defisc_fip_versement', label: 'FIP — versement de l\'année (€)', type: 'number', ph: '0', requires: 'creditsImpot', advanced: true,
    hint: 'Réduction 18 %, plafond 12 000 € (24 000 € couple). FIP Corse/Outre-mer : 30 %.' },
  { key: 'defisc_ir_pme_madelin_versement', label: 'IR-PME (Madelin) — versement (€)', type: 'number', ph: '0', requires: 'creditsImpot', advanced: true,
    hint: 'Souscription au capital de PME. Réduction 18 % (parfois 25 %), plafond 50 000 € (100 000 € couple).' },
  { key: 'defisc_sofica_versement', label: 'SOFICA — versement (€)', type: 'number', ph: '0', requires: 'creditsImpot', advanced: true,
    hint: 'Réduction 30 % (jusqu\'à 48 %). Plafond majoré 18 000 € (avec outre-mer).' },
  { key: 'defisc_malraux_versement', label: 'Malraux — travaux de l\'année (€)', type: 'number', ph: '0', requires: 'creditsImpot', advanced: true,
    hint: 'Réduction 22 % ou 30 % des travaux. HORS plafond global des niches.' },
  { key: 'defisc_pinel_reduction', label: 'Pinel/Denormandie — réduction annuelle restante (€)', type: 'number', ph: '0', requires: 'creditsImpot', advanced: true,
    hint: 'Dispositif FERMÉ aux acquisitions depuis le 31/12/2024. Reportez la réduction annuelle d\'un engagement antérieur. Soumis au plafond global.' },
  { key: 'defisc_girardin_reduction', label: 'Girardin outre-mer — réduction de l\'année (€)', type: 'number', ph: '0', requires: 'creditsImpot', advanced: true,
    hint: 'Montage one-shot complexe (→ CGP). Bénéficie du plafond majoré 18 000 €.' },
];

// Fiscalité internationale (PHASE 6). Champs foyer. Taux effectif (8TI) + crédit 8TK
// calculés ; non-résident / impatrié / exit tax → détection + routage avocat fiscaliste.
const INTL_FIELDS = [
  { key: 'intl_statut_residence', label: 'Statut de résidence fiscale', type: 'select', advanced: true, requires: 'international',
    opts: [
      { value: 'resident', label: 'Résident fiscal français' },
      { value: 'non_resident', label: 'Non-résident fiscal' },
      { value: 'impatrie', label: 'Impatrié (art. 155 B)' },
    ],
    hint: 'Non-résident / impatrié : régimes conventionnels complexes → orientation vers un avocat fiscaliste.' },
  { key: 'intl_rev_etrangers_exoneres', label: 'Revenus étrangers exonérés — taux effectif (8TI) (€)', type: 'number', ph: '0', advanced: true, requires: 'international',
    hint: 'Revenus de source étrangère exonérés par convention mais retenus pour calculer le taux moyen d\'imposition de vos revenus français.' },
  { key: 'intl_rev_etrangers_imputation', label: 'Revenus étrangers imposés en France (€)', type: 'number', ph: '0', advanced: true, requires: 'international',
    hint: 'Revenus étrangers imposables en France (méthode de l\'imputation), déjà compris dans vos revenus déclarés. Sert à plafonner le crédit d\'impôt 8TK.' },
  { key: 'intl_credit_8tk', label: 'Crédit d\'impôt étranger (8TK) (€)', type: 'number', ph: '0', advanced: true, requires: 'international',
    hint: 'Impôt payé à l\'étranger ouvrant droit à un crédit d\'impôt en France (plafonné à l\'impôt français correspondant).' },
  { key: 'intl_exit_tax', label: 'Transfert de domicile hors de France (exit tax) ?', type: 'select', opts: ['Non', 'Oui'], advanced: true, requires: 'international',
    hint: 'Exit tax (art. 167 bis) sur les plus-values latentes au départ : mécanisme complexe → avocat fiscaliste.' },
];

// CTO — compte-titres ordinaire (PHASE 0.a). Pas de date/antériorité (aucun
// compteur fiscal). Le courtier étranger déclenche le flag 3916.
const CTO_FIELDS = [
  { key: 'cto', label: 'CTO (compte-titres ordinaire) — valorisation (€)', type: 'number', ph: '0', requires: 'cto',
    hint: 'Compte-titres ordinaire : actions/ETF/obligations détenus hors PEA. Aucune fiscalité à l\'entrée ; dividendes et plus-values imposés (PFU 30 % ou barème) — chiffrage en phases ultérieures.' },
  { key: 'cto_courtier', label: 'CTO — courtier', type: 'select', requires: 'cto',
    opts: ['Courtier français', 'Interactive Brokers', 'Trading 212', 'Degiro', 'Saxo Bank', 'Charles Schwab', 'Autre étranger', 'Autre'],
    dependsOn: { key: 'cto', check: v => parseFloat(v || 0) > 0 },
    hint: 'Courtier établi à l\'étranger (Interactive Brokers, Trading 212, Degiro, Saxo…) → déclaration obligatoire du compte via le formulaire 3916.' },
];

// PHASE 1 — charges déductibles & réductions/crédits grand public (section Déductions).
const REDUC_CREDIT_FIELDS = [
  { key: 'dons_aide',     label: 'Dons aide aux personnes — 75% (€)', type: 'number', ph: '0', advanced: true, requires: 'creditsImpot',
    hint: 'Restos du Cœur, Secours Populaire… : réduction 75 % jusqu\'à 1 000 €, puis 66 % au-delà.' },
  { key: 'pension_benef', label: 'Pension alimentaire — bénéficiaire', type: 'select', opts: ['Enfant majeur', 'Ascendant', 'Ex-conjoint / autre'], advanced: true,
    requires: 'pensionsAlimentaires', dependsOn: { key: 'pension', check: v => parseFloat(v || 0) > 0 } },
  { key: 'pension_nb',    label: 'Pension alimentaire — nb de bénéficiaires', type: 'number', ph: '1', advanced: true,
    requires: 'pensionsAlimentaires', dependsOn: { key: 'pension', check: v => parseFloat(v || 0) > 0 },
    hint: 'Plafond enfant majeur : 6 855 €/enfant (revenus 2025).' },
  { key: 'pension_recue', label: 'Pension alimentaire reçue — imposable (€)', type: 'number', ph: '0', advanced: true,
    hint: 'Pension alimentaire que vous percevez (case 1AO) : imposable, ajoutée à votre revenu.' },
  { key: 'frais_accueil', label: 'Frais d\'accueil personne âgée > 75 ans (€)', type: 'number', ph: '0', advanced: true, requires: 'creditsImpot',
    hint: 'Déduction forfaitaire dans la limite de 4 075 €/personne accueillie (case 6EU).' },
  { key: 'scol_college',  label: 'Enfants scolarisés — collège',     type: 'number', ph: '0', advanced: true, requires: 'creditsImpot', hint: 'Réduction forfaitaire 61 €/enfant.' },
  { key: 'scol_lycee',    label: 'Enfants scolarisés — lycée',       type: 'number', ph: '0', advanced: true, requires: 'creditsImpot', hint: 'Réduction forfaitaire 153 €/enfant.' },
  { key: 'scol_sup',      label: 'Enfants scolarisés — supérieur',   type: 'number', ph: '0', advanced: true, requires: 'creditsImpot', hint: 'Réduction forfaitaire 183 €/enfant.' },
];

const EP_INDIV_FIELDS = [
  { key: 'livret_a',           label: 'Livret A — solde (€)',          type: 'number', ph: '0', requires: 'livrets' },
  { key: 'ldd',                label: 'LDDS — solde (€)',              type: 'number', ph: '0', requires: 'livrets' },
  { key: 'lep',                label: 'LEP — solde (€)',               type: 'number', ph: '0', requires: 'livrets' },
  { key: 'livret_plus',        label: 'Livret+ / Livret bancaire (€)', type: 'number', ph: '0', requires: 'livrets' },
  { key: 'pel',                label: 'PEL — solde (€)',               type: 'number', ph: '0', requires: 'pel' },
  { key: 'pel_date',           label: 'PEL — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePelDate, requires: 'pel',
    dependsOn: { key: 'pel', check: v => parseFloat(v || 0) > 0 } },
  { key: 'pea',                label: 'PEA — valorisation (€)',        type: 'number', ph: '0', requires: 'pea' },
  { key: 'pea_date',           label: 'PEA — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePeaDate, requires: 'pea',
    dependsOn: { key: 'pea', check: v => parseFloat(v || 0) > 0 } },
  { key: 'pea_verse',          label: 'PEA — total versé (€)',         type: 'number', ph: '0', requires: 'pea',
    dependsOn: { key: 'pea', check: v => parseFloat(v || 0) > 0 } },
  ...CTO_FIELDS,
  { key: 'per',                label: 'PER versements 2025 (€)',       type: 'number', ph: '0', requires: 'perVolontaire' },
  { key: 'pee',                label: 'PEE — valorisation (€)',         type: 'number', ph: '0',
    requires: 'epargneSalariale',
    hint: 'Plan d\'Épargne Entreprise. Gains exonérés d\'IR (PS 17,2 % seulement). Abondement employeur exonéré.' },
  { key: 'pee_verse',          label: 'PEE — versements salarié 2025 (€)', type: 'number', ph: '0',
    requires: 'epargneSalariale',
    dependsOn: { key: 'pee', check: v => parseFloat(v || 0) > 0 },
    hint: 'Vos versements volontaires 2025 sur le PEE (hors abondement employeur et hors intéressement/participation déjà placés). Plafond légal : 25 % de votre rémunération annuelle brute. Ne réduisent PAS l\'IR (le PEE n\'est pas déductible) mais déterminent le plafond restant pour abondement employeur (3 fois votre versement, dans la limite de 8 % du PASS = ~3 770 € en 2025). Les gains à la sortie sont exonérés d\'IR (PS 17,2 % uniquement).' },
  { key: 'abond_pee',          label: 'PEE/PERCO — abondement employeur 2025 (€)', type: 'number', ph: '0',
    requires: 'epargneSalariale',
    dependsOn: { key: 'pee', check: v => parseFloat(v || 0) > 0 },
    hint: 'Abondement versé par votre employeur sur le PEE ou PERCO en 2025. Exonéré d\'IR mais déduit de votre plafond PER individuel (art. 163 quatervicies I-a CGI, BOI-IR-BASE-20-50-20). Réduit la capacité de versement déductible sur votre PER.' },
  { key: 'av',                 label: 'Assurance-vie — valorisation (€)', type: 'number', ph: '0', requires: 'assuranceVie' },
  { key: 'av_date',            label: 'AV — date souscription',        type: 'text',   ph: 'MM/AAAA', compute: computeAvDate, requires: 'assuranceVie',
    dependsOn: { key: 'av', check: v => parseFloat(v || 0) > 0 } },
  { key: 'av_verse',           label: 'AV — versements nets cumulés (€)', type: 'number', ph: '0', requires: 'assuranceVie',
    dependsOn: { key: 'av', check: v => parseFloat(v || 0) > 0 },
    hint: 'Tous contrats AV de ce déclarant. Seuil 150 000 € (art. 125-0 A CGI).' },
  { key: 'crypto_wallet',      label: 'Crypto — valeur wallet (€)',    type: 'number', ph: '0', requires: 'crypto' },
  { key: 'crypto_plateforme',  label: 'Crypto — plateforme',           type: 'select',
    requires: 'crypto',
    opts: ['Binance', 'Coinbase', 'Kraken', 'Ledger (hardware)', 'Plateforme française', 'Autre'],
    dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
  { key: 'crypto_cessions',    label: 'Cessions crypto 2025 ?',        type: 'select', opts: ['Non', 'Oui'],
    requires: 'crypto',
    dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
  { key: 'crypto_montant_cede',label: 'Crypto — montant cédé (€)',     type: 'number', ph: '0',
    requires: 'crypto',
    dependsOn: { key: 'crypto_cessions', value: 'Oui' } },
  { key: 'crypto_pv',          label: 'Crypto — plus-value estimée (€)', type: 'number', ph: '0',
    requires: 'crypto',
    dependsOn: { key: 'crypto_cessions', value: 'Oui' }, compute: computeCryptoPv },
];

const PROFIL_INDIV_FIELDS = [
  { key: 'age',            label: 'Âge (ans)',                 type: 'number', ph: '35' },
  { key: 'retraite',       label: 'Âge retraite estimé',       type: 'number', ph: '63' },
  { key: 'tmi_retraite',   label: 'TMI retraite (%)',           type: 'select', opts: ['', '0', '11', '30', '41', '45'], hint: TMI_RET_HINT },
  { key: 'type_revenu',    label: 'Type de revenu principal',  type: 'select', opts: ['Salarié(e)', 'Retraité(e)', 'Mixte'], hint: 'Salarié(e) = case 1AJ (abat. 10% min 509 €/max 14 555 €). Retraité(e) = case 1AS (abat. 10% min 450 €/max 4 446 €). Mixte = les deux.' },
  { key: 'pension_net_imp',label: 'Pension nette imposable 1AS (€)', type: 'number', ph: '18 000',
    dependsOn: { key: 'type_revenu', value: 'Mixte' },
    hint: 'Montant 1AS uniquement. Le champ "Net imposable" ci-dessus = salaire 1AJ uniquement.' },
];

const SECTION_REV_SOLO = {
  id: 'rev', Icon: TrendingUp, label: 'Revenus 2025', fields: [
    ...pluginFields(['salaires', 'pensions-rentes'], EXCLUDE_REV),
    ...pluginFields(['foncier-micro'],  EXCLUDE_REV).map(f => ({ ...f, requires: 'foncier' })),
    ...IMMO_FIELDS,
    ...pluginFields(['mobiliers'],      EXCLUDE_REV).map(f => ({ ...f, requires: 'capitauxMobiliers' })),
    { key: 'divid',  label: 'Dividendes/intérêts (€)', type: 'number', ph: '0', requires: 'capitauxMobiliers' },
    { key: 'div_2dc', label: 'Dividendes bruts — case 2DC (€)', type: 'number', ph: '0', requires: 'capitauxMobiliers',
      dependsOn: { key: 'divid', check: v => parseFloat(v || 0) > 0 },
      hint: 'Dividendes d\'actions (CTO). Le rapport compare PFU 30 % vs option barème (abattement 40 % + CSG déductible).' },
    { key: 'crypto', label: 'Revenus crypto (€)',       type: 'number', ph: '0', requires: 'crypto' },
    ...PV_FIELDS,
    ...AV_RACHAT_FIELDS,
    ...INTL_FIELDS,
    ...TNS_FIELDS,
  ],
};

const SECTION_PROFIL_SOLO = {
  id: 'profil', Icon: User, label: 'Profil & Retraite', fields: [
    { key: 'age_d1',              label: 'Âge (ans)',                  type: 'number', ph: '35' },
    { key: 'retraite_d1',         label: 'Âge retraite estimé',        type: 'number', ph: '63' },
    { key: 'tmi_retraite_d1',     label: 'TMI retraite (%)',            type: 'select', opts: ['', '0', '11', '30', '41', '45'], hint: TMI_RET_HINT },
    { key: 'type_revenu_d1',      label: 'Type de revenu principal',   type: 'select', opts: ['Salarié(e)', 'Retraité(e)', 'Mixte'], hint: 'Salarié(e) = 1AJ (abat. min 509 €/max 14 555 €). Retraité(e) = 1AS (abat. min 450 €/max 4 446 €). Mixte = les deux.' },
    { key: 'pension_net_imp_d1',  label: 'Pension nette imposable 1AS (€)', type: 'number', ph: '18 000',
      dependsOn: { key: 'type_revenu_d1', value: 'Mixte' },
      hint: 'Montant 1AS uniquement. "Net imposable" ci-dessus = part salaire 1AJ.' },
  ],
};

const SECTION_EP_SOLO = {
  id: 'ep', Icon: Building2, label: 'Épargne & Placements', fields: [
    { key: 'livret_a',           label: 'Livret A — solde (€)',          type: 'number', ph: '0', requires: 'livrets' },
    { key: 'ldd',                label: 'LDDS — solde (€)',              type: 'number', ph: '0', requires: 'livrets' },
    { key: 'lep',                label: 'LEP — solde (€)',               type: 'number', ph: '0', requires: 'livrets' },
    { key: 'livret_plus',        label: 'Livret+ / Livret bancaire (€)', type: 'number', ph: '0', requires: 'livrets' },
    { key: 'pel',                label: 'PEL — solde (€)',               type: 'number', ph: '0', requires: 'pel' },
    { key: 'pel_date',           label: 'PEL — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePelDate, requires: 'pel',
      dependsOn: { key: 'pel', check: v => parseFloat(v || 0) > 0 } },
    { key: 'pea',                label: 'PEA — valorisation (€)',        type: 'number', ph: '0', requires: 'pea' },
    { key: 'pea_date',           label: 'PEA — date ouverture',          type: 'text',   ph: 'MM/AAAA', compute: computePeaDate, requires: 'pea',
      dependsOn: { key: 'pea', check: v => parseFloat(v || 0) > 0 } },
    { key: 'pea_verse',          label: 'PEA — total versé (€)',         type: 'number', ph: '0', requires: 'pea',
      dependsOn: { key: 'pea', check: v => parseFloat(v || 0) > 0 } },
    ...CTO_FIELDS,
    { key: 'av',                 label: 'Assurance-vie — valorisation (€)', type: 'number', ph: '0', requires: 'assuranceVie' },
    { key: 'av_date',            label: 'AV — date souscription',        type: 'text',   ph: 'MM/AAAA', compute: computeAvDate, requires: 'assuranceVie',
      dependsOn: { key: 'av', check: v => parseFloat(v || 0) > 0 } },
    { key: 'av_verse',           label: 'AV — versements nets cumulés (€)', type: 'number', ph: '0', requires: 'assuranceVie',
      dependsOn: { key: 'av', check: v => parseFloat(v || 0) > 0 },
      hint: 'Tous vos contrats AV confondus. Seuil fiscal : 150 000 € (art. 125-0 A CGI). En dessous = taux 7,5 % IR post-8 ans. Au-delà = PFU 12,8 % sur la fraction excédentaire.' },
    { key: 'per',                label: 'PER versements 2025 (€)',       type: 'number', ph: '0', requires: 'perVolontaire' },
    { key: 'pee',                label: 'PEE — valorisation (€)',         type: 'number', ph: '0',
      requires: 'epargneSalariale',
      hint: 'Plan d\'Épargne Entreprise. Gains exonérés d\'IR (PS 17,2 % seulement). Abondement employeur exonéré.' },
    { key: 'pee_verse',          label: 'PEE — versements salarié 2025 (€)', type: 'number', ph: '0',
      requires: 'epargneSalariale',
      dependsOn: { key: 'pee', check: v => parseFloat(v || 0) > 0 } },
    { key: 'abond_pee',          label: 'PEE/PERCO — abondement employeur 2025 (€)', type: 'number', ph: '0',
      requires: 'epargneSalariale',
      dependsOn: { key: 'pee', check: v => parseFloat(v || 0) > 0 },
      hint: 'Abondement versé par l\'employeur sur le PEE ou PERCO en 2025. Réduit le plafond PER (art. 163 quatervicies CGI).' },
    { key: 'crypto_wallet',      label: 'Crypto — valeur wallet (€)',    type: 'number', ph: '0', requires: 'crypto' },
    { key: 'crypto_plateforme',  label: 'Crypto — plateforme',           type: 'select',
      requires: 'crypto',
      opts: ['Binance', 'Coinbase', 'Kraken', 'Ledger (hardware)', 'Plateforme française', 'Autre'],
      dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
    { key: 'crypto_cessions',    label: 'Cessions crypto 2025 ?',        type: 'select', opts: ['Non', 'Oui'],
      requires: 'crypto',
      dependsOn: { key: 'crypto_wallet', check: v => parseFloat(v || 0) > 0 } },
    { key: 'crypto_montant_cede',label: 'Crypto — montant cédé (€)',     type: 'number', ph: '0',
      requires: 'crypto',
      dependsOn: { key: 'crypto_cessions', value: 'Oui' } },
    { key: 'crypto_pv',          label: 'Crypto — plus-value estimée (€)', type: 'number', ph: '0',
      requires: 'crypto',
      dependsOn: { key: 'crypto_cessions', value: 'Oui' }, compute: computeCryptoPv },
  ],
};

const SECTION_DED_SOLO = {
  id: 'ded', Icon: Scissors, label: 'Déductions', fields: [
    { key: 'dons',     label: 'Dons associations (€)',                  type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'garde',    label: 'Frais garde enfants (€)',                type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'domicile', label: 'Emploi à domicile (€)',                  type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'travaux',  label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'frais_r',  label: 'Frais réels (€)',                        type: 'number', ph: 'vide = forfait 10%',
      hint: 'Vide = abattement forfaitaire 10 %. Renseignez uniquement si vos frais réels sont supérieurs — utilisez l\'onglet « Frais réels » du simulateur pour les calculer.' },
    { key: 'pero_d1',  label: 'PERO — cotisations 2025 (€)',            type: 'number', ph: '0', advanced: true, requires: 'epargneSalariale', hint: 'Déjà déduit de votre 1AJ — renseignez uniquement pour calculer votre plafond PER disponible N+1.' },
    { key: 'pension',  label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0', advanced: true, requires: 'pensionsAlimentaires' },
    { key: 'syndicat', label: 'Cotisations syndicales (€)',             type: 'number', ph: '0', advanced: true },
    ...REDUC_CREDIT_FIELDS,
    ...DEFISC_FIELDS,
    { key: 'per_n1',   label: 'PER reportable N-1 (€)',                 type: 'number', ph: '0', advanced: true, requires: 'perVolontaire',
      groupStart: {
        title: 'Plafonds PER reportés des années précédentes',
        hint: 'À remplir uniquement si vous n\'avez pas versé tout votre plafond PER les années précédentes. Visible sur la case 6PS / 6PT / 6PU de votre avis d\'imposition.',
      },
      hint: 'Plafond non utilisé 2024 — case 6PS de votre avis d\'imposition 2024.' },
    { key: 'per_n2',   label: 'PER reportable N-2 (€)',                 type: 'number', ph: '0', advanced: true, requires: 'perVolontaire' },
    { key: 'per_n3',      label: 'PER reportable N-3 (€)',      type: 'number', ph: '0', advanced: true, requires: 'perVolontaire' },
    { key: 'acompte_8hw', label: 'Acompte IR — case 8HW (€)',  type: 'number', ph: '0', advanced: true,
      groupStart: {
        title: 'Acomptes IR / PS déjà versés en 2025',
        hint: 'À remplir uniquement si vous avez des revenus fonciers, mobiliers ou indépendants pour lesquels impots.gouv prélève automatiquement un acompte (mensuel ou trimestriel). Si vous êtes uniquement salarié, laissez vide. Ces acomptes seront déduits de votre IR final — sans les renseigner, le solde affiché pourrait être faux.',
      },
      hint: 'Acompte IR prélevé automatiquement (souvent < 100 €). Visible dans l\'espace PAS sur impots.gouv.' },
    { key: 'acompte_8hx', label: 'Acompte PS — case 8HX (€)',  type: 'number', ph: '0', advanced: true, hint: 'Acompte prélèvements sociaux (foncier, mobilier). Prérempli par impots.gouv.' },
  ],
};

const SECTION_REV_FOYER = {
  id: 'rev_foyer', Icon: TrendingUp, label: 'Revenus du foyer', fields: [
    ...pluginFields(['foncier-micro']).map(f => ({ ...f, requires: 'foncier' })),
    ...IMMO_FIELDS,
    ...pluginFields(['mobiliers']).map(f => ({ ...f, requires: 'capitauxMobiliers' })),
    { key: 'divid',  label: 'Dividendes/intérêts (€)', type: 'number', ph: '0', requires: 'capitauxMobiliers' },
    { key: 'div_2dc', label: 'Dividendes bruts — case 2DC (€)', type: 'number', ph: '0', requires: 'capitauxMobiliers',
      dependsOn: { key: 'divid', check: v => parseFloat(v || 0) > 0 },
      hint: 'Dividendes d\'actions (CTO). Le rapport compare PFU 30 % vs option barème (abattement 40 % + CSG déductible).' },
    { key: 'crypto', label: 'Revenus crypto (€)',       type: 'number', ph: '0', requires: 'crypto' },
    ...PV_FIELDS,
    ...AV_RACHAT_FIELDS,
    ...INTL_FIELDS,
  ],
};

const SECTION_DED = {
  id: 'ded', Icon: Scissors, label: 'Déductions du foyer', fields: [
    { key: 'dons',         label: 'Dons associations (€)',                  type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'garde',        label: 'Frais garde enfants (€)',                type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'domicile',     label: 'Emploi à domicile (€)',                  type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'travaux',      label: 'Rénov. énergétique — MaPrimeRénov (€)', type: 'number', ph: '0', requires: 'creditsImpot' },
    { key: 'pero_d1',      label: 'PERO D1 — cotisations 2025 (€)',         type: 'number', ph: '0', advanced: true, requires: 'epargneSalariale', hint: 'Déjà déduit du 1AJ — renseignez uniquement pour calculer le plafond PER D1 disponible N+1.' },
    { key: 'pero_d2',      label: 'PERO D2 — cotisations 2025 (€)',         type: 'number', ph: '0', advanced: true, requires: 'epargneSalariale', hint: 'Déjà déduit du 1AJ — renseignez uniquement pour calculer le plafond PER D2 disponible N+1.' },
    { key: 'pension',      label: 'Pension alimentaire versée (€)',         type: 'number', ph: '0', advanced: true, requires: 'pensionsAlimentaires' },
    { key: 'syndicat',     label: 'Cotisations syndicales (€)',             type: 'number', ph: '0', advanced: true },
    ...REDUC_CREDIT_FIELDS,
    ...DEFISC_FIELDS,
    { key: 'per_n1',       label: 'PER reportable N-1 (€)',                 type: 'number', ph: '0', advanced: true, requires: 'perVolontaire',
      groupStart: {
        title: 'Plafonds PER reportés des années précédentes',
        hint: 'À remplir uniquement si le foyer n\'a pas versé tout son plafond PER les années précédentes. Visible sur la case 6PS / 6PT / 6PU de votre avis d\'imposition 2024.',
      },
      hint: 'Plafond non utilisé 2024 — case 6PS de votre avis d\'imposition 2024.' },
    { key: 'per_n2',       label: 'PER reportable N-2 (€)',                 type: 'number', ph: '0', advanced: true, requires: 'perVolontaire' },
    { key: 'per_n3',       label: 'PER reportable N-3 (€)',                 type: 'number', ph: '0', advanced: true, requires: 'perVolontaire' },
    { key: 'acompte_8hw',  label: 'Acompte IR D1 — case 8HW (€)',          type: 'number', ph: '0', advanced: true,
      groupStart: {
        title: 'Acomptes IR / PS déjà versés en 2025',
        hint: 'À remplir uniquement si vous avez des revenus fonciers, mobiliers ou indépendants pour lesquels impots.gouv prélève automatiquement un acompte (mensuel ou trimestriel). Si le foyer est uniquement salarié, laissez vide. Ces acomptes seront déduits de l\'IR final — sans les renseigner, le solde affiché pourrait être faux.',
      },
      hint: 'Acompte IR prélevé automatiquement par impots.gouv en cours d\'année (souvent < 100 €). Visible dans l\'espace "Gérer mon prélèvement à la source".' },
    { key: 'acompte_8iw',  label: 'Acompte IR D2 — case 8IW (€)',          type: 'number', ph: '0', advanced: true },
    { key: 'acompte_8hx',  label: 'Acompte PS D1 — case 8HX (€)',          type: 'number', ph: '0', advanced: true, hint: 'Acompte prélèvements sociaux D1 (foncier, mobilier). Prérempli par impots.gouv.' },
    { key: 'acompte_8ix',  label: 'Acompte PS D2 — case 8IX (€)',          type: 'number', ph: '0', advanced: true },
  ],
};

const SECTION_IMMO = {
  id: 'immo', Icon: Home, label: 'Immobilier', fields: [
    { key: 'proprio',           label: 'Propriétaire RP ?',              type: 'select', opts: ['Non', 'Oui'] },
    { key: 'rp_valeur',         label: 'RP — valeur estimée (€)',         type: 'number', ph: '280 000',
      dependsOn: { key: 'proprio', value: 'Oui' } },
    { key: 'credit_en_cours',   label: 'Crédit immobilier en cours ?',    type: 'select', opts: ['Non', 'Oui'],
      dependsOn: { key: 'proprio', value: 'Oui' } },
    { key: 'credit_crd',        label: 'Capital restant dû (€)',          type: 'number', ph: '150 000',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'credit_taux',       label: 'Taux crédit (%)',                 type: 'number', ph: '1.5',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'credit_mensualite', label: 'Mensualité crédit (€)',           type: 'number', ph: '900',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'credit_duree',      label: 'Durée restante (ans)',            type: 'number', ph: '15',
      dependsOn: { key: 'credit_en_cours', value: 'Oui' } },
    { key: 'taxe_fonciere',     label: 'Taxe foncière annuelle (€)',      type: 'number', ph: '0',
      dependsOn: { key: 'proprio', value: 'Oui' } },
    { key: 'locatif',           label: 'Bien locatif ?',                  type: 'select', opts: ['Non', 'Oui — micro', 'Oui — réel'] },
    { key: 'rev_loc',           label: 'Revenus locatifs 2025 (€)',       type: 'number', ph: '0',
      dependsOn: { key: 'locatif', check: v => v && v !== 'Non' } },
    ...IFI_FIELDS,
  ],
};

// Champs capacité d'épargne (pour comptage progression)
const CAPACITE_KEYS = ['charges_fixes', 'credit_rp', 'autres_credits', 'charges_perso_d1', 'charges_perso_d2', 'objectif_patrimonial'];

const SOLO_SECTIONS = [SECTION_SIT, SECTION_PROFIL_SOLO, SECTION_REV_SOLO, SECTION_EP_SOLO, SECTION_DED_SOLO, SECTION_IMMO];

// ─── Sub-components (outside main component — prevents focus loss on re-render) ──

// Retourne false si le champ nécessite un module non activé (sauf en mode expert)
function _moduleVisible(f, modules, expertMode) {
  if (!f.requires || expertMode) return true;
  const reqs = Array.isArray(f.requires) ? f.requires : [f.requires];
  return reqs.some(r => modules[r]);
}

function AccSection({ section, data, onChange, autoFKeys, activeAcc, setActiveAcc, modules = {}, expertMode = true, reason }) {
  const { Icon } = section;
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filtre d'abord par module, puis par dependsOn
  const modVisible = f => _moduleVisible(f, modules, expertMode);
  const passDep    = f => fieldVisible(f, data);
  const baseFields = section.fields.filter(f => modVisible(f) && passDep(f) && !f.advanced);
  const advFields  = section.fields.filter(f => modVisible(f) && passDep(f) &&  f.advanced);
  const advFilled  = advFields.filter(f => data[f.key] && data[f.key] !== '').length;

  // Si l'utilisateur a déjà rempli des cas particuliers, on les déplie d'office.
  const advancedOpen = showAdvanced || advFilled > 0;

  // Progression : on n'agrège que les champs réellement affichés.
  const countable = advancedOpen ? [...baseFields, ...advFields] : baseFields;
  const filled    = countable.filter(f => data[f.key] && data[f.key] !== '').length;
  const pct       = countable.length > 0 ? Math.round(filled / countable.length * 100) : 0;
  const open      = activeAcc === section.id;

  return (
    <div className={[
      'rounded-2xl border mb-2 transition-all duration-200 overflow-hidden',
      open ? 'border-teal-200 shadow-sm' : 'border-gray-100 bg-white',
    ].join(' ')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`acc-body-${section.id}`}
        onClick={() => setActiveAcc(open ? null : section.id)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={[
            'w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0',
            open ? 'bg-teal-gradient text-white' : 'bg-gray-100 text-gray-400',
          ].join(' ')}>
            <Icon size={14} aria-hidden="true" />
          </div>
          <div>
            <span className="font-semibold text-sm text-gray-800">{section.label}</span>
            {reason && !expertMode && (
              <p className="text-xs text-teal-500 leading-tight mt-0.5">{reason}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono text-gray-400">{filled}/{countable.length}</span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-teal-500' : 'bg-purple-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div id={`acc-body-${section.id}`} role="region" aria-label={section.label} className="px-4 pb-4 bg-teal-50/20" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {baseFields.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>

          {advFields.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAdvanced(s => !s)}
                className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
              >
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`}
                />
                {advancedOpen
                  ? 'Masquer les cas particuliers'
                  : `Voir les cas particuliers (${advFields.length}${advFilled > 0 ? ` · ${advFilled} renseigné${advFilled > 1 ? 's' : ''}` : ''})`}
              </button>

              {advancedOpen && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {advFields.map(f => (
                    <Fragment key={f.key}>
                      {f.groupStart && (
                        <div className="col-span-2 mt-2 first:mt-0">
                          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{f.groupStart.title}</p>
                          {f.groupStart.hint && (
                            <p className="text-xs text-gray-500 leading-snug mt-1">{f.groupStart.hint}</p>
                          )}
                        </div>
                      )}
                      <FieldRow f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DocItem({ doc, onRemove }) {
  return (
    <div className={[
      'flex gap-2.5 items-start rounded-xl p-3 mt-2 border',
      doc.status === 'done'    ? 'bg-teal-50/50 border-teal-100'  : '',
      doc.status === 'error'   ? 'bg-red-50/50 border-red-100'    : '',
      doc.status === 'loading' ? 'bg-gray-50 border-gray-100'     : '',
    ].join(' ')}>
      <div className="shrink-0 mt-0.5">
        {doc.status === 'loading' && <Loader2 size={15} className="text-teal-500 animate-spin" />}
        {doc.status === 'done'    && <CheckCircle size={15} className="text-teal-500" />}
        {doc.status === 'error'   && <AlertCircle size={15} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-gray-400 mb-1 truncate">{doc.name}</p>
        {doc.status === 'loading' && (
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-1 h-1 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            Extraction IA…
          </p>
        )}
        {doc.status === 'done' && (
          <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{doc.extracted}</p>
        )}
        {doc.status === 'done' && doc.warning && (
          <div className={[
            'mt-2 text-xs px-2.5 py-1.5 rounded-lg',
            doc.warning.startsWith('✅')
              ? 'bg-teal-50 border border-teal-200 text-teal-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700',
          ].join(' ')}>
            {doc.warning}
          </div>
        )}
        {doc.status === 'error' && <p className="text-xs text-red-500 truncate">{doc.error}</p>}
      </div>
      <button
        type="button"
        onClick={() => onRemove(doc.id)}
        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors p-0.5"
        aria-label="Supprimer"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function UploadZone({ target, uploading, docs, onFiles, onRemove }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const mine = docs.filter(d => d.target === target);

  return (
    <div className="mb-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={e => onFiles(e.target.files, target)}
      />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files, target); }}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200',
          dragging
            ? 'border-teal-400 bg-teal-50/60 scale-[1.01] shadow-sm shadow-teal-100'
            : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/30',
        ].join(' ')}
      >
        <div className={[
          'w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2 transition-colors',
          uploading || dragging ? 'bg-teal-gradient' : 'bg-gray-100',
        ].join(' ')}>
          {uploading
            ? <Loader2 size={16} className="text-white animate-spin" />
            : <Upload size={16} className={dragging ? 'text-white' : 'text-gray-400'} />
          }
        </div>
        <p className="text-sm font-semibold text-gray-700">
          {uploading ? 'Analyse IA en cours…' : 'Glisse ici ou clique'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">JPG · PNG · PDF</p>
      </div>
      {mine.map(doc => (
        <DocItem key={doc.id} doc={doc} onRemove={onRemove} />
      ))}
    </div>
  );
}

function DeclarantBlock({ num, data, onChange, autoFKeys, uploadTarget, activeAcc, setActiveAcc, uploading, docs, onFiles, onRemove, modules = {}, expertMode = true }) {
  const visRevFields   = REV_FIELDS.filter(f => _moduleVisible(f, modules, expertMode));
  const visEpFields    = EP_INDIV_FIELDS.filter(f => _moduleVisible(f, modules, expertMode));
  const allFields      = [...visRevFields, ...visEpFields, ...PROFIL_INDIV_FIELDS];
  const visible        = allFields.filter(f => fieldVisible(f, data));
  const filled    = visible.filter(f => data[f.key] && data[f.key] !== '').length;
  const pct       = visible.length > 0 ? Math.round(filled / visible.length * 100) : 0;
  const id     = `d${num}`;
  const open   = activeAcc === id;
  const isD1   = num === 1;

  return (
    <div className={[
      'rounded-2xl border mb-2 transition-all duration-200 overflow-hidden',
      open
        ? (isD1 ? 'border-teal-200 shadow-sm' : 'border-purple-200 shadow-sm')
        : 'border-gray-100 bg-white',
    ].join(' ')}>
      <button
        type="button"
        onClick={() => setActiveAcc(open ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={[
            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono border transition-colors',
            open && isD1  ? 'bg-teal-gradient border-transparent text-white'   : '',
            open && !isD1 ? 'bg-purple-500 border-transparent text-white'      : '',
            !open && isD1  ? 'bg-teal-50 border-teal-200 text-teal-600'        : '',
            !open && !isD1 ? 'bg-purple-50 border-purple-200 text-purple-600'  : '',
          ].join(' ')}>
            D{num}
          </div>
          <span className="font-semibold text-sm text-gray-800">Déclarant {num}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-mono ${
            pct === 100
              ? (isD1 ? 'text-teal-500' : 'text-purple-500')
              : 'text-gray-400'
          }`}>
            {filled}/{visible.length}
          </span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isD1 ? 'bg-teal-500' : 'bg-purple-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className={`px-4 pb-4 ${isD1 ? 'bg-teal-50/20' : 'bg-purple-50/10'}`} onClick={e => e.stopPropagation()}>
          <UploadZone target={uploadTarget} uploading={uploading} docs={docs} onFiles={onFiles} onRemove={onRemove} />
          {Object.keys(autoFKeys).length > 0 && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl mb-3 border ${
              isD1
                ? 'bg-teal-50 border-teal-200 text-teal-700'
                : 'bg-purple-50 border-purple-200 text-purple-700'
            }`}>
              <Sparkles size={12} />
              {Object.keys(autoFKeys).length} champ(s) pré-rempli(s) — vérifie les valeurs
            </div>
          )}
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2 mt-1">
            Revenus 2025
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {visRevFields.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Épargne individuelle
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {visEpFields.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Profil &amp; Retraite
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROFIL_INDIV_FIELDS.map(f => (
              <FieldRow key={f.key} f={f} value={data[f.key]} onChange={onChange} autoFKeys={autoFKeys} formData={data} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CapaciteSection ──────────────────────────────────────────────────────────

function _capaciteColor(taux) {
  if (taux < 10) return 'red';
  if (taux < 25) return 'orange';
  if (taux < 50) return 'green';
  return 'blue';
}
function _capaciteMsg(taux) {
  if (taux < 10) return 'Capacité d\'investissement faible';
  if (taux < 25) return 'Capacité modérée';
  if (taux < 50) return 'Bonne capacité d\'épargne';
  return 'Capacité élevée — stratégie FIRE envisageable';
}
const _capaciteColorMap = {
  red:    { bg: 'bg-red-50',    border: 'border-red-100',    label: 'text-red-400',    val: 'text-red-700',    msg: 'text-red-500'    },
  orange: { bg: 'bg-amber-50',  border: 'border-amber-100',  label: 'text-amber-500',  val: 'text-amber-700',  msg: 'text-amber-500'  },
  green:  { bg: 'bg-teal-50',   border: 'border-teal-100',   label: 'text-teal-500',   val: 'text-teal-700',   msg: 'text-teal-500'   },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   label: 'text-blue-400',   val: 'text-blue-700',   msg: 'text-blue-500'   },
};

function CapaciteSection({ formData, onChange, d1Data, d2Data, isCouple, activeAcc, setActiveAcc }) {
  const id = 'capacite';
  const open = activeAcc === id;

  const netD1 = parseFloat(isCouple ? (d1Data?.net_imp || 0) : (formData.net_imp || 0));
  const netD2 = parseFloat(isCouple ? (d2Data?.net_imp || 0) : 0);
  const rniMensuelD1 = Math.round(abattement10(netD1) / 12);
  const rniMensuelD2 = Math.round(abattement10(netD2) / 12);
  const rniMensuel   = rniMensuelD1 + rniMensuelD2;

  const chargesCommunes = parseFloat(formData.charges_fixes    || 0);
  const chargesPersoD1  = parseFloat(formData.charges_perso_d1 || 0);
  const chargesPersoD2  = parseFloat(formData.charges_perso_d2 || 0);

  // Solo : charges_fixes = tout (comportement inchangé)
  const capaciteSolo = Math.max(0, rniMensuel - chargesCommunes);
  const tauxSolo = rniMensuel > 0 ? Math.round(capaciteSolo / rniMensuel * 100) : 0;

  // Couple : charges communes partagées 50/50 + charges perso séparées
  const capaciteD1 = Math.max(0, rniMensuelD1 - chargesCommunes / 2 - chargesPersoD1);
  const capaciteD2 = Math.max(0, rniMensuelD2 - chargesCommunes / 2 - chargesPersoD2);
  const capaciteTotal = capaciteD1 + capaciteD2;
  const tauxD1 = rniMensuelD1 > 0 ? Math.round(capaciteD1 / rniMensuelD1 * 100) : 0;
  const tauxD2 = rniMensuelD2 > 0 ? Math.round(capaciteD2 / rniMensuelD2 * 100) : 0;

  const filled = CAPACITE_KEYS.filter(k => formData[k] && formData[k] !== '').length;
  const pct    = Math.round(filled / CAPACITE_KEYS.length * 100);

  return (
    <div className={['rounded-2xl border mb-2 transition-all duration-200 overflow-hidden', open ? 'border-teal-200 shadow-sm' : 'border-gray-100 bg-white'].join(' ')}>
      <button type="button" onClick={() => setActiveAcc(open ? null : id)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
        <div className="flex items-center gap-3">
          <div className={['w-7 h-7 rounded-lg flex items-center justify-center transition-colors', open ? 'bg-teal-gradient text-white' : 'bg-gray-100 text-gray-400'].join(' ')}>
            <TrendingUp size={14} aria-hidden="true" />
          </div>
          <span className="font-semibold text-sm text-gray-800">Capacité d&apos;épargne</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono text-gray-400">{filled}/{CAPACITE_KEYS.length}</span>
          <div className="w-8 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-teal-500' : 'bg-purple-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-teal-50/20" onClick={e => e.stopPropagation()}>

          {/* ── Mode couple : salaires D1/D2 côte à côte ── */}
          {isCouple && (rniMensuelD1 > 0 || rniMensuelD2 > 0) && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[{ label: 'D1', val: rniMensuelD1 }, { label: 'D2', val: rniMensuelD2 }].map(({ label, val }) => (
                <div key={label} className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-0.5">Revenu net mensuel {label}</p>
                  <p className="text-sm font-bold text-blue-800 font-mono">{val.toLocaleString('fr-FR')} €/mois</p>
                </div>
              ))}
              <p className="col-span-2 text-xs text-blue-400 -mt-1">Après abattement 10 % (salaires) — source : cases 1AJ / 1BJ</p>
            </div>
          )}

          {/* ── Mode solo : revenu global ── */}
          {!isCouple && rniMensuel > 0 && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 mb-3">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-0.5">Revenu net mensuel estimé</p>
              <p className="text-sm font-bold text-blue-800 font-mono">{rniMensuel.toLocaleString('fr-FR')} €/mois</p>
              <p className="text-xs text-blue-400 mt-0.5">Après abattement 10 % salaires</p>
            </div>
          )}

          {/* ── Charges communes ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <FieldRow
              f={{ key: 'charges_fixes', label: isCouple ? 'Charges communes mensuelles (€)' : 'Charges fixes mensuelles (€)', type: 'number', ph: '2 500',
                   hint: isCouple ? 'Loyer / crédit RP, courses, abonnements partagés — divisé 50/50 entre D1 et D2.' : undefined }}
              value={formData.charges_fixes} onChange={onChange} autoFKeys={{}} />
            <FieldRow
              f={{ key: 'credit_rp', label: 'dont crédit RP / loyer (€)', type: 'number', ph: '900' }}
              value={formData.credit_rp} onChange={onChange} autoFKeys={{}} />
            <FieldRow
              f={{ key: 'autres_credits', label: 'dont autres crédits (€)', type: 'number', ph: '0' }}
              value={formData.autres_credits} onChange={onChange} autoFKeys={{}} />
          </div>

          {/* ── Charges personnelles D1 / D2 (couple uniquement) ── */}
          {isCouple && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <FieldRow
                f={{ key: 'charges_perso_d1', label: 'Charges perso D1 (€)', type: 'number', ph: '0',
                     hint: 'Transport, sport, loisirs, abonnements perso — propres à D1 uniquement.' }}
                value={formData.charges_perso_d1} onChange={onChange} autoFKeys={{}} />
              <FieldRow
                f={{ key: 'charges_perso_d2', label: 'Charges perso D2 (€)', type: 'number', ph: '0',
                     hint: 'Transport, sport, loisirs, abonnements perso — propres à D2 uniquement.' }}
                value={formData.charges_perso_d2} onChange={onChange} autoFKeys={{}} />
            </div>
          )}

          <div className={isCouple ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3'}>
            {!isCouple && <div />}
            <FieldRow
              f={{ key: 'objectif_patrimonial', label: 'Objectif patrimonial', type: 'select',
                   opts: ['', 'Optimisation fiscale annuelle', 'Constitution patrimoine long terme', 'Préparation retraite', 'Indépendance financière (FIRE)', 'Transmission'] }}
              value={formData.objectif_patrimonial} onChange={onChange} autoFKeys={{}} />
          </div>

          {/* ── Résultats ── */}
          {isCouple ? (
            // Mode couple : capacité D1 / D2 côte à côte + total foyer
            chargesCommunes > 0 && (rniMensuelD1 > 0 || rniMensuelD2 > 0) && (
              <div className="flex flex-col gap-2 mt-1">
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: 'D1', capacite: capaciteD1, taux: tauxD1, rni: rniMensuelD1 },
                    { label: 'D2', capacite: capaciteD2, taux: tauxD2, rni: rniMensuelD2 }].map(({ label, capacite, taux }) => {
                    const col = _capaciteColor(taux);
                    const c = _capaciteColorMap[col];
                    return (
                      <div key={label} className={`rounded-xl border px-3 py-2.5 ${c.bg} ${c.border}`}>
                        <div className="flex justify-between items-baseline mb-0.5">
                          <p className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>Capacité {label}</p>
                          <span className={`text-xs font-bold font-mono ${c.val}`}>{taux} %</span>
                        </div>
                        <p className={`text-base font-bold font-mono ${c.val}`}>{capacite.toLocaleString('fr-FR')} €/mois</p>
                        <p className={`text-xs mt-0.5 ${c.msg}`}>{_capaciteMsg(taux)}</p>
                      </div>
                    );
                  })}
                </div>
                {capaciteTotal > 0 && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5">
                    <div className="flex justify-between items-baseline">
                      <p className="text-xs font-bold text-teal-500 uppercase tracking-widest">Total foyer</p>
                      <span className="text-xs font-bold font-mono text-teal-600">
                        {rniMensuel > 0 ? Math.round(capaciteTotal / rniMensuel * 100) : 0} %
                      </span>
                    </div>
                    <p className="text-lg font-bold font-mono text-teal-700">{capaciteTotal.toLocaleString('fr-FR')} €/mois</p>
                  </div>
                )}
              </div>
            )
          ) : (
            // Mode solo : comportement inchangé
            rniMensuel > 0 && chargesCommunes > 0 && (() => {
              const c = _capaciteColorMap[_capaciteColor(tauxSolo)];
              return (
                <div className={`rounded-xl border px-3 py-2.5 ${c.bg} ${c.border}`}>
                  <div className="flex justify-between items-baseline mb-1">
                    <p className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>Capacité d&apos;épargne</p>
                    <span className={`text-xs font-bold font-mono ${c.val}`}>{tauxSolo} %</span>
                  </div>
                  <p className={`text-lg font-bold font-mono ${c.val}`}>{capaciteSolo.toLocaleString('fr-FR')} €/mois</p>
                  <p className={`text-xs mt-0.5 ${c.msg}`}>{_capaciteMsg(tauxSolo)}</p>
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

// Fallback stable : même référence à chaque rendu (react-hooks/exhaustive-deps).
const AUCUN_FICHIER = [];

export default function Collect() {
  const { state, dispatch, getApiKey } = useApp();
  const navigate = useNavigate();
  const isCouple = state.mode === 'couple';

  const [formData,   setFormData]   = useState(() => state.formData || {});
  const [d1Data,     setD1Data]     = useState(() => state.d1Data   || {});
  const [d2Data,     setD2Data]     = useState(() => state.d2Data   || {});
  const [docs,       setDocs]       = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [activeAcc,  setActiveAcc]  = useState('sit');
  const [autoFilled, setAutoFilled] = useState({});
  const [autoF1,     setAutoF1]     = useState({});
  const [autoF2,     setAutoF2]     = useState({});

  // collectProfile pilote le filtrage des champs et l'onboarding
  const collectProfile = state.collectProfile || {};
  const modules    = collectProfile.modules    || {};
  const expertMode = collectProfile.expertMode || false;

  // L'étape 0 (situation) est désormais le gate de /anonymize. Si elle n'a pas été
  // faite (et hors mode expert / données déjà présentes), on y renvoie l'utilisateur
  // au lieu de redemander la situation ici (zéro double saisie).
  const hasExistingData = Object.keys(state.formData || {}).length > 0 || !!state.profile;
  const needsSituation = !collectProfile.onboardingDone && !expertMode && !hasExistingData;
  // Alias conservé pour les conditions d'affichage existantes (toujours false dans le
  // rendu principal, puisque needsSituation déclenche une redirection en amont).
  const showWizard = false;

  function handleReconfigure() {
    dispatch({ type: 'SET_COLLECT_PROFILE', payload: { ...collectProfile, onboardingDone: false, expertMode: false } });
  }

  function handleToggleExpert() {
    dispatch({ type: 'SET_COLLECT_PROFILE', payload: { ...collectProfile, expertMode: !expertMode } });
  }

  const handleChange   = (key, val) => { setFormData(p => ({ ...p, [key]: val })); setAutoFilled(p => { const n = { ...p }; delete n[key]; return n; }); };
  const handleD1Change = (key, val) => { setD1Data(p => ({ ...p, [key]: val }));   setAutoF1(p    => { const n = { ...p }; delete n[key]; return n; }); };
  const handleD2Change = (key, val) => { setD2Data(p => ({ ...p, [key]: val }));   setAutoF2(p    => { const n = { ...p }; delete n[key]; return n; }); };
  const removeDoc = id => setDocs(p => p.filter(d => d.id !== id));

  // Sync local states when a profile is imported (AppContext updated externally)
  useEffect(() => { if (state.formData) setFormData(state.formData); }, [state.formData]);
  useEffect(() => { if (state.d1Data)   setD1Data(state.d1Data);     }, [state.d1Data]);
  useEffect(() => { if (state.d2Data)   setD2Data(state.d2Data);     }, [state.d2Data]);

  // Pré-remplissage depuis l'extraction LOCALE faite à l'anonymisation (Couche 3).
  // Une seule fois : les valeurs extraites ne remplacent jamais une saisie existante.
  const prefilledRef = useRef(false);
  useEffect(() => {
    const docs = state.extractedDocs || [];
    if (prefilledRef.current || docs.length === 0) return;
    prefilledRef.current = true;

    const fdMerge = {}, d1Merge = {}, d2Merge = {};
    for (const doc of docs) {
      const { declarant, foyer } = mapExtractToForm(doc.extracted || {}, doc.target);
      Object.assign(fdMerge, foyer);
      if (!isCouple)                 Object.assign(fdMerge, declarant);
      else if (doc.target === 'd2')  Object.assign(d2Merge, declarant);
      else                           Object.assign(d1Merge, declarant);
    }

    const markNew = (data, merge) =>
      Object.fromEntries(Object.keys(merge)
        .filter(k => data[k] == null || data[k] === '')
        .map(k => [k, true]));

    if (Object.keys(fdMerge).length) {
      setAutoFilled(p => ({ ...markNew(formData, fdMerge), ...p }));
      setFormData(p => ({ ...fdMerge, ...p }));
    }
    if (Object.keys(d1Merge).length) {
      setAutoF1(p => ({ ...markNew(d1Data, d1Merge), ...p }));
      setD1Data(p => ({ ...d1Merge, ...p }));
    }
    if (Object.keys(d2Merge).length) {
      setAutoF2(p => ({ ...markNew(d2Data, d2Merge), ...p }));
      setD2Data(p => ({ ...d2Merge, ...p }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.extractedDocs, isCouple]);

  const handleFiles = useCallback(async (input, target = 'solo') => {
    if (!input || !input.length) return;
    const apiKey = getApiKey();
    if (!apiKey) {
      toast.error('Clé API manquante — configure-la dans Réglages.');
      return;
    }
    setUploading(true);

    // Normalise : un File brut ou un descripteur { name, images } (fichier anonymisé).
    const sources = Array.from(input).map(x =>
      x instanceof File ? { name: x.name, file: x } : x);

    const newDocs = sources.map(s => ({
      id: Math.random().toString(36).slice(2),
      name: s.name,
      status: 'loading', extracted: null, warning: null,
      file: s.file ?? null, images: s.images ?? null, target,
    }));
    setDocs(p => [...p, ...newDocs]);

    for (const doc of newDocs) {
      try {
        let images = doc.images;
        if (!images) {
          images = doc.file.type.startsWith('image/')
            ? [{ blob: doc.file, mediaType: doc.file.type }]
            : await pdfToImages(doc.file);   // PDF brut → rasterisé
        }
        const extracted = await analyzeDoc(state.provider, images, apiKey);
        const { map: mapped, warning } = mapExtracted(extracted);
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'done', extracted, warning } : d));
        if (Object.keys(mapped).length > 0) {
          const mark = Object.fromEntries(Object.keys(mapped).map(k => [k, true]));
          if      (target === 'd1') { setD1Data(p => ({ ...mapped, ...p }));   setAutoF1(p => ({ ...p, ...mark })); }
          else if (target === 'd2') { setD2Data(p => ({ ...mapped, ...p }));   setAutoF2(p => ({ ...p, ...mark })); }
          else                      { setFormData(p => ({ ...mapped, ...p })); setAutoFilled(p => ({ ...p, ...mark })); }
        }
      } catch (e) {
        setDocs(p => p.map(d => d.id === doc.id ? { ...d, status: 'error', error: e.message } : d));
      }
    }
    setUploading(false);
  }, [getApiKey, state.provider]);

  // Progress (visible fields only, including capacité keys)
  const { filled: totalF, total: totalAll, pct } = (() => {
    const capF = CAPACITE_KEYS.filter(k => formData[k] && formData[k] !== '').length;
    const shown = (f, data) => _moduleVisible(f, modules, expertMode) && fieldVisible(f, data);
    if (!isCouple) {
      const visF   = SOLO_SECTIONS.flatMap(s => s.fields.filter(f => shown(f, formData)));
      const filled = visF.filter(f => formData[f.key] && formData[f.key] !== '').length + capF;
      const total  = visF.length + CAPACITE_KEYS.length;
      return { filled, total, pct: Math.round(filled / total * 100) };
    }
    const foyer  = [SECTION_SIT, SECTION_REV_FOYER, SECTION_DED, SECTION_IMMO];
    const visFoy = foyer.flatMap(s => s.fields.filter(f => shown(f, formData)));
    const foyerF = visFoy.filter(f => formData[f.key] && formData[f.key] !== '').length;
    const dFields = [...REV_FIELDS, ...EP_INDIV_FIELDS, ...PROFIL_INDIV_FIELDS];
    const visD1 = dFields.filter(f => shown(f, d1Data));
    const visD2 = dFields.filter(f => shown(f, d2Data));
    const d1F = visD1.filter(f => d1Data[f.key] && d1Data[f.key] !== '').length;
    const d2F = visD2.filter(f => d2Data[f.key] && d2Data[f.key] !== '').length;
    const total  = visFoy.length + visD1.length + visD2.length + CAPACITE_KEYS.length;
    const filled = foyerF + d1F + d2F + capF;
    return { filled, total, pct: Math.round(filled / total * 100) };
  })();

  // Prêt à générer : il suffit de la situation familiale + au moins un revenu.
  // Tout le reste est optionnel (affine le conseil) → on ne décourage pas l'utilisateur.
  const essentialsReady = (() => {
    const has = v => v != null && v !== '';
    if (!isCouple) return has(formData.statut) && has(formData.net_imp);
    return has(formData.statut) && (has(d1Data.net_imp) || has(d2Data.net_imp));
  })();

  const handleGenerate = () => {
    dispatch({ type: 'SET_FORM_DATA', payload: formData });
    dispatch({ type: 'SET_D1_DATA',   payload: d1Data });
    dispatch({ type: 'SET_D2_DATA',   payload: d2Data });
    const profile = buildProfile(formData, d1Data, d2Data, docs, isCouple);
    dispatch({ type: 'SET_PROFILE',   payload: profile });
    navigate('/profile');
  };

  const anonymizedFiles = state.anonymizedFiles || AUCUN_FICHIER;
  const handleUseAnonymized = useCallback(() => {
    const usable = anonymizedFiles.filter(f => f.pageImages?.length);
    if (usable.length === 0) {
      toast.error('Les fichiers ne sont plus disponibles — uploader manuellement.');
      return;
    }

    if (!isCouple) {
      handleFiles(usable.map(f => ({ name: f.name, images: f.pageImages })), 'solo');
      return;
    }

    const byTarget = { d1: [], d2: [] };
    for (const f of usable) {
      const t = f.target === 'd2' ? 'd2' : 'd1';
      byTarget[t].push({ name: f.name, images: f.pageImages });
    }
    if (byTarget.d1.length > 0) handleFiles(byTarget.d1, 'd1');
    if (byTarget.d2.length > 0) handleFiles(byTarget.d2, 'd2');
  }, [anonymizedFiles, handleFiles, isCouple]);

  const accProps    = { activeAcc, setActiveAcc };
  const uploadProps = { uploading, docs, onFiles: handleFiles, onRemove: removeDoc };

  const importFileRef = useRef(null);
  const handleImportProfile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string' && text.trim()) {
        const trimmed = text.trim();
        const pp = parseProfile(trimmed);

        // Reconstruit formData (champs partagés + solo)
        const str = v => (v && v !== 0) ? String(v) : '';
        const newFormData = {
          statut:       pp.statut || '',
          parts:        str(pp.parts),
          dept:         pp.departement || '',
          foncier:      str(pp.revensFonciers),
          divid:        str(pp.dividendes),
          crypto:       str(pp.revenusCrypto),
          pero_d1:      str(pp.peroD1),
          pero_d2:      str(pp.peroD2),
          per_n1:       str(pp.perReportableN1),
          per_n2:       str(pp.perReportableN2),
          per_n3:       str(pp.perReportableN3),
          int_mob_2tr:  str(pp.intMob2TR),
          int_mob_2ck:  str(pp.intMob2CK),
          acompte_8hw:  str(pp.acompte8HW),
          acompte_8iw:  str(pp.acompte8IW),
          acompte_8hx:  str(pp.acompte8HX),
          acompte_8ix:  str(pp.acompte8IX),
          // Solo : revenus, épargne et profil dans formData
          ...(pp.mode === 'solo' ? {
            brut:              str(pp.salairesBrutImposableD1),
            net_imp:           str(pp.salaireNetImposableD1),
            taux_pas:          str(pp.tauxPasD1),
            pas_tot:           str(pp.pasD1),
            livret_a:          str(pp.livretAD1),
            ldd:               str(pp.lddsD1),
            lep:               str(pp.lepD1),
            livret_plus:       str(pp.livretPlusD1),
            pel:               str(pp.pelD1),
            pel_date:          pp.pelDateD1 || '',
            pea:               str(pp.peaD1),
            pea_date:          pp.peaDateD1 || '',
            pea_verse:         str(pp.peaVerseD1),
            per:               str(pp.percoD1),
            pee:               str(pp.peeD1),
            pee_verse:         str(pp.peeVerseD1),
            abond_pee:         str(pp.percoAbondD1),  // INC-01
            av:                str(pp.avD1),
            av_date:           pp.avDateD1 || '',
            av_verse:          str(pp.avVerseD1),
            crypto_wallet:     str(pp.cryptoD1),
            crypto_plateforme: pp.cryptoPlateformeD1 || '',
            crypto_cessions:   pp.cryptoCessionsD1 || '',
            age_d1:            str(pp.ageD1),
            retraite_d1:       str(pp.retraiteD1),
            tmi_retraite_d1:   pp.tmiRetraiteD1 != null ? String(pp.tmiRetraiteD1) : '',
            type_revenu_d1:    pp.typeRevenuD1 || '',
            ij_cpam:              str(pp.ijCpamD1),
            ij_cpam_org:          pp.ijCpamOrgD1 || '',
            rente_1bs_montant:    str(pp.rente1BsD1),
            rente_1bs_pas:        str(pp.pasRente1BsD1),
            rente_1bs_organisme:  pp.orgRente1BsD1 || '',
            rente_1bs_recurrent:  pp.recurrentRente1BsD1 === false ? 'Non' : pp.recurrentRente1BsD1 === true ? 'Oui' : '',
          } : {}),
        };

        // Couple : revenus/épargne dans d1Data / d2Data séparés
        const newD1 = pp.mode === 'couple' ? {
          brut:              str(pp.salairesBrutImposableD1),
          net_imp:           str(pp.salaireNetImposableD1),
          taux_pas:          str(pp.tauxPasD1),
          pas_tot:           str(pp.pasD1),
          livret_a:          str(pp.livretAD1),
          ldd:               str(pp.lddsD1),
          lep:               str(pp.lepD1),
          livret_plus:       str(pp.livretPlusD1),
          pel:               str(pp.pelD1),
          pel_date:          pp.pelDateD1 || '',
          pea:               str(pp.peaD1),
          pea_date:          pp.peaDateD1 || '',
          pea_verse:         str(pp.peaVerseD1),
          per:               str(pp.percoD1),
          pee:               str(pp.peeD1),
          pee_verse:         str(pp.peeVerseD1),
          abond_pee:         str(pp.percoAbondD1),  // INC-01
          av:                str(pp.avD1),
          av_date:           pp.avDateD1 || '',
          av_verse:          str(pp.avVerseD1),
          crypto_wallet:     str(pp.cryptoD1),
          crypto_plateforme: pp.cryptoPlateformeD1 || '',
          crypto_cessions:   pp.cryptoCessionsD1 || '',
          age:               str(pp.ageD1),
          retraite:          str(pp.retraiteD1),
          tmi_retraite:      pp.tmiRetraiteD1 != null ? String(pp.tmiRetraiteD1) : '',
          type_revenu:       pp.typeRevenuD1 || '',
          ij_cpam:              str(pp.ijCpamD1),
          ij_cpam_org:          pp.ijCpamOrgD1 || '',
          rente_1bs_montant:    str(pp.rente1BsD1),
          rente_1bs_pas:        str(pp.pasRente1BsD1),
          rente_1bs_organisme:  pp.orgRente1BsD1 || '',
          rente_1bs_recurrent:  pp.recurrentRente1BsD1 === false ? 'Non' : pp.recurrentRente1BsD1 === true ? 'Oui' : '',
        } : null;

        const newD2 = pp.mode === 'couple' ? {
          brut:              str(pp.salairesBrutImposableD2),
          net_imp:           str(pp.salaireNetImposableD2),
          taux_pas:          str(pp.tauxPasD2),
          pas_tot:           str(pp.pasD2),
          livret_a:          str(pp.livretAD2),
          ldd:               str(pp.lddsD2),
          lep:               str(pp.lepD2),
          livret_plus:       str(pp.livretPlusD2),
          pel:               str(pp.pelD2),
          pel_date:          pp.pelDateD2 || '',
          pea:               str(pp.peaD2),
          pea_date:          pp.peaDateD2 || '',
          pea_verse:         str(pp.peaVerseD2),
          per:               str(pp.percoD2),
          pee:               str(pp.peeD2),
          pee_verse:         str(pp.peeVerseD2),
          abond_pee:         str(pp.percoAbondD2),  // INC-01
          av:                str(pp.avD2),
          av_date:           pp.avDateD2 || '',
          av_verse:          str(pp.avVerseD2),
          crypto_wallet:     str(pp.cryptoD2),
          crypto_plateforme: pp.cryptoPlateformeD2 || '',
          crypto_cessions:   pp.cryptoCessionsD2 || '',
          age:               str(pp.ageD2),
          retraite:          str(pp.retraiteD2),
          tmi_retraite:      pp.tmiRetraiteD2 != null ? String(pp.tmiRetraiteD2) : '',
          type_revenu:       pp.typeRevenuD2 || '',
          ij_cpam:              str(pp.ijCpamD2),
          ij_cpam_org:          pp.ijCpamOrgD2 || '',
          rente_1bs_montant:    str(pp.rente1BsD2),
          rente_1bs_pas:        str(pp.pasRente1BsD2),
          rente_1bs_organisme:  pp.orgRente1BsD2 || '',
          rente_1bs_recurrent:  pp.recurrentRente1BsD2 === false ? 'Non' : pp.recurrentRente1BsD2 === true ? 'Oui' : '',
        } : null;

        dispatch({ type: 'SET_MODE',      payload: pp.mode });
        dispatch({ type: 'SET_PROFILE',   payload: trimmed });
        dispatch({ type: 'SET_FORM_DATA', payload: newFormData });
        if (newD1) dispatch({ type: 'SET_D1_DATA', payload: newD1 });
        if (newD2) dispatch({ type: 'SET_D2_DATA', payload: newD2 });
        toast.success('Profil importé — vérifiez les données puis continuez.');
      } else {
        toast.error('Fichier vide ou invalide.');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  // L'étape 0 n'a pas été faite → on renvoie vers /anonymize (gate de la situation).
  if (needsSituation) return <Navigate to="/anonymize" replace />;

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <div className="flex gap-2 flex-wrap mb-2">
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Étape 2 / 5</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Collecte fiscale</h1>
        <p className="text-sm text-gray-500">
          {showWizard
            ? 'Répondez à quelques questions pour personnaliser votre collecte.'
            : 'Upload tes documents anonymisés → l\'IA extrait les chiffres → tu vérifies et génères ton profil.'}
        </p>
        <div className="flex gap-2 flex-wrap mt-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-600 border border-teal-100">
            Fiscal 2025
          </span>
          {!showWizard && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100">
              <Sparkles size={10} /> IA Auto-Fill
            </span>
          )}
          {isCouple && !showWizard && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100">
              <Users size={10} /> Mode couple
            </span>
          )}
        </div>
      </div>

      {/* Contenu principal */}
      {!showWizard && (<>

      {/* Import profil existant */}
      <input ref={importFileRef} type="file" accept=".txt" className="hidden" onChange={handleImportProfile} />
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 px-4 py-3">
        <p className="text-xs text-gray-500">Vous avez déjà un profil .txt ?</p>
        <button
          type="button"
          onClick={() => importFileRef.current?.click()}
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 border border-teal-200 bg-white rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors shrink-0"
        >
          <FolderOpen size={13} /> Importer directement
        </button>
      </div>

      {/* Bannière fichiers anonymisés */}
      {anonymizedFiles.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-teal-800">
            <CheckCircle size={15} className="text-teal-500 shrink-0" />
            <span>
              <strong>{anonymizedFiles.length} fichier(s) anonymisé(s)</strong> depuis l'étape précédente.
              {isCouple && <span className="text-teal-600"> (sera chargé dans D1)</span>}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleUseAnonymized} disabled={uploading}>
            Utiliser →
          </Button>
        </div>
      )}

      {/* Mode couple info */}
      {isCouple && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-gray-700">
          <Users size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong className="text-amber-700">Marié(e) ou Pacsé(e) depuis 2024</strong> — déclaration commune obligatoire.
            Remplis les blocs D1 et D2 avec vos fiches de paie respectives.
          </span>
        </div>
      )}

      {/* Barre de contrôle profil (onboarding fait) */}
      {collectProfile.onboardingDone && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleToggleExpert}
            className="flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-600"
          >
            <Eye size={12} />
            {expertMode ? 'Afficher uniquement mon profil' : 'Afficher tous les champs'}
          </button>
          {!expertMode && (
            <button
              type="button"
              onClick={handleReconfigure}
              className="flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors bg-white border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-600"
            >
              <Settings2 size={12} />
              Reconfigurer mon profil
            </button>
          )}
        </div>
      )}

      {/* État de préparation — centré sur l'essentiel, pas sur l'exhaustivité */}
      <div className={[
        'rounded-2xl border shadow-sm p-4 transition-colors',
        essentialsReady ? 'border-teal-200 bg-teal-50/50' : 'border-gray-100 bg-white',
      ].join(' ')}>
        {essentialsReady ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-gradient text-white flex items-center justify-center shrink-0">
              <CheckCircle size={17} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-teal-800">Prêt à générer votre profil</p>
              <p className="text-xs text-teal-600 leading-snug">
                L'essentiel est renseigné. Les autres champs sont optionnels — ils affinent le conseil ({pct}% complété).
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-500 flex items-center justify-center shrink-0">
              <User size={16} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-800">2 infos suffisent pour démarrer</p>
              <p className="text-xs text-gray-500 leading-snug">
                Renseignez votre <span className="font-semibold text-teal-600">situation familiale</span> et votre
                <span className="font-semibold text-teal-600"> revenu net imposable</span> — le calcul se lance dès maintenant, le reste est optionnel.
              </p>
            </div>
          </div>
        )}
        {/* Détail discret pour qui veut tout compléter */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${essentialsReady ? 'bg-teal-500' : 'bg-gradient-to-r from-teal-500 to-purple-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-gray-400 shrink-0">{totalF}/{totalAll}</span>
        </div>
      </div>

      {/* Upload zone — solo only */}
      {!isCouple && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Upload size={14} className="text-teal-500" /> Upload documents
          </h2>
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-gray-700">
            <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <span>
              <strong className="text-amber-700">Anonymise impérativement</strong> — masque nom, adresse, n° SS, IBAN.
              Garde les montants.
            </span>
          </div>
          <UploadZone target="solo" {...uploadProps} />
          {Object.keys(autoFilled).length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs bg-teal-50 border border-teal-200 text-teal-700 rounded-xl px-3 py-2">
              <Sparkles size={11} />
              {Object.keys(autoFilled).length} champ(s) pré-rempli(s) automatiquement par l'IA.
            </div>
          )}
        </div>
      )}

      {/* Form sections */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Compléter / vérifier</h2>
        <p className="text-xs text-gray-400 mb-3 leading-snug">
          Seuls les champs <span className="font-semibold text-teal-600">essentiels</span> sont nécessaires pour un premier calcul.
          Tout le reste affine le conseil — remplissez ce que vous savez, laissez vide le reste.
        </p>

        {/* Props partagés pour filtrage par module */}
        {(() => {
          const modProps = { modules, expertMode };
          const immoReason = modules.foncier
            ? 'Affiché car vous percevez des loyers ou revenus fonciers'
            : 'Affiché car vous possédez un bien immobilier';
          const hasEpModule = expertMode || modules.livrets || modules.pel || modules.pea
            || modules.cto || modules.assuranceVie || modules.perVolontaire
            || modules.epargneSalariale || modules.crypto;

          return (
            <>
              <AccSection
                section={SECTION_SIT}
                data={formData}
                onChange={handleChange}
                autoFKeys={autoFilled}
                {...accProps} {...modProps}
              />

              {!isCouple ? (
                <>
                  <AccSection section={SECTION_PROFIL_SOLO} data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} {...modProps} />
                  <AccSection section={SECTION_REV_SOLO}    data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} {...modProps} />
                  <CapaciteSection formData={formData} onChange={handleChange} isCouple={false} {...accProps} />
                  {hasEpModule && (
                    <AccSection section={SECTION_EP_SOLO}     data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} {...modProps} />
                  )}
                  <AccSection section={SECTION_DED_SOLO}    data={formData} onChange={handleChange} autoFKeys={autoFilled} {...accProps} {...modProps} />
                  {(expertMode || modules.immobilier || modules.foncier) && (
                    <AccSection section={SECTION_IMMO} data={formData} onChange={handleChange} autoFKeys={autoFilled}
                      reason={immoReason} {...accProps} {...modProps} />
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-2 text-xs text-blue-700">
                    <Upload size={12} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>Upload séparé par déclarant</strong> — dépose les fiches dans le bloc correspondant pour un auto-fill précis.
                    </span>
                  </div>
                  <DeclarantBlock
                    num={1} data={d1Data} onChange={handleD1Change} autoFKeys={autoF1}
                    uploadTarget="d1" {...accProps} {...uploadProps} {...modProps}
                  />
                  <DeclarantBlock
                    num={2} data={d2Data} onChange={handleD2Change} autoFKeys={autoF2}
                    uploadTarget="d2" {...accProps} {...uploadProps} {...modProps}
                  />
                  {(expertMode || modules.foncier || modules.capitauxMobiliers || modules.crypto || modules.international) && (
                    <AccSection section={SECTION_REV_FOYER} data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} {...modProps} />
                  )}
                  <AccSection section={SECTION_DED} data={formData} onChange={handleChange} autoFKeys={{}} {...accProps} {...modProps} />
                  <CapaciteSection formData={formData} onChange={handleChange} d1Data={d1Data} d2Data={d2Data} isCouple={true} {...accProps} />
                  {(expertMode || modules.immobilier || modules.foncier) && (
                    <AccSection section={SECTION_IMMO} data={formData} onChange={handleChange} autoFKeys={{}}
                      reason={immoReason} {...accProps} {...modProps} />
                  )}
                </>
              )}
            </>
          );
        })()}
      </div>

      {/* Generate CTA */}
      <Button
        variant="primary"
        size="lg"
        className="w-full !rounded-2xl"
        onClick={handleGenerate}
      >
        <Sparkles size={16} /> Générer mon profil fiscal →
      </Button>
      {!essentialsReady && (
        <p className="-mt-2 text-center text-xs text-gray-400">
          Astuce : renseignez au moins votre situation et votre revenu pour un résultat fiable.
        </p>
      )}

      <div className="flex justify-start -mt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/anonymize')}>
          <ArrowLeft size={14} /> Retour à l&apos;anonymisation
        </Button>
      </div>

      </>)}

    </div>
  );
}
