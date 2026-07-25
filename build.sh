#!/bin/sh
# Сборка релизного архива grka-openwrt-<version>.tar.gz из rootfs/
set -e

cd "$(dirname "$0")"
VERSION="$(tr -d ' \r\n' < rootfs/usr/share/grka/version)"
OUT="grka-openwrt-$VERSION.tar.gz"

# Проверка: в файлах не должно быть CRLF (иначе shell-скрипты сломаются на роутере)
if grep -rl "$(printf '\r')" rootfs/ 2>/dev/null; then
	echo "ОШИБКА: найдены файлы с CRLF (список выше). Исправьте окончания строк на LF." >&2
	exit 1
fi

tar -C rootfs --owner=0 --group=0 --numeric-owner -czf "$OUT" \
	etc usr www

echo "Собрано: $OUT"
tar -tzf "$OUT"
