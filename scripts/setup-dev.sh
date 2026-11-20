#!/usr/bin/env bash
# Holt Outline in der Version aus OUTLINE_VERSION nach ./outline, spielt den Patch ein,
# verlinkt das Plugin nach outline/plugins/azuredevops und installiert die Abhängigkeiten.
#
# Nutzung: ./scripts/setup-dev.sh            (erstmalig oder nach Versionswechsel)
#          ./scripts/setup-dev.sh --copy     (Plugin kopieren statt verlinken, siehe CLAUDE.md)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/OUTLINE_VERSION")"
OUTLINE="$ROOT/outline"
MODE="${1:-}"

if [[ ! -d "$OUTLINE/.git" ]]; then
  echo ">> Klone Outline"
  git clone https://github.com/outline/outline.git "$OUTLINE"
fi

cd "$OUTLINE"
echo ">> Checke Outline $VERSION aus"
git fetch --tags origin
git checkout -f "$VERSION"
git clean -fd -e node_modules -e .env

echo ">> Spiele Patches ein"
for patch in "$ROOT"/patches/*.patch; do
  git apply "$patch"
done

rm -rf "$OUTLINE/plugins/azuredevops"
if [[ "$MODE" == "--copy" ]]; then
  echo ">> Kopiere Plugin"
  cp -r "$ROOT/plugin" "$OUTLINE/plugins/azuredevops"
else
  echo ">> Verlinke Plugin"
  ln -s "$ROOT/plugin" "$OUTLINE/plugins/azuredevops"
fi

echo ">> Installiere Abhängigkeiten"
corepack enable
yarn install

echo
echo "Fertig. Prüfen im Ordner outline:"
echo "  yarn tsc"
echo "  yarn oxlint --type-aware plugins/azuredevops"
echo "  yarn test plugins/azuredevops"
