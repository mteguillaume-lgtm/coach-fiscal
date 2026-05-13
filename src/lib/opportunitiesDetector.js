// ─── detectOpportunities ──────────────────────────────────────────────────────
// Accepte un objet parsedProfile (résultat de parseProfile) ou un texte brut.

import { calcIR } from './taxCalculator';

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

export function detectOpportunities(parsedProfile) {
  if (!parsedProfile) return [];

  // Compatibilité descendante : si on reçoit un string (ancien code), on retourne vide
  // (les appelants doivent passer state.parsedProfile)
  if (typeof parsedProfile === 'string') {
    console.warn('[opportunitiesDetector] Reçu un string — passer state.parsedProfile');
    return [];
  }

  const {
    tmi,
    rniFoyer, rfr,
    plafondPerD1, plafondPerD2, plafondPerTotal,
    livretAD1, livretAD2, lddsD1, lddsD2,
    lepD1, lepD2,
    livretPlusD1, livretPlusD2,
    peaD1, peaD2,
    tauxPasD1, tauxPasD2,
    remboursement,
    cryptoTotal,
    mode,
    hasCrypto,
    hasCompteEtranger,
    hasIndivision,
    hasTestamentManquant,
    irNet, foncierNet, pasTotal, pasD1, pasD2, parts,
  } = parsedProfile;

  const opps = [];
  const isCouple       = mode === 'couple';
  const perPlafond     = plafondPerTotal || plafondPerD1;
  const isPacseOuMarie = isCouple;
  const hasPEA         = peaD1 > 0 || peaD2 > 0;
  const hasLEP         = lepD1 > 0 || lepD2 > 0;

  // Épargne liquide = tout ce qui reste disponible sans blocage fiscal
  // (Livret A, LDDS, LEP, Livret+/bancaire) — hors PEA, AV, PEL, PERCO
  const livretTotal = livretAD1 + livretAD2
                    + lddsD1   + lddsD2
                    + lepD1    + lepD2
                    + (livretPlusD1 || 0) + (livretPlusD2 || 0);
  const tauxPAS       = tauxPasD1;

  // Taux effectif réel (IR net / RNI) — toujours plus bas que le TMI
  const irNetEstime     = irNet > 0 ? irNet : calcIR(rniFoyer || 0, parts || 1, isCouple);
  const tauxEffectif    = rniFoyer > 0 ? +((irNetEstime / rniFoyer) * 100).toFixed(1) : 0;
  const psFoncierEstime = (foncierNet || 0) * 0.172;
  const totalDuEstime   = irNetEstime + psFoncierEstime;
  const pasTot          = pasTotal || (pasD1 + pasD2);
  // Complément estimé (positif = à payer en septembre, négatif = remboursement)
  const complementEstime = Math.round(totalDuEstime - pasTot);

  // ── GAINS ──────────────────────────────────────────────────────────────────

  // PER optimal : plafond disponible + TMI >= 30 %
  if (perPlafond > 0 && tmi >= 30) {
    const economie = Math.round(perPlafond * (tmi / 100));
    const perD1 = plafondPerD1 || 0;
    const perD2 = plafondPerD2 || 0;
    opps.push({
      id: 'per_optimal',
      type: 'gain',
      urgence: 'avant_decembre',
      titre: '💡 Versement PER optimal détecté',
      description: isCouple
        ? `Plafonds PER mutualisables — D1 : ${fmt(perD1)} €, D2 : ${fmt(perD2)} € (total ${fmt(perPlafond)} €). À votre TMI de ${tmi} %, ces versements sont directement déductibles du revenu imposable de chaque déclarant.`
        : `Plafond PER disponible de ${fmt(perPlafond)} € inutilisé. À votre TMI de ${tmi} %, ce versement est directement déductible de votre revenu imposable.`,
      impact: `Économie estimée : ${fmt(economie)} €`,
      impactEuros: economie,
      action: isCouple
        ? `Verser sur vos PER individuels : jusqu'à ${fmt(perD1)} € pour D1 et ${fmt(perD2)} € pour D2 avant le 31/12`
        : `Verser ${fmt(perPlafond)} € sur votre PER avant le 31/12`,
      questionChat: isCouple
        ? `Mon foyer est marié/pacsé, TMI ${tmi} %. Plafond PER D1 : ${fmt(perD1)} €, D2 : ${fmt(perD2)} € (total mutualisable : ${fmt(perPlafond)} €). Comment optimiser nos versements PER individuels avant le 31/12 ? Économie estimée : ${fmt(economie)} €. Quels PER individuels recommander pour chacun ?`
        : `J'ai un plafond PER disponible de ${fmt(perPlafond)} € et une TMI de ${tmi} %. Quel PER individuel choisir et comment optimiser ce versement avant le 31/12 pour maximiser mon économie d'impôt (économie estimée : ${fmt(economie)} €) ?`,
    });
  }

  // Épargne liquide mal rémunérée : total > 10 000 €
  // Inclut : Livret A, LDDS, LEP, Livret+ / Livret bancaire (tout ce qui est disponible)
  // Exclut : PEA, AV, PEL, PERCO (bloqués ou à horizon long terme)
  if (livretTotal > 10_000) {
    const detail = [
      livretAD1 + livretAD2 > 0 ? `Livret A ${fmt(livretAD1 + livretAD2)} €` : null,
      lddsD1 + lddsD2 > 0       ? `LDDS ${fmt(lddsD1 + lddsD2)} €`           : null,
      lepD1 + lepD2 > 0         ? `LEP ${fmt(lepD1 + lepD2)} €`              : null,
      (livretPlusD1 || 0) + (livretPlusD2 || 0) > 0
        ? `Livret bancaire ${fmt((livretPlusD1 || 0) + (livretPlusD2 || 0))} €` : null,
    ].filter(Boolean).join(' · ');
    opps.push({
      id: 'epargne_mal_remuneree',
      type: 'gain',
      urgence: 'long_terme',
      titre: '💡 Épargne liquide à optimiser',
      description: `${fmt(livretTotal)} € d'épargne disponible détectée${detail ? ` (${detail})` : ''}. La part excédant votre épargne de précaution (3-6 mois de charges) pourrait être investie sur PEA ou assurance-vie pour une meilleure performance.`,
      impact: 'Gain potentiel annuel selon l\'allocation choisie',
      impactEuros: Math.round(livretTotal * 0.02),
      action: 'Identifier le surplus au-delà de 3-6 mois de charges, puis alimenter PEA ou AV',
      questionChat: isCouple
        ? `Mon foyer (couple marié/pacsé) a ${fmt(livretTotal)} € d'épargne liquide répartie ainsi : ${detail || 'sur plusieurs livrets'}. Quelle part garder en épargne de précaution pour un couple et comment investir le surplus — PEA (un chacun), assurance-vie, répartition optimale ?`
        : `J'ai ${fmt(livretTotal)} € d'épargne liquide répartie ainsi : ${detail || 'sur plusieurs livrets'}. Quelle part garder en épargne de précaution et comment investir le surplus sur PEA ou assurance-vie ?`,
    });
  }

  // PEA non ouvert
  if (!hasPEA) {
    opps.push({
      id: 'pea_non_ouvert',
      type: 'gain',
      urgence: 'long_terme',
      titre: '💡 PEA non ouvert — horloge fiscale non démarrée',
      description: isCouple
        ? 'Aucun PEA détecté pour votre foyer. Chacun peut ouvrir son propre PEA (plafond 150 000 €/personne, soit 300 000 € pour votre couple). Exonération totale d\'IR sur les plus-values après 5 ans.'
        : 'Le PEA offre une exonération totale d\'IR sur les plus-values après 5 ans. Chaque jour sans PEA retarde votre date d\'exonération.',
      impact: isCouple
        ? 'Exonération IR sur les plus-values, plafond 300 000 € (150 000 € × 2)'
        : 'Exonération IR sur toutes les plus-values après 5 ans',
      impactEuros: 500,
      action: isCouple
        ? 'Ouvrir un PEA chacun (même avec 1 €) pour faire partir le délai de 5 ans dès maintenant'
        : 'Ouvrir un PEA même avec 1 € pour faire partir le délai de 5 ans',
      questionChat: isCouple
        ? 'Mon couple n\'a pas encore de PEA. Peut-on ouvrir un PEA chacun et cumuler les plafonds (150 000 € × 2 = 300 000 €) ? Quels courtiers recommander pour un couple en 2025 et comment organiser nos placements entre les deux PEA ?'
        : 'Je n\'ai pas encore de PEA. Quelle banque ou quel courtier recommander pour ouvrir un PEA en 2025, et quels points de vigilance lors de l\'ouverture ?',
    });
  }

  // LEP accessible : RFR éligible et LEP non ouvert
  if (!hasLEP && rfr > 0) {
    const plafondRFR = isPacseOuMarie ? 34_393 : 22_419;
    if (rfr <= plafondRFR) {
      opps.push({
        id: 'lep_non_ouvert',
        type: 'gain',
        urgence: 'avant_decembre',
        titre: '💡 LEP accessible — meilleur taux garanti de France',
        description: isCouple
          ? `Avec un RFR de ${fmt(rfr)} €, votre foyer est éligible au LEP (taux 5 % vs Livret A 3 %). Chacun peut ouvrir son propre LEP (plafond 10 000 €/personne, soit 20 000 € pour votre couple).`
          : `Avec un RFR de ${fmt(rfr)} €, vous êtes éligible au Livret d'Épargne Populaire (taux 5 % vs Livret A à 3 %). Plafond de dépôt : 10 000 €.`,
        impact: isCouple
          ? 'Gain : taux 5 % vs 3 % — soit +400 €/an pour 20 000 € (2 LEP)'
          : 'Gain : taux 5 % vs Livret A 3 % — soit +200 €/an pour 10 000 €',
        impactEuros: isCouple ? 400 : 200,
        action: isCouple
          ? 'Ouvrir un LEP chacun (La Banque Postale, Caisse d\'Épargne…) — plafond 10 000 €/personne'
          : 'Ouvrir un LEP à La Banque Postale, Caisse d\'Épargne ou votre banque',
        questionChat: isCouple
          ? `Notre foyer (RFR ${fmt(rfr)} €) est éligible au LEP. Peut-on ouvrir un LEP chacun pour cumuler 20 000 € au taux de 5 % ? Comment vérifier l'éligibilité de chaque membre du couple et où ouvrir nos LEP ?`
          : `Mon RFR est de ${fmt(rfr)} €. Suis-je éligible au LEP et comment l'ouvrir pour bénéficier du taux de 5 % ?`,
      });
    }
  }

  // ── RISQUES ────────────────────────────────────────────────────────────────

  // Crypto sans déclaration 3916 bis
  if (hasCrypto) {
    opps.push({
      id: 'crypto_3916bis',
      type: 'risque',
      urgence: 'immediate',
      titre: '🔴 Obligation déclarative crypto à vérifier',
      description: `Tout exchange étranger (Binance, Kraken, Coinbase…) doit être déclaré via le formulaire 3916 bis, même sans cession taxable.${cryptoTotal > 305 ? ` Portefeuille détecté : ${fmt(cryptoTotal)} €.` : ''}`,
      impact: 'Amende : 1 500 € par compte non déclaré',
      impactEuros: 1500,
      action: 'Déclarer chaque exchange via le formulaire 3916 bis sur impots.gouv',
      questionChat: 'J\'ai des comptes sur des exchanges crypto étrangers. Comment remplir les formulaires 3916 bis et quelles informations dois-je renseigner pour chaque exchange ?',
    });
  }

  // Pacsé sans testament
  if (hasTestamentManquant) {
    opps.push({
      id: 'pacse_sans_testament',
      type: 'risque',
      urgence: 'long_terme',
      titre: '🔴 Testament manquant — partenaire non protégé',
      description: 'Le partenaire de PACS n\'hérite pas automatiquement en l\'absence de testament. Les biens reviennent aux héritiers légaux (parents, fratrie).',
      impact: 'En cas de décès, votre partenaire n\'hérite pas automatiquement',
      impactEuros: 800,
      action: 'Rédiger un testament chez un notaire pour protéger votre partenaire',
      questionChat: 'Je suis pacsé(e) sans testament. Quelle est la différence entre PACS et mariage en matière de succession, et comment protéger efficacement mon partenaire ?',
    });
  }

  // Indivision non sécurisée
  if (hasIndivision) {
    opps.push({
      id: 'indivision_non_securisee',
      type: 'risque',
      urgence: 'long_terme',
      titre: '🟠 Indivision non sécurisée',
      description: 'Une indivision sans convention peut bloquer la gestion du bien : ventes, travaux et locations nécessitent l\'accord unanime de tous les indivisaires.',
      impact: 'Risque de blocage et conflits entre indivisaires',
      impactEuros: 600,
      action: 'Consulter un notaire pour rédiger une convention d\'indivision',
      questionChat: 'Je suis en indivision sur un bien immobilier. Quels sont les risques et comment une convention d\'indivision peut-elle sécuriser notre situation ?',
    });
  }

  // PAS insuffisant : on compare le PAS total versé au total dû estimé.
  // On n'utilise PAS le TMI — le TMI (taux marginal) est toujours bien supérieur
  // au taux effectif, surtout quand on est juste au-dessus d'un seuil de tranche.
  // Critère : complément estimé > 500 € (risque concret de solde en septembre).
  if (complementEstime > 500 && pasTot > 0) {
    opps.push({
      id: 'taux_pas_trop_bas',
      type: 'risque',
      urgence: 'avant_decembre',
      titre: '🟠 PAS insuffisant — complément prévisible',
      description: `PAS versé : ${fmt(pasTot)} € — IR estimé : ${fmt(totalDuEstime)} € (taux effectif ${tauxEffectif} %). Complément à payer en septembre : ~${fmt(complementEstime)} €.`,
      impact: `Risque de solde à payer en septembre : ~${fmt(complementEstime)} €`,
      impactEuros: complementEstime,
      action: 'Augmenter votre taux PAS sur impots.gouv → Gérer mon prélèvement à la source',
      questionChat: isCouple
        ? `Mon foyer (couple) a un taux effectif d'imposition de ${tauxEffectif} %. PAS versé au total : ${fmt(pasTot)} €${pasD1 && pasD2 ? ` (D1 : ${fmt(pasD1)} €, D2 : ${fmt(pasD2)} €)` : ''}, IR estimé : ${fmt(totalDuEstime)} €. Complément à payer en septembre : ~${fmt(complementEstime)} €. Comment ajuster nos taux PAS individuels pour chaque déclarant ?`
        : `Mon taux effectif d'imposition est de ${tauxEffectif} % mais mon PAS verse seulement ${fmt(pasTot)} € contre un IR estimé à ${fmt(totalDuEstime)} €. Comment ajuster mon prélèvement pour éviter ${fmt(complementEstime)} € de complément en septembre ?`,
    });
  }

  // ── ACTIONS ────────────────────────────────────────────────────────────────

  // Remboursement IR prévu
  if (remboursement > 0) {
    opps.push({
      id: 'remboursement_ir',
      type: 'action',
      urgence: 'long_terme',
      titre: `🔵 Remboursement IR prévu : ${fmt(remboursement)} €`,
      description: 'Un remboursement d\'impôt sur le revenu est détecté dans votre profil. Il sera versé en juillet-septembre après traitement de votre déclaration.',
      impact: `Remboursement attendu : ${fmt(remboursement)} €`,
      impactEuros: remboursement,
      action: 'Vérifier que votre RIB est à jour sur impots.gouv avant le remboursement',
      questionChat: `J'attends un remboursement IR de ${fmt(remboursement)} €. Quand sera-t-il versé et comment m'assurer que mon RIB est bien enregistré sur impots.gouv ?`,
    });
  }

  return opps.sort((a, b) => b.impactEuros - a.impactEuros);
}
