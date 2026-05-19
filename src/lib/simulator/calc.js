/**
 * Moteur de calcul du simulateur d'enveloppes.
 *
 * Convention : TAUX ANNUEL ÉQUIVALENT.
 *   taux_mensuel = (1 + r)^(1/12) − 1
 * Le taux saisi est effectivement appliqué sur l'année (5 % saisi = 5 % réel).
 *
 * Versements en FIN DE MOIS (annuité ordinaire).
 */

function fvMonthly(V, r, t) {
  if (V <= 0 || t <= 0) return 0;
  const i = Math.pow(1 + r, 1 / 12) - 1;
  const N = t * 12;
  return i > 0 ? V * ((Math.pow(1 + i, N) - 1) / i) : V * N;
}

/**
 * Simule un capital initial C0 + versements mensuels V sur `years` ans à `rate` annuel.
 *
 * @param {{ C0: number, V: number, years: number, rate: number }} params
 * @returns {{
 *   capitalBrut: number,
 *   versementsTotaux: number,
 *   interets: number,
 *   serie: Array<{ m: number, capital: number, versements: number, interets: number }>
 * }}
 */
export function simulate({ C0, V, years, rate }) {
  const i = rate > 0 ? Math.pow(1 + rate, 1 / 12) - 1 : 0;
  const N = years * 12;

  const capitalBrut = i > 0
    ? C0 * Math.pow(1 + i, N) + V * ((Math.pow(1 + i, N) - 1) / i)
    : C0 + V * N;

  const versementsTotaux = C0 + V * N;
  const interets = capitalBrut - versementsTotaux;

  const serie = [];
  for (let m = 0; m <= N; m++) {
    const capital = i > 0
      ? C0 * Math.pow(1 + i, m) + V * ((Math.pow(1 + i, m) - 1) / i)
      : C0 + V * m;
    const versements = C0 + V * m;
    serie.push({ m, capital, versements, interets: capital - versements });
  }

  return { capitalBrut, versementsTotaux, interets, serie };
}

function _capitalBrut(id, C0, r, t, V) {
  const rate = (id === 'livretA' || id === 'ldds') ? 0.03 : r;
  const N = t * 12;
  const i = rate > 0 ? Math.pow(1 + rate, 1 / 12) - 1 : 0;
  const lump = C0 > 0 ? C0 * Math.pow(1 + i, N) : 0;
  return lump + fvMonthly(V, rate, t);
}

/**
 * Capital net après fiscalité pour une enveloppe donnée.
 *
 * @param {string} id - 'livretA' | 'pea' | 'av' | 'av8' | 'per' | 'cto'
 * @param {{
 *   C0: number,
 *   V?: number,
 *   years: number,
 *   rate?: number,
 *   tmiEntree?: number,   // fraction décimale : 0.30 = 30 %
 *   tmiSortie?: number,
 *   couple?: boolean,
 *   reinvest?: boolean,
 *   avVerse?: number
 * }} params
 * @returns {{ capitalNet: number, capitalBrut: number, versementsTotaux: number, interets: number }}
 */
export function envelope(id, {
  C0, V = 0, years, rate = 0,
  tmiEntree = 0, tmiSortie, couple = false,
  reinvest = true, avVerse = 0,
}) {
  const Te = tmiEntree;
  const Ts = tmiSortie ?? tmiEntree;
  const B  = _capitalBrut(id, C0, rate, years, V);
  const Pt = C0 + V * years * 12;
  const G  = Math.max(0, B - Pt);

  let net;
  switch (id) {
    case 'livretA':
    case 'ldds':
      net = B;
      break;

    case 'pea':
      net = years >= 5 ? B - G * 0.172 : B - G * 0.30;
      break;

    case 'av':
    case 'av8': {
      const abatt   = couple ? 9_200 : 4_600;
      const ps      = G * 0.172;
      let ir;
      if ((avVerse + Pt) <= 150_000) {
        ir = Math.max(0, G - abatt) * 0.075;
      } else {
        const ratio150 = Math.min(1, Math.max(0, 150_000 - avVerse) / Math.max(1, Pt));
        const G150     = G * ratio150;
        const GAbove   = G * (1 - ratio150);
        ir = Math.max(0, G150 - abatt) * 0.075 + GAbove * 0.128;
      }
      net = B - ps - ir;
      break;
    }

    case 'per': {
      const netBase = B * (1 - Ts) - G * 0.172;
      if (!reinvest) { net = netBase; break; }
      const bonusLump = C0 > 0
        ? C0 * Te * (Math.pow(1 + rate, years) * (1 - 0.172) + 0.172)
        : 0;
      const bonusMensuel = V > 0 && rate > 0
        ? V * 12 * Te * (((Math.pow(1 + rate, years) - 1) / rate) * (1 - 0.172) + years * 0.172)
        : 0;
      net = netBase + bonusLump + bonusMensuel;
      break;
    }

    case 'cto':
    default:
      net = B - G * 0.30;
      break;
  }

  return { capitalNet: net, capitalBrut: B, versementsTotaux: Pt, interets: G };
}
