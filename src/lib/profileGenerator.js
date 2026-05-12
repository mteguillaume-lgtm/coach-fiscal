import { abattement10, calcIR, baseIRSolo, getTMI, calcPlafondPer, MIN_PLAFOND_PER } from './taxCalculator';

const APP_VERSION = 'v4.0.0';

const fmt    = v => v && v !== '0' ? Number(v).toLocaleString('fr-FR') + ' €' : 'Néant';
const fmtOui = v => v && v !== '0' ? `OUI ~${Number(v).toLocaleString('fr-FR')} €` : 'Néant';
const fmtN   = v => Math.round(v || 0).toLocaleString('fr-FR') + ' €';
const sign   = v => v > 0 ? `+${fmtN(v)}` : fmtN(v);

// Micro-foncier : abattement 30% automatique si total brut < 15 000 €
function calcFoncier(brut) {
  if (!brut || brut <= 0) return { brut: 0, net: 0, regime: null, ps: 0 };
  const isMicro = brut < 15000;
  const net  = isMicro ? Math.round(brut * 0.70) : brut;
  const ps   = Math.round(net * 0.172);
  return { brut, net, regime: isMicro ? 'micro-foncier (abat. 30%)' : 'régime réel', ps };
}

// Calcul plafond PER (10% du net imposable ou 10% PASS, le plus élevé, moins PERO)
function fmtPlafondPer(netImp, pero) {
  const netImpN  = parseFloat(netImp  || 0);
  const peroN    = parseFloat(pero    || 0);
  const base     = abattement10(netImpN);
  const brut10   = base > 0 ? Math.round(base * 0.10) : 0;
  const plafond  = Math.max(brut10, MIN_PLAFOND_PER);
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

    const irNet    = calcIR(rniTotal, parts, false);
    const tmi      = getTMI(rniTotal, parts);
    const solde    = pas - irNet;
    const per      = fmtPlafondPer(d.net_imp, d.pero_d1);

    return `== PROFIL FISCAL PERSONNEL 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}

== SITUATION PERSONNELLE ==
Statut : ${d.statut || 'Non renseigné'}
Parts fiscales : ${d.parts || '1'}
Enfants à charge : ${d.enfants || '0'}
Département : ${d.dept || 'Non renseigné'}

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

== SYNTHÈSE FISCALE ==
RNI total : ${fmtN(rniTotal)}
IR net estimé : ${fmtN(irNet)}
PAS prélevé 2025 : ${fmtN(pas)}
Régularisation estimée : ${sign(solde)} ${solde > 0 ? '→ remboursement' : '→ complément à payer'}
TMI : ${tmi}%

== PLAFOND PER 2026 ==
10% du RNI (${fmtN(rni)}) : ${fmtN(per.brut10)}
Plancher PASS (10% × 47 100 €) : ${fmtN(MIN_PLAFOND_PER)}
Plafond retenu : ${fmtN(per.plafond)}
PERO obligatoire déduit : ${pero > 0 ? fmtN(pero) : 'Néant'}
PLAFOND DISPONIBLE : ${fmtN(per.dispo)}

== ÉPARGNE ET PLACEMENTS ==
Livret A : ${fmtOui(d.livret_a)}
LDDS : ${fmtOui(d.ldd)}
LEP : ${fmtOui(d.lep)}
Livret+ / Livret bancaire : ${fmtOui(d.livret_plus)}
PEL : ${fmtOui(d.pel)}
PEA : ${fmtOui(d.pea)}
Assurance-vie : ${fmtOui(d.av)}
PER versements 2025 : ${fmt(d.per)}
Crypto (valeur wallet) : ${fmtOui(d.crypto_wallet)}

== DÉDUCTIONS ==
Dons associations : ${fmt(d.dons)}
Frais garde enfants : ${fmt(d.garde)}
Emploi à domicile : ${fmt(d.domicile)}
Rénov. énergétique / MaPrimeRénov : ${fmt(d.travaux)}
PERO — cotisations 2025 : ${d.pero_d1 && d.pero_d1 !== '0' ? Number(d.pero_d1).toLocaleString('fr-FR') + ' € → case 6QS/6QT/6QU' : 'Néant'}
Pension alimentaire versée : ${fmt(d.pension)}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}

== IMMOBILIER ==
Propriétaire RP : ${d.proprio || 'Non renseigné'}
Bien locatif : ${d.locatif || 'Non renseigné'}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}
${docSums ? '\n== DONNÉES BRUTES EXTRAITES PAR IA ==\n' + docSums + '\n' : ''}`;
  }

  // ─── MODE COUPLE ─────────────────────────────────────────────────────────────
  const d1 = d1Data;
  const d2 = d2Data;

  const net1AJd1 = parseFloat(d1.net_imp || 0);
  const net1AJd2 = parseFloat(d2.net_imp || 0);
  const rniD1    = abattement10(net1AJd1);
  const rniD2    = abattement10(net1AJd2);
  const foncier  = calcFoncier(parseFloat(d.foncier || 0));
  const parts    = parseFloat(d.parts || 2);

  // RNI foyer = salaires + foncier net
  const rniFoyer = rniD1 + rniD2 + foncier.net;

  // RFR = 1AJ D1 + 1AJ D2 + foncier brut + divid + crypto
  const rfrFoyer = net1AJd1 + net1AJd2 + foncier.brut
                 + parseFloat(d.divid || 0) + parseFloat(d.crypto || 0);

  const pasD1   = parseFloat(d1.pas_tot || 0);
  const pasD2   = parseFloat(d2.pas_tot || 0);
  const pasFoyer = pasD1 + pasD2;
  const peroD1  = parseFloat(d.pero_d1 || 0);
  const peroD2  = parseFloat(d.pero_d2 || 0);

  // IR foyer (barème + décote couple)
  const irFoyer  = calcIR(rniFoyer, parts, true);
  const tmi      = getTMI(rniFoyer, parts);
  const soldeFoyer = pasFoyer - irFoyer;

  // Méthode célibataire de référence
  const irD1Solo = calcIR(rniD1, 1, false);
  // D2 porte le foncier (revenu successoral D2)
  const irD2Solo = calcIR(rniD2 + foncier.net, 1, false);
  const gainPacs = Math.max(0, irD1Solo + irD2Solo - irFoyer);

  // Contribution équitable
  const contribD1 = gainPacs > 0 ? irD1Solo - gainPacs / 2 : irD1Solo;
  const contribD2 = gainPacs > 0 ? irD2Solo - gainPacs / 2 : irD2Solo;

  // Régularisation par déclarant
  const regD1 = pasD1 - contribD1;
  const regD2 = pasD2 - contribD2;

  // PER plafonds
  const perD1 = fmtPlafondPer(d1.net_imp, d.pero_d1);
  const perD2 = fmtPlafondPer(d2.net_imp, d.pero_d2);
  const per1  = parseFloat(d1.per || 0);
  const per2  = parseFloat(d2.per || 0);

  // Versement PER optimal pour effacer la tranche 30%
  const seuilTranche30_2parts = 29579 * parts;
  const versementOptimal = Math.max(0, rniFoyer - seuilTranche30_2parts);

  return `== PROFIL FISCAL FOYER 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}
Mode : Déclaration commune (${d.statut || 'couple'})

== SITUATION DU FOYER ==
Statut : ${d.statut || 'Non renseigné'}
Parts fiscales : ${d.parts || '2'}
Enfants à charge : ${d.enfants || '0'}
Département : ${d.dept || 'Non renseigné'}

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

== SYNTHÈSE FISCALE FOYER ==
RNI D1 (après abat. salaires) : ${fmtN(rniD1)}
RNI D2 (après abat. salaires) : ${fmtN(rniD2)}
Foncier net imposable : ${fmtN(foncier.net)}
RNI FOYER TOTAL : ${fmtN(rniFoyer)}
Revenu fiscal de référence (RFR) : ${fmtN(rfrFoyer)}

Quotient familial (${parts} parts) : ${fmtN(rniFoyer / parts)} par part
IR net foyer estimé : ${fmtN(irFoyer)}
PS sur foncier (17,2%) : ${fmtN(foncier.ps)}
TOTAL DÛ FOYER : ${fmtN(irFoyer + foncier.ps)}
PAS total foyer 2025 : ${fmtN(pasFoyer)}
RÉGULARISATION FOYER : ${sign(soldeFoyer)} ${soldeFoyer > 0 ? '→ remboursement attendu' : '→ complément à payer'}
TMI foyer : ${tmi}%

== RÉPARTITION ÉQUITABLE (méthode célibataire de référence) ==
IR D1 en solo (1 part, barème 2025) : ${fmtN(irD1Solo)}
IR D2 en solo (1 part, incl. foncier) : ${fmtN(irD2Solo)}
Total si déclarations séparées : ${fmtN(irD1Solo + irD2Solo)}
IR foyer réel (${parts} parts) : ${fmtN(irFoyer)}
Gain du ${d.statut?.toLowerCase().includes('pacs') ? 'PACS' : 'quotient conjugal'} : ${fmtN(gainPacs)}

Contribution équitable (50/50 du gain) :
  D1 → ${fmtN(contribD1)}
  D2 → ${fmtN(contribD2)}

Régularisation équitable :
  D1 : PAS ${fmtN(pasD1)} − part équitable ${fmtN(contribD1)} = ${sign(regD1)} ${regD1 > 0 ? '→ D1 reçoit' : '→ D1 verse'}
  D2 : PAS ${fmtN(pasD2)} − part équitable ${fmtN(contribD2)} = ${sign(regD2)} ${regD2 > 0 ? '→ D2 reçoit' : '→ D2 verse'}

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

Plafond cumulé mutualisable : ${fmtN(perD1.dispo + perD2.dispo)}
${tmi >= 30 && versementOptimal > 0 ? `Versement optimal pour quitter la tranche ${tmi}% : ${fmtN(versementOptimal)}` : ''}

== ÉPARGNE — DÉCLARANT 1 ==
Livret A : ${fmtOui(d1.livret_a)}
LDDS : ${fmtOui(d1.ldd)}
LEP : ${fmtOui(d1.lep)}
Livret+ / Livret bancaire : ${fmtOui(d1.livret_plus)}
PEL : ${fmtOui(d1.pel)}
PEA : ${fmtOui(d1.pea)}
PER versements 2025 : ${fmt(d1.per)}
Assurance-vie : ${fmtOui(d1.av)}
Crypto (valeur wallet) : ${fmtOui(d1.crypto_wallet)}

== ÉPARGNE — DÉCLARANT 2 ==
Livret A : ${fmtOui(d2.livret_a)}
LDDS : ${fmtOui(d2.ldd)}
LEP : ${fmtOui(d2.lep)}
Livret+ / Livret bancaire : ${fmtOui(d2.livret_plus)}
PEL : ${fmtOui(d2.pel)}
PEA : ${fmtOui(d2.pea)}
PER versements 2025 : ${fmt(d2.per)}
Assurance-vie : ${fmtOui(d2.av)}
Crypto (valeur wallet) : ${fmtOui(d2.crypto_wallet)}

== DÉDUCTIONS DU FOYER ==
Dons associations : ${fmt(d.dons)}
Frais garde enfants : ${fmt(d.garde)}
Emploi à domicile : ${fmt(d.domicile)}
Rénov. énergétique / MaPrimeRénov : ${fmt(d.travaux)}
PERO D1 — cotisations 2025 : ${peroD1 > 0 ? fmtN(peroD1) + ' → case 6QS/6QT/6QU (ventilation selon attestation)' : 'Néant'}
PERO D2 — cotisations 2025 : ${peroD2 > 0 ? fmtN(peroD2) + ' → case 6QS/6QT/6QU (ventilation selon attestation)' : 'Néant'}
Pension alimentaire versée : ${fmt(d.pension)}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}

== IMMOBILIER ==
Propriétaire RP : ${d.proprio || 'Non renseigné'}
Bien locatif : ${d.locatif || 'Non renseigné'}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}
${docSums ? '\n== DONNÉES BRUTES EXTRAITES PAR IA ==\n' + docSums + '\n' : ''}`;
}
