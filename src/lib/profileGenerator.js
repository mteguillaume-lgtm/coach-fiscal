import { abattement10, abattement10Pension, calcPlafondPer, calcParts, calcDeductionsRevenu, calcMicroTns, estimCotisationsMicro, MICRO_TNS_REGIMES, MIN_PLAFOND_PER, MAX_PLAFOND_PER } from './taxCalculator';

const APP_VERSION = 'v4.1.0';

// Déductions du revenu global (pension alimentaire versée, frais d'accueil) +
// pension reçue (imposable). Renvoie les montants et le bloc texte (lisible parser).
function _deductionsRevenu(d) {
  const ded = calcDeductionsRevenu({
    pensionVersee:  parseFloat(d.pension || 0),
    pensionBenef:   d.pension_benef || '',
    pensionNb:      parseInt(d.pension_nb || 1),
    fraisAccueil:   parseFloat(d.frais_accueil || 0),
    fraisAccueilNb: parseInt(d.frais_accueil_nb || 1),
  });
  const pensionRecue = parseFloat(d.pension_recue || 0) || 0;
  const lines = [];
  if (ded.pensionDeduc > 0) {
    lines.push(`Pension alimentaire versée (déductible) : ${fmtN(ded.pensionDeduc)}${d.pension_benef ? ` → ${d.pension_benef}` : ''}`);
  }
  if (ded.fraisAccueilDeduc > 0) lines.push(`Frais d'accueil personne âgée (6EU) : ${fmtN(ded.fraisAccueilDeduc)}`);
  if (ded.total > 0)             lines.push(`Déductions du revenu (total) : ${fmtN(ded.total)}`);
  if (pensionRecue > 0)          lines.push(`Pension alimentaire reçue (1AO) : ${fmtN(pensionRecue)}`);
  return { total: ded.total, pensionRecue, deltaRni: pensionRecue - ded.total, lines: lines.join('\n') };
}

// Frais de scolarité : nombre d'enfants scolarisés par cycle (réduction forfaitaire).
function _scolariteLine(d) {
  const c = parseInt(d.scol_college || 0) || 0;
  const l = parseInt(d.scol_lycee || 0) || 0;
  const s = parseInt(d.scol_sup || 0) || 0;
  if (!c && !l && !s) return '';
  const parts = [];
  if (c) parts.push(`collège ${c}`);
  if (l) parts.push(`lycée ${l}`);
  if (s) parts.push(`supérieur ${s}`);
  return `\nFrais de scolarité (enfants scolarisés) : ${parts.join(', ')}`;
}

// CTO : ligne courtier optionnelle. Si courtier étranger → marqueur 3916
// (réutilise la détection courtier_etranger de checklistGenerator.js).
const _CTO_COURTIER_ETRANGER = /interactive ?broker|trading ?212|degiro|saxo|schwab|étranger/i;
function _ctoCourtierLine(cto, courtier) {
  if (!cto || cto === '0' || !courtier) return '';
  const flag = _CTO_COURTIER_ETRANGER.test(courtier) ? ' (courtier étranger → 3916)' : '';
  return `\nCTO courtier : ${courtier}${flag}`;
}

// Composition familiale → parts + demi-parts par catégorie (art. 194-195 CGI).
// Le nombre de parts est DÉRIVÉ de la composition (calcParts) ; un champ `parts`
// renseigné par l'utilisateur reste prioritaire (override manuel).
function _famille(d, isCouple) {
  const nbEnfants             = parseInt(d.enfants || 0)             || 0;
  const nbEnfantsAlternes     = parseInt(d.enfants_alternes || 0)   || 0;
  const nbEnfantsInvalides    = parseInt(d.enfants_invalides || 0)  || 0;
  const nbEnfantsRattaches    = parseInt(d.enfants_rattaches || 0)  || 0;
  const nbDemiPartsInvalidite = parseInt(d.invalidite_demiparts || 0) || 0;
  const parentIsole           = d.parent_isole === 'Oui';
  const veuf                  = /veuf/i.test(d.statut || '');

  const pc = calcParts({
    isCouple, veuf, nbEnfants, nbEnfantsAlternes, nbEnfantsInvalides,
    parentIsole, nbDemiPartsInvalidite, nbEnfantsRattaches,
  });
  const partsManuel = parseFloat(d.parts || 0);
  const parts = partsManuel > 0 ? partsManuel : pc.parts;
  return {
    ...pc, parts, partsManuel, parentIsole, veuf,
    nbEnfants, nbEnfantsAlternes, nbEnfantsInvalides, nbEnfantsRattaches,
    invaliditeDirecte: nbDemiPartsInvalidite, // demi-parts P/F/G/S/W déclarant/conjoint
  };
}

// Bloc texte des lignes familiales (lisibles par le parser).
function _familleLines(fam) {
  const L = [];
  L.push(`Enfants à charge : ${fam.nbEnfants}`);
  if (fam.nbEnfantsAlternes > 0)  L.push(`Enfants en résidence alternée : ${fam.nbEnfantsAlternes}`);
  if (fam.nbEnfantsInvalides > 0) L.push(`Enfants invalides (CMI) : ${fam.nbEnfantsInvalides}`);
  if (fam.nbEnfantsRattaches > 0) L.push(`Enfants majeurs rattachés : ${fam.nbEnfantsRattaches}`);
  if (fam.parentIsole)            L.push(`Parent isolé (case T) : Oui`);
  if (fam.invaliditeDirecte > 0)  L.push(`Demi-parts invalidité (déclarant/conjoint) : ${fam.invaliditeDirecte}`);
  L.push(`Parts fiscales : ${fam.parts}${fam.partsManuel > 0 ? ' (saisie manuelle)' : ' (calculées)'}`);
  // Lignes machine pour le plafonnement QF (chaque catégorie a son plafond propre).
  if (fam.nbDemiPartsT > 0)          L.push(`Demi-parts case T : ${fam.nbDemiPartsT}`);
  if (fam.nbDemiPartsL > 0)          L.push(`Demi-parts case L : ${fam.nbDemiPartsL}`);
  if (fam.nbDemiPartsInvalidite > 0) L.push(`Demi-parts invalidité QF : ${fam.nbDemiPartsInvalidite}`);
  return L.join('\n');
}

const fmt    = v => v && v !== '0' ? Number(v).toLocaleString('fr-FR') + ' €' : 'Néant';
const fmtOui = v => v && v !== '0' ? `OUI ~${Number(v).toLocaleString('fr-FR')} €` : 'Néant';
const fmtN   = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

// Micro-foncier : abattement 30% automatique si total brut < 15 000 €
function calcFoncier(brut) {
  if (!brut || brut <= 0) return { brut: 0, net: 0, regime: null, ps: 0 };
  const isMicro = brut <= 15000;
  const net  = isMicro ? Math.round(brut * 0.70) : brut;
  const ps   = Math.round(net * 0.172);
  return { brut, net, regime: isMicro ? 'micro-foncier (abat. 30%)' : 'régime réel', ps };
}

// Revenus indépendants au régime micro (BIC / BNC / BA).
// Bénéfice imposable = recettes − abattement forfaitaire ; ajouté au RNI SAUF si
// versement libératoire de l'IR (revenu alors taxé séparément, hors barème).
// Cotisations URSSAF : estimation indicative (micro-tns.json). Régime réel ou
// dépassement de seuil → flag de routage expert-comptable.
// `declarants` = [{ decl, who }] (un seul en solo, deux en couple).
function _tnsBlock(declarants) {
  const lignes = [];
  let deltaRni = 0;   // bénéfice réintégré au barème (hors VL)
  let vlTotal  = 0;   // versement libératoire IR total
  let reelFlag = false;

  for (const { decl, who } of declarants) {
    const type     = decl?.tns_type || '';
    const recettes = parseFloat(decl?.tns_recettes || 0);
    if (!type || !MICRO_TNS_REGIMES[type] || !(recettes > 0)) continue;

    const vl    = decl?.tns_vl === 'Oui';
    const micro = calcMicroTns({ type, recettes });
    const cot   = estimCotisationsMicro({ type, recettes, versementLiberatoire: vl });
    const reg   = MICRO_TNS_REGIMES[type];
    const caseR = reg.cases_recettes?.[who] || '';

    if (!vl) deltaRni += micro.beneficeImposable;
    vlTotal += cot.versementLiberatoire;
    if (micro.regimeReelObligatoire) reelFlag = true;

    lignes.push(`Activité ${who} : ${reg.label}${caseR ? ` (${caseR})` : ''}`);
    lignes.push(`Recettes brutes ${who} : ${fmtN(recettes)}`);
    lignes.push(`Abattement forfaitaire ${Math.round(reg.abattement * 100)} % ${who} : ${fmtN(micro.abattementEuros)}`);
    lignes.push(`Bénéfice imposable ${who} : ${fmtN(micro.beneficeImposable)}`);
    lignes.push(`Versement libératoire IR ${who} : ${vl ? `Oui (${fmtN(cot.versementLiberatoire)})` : 'Non'}`);
    lignes.push(`Cotisations sociales estimées ${who} (${(cot.tauxCotisations * 100).toLocaleString('fr-FR')} %) : ${fmtN(cot.cotisations)}`);
    if (micro.depassementSeuil) {
      lignes.push(`⚠️ Recettes ${who} > seuil micro (${fmtN(reg.seuil_recettes_brutes)}) → régime réel (liasse) : voir expert-comptable`);
    }
  }

  if (!lignes.length) return { deltaRni: 0, vlTotal: 0, reelFlag: false, section: '' };

  const section = `
== REVENUS INDÉPENDANTS (TNS) ==
${lignes.join('\n')}
Bénéfice TNS imposable foyer (hors VL) : ${fmtN(deltaRni)}
Versement libératoire IR foyer (total) : ${fmtN(vlTotal)}`;
  return { deltaRni, vlTotal, reelFlag, section };
}

// Plafond PER : 10% du RNI (après abattement 10% salaires) ou plancher PASS, moins PERO et abondement.
// Délègue à calcPlafondPer (source unique de vérité dans taxCalculator.js) pour le calcul de dispo.
function fmtPlafondPer(netImp, pero, abondPEEPERCO = 0) {
  const netImpN = parseFloat(netImp || 0);
  const peroN   = parseFloat(pero   || 0);
  const abondN  = parseFloat(abondPEEPERCO || 0);
  const base    = abattement10(netImpN);
  const brut10  = base > 0 ? Math.round(base * 0.10) : 0;
  const plafond = Math.min(Math.max(brut10, MIN_PLAFOND_PER), MAX_PLAFOND_PER);
  const dispo   = calcPlafondPer(netImpN, peroN, abondN);  // source unique de vérité
  return { brut10, plafond, dispo };
}

function _perReportables(d) {
  const n1 = parseInt(d.per_n1 || 0); const n2 = parseInt(d.per_n2 || 0); const n3 = parseInt(d.per_n3 || 0);
  const tot = n1 + n2 + n3;
  if (!tot) return '';
  return `\n${n1 > 0 ? `Plafond reportable N-1 : ${n1.toLocaleString('fr-FR')} €\n` : ''}${n2 > 0 ? `Plafond reportable N-2 : ${n2.toLocaleString('fr-FR')} €\n` : ''}${n3 > 0 ? `Plafond reportable N-3 : ${n3.toLocaleString('fr-FR')} €\n` : ''}Plafond reportable total (3 ans) : ${tot.toLocaleString('fr-FR')} €`;
}

// ─── Solo branch ──────────────────────────────────────────────────────────────

function _buildSolo(d, docSums) {
  const net1AJ   = parseFloat(d.net_imp  || 0);
  const rni      = abattement10(net1AJ);
  const foncier  = calcFoncier(parseFloat(d.foncier || 0));
  const dedInfo  = _deductionsRevenu(d);
  const tns      = _tnsBlock([{ decl: d, who: 'D1' }]);
  const rniTotal = Math.max(0, rni + foncier.net + dedInfo.deltaRni + tns.deltaRni);
  const fam      = _famille(d, false);
  const parts    = fam.parts;
  const pero     = parseFloat(d.pero_d1 || 0);
  const pas      = parseFloat(d.pas_tot || 0);
  const abondD1  = parseFloat(d.abond_pee || 0);  // INC-01 : abondement PEE/PERCO D1
  const per      = fmtPlafondPer(d.net_imp, d.pero_d1, abondD1);

  const ijCpam   = parseFloat(d.ij_cpam || 0);
  const rente1Bs = parseFloat(d.rente_1bs_montant || 0);
  const pasRente = parseFloat(d.rente_1bs_pas || 0);

  const ageD1      = parseInt(d.age_d1 || 0);
  const retraiteD1 = parseInt(d.retraite_d1 || 0);
  const horizonD1  = ageD1 > 0 && retraiteD1 > ageD1 ? retraiteD1 - ageD1 : null;
  const typeRevD1  = d.type_revenu_d1 || 'Salarié(e)';
  const pensionD1  = parseFloat(d.pension_net_imp_d1 || 0);

  return `== PROFIL FISCAL PERSONNEL 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}

== SITUATION PERSONNELLE ==
Statut : ${d.statut || 'Non renseigné'}
${_familleLines(fam)}
Département : ${d.dept || 'Non renseigné'}

== PROFIL & RETRAITE ==
Âge : ${ageD1 > 0 ? ageD1 + ' ans' : 'Non renseigné'}
Âge retraite estimé : ${retraiteD1 > 0 ? retraiteD1 + ' ans' : 'Non renseigné'}
${horizonD1 !== null ? `Horizon retraite : ${horizonD1} ans` : ''}
TMI retraite estimée : ${d.tmi_retraite_d1 && d.tmi_retraite_d1 !== '' ? d.tmi_retraite_d1 + '%' : 'Non renseignée'}
Type de revenu : ${typeRevD1}
${pensionD1 > 0 ? `Pension nette imposable 1AS : ${Number(pensionD1).toLocaleString('fr-FR')} €` : ''}

== REVENUS 2025 ==
Brut imposable annuel : ${d.brut ? Number(d.brut).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Net imposable annuel (1AJ — case déclaration) : ${net1AJ > 0 ? fmtN(net1AJ) : 'Non renseigné'}${ijCpam > 0 ? ` (dont ${fmtN(ijCpam)} IJ CPAM — attestation ${d.ij_cpam_org || 'CPAM'})` : ''}
RNI après abattement 10% salaires : ${rni > 0 ? fmtN(rni) : 'Non calculable'}
Taux PAS : ${d.taux_pas ? d.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${pas > 0 ? fmtN(pas) : 'Non renseigné'}
Frais réels : ${d.frais_r && d.frais_r !== '0' ? Number(d.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}
${rente1Bs > 0 ? `Rente viagère — case 1BS (D1) :
  Organisme : ${d.rente_1bs_organisme || 'Non renseigné'}
  Montant 1BS déclaré : ${fmtN(rente1Bs)}
  PAS rente 1BS : ${pasRente > 0 ? fmtN(pasRente) : '0 €'}
  Récurrent : ${d.rente_1bs_recurrent || 'Oui'}` : ''}
${foncier.brut > 0 ? `
Revenus fonciers bruts : ${fmtN(foncier.brut)}
Régime foncier : ${foncier.regime}
Revenus fonciers nets imposables : ${fmtN(foncier.net)}
Prélèvements sociaux fonciers (17,2%) : ${fmtN(foncier.ps)}` : 'Revenus fonciers : Néant'}
Dividendes/intérêts : ${fmt(d.divid)}${parseFloat(d.div_2dc || 0) > 0 ? `\nDividendes bruts (case 2DC) : ${fmtN(parseFloat(d.div_2dc))}` : ''}
Revenus crypto : ${fmt(d.crypto)}
${parseFloat(d.int_mob_2tr || 0) > 0 ? `Intérêts mobiliers bruts (case 2TR) : ${fmtN(parseFloat(d.int_mob_2tr))}
${parseFloat(d.int_mob_2ck || 0) > 0 ? `PFU 12,8% prélevé (case 2CK) : ${fmtN(parseFloat(d.int_mob_2ck))}` : ''}
Intérêts soumis PS (case 2BH) : ${fmtN(parseFloat(d.int_mob_2tr))}` : ''}
${tns.section}
== DONNÉES POUR CALCUL IR ==
RNI total (salaires + foncier net + TNS) : ${fmtN(rniTotal)}
Parts fiscales : ${parts}
PAS prélevé 2025 : ${pas > 0 ? fmtN(pas) : 'Non renseigné'}
${parseFloat(d.acompte_8hw || 0) > 0 ? `Acompte IR D1 (8HW) : ${fmtN(parseFloat(d.acompte_8hw))}` : ''}
${parseFloat(d.acompte_8hx || 0) > 0 ? `Acompte PS D1 (8HX) : ${fmtN(parseFloat(d.acompte_8hx))}` : ''}
→ IR net, TMI, régularisation PAS : à calculer lors de l'enrichissement IA

== PLAFOND PER 2026 ==
10% du RNI (${fmtN(rni)}) : ${fmtN(per.brut10)}
Plancher PASS (10% × 47 100 €) : ${fmtN(MIN_PLAFOND_PER)}
Plafond retenu : ${fmtN(per.plafond)}
PERO obligatoire déduit : ${pero > 0 ? fmtN(pero) : 'Néant'}
PLAFOND DISPONIBLE : ${fmtN(per.dispo)}${_perReportables(d)}

== ÉPARGNE ET PLACEMENTS ==
Livret A : ${fmtOui(d.livret_a)}
LDDS : ${fmtOui(d.ldd)}
LEP : ${fmtOui(d.lep)}
Livret+ / Livret bancaire : ${fmtOui(d.livret_plus)}
PEL : ${fmtOui(d.pel)}${d.pel_date ? `\nPEL date ouverture : ${d.pel_date}` : ''}
PEA : ${fmtOui(d.pea)}${d.pea_date ? `\nPEA date ouverture : ${d.pea_date}` : ''}${d.pea_verse && d.pea_verse !== '0' ? `\nPEA total versé : ${Number(d.pea_verse).toLocaleString('fr-FR')} €` : ''}
CTO (compte-titres ordinaire) : ${fmtOui(d.cto)}${_ctoCourtierLine(d.cto, d.cto_courtier)}
Assurance-vie : ${fmtOui(d.av)}${d.av_date ? `\nAV date souscription : ${d.av_date}` : ''}${d.av_verse && d.av_verse !== '0' ? `\nAV versements nets cumulés : ${Number(d.av_verse).toLocaleString('fr-FR')} €` : ''}
PER versements 2025 : ${fmt(d.per)}
PEE (valorisation) : ${fmtOui(d.pee)}${d.pee_verse && d.pee_verse !== '0' ? `\nPEE versements salarié 2025 : ${Number(d.pee_verse).toLocaleString('fr-FR')} €` : ''}${abondD1 > 0 ? `\nPERCO — abondement employeur 2025 : ${abondD1.toLocaleString('fr-FR')} €` : ''}
Crypto (valeur wallet) : ${fmtOui(d.crypto_wallet)}${d.crypto_plateforme ? `\nCrypto plateforme : ${d.crypto_plateforme}` : ''}${d.crypto_cessions === 'Oui' ? '\nCrypto cessions 2025 : Oui' : ''}${d.crypto_montant_cede ? `\nCrypto montant cédé : ${Number(d.crypto_montant_cede).toLocaleString('fr-FR')} €` : ''}${d.crypto_pv ? `\nCrypto plus-value nette : ${Number(d.crypto_pv).toLocaleString('fr-FR')} €` : ''}

== DÉDUCTIONS ==
Dons associations : ${fmt(d.dons)}${parseFloat(d.dons_aide || 0) > 0 ? `\nDons aide aux personnes (75%) : ${fmtN(parseFloat(d.dons_aide))}` : ''}
Frais garde enfants : ${fmt(d.garde)}
Emploi à domicile : ${fmt(d.domicile)}
Rénov. énergétique / MaPrimeRénov : ${fmt(d.travaux)}
PERO — cotisations 2025 : ${d.pero_d1 && d.pero_d1 !== '0' ? Number(d.pero_d1).toLocaleString('fr-FR') + ' € → case 6QS/6QT/6QU (déjà inclus dans 1AJ)' : 'Néant'}
${dedInfo.lines || 'Pension alimentaire versée : Néant'}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}${_scolariteLine(d)}

== CAPACITÉ D'ÉPARGNE ==
${d.charges_fixes ? `Charges fixes mensuelles : ${Number(d.charges_fixes).toLocaleString('fr-FR')} €/mois` : 'Charges fixes : Non renseignées'}
${d.credit_rp ? `dont crédit RP / loyer : ${Number(d.credit_rp).toLocaleString('fr-FR')} €/mois` : ''}
${d.autres_credits ? `dont autres crédits : ${Number(d.autres_credits).toLocaleString('fr-FR')} €/mois` : ''}
${d.objectif_patrimonial ? `Objectif patrimonial : ${d.objectif_patrimonial}` : ''}
${(() => {
  const net = parseFloat(d.net_imp || 0);
  const men = Math.round(abattement10(net) / 12);
  const charges = parseFloat(d.charges_fixes || 0);
  if (!charges || !men) return '';
  const cap = Math.max(0, men - charges);
  return `Revenu net mensuel : ${men.toLocaleString('fr-FR')} €/mois\nCapacité d'épargne mensuelle : ${cap.toLocaleString('fr-FR')} €/mois (${men > 0 ? Math.round(cap / men * 100) : 0} % du revenu net)`;
})()}

== IMMOBILIER ==
Propriétaire RP : ${d.proprio || 'Non renseigné'}
${d.proprio === 'Oui' && d.rp_valeur ? `RP — valeur estimée : ${Number(d.rp_valeur).toLocaleString('fr-FR')} €` : ''}
${d.proprio === 'Oui' ? `Crédit immobilier en cours : ${d.credit_en_cours || 'Non renseigné'}` : ''}
${d.credit_en_cours === 'Oui' && d.credit_crd ? `Capital restant dû : ${Number(d.credit_crd).toLocaleString('fr-FR')} €` : ''}
${d.credit_en_cours === 'Oui' && d.credit_taux ? `Taux crédit : ${d.credit_taux} %` : ''}
${d.credit_en_cours === 'Oui' && d.credit_mensualite ? `Mensualité crédit : ${Number(d.credit_mensualite).toLocaleString('fr-FR')} €/mois` : ''}
${d.proprio === 'Oui' && d.taxe_fonciere ? `Taxe foncière : ${Number(d.taxe_fonciere).toLocaleString('fr-FR')} €/an` : ''}
Bien locatif : ${d.locatif || 'Non renseigné'}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}
${docSums ? '\n== DONNÉES BRUTES EXTRAITES PAR IA ==\n' + docSums + '\n' : ''}`;
}

// ─── Couple branch ────────────────────────────────────────────────────────────

function _buildCouple(d, d1, d2, docSums) {
  const ageD1c      = parseInt(d1.age || 0);
  const retraiteD1c = parseInt(d1.retraite || 0);
  const horizonD1c  = ageD1c > 0 && retraiteD1c > ageD1c ? retraiteD1c - ageD1c : null;
  const ageD2c      = parseInt(d2.age || 0);
  const retraiteD2c = parseInt(d2.retraite || 0);
  const horizonD2c  = ageD2c > 0 && retraiteD2c > ageD2c ? retraiteD2c - ageD2c : null;

  const typeRevD1c  = d1.type_revenu || 'Salarié(e)';
  const pensionD1c  = parseFloat(d1.pension_net_imp || 0);
  const typeRevD2c  = d2.type_revenu || 'Salarié(e)';
  const pensionD2c  = parseFloat(d2.pension_net_imp || 0);

  const ijCpamD1c   = parseFloat(d1.ij_cpam || 0);
  const rente1BsD1c = parseFloat(d1.rente_1bs_montant || 0);
  const pasRenteD1c = parseFloat(d1.rente_1bs_pas || 0);
  const ijCpamD2c   = parseFloat(d2.ij_cpam || 0);
  const rente1BsD2c = parseFloat(d2.rente_1bs_montant || 0);
  const pasRenteD2c = parseFloat(d2.rente_1bs_pas || 0);

  const net1AJd1 = parseFloat(d1.net_imp || 0);
  const net1AJd2 = parseFloat(d2.net_imp || 0);
  // RNI part salaires (cas standard, retraité, ou mixte). Cas particulier "mixte"
  // = salaire + pension, chacun avec son propre abattement 10 %.
  const rniSalD1 = typeRevD1c === 'Retraité(e)' ? abattement10Pension(net1AJd1)
                 : typeRevD1c === 'Mixte'        ? abattement10(net1AJd1) + abattement10Pension(pensionD1c)
                 :                                  abattement10(net1AJd1);
  const rniSalD2 = typeRevD2c === 'Retraité(e)' ? abattement10Pension(net1AJd2)
                 : typeRevD2c === 'Mixte'        ? abattement10(net1AJd2) + abattement10Pension(pensionD2c)
                 :                                  abattement10(net1AJd2);
  // Rente viagère 1AS/1BS : abat. 10 % pensions (art. 158-5-a CGI).
  const rniRenteD1 = rente1BsD1c > 0 ? abattement10Pension(rente1BsD1c) : 0;
  const rniRenteD2 = rente1BsD2c > 0 ? abattement10Pension(rente1BsD2c) : 0;
  // RNI total par déclarant (salaires + rente) — base utilisée pour l'IR foyer.
  const rniD1 = rniSalD1 + rniRenteD1;
  const rniD2 = rniSalD2 + rniRenteD2;
  const foncier  = calcFoncier(parseFloat(d.foncier || 0));
  const fam      = _famille(d, true);
  const parts    = fam.parts;
  const dedInfo  = _deductionsRevenu(d);
  const tns      = _tnsBlock([{ decl: d1, who: 'D1' }, { decl: d2, who: 'D2' }]);
  const rniFoyer = Math.max(0, rniD1 + rniD2 + foncier.net + dedInfo.deltaRni + tns.deltaRni);

  const pasD1    = parseFloat(d1.pas_tot || 0);
  const pasD2    = parseFloat(d2.pas_tot || 0);
  const pasFoyer = pasD1 + pasD2;
  const peroD1   = parseFloat(d.pero_d1 || 0);
  const peroD2   = parseFloat(d.pero_d2 || 0);
  const abondD1c = parseFloat(d1.abond_pee || 0);  // INC-01 : abondement PEE/PERCO D1
  const abondD2c = parseFloat(d2.abond_pee || 0);  // INC-01 : abondement PEE/PERCO D2

  const perD1  = fmtPlafondPer(d1.net_imp, d.pero_d1, abondD1c);
  const perD2  = fmtPlafondPer(d2.net_imp, d.pero_d2, abondD2c);

  return `== PROFIL FISCAL FOYER 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}
Mode : Déclaration commune (${d.statut || 'couple'})

== SITUATION DU FOYER ==
Statut : ${d.statut || 'Non renseigné'}
${_familleLines(fam)}
Département : ${d.dept || 'Non renseigné'}

== PROFIL & RETRAITE ==
Âge D1 : ${ageD1c > 0 ? ageD1c + ' ans' : 'Non renseigné'}
Âge retraite D1 : ${retraiteD1c > 0 ? retraiteD1c + ' ans' : 'Non renseigné'}
${horizonD1c !== null ? `Horizon retraite D1 : ${horizonD1c} ans` : ''}
TMI retraite D1 : ${d1.tmi_retraite && d1.tmi_retraite !== '' ? d1.tmi_retraite + '%' : 'Non renseignée'}
Type de revenu D1 : ${typeRevD1c}
${pensionD1c > 0 ? `Pension nette imposable 1AS D1 : ${Number(pensionD1c).toLocaleString('fr-FR')} €` : ''}
Âge D2 : ${ageD2c > 0 ? ageD2c + ' ans' : 'Non renseigné'}
Âge retraite D2 : ${retraiteD2c > 0 ? retraiteD2c + ' ans' : 'Non renseigné'}
${horizonD2c !== null ? `Horizon retraite D2 : ${horizonD2c} ans` : ''}
TMI retraite D2 : ${d2.tmi_retraite && d2.tmi_retraite !== '' ? d2.tmi_retraite + '%' : 'Non renseignée'}
Type de revenu D2 : ${typeRevD2c}
${pensionD2c > 0 ? `Pension nette imposable 1AS D2 : ${Number(pensionD2c).toLocaleString('fr-FR')} €` : ''}

== REVENUS 2025 — DÉCLARANT 1 ==
Brut imposable annuel : ${d1.brut ? Number(d1.brut).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Net imposable annuel (1AJ — case déclaration) : ${net1AJd1 > 0 ? fmtN(net1AJd1) : 'Non renseigné'}${ijCpamD1c > 0 ? ` (dont ${fmtN(ijCpamD1c)} IJ CPAM — attestation ${d1.ij_cpam_org || 'CPAM'})` : ''}
RNI D1 après abattement 10% salaires : ${fmtN(rniSalD1)}
Taux PAS : ${d1.taux_pas ? d1.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${pasD1 > 0 ? fmtN(pasD1) : 'Non renseigné'}
Frais réels : ${d1.frais_r && d1.frais_r !== '0' ? Number(d1.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}
${rente1BsD1c > 0 ? `Rente viagère — case 1BS (D1) :
  Organisme : ${d1.rente_1bs_organisme || 'Non renseigné'}
  Montant 1BS déclaré : ${fmtN(rente1BsD1c)}
  PAS rente 1BS : ${pasRenteD1c > 0 ? fmtN(pasRenteD1c) : '0 €'}
  Récurrent : ${d1.rente_1bs_recurrent || 'Oui'}` : ''}
== REVENUS 2025 — DÉCLARANT 2 ==
Brut imposable annuel : ${d2.brut ? Number(d2.brut).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Net imposable annuel (1BJ — case déclaration) : ${net1AJd2 > 0 ? fmtN(net1AJd2) : 'Non renseigné'}${ijCpamD2c > 0 ? ` (dont ${fmtN(ijCpamD2c)} IJ CPAM — attestation ${d2.ij_cpam_org || 'CPAM'})` : ''}
RNI D2 après abattement 10% salaires : ${fmtN(rniSalD2)}
Taux PAS : ${d2.taux_pas ? d2.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${pasD2 > 0 ? fmtN(pasD2) : 'Non renseigné'}
Frais réels : ${d2.frais_r && d2.frais_r !== '0' ? Number(d2.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}
${rente1BsD2c > 0 ? `Rente viagère — case 1BS (D2) :
  Organisme : ${d2.rente_1bs_organisme || 'Non renseigné'}
  Montant 1BS déclaré : ${fmtN(rente1BsD2c)}
  PAS rente 1BS : ${pasRenteD2c > 0 ? fmtN(pasRenteD2c) : '0 €'}
  Récurrent : ${d2.rente_1bs_recurrent || 'Oui'}` : ''}

== REVENUS DU FOYER ==
${foncier.brut > 0 ? `Revenus fonciers bruts : ${fmtN(foncier.brut)}
Régime foncier : ${foncier.regime}
Revenus fonciers nets imposables : ${fmtN(foncier.net)}
Prélèvements sociaux fonciers (17,2%) : ${fmtN(foncier.ps)}` : 'Revenus fonciers : Néant'}
Dividendes/intérêts : ${fmt(d.divid)}${parseFloat(d.div_2dc || 0) > 0 ? `\nDividendes bruts (case 2DC) : ${fmtN(parseFloat(d.div_2dc))}` : ''}
Revenus crypto : ${fmt(d.crypto)}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}
${parseFloat(d.int_mob_2tr || 0) > 0 ? `Intérêts mobiliers bruts (case 2TR) : ${fmtN(parseFloat(d.int_mob_2tr))}
${parseFloat(d.int_mob_2ck || 0) > 0 ? `PFU 12,8% prélevé (case 2CK) : ${fmtN(parseFloat(d.int_mob_2ck))}` : ''}
Intérêts soumis PS (case 2BH) : ${fmtN(parseFloat(d.int_mob_2tr))}` : ''}
${tns.section}
== DONNÉES POUR CALCUL IR FOYER ==
RNI D1 (après abat. salaires) : ${fmtN(rniSalD1)}
${rniRenteD1 > 0 ? `Rente 1BS D1 (après abat. 10% pension) : ${fmtN(rniRenteD1)}` : ''}
RNI D1 TOTAL : ${fmtN(rniD1)}
RNI D2 (après abat. salaires) : ${fmtN(rniSalD2)}
${rniRenteD2 > 0 ? `Rente 1BS D2 (après abat. 10% pension) : ${fmtN(rniRenteD2)}` : ''}
RNI D2 TOTAL : ${fmtN(rniD2)}
Foncier net imposable : ${fmtN(foncier.net)}
RNI FOYER TOTAL : ${fmtN(rniFoyer)}
Quotient familial (${parts} parts) : ${fmtN(rniFoyer / parts)} par part
PAS D1 prélevé 2025 : ${pasD1 > 0 ? fmtN(pasD1) : 'Non renseigné'}
PAS D2 prélevé 2025 : ${pasD2 > 0 ? fmtN(pasD2) : 'Non renseigné'}
PAS total foyer 2025 : ${pasFoyer > 0 ? fmtN(pasFoyer) : 'Non renseigné'}
${parseFloat(d.acompte_8hw || 0) > 0 ? `Acompte IR D1 (8HW) : ${fmtN(parseFloat(d.acompte_8hw))}` : ''}
${parseFloat(d.acompte_8iw || 0) > 0 ? `Acompte IR D2 (8IW) : ${fmtN(parseFloat(d.acompte_8iw))}` : ''}
${parseFloat(d.acompte_8hx || 0) > 0 ? `Acompte PS D1 (8HX) : ${fmtN(parseFloat(d.acompte_8hx))}` : ''}
${parseFloat(d.acompte_8ix || 0) > 0 ? `Acompte PS D2 (8IX) : ${fmtN(parseFloat(d.acompte_8ix))}` : ''}
→ IR foyer, TMI, TOTAL DÛ, régularisation, méthode célibataire : à calculer lors de l'enrichissement IA

== PLAFONDS PER 2026 ==
D1 :
  10% × RNI D1 (${fmtN(rniSalD1)}) : ${fmtN(perD1.brut10)}
  Plancher PASS (10% × 47 100 €) : ${fmtN(MIN_PLAFOND_PER)}
  Plafond retenu : ${fmtN(perD1.plafond)}
  PERO D1 déduit : ${peroD1 > 0 ? fmtN(peroD1) : 'Néant'}
  PLAFOND DISPONIBLE D1 : ${fmtN(perD1.dispo)}

D2 :
  10% × RNI D2 (${fmtN(rniSalD2)}) : ${fmtN(perD2.brut10)}
  Plancher PASS (10% × 47 100 €) : ${fmtN(MIN_PLAFOND_PER)}
  Plafond retenu : ${fmtN(perD2.plafond)}
  PERO D2 déduit : ${peroD2 > 0 ? fmtN(peroD2) : 'Néant'}
  PLAFOND DISPONIBLE D2 : ${fmtN(perD2.dispo)}

Plafond cumulé mutualisable : ${fmtN(perD1.dispo + perD2.dispo)}${_perReportables(d)}

== ÉPARGNE — DÉCLARANT 1 ==
Livret A : ${fmtOui(d1.livret_a)}
LDDS : ${fmtOui(d1.ldd)}
LEP : ${fmtOui(d1.lep)}
Livret+ / Livret bancaire : ${fmtOui(d1.livret_plus)}
PEL : ${fmtOui(d1.pel)}${d1.pel_date ? `\nPEL date ouverture : ${d1.pel_date}` : ''}
PEA : ${fmtOui(d1.pea)}${d1.pea_date ? `\nPEA date ouverture : ${d1.pea_date}` : ''}${d1.pea_verse && d1.pea_verse !== '0' ? `\nPEA total versé : ${Number(d1.pea_verse).toLocaleString('fr-FR')} €` : ''}
CTO (compte-titres ordinaire) : ${fmtOui(d1.cto)}${_ctoCourtierLine(d1.cto, d1.cto_courtier)}
PER versements 2025 : ${fmt(d1.per)}
PEE (valorisation) : ${fmtOui(d1.pee)}${d1.pee_verse && d1.pee_verse !== '0' ? `\nPEE versements salarié 2025 : ${Number(d1.pee_verse).toLocaleString('fr-FR')} €` : ''}${abondD1c > 0 ? `\nPERCO — abondement employeur 2025 : ${abondD1c.toLocaleString('fr-FR')} €` : ''}
Assurance-vie : ${fmtOui(d1.av)}${d1.av_date ? `\nAV date souscription : ${d1.av_date}` : ''}${d1.av_verse && d1.av_verse !== '0' ? `\nAV versements nets cumulés : ${Number(d1.av_verse).toLocaleString('fr-FR')} €` : ''}
Crypto (valeur wallet) : ${fmtOui(d1.crypto_wallet)}${d1.crypto_plateforme ? `\nCrypto plateforme : ${d1.crypto_plateforme}` : ''}${d1.crypto_cessions === 'Oui' ? '\nCrypto cessions 2025 : Oui' : ''}${d1.crypto_montant_cede ? `\nCrypto montant cédé : ${Number(d1.crypto_montant_cede).toLocaleString('fr-FR')} €` : ''}${d1.crypto_pv ? `\nCrypto plus-value nette : ${Number(d1.crypto_pv).toLocaleString('fr-FR')} €` : ''}

== ÉPARGNE — DÉCLARANT 2 ==
Livret A : ${fmtOui(d2.livret_a)}
LDDS : ${fmtOui(d2.ldd)}
LEP : ${fmtOui(d2.lep)}
Livret+ / Livret bancaire : ${fmtOui(d2.livret_plus)}
PEL : ${fmtOui(d2.pel)}${d2.pel_date ? `\nPEL date ouverture : ${d2.pel_date}` : ''}
PEA : ${fmtOui(d2.pea)}${d2.pea_date ? `\nPEA date ouverture : ${d2.pea_date}` : ''}${d2.pea_verse && d2.pea_verse !== '0' ? `\nPEA total versé : ${Number(d2.pea_verse).toLocaleString('fr-FR')} €` : ''}
CTO (compte-titres ordinaire) : ${fmtOui(d2.cto)}${_ctoCourtierLine(d2.cto, d2.cto_courtier)}
PER versements 2025 : ${fmt(d2.per)}
PEE (valorisation) : ${fmtOui(d2.pee)}${d2.pee_verse && d2.pee_verse !== '0' ? `\nPEE versements salarié 2025 : ${Number(d2.pee_verse).toLocaleString('fr-FR')} €` : ''}${abondD2c > 0 ? `\nPERCO — abondement employeur 2025 : ${abondD2c.toLocaleString('fr-FR')} €` : ''}
Assurance-vie : ${fmtOui(d2.av)}${d2.av_date ? `\nAV date souscription : ${d2.av_date}` : ''}${d2.av_verse && d2.av_verse !== '0' ? `\nAV versements nets cumulés : ${Number(d2.av_verse).toLocaleString('fr-FR')} €` : ''}
Crypto (valeur wallet) : ${fmtOui(d2.crypto_wallet)}${d2.crypto_plateforme ? `\nCrypto plateforme : ${d2.crypto_plateforme}` : ''}${d2.crypto_cessions === 'Oui' ? '\nCrypto cessions 2025 : Oui' : ''}${d2.crypto_montant_cede ? `\nCrypto montant cédé : ${Number(d2.crypto_montant_cede).toLocaleString('fr-FR')} €` : ''}${d2.crypto_pv ? `\nCrypto plus-value nette : ${Number(d2.crypto_pv).toLocaleString('fr-FR')} €` : ''}

== DÉDUCTIONS DU FOYER ==
Dons associations : ${fmt(d.dons)}${parseFloat(d.dons_aide || 0) > 0 ? `\nDons aide aux personnes (75%) : ${fmtN(parseFloat(d.dons_aide))}` : ''}
Frais garde enfants : ${fmt(d.garde)}
Emploi à domicile : ${fmt(d.domicile)}
Rénov. énergétique / MaPrimeRénov : ${fmt(d.travaux)}
PERO D1 — cotisations 2025 : ${peroD1 > 0 ? fmtN(peroD1) + ' → case 6QS/6QT/6QU (déjà inclus dans 1AJ)' : 'Néant'}
PERO D2 — cotisations 2025 : ${peroD2 > 0 ? fmtN(peroD2) + ' → case 6QS/6QT/6QU (déjà inclus dans 1AJ)' : 'Néant'}
${dedInfo.lines || 'Pension alimentaire versée : Néant'}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}${_scolariteLine(d)}

== CAPACITÉ D'ÉPARGNE ==
${d.charges_fixes ? `Charges communes mensuelles : ${Number(d.charges_fixes).toLocaleString('fr-FR')} €/mois` : 'Charges communes : Non renseignées'}
${d.credit_rp ? `dont crédit RP / loyer : ${Number(d.credit_rp).toLocaleString('fr-FR')} €/mois` : ''}
${d.autres_credits ? `dont autres crédits : ${Number(d.autres_credits).toLocaleString('fr-FR')} €/mois` : ''}
${d.charges_perso_d1 ? `Charges personnelles D1 : ${Number(d.charges_perso_d1).toLocaleString('fr-FR')} €/mois` : ''}
${d.charges_perso_d2 ? `Charges personnelles D2 : ${Number(d.charges_perso_d2).toLocaleString('fr-FR')} €/mois` : ''}
${(() => {
  const chargesComm = parseFloat(d.charges_fixes || 0);
  const persoD1 = parseFloat(d.charges_perso_d1 || 0);
  const persoD2 = parseFloat(d.charges_perso_d2 || 0);
  const menD1 = Math.round(rniD1 / 12);
  const menD2 = Math.round(rniD2 / 12);
  if (!chargesComm || (!menD1 && !menD2)) return '';
  const capD1 = Math.max(0, menD1 - chargesComm / 2 - persoD1);
  const capD2 = Math.max(0, menD2 - chargesComm / 2 - persoD2);
  const tauxD1 = menD1 > 0 ? Math.round(capD1 / menD1 * 100) : 0;
  const tauxD2 = menD2 > 0 ? Math.round(capD2 / menD2 * 100) : 0;
  const lines = [];
  if (menD1 > 0) lines.push(`Revenu net mensuel D1 : ${menD1.toLocaleString('fr-FR')} €/mois`);
  if (menD2 > 0) lines.push(`Revenu net mensuel D2 : ${menD2.toLocaleString('fr-FR')} €/mois`);
  if (menD1 > 0) lines.push(`Capacité d'épargne D1 : ${capD1.toLocaleString('fr-FR')} €/mois (${tauxD1} % du revenu net D1)`);
  if (menD2 > 0) lines.push(`Capacité d'épargne D2 : ${capD2.toLocaleString('fr-FR')} €/mois (${tauxD2} % du revenu net D2)`);
  lines.push(`Capacité d'épargne foyer : ${(capD1 + capD2).toLocaleString('fr-FR')} €/mois`);
  return lines.join('\n');
})()}
${d.objectif_patrimonial ? `Objectif patrimonial : ${d.objectif_patrimonial}` : ''}

== IMMOBILIER ==
Propriétaire RP : ${d.proprio || 'Non renseigné'}
${d.proprio === 'Oui' && d.rp_valeur ? `RP — valeur estimée : ${Number(d.rp_valeur).toLocaleString('fr-FR')} €` : ''}
${d.proprio === 'Oui' ? `Crédit immobilier en cours : ${d.credit_en_cours || 'Non renseigné'}` : ''}
${d.credit_en_cours === 'Oui' && d.credit_crd ? `Capital restant dû : ${Number(d.credit_crd).toLocaleString('fr-FR')} €` : ''}
${d.credit_en_cours === 'Oui' && d.credit_taux ? `Taux crédit : ${d.credit_taux} %` : ''}
${d.credit_en_cours === 'Oui' && d.credit_mensualite ? `Mensualité crédit : ${Number(d.credit_mensualite).toLocaleString('fr-FR')} €/mois` : ''}
${d.proprio === 'Oui' && d.taxe_fonciere ? `Taxe foncière : ${Number(d.taxe_fonciere).toLocaleString('fr-FR')} €/an` : ''}
Bien locatif : ${d.locatif || 'Non renseigné'}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}
${docSums ? '\n== DONNÉES BRUTES EXTRAITES PAR IA ==\n' + docSums + '\n' : ''}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildProfile(formData, d1Data, d2Data, docs, isCouple) {
  const d = formData;
  const docSums = docs
    .filter(x => x.status === 'done' && x.extracted)
    .map(x => `• ${x.name} (${x.target === 'd1' ? 'D1' : x.target === 'd2' ? 'D2' : '—'}) :\n${x.extracted}`)
    .join('\n\n');
  return isCouple
    ? _buildCouple(d, d1Data, d2Data, docSums)
    : _buildSolo(d, docSums);
}
