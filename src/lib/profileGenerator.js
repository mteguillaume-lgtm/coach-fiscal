import { abattement10, abattement10Pension, MIN_PLAFOND_PER, MAX_PLAFOND_PER } from './taxCalculator';

const APP_VERSION = 'v4.1.0';

const fmt    = v => v && v !== '0' ? Number(v).toLocaleString('fr-FR') + ' €' : 'Néant';
const fmtOui = v => v && v !== '0' ? `OUI ~${Number(v).toLocaleString('fr-FR')} €` : 'Néant';
const fmtN   = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';

// Micro-foncier : abattement 30% automatique si total brut < 15 000 €
function calcFoncier(brut) {
  if (!brut || brut <= 0) return { brut: 0, net: 0, regime: null, ps: 0 };
  const isMicro = brut <= 15000; // art. 32 CGI : "n'excède pas 15 000 €" = inclusif
  const net  = isMicro ? Math.round(brut * 0.70) : brut;
  const ps   = Math.round(net * 0.172);
  return { brut, net, regime: isMicro ? 'micro-foncier (abat. 30%)' : 'régime réel', ps };
}

// Plafond PER : 10% du RNI (après abattement 10% salaires) ou plancher PASS, moins PERO
function fmtPlafondPer(netImp, pero) {
  const netImpN  = parseFloat(netImp  || 0);
  const peroN    = parseFloat(pero    || 0);
  const base     = abattement10(netImpN);
  const brut10   = base > 0 ? Math.round(base * 0.10) : 0;
  const plafond  = Math.min(Math.max(brut10, MIN_PLAFOND_PER), MAX_PLAFOND_PER); // cap 37 680 €
  const dispo    = Math.max(0, plafond - peroN);
  return { brut10, plafond, dispo };
}

export function buildProfile(formData, d1Data, d2Data, docs, isCouple) {
  const d = formData;
  const docSums = docs
    .filter(x => x.status === 'done' && x.extracted)
    .map(x => `• ${x.name} (${x.target === 'd1' ? 'D1' : x.target === 'd2' ? 'D2' : '—'}) :\n${x.extracted}`)
    .join('\n\n');

  // ─── MODE SOLO ───────────────────────────────────────────────────────────────
  if (!isCouple) {
    const net1AJ   = parseFloat(d.net_imp  || 0);
    const rni      = abattement10(net1AJ);
    const foncier  = calcFoncier(parseFloat(d.foncier || 0));
    const rniTotal = rni + foncier.net;
    const parts    = parseFloat(d.parts || 1);
    const pero     = parseFloat(d.pero_d1 || 0);
    const pas      = parseFloat(d.pas_tot || 0);
    const per      = fmtPlafondPer(d.net_imp, d.pero_d1);

    const ageD1       = parseInt(d.age_d1 || 0);
    const retraiteD1  = parseInt(d.retraite_d1 || 0);
    const horizonD1   = ageD1 > 0 && retraiteD1 > ageD1 ? retraiteD1 - ageD1 : null;
    const typeRevD1   = d.type_revenu_d1 || 'Salarié(e)';
    const pensionD1   = parseFloat(d.pension_net_imp_d1 || 0);

    return `== PROFIL FISCAL PERSONNEL 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}

== SITUATION PERSONNELLE ==
Statut : ${d.statut || 'Non renseigné'}
Parts fiscales : ${d.parts || '1'}
Enfants à charge : ${d.enfants || '0'}
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
Net imposable annuel (1AJ — case déclaration) : ${net1AJ > 0 ? fmtN(net1AJ) : 'Non renseigné'}
RNI après abattement 10% salaires : ${rni > 0 ? fmtN(rni) : 'Non calculable'}
Taux PAS : ${d.taux_pas ? d.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${pas > 0 ? fmtN(pas) : 'Non renseigné'}
Frais réels : ${d.frais_r && d.frais_r !== '0' ? Number(d.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}
${foncier.brut > 0 ? `
Revenus fonciers bruts : ${fmtN(foncier.brut)}
Régime foncier : ${foncier.regime}
Revenus fonciers nets imposables : ${fmtN(foncier.net)}
Prélèvements sociaux fonciers (17,2%) : ${fmtN(foncier.ps)}` : 'Revenus fonciers : Néant'}
Dividendes/intérêts : ${fmt(d.divid)}
Revenus crypto : ${fmt(d.crypto)}

== DONNÉES POUR CALCUL IR ==
RNI total (salaires + foncier net) : ${fmtN(rniTotal)}
Parts fiscales : ${parts}
PAS prélevé 2025 : ${pas > 0 ? fmtN(pas) : 'Non renseigné'}
→ IR net, TMI, régularisation PAS : à calculer lors de l'enrichissement IA

== PLAFOND PER 2026 ==
10% du RNI (${fmtN(rni)}) : ${fmtN(per.brut10)}
Plancher PASS (10% × 47 100 €) : ${fmtN(MIN_PLAFOND_PER)}
Plafond retenu : ${fmtN(per.plafond)}
PERO obligatoire déduit : ${pero > 0 ? fmtN(pero) : 'Néant'}
PLAFOND DISPONIBLE : ${fmtN(per.dispo)}${(() => {
  const n1 = parseInt(d.per_n1 || 0); const n2 = parseInt(d.per_n2 || 0); const n3 = parseInt(d.per_n3 || 0);
  const tot = n1 + n2 + n3;
  if (!tot) return '';
  return `\n${n1 > 0 ? `Plafond reportable N-1 : ${n1.toLocaleString('fr-FR')} €\n` : ''}${n2 > 0 ? `Plafond reportable N-2 : ${n2.toLocaleString('fr-FR')} €\n` : ''}${n3 > 0 ? `Plafond reportable N-3 : ${n3.toLocaleString('fr-FR')} €\n` : ''}Plafond reportable total (3 ans) : ${tot.toLocaleString('fr-FR')} €`;
})()}

== ÉPARGNE ET PLACEMENTS ==
Livret A : ${fmtOui(d.livret_a)}
LDDS : ${fmtOui(d.ldd)}
LEP : ${fmtOui(d.lep)}
Livret+ / Livret bancaire : ${fmtOui(d.livret_plus)}
PEL : ${fmtOui(d.pel)}${d.pel_date ? `\nPEL date ouverture : ${d.pel_date}` : ''}
PEA : ${fmtOui(d.pea)}${d.pea_date ? `\nPEA date ouverture : ${d.pea_date}` : ''}${d.pea_verse && d.pea_verse !== '0' ? `\nPEA total versé : ${Number(d.pea_verse).toLocaleString('fr-FR')} €` : ''}
Assurance-vie : ${fmtOui(d.av)}${d.av_date ? `\nAV date souscription : ${d.av_date}` : ''}${d.av_verse && d.av_verse !== '0' ? `\nAV versements nets cumulés : ${Number(d.av_verse).toLocaleString('fr-FR')} €` : ''}
PER versements 2025 : ${fmt(d.per)}
Crypto (valeur wallet) : ${fmtOui(d.crypto_wallet)}${d.crypto_plateforme ? `\nCrypto plateforme : ${d.crypto_plateforme}` : ''}${d.crypto_cessions === 'Oui' ? '\nCrypto cessions 2025 : Oui' : ''}${d.crypto_montant_cede ? `\nCrypto montant cédé : ${Number(d.crypto_montant_cede).toLocaleString('fr-FR')} €` : ''}${d.crypto_pv ? `\nCrypto plus-value nette : ${Number(d.crypto_pv).toLocaleString('fr-FR')} €` : ''}

== DÉDUCTIONS ==
Dons associations : ${fmt(d.dons)}
Frais garde enfants : ${fmt(d.garde)}
Emploi à domicile : ${fmt(d.domicile)}
Rénov. énergétique / MaPrimeRénov : ${fmt(d.travaux)}
PERO — cotisations 2025 : ${d.pero_d1 && d.pero_d1 !== '0' ? Number(d.pero_d1).toLocaleString('fr-FR') + ' € → case 6QS/6QT/6QU (déjà inclus dans 1AJ)' : 'Néant'}
Pension alimentaire versée : ${fmt(d.pension)}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}

== CAPACITÉ D'ÉPARGNE ==
${d.charges_fixes ? `Charges fixes mensuelles : ${Number(d.charges_fixes).toLocaleString('fr-FR')} €/mois` : 'Charges fixes : Non renseignées'}
${d.credit_rp ? `dont crédit RP / loyer : ${Number(d.credit_rp).toLocaleString('fr-FR')} €/mois` : ''}
${d.autres_credits ? `dont autres crédits : ${Number(d.autres_credits).toLocaleString('fr-FR')} €/mois` : ''}
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

  // ─── MODE COUPLE ─────────────────────────────────────────────────────────────
  const d1 = d1Data;
  const d2 = d2Data;

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

  const net1AJd1 = parseFloat(d1.net_imp || 0);
  const net1AJd2 = parseFloat(d2.net_imp || 0);
  // Abattement selon le type de revenu (art. 158-5-a CGI)
  const rniD1 = typeRevD1c === 'Retraité(e)' ? abattement10Pension(net1AJd1)
              : typeRevD1c === 'Mixte'        ? abattement10(net1AJd1) + abattement10Pension(pensionD1c)
              :                                  abattement10(net1AJd1);
  const rniD2 = typeRevD2c === 'Retraité(e)' ? abattement10Pension(net1AJd2)
              : typeRevD2c === 'Mixte'        ? abattement10(net1AJd2) + abattement10Pension(pensionD2c)
              :                                  abattement10(net1AJd2);
  const foncier  = calcFoncier(parseFloat(d.foncier || 0));
  const parts    = parseFloat(d.parts || 2);

  const rniFoyer = rniD1 + rniD2 + foncier.net;

  const pasD1    = parseFloat(d1.pas_tot || 0);
  const pasD2    = parseFloat(d2.pas_tot || 0);
  const pasFoyer = pasD1 + pasD2;
  const peroD1   = parseFloat(d.pero_d1 || 0);
  const peroD2   = parseFloat(d.pero_d2 || 0);

  const perD1  = fmtPlafondPer(d1.net_imp, d.pero_d1);
  const perD2  = fmtPlafondPer(d2.net_imp, d.pero_d2);

  return `== PROFIL FISCAL FOYER 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}
Mode : Déclaration commune (${d.statut || 'couple'})

== SITUATION DU FOYER ==
Statut : ${d.statut || 'Non renseigné'}
Parts fiscales : ${d.parts || '2'}
Enfants à charge : ${d.enfants || '0'}
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
Net imposable annuel (1AJ — case déclaration) : ${net1AJd1 > 0 ? fmtN(net1AJd1) : 'Non renseigné'}
RNI D1 après abattement 10% salaires : ${fmtN(rniD1)}
Taux PAS : ${d1.taux_pas ? d1.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${pasD1 > 0 ? fmtN(pasD1) : 'Non renseigné'}
Frais réels : ${d1.frais_r && d1.frais_r !== '0' ? Number(d1.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}

== REVENUS 2025 — DÉCLARANT 2 ==
Brut imposable annuel : ${d2.brut ? Number(d2.brut).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Net imposable annuel (1AJ — case déclaration) : ${net1AJd2 > 0 ? fmtN(net1AJd2) : 'Non renseigné'}
RNI D2 après abattement 10% salaires : ${fmtN(rniD2)}
Taux PAS : ${d2.taux_pas ? d2.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${pasD2 > 0 ? fmtN(pasD2) : 'Non renseigné'}
Frais réels : ${d2.frais_r && d2.frais_r !== '0' ? Number(d2.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}

== REVENUS DU FOYER ==
${foncier.brut > 0 ? `Revenus fonciers bruts : ${fmtN(foncier.brut)}
Régime foncier : ${foncier.regime}
Revenus fonciers nets imposables : ${fmtN(foncier.net)}
Prélèvements sociaux fonciers (17,2%) : ${fmtN(foncier.ps)}` : 'Revenus fonciers : Néant'}
Dividendes/intérêts : ${fmt(d.divid)}
Revenus crypto : ${fmt(d.crypto)}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}

== DONNÉES POUR CALCUL IR FOYER ==
RNI D1 (après abat. salaires) : ${fmtN(rniD1)}
RNI D2 (après abat. salaires) : ${fmtN(rniD2)}
Foncier net imposable : ${fmtN(foncier.net)}
RNI FOYER TOTAL : ${fmtN(rniFoyer)}
Quotient familial (${parts} parts) : ${fmtN(rniFoyer / parts)} par part
PAS D1 prélevé 2025 : ${pasD1 > 0 ? fmtN(pasD1) : 'Non renseigné'}
PAS D2 prélevé 2025 : ${pasD2 > 0 ? fmtN(pasD2) : 'Non renseigné'}
PAS total foyer 2025 : ${pasFoyer > 0 ? fmtN(pasFoyer) : 'Non renseigné'}
→ IR foyer, TMI, TOTAL DÛ, régularisation, méthode célibataire : à calculer lors de l'enrichissement IA

== PLAFONDS PER 2026 ==
D1 :
  10% × RNI D1 (${fmtN(rniD1)}) : ${fmtN(perD1.brut10)}
  Plancher PASS (10% × 47 100 €) : ${fmtN(MIN_PLAFOND_PER)}
  Plafond retenu : ${fmtN(perD1.plafond)}
  PERO D1 déduit : ${peroD1 > 0 ? fmtN(peroD1) : 'Néant'}
  PLAFOND DISPONIBLE D1 : ${fmtN(perD1.dispo)}

D2 :
  10% × RNI D2 (${fmtN(rniD2)}) : ${fmtN(perD2.brut10)}
  Plancher PASS (10% × 47 100 €) : ${fmtN(MIN_PLAFOND_PER)}
  Plafond retenu : ${fmtN(perD2.plafond)}
  PERO D2 déduit : ${peroD2 > 0 ? fmtN(peroD2) : 'Néant'}
  PLAFOND DISPONIBLE D2 : ${fmtN(perD2.dispo)}

Plafond cumulé mutualisable : ${fmtN(perD1.dispo + perD2.dispo)}${(() => {
  const n1 = parseInt(d.per_n1 || 0); const n2 = parseInt(d.per_n2 || 0); const n3 = parseInt(d.per_n3 || 0);
  const tot = n1 + n2 + n3;
  if (!tot) return '';
  return `\n${n1 > 0 ? `Plafond reportable N-1 : ${n1.toLocaleString('fr-FR')} €\n` : ''}${n2 > 0 ? `Plafond reportable N-2 : ${n2.toLocaleString('fr-FR')} €\n` : ''}${n3 > 0 ? `Plafond reportable N-3 : ${n3.toLocaleString('fr-FR')} €\n` : ''}Plafond reportable total (3 ans) : ${tot.toLocaleString('fr-FR')} €`;
})()}

== ÉPARGNE — DÉCLARANT 1 ==
Livret A : ${fmtOui(d1.livret_a)}
LDDS : ${fmtOui(d1.ldd)}
LEP : ${fmtOui(d1.lep)}
Livret+ / Livret bancaire : ${fmtOui(d1.livret_plus)}
PEL : ${fmtOui(d1.pel)}${d1.pel_date ? `\nPEL date ouverture : ${d1.pel_date}` : ''}
PEA : ${fmtOui(d1.pea)}${d1.pea_date ? `\nPEA date ouverture : ${d1.pea_date}` : ''}${d1.pea_verse && d1.pea_verse !== '0' ? `\nPEA total versé : ${Number(d1.pea_verse).toLocaleString('fr-FR')} €` : ''}
PER versements 2025 : ${fmt(d1.per)}
Assurance-vie : ${fmtOui(d1.av)}${d1.av_date ? `\nAV date souscription : ${d1.av_date}` : ''}${d1.av_verse && d1.av_verse !== '0' ? `\nAV versements nets cumulés : ${Number(d1.av_verse).toLocaleString('fr-FR')} €` : ''}
Crypto (valeur wallet) : ${fmtOui(d1.crypto_wallet)}${d1.crypto_plateforme ? `\nCrypto plateforme : ${d1.crypto_plateforme}` : ''}${d1.crypto_cessions === 'Oui' ? '\nCrypto cessions 2025 : Oui' : ''}${d1.crypto_montant_cede ? `\nCrypto montant cédé : ${Number(d1.crypto_montant_cede).toLocaleString('fr-FR')} €` : ''}${d1.crypto_pv ? `\nCrypto plus-value nette : ${Number(d1.crypto_pv).toLocaleString('fr-FR')} €` : ''}

== ÉPARGNE — DÉCLARANT 2 ==
Livret A : ${fmtOui(d2.livret_a)}
LDDS : ${fmtOui(d2.ldd)}
LEP : ${fmtOui(d2.lep)}
Livret+ / Livret bancaire : ${fmtOui(d2.livret_plus)}
PEL : ${fmtOui(d2.pel)}${d2.pel_date ? `\nPEL date ouverture : ${d2.pel_date}` : ''}
PEA : ${fmtOui(d2.pea)}${d2.pea_date ? `\nPEA date ouverture : ${d2.pea_date}` : ''}${d2.pea_verse && d2.pea_verse !== '0' ? `\nPEA total versé : ${Number(d2.pea_verse).toLocaleString('fr-FR')} €` : ''}
PER versements 2025 : ${fmt(d2.per)}
Assurance-vie : ${fmtOui(d2.av)}${d2.av_date ? `\nAV date souscription : ${d2.av_date}` : ''}${d2.av_verse && d2.av_verse !== '0' ? `\nAV versements nets cumulés : ${Number(d2.av_verse).toLocaleString('fr-FR')} €` : ''}
Crypto (valeur wallet) : ${fmtOui(d2.crypto_wallet)}${d2.crypto_plateforme ? `\nCrypto plateforme : ${d2.crypto_plateforme}` : ''}${d2.crypto_cessions === 'Oui' ? '\nCrypto cessions 2025 : Oui' : ''}${d2.crypto_montant_cede ? `\nCrypto montant cédé : ${Number(d2.crypto_montant_cede).toLocaleString('fr-FR')} €` : ''}${d2.crypto_pv ? `\nCrypto plus-value nette : ${Number(d2.crypto_pv).toLocaleString('fr-FR')} €` : ''}

== DÉDUCTIONS DU FOYER ==
Dons associations : ${fmt(d.dons)}
Frais garde enfants : ${fmt(d.garde)}
Emploi à domicile : ${fmt(d.domicile)}
Rénov. énergétique / MaPrimeRénov : ${fmt(d.travaux)}
PERO D1 — cotisations 2025 : ${peroD1 > 0 ? fmtN(peroD1) + ' → case 6QS/6QT/6QU (déjà inclus dans 1AJ)' : 'Néant'}
PERO D2 — cotisations 2025 : ${peroD2 > 0 ? fmtN(peroD2) + ' → case 6QS/6QT/6QU (déjà inclus dans 1AJ)' : 'Néant'}
Pension alimentaire versée : ${fmt(d.pension)}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}

== CAPACITÉ D'ÉPARGNE ==
${d.charges_fixes ? `Charges fixes mensuelles : ${Number(d.charges_fixes).toLocaleString('fr-FR')} €/mois` : 'Charges fixes : Non renseignées'}
${d.credit_rp ? `dont crédit RP / loyer : ${Number(d.credit_rp).toLocaleString('fr-FR')} €/mois` : ''}
${d.autres_credits ? `dont autres crédits : ${Number(d.autres_credits).toLocaleString('fr-FR')} €/mois` : ''}
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
