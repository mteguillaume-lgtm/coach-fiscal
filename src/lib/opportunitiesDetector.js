// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAmt(str) {
  if (!str) return null;
  const n = parseInt(str.replace(/[\s.]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function extract(profile, rx) {
  const m = profile.match(rx);
  return m ? parseAmt(m[1]) : null;
}

const fmt = (n) => n.toLocaleString('fr-FR');

// ─── detectOpportunities ──────────────────────────────────────────────────────

export function detectOpportunities(profile) {
  if (!profile) return [];

  const opps = [];

  // ── Valeurs numériques extraites du profil ───────────────────────────────────

  const tmi = extract(profile, /tmi[^%\d]{0,20}(\d{1,2})\s*%/i);

  const perPlafond =
    extract(profile, /plafond[^€]{0,40}(\d[\d\s.]{1,10})\s*€/i) ||
    extract(profile, /(\d[\d\s.]{1,10})\s*€[^.]{0,40}plafond[^.]{0,20}per/i);

  const rfr =
    extract(profile, /rfr[^€]{0,40}(\d[\d\s.]{1,10})\s*€/i) ||
    extract(profile, /revenu fiscal[^€]{0,60}(\d[\d\s.]{1,10})\s*€/i);

  const livretAmt = extract(profile, /livret[^€\n]{0,60}(\d[\d\s.]{2,10})\s*€/i);

  const livretTaux = (() => {
    const m = profile.match(/livret[^%\n]{0,60}(\d+[,.]?\d*)\s*%/i);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  })();

  const tauxPAS = (() => {
    const m =
      profile.match(/taux[^%\d]{0,20}pas[^%\d]{0,20}(\d+[,.]?\d*)\s*%/i) ||
      profile.match(/pas[^%\d]{0,30}(\d+[,.]?\d*)\s*%/i);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  })();

  const remboursement =
    extract(profile, /remboursement[^€]{0,40}(\d[\d\s.]{1,10})\s*€/i) ||
    extract(profile, /(\d[\d\s.]{1,10})\s*€[^.]{0,40}remboursement/i);

  const cryptoAmt =
    extract(profile, /crypto[^€]{0,60}(\d[\d\s.]{1,10})\s*€/i) ||
    extract(profile, /(\d[\d\s.]{1,10})\s*€[^.]{0,40}crypto/i);

  // ── Flags booléens ───────────────────────────────────────────────────────────

  const isPACS        = /pacsé|pacs(?!\w)/i.test(profile);
  const isPacseOuMarie = /pacsé|pacs(?!\w)|marié|couple|conjoint/i.test(profile);
  const hasPEA        = /\bpea\b/i.test(profile);
  const hasLEP        = /\blep\b/i.test(profile);
  const hasCrypto     = /crypto|bitcoin|ethereum|binance|kraken|coinbase|bybit|bitpanda|okx/i.test(profile);
  const has3916bis    = /3916\s*bis/i.test(profile);
  const hasTestament  = /testament/i.test(profile);
  const hasIndivision = /indivision/i.test(profile);
  const hasNotaireAct = /notaire|convention.*?indivision|acte.*?indivision/i.test(profile);

  // ── GAINS ────────────────────────────────────────────────────────────────────

  // PER optimal : plafond disponible + TMI >= 30 %
  if (perPlafond && perPlafond > 0 && tmi && tmi >= 30) {
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

  // Épargne mal rémunérée : livret > 10 000 € et taux < 2 %
  if (livretAmt && livretAmt > 10000 && livretTaux !== null && livretTaux < 2) {
    const gainAnnuel = Math.round(livretAmt * (0.03 - livretTaux / 100));
    opps.push({
      id: 'epargne_mal_remuneree',
      type: 'gain',
      urgence: 'long_terme',
      titre: '💡 Épargne mal rémunérée détectée',
      description: `${fmt(livretAmt)} € sur un livret à ${livretTaux} % — le LDDS (3 %) ou une assurance-vie fonds euros offrent une meilleure rémunération sans risque.`,
      impact: `Gain potentiel annuel : ~${fmt(gainAnnuel)} €`,
      impactEuros: gainAnnuel,
      action: 'Transférer vers LDDS ou assurance-vie fonds euros',
      questionChat: `J'ai ${fmt(livretAmt)} € sur un livret à ${livretTaux} %. Quelle est la meilleure stratégie pour améliorer ma rémunération — LDDS, assurance-vie fonds euros ou autre placement sécurisé ?`,
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
  // Plafonds RFR 2025 (déclaration 2024) : 22 419 € pour 1 part, 34 393 € pour 2 parts
  if (!hasLEP && rfr) {
    const plafondRFR = isPacseOuMarie ? 34393 : 22419;
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

  // ── RISQUES ──────────────────────────────────────────────────────────────────

  // Crypto sans 3916 bis
  if (hasCrypto && !has3916bis) {
    const detailCrypto = cryptoAmt && cryptoAmt > 305
      ? ` Portefeuille détecté : ${fmt(cryptoAmt)} €.`
      : '';
    opps.push({
      id: 'crypto_3916bis',
      type: 'risque',
      urgence: 'immediate',
      titre: '🔴 Obligation déclarative crypto non remplie',
      description: `Tout exchange étranger (Binance, Kraken, Coinbase…) doit être déclaré via le formulaire 3916 bis, même sans cession taxable.${detailCrypto}`,
      impact: 'Amende : 1 500 € par compte non déclaré',
      impactEuros: 1500,
      action: 'Déclarer chaque exchange via le formulaire 3916 bis sur impots.gouv',
      questionChat: 'J\'ai des comptes sur des exchanges crypto étrangers. Comment remplir les formulaires 3916 bis et quelles informations dois-je renseigner pour chaque exchange ?',
    });
  }

  // Pacsé sans testament
  if (isPACS && !hasTestament) {
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
  if (hasIndivision && !hasNotaireAct) {
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
  if (tauxPAS !== null && tmi && tauxPAS < tmi - 5) {
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

  // ── ACTIONS RAPIDES ──────────────────────────────────────────────────────────

  // Remboursement IR prévu
  if (remboursement && remboursement > 0) {
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

  // Deadline déclaration détectée dans le profil
  const deadlineMatch =
    profile.match(/déclaration[^:.\n]{0,40}(\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)/i) ||
    profile.match(/(\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)[^.\n]{0,40}déclaration/i);

  if (deadlineMatch) {
    const dateStr = deadlineMatch[1];
    opps.push({
      id: 'deadline_declaration',
      type: 'action',
      urgence: 'immediate',
      titre: `🔵 Deadline déclaration : ${dateStr}`,
      description: 'Une date de déclaration est détectée dans votre profil. Déposer après la date limite expose à une pénalité de 10 % de l\'impôt dû.',
      impact: 'Retard = pénalité 10 % de l\'impôt dû minimum',
      impactEuros: 200,
      action: `Déposer votre déclaration avant le ${dateStr} sur impots.gouv`,
      questionChat: `Ma date limite de déclaration est le ${dateStr}. Quels sont les points les plus critiques à vérifier en priorité avant de soumettre ?`,
    });
  }

  return opps.sort((a, b) => b.impactEuros - a.impactEuros);
}
