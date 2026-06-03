import { describe, it, expect } from 'vitest';
import { checkCoherence, FLAG_LABELS } from '../coherenceCheck.js';

const kinds = alerts => alerts.map(a => a.kind);
const find = (alerts, kind, flag) => alerts.find(a => a.kind === kind && a.flag === flag);

describe('checkCoherence — socle universel', () => {
  it('signale l\'avis d\'imposition manquant', () => {
    const a = checkCoherence({}, ['bulletin_salaire']);
    expect(find(a, 'socle', null)?.typeId).toBe('avis_ir');
  });

  it('ne le signale plus une fois détecté', () => {
    const a = checkCoherence({}, ['avis_ir']);
    expect(kinds(a)).not.toContain('socle');
  });
});

describe('checkCoherence — manque (déclaré sans détecté)', () => {
  it('alerte quand un flag déclaré n\'a aucun document détecté', () => {
    const a = checkCoherence({ foncier: true }, ['avis_ir']);
    const alert = find(a, 'missing', 'foncier');
    expect(alert).toBeTruthy();
    expect(alert.message).toContain(FLAG_LABELS.foncier);
    expect(alert.action.type).toBe('addDocument');
  });

  it('pas d\'alerte si un document du flag est détecté', () => {
    const a = checkCoherence({ foncier: true }, ['avis_ir', 'bail_quittances']);
    expect(find(a, 'missing', 'foncier')).toBeUndefined();
  });

  it('ignore les flags sans document rattaché (ex. pensionsAlimentaires)', () => {
    const a = checkCoherence({ pensionsAlimentaires: true }, ['avis_ir']);
    expect(find(a, 'missing', 'pensionsAlimentaires')).toBeUndefined();
  });
});

describe('checkCoherence — non déclaré (détecté sans flag)', () => {
  it('alerte + propose d\'activer le module', () => {
    const a = checkCoherence({}, ['avis_ir', 'export_crypto']);
    const alert = find(a, 'undeclared', 'crypto');
    expect(alert).toBeTruthy();
    expect(alert.action).toEqual({ type: 'enableModule', flag: 'crypto' });
  });

  it('pas d\'alerte si le flag est déjà coché', () => {
    const a = checkCoherence({ crypto: true }, ['avis_ir', 'export_crypto']);
    expect(find(a, 'undeclared', 'crypto')).toBeUndefined();
  });

  it('une seule alerte par flag même avec plusieurs documents', () => {
    const a = checkCoherence({}, ['avis_ir', 'bail_quittances', 'declaration_foncier_n1']);
    expect(a.filter(x => x.kind === 'undeclared' && x.flag === 'foncier')).toHaveLength(1);
  });
});

describe('checkCoherence — profil cohérent', () => {
  it('ne renvoie aucune alerte quand tout concorde', () => {
    const a = checkCoherence(
      { crypto: true },
      ['avis_ir', 'export_crypto'],
    );
    expect(a).toEqual([]);
  });
});
