# Deprecation Guard Operations

## 目的
- ランタイム廃止・依存非推奨・deprecated API をリリース前に検知する。
- 「壊れてから直す」ではなく、毎週・毎PRで先回りして潰す。

## 追加されるファイル
- `scripts/check_deprecation_health.sh`
- `.github/workflows/deprecation-guard.yml`
- `scripts/install_deprecation_guard_template.sh`

## ローカル実行
```bash
./scripts/check_deprecation_health.sh
```

終了コード:
- `0`: OK
- `1`: WARN
- `2`: CRITICAL

## 何をチェックするか
- `firebase.json` の Functions runtime（`nodejs16/18/20` を検知）
- `package.json` の `engines.node`
- `firebase-functions` の major version
- `flutter analyze` の `deprecated_member_use`
- `flutter pub outdated` の `discontinued` パッケージ
- オプション: 本番 Functions runtime（`DEPRECATION_CHECK_REMOTE_FUNCTIONS=1`）

## 全プロジェクト展開
このリポジトリのテンプレを他リポジトリへ配布する:

```bash
./scripts/install_deprecation_guard_template.sh \
  /path/to/repo-a \
  /path/to/repo-b \
  /path/to/repo-c
```

配布先で実施すること:
- `./scripts/check_deprecation_health.sh` を実行
- 必要なアップグレードを反映
- テンプレファイルをコミット

## 推奨運用
- PRごとに GitHub Actions の `Deprecation Guard` を通す。
- 週次の schedule 実行結果を確認し、WARN を翌週に持ち越さない。
- Firebase Functions の runtime は `nodejs22` を基準に維持する。

