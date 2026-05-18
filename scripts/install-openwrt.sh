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
ACTIVE_CONFIG="${RUOPENRAY_ACTIVE_CONFIG:-/etc/xray/config.json}"
XRAY_SERVICE="${RUOPENRAY_XRAY_SERVICE:-xray}"
RELEASE_BASE_URL="${RUOPENRAY_RELEASE_BASE_URL:-https://github.com/AceAsket/RuOpenRay/releases/latest/download}"
INSTALL_XRAY="${RUOPENRAY_INSTALL_XRAY:-0}"
MIN_FREE_KB="${RUOPENRAY_MIN_FREE_KB:-12288}"
START_DELAY="${RUOPENRAY_START_DELAY:-0}"
APPLY_DELAY="${RUOPENRAY_APPLY_DELAY:-0}"
DOWNLOAD_MIRROR="${RUOPENRAY_DOWNLOAD_MIRROR:-direct}"
MIRROR_PREFIX="${RUOPENRAY_MIRROR_PREFIX:-}"

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

ensure_password() {
	if [ -z "$PASSWORD" ]; then
		PASSWORD="$(generate_password)"
		PASSWORD_GENERATED=1
	fi
	[ -n "$PASSWORD" ] || die "не удалось сгенерировать пароль"
	case "$PASSWORD" in
		*"'"*) die "RUOPENRAY_PASSWORD не должен содержать одинарную кавычку" ;;
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
	rm -f "$INSTALL_DIR/$APP_NAME"
	if command -v uci >/dev/null 2>&1; then
		uci -q delete ruopenray-ui.main || true
		uci -q commit ruopenray-ui || true
	fi
	if [ -f /etc/crontabs/root ]; then
		grep -v 'RuOpenRay geo update' /etc/crontabs/root > /tmp/ruopenray-cron.$$ || true
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
	if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
		pkg_install_oneof curl wget-ssl wget || die "нужен curl или wget для скачивания RuOpenRay UI"
	fi
	pkg_install kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket || die "не удалось установить TPROXY-модули: kmod-nf-tproxy, kmod-nft-tproxy, kmod-nft-socket"
	if [ "$INSTALL_XRAY" = "1" ] && ! command -v xray >/dev/null 2>&1; then
		log "Xray не найден, устанавливаю xray-core..."
		pkg_install_oneof xray-core xray || die "не удалось установить Xray"
	fi
}

download_binary() {
	mkdir -p "$INSTALL_DIR"
	tmp="/tmp/${APP_NAME}.$$"
	if [ -n "${RUOPENRAY_BINARY_URL:-}" ]; then
		url="$RUOPENRAY_BINARY_URL"
	else
		url="${RELEASE_BASE_URL}/${ASSET_NAME}"
	fi
	log "Скачиваю RuOpenRay UI: $url"
	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout 15 --max-time 180 -o "$tmp" "$url"
	elif command -v wget >/dev/null 2>&1; then
		wget -O "$tmp" "$url"
	else
		die "нужен curl или wget для скачивания бинарника"
	fi
	[ -s "$tmp" ] || die "скачанный файл пустой"
	chmod 0755 "$tmp"
	mv "$tmp" "$INSTALL_DIR/$APP_NAME"
}

write_uci() {
	mkdir -p "$DATA_DIR/profiles" "$BACKUP_DIR" "$GEO_DIR" "$(dirname "$ACTIVE_CONFIG")"
	uci -q batch <<EOF
set ruopenray-ui.main=ruopenray-ui
set ruopenray-ui.main.enabled='1'
set ruopenray-ui.main.host='$HOST'
set ruopenray-ui.main.port='$PORT'
set ruopenray-ui.main.password='$PASSWORD'
set ruopenray-ui.main.data_dir='$DATA_DIR'
set ruopenray-ui.main.backup_dir='$BACKUP_DIR'
set ruopenray-ui.main.geo_dir='$GEO_DIR'
set ruopenray-ui.main.active_config='$ACTIVE_CONFIG'
set ruopenray-ui.main.xray_service='$XRAY_SERVICE'
set ruopenray-ui.main.start_delay='$START_DELAY'
set ruopenray-ui.main.apply_delay='$APPLY_DELAY'
set ruopenray-ui.main.go_memlimit='48MiB'
set ruopenray-ui.main.go_gc='60'
set ruopenray-ui.main.download_mirror='$DOWNLOAD_MIRROR'
set ruopenray-ui.main.mirror_prefix='$MIRROR_PREFIX'
commit ruopenray-ui
EOF
}

write_init() {
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
			"type": "template",
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
				"session": [ "access" ]
			}
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
		var url = window.location.protocol + '//' + window.location.hostname + ':9090/';
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

enable_xray_service_config() {
	command -v xray >/dev/null 2>&1 || return 0
	[ -x "/etc/init.d/$XRAY_SERVICE" ] || return 0
	if command -v uci >/dev/null 2>&1 && uci -q get xray.enabled >/dev/null 2>&1; then
		uci -q set xray.enabled.enabled='1' || true
		uci -q commit xray || true
	fi
	"/etc/init.d/$XRAY_SERVICE" enable >/dev/null 2>&1 || true
}

start_service() {
	/etc/init.d/$SERVICE_NAME enable
	/etc/init.d/$SERVICE_NAME restart
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
ensure_password
check_space
install_dependencies
download_binary
write_uci
write_init
write_luci_launcher
write_first_config
enable_xray_service_config
start_service
print_summary
