#!/bin/sh
# LETHEA qurasdirici (Linux / macOS)
#   curl -fsSL https://raw.githubusercontent.com/L-WalkerG/lethea/main/install.sh | sh
set -eu

REPO="L-WalkerG/lethea"
DIR="$HOME/.local/share/lethea"
BIN="$HOME/.local/bin"

case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)  ASSET="lethea-linux-x64.tar.gz" ;;
    Darwin-arm64)  ASSET="lethea-macos-arm64.tar.gz" ;;   # Apple Silicon (M1, M2, M3...)
    Darwin-x86_64) ASSET="lethea-macos-x64.tar.gz" ;;     # Intel Mac
    *) echo "Bu sistem hele desteklenmir: $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac

command -v curl >/dev/null 2>&1 || { echo "curl lazimdir" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo ""
echo "  LETHEA qurasdirilir..."
curl -fsSL "https://github.com/$REPO/releases/latest/download/$ASSET" -o "$TMP/lethea.tar.gz"
rm -rf "$DIR"
mkdir -p "$DIR" "$BIN"
tar -xzf "$TMP/lethea.tar.gz" -C "$DIR"
ln -sf "$DIR/lethea" "$BIN/lethea"

# ~/.local/bin PATH-da deyilse, shell ayarina elave et (macOS-da zsh standartdir)
case ":$PATH:" in
    *":$BIN:"*)
        echo "  Hazirdir! Indi yaz: lethea" ;;
    *)
        case "${SHELL##*/}" in
            zsh)  RC="$HOME/.zshrc" ;;
            bash) if [ "$(uname -s)" = Darwin ]; then RC="$HOME/.bash_profile"; else RC="$HOME/.bashrc"; fi ;;
            *)    RC="$HOME/.profile" ;;
        esac
        if ! grep -qs "# LETHEA" "$RC"; then
            printf '\n# LETHEA\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$RC"
        fi
        echo "  Hazirdir! Yeni terminal penceresi ac ve yaz: lethea"
        echo "  (ve ya indi bu pencerede: $BIN/lethea)" ;;
esac
echo ""
