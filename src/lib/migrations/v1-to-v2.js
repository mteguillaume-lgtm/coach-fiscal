import { parseProfile } from '../profileParser.js';

function normalizeStatut(statut) {
  if (!statut) return '';
  const s = statut.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('pacs'))  return 'pacse';
  if (s.includes('mari'))  return 'marie';
  if (s.includes('divor')) return 'divorce';
  if (s.includes('veuf'))  return 'veuf';
  if (s.includes('celib')) return 'celibataire';
  return '';
}

let _seq = 0;

export function migrateProfile(source) {
  if (source && typeof source === 'object' && source.$version === 2) return source;

  const v1 = typeof source === 'string' ? parseProfile(source) : source;
  if (!v1 || typeof v1 !== 'object') throw new Error('migrateProfile: source invalide');

  _seq = 0;
  const id = () => `rev-${++_seq}`;

  const revenus = [];

  if (v1.salaireNetImposableD1 > 0)
    revenus.push({ id: id(), type: 'salaire',   declarant: 'D1',   montant: v1.salaireNetImposableD1, meta: {} });
  if (v1.salaireNetImposableD2 > 0)
    revenus.push({ id: id(), type: 'salaire',   declarant: 'D2',   montant: v1.salaireNetImposableD2, meta: {} });
  if (v1.ijCpamD1 > 0)
    revenus.push({ id: id(), type: 'ijCpam',    declarant: 'D1',   montant: v1.ijCpamD1,  meta: { organisme: v1.ijCpamOrgD1 } });
  if (v1.ijCpamD2 > 0)
    revenus.push({ id: id(), type: 'ijCpam',    declarant: 'D2',   montant: v1.ijCpamD2,  meta: { organisme: v1.ijCpamOrgD2 } });
  if (v1.rente1BsD1 > 0)
    revenus.push({ id: id(), type: 'rente1bs',  declarant: 'D1',   montant: v1.rente1BsD1, meta: { organisme: v1.orgRente1BsD1, recurrent: v1.recurrentRente1BsD1 } });
  if (v1.rente1BsD2 > 0)
    revenus.push({ id: id(), type: 'rente1bs',  declarant: 'D2',   montant: v1.rente1BsD2, meta: { organisme: v1.orgRente1BsD2, recurrent: v1.recurrentRente1BsD2 } });
  if (v1.revensFonciers > 0)
    revenus.push({ id: id(), type: 'foncier',   declarant: 'foyer', montant: v1.revensFonciers, meta: { regime: v1.regimeFoncier } });
  if (v1.intMob2TR > 0)
    revenus.push({ id: id(), type: 'mobilier',  declarant: 'foyer', montant: v1.intMob2TR, meta: { case2CK: v1.intMob2CK } });
  if (v1.dividendes > 0)
    revenus.push({ id: id(), type: 'dividendes', declarant: 'foyer', montant: v1.dividendes, meta: {} });
  if (v1.revenusCrypto > 0)
    revenus.push({ id: id(), type: 'crypto',    declarant: 'foyer', montant: v1.revenusCrypto, meta: {} });

  const declarants = [{
    id: 'D1',
    salaires: {
      netImposable:  v1.salaireNetImposableD1,
      brutImposable: v1.salairesBrutImposableD1,
      pas:           v1.pasD1,
      tauxPas:       v1.tauxPasD1,
    },
    rni:        v1.rniD1,
    pero:       v1.peroD1,
    age:        v1.ageD1,
    typeRevenu: v1.typeRevenuD1,
  }];

  if (v1.mode === 'couple') {
    declarants.push({
      id: 'D2',
      salaires: {
        netImposable:  v1.salaireNetImposableD2,
        brutImposable: v1.salairesBrutImposableD2,
        pas:           v1.pasD2,
        tauxPas:       v1.tauxPasD2,
      },
      rni:        v1.rniD2,
      pero:       v1.peroD2,
      age:        v1.ageD2,
      typeRevenu: v1.typeRevenuD2,
    });
  }

  const foncierRegime = v1.regimeFoncier === 'micro' ? 'micro-foncier'
                      : v1.regimeFoncier === 'reel'  ? 'reel'
                      : null;

  const acomptesTotal = (v1.acompte8HW || 0) + (v1.acompte8IW || 0)
                      + (v1.acompte8HX || 0) + (v1.acompte8IX || 0);

  return {
    $version: 2,
    mode:  v1.mode,
    foyer: {
      statut:      v1.statut,
      statutNorm:  normalizeStatut(v1.statut),
      parts:       v1.parts,
      departement: v1.departement,
    },
    declarants,
    revenus,
    mobilier: {
      case2TR: v1.intMob2TR,
      case2CK: v1.intMob2CK,
      case2BH: v1.intMob2TR,
    },
    acomptes: {
      irD1_8HW: v1.acompte8HW,
      irD2_8IW: v1.acompte8IW,
      psD1_8HX: v1.acompte8HX,
      psD2_8IX: v1.acompte8IX,
    },
    foncier: {
      brut:   v1.revensFonciers,
      net:    v1.foncierNet,
      regime: foncierRegime,
    },
    calculs: {
      rniFoyer:     v1.rniFoyer,
      tmi:          v1.tmi,
      irBrut:       v1.irBrut,
      irNet:        v1.irNet,
      totalDu:      v1.totalDu,
      acomptes:     acomptesTotal,
      creditsImpot: v1.intMob2CK,
      pasTotal:     v1.pasTotal,
      solde:        v1.solde,
      rfr:          v1.rfr,
    },
    patrimoine: {
      epargneD1: {
        livretA:    v1.livretAD1,
        ldds:       v1.lddsD1,
        lep:        v1.lepD1,
        livretPlus: v1.livretPlusD1,
        pel:        v1.pelD1,
        pea:        v1.peaD1,
        av:         v1.avD1,
        perco:      v1.percoD1,
      },
      epargneD2: {
        livretA:    v1.livretAD2,
        ldds:       v1.lddsD2,
        lep:        v1.lepD2,
        livretPlus: v1.livretPlusD2,
        pel:        v1.pelD2,
        pea:        v1.peaD2,
        av:         v1.avD2,
        perco:      v1.percoD2,
      },
    },
  };
}
