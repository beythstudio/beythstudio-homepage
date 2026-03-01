#!/usr/bin/env bash
set -euo pipefail

# Exit code policy:
#   0: OK
#   1: WARN
#   2: CRITICAL

warning_count=0
critical_count=0
skip_count=0

has_command() {
  command -v "$1" >/dev/null 2>&1
}

mark_warn() {
  warning_count=$((warning_count + 1))
}

mark_critical() {
  critical_count=$((critical_count + 1))
}

mark_skip() {
  skip_count=$((skip_count + 1))
}

report() {
  local label="$1"
  local value="$2"
  local status="$3"
  printf "%-46s %-28s [%s]\n" "$label" "$value" "$status"
}

extract_first_integer() {
  local raw="$1"
  local result=""
  if has_command rg; then
    result="$(printf '%s' "$raw" | rg -o '[0-9]+' -N | head -n 1 || true)"
  else
    result="$(printf '%s' "$raw" | grep -Eo '[0-9]+' | head -n 1 || true)"
  fi
  printf '%s' "$result"
}

list_package_json_files() {
  if has_command rg; then
    rg --files -g '**/package.json' -g '!**/node_modules/**' | sort
    return
  fi

  find . -type f -name package.json -not -path '*/node_modules/*' | sed 's#^\./##' | sort
}

read_node_engine_from_package_json() {
  local file="$1"
  if ! has_command node; then
    printf ''
    return
  fi

  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const value = j?.engines?.node;
    if (value) process.stdout.write(String(value));
  ' "$file" 2>/dev/null || true
}

read_firebase_functions_version_from_package_json() {
  local file="$1"
  if ! has_command node; then
    printf ''
    return
  fi

  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const dep = j?.dependencies?.["firebase-functions"];
    const devDep = j?.devDependencies?.["firebase-functions"];
    const value = dep || devDep;
    if (value) process.stdout.write(String(value));
  ' "$file" 2>/dev/null || true
}

check_firebase_runtime() {
  local file="firebase.json"
  if [[ ! -f "$file" ]]; then
    report "Firebase runtime (firebase.json)" "not found" "SKIP"
    mark_skip
    return
  fi

  local runtimes
  runtimes="$(
    if has_command rg; then
      rg -o '"runtime"[[:space:]]*:[[:space:]]*"nodejs[0-9]+"' "$file" \
        | sed -E 's/.*"(nodejs[0-9]+)".*/\1/' \
        | sort -u
    else
      grep -Eo '"runtime"[[:space:]]*:[[:space:]]*"nodejs[0-9]+"' "$file" \
        | sed -E 's/.*"(nodejs[0-9]+)".*/\1/' \
        | sort -u
    fi
  )"

  if [[ -z "$runtimes" ]]; then
    report "Firebase runtime (firebase.json)" "runtime not explicitly set" "WARN"
    mark_warn
    return
  fi

  local worst="OK"
  local rt
  while IFS= read -r rt; do
    [[ -z "$rt" ]] && continue
    local major="${rt#nodejs}"
    if [[ "$major" =~ ^[0-9]+$ ]]; then
      if (( major <= 18 )); then
        worst="CRITICAL"
      elif (( major == 20 )); then
        if [[ "$worst" != "CRITICAL" ]]; then
          worst="CRITICAL"
        fi
      elif (( major == 21 )); then
        if [[ "$worst" == "OK" ]]; then
          worst="WARN"
        fi
      fi
    fi
  done <<<"$runtimes"

  if [[ "$worst" == "CRITICAL" ]]; then
    report "Firebase runtime (firebase.json)" "$(echo "$runtimes" | tr '\n' ',' | sed 's/,$//')" "CRITICAL"
    mark_critical
    return
  fi
  if [[ "$worst" == "WARN" ]]; then
    report "Firebase runtime (firebase.json)" "$(echo "$runtimes" | tr '\n' ',' | sed 's/,$//')" "WARN"
    mark_warn
    return
  fi

  report "Firebase runtime (firebase.json)" "$(echo "$runtimes" | tr '\n' ',' | sed 's/,$//')" "OK"
}

check_node_engine_constraints() {
  local files
  files="$(list_package_json_files || true)"
  if [[ -z "$files" ]]; then
    report "Node engines in package.json" "package.json not found" "SKIP"
    mark_skip
    return
  fi

  if ! has_command node; then
    report "Node engines in package.json" "node command not found" "SKIP"
    mark_skip
    return
  fi

  local warn_files=()
  local critical_files=()
  local checked_count=0
  local file
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    local node_engine
    node_engine="$(read_node_engine_from_package_json "$file")"
    if [[ -z "$node_engine" ]]; then
      continue
    fi
    checked_count=$((checked_count + 1))
    local major
    major="$(extract_first_integer "$node_engine")"
    if [[ -z "$major" ]]; then
      warn_files+=("$file(node:$node_engine)")
      continue
    fi

    if (( major <= 18 )); then
      critical_files+=("$file(node:$node_engine)")
      continue
    fi
    if (( major == 20 || major == 21 )); then
      warn_files+=("$file(node:$node_engine)")
      continue
    fi
  done <<<"$files"

  if (( checked_count == 0 )); then
    report "Node engines in package.json" "engines.node not declared" "WARN"
    mark_warn
    return
  fi

  if (( ${#critical_files[@]} > 0 )); then
    report "Node engines in package.json" "${#critical_files[@]} file(s) outdated" "CRITICAL"
    mark_critical
    printf "  - %s\n" "${critical_files[@]}"
    if (( ${#warn_files[@]} > 0 )); then
      printf "  - %s\n" "${warn_files[@]}"
      mark_warn
    fi
    return
  fi

  if (( ${#warn_files[@]} > 0 )); then
    report "Node engines in package.json" "${#warn_files[@]} file(s) near EOL" "WARN"
    mark_warn
    printf "  - %s\n" "${warn_files[@]}"
    return
  fi

  report "Node engines in package.json" "$checked_count file(s) checked" "OK"
}

check_firebase_functions_dependency() {
  local files
  files="$(list_package_json_files || true)"
  if [[ -z "$files" ]]; then
    report "firebase-functions dependency" "package.json not found" "SKIP"
    mark_skip
    return
  fi

  if ! has_command node; then
    report "firebase-functions dependency" "node command not found" "SKIP"
    mark_skip
    return
  fi

  local warn_files=()
  local critical_files=()
  local checked_count=0
  local file
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    local version
    version="$(read_firebase_functions_version_from_package_json "$file")"
    if [[ -z "$version" ]]; then
      continue
    fi
    checked_count=$((checked_count + 1))
    local major
    major="$(extract_first_integer "$version")"
    if [[ -z "$major" ]]; then
      warn_files+=("$file(firebase-functions:$version)")
      continue
    fi

    if (( major <= 5 )); then
      critical_files+=("$file(firebase-functions:$version)")
      continue
    fi
    if (( major == 6 )); then
      warn_files+=("$file(firebase-functions:$version)")
      continue
    fi
  done <<<"$files"

  if (( checked_count == 0 )); then
    report "firebase-functions dependency" "not used in this repo" "SKIP"
    mark_skip
    return
  fi

  if (( ${#critical_files[@]} > 0 )); then
    report "firebase-functions dependency" "${#critical_files[@]} file(s) legacy" "CRITICAL"
    mark_critical
    printf "  - %s\n" "${critical_files[@]}"
    if (( ${#warn_files[@]} > 0 )); then
      printf "  - %s\n" "${warn_files[@]}"
      mark_warn
    fi
    return
  fi

  if (( ${#warn_files[@]} > 0 )); then
    report "firebase-functions dependency" "${#warn_files[@]} file(s) behind latest major" "WARN"
    mark_warn
    printf "  - %s\n" "${warn_files[@]}"
    return
  fi

  report "firebase-functions dependency" "$checked_count file(s) checked" "OK"
}

check_flutter_deprecated_member_use() {
  if [[ ! -f pubspec.yaml || ! -d lib ]]; then
    report "Flutter deprecated_member_use" "not a Flutter app layout" "SKIP"
    mark_skip
    return
  fi

  if ! has_command flutter; then
    report "Flutter deprecated_member_use" "flutter command not found" "SKIP"
    mark_skip
    return
  fi

  local output
  local exit_code=0
  set +e
  output="$(flutter analyze lib --no-pub 2>&1)"
  exit_code=$?
  set -e

  local count=0
  if has_command rg; then
    count="$(printf '%s\n' "$output" | rg -c "deprecated_member_use" -N || true)"
  else
    count="$(printf '%s\n' "$output" | grep -c "deprecated_member_use" || true)"
  fi

  if [[ -z "$count" ]]; then
    count=0
  fi

  if (( count > 0 )); then
    report "Flutter deprecated_member_use" "$count issue(s)" "WARN"
    mark_warn
    return
  fi

  if (( exit_code != 0 )); then
    report "Flutter deprecated_member_use" "0 issue(s) (other analyzer diagnostics exist)" "OK"
    return
  fi

  report "Flutter deprecated_member_use" "0 issue(s)" "OK"
}

check_flutter_discontinued_packages() {
  if [[ ! -f pubspec.yaml ]]; then
    report "Flutter discontinued packages" "pubspec.yaml not found" "SKIP"
    mark_skip
    return
  fi

  if ! has_command flutter; then
    report "Flutter discontinued packages" "flutter command not found" "SKIP"
    mark_skip
    return
  fi

  local output
  local exit_code=0
  set +e
  output="$(flutter pub outdated 2>&1)"
  exit_code=$?
  set -e

  if (( exit_code != 0 )); then
    report "Flutter discontinued packages" "flutter pub outdated failed" "WARN"
    mark_warn
    return
  fi

  local count=0
  if has_command rg; then
    count="$(printf '%s\n' "$output" | rg -c "\(discontinued\)" -N || true)"
  else
    count="$(printf '%s\n' "$output" | grep -c "(discontinued)" || true)"
  fi

  if [[ -z "$count" ]]; then
    count=0
  fi

  if (( count > 0 )); then
    report "Flutter discontinued packages" "$count package(s)" "WARN"
    mark_warn
    return
  fi

  report "Flutter discontinued packages" "0 package(s)" "OK"
}

check_remote_firebase_functions_runtime() {
  local enabled="${DEPRECATION_CHECK_REMOTE_FUNCTIONS:-0}"
  if [[ "$enabled" != "1" ]]; then
    report "Remote Firebase runtime scan" "disabled (set DEPRECATION_CHECK_REMOTE_FUNCTIONS=1)" "SKIP"
    mark_skip
    return
  fi

  if ! has_command firebase; then
    report "Remote Firebase runtime scan" "firebase CLI not found" "SKIP"
    mark_skip
    return
  fi

  local output
  local exit_code=0
  set +e
  output="$(firebase functions:list 2>&1)"
  exit_code=$?
  set -e

  if (( exit_code != 0 )); then
    report "Remote Firebase runtime scan" "firebase functions:list failed" "WARN"
    mark_warn
    return
  fi

  local count=0
  if has_command rg; then
    count="$(printf '%s\n' "$output" | rg -c "nodejs(16|18|20)" -N || true)"
  else
    count="$(printf '%s\n' "$output" | grep -Ec "nodejs(16|18|20)" || true)"
  fi

  if [[ -z "$count" ]]; then
    count=0
  fi

  if (( count > 0 )); then
    report "Remote Firebase runtime scan" "$count legacy runtime hit(s)" "CRITICAL"
    mark_critical
    return
  fi

  report "Remote Firebase runtime scan" "no legacy runtimes found" "OK"
}

echo "=== Deprecation Health Check ==="
date '+Timestamp: %Y-%m-%d %H:%M:%S'
echo

check_firebase_runtime
check_node_engine_constraints
check_firebase_functions_dependency
check_flutter_deprecated_member_use
check_flutter_discontinued_packages
check_remote_firebase_functions_runtime

echo
printf "%-46s %-28s\n" "WARN count" "$warning_count"
printf "%-46s %-28s\n" "CRITICAL count" "$critical_count"
printf "%-46s %-28s\n" "SKIP count" "$skip_count"
echo

if (( critical_count > 0 )); then
  echo "Overall status: CRITICAL"
  echo "Recommended now:"
  echo "  1) Upgrade runtimes/dependencies flagged as CRITICAL."
  echo "  2) Re-run: ./scripts/check_deprecation_health.sh"
  exit 2
fi

if (( warning_count > 0 )); then
  echo "Overall status: WARN"
  echo "Recommended soon:"
  echo "  1) Schedule dependency/runtime upgrade before next release."
  echo "  2) Re-run: ./scripts/check_deprecation_health.sh"
  exit 1
fi

echo "Overall status: OK"
