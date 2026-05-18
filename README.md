# RuOpenRay UI MVP

Standalone Russian web UI for managing Xray on OpenWrt. The project now has two runtimes:

- `server/index.js` - Node.js development stand.
- `main.go` - dependency-free Go service for OpenWrt packaging with embedded `web/` UI.

![RuOpenRay UI icon](web/assets/ruopenray-icon-512.png)

## Run locally

```sh
node server/index.js
```

Open `http://127.0.0.1:9090`.

Default password is `admin`. Set `RUOPENRAY_PASSWORD` for anything real.

## Build Go binary

```sh
go build -o ruopenray-ui .
./ruopenray-ui
```

The Go binary embeds the `web/` directory and exposes the same MVP API as the Node stand.
GitHub Actions also builds Linux artifacts for common router targets on every push.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `RUOPENRAY_HOST` | `127.0.0.1` | Bind address |
| `RUOPENRAY_PORT` | `9090` | HTTP port |
| `RUOPENRAY_PASSWORD` | `admin` | UI password |
| `RUOPENRAY_DATA_DIR` | `./data` | Runtime data |
| `RUOPENRAY_PROFILES_DIR` | `./data/profiles` | Profile JSON files |
| `RUOPENRAY_ACTIVE_CONFIG` | `./data/config.json` | Active Xray config |
| `RUOPENRAY_XRAY_SERVICE` | `xray` | OpenWrt init service name |

## MVP API

- `GET /api/status`
- `POST /api/service` with `{ "action": "start|stop|restart" }`
- `GET /api/config`
- `POST /api/config/test`
- `POST /api/config/apply`
- `GET /api/profiles`
- `POST /api/profiles`
- `POST /api/profiles/activate`
- `POST /api/import`
- `GET /api/logs?kind=error`
- `POST /api/backup`

## MVP UI

- Russian dashboard for Xray service state, profiles, logs, and config checks.
- Visual server/outbound list with protocol, address, transport, route usage, and draft cleanup controls.
- LAN device rules by source IP: proxy, direct, block, or any configured outbound without editing JSON.
- DNS editor for Xray `dns.servers` and `dns.hosts`, including DoH/TCP presets.
- Link import with preview for VLESS, VMess, Trojan, and Shadowsocks, plus subscription URL import.
- DHCP lease lookup for naming LAN devices when RuOpenRay runs on OpenWrt.
- Visual routing builder for common Russian OpenWrt workflows: sites, IP ranges, LAN devices, ports, and quick presets for YouTube, Discord, ChatGPT, and local network bypass.
- Transparent proxy helper that detects TProxy/DNS/LAN bypass pieces and prepares an Xray draft plus OpenWrt nftables command notes.

### Link import

```sh
curl -H "Authorization: Bearer <openray-token>" \
  -H "Content-Type: application/json" \
  -d '{"link":"vless://...","profileName":"my-profile"}' \
  http://127.0.0.1:9090/api/import
```

## OpenWrt packaging

Package skeleton lives in `packaging/openwrt`. In an OpenWrt buildroot/feed, the package installs:

```text
/usr/bin/ruopenray-ui
/etc/init.d/ruopenray-ui
/etc/ruopenray-ui/
/etc/ruopenray-ui/profiles/
```

The OpenWrt package depends on `ca-bundle`, `kmod-nf-tproxy`, `kmod-nft-tproxy`, and `kmod-nft-socket`, so the transparent TPROXY mode has the kernel pieces it needs on both OpenWrt 24 (`opkg`) and OpenWrt 25 (`apk`).

The package uses a procd service and UCI config from:

- `packaging/openwrt/files/etc/init.d/ruopenray-ui`
- `packaging/openwrt/files/etc/config/ruopenray-ui`

Change the panel password on OpenWrt with:

```sh
uci set ruopenray-ui.main.password='change-me'
uci commit ruopenray-ui
/etc/init.d/ruopenray-ui restart
```

## Install on OpenWrt from GitHub

For a router shell, the quick install command is:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

If `wget` is missing but `curl` is available:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

Useful options:

```sh
RUOPENRAY_PASSWORD='change-me' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
RUOPENRAY_PORT=9091 RUOPENRAY_INSTALL_XRAY=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
RUOPENRAY_START_DELAY=20 RUOPENRAY_APPLY_DELAY=5 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
RUOPENRAY_DOWNLOAD_MIRROR=custom RUOPENRAY_MIRROR_PREFIX='https://gh-proxy.example/?url={url}' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

The installer detects OpenWrt 24/25 package manager (`opkg` or `apk`), installs the TPROXY kernel modules, checks router architecture, downloads the matching RuOpenRay UI release binary, creates UCI/procd files, adds the LuCI launcher, enables the service, and prints the dashboard URL.

Service lifecycle commands:

```sh
ruopenray-ui version
ruopenray-ui diagnostics
ruopenray-ui backup
ruopenray-ui update --backup
ruopenray-ui uninstall
```

Uninstall from GitHub without keeping the script:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)" -- uninstall
RUOPENRAY_PURGE=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)" -- uninstall
```

## Private router regression tests

The repository includes a safe test harness that does not contain real server URLs, UUIDs, Reality keys, or SNI values. It reads the current router config over the local RuOpenRay API, creates temporary Xray configs under `.tmp-xray-tests/`, uploads them to `/tmp` on the router, and removes them after the run.

Run it from a Windows host that can reach the OpenWrt stand:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\router-regression.ps1 `
  -Router 192.168.1.1 `
  -PanelPassword admin `
  -LanClientIp 192.168.1.190
```

Optional environment variables:

```powershell
$env:RUOPENRAY_ROUTER='192.168.1.1'
$env:RUOPENRAY_PANEL_PASSWORD='admin'
$env:RUOPENRAY_LAN_CLIENT_IP='192.168.1.190'
```

The test covers proxy outbounds, direct, block, and transparent TPROXY routing. `.tmp-xray-tests/`, `.private/`, and `*.local.json` are ignored by Git so private stand data stays local.

For a faster pre-push check without changing firewall modes:

```powershell
npm run scan:private
npm run test:router:quick
```

The full router test additionally applies and verifies `TPROXY`, `BYPASS`, `REDIRECT`, Xray stats growth, and DNS dry-run plans. It restores the Xray config after the run and leaves RuOpenRay's persistent firewall in the recommended TPROXY mode.

## Notes

- On Windows/local dev, service and `xray run -test` calls use a mock path so the interface can be tested without a router.
- On OpenWrt/Linux, the backend calls `/etc/init.d/xray` and `xray run -test -config`.
- Imported VLESS, VMess, Trojan, and Shadowsocks links are converted into Xray outbound objects and saved as a new profile.
