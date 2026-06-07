# RuOpenRay UI

Веб-панель для управления Xray на OpenWrt: серверы, подписки, маршрутизация, DNS, transparent proxy, диагностика и обслуживание логов в одном интерфейсе.

RuOpenRay UI работает как отдельный сервис через `procd`. В LuCI добавляется только ссылка на панель, а активная конфигурация Xray остается обычным JSON-файлом.

Актуальная публичная версия: `v0.4.0`.

![RuOpenRay UI icon](cmd/ruopenray-ui/web/assets/ruopenray-icon-512.png)

## Скриншоты

Скриншоты сделаны на локальном демо-конфиге: без реальных маршрутов, подписок и proxy-адресов. Нажмите на картинку, чтобы открыть ее в полном размере.

<table>
  <tr>
    <td width="50%">
      <strong>Панель</strong><br>
      <sub>Состояние Xray, ресурсы роутера, предупреждения по логам и активные proxy-направления.</sub><br><br>
      <a href="docs/screenshots/dashboard.png">
        <img src="docs/screenshots/dashboard.png" alt="Панель RuOpenRay UI">
      </a>
    </td>
    <td width="50%">
      <strong>Маршрутизация</strong><br>
      <sub>Правила Xray, массовые действия, замена серверов и порядок выполнения сверху вниз.</sub><br><br>
      <a href="docs/screenshots/routing.png">
        <img src="docs/screenshots/routing.png" alt="Маршрутизация RuOpenRay UI">
      </a>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>DNS</strong><br>
      <sub>DNS-серверы, DoH/UDP/TCP пресеты, проверка резолва и порядок обработки DNS.</sub><br><br>
      <a href="docs/screenshots/dns.png">
        <img src="docs/screenshots/dns.png" alt="DNS RuOpenRay UI">
      </a>
    </td>
    <td width="50%">
      <strong>Диагностика</strong><br>
      <sub>Live-Xray, проверка цепочки, DPI-пробы, SNI и диагностический пакет.</sub><br><br>
      <a href="docs/screenshots/diagnostics.png">
        <img src="docs/screenshots/diagnostics.png" alt="Диагностика RuOpenRay UI">
      </a>
    </td>
  </tr>
</table>

## Быстрая установка

Выполните на роутере:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

Если вместо `wget` доступен только `curl`:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

Если `RUOPENRAY_PASSWORD` не указан, установщик сгенерирует пароль и покажет его в конце установки. Лучше сразу задать свой:

```sh
RUOPENRAY_PASSWORD='change-me' sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

После установки панель обычно доступна по адресу:

```text
http://192.168.1.1:9090/
```

## Что делает установщик

- определяет OpenWrt, пакетный менеджер `opkg`/`apk` и архитектуру роутера;
- ставит зависимости для transparent proxy;
- скачивает подходящий бинарник RuOpenRay UI из последнего GitHub Release;
- создает UCI-конфиг и init-скрипт;
- добавляет ссылку в LuCI;
- по умолчанию подключает внешний каталог сценариев из `AceAsket/RuOpenRay-scenarios`;
- запускает сервис панели.

Поддерживаемые бинарники:

```text
ruopenray-ui-linux-amd64
ruopenray-ui-linux-arm64
ruopenray-ui-linux-armv7
ruopenray-ui-linux-mips-softfloat
ruopenray-ui-linux-mipsle-softfloat
```

Для transparent proxy установщик ставит:

```text
kmod-nf-tproxy
kmod-nft-tproxy
kmod-nft-socket
```

Xray не заменяется, если он уже установлен. Если Xray нет, можно поставить его через панель или сразу при установке:

```sh
RUOPENRAY_INSTALL_XRAY=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

## Возможности

- импорт одиночных серверов и subscription URL;
- Basic Auth для подписок и DoH-серверов;
- ежедневное автообновление подписок с настраиваемым временем;
- группы серверов, балансировщики и быстрый выбор активного proxy-направления;
- массовая замена outbound в правилах;
- маршрутизация доменов, IP/подсетей, LAN-устройств, портов и inbound;
- внешние сценарии маршрутизации из Git/raw JSON без пересборки бинарника;
- ручные multi-rule правила и группировка выбранных правил в интерфейсе;
- DNS Xray, hosts, LAN DNS через dnsmasq, защита от DNS-утечек;
- TPROXY/REDIRECT, policy routing и проверка firewall;
- настройка Reality/VLESS, fingerprint Xray и параметры фрагментации рукопожатия с proxy;
- DPI-проверки: direct/proxy сравнение, redirect-анализ, UDP/QUIC 443 и fat probes;
- Live-Xray, проверка цепочки, SNI-карта, traffic test и мониторинг доменов;
- диагностический пакет для передачи в поддержку;
- обновление Xray core, geo-файлов и самой панели;
- профили конфигураций: скачать, скачать обезличенно, редактировать, активировать и удалить;
- обслуживание логов с ротацией без перезапуска Xray.

## Сценарии маршрутизации

Встроенных сценариев в бинарнике нет. По умолчанию установщик добавляет внешний источник:

```text
https://raw.githubusercontent.com/AceAsket/RuOpenRay-scenarios/main/scenarios.json
```

В панели можно добавить свои источники, проверить их до сохранения и обновлять вручную или по расписанию. Формат сценариев описан в репозитории [AceAsket/RuOpenRay-scenarios](https://github.com/AceAsket/RuOpenRay-scenarios).

Приоритет сценариев:

1. локальные пользовательские сценарии из UI;
2. подключенные Git/raw-источники сверху вниз;
3. сценарии из дефолтного источника, если он подключен.

Перед применением RuOpenRay проверяет структуру каталога, количество правил, SVG-иконки и shape правил Xray.

## Полезные команды

```sh
ruopenray-ui version
ruopenray-ui diagnostics
ruopenray-ui backup
ruopenray-ui update --backup
ruopenray-ui route-presets add-source <url> --name "My scenarios"
ruopenray-ui route-presets update
ruopenray-ui uninstall
```

Сменить пароль панели:

```sh
uci set ruopenray-ui.main.password='change-me'
uci commit ruopenray-ui
/etc/init.d/ruopenray-ui restart
```

Скачать диагностический пакет можно из интерфейса: `Диагностика -> Скачать пакет`.

## Обновление

Обновить панель:

```sh
ruopenray-ui update --backup
```

Или переустановить последнюю версию через install-скрипт:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

Обновить Xray core можно из панели в разделе `Настройки -> Обновление`.

## Удаление

Удалить только панель:

```sh
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)" -- uninstall
```

Удалить вместе с данными RuOpenRay:

```sh
RUOPENRAY_PURGE=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)" -- uninstall
```

Обычное удаление не трогает Xray, geo-файлы и пользовательские конфиги Xray.

## Опции установки

```sh
# другой порт панели
RUOPENRAY_PORT=9091 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"

# поставить Xray, если его нет
RUOPENRAY_INSTALL_XRAY=1 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"

# задержать старт панели после загрузки
RUOPENRAY_START_DELAY=20 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"

# не добавлять дефолтный источник сценариев
RUOPENRAY_INSTALL_SCENARIOS=0 sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"

# использовать зеркало для GitHub downloads
RUOPENRAY_DOWNLOAD_MIRROR=custom \
RUOPENRAY_MIRROR_PREFIX='https://gh-proxy.example/?url={url}' \
sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"
```

Основные переменные:

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `RUOPENRAY_HOST` | `0.0.0.0` на OpenWrt, `127.0.0.1` локально | адрес бинда |
| `RUOPENRAY_PORT` | `9090` | порт панели |
| `RUOPENRAY_PASSWORD` | генерируется установщиком, локально `admin` | пароль |
| `RUOPENRAY_DATA_DIR` | `/etc/ruopenray-ui` на OpenWrt, `./data` локально | данные панели |
| `RUOPENRAY_ACTIVE_CONFIG` | `/etc/xray/config.json` на OpenWrt, `./data/config.json` локально | активный config Xray |
| `RUOPENRAY_XRAY_SERVICE` | `xray` | имя сервиса Xray |
| `RUOPENRAY_INSTALL_SCENARIOS` | `1` | подключить дефолтный источник сценариев |
| `RUOPENRAY_SCENARIOS_URL` | `https://raw.githubusercontent.com/AceAsket/RuOpenRay-scenarios/main/scenarios.json` | URL каталога сценариев |
| `RUOPENRAY_SCENARIOS_NAME` | `RuOpenRay scenarios` | название дефолтного источника |
| `RUOPENRAY_SCENARIOS_AUTO_UPDATE` | `0` | включить ежедневное автообновление сценариев |

## Логи и место на роутере

Access-log и debug/info-логирование быстро расходуют flash-память на активном трафике. Для постоянной работы лучше держать уровень `warning` или `error`, а подробные логи включать только на время диагностики.

RuOpenRay умеет:

- показывать предупреждения о подробных логах на главной;
- ротировать access/error/DNS-логи по размеру;
- очищать логи вручную;
- читать доменные события из собственных Xray access/DNS-логов.

Ротация не требует перезапуска Xray.

## Слабые роутеры

RuOpenRay рассчитан на небольшие OpenWrt-устройства, но свободное место и память все равно важны. По умолчанию сервис запускается с:

```text
GOMEMLIMIT=48MiB
GOGC=60
```

Перед обновлением Xray core и geo-файлов панель проверяет свободное место. На устройствах с небольшим NAND бэкап крупных файлов можно отключить в интерфейсе.

## Локальный запуск

Node-стенд:

```sh
npm install
npm run dev
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

## Проверки

```sh
go test ./...
npm run test:frontend
```

Перед применением на основном роутере проверьте:

- `xray run -test` через кнопку проверки config;
- DNS и dnsmasq;
- nftables/TPROXY правила;
- статистику Xray или клиентский тест трафика.

## Структура проекта

```text
cmd/ruopenray-ui/        основной сервис: HTTP API, OpenWrt-интеграция и embedded frontend
cmd/ruopenray-ui/web/    frontend панели: экраны, диалоги, состояние, API-клиент и стили
internal/                backend-пакеты: DNS, firewall, geodata, routing, proxy, статистика Xray
scripts/                 установка, проверки и регрессионные сценарии
openwrt/                 файлы для OpenWrt-пакета и LuCI launcher
tools/dev-server/        локальный стенд с моками API для разработки интерфейса
tests/                   тесты и вспомогательные проверки
docs/                    заметки, документация и скриншоты
```

Frontend устроен модульно: `app.js` собирает состояние, API, действия и экраны. Отдельные разделы панели лежат в `cmd/ruopenray-ui/web/`, обработчики пользовательских действий — в `*-actions.js`, а привязка DOM-событий — в `*-bindings.js`.

Серверы, правила, подборки, geo-источники и настройки firewall хранятся на роутере. В браузере остается только токен текущей сессии и состояние интерфейса вроде вкладки, фильтра или раскрытого блока.
