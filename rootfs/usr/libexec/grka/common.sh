# shellcheck shell=sh
# GrKa OpenWRT - общие функции

GRKA_REPO="Soporif1c/GrKa-OpenWRT"
MIHOMO_REPO="MetaCubeX/mihomo"
DASHBOARD_URL="https://github.com/MetaCubeX/metacubexd/releases/latest/download/compressed-dist.tgz"

fetch() {
	if command -v curl >/dev/null 2>&1; then
		curl -sfL --connect-timeout 10 --retry 2 "$1"
	elif command -v uclient-fetch >/dev/null 2>&1; then
		uclient-fetch -qO- --timeout=10 "$1"
	else
		wget -qO- "$1"
	fi
}

download() {
	# $1 - url, $2 - файл назначения
	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout 10 --retry 2 -o "$2" "$1"
	elif command -v uclient-fetch >/dev/null 2>&1; then
		uclient-fetch -qO "$2" --timeout=10 "$1"
	else
		wget -qO "$2" "$1"
	fi
}

latest_tag() {
	# $1 - owner/repo -> tag_name последнего релиза
	fetch "https://api.github.com/repos/$1/releases/latest" 2>/dev/null |
		sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1
}

CORE_BIN="/usr/bin/mihomo"
CORE_GZ="/usr/share/grka/mihomo.gz"
CORE_TMP="/tmp/grka/mihomo"
COMPACT_FLAG="/etc/mihomo/.compact"

compact_on() {
	[ -f "$COMPACT_FLAG" ]
}

# Есть ли ядро в каком-либо виде (бинарник или сжатый архив)
core_ready() {
	[ -x "$CORE_BIN" ] || [ -x "$CORE_TMP" ] || [ -f "$CORE_GZ" ]
}

# Путь к готовому к запуску бинарнику (без распаковки)
core_bin() {
	if [ -x "$CORE_BIN" ]; then
		echo "$CORE_BIN"
	elif [ -x "$CORE_TMP" ]; then
		echo "$CORE_TMP"
	fi
}

# Путь к бинарнику, при необходимости распаковав сжатое ядро в /tmp
ensure_core() {
	local b
	b="$(core_bin)"
	if [ -z "$b" ] && [ -f "$CORE_GZ" ]; then
		mkdir -p /tmp/grka
		if gunzip -c "$CORE_GZ" > "$CORE_TMP" 2>/dev/null; then
			chmod +x "$CORE_TMP"
			b="$CORE_TMP"
		else
			rm -f "$CORE_TMP"
		fi
	fi
	echo "$b"
}

mihomo_arch() {
	# Определение архитектуры бинарника mihomo для этого устройства
	local pkgarch=""
	if command -v opkg >/dev/null 2>&1; then
		pkgarch="$(opkg print-architecture 2>/dev/null | awk '$2 != "all" && $2 != "noarch" { a = $2 } END { print a }')"
	elif command -v apk >/dev/null 2>&1; then
		pkgarch="$(apk --print-arch 2>/dev/null)"
	fi
	case "$pkgarch" in
		x86_64*)      echo "amd64-compatible"; return ;;
		i386*|i686*)  echo "386"; return ;;
		aarch64*)     echo "arm64"; return ;;
		arm_cortex-a*|arm*neon*) echo "armv7"; return ;;
		arm_arm9*|arm_arm11*|arm_fa*|arm_mpcore*|arm_xscale*) echo "armv5"; return ;;
		mips64el*)    echo "mips64le"; return ;;
		mips64*)      echo "mips64"; return ;;
		mipsel*)      echo "mipsle-softfloat"; return ;;
		mips*)        echo "mips-softfloat"; return ;;
		riscv64*)     echo "riscv64"; return ;;
		loongarch64*) echo "loong64"; return ;;
	esac
	case "$(uname -m)" in
		x86_64)  echo "amd64-compatible" ;;
		i386|i686) echo "386" ;;
		aarch64) echo "arm64" ;;
		armv7*)  echo "armv7" ;;
		armv6*)  echo "armv6" ;;
		armv5*)  echo "armv5" ;;
		mips)    echo "mips-softfloat" ;;
		mipsel)  echo "mipsle-softfloat" ;;
		riscv64) echo "riscv64" ;;
		*)       echo "" ;;
	esac
}
