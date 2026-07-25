#!/bin/sh
# GrKa OpenWRT - установка/обновление ядра mihomo с официального репозитория MetaCubeX/mihomo

. /usr/libexec/grka/common.sh

LOCK="/tmp/grka-task.lock"
TMP_GZ="/tmp/grka-mihomo.gz"
TMP_BIN="/tmp/grka-mihomo"

cleanup() {
	rm -f "$LOCK" "$TMP_GZ" "$TMP_BIN"
}
trap cleanup EXIT
echo $$ > "$LOCK"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
	echo "Получение последней версии mihomo с GitHub..."
	VERSION="$(latest_tag "$MIHOMO_REPO")"
	[ -n "$VERSION" ] || { echo "ОШИБКА: не удалось получить версию с GitHub API"; exit 1; }
fi

ARCH="$(mihomo_arch)"
[ -n "$ARCH" ] || { echo "ОШИБКА: не удалось определить архитектуру устройства"; exit 1; }

echo "Версия: $VERSION"
echo "Архитектура: $ARCH"

URL="https://github.com/$MIHOMO_REPO/releases/download/$VERSION/mihomo-linux-$ARCH-$VERSION.gz"
echo "Загрузка: $URL"
download "$URL" "$TMP_GZ" || { echo "ОШИБКА: не удалось скачать ядро"; exit 1; }

echo "Распаковка..."
gunzip -c "$TMP_GZ" > "$TMP_BIN" || { echo "ОШИБКА: не удалось распаковать архив"; exit 1; }
chmod +x "$TMP_BIN"

"$TMP_BIN" -v >/dev/null 2>&1 || {
	echo "ОШИБКА: бинарник не запускается — возможно, неверная архитектура ($ARCH)"
	exit 1
}

WAS_RUNNING="$(pidof mihomo 2>/dev/null || true)"
[ -n "$WAS_RUNNING" ] && { echo "Остановка mihomo..."; /etc/init.d/mihomo stop; }

mv "$TMP_BIN" /usr/bin/mihomo
chmod +x /usr/bin/mihomo

[ -n "$WAS_RUNNING" ] && { echo "Запуск mihomo..."; /etc/init.d/mihomo start; }

echo ""
echo "Готово: установлено ядро mihomo $VERSION ($ARCH)"
