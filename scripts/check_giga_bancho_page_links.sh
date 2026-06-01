#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/giga-bancho"

required_files=(
  "$APP_DIR/index.html"
  "$APP_DIR/privacy.html"
  "$APP_DIR/fgs-demo/foreground-service-demo.mp4"
  "$ROOT_DIR/assets/giga-bancho-icon.png"
  "$ROOT_DIR/assets/giga-bancho-feature.png"
  "$ROOT_DIR/assets/giga-bancho-check-phone.png"
)

required_index_links=(
  "noindex, nofollow"
  "https://beythstudio.com/giga-bancho/"
  "privacy.html"
  "fgs-demo/foreground-service-demo.mp4"
  "mailto:hello@beythstudio.com"
  "../assets/giga-bancho-icon.png"
  "../assets/giga-bancho-feature.png"
  "../assets/giga-bancho-check-phone.png"
)

required_privacy_text=(
  "noindex, nofollow"
  "https://beythstudio.com/giga-bancho/privacy.html"
  "ギガ番長（以下「本アプリ」）"
  "BEYTH STUDIO"
  "プライバシーポリシー"
  "SSID、BSSID"
  "収集、保存、外部送信しません"
  "端末内で利用"
  "通知判定"
  "ユーザー設定の保存"
  "広告SDK"
  "解析SDK"
  "クラッシュ解析SDK"
  "アンインストール"
  "サーバー上に保存されるユーザーデータはありません"
  "接続先をアプリが変更"
  "通信を制御"
  "hello@beythstudio.com"
)

hidden_from_homepage_text=(
  "giga-bancho"
  "ギガ番長"
  "jp.beyth.gigabancho"
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

check_text() {
  local file="$1"
  local text="$2"
  if grep -Fq "$text" "$file"; then
    printf '[OK]   text in %s -> %s\n' "$(basename "$file")" "$text"
    return 0
  fi

  printf '[FAIL] missing text in %s -> %s\n' "$(basename "$file")" "$text"
  return 1
}

check_absent_text() {
  local file="$1"
  local text="$2"
  local display_file="${file#$ROOT_DIR/}"
  if grep -Fq "$text" "$file"; then
    printf '[FAIL] hidden app exposed in %s -> %s\n' "$display_file" "$text"
    return 1
  fi

  printf '[OK]   hidden from %s -> %s\n' "$display_file" "$text"
  return 0
}

echo "=== Giga Bancho Page Check ==="
date '+Timestamp: %Y-%m-%d %H:%M:%S'
echo

for file in "${required_files[@]}"; do
  check_file "$file" || failed=1
done

for text in "${required_index_links[@]}"; do
  check_text "$APP_DIR/index.html" "$text" || failed=1
done

for text in "${required_privacy_text[@]}"; do
  check_text "$APP_DIR/privacy.html" "$text" || failed=1
done

while IFS= read -r public_file; do
  case "$public_file" in
    "$APP_DIR"/*)
      continue
      ;;
  esac

  for text in "${hidden_from_homepage_text[@]}"; do
    check_absent_text "$public_file" "$text" || failed=1
  done
done < <(
  find "$ROOT_DIR" \
    -type f \( -name '*.html' -o -name 'robots.txt' -o -name 'sitemap.xml' \) \
    -not -path "$ROOT_DIR/.git/*" \
    -not -path "$ROOT_DIR/node_modules/*" \
    | sort
)

video_size="$(wc -c < "$APP_DIR/fgs-demo/foreground-service-demo.mp4" 2>/dev/null || printf '0')"
if [[ "$video_size" -gt 102400 ]]; then
  printf '[OK]   video size -> %s bytes\n' "$video_size"
else
  printf '[FAIL] video too small -> %s bytes\n' "$video_size"
  failed=1
fi

echo
if [[ "$failed" -eq 0 ]]; then
  echo "Overall status: OK"
else
  echo "Overall status: FAIL"
  exit 1
fi
