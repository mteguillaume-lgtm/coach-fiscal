#!/usr/bin/env bash
# sync-skills.sh — Synchronise src/data/skills/*.md depuis _sources/paperasse/*/SKILL.md
#
# Usage : npm run sync:skills
#
# IMPORTANT : ne touche PAS à src/data/skills/gcp.md
#   → le skill GCP est spécifique à kapio, il n'a pas d'équivalent dans paperasse.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/_sources/paperasse"
DST="$REPO_ROOT/src/data/skills"

if [ ! -d "$SRC" ]; then
  echo "❌  _sources/paperasse/ introuvable. Vérifiez que le dépôt paperasse est cloné dans _sources/."
  exit 1
fi

declare -A SKILL_MAP=(
  [fiscaliste]="fiscaliste"
  [comptable]="comptable"
  [notaire]="notaire"
  [controleur-fiscal]="controleur-fiscal"
  [commissaire-aux-comptes]="commissaire-aux-comptes"
  [syndic]="syndic"
)

echo "🔄  Sync skills : _sources/paperasse/*/SKILL.md → src/data/skills/"

for skill in "${!SKILL_MAP[@]}"; do
  src_file="$SRC/$skill/SKILL.md"
  dst_file="$DST/${SKILL_MAP[$skill]}.md"

  if [ ! -f "$src_file" ]; then
    echo "  ⚠️  $skill/SKILL.md introuvable — ignoré"
    continue
  fi

  cp "$src_file" "$dst_file"
  echo "  ✓  $skill → src/data/skills/${SKILL_MAP[$skill]}.md"
done

echo ""
echo "  ℹ️  src/data/skills/gcp.md non touché (skill spécifique kapio)"
echo ""
echo "✅  Sync terminé. Vérifiez les changements avec :"
echo "    git diff src/data/skills/"
echo ""
echo "⚠️  Pensez à relancer npm test pour valider."
