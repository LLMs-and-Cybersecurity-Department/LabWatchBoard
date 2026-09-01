#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

TARGET="${1:-all}"
case "$TARGET" in
  all|portable|msi) ;;
  *)
    echo "Usage: $0 [all|portable|msi]" >&2
    exit 2
    ;;
esac

CODEX_RUNTIME_ROOT="/Users/a1/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if [[ -x "$CODEX_RUNTIME_ROOT/bin/fallback/pnpm" && -x "$CODEX_RUNTIME_ROOT/node/bin/node" ]]; then
  PNPM_BIN="$CODEX_RUNTIME_ROOT/bin/fallback/pnpm"
  # package.json scripts invoke `pnpm` recursively, so both the Codex Node and
  # fallback pnpm directories must precede Homebrew/system installations.
  export PATH="$CODEX_RUNTIME_ROOT/node/bin:$CODEX_RUNTIME_ROOT/bin/fallback:$PATH"
else
  PNPM_BIN="$(command -v pnpm || true)"
  if [[ -z "$PNPM_BIN" ]]; then
    echo "pnpm not found. Install pnpm or run this script from Codex on this Mac." >&2
    exit 1
  fi
fi

for command_name in curl shasum awk; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

ELECTRON_VERSION="$(node -p "require('./node_modules/electron/package.json').version")"
ARCHIVE_NAME="electron-v${ELECTRON_VERSION}-win32-x64.zip"
PACKAGING_CACHE_ROOT="${LABWATCH_PACKAGING_CACHE:-${HOME}/Library/Caches/labwatch-packaging}"
ELECTRON_CACHE_DIR="$PACKAGING_CACHE_ROOT/electron-${ELECTRON_VERSION}-win32-x64"
ELECTRON_ARCHIVE="$ELECTRON_CACHE_DIR/$ARCHIVE_NAME"
CHECKSUM_FILE="$ELECTRON_CACHE_DIR/SHASUMS256.txt"
ELECTRON_RELEASE_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
ELECTRON_RELEASE_MIRROR="${ELECTRON_RELEASE_MIRROR%/}/"

mkdir -p "$ELECTRON_CACHE_DIR"

echo "[1/7] Downloading Electron with resume support"
curl -L --fail --retry 12 --retry-delay 2 --retry-all-errors --continue-at - \
  -o "$ELECTRON_ARCHIVE" \
  "${ELECTRON_RELEASE_MIRROR}${ELECTRON_VERSION}/${ARCHIVE_NAME}"
curl -L --fail --retry 8 --retry-delay 2 --retry-all-errors \
  -o "$CHECKSUM_FILE" \
  "${ELECTRON_RELEASE_MIRROR}${ELECTRON_VERSION}/SHASUMS256.txt"

EXPECTED_SHA256="$(awk -v file="$ARCHIVE_NAME" '$2 == file || $2 == "*" file { print $1 }' "$CHECKSUM_FILE")"
ACTUAL_SHA256="$(shasum -a 256 "$ELECTRON_ARCHIVE" | awk '{ print $1 }')"
if [[ -z "$EXPECTED_SHA256" || "$EXPECTED_SHA256" != "$ACTUAL_SHA256" ]]; then
  echo "Electron archive checksum verification failed." >&2
  exit 1
fi

echo "[2/7] Running tests and web build"
"$PNPM_BIN" check

echo "[3/7] Building desktop runtime"
"$PNPM_BIN" build:desktop-runtime

echo "[4/7] Verifying release inputs"
"$PNPM_BIN" verify:release

echo "[5/7] Building Windows x64 application directory"
CSC_IDENTITY_AUTO_DISCOVERY=false "$PNPM_BIN" exec electron-builder \
  --win dir --x64 \
  "--config.electronDist=$ELECTRON_ARCHIVE"

build_portable() {
  echo "[6/7] Building portable ZIP"
  CSC_IDENTITY_AUTO_DISCOVERY=false "$PNPM_BIN" exec electron-builder \
    --win zip --x64 --prepackaged release/win-unpacked
}

repair_electron_builder_wine_links() {
  local builder_cache="${ELECTRON_BUILDER_CACHE:-${HOME}/Library/Caches/electron-builder}"
  local repaired=0
  while IFS= read -r -d '' dosdevices_dir; do
    if [[ ! -e "$dosdevices_dir/c:" && ! -L "$dosdevices_dir/c:" ]]; then
      ln -s ../drive_c "$dosdevices_dir/c:"
      repaired=1
    fi
    if [[ ! -e "$dosdevices_dir/z:" && ! -L "$dosdevices_dir/z:" ]]; then
      ln -s / "$dosdevices_dir/z:"
      repaired=1
    fi
  done < <(find "$builder_cache" -type d -path '*/wine-home/dosdevices' -print0 2>/dev/null)
  return "$((repaired == 1 ? 0 : 1))"
}

build_msi() {
  echo "[6/7] Building MSI"
  set +e
  CSC_IDENTITY_AUTO_DISCOVERY=false "$PNPM_BIN" exec electron-builder \
    --win msi --x64 --prepackaged release/win-unpacked
  local status=$?
  set -e
  if [[ $status -ne 0 && "$(uname -s)" == "Darwin" ]]; then
    echo "MSI toolchain needs Wine drive links; repairing cache and retrying once."
    repair_electron_builder_wine_links || true
    CSC_IDENTITY_AUTO_DISCOVERY=false "$PNPM_BIN" exec electron-builder \
      --win msi --x64 --prepackaged release/win-unpacked
  elif [[ $status -ne 0 ]]; then
    return "$status"
  fi
}

case "$TARGET" in
  portable) build_portable ;;
  msi) build_msi ;;
  all)
    build_portable
    build_msi
    ;;
esac

echo "[7/7] Verifying packaged Windows release"
"$PNPM_BIN" verify:windows-release

for artifact in release/LabWatch-*-Windows-x64.zip release/LabWatch-*-Windows-x64.msi; do
  [[ -f "$artifact" ]] || continue
  shasum -a 256 "$artifact" > "${artifact}.sha256"
  echo "Created: $PROJECT_DIR/$artifact"
  echo "Checksum: $PROJECT_DIR/${artifact}.sha256"
done
