// Extraction structurée des données depuis un profil fiscal .txt
// Convention : clés snake_case alignées sur Collect.jsx

function n(profile, rx) {
  const m = profile.match(rx);
  if (!m || !m[1]) return null;
  const v = parseInt(m[1].replace(/[\s.]/g, ''), 10);
  return isNaN(v) ? null : v;
}

function f(profile, rx) {
  const m = profile.match(rx);
  if (!m || !m[1]) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return isNaN(v) ? null : v;
}

/**
 * Extrait les données d'un profil fiscal texte.
 * Retourne { formData, d1Data, d2Data, mode, count }
 * alignés sur les clés Collect.jsx.
 */
export function parseProfileToFormData(profile) {
  if (!profile) return { formData: {}, d1Data: {}, d2Data: {}, mode: null, count: 0 };

  const formData = {};
  const d1Data   = {};
  const d2Data   = {};
  let count      = 0;
  let mode       = null;

  const setForm = (key, val) => { if (val != null) { formData[key] = val; count++; } };
  const setD1   = (key, val) => { if (val != null) { d1Data[key]   = val; count++; } };
  const setD2   = (key, val) => { if (val != null) { d2Data[key]   = val; count++; } };

  // ── Situation ────────────────────────────────────────────────────────────────
  if (/pacsé|pacs|marié|couple|déclarant 2|\bD2\b/i.test(profile)) {
    mode = 'couple';
  }

  setForm('parts', f(profile, /parts?\s*fiscales?[^:\d\n]{0,20}[:\s]+(\d[\.,]?\d?)/i));
  setForm('dept',  profile.match(/département[^:\d\n]{0,10}[:\s]+(\d{2,3})/i)?.[1] ?? null);

  // ── Revenus D1 → d1Data ──────────────────────────────────────────────────────
  setD1('net_imp',
    n(profile, /net\s+imposable[^D\n]{0,10}D1[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /1AJ[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /net\s+imposable\b[^D€\n]{0,40}(\d[\d\s]{2,10})\s*€/i)
  );
  setD1('pas_tot',
    n(profile, /PAS\s+prélevé[^D\n]{0,10}D1[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /8HV[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /PAS\s+prélevé[^€\d]{0,40}(\d[\d\s]{2,10})\s*€/i)
  );
  setD1('taux_pas',
    f(profile, /taux\s+PAS[^D\n]{0,10}D1[^%\d]{0,10}(\d+[,\.]\d+)\s*%/i) ??
    f(profile, /taux\s+PAS[^%\d]{0,40}(\d+[,\.]\d+)\s*%/i)
  );

  // ── PERO D1 → formData (champ de déduction, pas revenu individuel) ───────────
  setForm('pero_d1',
    n(profile, /6QS[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /PERO[^D\n]{0,10}D1[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /cotisations?\s+PERO[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i)
  );

  // ── Revenus D2 → d2Data ──────────────────────────────────────────────────────
  setD2('net_imp',
    n(profile, /net\s+imposable[^D\n]{0,10}D2[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /1BJ[^€\d]{0,15}(\d[\d\s]{1,10})/i)
  );
  setD2('pas_tot',
    n(profile, /PAS\s+prélevé[^D\n]{0,10}D2[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /8IV[^€\d]{0,15}(\d[\d\s]{1,10})/i)
  );
  setD2('taux_pas',
    f(profile, /taux\s+PAS[^D\n]{0,10}D2[^%\d]{0,10}(\d+[,\.]\d+)\s*%/i)
  );

  // ── Épargne individuelle → d1Data (ou formData en mode solo) ─────────────────
  const setEp = mode === 'couple' ? setD1 : setForm;

  setEp('livret_a',    n(profile, /livret\s*a\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));
  setEp('ldd',         n(profile, /\bldds?\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));
  setEp('lep',         n(profile, /\blep\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));
  setEp('livret_plus', n(profile, /livret\s*\+[^€\n]{0,20}(\d[\d\s]{1,10})\s*€/i));
  setEp('pel',         n(profile, /\bpel\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));
  setEp('pea',         n(profile, /\bpea\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));
  setEp('av',          n(profile, /assurance[- ]vie[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));
  setEp('crypto_wallet', n(profile, /crypto[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));

  // PER individuel → d1Data (epargne)
  setEp('per', n(profile, /\bper\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i));

  // ── Foncier → formData ────────────────────────────────────────────────────────
  setForm('foncier',
    n(profile, /4BE[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /loyers?\s+bruts?[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /fermage[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i)
  );

  // ── Revenus foyer couple → formData ──────────────────────────────────────────
  setForm('divid',  n(profile, /dividendes?[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i));
  setForm('crypto', n(profile, /plus-values?\s+crypto[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i));

  console.log('[profileParser] Extraction :', count, 'champ(s)', { formData, d1Data, d2Data, mode });
  return { formData, d1Data, d2Data, mode, count };
}
