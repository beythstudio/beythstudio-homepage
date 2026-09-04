#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/giga-bancho"

required_files=(
  "$APP_DIR/index.html"
  "$APP_DIR/support.html"
  "$APP_DIR/privacy.html"
  "$APP_DIR/tokusho.html"
  "$APP_DIR/licenses.html"
  "$APP_DIR/fgs-demo/foreground-service-demo.mp4"
  "$ROOT_DIR/assets/giga-bancho-icon.png"
  "$ROOT_DIR/assets/giga-bancho-feature.png"
  "$ROOT_DIR/assets/giga-bancho-check-phone.png"
)

required_index_text=(
  "https://beythstudio.com/giga-bancho/"
  "support.html"
  "privacy.html"
  "tokusho.html"
  "licenses.html"
  "MOBILE APP SUPPORT"
  "Androidの通信量アラート"
  "iOSの回線状態見張り"
  "fgs-demo/foreground-service-demo.mp4"
  "../assets/giga-bancho-icon.png"
  "../assets/giga-bancho-feature.png"
  "../assets/giga-bancho-check-phone.png"
)

required_support_text=(
  "https://beythstudio.com/giga-bancho/support.html"
  "ギガ番長 サポート"
  "hello@beythstudio.com"
  "BEYTH STUDIO / Takuya Hatanaka"
  "1841-81 Sueda"
  "電話番号"
  "購入を復元"
  "Screen Time"
  "見張りを許可"
  "見張る対象を選ぶ"
  "VPN、パケット解析"
  "privacy.html"
  "tokusho.html"
  "licenses.html"
)

required_privacy_text=(
  "noindex, nofollow"
  "https://beythstudio.com/giga-bancho/privacy.html"
  "ギガ番長（以下「本アプリ」）"
  "BEYTH STUDIO"
  "プライバシーポリシー"
  "Android向けアプリ"
  "iPhone/iPad"
  "Screen Time"
  "FamilyControls / ManagedSettings"
  "バイト単位の通信量増加"
  "Google Mobile Ads SDK"
  "App Store"
  "Google Play"
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

required_tokusho_text=(
  "noindex, nofollow"
  "https://beythstudio.com/giga-bancho/tokusho.html"
  "特定商取引法に基づく表記"
  "BEYTH STUDIO"
  "代表 Takuya Hatanaka"
  "hello@beythstudio.com"
  "App Store"
  "Google Play"
  "広告解除"
  "返品・キャンセル・返金"
  "privacy.html"
  "licenses.html"
)

required_licenses_text=(
  "noindex, nofollow"
  "https://beythstudio.com/giga-bancho/licenses.html"
  "ライセンス"
  "AndroidX"
  "Jetpack Compose"
  "Kotlin"
  "Google Play Billing Library"
  "Google Mobile Ads SDK"
  "SwiftUI"
  "StoreKit"
  "FamilyControls / ManagedSettings"
  "Apache License 2.0"
  "privacy.html"
  "tokusho.html"
)

required_homepage_text=(
  'id="giga-bancho"'
  "ギガ番長"
  "assets/giga-bancho-icon.png"
  "https://play.google.com/store/apps/details?id=jp.beyth.yokeinaosewifi"
  "Android版 配信中"
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

echo "=== Giga Bancho Page Check ==="
date '+Timestamp: %Y-%m-%d %H:%M:%S'
echo

for file in "${required_files[@]}"; do
  check_file "$file" || failed=1
done

for text in "${required_index_text[@]}"; do
  check_text "$APP_DIR/index.html" "$text" || failed=1
done

for text in "${required_support_text[@]}"; do
  check_text "$APP_DIR/support.html" "$text" || failed=1
done

for text in "${required_privacy_text[@]}"; do
  check_text "$APP_DIR/privacy.html" "$text" || failed=1
done

for text in "${required_tokusho_text[@]}"; do
  check_text "$APP_DIR/tokusho.html" "$text" || failed=1
done

for text in "${required_licenses_text[@]}"; do
  check_text "$APP_DIR/licenses.html" "$text" || failed=1
done

for text in "${required_homepage_text[@]}"; do
  check_text "$ROOT_DIR/index.html" "$text" || failed=1
done

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
