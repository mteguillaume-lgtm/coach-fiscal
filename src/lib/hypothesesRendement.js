// Hypothèses de RENDEMENT (non fiscales) utilisées pour chiffrer les gains
// indicatifs des leviers d'épargne (parser + opportunitiesDetector).
// Centralisées ici pour être ajustées en un seul endroit. Ce ne sont PAS des
// paramètres fiscaux : ceux-là vivent dans src/data/paperasse/ (paperasse-first).

export const RDT_LIVRET_A          = 0.03;   // taux Livret A / LDDS
export const RDT_LIVRET_PLUS_PROMO = 0.07;   // livret bancaire « boosté » (promo) — gain différentiel parser

// Gains DIFFÉRENTIELS nets estimés vs livret bancaire ~1,5 % (déjà nettés,
// valeurs historiques du detector — comportement inchangé) :
export const GAIN_DIFF_LDDS   = 0.015;  // 3 % vs ~1,5 %
export const GAIN_DIFF_LEP    = 0.035;  // ~5 % vs ~1,5 %
export const GAIN_DIFF_AV_LT  = 0.028;  // AV multisupport ~4 % net long terme
export const GAIN_DIFF_PEA_LT = 0.045;  // PEA ETF Monde ~6 % long terme, net estimé
export const GAIN_DIFF_DEFAUT = 0.03;   // surplus non alloué (AV/PEA selon profil)
