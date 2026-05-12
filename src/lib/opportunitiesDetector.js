// ─── detectOpportunities ──────────────────────────────────────────────────────
// Accepte un objet parsedProfile (résultat de parseProfile) ou un texte brut.

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
    peaD1, peaD2,
    lepD1, lepD2,
    tauxPasD1, tauxPasD2,
    remboursement,
    cryptoTotal,
    mode,
    hasCrypto,
    hasCompteEtranger,
    hasIndivision,
    hasTestamentManquant,
  } = parsedProfile;

  const opps = [];
  const perPlafond = plafondPerTotal || plafondPerD1;
  const isPacseOuMarie = mode === 'couple';
  const livretTotal = livretAD1 + livretAD2 + lddsD1 + lddsD2;
  const hasPEA     = peaD1 > 0 || peaD2 > 0;
  const hasLEP     = lepD1 > 0 || lepD2 > 0;
  const tauxPAS    = tauxPasD1; // taux D1 pour la comparaison PAS

  // ── GAINS ──────────────────────────────────────────────────────────────────

  // PER optimal : plafond disponible + TMI >= 30 %
  if (perPlafond > 0 && tmi >= 30) {
    const economie = Math.round(perPlafond * (tmi / 100));
    opps.push({
      id: 'per_optimal',
      type: 'gain',
      urgence: 'avant_decembre',
      titre: '💡 Versement PER optimal détecté',
      description: `Plafond PER disponible de ${fmt(perPlafond)} € inutilisé. À votre TMI de ${tmi} %, ce versement est directement déductible de votre revenu imposable.`,
      impact: `Économie estimée : ${fmt(economie)} €`,
      impactEuros: economie,
      action: `Verser ${fmt(perPlafond)} € sur votre PER avant le 31/12`,
      questionChat: `J'ai un plafond PER disponible de ${fmt(perPlafond)} € et une TMI de ${tmi} %. Quel PER individuel choisir et comment optimiser ce versement avant le 31/12 pour maximiser mon économie d'impôt ?`,
    });
  }

  // Épargne liquide mal rémunérée : livrets > 10 000 € (Livret A + LDDS hors LEP)
  if (livretTotal > 10_000) {
    opps.push({
      id: 'epargne_mal_remuneree',
      type: 'gain',
      urgence: 'long_terme',
      titre: '💡 Épargne liquide à optimiser',
      description: `${fmt(livretTotal)} € sur livrets réglementés. Une partie excédant votre épargne de précaution (3-6 mois de dépenses) pourrait être investie sur PEA ou assurance-vie pour une meilleure performance long terme.`,
      impact: 'Gain potentiel annuel selon l\'allocation choisie',
      impactEuros: Math.round(livretTotal * 0.02),
      action: 'Envisager un versement sur PEA ou assurance-vie fonds euros',
      questionChat: `J'ai ${fmt(livretTotal)} € sur livrets réglementés. Quelle stratégie pour optimiser mon allocation — garder une épargne de précaution et investir le surplus ?`,
    });
  }

  // PEA non ouvert
  if (!hasPEA) {
    opps.push({
      id: 'pea_non_ouvert',
      type: 'gain',
      urgence: 'long_terme',
      titre: '💡 PEA non ouvert — horloge fiscale non démarrée',
      description: 'Le PEA offre une exonération totale d\'IR sur les plus-values après 5 ans. Chaque jour sans PEA retarde votre date d\'exonération.',
      impact: 'Exonération IR sur toutes les plus-values après 5 ans',
      impactEuros: 500,
      action: 'Ouvrir un PEA même avec 1 € pour faire partir le délai de 5 ans',
      questionChat: 'Je n\'ai pas encore de PEA. Quelle banque ou quel courtier recommander pour ouvrir un PEA en 2025, et quels points de vigilance lors de l\'ouverture ?',
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
        description: `Avec un RFR de ${fmt(rfr)} €, vous êtes éligible au Livret d'Épargne Populaire (taux 5 % vs Livret A à 3 %). Plafond de dépôt : 10 000 €.`,
        impact: 'Gain : taux 5 % vs Livret A 3 % — soit +200 €/an pour 10 000 €',
        impactEuros: 200,
        action: 'Ouvrir un LEP à La Banque Postale, Caisse d\'Épargne ou votre banque',
        questionChat: `Mon RFR est de ${fmt(rfr)} €. Suis-je éligible au LEP et comment l'ouvrir pour bénéficier du taux de 5 % ?`,
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

  // Taux PAS trop bas (écart > 5 pts vs TMI)
  if (tauxPAS > 0 && tmi > 0 && tauxPAS < tmi - 5) {
    const ecart = tmi - tauxPAS;
    opps.push({
      id: 'taux_pas_trop_bas',
      type: 'risque',
      urgence: 'avant_decembre',
      titre: '🟠 Taux PAS probablement trop bas',
      description: `Taux PAS actuel : ${tauxPAS} % — TMI : ${tmi} %. Un écart de ${ecart} points expose à un solde d'impôt inattendu en septembre.`,
      impact: `Risque de solde à payer en septembre (écart ${ecart} pts)`,
      impactEuros: 400,
      action: 'Augmenter votre taux PAS sur impots.gouv → Gérer mon prélèvement à la source',
      questionChat: `Mon taux PAS est de ${tauxPAS} % mais ma TMI est de ${tmi} %. Comment ajuster mon taux de prélèvement à la source pour éviter un solde à payer en septembre ?`,
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
