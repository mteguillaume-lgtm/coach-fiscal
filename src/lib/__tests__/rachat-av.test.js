import { describe, it, expect } from 'vitest';
import {
  calcRachatAV, AV_ABATTEMENT_8ANS_SOLO, AV_ABATTEMENT_8ANS_COUPLE,
  AV_TAUX_IR_APRES_8ANS, PFU_TAUX_IR, TAUX_PS_CAPITAL,
} from '../taxCalculator';
import { buildProfile } from '../profileGenerator';
import { parseProfile } from '../profileParser';
import { computeFoyerSummary } from '../taxCalculator';

describe('calcRachatAV — rachats AV (cases 2CG/2BH)', () => {
  it('≥ 8 ans, gains sous l\'abattement solo : IR nul, PS sur les gains pleins', () => {
    const r = calcRachatAV({ gainsRachat: 3_000, contratHuitAns: true, rniFoyer: 40_000, parts: 1 });
    expect(r.abattement).toBe(AV_ABATTEMENT_8ANS_SOLO);      // 4 600
    expect(r.baseIR).toBe(0);
    expect(r.ir).toBe(0);
    expect(r.ps).toBe(Math.round(3_000 * TAUX_PS_CAPITAL));
    expect(r.case2042).toBe('2CG');
  });

  it('≥ 8 ans, gains au-dessus de l\'abattement : IR = (gains − abatt) × 7,5 %', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: true, rniFoyer: 40_000, parts: 1 });
    expect(r.baseIR).toBe(10_000 - AV_ABATTEMENT_8ANS_SOLO);         // 5 400
    expect(r.ir).toBe(Math.round(5_400 * AV_TAUX_IR_APRES_8ANS));    // 405
    expect(r.total).toBe(r.ir + r.ps);
  });

  it('couple : abattement 9 200 €', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: true, isCouple: true, rniFoyer: 60_000, parts: 2 });
    expect(r.abattement).toBe(AV_ABATTEMENT_8ANS_COUPLE);
    expect(r.baseIR).toBe(800);
  });

  it('< 8 ans : PFU 12,8 % sans abattement', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: false, rniFoyer: 40_000, parts: 1 });
    expect(r.abattement).toBe(0);
    expect(r.ir).toBe(Math.round(10_000 * PFU_TAUX_IR));    // 1 280
    expect(r.tauxIR).toBe(PFU_TAUX_IR);
  });

  it('arbitrage barème gagnant à TMI faible (RNI 12 000, ≥ 8 ans)', () => {
    const r = calcRachatAV({ gainsRachat: 10_000, contratHuitAns: true, rniFoyer: 12_000, parts: 1 });
    expect(r.bareme.recommande).toBe('bareme');
    expect(r.bareme.total).toBeLessThanOrEqual(r.total);
  });

  it('flag > 150 000 € de versements foyer', () => {
    const r = calcRachatAV({ gainsRachat: 5_000, contratHuitAns: true, primesNettesFoyer: 200_000, rniFoyer: 40_000, parts: 1 });
    expect(r.flags.primesSuperieur150k).toBe(true);
  });

  it('gains 0 → tout nul', () => {
    const r = calcRachatAV({ gainsRachat: 0, contratHuitAns: true });
    expect(r.total).toBe(0);
  });
});


describe('Rachat AV — chaîne complète form → summary', () => {
  it('≥ 8 ans : IR + PS du rachat entrent dans le total dû + cases 2CG/2BH', () => {
    const profile = buildProfile(
      { statut: 'Célibataire', net_imp: '40000', av: '80000', av_rachat_gains: '10000', av_rachat_8ans: 'Oui' },
      {}, {}, [], false,
    );
    expect(profile).toContain('Rachat AV');
    const parsed = parseProfile(profile);
    expect(parsed.avRachatGains).toBe(10_000);
    expect(parsed.avRachat8ans).toBe(true);
    expect(parsed.avRachatIR).toBeGreaterThan(0);
    const s = computeFoyerSummary(parsed);
    const psRachat = Math.round(10_000 * TAUX_PS_CAPITAL);
    expect(s.totalDu).toBe(s.irNet + s.cehr + s.psFoncier + s.psImmo + s.pvCapitalIR + s.psCapital + parsed.avRachatIR + psRachat);
  });

  it('sans rachat : aucun champ av rachat, comportement inchangé', () => {
    const parsed = parseProfile(buildProfile({ statut: 'Célibataire', net_imp: '40000' }, {}, {}, [], false));
    expect(parsed.avRachatIR ?? 0).toBe(0);
  });
});
