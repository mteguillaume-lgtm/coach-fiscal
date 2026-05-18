#!/usr/bin/env bash
# sync-paperasse.sh — Synchronise src/data/paperasse/ depuis _sources/paperasse/
#
# Usage : npm run sync:paperasse
# Pré-requis : rsync installé (standard sur macOS/Linux)
#
# CE QUI EST COPIÉ : data/ et references/ de chaque skill
# CE QUI N'EST PAS COPIÉ : SKILL.md (géré dans src/data/skills/ via sync-skills.sh),
#   evals/, templates/, scripts/, .git/, package.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/_sources/paperasse"
DST="$REPO_ROOT/src/data/paperasse"

if [ ! -d "$SRC" ]; then
  echo "❌  _sources/paperasse/ introuvable. Vérifiez que le dépôt paperasse est cloné dans _sources/."
  exit 1
fi

SKILLS=(fiscaliste comptable notaire controleur-fiscal commissaire-aux-comptes syndic)

echo "🔄  Sync paperasse : $SRC → $DST"

for skill in "${SKILLS[@]}"; do
  src_skill="$SRC/$skill"

  if [ -d "$src_skill/data" ]; then
    mkdir -p "$DST/$skill/data"
    rsync -a --delete "$src_skill/data/" "$DST/$skill/data/"
    echo "  ✓  $skill/data/"
  fi

  if [ -d "$src_skill/references" ]; then
    mkdir -p "$DST/$skill/references"
    rsync -a --delete "$src_skill/references/" "$DST/$skill/references/"
    echo "  ✓  $skill/references/"
  fi
done

echo ""
echo "✅  Sync terminé. Vérifiez les changements avec :"
echo "    git diff src/data/paperasse/"
echo ""
echo "⚠️  Pensez à relancer npm test pour valider."
