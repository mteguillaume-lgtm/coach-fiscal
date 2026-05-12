// Extraction structurée des données numériques depuis un profil fiscal .txt

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

export function parseProfileToFormData(profile) {
  if (!profile) return { data: {}, count: 0 };

  const data = {};
  let count  = 0;
  const set  = (key, val) => { if (val != null) { data[key] = val; count++; } };

  // ── Situation ────────────────────────────────────────────────────────────────
  if (/pacsé|pacs|marié|couple|déclarant 2|\bD2\b/i.test(profile)) {
    data.mode = 'couple'; count++;
  }

  set('parts',       f(profile, /parts?\s*fiscales?[^:\d\n]{0,20}[:\s]+(\d[\.,]?\d?)/i));
  set('departement', profile.match(/département[^:\d\n]{0,10}[:\s]+(\d{2,3})/i)?.[1] ?? null);

  // ── Revenus D1 ───────────────────────────────────────────────────────────────
  set('salaireD1',
    n(profile, /net\s+imposable[^D\n]{0,10}D1[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /1AJ[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /net\s+imposable\b[^D€\n]{0,40}(\d[\d\s]{2,10})\s*€/i)
  );
  set('pasD1',
    n(profile, /PAS\s+prélevé[^D\n]{0,10}D1[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /8HV[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /PAS\s+prélevé[^€\d]{0,40}(\d[\d\s]{2,10})\s*€/i)
  );
  set('tauxPasD1',
    f(profile, /taux\s+PAS[^D\n]{0,10}D1[^%\d]{0,10}(\d+[,\.]\d+)\s*%/i) ??
    f(profile, /taux\s+PAS[^%\d]{0,40}(\d+[,\.]\d+)\s*%/i)
  );
  set('peroD1',
    n(profile, /6QS[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /PERO[^D\n]{0,10}D1[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /cotisations?\s+PERO[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i)
  );

  // ── Revenus D2 ───────────────────────────────────────────────────────────────
  set('salaireD2',
    n(profile, /net\s+imposable[^D\n]{0,10}D2[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /1BJ[^€\d]{0,15}(\d[\d\s]{1,10})/i)
  );
  set('pasD2',
    n(profile, /PAS\s+prélevé[^D\n]{0,10}D2[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /8IV[^€\d]{0,15}(\d[\d\s]{1,10})/i)
  );
  set('tauxPasD2',
    f(profile, /taux\s+PAS[^D\n]{0,10}D2[^%\d]{0,10}(\d+[,\.]\d+)\s*%/i)
  );

  // ── Épargne ──────────────────────────────────────────────────────────────────
  const savings = [
    ['livretA',    /livret\s*a\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i],
    ['ldds',       /\bldds\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i],
    ['lep',        /\blep\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i],
    ['livretPlus', /livret[\s+][^€\n]{0,20}(\d[\d\s]{1,10})\s*€/i],
    ['pel',        /\bpel\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i],
    ['pea',        /\bpea\b[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i],
    ['av',         /assurance[- ]vie[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i],
    ['crypto',     /crypto[^€\n]{0,30}(\d[\d\s]{1,10})\s*€/i],
  ];
  for (const [key, rx] of savings) set(key, n(profile, rx));

  // ── Foncier ──────────────────────────────────────────────────────────────────
  set('loyersBruts',
    n(profile, /4BE[^€\d]{0,15}(\d[\d\s]{1,10})/i) ??
    n(profile, /loyers?\s+bruts?[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /fermage[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i)
  );

  // ── Fiscal calculé ───────────────────────────────────────────────────────────
  set('tmi',
    n(profile, /\btmi\b[^%\d]{0,15}(\d{1,2})\s*%/i)
  );
  set('plafondPerD1',
    n(profile, /plafond\s+disponible[^D\n]{0,10}D1[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /plafond\s+disponible[^€\d]{0,30}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /plafond\s+PER[^€\d]{0,30}(\d[\d\s]{1,10})\s*€/i)
  );
  set('plafondPerD2',
    n(profile, /plafond\s+disponible[^D\n]{0,10}D2[^€\d]{0,15}(\d[\d\s]{1,10})\s*€/i)
  );
  set('irNet',
    n(profile, /ir\s+net[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /impôt\s+net[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i) ??
    n(profile, /total\s+dû[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i)
  );
  set('remboursement',
    n(profile, /remboursement[^€\d]{0,20}(\d[\d\s]{1,10})\s*€/i)
  );

  console.log('[profileParser] Extraction :', count, 'champ(s)', data);
  return { data, count };
}
