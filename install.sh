#!/bin/sh
# GrKa OpenWRT - установщик
# Использование: sh -c "$(wget -qO- https://raw.githubusercontent.com/Soporif1c/GrKa-OpenWRT/main/install.sh)"

REPO="Soporif1c/GrKa-OpenWRT"
TMP_TAR="/tmp/grka-openwrt.tar.gz"

GREEN=$'\033[1;32m'
RED=$'\033[1;31m'
CYAN=$'\033[1;96m'
NC=$'\033[0m'

fail() {
	printf "%s ОШИБКА:%s %s\n" "$RED" "$NC" "$1" >&2
	exit 1
}

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
	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout 10 --retry 2 -o "$2" "$1"
	elif command -v uclient-fetch >/dev/null 2>&1; then
		uclient-fetch -qO "$2" --timeout=10 "$1"
	else
		wget -qO "$2" "$1"
	fi
}

printf "\n%s=== GrKa OpenWRT — установка ===%s\n\n" "$CYAN" "$NC"

[ -d /usr/share/luci ] || [ -d /usr/lib/lua/luci ] || fail "LuCI не найден. GrKa OpenWRT — приложение для LuCI (OpenWRT)."

TAG="${1:-}"
if [ -z "$TAG" ]; then
	printf "Получение последней версии...\n"
	TAG="$(fetch "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
	[ -n "$TAG" ] || fail "не удалось получить версию с GitHub API"
fi
VER="${TAG#v}"

printf "Загрузка GrKa OpenWRT %s...\n" "$VER"
download "https://github.com/$REPO/releases/download/$TAG/grka-openwrt-$VER.tar.gz" "$TMP_TAR" || fail "не удалось скачать релиз"

printf "Установка файлов...\n"
tar -C / -xzf "$TMP_TAR" || fail "не удалось распаковать архив"
rm -f "$TMP_TAR"
chmod +x /usr/libexec/rpcd/luci.grka /usr/libexec/grka/*.sh /etc/init.d/mihomo

mkdir -p /etc/mihomo/backups
if [ ! -f /etc/mihomo/config.yaml ]; then
	cp /usr/share/grka/config.yaml.default /etc/mihomo/config.yaml
	printf "Создана конфигурация по умолчанию: /etc/mihomo/config.yaml\n"
fi

/etc/init.d/mihomo enable

if [ ! -x /usr/bin/mihomo ]; then
	printf "\nУстановка ядра mihomo с официального репозитория...\n"
	sh /usr/libexec/grka/core-update.sh || printf "%s Не удалось установить ядро автоматически — установите его через панель (вкладка «Статус»).%s\n" "$RED" "$NC"
fi

rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null
/etc/init.d/rpcd restart >/dev/null 2>&1
/etc/init.d/uhttpd restart >/dev/null 2>&1

[ -e /dev/net/tun ] || printf "\n%sВНИМАНИЕ:%s /dev/net/tun не найден. Для TUN-режима установите модуль: opkg update && opkg install kmod-tun\n" "$RED" "$NC"

printf "\n%s✔ Готово!%s Откройте LuCI: %sСлужбы -> GrKa OpenWRT%s\n" "$GREEN" "$NC" "$CYAN" "$NC"
printf "  1. Вкладка «Конфигурация» — добавьте прокси из ссылки и пропишите proxy-groups/rules\n"
printf "  2. Вкладка «Статус» — запустите сервис\n\n"
