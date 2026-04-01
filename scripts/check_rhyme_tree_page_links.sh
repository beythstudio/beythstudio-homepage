#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RHYME_TREE_DIR="$ROOT_DIR/rhyme-tree"

required_files=(
  "$RHYME_TREE_DIR/index.html"
  "$RHYME_TREE_DIR/privacy.html"
  "$RHYME_TREE_DIR/terms.html"
  "$RHYME_TREE_DIR/tokusho.html"
  "$RHYME_TREE_DIR/external-data-policy.html"
  "$RHYME_TREE_DIR/support.html"
)

required_index_links=(
  "https://apps.apple.com/jp/app/%E3%83%A9%E3%82%A4%E3%83%A0%E3%81%AE%E6%9C%A8/id6759488302?uo=4"
  "https://play.google.com/store/apps/details?id=com.beythstudio.rhymetree"
  "privacy.html"
  "terms.html"
  "tokusho.html"
  "external-data-policy.html"
  "support.html"
  "https://rhyme-tree-prod.web.app/delete-account.html"
)

failed=0

check_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    printf '[OK]   file exists -> %s\n' "$file"
    return 0
  fi

  printf '[FAIL] missing file -> %s\n' "$file"
  return 1
}

check_link() {
  local file="$1"
  local href="$2"
  if grep -Fq "$href" "$file"; then
    printf '[OK]   link in %s -> %s\n' "$(basename "$file")" "$href"
    return 0
  fi

  printf '[FAIL] missing link in %s -> %s\n' "$(basename "$file")" "$href"
  return 1
}

echo "=== Rhyme-Tree Page Link Check ==="
date '+Timestamp: %Y-%m-%d %H:%M:%S'
echo

for file in "${required_files[@]}"; do
  check_file "$file" || failed=1
done

for href in "${required_index_links[@]}"; do
  check_link "$RHYME_TREE_DIR/index.html" "$href" || failed=1
done

echo
if [[ "$failed" -eq 0 ]]; then
  echo "Overall status: OK"
else
  echo "Overall status: FAIL"
  exit 1
fi
