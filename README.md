# RuOpenRay UI

Веб-панель для управления Xray на OpenWrt: серверы, подписки, маршрутизация, DNS, transparent proxy, диагностика и обслуживание логов в одном интерфейсе.

RuOpenRay UI работает как отдельный сервис через `procd`. В LuCI добавляется только ссылка на панель, а активная конфигурация Xray остается обычным JSON-файлом.

Актуальная публичная версия: `v0.4.0`.

![RuOpenRay UI icon](cmd/ruopenray-ui/web/assets/ruopenray-icon-512.png)

## Оглавление

- [Скриншоты](#скриншоты)
- [Быстрая установка](#быстрая-установка)
- [Что делает установщик](#что-делает-установщик)
- [Возможности](#возможности)
- [Сценарии маршрутизации](#сценарии-маршрутизации)
- [DNS](#dns)
- [Перехват трафика и nftables](#перехват-трафика-и-nftables)
- [Откат перехвата](#откат-перехвата)
- [Полезные команды](#полезные-команды)
- [Обновление](#обновление)
- [Удаление](#удаление)
- [Опции установки](#опции-установки)
- [Логи и место на роутере](#логи-и-место-на-роутере)
- [Слабые роутеры](#слабые-роутеры)
- [Локальный запуск](#локальный-запуск)
- [Проверки](#проверки)
- [Структура проекта](#структура-проекта)

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
      <sub>Live-Xray, проверка цепочки, DPI-пробы, SNI и архив диагностики.</sub><br><br>
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
- архив диагностики для передачи в поддержку;
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

## DNS

DNS в RuOpenRay разделен на несколько независимых частей, чтобы было понятно, что именно меняется:

- `DNS Xray` — секция `dns` в активном JSON-конфиге Xray;
- `DNS inbound` — локальный вход Xray `ruopenray_dns_in`, куда можно направить `dnsmasq`;
- `dns-out` — служебный outbound Xray с протоколом `dns`;
- `LAN DNS` — UCI-настройки `dnsmasq`, которые определяют DNS для домашних устройств;
- `DNS-перехват` — nftables-правила, которые перехватывают TCP/UDP 53 у LAN-клиентов.

Во вкладке `DNS -> Серверы` можно добавлять обычные IP, `tcp://` и DoH URL. Для DoH поддерживается Basic Auth: RuOpenRay собирает URL вида `https://user:pass@host/dns-query`, а в списках скрывает пароль. Поле `Только для доменов` добавляет доменные условия к DNS-серверу Xray, чтобы отдельные домены резолвились через выбранный DNS.

Во вкладках `Политики` и `Hosts` настраиваются правила самого Xray DNS: какие домены отправлять к какому DNS-серверу и какие статические ответы возвращать через `hosts`. Эти правила не меняют `dnsmasq`, пока отдельно не применен режим LAN DNS.

`DNS -> LAN DNS` управляет тем, куда OpenWrt `dnsmasq` отправляет запросы домашних устройств:

- `DNS через Xray`: ставит `dhcp.@dnsmasq[0].noresolv=1` и `dhcp.@dnsmasq[0].server=127.0.0.1#10535` или другой выбранный порт Xray DNS inbound;
- `Внешний DNS / Pi-hole`: ставит `noresolv=1` и направляет `dnsmasq` на указанный upstream, порт `53` добавляется автоматически, если порт не указан;
- `Как в OpenWrt`: удаляет переопределения `noresolv` и `server`, возвращая системный resolver WAN.

Перед применением LAN DNS панель показывает команды и проверяет готовность `ruopenray_dns_in`, `dns-out`, маршрута DNS и порта. По умолчанию используется порт `10535`: порт `5353` на OpenWrt часто занят mDNS/umdns, поэтому его лучше не выбирать без проверки.

DNS-перехват в разделе `Перехват` — отдельная защита. В режиме `TPROXY` nftables отправляет TCP/UDP 53 в transparent inbound Xray; в режиме `REDIRECT` TCP 53 редиректится, а UDP 53 может блокироваться guard-правилом. Это помогает, когда клиент пытается использовать DNS не через `dnsmasq`, но DoH/DoT приложений выглядит как обычный HTTPS/TLS-трафик и перехватывается уже обычными правилами маршрутизации.

Для мониторинга доменов RuOpenRay читает собственные Xray access/DNS-логи. Если нужно точнее привязывать DNS-запросы к LAN-устройствам при схеме `LAN -> dnsmasq -> Xray`, можно включить `dnsmasq logqueries`: тогда RuOpenRay будет разбирать строки `query[...]` из `logread`. Это удобно для диагностики, но на активной сети увеличивает объем системных логов.

## Перехват трафика и nftables

RuOpenRay включает transparent proxy отдельным набором правил nftables, не переписывая всю конфигурацию firewall4. Активные правила живут в таблице `inet ruopenray`, а постоянный черновик хранится в `/etc/ruopenray-ui/firewall.nft`. При применении старый файл `/etc/nftables.d/ruopenray.nft` удаляется, чтобы правила не дублировались.

В режиме `TPROXY` RuOpenRay:

- принимает LAN-трафик на inbound Xray `transparent_ipv4`, обычно порт `52345`;
- добавляет nft-правила `prerouting` для выбранного LAN-интерфейса, клиентов и портов;
- ставит `meta mark 1` и policy routing `fwmark 1/1 -> table 100`;
- добавляет маршрут `local 0.0.0.0/0 dev lo table 100`, чтобы помеченный трафик попадал в Xray;
- сохраняет hotplug-скрипты `/etc/hotplug.d/iface/90-ruopenray-tproxy` и `/etc/hotplug.d/firewall/90-ruopenray-tproxy`, чтобы правила переживали reload firewall и события интерфейсов.

В режиме `REDIRECT` используется nat redirect на порт transparent inbound. Это проще, но работает только для TCP; UDP и QUIC в таком режиме либо не перехватываются, либо блокируются защитными правилами, если это включено.

Базовые локальные сети и служебные адреса исключаются из перехвата, чтобы не ломать доступ к роутеру и домашней сети. DNS-перехват, блокировка QUIC, режимы `Direct мимо Xray`, `Только proxy` и защита от утечек добавляют дополнительные правила и, где нужно, `dnsmasq` `nftset`/`address` записи.

Применение firewall не должно перезапускать Xray. Но сам Xray-конфиг должен уже содержать подходящий transparent inbound и маршруты, иначе nftables будет отправлять трафик в порт, который никто не слушает.

## Откат перехвата

Самый безопасный способ вернуть сеть: в панели открыть `Перехват` и нажать `Отключить`. Это удаляет таблицу `inet ruopenray`, policy routing, hotplug-скрипты, DNS/nftset-следы защиты и перезагружает firewall/dnsmasq там, где это нужно.

Если панель недоступна, можно выполнить аварийный откат по SSH:

```sh
rm -f /etc/ruopenray-ui/firewall.nft
rm -f /etc/nftables.d/ruopenray.nft
rm -f /etc/hotplug.d/iface/90-ruopenray-tproxy
rm -f /etc/hotplug.d/firewall/90-ruopenray-tproxy
nft delete table inet ruopenray 2>/dev/null || true
ip rule del fwmark 1/1 table 100 2>/dev/null || true
ip rule del fwmark 1 table 100 2>/dev/null || true
ip route flush table 100 2>/dev/null || true
/etc/init.d/firewall reload 2>/dev/null || true
```

Если LAN DNS был направлен в Xray, верните `dnsmasq` к системному resolver:

```sh
uci -q delete dhcp.@dnsmasq[0].noresolv
uci -q delete dhcp.@dnsmasq[0].server
uci commit dhcp
/etc/init.d/dnsmasq restart
```

После аварийного отката Xray можно оставить запущенным: без nft/policy routing LAN-трафик уже не будет принудительно уходить в transparent inbound.

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

Скачать архив диагностики можно из интерфейса: `Диагностика -> Скачать диагностику`.

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

Перед удалением панели лучше сначала отключить перехват в интерфейсе или выполнить команды из раздела `Откат перехвата`. Иначе при ручном удалении только бинарника можно оставить на роутере активные nft/policy routing правила.

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
