// Port de genProfile() depuis collecte-fiscal-v3.jsx — renommé buildProfile().

const APP_VERSION = 'v3.0.0';

const fmt    = v => v && v !== '0' ? Number(v).toLocaleString('fr-FR') + ' €' : 'Néant';
const fmtOui = v => v && v !== '0' ? `OUI ~${Number(v).toLocaleString('fr-FR')} €` : 'Néant';

/**
 * Génère le profil fiscal en texte brut.
 * Port de genProfile() — signature adaptée pour réception des données en paramètres.
 *
 * @param {object}  formData  - données foyer (statut, parts, enfants, dept, foncier, etc.)
 * @param {object}  d1Data    - données déclarant 1 (revenus + épargne individuels)
 * @param {object}  d2Data    - données déclarant 2
 * @param {Array}   docs      - [{ name, target:'solo'|'d1'|'d2', status, extracted }]
 * @param {boolean} isCouple
 * @returns {string} profil fiscal en texte brut
 */
export function buildProfile(formData, d1Data, d2Data, docs, isCouple) {
  const d = formData;
  const docSums = docs
    .filter(x => x.status === 'done' && x.extracted)
    .map(x => `• ${x.name} (${x.target === 'd1' ? 'D1' : x.target === 'd2' ? 'D2' : '—'}) :\n${x.extracted}`)
    .join('\n\n');

  if (!isCouple) {
    const _soloText = `== PROFIL FISCAL PERSONNEL 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}

== SITUATION PERSONNELLE ==
Statut : ${d.statut || 'Non renseigné'}
Parts fiscales : ${d.parts || 'Non renseigné'}
Enfants à charge : ${d.enfants || '0'}
Département : ${d.dept || 'Non renseigné'}

== REVENUS 2025 ==
Brut imposable annuel : ${d.brut ? Number(d.brut).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Net imposable annuel : ${d.net_imp ? Number(d.net_imp).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Taux PAS : ${d.taux_pas ? d.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${d.pas_tot ? Number(d.pas_tot).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Revenus fonciers : ${fmt(d.foncier)}
Dividendes/intérêts : ${fmt(d.divid)}
Revenus crypto : ${fmt(d.crypto)}

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
PERO — cotisations 2025 : ${d.pero_d1 && d.pero_d1 !== '0' ? Number(d.pero_d1).toLocaleString('fr-FR') + ' € → case 6QS/6QT/6QU (ventilation à confirmer)' : 'Néant'}
Pension alimentaire versée : ${fmt(d.pension)}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}
Frais réels : ${d.frais_r && d.frais_r !== '0' ? Number(d.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}

== IMMOBILIER ==
Propriétaire RP : ${d.proprio || 'Non renseigné'}
Bien locatif : ${d.locatif || 'Non renseigné'}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}
${docSums ? '\n== DONNÉES BRUTES EXTRAITES PAR IA ==\n' + docSums + '\n' : ''}
== OBJECTIFS ==
- Vérifier cohérence taux PAS avec revenus réels
- Optimiser déclaration IR 2025 (toutes déductions)
- Simuler impact versement PER / comparer frais réels vs forfait 10%
- Suivi budget mensuel et projection épargne annuelle`;
    console.log("=== PROFIL GÉNÉRÉ ===");
    console.log(_soloText.substring(0, 2000));
    return _soloText;
  }

  const d1 = d1Data;
  const d2 = d2Data;
  const rfr = [d1.net_imp, d2.net_imp, d.foncier, d.divid, d.crypto, d.rev_loc]
    .reduce((a, v) => a + parseFloat(v || 0), 0);
  const pasFoyer = parseFloat(d1.pas_tot || 0) + parseFloat(d2.pas_tot || 0);
  const per1 = parseFloat(d1.per || 0);
  const per2 = parseFloat(d2.per || 0);

  const _coupleText = `== PROFIL FISCAL FOYER 2025 ==
Généré le ${new Date().toLocaleDateString('fr-FR')} — Outil ${APP_VERSION}
Mode : Déclaration commune (${d.statut || 'couple'})

== SITUATION DU FOYER ==
Statut : ${d.statut || 'Non renseigné'}
Parts fiscales : ${d.parts || 'Non renseigné'}
Enfants à charge : ${d.enfants || '0'}
Département : ${d.dept || 'Non renseigné'}

== REVENUS 2025 — DÉCLARANT 1 ==
Brut imposable annuel : ${d1.brut ? Number(d1.brut).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Net imposable annuel : ${d1.net_imp ? Number(d1.net_imp).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Taux PAS : ${d1.taux_pas ? d1.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${d1.pas_tot ? Number(d1.pas_tot).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Frais réels : ${d1.frais_r && d1.frais_r !== '0' ? Number(d1.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}

== REVENUS 2025 — DÉCLARANT 2 ==
Brut imposable annuel : ${d2.brut ? Number(d2.brut).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Net imposable annuel : ${d2.net_imp ? Number(d2.net_imp).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Taux PAS : ${d2.taux_pas ? d2.taux_pas + '%' : 'Non renseigné'}
PAS prélevé 2025 : ${d2.pas_tot ? Number(d2.pas_tot).toLocaleString('fr-FR') + ' €' : 'Non renseigné'}
Frais réels : ${d2.frais_r && d2.frais_r !== '0' ? Number(d2.frais_r).toLocaleString('fr-FR') + ' € (à comparer forfait 10%)' : 'Forfait 10% retenu'}

== REVENUS DU FOYER ==
Revenus fonciers : ${fmt(d.foncier)}
Dividendes/intérêts : ${fmt(d.divid)}
Revenus crypto : ${fmt(d.crypto)}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}

== SYNTHÈSE FISCALE FOYER ==
Revenu net imposable total estimé : ${rfr > 0 ? rfr.toLocaleString('fr-FR') + ' €' : 'Non calculable'}
PAS total foyer 2025 : ${pasFoyer > 0 ? pasFoyer.toLocaleString('fr-FR') + ' €' : 'Non renseigné'}

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
PERO D1 — cotisations 2025 : ${d.pero_d1 && d.pero_d1 !== '0' ? Number(d.pero_d1).toLocaleString('fr-FR') + ' € → case 6QS/6QT/6QU (ventilation à confirmer)' : 'Néant'}
PERO D2 — cotisations 2025 : ${d.pero_d2 && d.pero_d2 !== '0' ? Number(d.pero_d2).toLocaleString('fr-FR') + ' € → case 6QS/6QT/6QU (ventilation à confirmer)' : 'Néant'}
Pension alimentaire versée : ${fmt(d.pension)}
Cotisations syndicales : ${d.syndicat && d.syndicat !== '0' ? Number(d.syndicat).toLocaleString('fr-FR') + ' € → crédit d\'impôt 66%' : 'Néant'}

== IMMOBILIER ==
Propriétaire RP : ${d.proprio || 'Non renseigné'}
Bien locatif : ${d.locatif || 'Non renseigné'}
Revenus locatifs 2025 : ${fmt(d.rev_loc)}
${docSums ? '\n== DONNÉES BRUTES EXTRAITES PAR IA ==\n' + docSums + '\n' : ''}
== OBJECTIFS ==
- Vérifier cohérence taux PAS D1/D2 avec revenus réels du foyer
- Vérifier que le quotient conjugal joue en votre faveur (2 parts)
- Optimiser versements PER : D1 ${per1 > 0 ? per1.toLocaleString('fr-FR') + ' €' : '0 €'} / D2 ${per2 > 0 ? per2.toLocaleString('fr-FR') + ' €' : '0 €'} — arbitrage optimal
- Comparer frais réels vs forfait 10% pour chaque déclarant
- Vérifier déductibilité dons, garde, emploi domicile
- Projection épargne foyer annuelle`;
  console.log("=== PROFIL GÉNÉRÉ ===");
  console.log(_coupleText.substring(0, 2000));
  return _coupleText;
}
