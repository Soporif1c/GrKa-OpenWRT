#!/bin/sh
# GrKa OpenWRT - самообновление панели с GitHub-релизов

# Обновление перезапишет этот файл, поэтому перезапускаем себя из /tmp
if [ "${GRKA_SELFUPDATE_COPY:-}" != "1" ]; then
	cp "$0" /tmp/grka-self-update-run.sh
	export GRKA_SELFUPDATE_COPY=1
	exec sh /tmp/grka-self-update-run.sh "$@"
fi

. /usr/libexec/grka/common.sh

LOCK="/tmp/grka-task.lock"
TMP_TAR="/tmp/grka-panel.tar.gz"

cleanup() {
	rm -f "$LOCK" "$TMP_TAR" /tmp/grka-self-update-run.sh
}
trap cleanup EXIT
echo $$ > "$LOCK"

echo "Проверка последней версии GrKa OpenWRT..."
TAG="$(latest_tag "$GRKA_REPO")"
[ -n "$TAG" ] || { echo "ОШИБКА: не удалось получить версию с GitHub API"; exit 1; }

CUR="$(cat /usr/share/grka/version 2>/dev/null)"
if [ "v$CUR" = "$TAG" ]; then
	echo "Уже установлена последняя версия ($CUR)"
	exit 0
fi

VER="${TAG#v}"
URL="https://github.com/$GRKA_REPO/releases/download/$TAG/grka-openwrt-$VER.tar.gz"
echo "Загрузка: $URL"
download "$URL" "$TMP_TAR" || { echo "ОШИБКА: не удалось скачать релиз"; exit 1; }

echo "Установка..."
tar -C / -xzf "$TMP_TAR" || { echo "ОШИБКА: не удалось распаковать архив"; exit 1; }
chmod +x /usr/libexec/rpcd/luci.grka /usr/libexec/grka/*.sh /etc/init.d/mihomo

rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null
/etc/init.d/rpcd restart >/dev/null 2>&1

echo ""
echo "Готово: панель обновлена до версии $VER."
echo "Обновите страницу в браузере (Ctrl+F5)."
