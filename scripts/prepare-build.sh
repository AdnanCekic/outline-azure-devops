#!/usr/bin/env bash
# Bereitet einen sauberen Outline-Quellbaum für den Image-Build vor (ohne Symlink, ohne yarn install).
# Wird vom GitHub-Actions-Workflow genutzt, funktioniert aber auch lokal.
#
# Nutzung: ./scripts/prepare-build.sh <zielordner>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/OUTLINE_VERSION")"
TARGET="${1:?Zielordner angeben}"

rm -rf "$TARGET"
git init -q "$TARGET"
git -C "$TARGET" remote add origin https://github.com/outline/outline.git
git -C "$TARGET" fetch -q --depth 1 origin "$VERSION"
git -C "$TARGET" checkout -q FETCH_HEAD

for patch in "$ROOT"/patches/*.patch; do
  git -C "$TARGET" apply "$patch"
done

cp -r "$ROOT/plugin" "$TARGET/plugins/azuredevops"
echo "Outline $VERSION mit Azure-DevOps-Plugin liegt in $TARGET"
