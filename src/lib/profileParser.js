import { n, f, s, oui, signed, section } from './profileParserUtils.js';
import { getTMI, abattement10Auto } from './taxCalculator';
import { registry } from '../plugins/registry.js';

// ─── Local utility (not exported from profileParserUtils) ─────────────────────

function anteriorite(dateStr) {
  if (!dateStr) return null;
  const d = dateStr.trim();
  let dt;
  if (/^\d{4}$/.test(d))                       dt = new Date(parseInt(d), 0, 1);
  else if (/^\d{2}\/\d{4}$/.test(d))           { const [m, y] = d.split('/'); dt = new Date(parseInt(y), parseInt(m) - 1, 1); }
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(d))    { const [dy, m, y] = d.split('/'); dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(dy)); }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d))      dt = new Date(d);
  else return null;
  if (isNaN(dt.getTime())) return null;
  return Math.floor((Date.now() - dt.getTime()) / (365.25 * 24 * 3600 * 1000));
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _sections(text, mode) {
  return {
    secEpD1:  mode === 'couple' ? section(text, '== ÉPARGNE — DÉCLARANT 1 ==') : section(text, '== ÉPARGNE ET PLACEMENTS =='),
    secEpD2:  mode === 'couple' ? section(text, '== ÉPARGNE — DÉCLARANT 2 ==') : '',
    secProfil:       section(text, '== PROFIL & RETRAITE =='),
    secCapacite:     section(text, "== CAPACITÉ D'ÉPARGNE =="),
    secImmo:         section(text, '== IMMOBILIER =='),
    secTransmission: section(text, '== TRANSMISSION ==')
                  || section(text, '== PROTECTION & TRANSMISSION ==')
                  || section(text, '== TRANSMISSION ET PROTECTION ==')
                  || '',
    secAttn: section(text, "== POINTS D'ATTENTION =="),
  };
}

function _situation(text) {
  return {
    parts:       f(text, /Parts fiscales\s*:\s*([\d,\.]+)/) || 1,
    departement: s(text, /Département\s*:\s*(\w{2,3})/),
    statut:      s(text, /^Statut\s*:\s*([^\n]+)/im)
              || s(text, /Mode\s*:.*?Déclaration commune \(([^)]+)\)/i)
              || '',
  };
}

function _profil(sec) {
  const ageD1      = n(sec, /Âge D1\s*:\s*(\d+)/i)      || n(sec, /^Âge\s*:\s*(\d+)/im);
  const retraiteD1 = n(sec, /Âge retraite D1\s*:\s*(\d+)/i) || n(sec, /Âge retraite estimé\s*:\s*(\d+)/i);
  const ageD2      = n(sec, /Âge D2\s*:\s*(\d+)/i);
  const retraiteD2 = n(sec, /Âge retraite D2\s*:\s*(\d+)/i);
  const tmiD1Raw   = s(sec, /TMI retraite D1\s*:\s*(\d+)/i) || s(sec, /TMI retraite estimée\s*:\s*(\d+)/i);
  const tmiD2Raw   = s(sec, /TMI retraite D2\s*:\s*(\d+)/i);
  return {
    ageD1, retraiteD1,
    horizonD1:      n(sec, /Horizon retraite D1\s*:\s*(\d+)/i) || n(sec, /Horizon retraite\s*:\s*(\d+)/i)
                 || (ageD1 > 0 && retraiteD1 > ageD1 ? retraiteD1 - ageD1 : 0),
    tmiRetraiteD1:  tmiD1Raw !== '' ? parseInt(tmiD1Raw, 10) : null,
    typeRevenuD1:   s(sec, /Type de revenu D1\s*:\s*(.+)/i) || s(sec, /Type de revenu\s*:\s*(.+)/i) || 'Salarié(e)',
    pensionNetImpD1: n(sec, /Pension nette imposable 1AS D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                  || n(sec, /Pension nette imposable 1AS[^:\n]*:\s*([\d\s,]+)\s*€/i),
    ageD2, retraiteD2,
    horizonD2:      n(sec, /Horizon retraite D2\s*:\s*(\d+)/i)
                 || (ageD2 > 0 && retraiteD2 > ageD2 ? retraiteD2 - ageD2 : 0),
    tmiRetraiteD2:  tmiD2Raw !== '' ? parseInt(tmiD2Raw, 10) : null,
    typeRevenuD2:   s(sec, /Type de revenu D2\s*:\s*(.+)/i) || 'Salarié(e)',
    pensionNetImpD2: n(sec, /Pension nette imposable 1AS D2[^:\n]*:\s*([\d\s,]+)\s*€/i),
  };
}

function _pero(text) {
  return {
    peroD1: n(text, /PERO D1[^:\n]*:\s*([\d\s,]+)\s*€/)
          || n(text, /PERO[^D][^:\n]*:\s*([\d\s,]+)\s*€/),
    peroD2: n(text, /PERO D2[^:\n]*:\s*([\d\s,]+)\s*€/),
  };
}

function _rni(pd, profil, text) {
  // RNI par déclarant : préférer la ligne "RNI Dx TOTAL" (nouveau format générateur,
  // inclut la rente 1BS après abat. 10%). Sinon recalculer depuis les composantes
  // (salaire net imposable + rente × 0,9) pour éviter de manquer la rente quand
  // le profil n'expose qu'une ligne "après abat. salaires" partielle.
  const renteAbatD1 = Math.round((pd.rente1BsD1 || 0) * 0.9);
  const renteAbatD2 = Math.round((pd.rente1BsD2 || 0) * 0.9);
  const salRniD1    = abattement10Auto(pd.salaireNetImposableD1, profil.typeRevenuD1, profil.pensionNetImpD1);
  const salRniD2    = abattement10Auto(pd.salaireNetImposableD2, profil.typeRevenuD2, profil.pensionNetImpD2);

  const rniD1 = n(text, /RNI D1 TOTAL[^:\n]*:\s*([\d\s,]+)\s*€/i)
             || (salRniD1 + renteAbatD1);
  const rniD2 = n(text, /RNI D2 TOTAL[^:\n]*:\s*([\d\s,]+)\s*€/i)
             || (salRniD2 + renteAbatD2);

  // RNI foyer : on accepte la ligne texte SI elle est cohérente avec la somme des
  // composantes (écart < 100 €). Sinon, on recalcule — protège contre les profils
  // anciens qui n'incluent pas la rente dans "RNI FOYER TOTAL".
  const rniFoyerSum  = rniD1 + rniD2 + (pd.foncierNet || 0);
  const rniFoyerText = n(text, /RNI FOYER TOTAL[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /RNI total[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /Revenu net imposable total estimé\s*:\s*([\d\s,]+)\s*€/);
  const rniFoyer = rniFoyerText > 0 && Math.abs(rniFoyerText - rniFoyerSum) < 100
                ? rniFoyerText
                : (rniFoyerSum || rniFoyerText || rniD1);

  const rfr = n(text, /RFR[^:\n]*:\s*([\d\s,]+)\s*€/i)
           || n(text, /Revenu fiscal de référence[^:\n]*:\s*([\d\s,]+)\s*€/i)
           || rniFoyer;
  return { rniD1, rniD2, rniFoyer, rfr };
}

function _fiscal(text, rniFoyer, parts, pd) {
  const pasTotal = n(text, /PAS total foyer 2025\s*:\s*([\d\s,]+)\s*€/)
                || ((pd.pasD1 || 0) + (pd.pasD2 || 0))
                || n(text, /PAS prélevé 2025\s*:\s*([\d\s,]+)\s*€/);
  const tmi = n(text, /^\s*TMI\s*:\s*(\d{1,2})\s*%/im)
           || n(text, /TMI foyer[^:\n]*:\s*(\d{1,2})\s*%/i)
           || getTMI(rniFoyer, parts || 1);
  const irNet   = n(text, /IR net[^:\n]*:\s*([\d\s,]+)\s*€/i) || n(text, /Impôt net[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const irBrut  = n(text, /IR brut foyer[^€\n]*=\s*([\d\s,]+)\s*€/i) || n(text, /IR brut foyer[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const totalDu = n(text, /TOTAL DÛ[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const remboursement = n(text, /REMBOURSEMENT[^:\n]*:\s*\+?\s*([\d\s,]+)\s*€/i)
                     || n(text, /[Rr]emboursement[^:\n]*:\s*\+?\s*([\d\s,]+)\s*€/);
  const gainPacs = n(text, /GAIN DU PACS[^:\n]*:\s*([\d\s,]+)\s*€/i)
                || n(text, /gain.*?quotient[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const montantPayer = signed(text, /MONTANT RESTANT (?:À|A) PAYER[^:\n]*:\s*([-−]?[\d\s,]+)\s*€/i);
  const solde = montantPayer !== null ? montantPayer
              : totalDu > 0 && pasTotal > 0 ? pasTotal - totalDu
              : remboursement > 0 ? remboursement : 0;
  return { pasTotal, tmi, irNet, irBrut, totalDu, remboursement, gainPacs, solde };
}

function _per(text) {
  const plafondPerD1 = n(text, /PLAFOND DISPONIBLE D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /Plafond disponible.*?D1[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /PLAFOND DISPONIBLE\s*:\s*([\d\s,]+)\s*€/i);
  const plafondPerD2 = n(text, /PLAFOND DISPONIBLE D2[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /Plafond disponible.*?D2[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const n1 = n(text, /Plafond reportable N-1[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const n2 = n(text, /Plafond reportable N-2[^:\n]*:\s*([\d\s,]+)\s*€/i);
  const n3 = n(text, /Plafond reportable N-3[^:\n]*:\s*([\d\s,]+)\s*€/i);
  return {
    plafondPerD1, plafondPerD2,
    plafondPerTotal:    plafondPerD1 + plafondPerD2 || plafondPerD1,
    plafondsPrecedents: n(text, /Plafonds antérieurs[^:\n]*:\s*([\d\s,]+)\s*€/i),
    perReportableN1: n1, perReportableN2: n2, perReportableN3: n3,
    perReportableTotal: n(text, /Plafond reportable total[^:\n]*:\s*([\d\s,]+)\s*€/i) || (n1 + n2 + n3),
  };
}

function _nonPlugRevenues(text) {
  return {
    dividendes:    n(text, /Dividendes\/intérêts\s*:\s*([\d\s,]+)\s*€/),
    revenusLoc:    n(text, /Revenus locatifs 2025\s*:\s*([\d\s,]+)\s*€/),
    revenusCrypto: n(text, /Revenus crypto\s*:\s*([\d\s,]+)\s*€/),
  };
}

function _acomptes(text) {
  return {
    acompte8HW: n(text, /Acompte IR D1[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i) || n(text, /\b8HW\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i),
    acompte8IW: n(text, /Acompte IR D2[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i) || n(text, /\b8IW\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i),
    acompte8HX: n(text, /Acompte PS D1[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i) || n(text, /\b8HX\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i),
    acompte8IX: n(text, /Acompte PS D2[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i) || n(text, /\b8IX\b[^:\n]*:\s*\*{0,2}\s*([\d\s,]+)\s*€/i),
  };
}

function _epargneDecl(sec, sfx) {
  return {
    [`livretA${sfx}`]:           oui(sec, /Livret A\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`ldds${sfx}`]:              oui(sec, /LDDS\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`lep${sfx}`]:               oui(sec, /LEP\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`livretPlus${sfx}`]:        oui(sec, /Livret\+[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`pel${sfx}`]:               oui(sec, /PEL\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`pelDate${sfx}`]:           s(sec,   /PEL date ouverture[^:\n]*:\s*(\S+)/i),
    [`pea${sfx}`]:               oui(sec, /PEA\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`peaDate${sfx}`]:           s(sec,   /PEA date ouverture[^:\n]*:\s*(\S+)/i),
    [`peaVerse${sfx}`]:          n(sec,   /PEA total versé[^:\n]*:\s*([\d\s,]+)\s*€/i),
    [`pee${sfx}`]:               oui(sec, /PEE\s*(?:\(valorisation\))?\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/i),
    [`peeVerse${sfx}`]:          n(sec,   /PEE versements salarié 2025\s*:\s*([\d\s,]+)\s*€/i),
    [`av${sfx}`]:                oui(sec, /Assurance-vie\s*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`avDate${sfx}`]:            s(sec,   /AV date souscription[^:\n]*:\s*(\S+)/i),
    [`avVerse${sfx}`]:           n(sec,   /AV versements nets cumulés[^:\n]*:\s*([\d\s,]+)\s*€/i),
    [`crypto${sfx}`]:            oui(sec, /Crypto[^:\n]*:\s*OUI\s*~\s*([\d\s,]+)\s*€/),
    [`perco${sfx}`]:             n(sec,   /PER versements 2025\s*:\s*([\d\s,]+)\s*€/),
    [`cryptoPlateforme${sfx}`]:  s(sec,   /Crypto plateforme\s*:\s*(.+)/i),
    [`cryptoCessions${sfx}`]:    s(sec,   /Crypto cessions 2025\s*:\s*(.+)/i),
    [`cryptoMontantCede${sfx}`]: n(sec,   /Crypto montant cédé[^:\n]*:\s*([\d\s,]+)\s*€/i),
    [`cryptoPv${sfx}`]:          n(sec,   /Crypto plus-value nette[^:\n]*:\s*([\d\s,]+)\s*€/i),
    [`pelInterets${sfx}`]:       n(sec,   /PEL intérêts 2025[^:\n]*:\s*([\d\s,]+)\s*€/i),
    [`avRachats${sfx}`]:         n(sec,   /AV rachats?[^:\n]*:\s*([\d\s,]+)\s*€/i),
    [`percoAbond${sfx}`]:        n(sec,   /(?:PERCO|PER.*?col)[^:\n]*abondement[^:\n]*:\s*([\d\s,]+)\s*€/i),
    [`percoPlafond${sfx}`]:      n(sec,   /(?:PERCO|PER.*?col)[^:\n]*plafond[^:\n]*:\s*([\d\s,]+)\s*€/i),
  };
}

function _epDerived(ep, sfx) {
  const avAnt  = anteriorite(ep[`avDate${sfx}`]);
  const peaAnt = anteriorite(ep[`peaDate${sfx}`]);
  const pelAnt = anteriorite(ep[`pelDate${sfx}`]);
  const peaVerse = ep[`peaVerse${sfx}`] || 0;
  const peaVal   = ep[`pea${sfx}`]      || 0;
  const lvPlus   = ep[`livretPlus${sfx}`] || 0;
  return {
    [`avAnteriorite${sfx}`]:        avAnt,
    [`peaAnteriorite${sfx}`]:       peaAnt,
    [`pelAnteriorite${sfx}`]:       pelAnt,
    [`pelFiscal${sfx}`]:            pelAnt !== null ? (pelAnt >= 12 ? 'imposable' : 'exonéré') : null,
    [`peaEspace${sfx}`]:            peaVal > 0 ? Math.max(0, 150_000 - (peaVerse || peaVal)) : 150_000,
    [`livretAExceeds${sfx}`]:       (ep[`livretA${sfx}`] || 0) > 22_950,
    [`livretPlusGainAnnuel${sfx}`]: Math.round(lvPlus * (0.07 - 0.03) * (1 - 0.172)),
  };
}

function _capacite(sec) {
  return {
    chargesFixes:         n(sec, /Charges (?:fixes|communes) mensuelles[^:\n]*:\s*([\d\s,]+)\s*€/i),
    creditRp:             n(sec, /dont crédit RP[^:\n]*:\s*([\d\s,]+)\s*€/i),
    autresCredits:        n(sec, /dont autres crédits[^:\n]*:\s*([\d\s,]+)\s*€/i),
    chargesPersoD1:       n(sec, /Charges personnelles D1[^:\n]*:\s*([\d\s,]+)\s*€/i),
    chargesPersoD2:       n(sec, /Charges personnelles D2[^:\n]*:\s*([\d\s,]+)\s*€/i),
    capaciteEpargneD1:    n(sec, /Capacité d'épargne D1[^:\n]*:\s*([\d\s,]+)\s*€/i),
    capaciteEpargneD2:    n(sec, /Capacité d'épargne D2[^:\n]*:\s*([\d\s,]+)\s*€/i),
    capaciteEpargneFoyer: n(sec, /Capacité d'épargne (?:foyer|mensuelle)[^:\n]*:\s*([\d\s,]+)\s*€/i),
    objectifPatrimonial:  s(sec, /Objectif patrimonial\s*:\s*(.+)/i),
  };
}

function _immo(sec) {
  return {
    rpValeur:         n(sec, /RP — valeur estimée[^:\n]*:\s*([\d\s,]+)\s*€/i),
    creditCrd:        n(sec, /Capital restant dû[^:\n]*:\s*([\d\s,]+)\s*€/i),
    creditTaux:       f(sec, /Taux crédit\s*:\s*([\d,\.]+)/i),
    creditMensualite: n(sec, /Mensualité crédit[^:\n]*:\s*([\d\s,]+)\s*€/i),
    taxeFonciere:     n(sec, /Taxe foncière[^:\n]*:\s*([\d\s,]+)\s*€/i),
  };
}

function _flags(text, epD1, epD2) {
  const cryptoTotal = (epD1.cryptoD1 || 0) + (epD2.cryptoD2 || 0);
  return {
    hasCrypto:              cryptoTotal > 0 || /crypto|bitcoin|ethereum|binance|kraken|coinbase/i.test(text),
    hasCompteEtranger:      /revolut|n26|wise|bunq|3916|compte.{0,10}étranger/i.test(text),
    hasIndivision:          /indivision/i.test(text),
    hasTestamentManquant:   !(/testament/i.test(text)) && /pacsé|pacs(?!\w)/i.test(text),
    hasPelAncien:           /pel.{0,20}201[0-7]|ouvert.{0,20}201[0-7]/i.test(text),
    hasChangementEmployeur: /changement.{0,10}employeur/i.test(text),
    hasMultipleEmployeurs:  /plusieurs employeurs/i.test(text),
    isEnriched:             /DÉCLARATION.*CASES|OBJECTIFS PRIORITAIRES|ANALYSE DES SITUATIONS/i.test(text),
  };
}

function _transmission(secTransmission, text) {
  return {
    beneficiairesAvD1: s(secTransmission, /Bénéficiaires AV D1[^:\n]*:\s*(.+)/i),
    beneficiairesAvD2: s(secTransmission, /Bénéficiaires AV D2[^:\n]*:\s*(.+)/i),
    donationsRecues:   n(text, /Donations? reçues?[^:\n]*:\s*([\d\s,]+)\s*€/i),
    abattementDonRest: n(text, /[Aa]battement.*?restant[^:\n]*:\s*([\d\s,]+)\s*€/i),
    hasNuPropriete:    /nu.?propriété/i.test(text),
    nuProprieteValeur: n(text, /nu.?propriété[^:\n]*:\s*([\d\s,]+)\s*€/i),
    indivisionValeur:  n(text, /indivision[^:\n]*:\s*([\d\s,]+)\s*€/i)
                    || n(text, /quote.?part[^:\n]*:\s*([\d\s,]+)\s*€/i),
  };
}

function _alerts(secAttn) {
  const lines = (secAttn || '').split('\n').map(l => l.trim()).filter(Boolean);
  return {
    alertsCritiques:    lines.filter(l => l.startsWith('[🔴') || l.startsWith('🔴')),
    alertsAVerifier:    lines.filter(l => l.startsWith('[🟡') || l.startsWith('🟡')),
    alertsOpportunites: lines.filter(l => l.startsWith('[🟢') || l.startsWith('🟢')),
  };
}

function _patrimoine(epD1, epD2, immo, capacite, rniFoyer) {
  const g = (o, k) => o[k] || 0;
  const epargneLiquide   = g(epD1,'livretAD1') + g(epD1,'lddsD1') + g(epD1,'lepD1') + g(epD1,'livretPlusD1')
                         + g(epD2,'livretAD2') + g(epD2,'lddsD2') + g(epD2,'lepD2') + g(epD2,'livretPlusD2');
  const epargneLongTerme = g(epD1,'peaD1') + g(epD1,'avD1') + g(epD1,'percoD1') + g(epD1,'pelD1') + g(epD1,'peeD1')
                         + g(epD2,'peaD2') + g(epD2,'avD2') + g(epD2,'percoD2') + g(epD2,'pelD2') + g(epD2,'peeD2');
  const cryptoTotal       = g(epD1,'cryptoD1') + g(epD2,'cryptoD2');
  const patrimoineImmoNet = Math.max(0, g(immo,'rpValeur') - g(immo,'creditCrd'));
  const patrimoineNet     = epargneLiquide + epargneLongTerme + cryptoTotal + patrimoineImmoNet;
  const revenuMensuelFoyer = Math.round((rniFoyer || 0) / 12);
  const capEp = g(capacite, 'capaciteEpargneFoyer');
  const tauxEpargneFoyer = revenuMensuelFoyer > 0 && capEp > 0
    ? Math.round(capEp / revenuMensuelFoyer * 100) : 0;
  return {
    epargneLiquide, epargneLongTerme, cryptoTotal, immoTotal: 0,
    patrimoineTotal: epargneLiquide + epargneLongTerme + cryptoTotal,
    patrimoineImmoNet, patrimoineNet,
    revenuMensuelFoyer, tauxEpargneFoyer,
  };
}

// ─── parseProfile ─────────────────────────────────────────────────────────────

export function parseProfile(text) {
  if (!text) return emptyProfile();

  const mode = /FOYER 2025|Mode\s*:\s*Déclaration commune|DÉCLARANT 2/i.test(text) ? 'couple' : 'solo';
  const secs = _sections(text, mode);

  const pluginData = {};
  for (const p of registry.getAll()) Object.assign(pluginData, p.parser(text, mode));

  const sit      = _situation(text);
  const profil   = _profil(secs.secProfil);

  // Run calculators with parser data + profil context (typeRevenuD1/D2 needed by salaires)
  const calcCtx = { ...pluginData, ...profil };
  for (const p of registry.getAll()) Object.assign(pluginData, p.calculator(calcCtx));

  const pero     = _pero(text);
  const rni      = _rni(pluginData, profil, text);
  const fiscal   = _fiscal(text, rni.rniFoyer, sit.parts, pluginData);
  const per      = _per(text);
  const nonPlug  = _nonPlugRevenues(text);
  const acomptes = _acomptes(text);
  const epD1     = _epargneDecl(secs.secEpD1, 'D1');
  const epD2     = _epargneDecl(secs.secEpD2, 'D2');
  const derivD1  = _epDerived(epD1, 'D1');
  const derivD2  = _epDerived(epD2, 'D2');
  const capacite = _capacite(secs.secCapacite);
  const immo     = _immo(secs.secImmo);
  const flags    = _flags(text, epD1, epD2);
  const transm   = _transmission(secs.secTransmission, text);
  const alerts   = _alerts(secs.secAttn);
  const patrim   = _patrimoine(epD1, epD2, immo, capacite, rni.rniFoyer);

  return {
    mode, ...sit,
    ...pluginData,
    ...profil, ...pero,
    ...rni, ...nonPlug, ...acomptes, ...fiscal, ...per,
    ...epD1, ...epD2, ...derivD1, ...derivD2,
    ...capacite, ...immo,
    ...flags, ...transm, ...alerts, ...patrim,
  };
}

export function emptyProfile() {
  return {
    mode: 'solo', parts: 1, departement: '', statut: '',
    salaireNetImposableD1: 0, salairesBrutImposableD1: 0, pasD1: 0, tauxPasD1: 0, peroD1: 0,
    salaireNetImposableD2: 0, salairesBrutImposableD2: 0, pasD2: 0, tauxPasD2: 0, peroD2: 0,
    rniD1: 0, rniD2: 0, rniFoyer: 0, rfr: 0, foncierNet: 0,
    tmi: 0, irNet: 0, irBrut: 0, totalDu: 0, pasTotal: 0, solde: 0, remboursement: 0, gainPacs: 0,
    dividendes: 0, revensFonciers: 0, revenusLoc: 0, revenusCrypto: 0,
    ageD1: 0, retraiteD1: 0, horizonD1: 0, tmiRetraiteD1: null,
    typeRevenuD1: 'Salarié(e)', pensionNetImpD1: 0,
    ageD2: 0, retraiteD2: 0, horizonD2: 0, tmiRetraiteD2: null,
    typeRevenuD2: 'Salarié(e)', pensionNetImpD2: 0,
    livretAD1: 0, lddsD1: 0, lepD1: 0, livretPlusD1: 0,
    pelD1: 0, pelDateD1: '', peaD1: 0, peaDateD1: '', peaVerseD1: 0, avD1: 0, avDateD1: '', avVerseD1: 0,
    cryptoD1: 0, percoD1: 0, peeD1: 0, peeVerseD1: 0, cryptoPlateformeD1: '', cryptoCessionsD1: '', cryptoMontantCedeD1: 0, cryptoPvD1: 0,
    livretAD2: 0, lddsD2: 0, lepD2: 0, livretPlusD2: 0,
    pelD2: 0, pelDateD2: '', peaD2: 0, peaDateD2: '', peaVerseD2: 0, avD2: 0, avDateD2: '', avVerseD2: 0,
    cryptoD2: 0, percoD2: 0, peeD2: 0, peeVerseD2: 0, cryptoPlateformeD2: '', cryptoCessionsD2: '', cryptoMontantCedeD2: 0, cryptoPvD2: 0,
    chargesFixes: 0, creditRp: 0, autresCredits: 0,
    chargesPersoD1: 0, chargesPersoD2: 0,
    capaciteEpargneD1: 0, capaciteEpargneD2: 0, capaciteEpargneFoyer: 0,
    objectifPatrimonial: '',
    rpValeur: 0, creditCrd: 0, creditTaux: 0, creditMensualite: 0, taxeFonciere: 0,
    epargneLiquide: 0, epargneLongTerme: 0, cryptoTotal: 0, immoTotal: 0, patrimoineTotal: 0,
    regimeFoncier: null,
    plafondPerD1: 0, plafondPerD2: 0, plafondPerTotal: 0, plafondsPrecedents: 0,
    perReportableN1: 0, perReportableN2: 0, perReportableN3: 0, perReportableTotal: 0,
    intMob2TR: 0, intMob2CK: 0,
    acompte8HW: 0, acompte8IW: 0, acompte8HX: 0, acompte8IX: 0,
    ijCpamD1: 0, ijCpamOrgD1: '', ijCpamD2: 0, ijCpamOrgD2: '',
    rente1BsD1: 0, pasRente1BsD1: 0, orgRente1BsD1: '', recurrentRente1BsD1: null,
    rente1BsD2: 0, pasRente1BsD2: 0, orgRente1BsD2: '', recurrentRente1BsD2: null,
    hasCrypto: false, hasCompteEtranger: false, hasIndivision: false,
    hasTestamentManquant: false, hasPelAncien: false,
    hasChangementEmployeur: false, hasMultipleEmployeurs: false,
    isEnriched: false,
    avAnterioriteD1: null, avAnterioriteD2: null,
    peaAnterioriteD1: null, peaAnterioriteD2: null,
    pelAnterioriteD1: null, pelAnterioriteD2: null,
    pelFiscalD1: null, pelFiscalD2: null,
    peaEspaceD1: 150_000, peaEspaceD2: 150_000,
    livretAExceedsD1: false, livretAExceedsD2: false,
    pelInteretsD1: 0, pelInteretsD2: 0,
    livretPlusGainAnnuelD1: 0, livretPlusGainAnnuelD2: 0,
    avRachatsD1: 0, avRachatsD2: 0,
    percoAbondD1: 0, percoPlafondD1: 0, percoAbondD2: 0, percoPlafondD2: 0,
    beneficiairesAvD1: '', beneficiairesAvD2: '',
    donationsRecues: 0, abattementDonRest: 0,
    hasNuPropriete: false, nuProprieteValeur: 0, indivisionValeur: 0,
    alertsCritiques: [], alertsAVerifier: [], alertsOpportunites: [],
    patrimoineImmoNet: 0, patrimoineNet: 0,
    revenuMensuelFoyer: 0, tauxEpargneFoyer: 0,
  };
}
