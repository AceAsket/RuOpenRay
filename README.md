# RuOpenRay UI

Веб-панель для настройки Xray на OpenWrt: серверы, маршрутизация, DNS, перехват трафика и диагностика в одном интерфейсе.

RuOpenRay запускается как отдельный сервис через `procd`. В LuCI добавляется только ссылка на панель.

![RuOpenRay UI icon](cmd/ruopenray-ui/web/assets/ruopenray-icon-512.png)

## Установка

Выполните на роутере:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

Если `RUOPENRAY_PASSWORD` не указан, установщик сгенерирует пароль и выведет его в конце установки.

Если вместо `wget` есть только `curl`:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

Лучше сразу задать пароль:

```sh
RUOPENRAY_PASSWORD='change-me' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

После установки панель обычно будет здесь:

```text
http://192.168.1.1:9090/
```

Установщик берет скрипт из `main`, а бинарник из последнего GitHub Release:

```text
https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh
https://github.com/AceAsket/RuOpenRay/releases/latest/download/ruopenray-ui-linux-arm64
```

## Что делает установщик

- определяет OpenWrt и пакетный менеджер: `opkg` или `apk`;
- определяет архитектуру роутера;
- ставит нужные зависимости для TPROXY;
- скачивает подходящий бинарник RuOpenRay UI;
- создает UCI-конфиг и init-скрипт;
- добавляет ссылку в LuCI;
- запускает сервис.

Поддерживаемые бинарники:

```text
ruopenray-ui-linux-amd64
ruopenray-ui-linux-arm64
ruopenray-ui-linux-armv7
ruopenray-ui-linux-mips-softfloat
ruopenray-ui-linux-mipsle-softfloat
```

## Зависимости

Для transparent proxy установщик ставит:

```text
kmod-nf-tproxy
kmod-nft-tproxy
kmod-nft-socket
```

Xray не заменяется, если он уже установлен. Если Xray нет, можно поставить его через панель или так:

```sh
RUOPENRAY_INSTALL_XRAY=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

## Что есть в панели

- импорт серверов и подписок;
- переключение основного proxy-направления;
- группы серверов и балансировщики;
- правила маршрутизации для доменов, IP, LAN-устройств, портов и inbound;
- DNS-серверы, hosts, защита от утечек DNS и настройка dnsmasq для LAN;
- TPROXY/REDIRECT/BYPASS режимы перехвата;
- обновление Xray core и geo-файлов;
- логи, SNI/domain monitor, статистика Xray и проверка прохождения трафика.

## Полезные команды

```sh
ruopenray-ui version
ruopenray-ui diagnostics
ruopenray-ui backup
ruopenray-ui update --backup
ruopenray-ui uninstall
```

Сменить пароль:

```sh
uci set ruopenray-ui.main.password='change-me'
uci commit ruopenray-ui
/etc/init.d/ruopenray-ui restart
```

Удалить панель:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)" -- uninstall
```

Удалить вместе с данными RuOpenRay:

```sh
RUOPENRAY_PURGE=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)" -- uninstall
```

Обычное удаление не трогает Xray и geo-файлы.

## Опции установки

```sh
# другой порт панели
RUOPENRAY_PORT=9091 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"

# поставить Xray, если его нет
RUOPENRAY_INSTALL_XRAY=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"

# задержать старт панели после загрузки
RUOPENRAY_START_DELAY=20 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"

# использовать зеркало для GitHub downloads
RUOPENRAY_DOWNLOAD_MIRROR=custom \
RUOPENRAY_MIRROR_PREFIX='https://gh-proxy.example/?url={url}' \
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

## Слабые роутеры

RuOpenRay рассчитан на небольшие OpenWrt-устройства, но место и память все равно важны.

По умолчанию сервис запускается с:

```text
GOMEMLIMIT=48MiB
GOGC=60
```

Перед обновлением Xray core и geo-файлов панель проверяет свободное место. Бэкап крупных файлов можно отключить в UI, если NAND почти заполнен.

## Локальный запуск

Node-стенд:

```sh
npm install
node tools/dev-server/index.js
```

Go-сервис:

```sh
go build -o ruopenray-ui ./cmd/ruopenray-ui
./ruopenray-ui
```

Локальный адрес:

```text
http://127.0.0.1:9090/
```

Основные переменные:

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `RUOPENRAY_HOST` | `127.0.0.1` локально, `0.0.0.0` на OpenWrt | адрес бинда |
| `RUOPENRAY_PORT` | `9090` | порт панели |
| `RUOPENRAY_PASSWORD` | генерируется установщиком, локально `admin` | пароль |
| `RUOPENRAY_DATA_DIR` | `./data` локально, `/etc/ruopenray-ui` на OpenWrt | данные панели |
| `RUOPENRAY_ACTIVE_CONFIG` | `./data/config.json` локально, `/etc/xray/config.json` на OpenWrt | активный config Xray |
| `RUOPENRAY_XRAY_SERVICE` | `xray` | имя сервиса Xray |

## Проверки

```sh
go test ./...
```

Проверка, что в репозиторий не попали приватные серверы и ключи:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scan-private.ps1
```

Приватный тест роутера:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\router-regression.ps1 `
  -Router 192.168.1.1 `
  -PanelPassword admin `
  -LanClientIp 192.168.1.190
```

## Структура

```text
cmd/ruopenray-ui/               backend на Go и embedded frontend
cmd/ruopenray-ui/web/           фронтенд
internal/                       внутренние Go-пакеты
tools/dev-server/index.js       локальный Node-стенд
scripts/install-openwrt.sh      установка с GitHub Releases
scripts/router-regression.ps1   приватные тесты роутера
packaging/openwrt/              заготовка пакета и LuCI launcher
docs/                           заметки по интерфейсу
```

## Статус

Текущая публичная версия: `v0.1.2`.

Это ранняя версия. Перед применением на основном роутере проверьте:

- `xray run -test` через кнопку проверки config;
- DNS и dnsmasq;
- nftables/TPROXY правила;
- статистику Xray или клиентский тест трафика.
