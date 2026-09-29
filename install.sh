#!/bin/sh
# LETHEA qurasdirici (Linux)
#   curl -fsSL https://raw.githubusercontent.com/L-WalkerG/lethea/main/install.sh | sh
set -eu

REPO="L-WalkerG/lethea"
DIR="$HOME/.local/share/lethea"
BIN="$HOME/.local/bin"

case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) ASSET="lethea-linux-x64.tar.gz" ;;
    *) echo "Bu sistem hele desteklenmir: $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac

command -v curl >/dev/null 2>&1 || { echo "curl lazimdir: sudo apt install curl" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo ""
echo "  LETHEA qurasdirilir..."
curl -fsSL "https://github.com/$REPO/releases/latest/download/$ASSET" -o "$TMP/lethea.tar.gz"
rm -rf "$DIR"
mkdir -p "$DIR" "$BIN"
tar -xzf "$TMP/lethea.tar.gz" -C "$DIR"
ln -sf "$DIR/lethea" "$BIN/lethea"

echo "  Hazirdir! Indi yaz: lethea"
case ":$PATH:" in
    *":$BIN:"*) ;;
    *)  echo ""
        echo "  Qeyd: $BIN PATH-da deyil. Bu setri ~/.bashrc faylina elave et:"
        echo "    export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac
echo ""
