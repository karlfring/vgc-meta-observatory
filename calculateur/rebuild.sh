#!/usr/bin/env bash
# Reconstruit le calculateur de dégâts à partir d'un clone du Nimbasa City Post VGC Damage Calculator, puis vérifie
# sur plusieurs centaines de duels que le moteur empaqueté donne exactement les résultats de la page d'origine.
#
# Usage : calculateur/rebuild.sh <clone de NCP-VGC-Damage-Calculator>
# Prérequis : Node.js 18 ou plus et Python 3 ; dans calculateur/ : npm install, puis npx playwright install chromium.
# S'arrête au premier écart : dist/ peut alors contenir une version non vérifiée, à ne pas publier.
set -euo pipefail

if [ $# -ne 1 ] || [ ! -f "$1/script_res/damage_SV.js" ]; then
  echo "Usage : $0 <clone de NCP-VGC-Damage-Calculator>" >&2
  exit 2
fi
NCP="$(cd "$1" && pwd)"
ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(dirname "$ICI")"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT
JEUX="courants aleatoires reglages"

echo "1/6 Données du mode Champions"
node "$ICI/build/extract_data.js" "$NCP" "$ICI/dist/champions_data.json"

echo "2/6 Moteur empaqueté"
node "$ICI/build/build_engine.js" "$NCP" "$ICI/dist/champions_data.json" "$ICI/dist/calc-moteur.js"

echo "3/6 Duels de vérification, à partir des sets du dernier mois"
python3 "$ICI/verify/make_matchups.py" "$RACINE/data/dashboard/builds.json" "$RACINE/data/dashboard/pokemon.json" \
  "$ICI/dist/champions_data.json" "$TRAVAIL/courants.duels.json"
python3 "$ICI/verify/make_random.py" "$RACINE/data/dashboard/builds.json" "$RACINE/data/dashboard/pokemon.json" \
  "$ICI/dist/champions_data.json" "$TRAVAIL/aleatoires.duels.json"
python3 "$ICI/verify/make_settings.py" "$ICI/dist/champions_data.json" "$TRAVAIL/reglages.duels.json"

echo "4/6 Comparaison avec la page d'origine"
for jeu in $JEUX; do
  node "$ICI/verify/run_original.js" "$NCP" "$TRAVAIL/$jeu.duels.json" "$TRAVAIL/$jeu.origine.json"
  node "$ICI/verify/run_engine.js" "$ICI/dist/calc-moteur.js" "$ICI/dist/champions_data.json" \
    "$TRAVAIL/$jeu.duels.json" "$TRAVAIL/$jeu.moteur.json"
  python3 "$ICI/verify/compare.py" "$TRAVAIL/$jeu.origine.json" "$TRAVAIL/$jeu.moteur.json"
done

echo "5/6 Mode strict et variables globales"
node "$ICI/verify/strict_check.js" "$ICI/dist/calc-moteur.js" "$ICI/dist/champions_data.json" "$TRAVAIL"/*.duels.json

echo "6/6 Références des tests de non-régression"
for jeu in $JEUX; do
  gzip -9 -n -c "$TRAVAIL/$jeu.duels.json" > "$ICI/tests/reference/$jeu.duels.json.gz"
  gzip -9 -n -c "$TRAVAIL/$jeu.origine.json" > "$ICI/tests/reference/$jeu.origine.json.gz"
done

echo "Terminé : dist/ est vérifié. Pour le mettre en ligne, voir « Publier dans le tableau de bord » dans calculateur/README.md."
