#!/bin/sh
set -eu

APP_NAME="ruopenray-ui"
SERVICE_NAME="ruopenray-ui"
INSTALL_DIR="/usr/bin"
DATA_DIR="${RUOPENRAY_DATA_DIR:-/etc/ruopenray-ui}"
BACKUP_DIR="${RUOPENRAY_BACKUP_DIR:-$DATA_DIR/backups}"
GEO_DIR="${RUOPENRAY_GEO_DIR:-/usr/share/xray}"
PORT="${RUOPENRAY_PORT:-9090}"
HOST="${RUOPENRAY_HOST:-0.0.0.0}"
PASSWORD="${RUOPENRAY_PASSWORD:-}"
PASSWORD_GENERATED=0
PASSWORD_REUSED=0
ACTIVE_CONFIG="${RUOPENRAY_ACTIVE_CONFIG:-/etc/xray/config.json}"
XRAY_SERVICE="${RUOPENRAY_XRAY_SERVICE:-xray}"
RELEASE_BASE_URL="${RUOPENRAY_RELEASE_BASE_URL:-https://github.com/AceAsket/RuOpenRay/releases/latest/download}"
SCENARIOS_URL="${RUOPENRAY_SCENARIOS_URL:-https://raw.githubusercontent.com/AceAsket/RuOpenRay-scenarios/main/scenarios.json}"
SCENARIOS_NAME="${RUOPENRAY_SCENARIOS_NAME:-RuOpenRay scenarios}"
INSTALL_SCENARIOS="${RUOPENRAY_INSTALL_SCENARIOS:-1}"
SCENARIOS_AUTO_UPDATE="${RUOPENRAY_SCENARIOS_AUTO_UPDATE:-0}"
INSTALL_XRAY="${RUOPENRAY_INSTALL_XRAY:-0}"
MIN_FREE_KB="${RUOPENRAY_MIN_FREE_KB:-12288}"
START_DELAY="${RUOPENRAY_START_DELAY:-0}"
APPLY_DELAY="${RUOPENRAY_APPLY_DELAY:-0}"
DOWNLOAD_MIRROR="${RUOPENRAY_DOWNLOAD_MIRROR:-direct}"
MIRROR_PREFIX="${RUOPENRAY_MIRROR_PREFIX:-}"
KEEP_BINARY_BACKUPS="${RUOPENRAY_KEEP_BINARY_BACKUPS:-2}"
ENABLED=1
GO_MEMLIMIT=48MiB
GO_GC=60
EXISTING_INSTALL=0
INSTALL_TRANSACTION=""
INSTALL_TRANSACTION_ACTIVE=0
INSTALL_COMMITTED=0
PANEL_WAS_RUNNING=0
ENABLE_ATTEMPTED=0
OPERATION_LOCKED=0
RETAINED_BINARY_BACKUP=""
tmp=""
digest_tmp=""
selfcheck_tmp=""
ready_tmp=""

log() {
	printf '%s\n' "$*"
}

die() {
	printf 'Ошибка: %s\n' "$*" >&2
	exit 1
}

generate_password() {
	if [ -r /dev/urandom ] && command -v hexdump >/dev/null 2>&1; then
		dd if=/dev/urandom bs=12 count=1 2>/dev/null | hexdump -v -e '/1 "%02x"' | cut -c1-16
	elif [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
		dd if=/dev/urandom bs=12 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n' | cut -c1-16
	else
		printf 'ruopenray%s' "$(date +%s)"
	fi
}

current_panel_password() {
	command -v uci >/dev/null 2>&1 || return 0
	uci -q get ruopenray-ui.main.password 2>/dev/null || true
}

# An installer rerun is an upgrade. Only explicitly supplied environment values
# override existing UCI options; unknown options and other UCI sections survive.
installation_setting() {
	option="$1"; fallback="$2"; supplied="$3"; override="$4"
	if [ "$supplied" = x ]; then
		printf '%s' "$override"
	elif saved="$(uci -q get "ruopenray-ui.main.$option" 2>/dev/null)"; then
		printf '%s' "$saved"
	else
		printf '%s' "$fallback"
	fi
}

load_installation_settings() {
	command -v uci >/dev/null 2>&1 || die "нужен UCI для безопасного сохранения настроек"
	[ -z "$(uci -q changes ruopenray-ui 2>/dev/null)" ] || die "сначала сохраните или отмените незафиксированные UCI-изменения панели"
	EXISTING_INSTALL=0
	[ ! -s /etc/config/ruopenray-ui ] || EXISTING_INSTALL=1
	DATA_DIR="$(installation_setting data_dir "$DATA_DIR" "${RUOPENRAY_DATA_DIR+x}" "${RUOPENRAY_DATA_DIR-}")"
	BACKUP_DIR="$(installation_setting backup_dir "$DATA_DIR/backups" "${RUOPENRAY_BACKUP_DIR+x}" "${RUOPENRAY_BACKUP_DIR-}")"
	GEO_DIR="$(installation_setting geo_dir "$GEO_DIR" "${RUOPENRAY_GEO_DIR+x}" "${RUOPENRAY_GEO_DIR-}")"
	HOST="$(installation_setting host "$HOST" "${RUOPENRAY_HOST+x}" "${RUOPENRAY_HOST-}")"
	PORT="$(installation_setting port "$PORT" "${RUOPENRAY_PORT+x}" "${RUOPENRAY_PORT-}")"
	PASSWORD="$(installation_setting password "$PASSWORD" "${RUOPENRAY_PASSWORD+x}" "${RUOPENRAY_PASSWORD-}")"
	[ -z "$PASSWORD" ] || [ "${RUOPENRAY_PASSWORD+x}" = x ] || PASSWORD_REUSED=1
	ACTIVE_CONFIG="$(installation_setting active_config "$ACTIVE_CONFIG" "${RUOPENRAY_ACTIVE_CONFIG+x}" "${RUOPENRAY_ACTIVE_CONFIG-}")"
	XRAY_SERVICE="$(installation_setting xray_service "$XRAY_SERVICE" "${RUOPENRAY_XRAY_SERVICE+x}" "${RUOPENRAY_XRAY_SERVICE-}")"
	START_DELAY="$(installation_setting start_delay "$START_DELAY" "${RUOPENRAY_START_DELAY+x}" "${RUOPENRAY_START_DELAY-}")"
	APPLY_DELAY="$(installation_setting apply_delay "$APPLY_DELAY" "${RUOPENRAY_APPLY_DELAY+x}" "${RUOPENRAY_APPLY_DELAY-}")"
	DOWNLOAD_MIRROR="$(installation_setting download_mirror "$DOWNLOAD_MIRROR" "${RUOPENRAY_DOWNLOAD_MIRROR+x}" "${RUOPENRAY_DOWNLOAD_MIRROR-}")"
	MIRROR_PREFIX="$(installation_setting mirror_prefix "$MIRROR_PREFIX" "${RUOPENRAY_MIRROR_PREFIX+x}" "${RUOPENRAY_MIRROR_PREFIX-}")"
	ENABLED="$(installation_setting enabled 1 '' '')"
	GO_MEMLIMIT="$(installation_setting go_memlimit 48MiB '' '')"
	GO_GC="$(installation_setting go_gc 60 '' '')"
	# Rerunning the installer must not re-add or reconfigure a source the user
	# disabled. Existing installs can opt in explicitly.
	if [ "$EXISTING_INSTALL" = 1 ] && [ "${RUOPENRAY_INSTALL_SCENARIOS+x}" != x ]; then INSTALL_SCENARIOS=0; fi
	case "$PORT" in ''|*[!0-9]*) die "порт должен быть числом от 1 до 65535";; esac
	[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "порт должен быть числом от 1 до 65535"
	[ -n "$HOST" ] || die "адрес панели не должен быть пустым"
	case "$ENABLED" in 0|1) ;; *) die "некорректный UCI enabled";; esac
	for path in "$DATA_DIR" "$BACKUP_DIR" "$GEO_DIR" "$ACTIVE_CONFIG"; do
		case "$path" in /*) ;; *) die "каталоги и active_config должны быть абсолютными";; esac
		case "$path" in *'
'*) die "пути не должны содержать перевод строки";; esac
	done
	[ ! -f "$DATA_DIR/app-update-pending.json" ] || die "сначала завершите текущее обновление панели"
}

ensure_password() {
	if [ -z "$PASSWORD" ]; then
		existing_password="$(current_panel_password)"
		if [ -n "$existing_password" ]; then
			PASSWORD="$existing_password"
			PASSWORD_REUSED=1
		else
			PASSWORD="$(generate_password)"
			PASSWORD_GENERATED=1
		fi
	fi
	[ -n "$PASSWORD" ] || die "не удалось сгенерировать пароль"
	case "$PASSWORD" in
		*'
'*) die "RUOPENRAY_PASSWORD не должен содержать перевод строки" ;;
	esac
}

uninstall_openwrt() {
	need_root
	if [ -x "/etc/init.d/$SERVICE_NAME" ]; then
		/etc/init.d/$SERVICE_NAME disable >/dev/null 2>&1 || true
		/etc/init.d/$SERVICE_NAME stop >/dev/null 2>&1 || true
	fi
	rm -f "/etc/init.d/$SERVICE_NAME"
	rm -f /usr/share/luci/menu.d/luci-app-ruopenray.json
	rm -f /usr/share/rpcd/acl.d/luci-app-ruopenray.json
	rm -rf /usr/share/ucode/luci/template/ruopenray
	rm -rf /www/luci-static/resources/view/ruopenray
	rm -f "$INSTALL_DIR/$APP_NAME"
	if command -v uci >/dev/null 2>&1; then
		uci -q delete ruopenray-ui.main || true
		uci -q commit ruopenray-ui || true
	fi
	if [ -f /etc/crontabs/root ]; then
		grep -v 'RuOpenRay geo update' /etc/crontabs/root > /tmp/ruopenray-cron.$$ || true
		grep -v 'RuOpenRay route preset sources update' /tmp/ruopenray-cron.$$ > /tmp/ruopenray-cron2.$$ || true
		mv /tmp/ruopenray-cron2.$$ /tmp/ruopenray-cron.$$
		cat /tmp/ruopenray-cron.$$ > /etc/crontabs/root
		rm -f /tmp/ruopenray-cron.$$
		[ -x /etc/init.d/cron ] && /etc/init.d/cron restart >/dev/null 2>&1 || true
	fi
	if [ "${RUOPENRAY_PURGE:-0}" = "1" ]; then
		rm -rf "$DATA_DIR"
	fi
	[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
	log "RuOpenRay UI удален. Xray и geo-файлы не тронуты. Для удаления данных запустите с RUOPENRAY_PURGE=1."
}

need_root() {
	[ "$(id -u)" = "0" ] || die "запустите скрипт от root"
}

detect_openwrt() {
	[ -r /etc/openwrt_release ] || die "это не похоже на OpenWrt: /etc/openwrt_release не найден"
	. /etc/openwrt_release
	OPENWRT_VERSION="${DISTRIB_RELEASE:-unknown}"
	case "$OPENWRT_VERSION" in
		24.*|25.*|SNAPSHOT|unknown) ;;
		*) log "Предупреждение: OpenWrt $OPENWRT_VERSION не проверялся, продолжаю аккуратно." ;;
	esac
}

detect_manager() {
	if command -v apk >/dev/null 2>&1; then
		PKG_MANAGER="apk"
	elif command -v opkg >/dev/null 2>&1; then
		PKG_MANAGER="opkg"
	else
		die "не найден apk или opkg"
	fi
}

detect_arch() {
	UNAME_ARCH="$(uname -m)"
	case "$UNAME_ARCH" in
		x86_64) ASSET_ARCH="amd64"; ASSET_NAME="ruopenray-ui-linux-amd64" ;;
		aarch64|arm64) ASSET_ARCH="arm64"; ASSET_NAME="ruopenray-ui-linux-arm64" ;;
		armv7*|armv7l) ASSET_ARCH="armv7"; ASSET_NAME="ruopenray-ui-linux-armv7" ;;
		mipsel|mipsle) ASSET_ARCH="mipsle"; ASSET_NAME="ruopenray-ui-linux-mipsle-softfloat" ;;
		mips) ASSET_ARCH="mips"; ASSET_NAME="ruopenray-ui-linux-mips-softfloat" ;;
		*) die "неподдерживаемая архитектура $UNAME_ARCH" ;;
	esac
	log "Архитектура: $UNAME_ARCH -> $ASSET_ARCH"
}

pkg_update() {
	case "$PKG_MANAGER" in
		apk) apk update ;;
		opkg) opkg update ;;
	esac
}

pkg_install() {
	case "$PKG_MANAGER" in
		apk) apk add "$@" ;;
		opkg) opkg install "$@" ;;
	esac
}

pkg_install_oneof() {
	for pkg in "$@"; do
		if pkg_install "$pkg"; then
			return 0
		fi
	done
	return 1
}

check_space() {
	free_kb="$(df -Pk /usr 2>/dev/null | awk 'NR==2 {print $4}')"
	[ -n "$free_kb" ] || free_kb="$(df -Pk / 2>/dev/null | awk 'NR==2 {print $4}')"
	if [ -n "$free_kb" ] && [ "$free_kb" -lt "$MIN_FREE_KB" ]; then
		die "свободно меньше $MIN_FREE_KB KB. Освободите место или переопределите RUOPENRAY_MIN_FREE_KB"
	fi
}

install_dependencies() {
	pkg_update || log "Предупреждение: не удалось обновить индекс пакетов"
	pkg_install_oneof ca-bundle ca-certificates || log "Предупреждение: CA certificates не установлены через пакетный менеджер"
	if ! command -v jsonfilter >/dev/null 2>&1; then
		pkg_install jsonfilter || die "нужен jsonfilter для восстановления обновления панели"
	fi
	if ! command -v flock >/dev/null 2>&1; then
		pkg_install flock || die "нужен flock для согласования установки с операциями панели"
	fi
	if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
		pkg_install_oneof curl wget-ssl wget || die "нужен curl или wget для скачивания RuOpenRay UI"
	fi
	pkg_install kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket || die "не удалось установить TPROXY-модули: kmod-nf-tproxy, kmod-nft-tproxy, kmod-nft-socket"
	if [ "$INSTALL_XRAY" = "1" ] && ! command -v xray >/dev/null 2>&1; then
		log "Xray не найден, устанавливаю xray-core..."
		pkg_install_oneof xray-core xray || die "не удалось установить Xray"
	fi
}

url_query_escape() {
	LC_ALL=C awk 'BEGIN { for (i=1;i<256;i++) ord[sprintf("%c",i)]=i } { for (i=1;i<=length($0);i++) { c=substr($0,i,1); if (c ~ /[A-Za-z0-9_.~-]/) printf "%s",c; else printf "%%%02X",ord[c] } }'
}

mirror_url() {
	if [ "$DOWNLOAD_MIRROR" != custom ] || [ -z "$MIRROR_PREFIX" ]; then printf '%s' "$1"; return; fi
	case "$MIRROR_PREFIX" in http://*|https://*) ;; *) die "зеркало должно использовать http:// или https://";; esac
	case "$MIRROR_PREFIX" in
		*'{url}'*)
			encoded="$(printf '%s' "$1" | url_query_escape)"
			remaining="$MIRROR_PREFIX"
			while case "$remaining" in *'{url}'*) true;; *) false;; esac; do
				printf '%s%s' "${remaining%%\{url\}*}" "$encoded"
				remaining="${remaining#*\{url\}}"
			done
			printf '%s' "$remaining"
			;;
		*) printf '%s%s' "$MIRROR_PREFIX" "$1";;
	esac
}

download_file() {
	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout 15 --max-time "$3" -o "$2" "$1"
	else
		wget -T "$3" -O "$2" "$1"
	fi
}

download_binary() {
	mkdir -p "$INSTALL_DIR"
	tmp="${INSTALL_DIR}/.${APP_NAME}.new.$$"
	digest_tmp="${tmp}.sha256"
	selfcheck_tmp="${tmp}.selfcheck"
	ready_tmp="${tmp}.ready"
	if [ -n "${RUOPENRAY_BINARY_URL:-}" ]; then
		url="$RUOPENRAY_BINARY_URL"
	else
		url="${RELEASE_BASE_URL}/${ASSET_NAME}"
	fi
	download_url="$(mirror_url "$url")"
	log "Скачиваю RuOpenRay UI: $download_url"
	download_file "$download_url" "$tmp" 180
	[ -s "$tmp" ] || die "скачанный файл пустой"
	command -v sha256sum >/dev/null 2>&1 || die "для проверки бинарника нужен sha256sum"
	expected_sha="${RUOPENRAY_SHA256:-}"
	if [ -z "$expected_sha" ]; then
		# A mirror supplies bytes, never its own authority for those bytes. Even
		# RUOPENRAY_BINARY_URL uses the configured release's checksum unless the
		# operator explicitly supplied RUOPENRAY_SHA256.
		download_file "${RELEASE_BASE_URL}/${ASSET_NAME}.sha256" "$digest_tmp" 30
		expected_sha="$(awk 'NR==1 {print $1}' "$digest_tmp")"
	fi
	[ "${#expected_sha}" = "64" ] || die "некорректный ожидаемый SHA-256"
	case "$expected_sha" in *[!a-fA-F0-9]*) die "некорректный ожидаемый SHA-256" ;; esac
	expected_sha="$(printf '%s' "$expected_sha" | tr 'A-F' 'a-f')"
	actual_sha="$(sha256sum "$tmp" | awk '{print $1}')"
	[ "$actual_sha" = "$expected_sha" ] || die "SHA-256 бинарника не совпадает; текущая панель сохранена"
	chmod 0755 "$tmp"
	"$tmp" --self-check 8>&- >"$selfcheck_tmp" || die "новая панель не прошла самопроверку; текущая установка сохранена"
	[ "$(jsonfilter -i "$selfcheck_tmp" -e '@.ok')" = true ] || die "некорректная самопроверка панели"
	CANDIDATE_VERSION="$(jsonfilter -i "$selfcheck_tmp" -e '@.version')"
	[ -n "$CANDIDATE_VERSION" ] || die "самопроверка не вернула версию панели"
}

acquire_installer_lock() {
	[ ! -L /tmp/ruopenray-installer.lock ] || die "небезопасный lock установщика"
	exec 8>/tmp/ruopenray-installer.lock
	flock -n 8 || die "другой установщик уже работает"
}

acquire_operation_lock() {
	[ "$OPERATION_LOCKED" != 1 ] || return 0
	[ ! -L /tmp/ruopenray-operation.lock ] || return 1
	exec 9>/tmp/ruopenray-operation.lock
	if ! flock -n 9; then exec 9>&-; return 1; fi
	OPERATION_LOCKED=1
}

release_operation_lock() {
	[ "$OPERATION_LOCKED" = 1 ] || return 0
	flock -u 9
	exec 9>&-
	OPERATION_LOCKED=0
}

save_install_file() {
	path="$1"
	[ ! -L "$path" ] || die "небезопасная символьная ссылка: $path"
	INSTALL_FILE_COUNT=$((INSTALL_FILE_COUNT + 1))
	if [ -e "$path" ]; then
		[ -f "$path" ] || die "ожидался обычный файл: $path"
		cp -p "$path" "$INSTALL_TRANSACTION/$INSTALL_FILE_COUNT"
	else
		: >"$INSTALL_TRANSACTION/$INSTALL_FILE_COUNT.absent"
	fi
	printf '%s\n' "$path" >>"$INSTALL_TRANSACTION/paths"
}

begin_install_transaction() {
	INSTALL_TRANSACTION="$(umask 077; mktemp -d "$INSTALL_DIR/.ruopenray-install.XXXXXX")"
	INSTALL_FILE_COUNT=0
	: >"$INSTALL_TRANSACTION/paths"
	save_install_file "$INSTALL_DIR/$APP_NAME"
	save_install_file /etc/config/ruopenray-ui
	save_install_file "/etc/init.d/$SERVICE_NAME"
	save_install_file /usr/libexec/ruopenray-recover-app
	save_install_file /usr/share/luci/menu.d/luci-app-ruopenray.json
	save_install_file /usr/share/rpcd/acl.d/luci-app-ruopenray.json
	save_install_file /usr/share/ucode/luci/template/ruopenray/dashboard.ut
	save_install_file /www/luci-static/resources/view/ruopenray/dashboard.js
	# Existing Xray configurations are never written; a fresh install's new
	# starter config is removed again if panel startup fails.
	if [ ! -s "$ACTIVE_CONFIG" ]; then save_install_file "$ACTIVE_CONFIG"; fi
	if pidof "$APP_NAME" >/dev/null 2>&1; then PANEL_WAS_RUNNING=1; fi
	INSTALL_TRANSACTION_ACTIVE=1
}

rollback_installation() {
	log "Установка не завершена. Восстанавливаю прежнюю панель и служебные файлы."
	if ! acquire_operation_lock; then
		log "Панель выполняет другую операцию. Откат не начат, копии сохранены: $INSTALL_TRANSACTION" >&2
		return 1
	fi
	if [ -f "$DATA_DIR/app-update-pending.json" ]; then
		log "Началось отдельное обновление панели. Откат установщика не начат, копии сохранены: $INSTALL_TRANSACTION" >&2
		return 1
	fi
	if [ -x "/etc/init.d/$SERVICE_NAME" ]; then
		/etc/init.d/$SERVICE_NAME stop 8>&- 9>&- >/dev/null 2>&1 || true
		if [ "$ENABLE_ATTEMPTED" = 1 ]; then /etc/init.d/$SERVICE_NAME disable >/dev/null 2>&1 || true; fi
	fi
	index=0
	rollback_ok=1
	# UCI keeps uncommitted set operations in a separate delta file. Restoring
	# /etc/config alone would leave a failed install's options overlaid on it.
	uci -q revert ruopenray-ui >/dev/null 2>&1 || rollback_ok=0
	while IFS= read -r path; do
		index=$((index + 1))
		if [ -f "$INSTALL_TRANSACTION/$index.absent" ]; then
			rm -f "$path" || rollback_ok=0
		elif [ "$index" = 1 ]; then
			binary_backup="$INSTALL_TRANSACTION/1"
			[ -f "$binary_backup" ] || binary_backup="$RETAINED_BINARY_BACKUP"
			# The binary backup is on the target filesystem. Rename instead of
			# allocating another large copy when installation failed with ENOSPC.
			mv -f "$binary_backup" "$path" || rollback_ok=0
		else
			# Copy into the target filesystem before atomic replacement; retain
			# the recovery copy when restoring a file fails.
			cp -p "$INSTALL_TRANSACTION/$index" "$path.install-restore.$$" && mv -f "$path.install-restore.$$" "$path" || rollback_ok=0
		fi
	done <"$INSTALL_TRANSACTION/paths"
	release_operation_lock
	if [ "$PANEL_WAS_RUNNING" = 1 ]; then
		/etc/init.d/$SERVICE_NAME start 8>&- >/dev/null 2>&1 || rollback_ok=0
	fi
	[ ! -x /etc/init.d/rpcd ] || /etc/init.d/rpcd reload >/dev/null 2>&1 || true
	if [ "$rollback_ok" != 1 ]; then
		log "Не удалось полностью восстановить установку. Копии сохранены: $INSTALL_TRANSACTION" >&2
		return 1
	fi
	INSTALL_TRANSACTION_ACTIVE=0
}

finish_installation() {
	status="$1"
	trap - EXIT HUP INT TERM
	set +e
	if [ "$INSTALL_TRANSACTION_ACTIVE" = 1 ] && [ "$INSTALL_COMMITTED" != 1 ]; then
		rollback_installation || { status=1; INSTALL_TRANSACTION=""; }
	fi
	release_operation_lock
	for staged in "$tmp" "$digest_tmp" "$selfcheck_tmp" "$ready_tmp"; do [ -z "$staged" ] || rm -f "$staged"; done
	if [ -n "$INSTALL_TRANSACTION" ]; then
		# mktemp created this exact directory under INSTALL_DIR. No recursive
		# removal and no user-provided path is passed to a cleanup command.
		rm -f "$INSTALL_TRANSACTION"/*
		rmdir "$INSTALL_TRANSACTION"
	fi
	exit "$status"
}

commit_installation() {
	if [ -f "$INSTALL_TRANSACTION/1" ]; then
		RETAINED_BINARY_BACKUP="$INSTALL_DIR/$APP_NAME.backup-$(date +%Y%m%d-%H%M%S)-$$"
		mv "$INSTALL_TRANSACTION/1" "$RETAINED_BINARY_BACKUP"
	fi
	if [ "$EXISTING_INSTALL" != 1 ] && [ "$ENABLED" = 1 ]; then
		ENABLE_ATTEMPTED=1
		/etc/init.d/$SERVICE_NAME enable 8>&-
	fi
	sync
	INSTALL_COMMITTED=1
	prune_binary_backups
}

prune_binary_backups() {
	index=0
	for backup in $(ls -1t "$INSTALL_DIR/$APP_NAME".backup-* 2>/dev/null || true); do
		index=$((index + 1))
		[ "$index" -le "$KEEP_BINARY_BACKUPS" ] && continue
		rm -f "$backup" || true
	done
}

write_uci_via_cli() {
	mkdir -p /etc/config
	touch /etc/config/ruopenray-ui
	chmod 0600 /etc/config/ruopenray-ui
	uci -q set ruopenray-ui.main=ruopenray-ui
	uci -q set "ruopenray-ui.main.enabled=$ENABLED"
	uci -q set "ruopenray-ui.main.host=$HOST"
	uci -q set "ruopenray-ui.main.port=$PORT"
	uci -q set "ruopenray-ui.main.password=$PASSWORD"
	uci -q set "ruopenray-ui.main.data_dir=$DATA_DIR"
	uci -q set "ruopenray-ui.main.backup_dir=$BACKUP_DIR"
	uci -q set "ruopenray-ui.main.geo_dir=$GEO_DIR"
	uci -q set "ruopenray-ui.main.active_config=$ACTIVE_CONFIG"
	uci -q set "ruopenray-ui.main.xray_service=$XRAY_SERVICE"
	uci -q set "ruopenray-ui.main.start_delay=$START_DELAY"
	uci -q set "ruopenray-ui.main.apply_delay=$APPLY_DELAY"
	uci -q set "ruopenray-ui.main.go_memlimit=$GO_MEMLIMIT"
	uci -q set "ruopenray-ui.main.go_gc=$GO_GC"
	uci -q set "ruopenray-ui.main.download_mirror=$DOWNLOAD_MIRROR"
	uci -q set "ruopenray-ui.main.mirror_prefix=$MIRROR_PREFIX"
	uci -q commit ruopenray-ui
}

write_uci() {
	mkdir -p "$DATA_DIR/profiles" "$BACKUP_DIR" "$GEO_DIR" "$(dirname "$ACTIVE_CONFIG")"
	write_uci_via_cli
	saved_password="$(current_panel_password)"
	if [ "$saved_password" != "$PASSWORD" ]; then
		die "пароль панели не записался в UCI; прежняя установка будет восстановлена"
	fi
}

write_app_recovery() {
	mkdir -p /usr/libexec
	cat > /usr/libexec/ruopenray-recover-app <<'RUOPENRAY_APP_RECOVERY_EOF'
#!/bin/sh
# Runs before the panel, including when its candidate binary cannot execute.
set -eu
data_dir="${1:-/etc/ruopenray-ui}"
target="${2:-/usr/bin/ruopenray-ui}"
plan="$data_dir/app-update-pending.json"
[ -f "$plan" ] || exit 0
[ ! -L "$plan" ] || { echo 'RuOpenRay: unsafe update journal' >&2; exit 1; }
field() { jsonfilter -i "$plan" -e "@.$1"; }
saved_target="$(field Target)"
backup="$(field Backup)"
expected="$(field ExpectedSHA)"
previous="$(field PreviousSHA)"
saved_boot="$(field BootID || true)"
watchdog="$(field WatchdogPID || true)"
update_id="$(field UpdateID || true)"
case "$update_id" in *[!A-Za-z0-9_-]*) exit 1;; esac
[ "$saved_target" = "$target" ] || { echo 'RuOpenRay: update target changed' >&2; exit 1; }
[ "$(dirname "$backup")" = "$(dirname "$target")" ] || exit 1
case "$(basename "$backup")" in .xray-update-*) ;; *) exit 1;; esac
[ "${#expected}" -eq 64 ] && [ "${#previous}" -eq 64 ] || exit 1
case "$expected$previous" in *[!a-f0-9]*) exit 1;; esac
current_boot="$(cat /proc/sys/kernel/random/boot_id)"
# A normal same-boot watchdog restart must retain its private readiness plan.
case "$watchdog" in ''|*[!0-9]*|0) ;; *)
 if [ "$saved_boot" = "$current_boot" ] && [ -r "/proc/$watchdog/cmdline" ]; then
  running_sha="$(sha256sum "/proc/$watchdog/exe" 2>/dev/null | cut -d ' ' -f 1)"
  if [ "$running_sha" = "$previous" ] && tr '\000' '\n' <"/proc/$watchdog/cmdline" | grep -Fx -- "$plan" >/dev/null && tr '\000' '\n' <"/proc/$watchdog/cmdline" | grep -Fx -- '--app-update-watchdog' >/dev/null; then exit 0; fi
 fi
 ;; esac
current=""
if [ -e "$target" ] && { [ ! -f "$target" ] || [ -L "$target" ]; }; then echo 'RuOpenRay: unsafe update target' >&2; exit 1; fi
if [ -f "$target" ] && [ ! -L "$target" ]; then current="$(sha256sum "$target" | cut -d ' ' -f 1)"; fi
result="$data_dir/app-update-result.json"
terminal="$(jsonfilter -i "$result" -e '@.state' 2>/dev/null || true)"
terminal_sha="$(jsonfilter -i "$result" -e '@.expectedSHA' 2>/dev/null || true)"
if [ "$terminal" = healthy ] && [ "$terminal_sha" = "$expected" ] && [ "$current" = "$expected" ]; then
 # The terminal result committed just before a power failure during cleanup.
 rm -f "$plan" "$plan.armed" "$plan.watching" "$plan.waiting"
 sync
 exit 0
fi
if [ "$current" != "$previous" ]; then
 [ -z "$current" ] || [ "$current" = "$expected" ] || { echo 'RuOpenRay: manual replacement preserved; recovery needs review' >&2; exit 1; }
 [ -f "$backup" ] && [ ! -L "$backup" ] || exit 1
 [ "$(sha256sum "$backup" | cut -d ' ' -f 1)" = "$previous" ] || { echo 'RuOpenRay: invalid rollback SHA-256' >&2; exit 1; }
 chmod 755 "$backup"
 mv -f "$backup" "$target"
 sync
fi
printf '{"ok":true,"state":"interrupted_rollback","sha256":"%s","expectedSHA":"%s","updateId":"%s"}\n' "$previous" "$expected" "$update_id" >"$result.next"
chmod 600 "$result.next"
sync
mv -f "$result.next" "$result"
sync
rm -f "$plan" "$plan.armed" "$plan.watching" "$plan.waiting"
sync
RUOPENRAY_APP_RECOVERY_EOF
	chmod 0755 /usr/libexec/ruopenray-recover-app
}

write_init() {
	write_app_recovery
	cat > /etc/init.d/$SERVICE_NAME <<'EOF'
#!/bin/sh /etc/rc.common

START=92
STOP=15
USE_PROCD=1

PROG=/usr/bin/ruopenray-ui

load_config() {
	config_load ruopenray-ui
	config_get_bool enabled main enabled 1
	config_get host main host '0.0.0.0'
	config_get port main port '9090'
	config_get password main password 'admin'
	config_get data_dir main data_dir '/etc/ruopenray-ui'
	config_get backup_dir main backup_dir "$data_dir/backups"
	config_get geo_dir main geo_dir '/usr/share/xray'
	config_get active_config main active_config '/etc/xray/config.json'
	config_get xray_service main xray_service 'xray'
	config_get start_delay main start_delay '0'
	config_get go_memlimit main go_memlimit '48MiB'
	config_get go_gc main go_gc '60'
}

start_service() {
	load_config
	[ "$enabled" = "1" ] || return 0
	/usr/libexec/ruopenray-recover-app "$data_dir" "$PROG" || return 1
	[ -x "$PROG" ] || return 1
	[ "${start_delay:-0}" -gt 0 ] 2>/dev/null && sleep "$start_delay"

	procd_open_instance
	procd_set_param command "$PROG"
	procd_set_param env \
		"RUOPENRAY_HOST=$host" \
		"RUOPENRAY_PORT=$port" \
		"RUOPENRAY_PASSWORD=$password" \
		"RUOPENRAY_DATA_DIR=$data_dir" \
		"RUOPENRAY_PROFILES_DIR=$data_dir/profiles" \
		"RUOPENRAY_BACKUP_DIR=$backup_dir" \
		"RUOPENRAY_GEO_DIR=$geo_dir" \
		"RUOPENRAY_ACTIVE_CONFIG=$active_config" \
		"RUOPENRAY_XRAY_SERVICE=$xray_service" \
		"GOMEMLIMIT=$go_memlimit" \
		"GOGC=$go_gc"
	procd_set_param respawn 3600 5 5
	procd_set_param limits nofile="4096 4096"
	procd_close_instance
}
EOF
	chmod 0755 /etc/init.d/$SERVICE_NAME
	sync
}

write_luci_launcher() {
	[ -d /usr/share/luci/menu.d ] || return 0
	mkdir -p /usr/share/luci/menu.d /usr/share/rpcd/acl.d /usr/share/ucode/luci/template/ruopenray
	cat > /usr/share/luci/menu.d/luci-app-ruopenray.json <<'EOF'
{
	"admin/services/ruopenray": {
		"title": "RuOpenRay UI",
		"order": 72,
		"action": {
			"type": "view",
			"path": "ruopenray/dashboard"
		},
		"depends": {
			"acl": [ "luci-app-ruopenray" ],
			"fs": { "/usr/bin/ruopenray-ui": "executable" }
		}
	}
}
EOF
	cat > /usr/share/rpcd/acl.d/luci-app-ruopenray.json <<'EOF'
{
	"luci-app-ruopenray": {
		"description": "Grant access to the RuOpenRay UI LuCI launcher",
		"read": {
			"ubus": {
				"session": [ "access" ],
				"uci": [ "get" ],
				"service": [ "list" ]
			},
			"uci": [ "ruopenray-ui" ]
		},
		"write": {
			"ubus": {
				"uci": [ "set", "commit", "apply", "confirm" ],
				"service": [ "setInitAction" ]
			},
			"uci": [ "ruopenray-ui" ]
		}
	}
}
EOF
	cat > /usr/share/ucode/luci/template/ruopenray/dashboard.ut <<'EOF'
{% include('header') %}

<h2 name="content">{{ _('RuOpenRay UI') }}</h2>

<style>
	.ruopenray-launch {
		display: inline-flex !important;
		align-items: center;
		gap: 8px;
		width: auto !important;
		min-width: 0 !important;
		max-width: max-content !important;
		margin-top: 10px !important;
		padding: 7px 12px !important;
		border: 1px solid #35bff0;
		border-radius: 4px;
		background: transparent !important;
		color: #35bff0 !important;
		font-size: 14px !important;
		line-height: 1.2 !important;
		text-decoration: none !important;
	}
	.ruopenray-launch:hover {
		background: rgba(53, 191, 240, 0.12) !important;
	}
</style>

<div class="cbi-map">
	<div class="cbi-map-descr">
		Отдельная панель управления Xray: серверы, маршруты, DNS, логи и обновление ядра.
	</div>
	<div class="cbi-section">
		<p>RuOpenRay работает на роутере как отдельный веб-сервис.</p>
		<p><strong>Панель:</strong> <a id="ruopenray-link" href="http://192.168.1.1:9090/" target="_blank" rel="noopener">http://192.168.1.1:9090/</a></p>
		<a id="ruopenray-open" class="ruopenray-launch" href="http://192.168.1.1:9090/" target="_blank" rel="noopener">Открыть RuOpenRay UI</a>
	</div>
</div>

<script>
	(function() {
		var host = window.location.hostname;
		if (host.indexOf(':') >= 0 && host.charAt(0) !== '[') host = '[' + host + ']';
		var url = 'http://' + host + ':9090/';
		var link = document.getElementById('ruopenray-link');
		var button = document.getElementById('ruopenray-open');
		if (link) {
			link.href = url;
			link.textContent = url;
		}
	if (button)
		button.href = url;
	})();
</script>

{% include('footer') %}
EOF
	mkdir -p /www/luci-static/resources/view/ruopenray
	cat > /www/luci-static/resources/view/ruopenray/dashboard.js <<'EOF'
'use strict';
'require view';
'require uci';
'require rpc';
'require ui';

const callServiceAction = rpc.declare({
	object: 'service',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

function field(label, node, hint) {
	return E('div', { class: 'cbi-value' }, [
		E('label', { class: 'cbi-value-title' }, label),
		E('div', { class: 'cbi-value-field' }, hint ? [ node, E('div', { class: 'cbi-value-description' }, hint) ] : node)
	]);
}

function normalizeHost(host) {
	host = String(host || '').trim();
	return host || '0.0.0.0';
}

function normalizePort(port) {
	port = Number(port);
	return Number.isInteger(port) && port >= 1 && port <= 65535 ? String(port) : '';
}

function urlHost(host) {
	host = normalizeHost(host);
	if (host === '0.0.0.0' || host === '::') return window.location.hostname;
	return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function panelUrl(host, port) {
	return `http://${urlHost(host)}:${normalizePort(port) || '9090'}/`;
}

return view.extend({
	load() {
		return uci.load('ruopenray-ui');
	},

	render() {
		const host = normalizeHost(uci.get('ruopenray-ui', 'main', 'host'));
		const port = normalizePort(uci.get('ruopenray-ui', 'main', 'port')) || '9090';
		const url = panelUrl(host, port);

		const hostInput = E('input', {
			id: 'ruopenray-host',
			class: 'cbi-input-text',
			value: host,
			placeholder: '0.0.0.0'
		});
		const portInput = E('input', {
			id: 'ruopenray-port',
			class: 'cbi-input-text',
			value: port,
			inputmode: 'numeric',
			placeholder: '9090'
		});
		const link = E('a', {
			id: 'ruopenray-link',
			href: url,
			target: '_blank',
			rel: 'noopener'
		}, url);
		const openButton = E('a', {
			id: 'ruopenray-open',
			class: 'cbi-button cbi-button-apply',
			href: url,
			target: '_blank',
			rel: 'noopener'
		}, _('Открыть RuOpenRay UI'));

		const updatePreview = () => {
			const nextUrl = panelUrl(hostInput.value, portInput.value);
			link.href = nextUrl;
			link.textContent = nextUrl;
			openButton.href = nextUrl;
		};

		hostInput.addEventListener('input', updatePreview);
		portInput.addEventListener('input', updatePreview);

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, _('RuOpenRay UI')),
			E('div', { class: 'cbi-map-descr' }, _('Отдельная панель управления Xray: серверы, маршруты, DNS, логи и обновление ядра.')),
			E('div', { class: 'cbi-section' }, [
				E('p', {}, _('RuOpenRay работает на роутере как отдельный веб-сервис.')),
				E('p', {}, [ E('strong', {}, _('Панель: ')), link ]),
				E('p', {}, openButton)
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Доступ к сервису')),
				field(_('Bind address'), hostInput, _('Рекомендуется указать LAN-адрес роутера, например 192.168.1.1 или 192.168.50.1. 0.0.0.0 слушает все интерфейсы, 127.0.0.1 доступен только локально на роутере.')),
				field(_('Порт'), portInput, _('После сохранения сервис будет перезапущен. Если меняете порт, откройте панель по новой ссылке.')),
				E('div', { class: 'cbi-page-actions' }, [
					E('button', {
						class: 'cbi-button cbi-button-save',
						click: ui.createHandlerFn(this, 'saveSettings', hostInput, portInput)
					}, _('Сохранить и перезапустить'))
				])
			])
		]);
	},

	saveSettings(hostInput, portInput) {
		const host = normalizeHost(hostInput.value);
		const port = normalizePort(portInput.value);
		if (!port) {
			ui.addNotification(null, E('p', {}, _('Порт должен быть числом от 1 до 65535.')), 'danger');
			return Promise.resolve();
		}

		uci.set('ruopenray-ui', 'main', 'host', host);
		uci.set('ruopenray-ui', 'main', 'port', port);

		return uci.save()
			.then(() => uci.apply())
			.then(() => callServiceAction('ruopenray-ui', 'restart'))
			.then(() => {
				ui.addNotification(null, E('p', {}, _('Настройки сохранены, RuOpenRay UI перезапускается.')), 'info');
				window.setTimeout(() => {
					const url = panelUrl(host, port);
					const link = document.getElementById('ruopenray-link');
					const button = document.getElementById('ruopenray-open');
					if (link) {
						link.href = url;
						link.textContent = url;
					}
					if (button) button.href = url;
				}, 1200);
			})
			.catch((error) => {
				ui.addNotification(null, E('p', {}, error.message || String(error)), 'danger');
			});
	}
});
EOF
	[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
}

write_first_config() {
	[ -s "$ACTIVE_CONFIG" ] && return 0
	mkdir -p "$(dirname "$ACTIVE_CONFIG")"
	cat > "$ACTIVE_CONFIG" <<'EOF'
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "tag": "socks-in",
      "listen": "127.0.0.1",
      "port": 10808,
      "protocol": "socks",
      "settings": {
        "udp": true
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom"
    },
    {
      "tag": "block",
      "protocol": "blackhole"
    }
  ],
  "routing": {
    "domainStrategy": "AsIs",
    "rules": []
  }
}
EOF
	chmod 0600 "$ACTIVE_CONFIG"
}

install_route_scenarios() {
	[ "$INSTALL_SCENARIOS" = "1" ] || return 0
	[ -n "$SCENARIOS_URL" ] || return 0
	[ -x "$INSTALL_DIR/$APP_NAME" ] || return 0
	auto_arg="--no-auto-update"
	if [ "$SCENARIOS_AUTO_UPDATE" = "1" ]; then
		auto_arg="--auto-update"
	fi
	log "РџРѕРґРєР»СЋС‡Р°СЋ СЃС†РµРЅР°СЂРёРё RuOpenRay: $SCENARIOS_URL"
	if ! RUOPENRAY_DATA_DIR="$DATA_DIR" RUOPENRAY_GEO_DIR="$GEO_DIR" RUOPENRAY_BACKUP_DIR="$BACKUP_DIR" RUOPENRAY_XRAY_SERVICE="$XRAY_SERVICE" "$INSTALL_DIR/$APP_NAME" route-presets add-source "$SCENARIOS_URL" --name "$SCENARIOS_NAME" "$auto_arg" 8>&- >/tmp/ruopenray-scenarios-install.log 2>&1; then
		log "РџСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ: РЅРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃС†РµРЅР°СЂРёРё. РС… РјРѕР¶РЅРѕ РїРѕРґРєР»СЋС‡РёС‚СЊ РїРѕР·Р¶Рµ РІ РІРµР±-РїР°РЅРµР»Рё. Р›РѕРі: /tmp/ruopenray-scenarios-install.log"
	fi
}

start_service() {
	[ "$ENABLED" = 1 ] || { log "Панель отключена в UCI: бинарник проверен, служба не запускается."; return 0; }
	/etc/init.d/$SERVICE_NAME start 8>&-
	validate_service_readiness
}

candidate_panel_pid() {
	pids="$(pidof "$APP_NAME" 2>/dev/null || true)"
	for panel_pid in $pids; do
		[ -r "/proc/$panel_pid/environ" ] || continue
		running_sha="$(sha256sum "/proc/$panel_pid/exe" 2>/dev/null | awk '{print $1}')"
		[ "$running_sha" = "$expected_sha" ] || continue
		running_password="$(tr '\0' '\n' <"/proc/$panel_pid/environ" | sed -n 's/^RUOPENRAY_PASSWORD=//p' | tail -n1)"
		[ "$running_password" = "$PASSWORD" ] || continue
		printf '%s' "$panel_pid"
		return 0
	done
	return 1
}

validate_service_readiness() {
	probe_host="${HOST#[}"
	probe_host="${probe_host%]}"
	case "$probe_host" in 0.0.0.0) probe_host=127.0.0.1;; '::') probe_host='::1';; esac
	case "$probe_host" in *:*) probe_host="[$probe_host]";; esac
	ready_url="http://$probe_host:$PORT/api/version"
	i=0
	stable=0
	last_pid=""
	while [ "$i" -lt 30 ]; do
		panel_pid="$(candidate_panel_pid || true)"
		response_ok=0
		if [ -n "$panel_pid" ]; then
			if command -v curl >/dev/null 2>&1; then
				curl -fsS --noproxy '*' --connect-timeout 2 --max-time 3 -o "$ready_tmp" "$ready_url" 2>/dev/null && response_ok=1
			else
				http_proxy= https_proxy= HTTP_PROXY= HTTPS_PROXY= wget -q -T 3 -O "$ready_tmp" "$ready_url" 2>/dev/null && response_ok=1
			fi
		fi
		if [ "$response_ok" = 1 ] && [ "$(jsonfilter -i "$ready_tmp" -e '@.ok' 2>/dev/null)" = true ] && [ "$(jsonfilter -i "$ready_tmp" -e '@.appVersion' 2>/dev/null)" = "$CANDIDATE_VERSION" ]; then
			if [ "$panel_pid" = "$last_pid" ]; then stable=$((stable + 1)); else stable=1; fi
			[ "$stable" -lt 2 ] || return 0
			last_pid="$panel_pid"
		else
			stable=0
			last_pid=""
		fi
		sleep 1
		i=$((i + 1))
	done
	die "новая панель не подтвердила готовность HTTP, SHA-256 процесса и пароль; прежняя установка будет восстановлена"
}

print_summary() {
	ip_addr="$(uci -q get network.lan.ipaddr 2>/dev/null | sed 's,/.*,,')"
	[ -n "$ip_addr" ] || ip_addr="$(ip -4 addr show br-lan 2>/dev/null | sed -n 's/.*inet \([0-9.]*\).*/\1/p' | head -n1)"
	[ -n "$ip_addr" ] || ip_addr="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1)"
	[ -n "$ip_addr" ] || ip_addr="192.168.1.1"
	log ""
	log "Готово."
	log "Панель: http://${ip_addr}:${PORT}/"
	log "Пароль: ${PASSWORD}"
	if [ "$PASSWORD_GENERATED" = "1" ]; then
		log "Пароль сгенерирован автоматически. Сохраните его; позже можно сменить в веб-панели: Настройки -> Пароль."
	elif [ "$PASSWORD_REUSED" = "1" ]; then
		log "Использован уже заданный пароль из /etc/config/ruopenray-ui."
	fi
	if ! command -v xray >/dev/null 2>&1; then
		log "Xray пока не найден. Его можно установить из веб-панели или повторить установку с RUOPENRAY_INSTALL_XRAY=1."
	fi
}

if [ "${1:-}" = "uninstall" ] || [ "${RUOPENRAY_UNINSTALL:-0}" = "1" ]; then
	uninstall_openwrt
	exit 0
fi

need_root
detect_openwrt
detect_manager
detect_arch
load_installation_settings
ensure_password
check_space
install_dependencies
trap 'finish_installation $?' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
acquire_installer_lock
download_binary
acquire_operation_lock || die "выполняется другая операция панели; повторите установку после её завершения"
# Downloading can take minutes while the old panel remains usable. Re-read the
# latest UCI values and pending update plan under the same lock as the API/CLI.
load_installation_settings
ensure_password
begin_install_transaction
if [ -x "/etc/init.d/$SERVICE_NAME" ]; then /etc/init.d/$SERVICE_NAME stop 8>&- 9>&-; fi
mv "$tmp" "$INSTALL_DIR/$APP_NAME"
write_uci
write_init
write_luci_launcher
write_first_config
# Both new and restored panels acquire operation.lock during startup. Close the
# descriptor before procd starts them; retain the separate installer lock.
release_operation_lock
start_service
commit_installation
install_route_scenarios
print_summary
