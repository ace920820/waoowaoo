#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
SOURCE="$REPO_ROOT/bin/waoowaoo"

if [[ ! -x "$SOURCE" ]]; then
  printf 'Expected executable not found: %s\n' "$SOURCE" >&2
  exit 1
fi

choose_bin_dir() {
  if [[ -n "${WAOOWAOO_CLI_BIN_DIR:-}" ]]; then
    printf '%s\n' "$WAOOWAOO_CLI_BIN_DIR"
    return 0
  fi
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) printf '%s\n' "$HOME/.local/bin" ;;
    *":$HOME/bin:"*) printf '%s\n' "$HOME/bin" ;;
    *) printf '%s\n' "$HOME/.local/bin" ;;
  esac
}

BIN_DIR="$(choose_bin_dir)"
TARGET="$BIN_DIR/waoowaoo"
mkdir -p "$BIN_DIR"
ln -sfn "$SOURCE" "$TARGET"

printf 'Installed waoowaoo CLI symlink:\n  %s -> %s\n' "$TARGET" "$SOURCE"
if command -v waoowaoo >/dev/null 2>&1 && [[ "$(command -v waoowaoo)" == "$TARGET" ]]; then
  printf 'Ready: waoowaoo is on PATH. Try: waoowaoo status\n'
elif command -v waoowaoo >/dev/null 2>&1; then
  printf 'Note: another waoowaoo appears first on PATH: %s\n' "$(command -v waoowaoo)"
  printf 'You can run this install directly with: %s status\n' "$TARGET"
else
  printf 'Add this to your shell profile if needed:\n  export PATH="%s:$PATH"\n' "$BIN_DIR"
  printf 'Then open a new terminal or run: source ~/.zshrc\n'
fi
