// Port de DEFAULT_PATTERNS + build_patterns() depuis PDF_Anonymiseur_v8/app.py
// Flags JS équivalents : re.IGNORECASE | re.MULTILINE → 'gim'
// Les patterns sont appliqués ligne par ligne (comme build_lines() → find_zones() en Python)

/**
 * Équivalent de re.escape() Python.
 * Échappe tous les caractères spéciaux regex dans une chaîne.
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Zone fixe du logo employeur (page -1 = toutes les pages).
 * Format : { page, x0, top, x1, bottom } en coordonnées top-origin.
 * Source Python : LOGO_ZONE = (-1, 370, 5, 592, 110)
 */
export const LOGO_ZONE = { page: -1, x0: 370, top: 5, x1: 592, bottom: 110 };

/**
 * Port exact de build_patterns(prenom, nom, employeur) de app.py.
 * Retourne un tableau de patterns :
 *   { label, pattern, group, enabled, dyn, fixed }
 */
export function buildPatterns(prenom = '', nom = '', employeur = '') {
  const P = [];

  function add(label, pattern, group, enabled = true, dyn = false) {
    P.push({ label, pattern, group, enabled, dyn, fixed: false });
  }

  // ── Identité ────────────────────────────────────────────────────
  if (nom)
    add('Nom du salarié',    `(${escapeRegex(nom)})`,    'identite', true, true);
  if (prenom)
    add('Prénom du salarié', `(${escapeRegex(prenom)})`, 'identite', true, true);
  if (prenom && nom) {
    add('Prénom + Nom',
      `(${escapeRegex(prenom)}\\s+${escapeRegex(nom)})`,
      'identite', true, true);
    add('Civilité + Nom',
      `(?:M\\.|Mme\\.?|Mr\\.?)\\s+(${escapeRegex(nom)})`,
      'identite', true, true);
  }
  add('Destinataire', '(?:Destinataire\\s*:\\s*)(.+)', 'identite');

  // ── Employeur ────────────────────────────────────────────────────
  if (employeur)
    add("Nom de l'employeur", `(${escapeRegex(employeur)})`, 'employeur', true, true);
  add('Établissement', '(?:Etablissement|Établissement)\\s*[:\\s]+(.+)', 'employeur');
  add('URSSAF',        '(URSSAF\\s+\\w[\\w\\s\\-]{2,30})',               'employeur');

  // ── Numéro de sécurité sociale ───────────────────────────────────
  add('N° SS (Schneider)', '(\\d{13}/\\d{2}\\s+[A-Z]{3})',              'nss');
  add('NIR (métadonnées)', 'NIR=(\\d[\\d\\.]{12,16})',                   'nss');
  add('N° orga sociale',   '^(\\d{13,14})$',                              'nss');
  add('N° SS (standard)',
    '(\\b[12]\\s?\\d{2}[\\s\\-]?\\d{2}[\\s\\-]?\\d{2,3}[\\s\\-]?\\d{3}[\\s\\-]?\\d{3}[\\s\\-]?\\d{2}\\b)',
    'nss');
  add('N° SS (label)', 'N°\\s*SS\\s*[:\\s]+(.+)',                        'nss');
  add('N° INSEE',      '(?:N°|numéro)\\s*INSEE\\s*[:\\s]*(.+)',          'nss');
  add('INSEE (ligne)', '(?:INSEE)\\s*:\\s*(.+)',                          'nss');

  // ── Admin ────────────────────────────────────────────────────────
  add('SIRET',             '(?:SIRET\\s*[:\\s]*)?(\\b\\d{14}\\b)',            'admin');
  add('NUMCONTRAT',        'NUMCONTRAT=(\\d[\\d\\-]{4,20})',                  'admin');
  add('Code NAF / APE',    '(?:Code\\s+NAF\\s*[:\\s]*)?(\\b\\d{4}[A-Z]\\b)', 'admin');
  add('N° orga (long)',    '(\\b\\d{17,19}\\b)',                               'admin');
  add('Ligne métadonnées', '(DATEDEBUT=.+)',                                   'admin');

  // ── Adresse ──────────────────────────────────────────────────────
  add('Adresse (label)',
    '(?:Adresse|Domicile|Demeurant|Résidence)\\s*:\\s*(.+)',
    'adresse');
  add('Numéro + rue',
    '(\\d{1,4}\\s*,?\\s*(?:rue|avenue|boulevard|bd|allée|impasse|chemin|place|voie|route|résidence|lotissement)\\s+[^\\d\\n]{3,50})',
    'adresse');
  add('Code postal + ville',
    '(\\b\\d{5}[,\\s]+[A-ZÉÈÀa-zéèà][A-Za-zéèàâùîôê\\-\\s]{1,30}\\b)',
    'adresse');

  // ── Banque ───────────────────────────────────────────────────────
  add('IBAN', '(FR\\d{2}[\\s\\d]{15,32})',                       'banque');
  add('BIC',  '(\\b[A-Z]{4}FR[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b)', 'banque');

  // ── Salaires ─────────────────────────────────────────────────────
  add('Salaire de base',
    '(?:SALAIRE\\s+DE\\s+BASE|Salaire\\s+(?:mensuel\\s+)?de\\s+base)\\s*[:\\s]*([\\d\\s,\\.]+)',
    'salaire');
  add('Total brut',
    '(?:TOTAL\\s+BRUT|Salaire\\s+[Bb]rut|Brut\\s+total)\\s*[:\\s]*([\\d\\s,\\.]+)',
    'salaire');
  add('Net à payer',
    '(?:Net\\s+à\\s+payer(?:\\s+au\\s+salarié)?|NET\\s+À\\s+PAYER[^I]*)\\s*([\\d\\s,\\.]+(?:\\s*Eur)?)',
    'salaire');
  add('Net imposable',
    '(?:Net\\s+[Ii]mposable)\\s*[:\\s]*([\\d\\s,\\.]+)',
    'salaire');

  // ── Logo (zone fixe, pas de regex) ───────────────────────────────
  P.push({
    label: 'Logo employeur',
    pattern: '__logo__',
    group: 'employeur',
    enabled: true,
    dyn: false,
    fixed: true,
  });

  return P;
}

/**
 * Applique un filtre enabledLabels sur un tableau de patterns (comme apply_enabled()).
 * @param {object[]} patterns
 * @param {string[]|null} enabledLabels - null = tout activer
 */
export function applyEnabledLabels(patterns, enabledLabels) {
  if (enabledLabels === null) return patterns;
  return patterns.map(p => ({ ...p, enabled: enabledLabels.includes(p.label) }));
}
