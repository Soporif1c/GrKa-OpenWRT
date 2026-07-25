#!/bin/sh
# GrKa OpenWRT - переключение компактного режима хранения ядра
# on:  ядро хранится сжатым на флеше (~12 МБ вместо ~35), при старте распаковывается в /tmp (RAM)
# off: ядро хранится обычным бинарником в /usr/bin/mihomo

. /usr/libexec/grka/common.sh

LOCK="/tmp/grka-task.lock"
cleanup() { rm -f "$LOCK"; }
trap cleanup EXIT
echo $$ > "$LOCK"

MODE="${1:-}"
WAS_RUNNING="$(pidof mihomo 2>/dev/null || true)"

case "$MODE" in
on)
	if compact_on; then
		echo "Компактный режим уже включён"
		exit 0
	fi
	if [ -x "$CORE_BIN" ]; then
		echo "Сжатие ядра (может занять до минуты)..."
		mkdir -p /tmp/grka /etc/mihomo
		gzip -c "$CORE_BIN" > "$CORE_GZ" || { rm -f "$CORE_GZ"; echo "ОШИБКА: не удалось сжать ядро"; exit 1; }
		cp "$CORE_BIN" "$CORE_TMP"
		chmod +x "$CORE_TMP"
		rm -f "$CORE_BIN"
	fi
	touch "$COMPACT_FLAG"
	[ -n "$WAS_RUNNING" ] && { echo "Перезапуск mihomo..."; /etc/init.d/mihomo restart; }
	echo ""
	echo "Готово: компактный режим включён."
	echo "Ядро хранится в $CORE_GZ и распаковывается в /tmp при старте сервиса."
	;;
off)
	if ! compact_on; then
		echo "Компактный режим уже выключен"
		exit 0
	fi
	if [ ! -x "$CORE_BIN" ]; then
		SRC="$(ensure_core)"
		[ -n "$SRC" ] || { echo "ОШИБКА: ядро не найдено"; exit 1; }
		echo "Распаковка ядра в $CORE_BIN..."
		cp "$SRC" "$CORE_BIN" || { echo "ОШИБКА: не удалось записать $CORE_BIN (мало места на флеше?)"; exit 1; }
		chmod +x "$CORE_BIN"
	fi
	rm -f "$COMPACT_FLAG" "$CORE_GZ" "$CORE_TMP"
	[ -n "$WAS_RUNNING" ] && { echo "Перезапуск mihomo..."; /etc/init.d/mihomo restart; }
	echo ""
	echo "Готово: компактный режим выключен, ядро в $CORE_BIN."
	;;
*)
	echo "ОШИБКА: неизвестный режим «$MODE» (ожидается on/off)"
	exit 1
	;;
esac
