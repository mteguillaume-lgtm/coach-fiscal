import fiscaliste from './skills/fiscaliste.md?raw';
import notaire from './skills/notaire.md?raw';
import comptable from './skills/comptable.md?raw';
import controleurFiscal from './skills/controleur-fiscal.md?raw';
import commissaire from './skills/commissaire-aux-comptes.md?raw';
import syndic from './skills/syndic.md?raw';
import gcp from './skills/gcp.md?raw';

export const SKILLS_MAP = {
  fiscaliste,
  notaire,
  comptable,
  'controleur-fiscal': controleurFiscal,
  'commissaire-aux-comptes': commissaire,
  syndic,
  gcp,
};

export const ALL_SKILLS = `## SKILL : Fiscaliste
${fiscaliste}

## SKILL : Notaire
${notaire}

## SKILL : Comptable
${comptable}

## SKILL : Contrôleur fiscal
${controleurFiscal}

## SKILL : Commissaire aux comptes
${commissaire}

## SKILL : Syndic
${syndic}

## SKILL : Gestionnaire de patrimoine
${gcp}`;
