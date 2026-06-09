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
- [API](#api)
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
- DNS Xray, hosts, LAN DNS через dnsmasq, совместимость с Pi-hole/AdGuard Home, защита от DNS-утечек;
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

DNS в RuOpenRay разделен на несколько независимых частей. Это важно: можно настроить DNS внутри Xray, но домашние устройства не начнут им пользоваться, пока `dnsmasq` OpenWrt не будет направлен в Xray.

- `DNS Xray` — список DNS-серверов и правил, которыми пользуется сам Xray;
- `DNS inbound` — локальный вход Xray `ruopenray_dns_in`; в него можно направить DNS-запросы от OpenWrt;
- `dns-out` — служебный выход Xray, через который DNS-запросы уходят к выбранным DNS-серверам;
- `LAN DNS` — настройка `dnsmasq`, то есть куда роутер отправляет DNS-запросы телефонов, ПК и других домашних устройств; здесь же панель показывает подсказки для Pi-hole и AdGuard Home;
- `DNS-перехват` — firewall-правила, которые ловят попытки клиентов обращаться к DNS напрямую на TCP/UDP 53.

Во вкладке `DNS -> Серверы` можно добавлять обычные IP, `tcp://` и DoH URL. Для DoH поддерживается Basic Auth: RuOpenRay собирает URL вида `https://user:pass@host/dns-query`, а в списках скрывает пароль. Поле `Только для доменов` добавляет доменные условия к DNS-серверу Xray, чтобы отдельные домены резолвились через выбранный DNS.

Во вкладках `Политики` и `Hosts` настраиваются правила самого Xray DNS: какие домены отправлять к какому DNS-серверу и какие статические ответы возвращать через `hosts`. Эти правила не меняют `dnsmasq`, пока отдельно не применен режим LAN DNS.

`DNS -> LAN DNS` управляет тем, куда OpenWrt `dnsmasq` отправляет запросы домашних устройств. По сути это выбор главного DNS для локальной сети:

- `DNS через Xray`: домашние устройства спрашивают DNS у роутера, роутер передает запросы в Xray, а Xray уже выбирает нужный DNS-сервер по своим правилам;
- `Внешний DNS / Pi-hole / AdGuard`: домашние устройства спрашивают DNS у роутера, а роутер пересылает запросы на указанный Pi-hole, AdGuard Home или внешний DNS;
- `Как в OpenWrt`: RuOpenRay убирает свои DNS-переопределения и возвращает обычную схему OpenWrt/WAN.

Технически режим `DNS через Xray` ставит `dhcp.@dnsmasq[0].noresolv=1` и `dhcp.@dnsmasq[0].server=127.0.0.1#10535` или другой выбранный порт Xray DNS inbound. Режим `Как в OpenWrt` удаляет эти переопределения.

Перед применением LAN DNS панель показывает команды и проверяет готовность `ruopenray_dns_in`, `dns-out`, маршрута DNS и порта. По умолчанию используется порт `10535`: порт `5353` на OpenWrt часто занят mDNS/umdns, поэтому его лучше не выбирать без проверки.

Для AdGuard Home есть два режима совместимости.

Рекомендуемый режим для RuOpenRay — `AdGuard после Xray`:

```text
LAN-клиент -> DNS-перехват/dnsmasq -> Xray DNS -> AdGuard Home -> внешний DNS
```

В этом режиме RuOpenRay первым видит домены, может диагностировать DNS и маршрутизацию, а AdGuard Home остается фильтрующим DNS-сервером после Xray. Кнопка `Подготовить Xray -> AdGuard` добавляет локальный AdGuard Home в `dns.servers` Xray и поднимает DNS inbound, но не переписывает YAML AdGuard.

Второй режим — `AdGuard перед Xray`:

```text
LAN-клиент -> AdGuard Home/Pi-hole -> Xray DNS -> DNS-сервер по правилам Xray
```

Он полезен, если нужна клиентская статистика внутри AdGuard Home. Если AdGuard Home установлен на том же роутере, в его upstream DNS обычно нужно указать `127.0.0.1:10535`. Если Pi-hole или AdGuard Home стоит на отдельном устройстве, используйте LAN-адрес роутера, например `192.168.1.1:10535`, и убедитесь, что Xray DNS inbound слушает этот адрес. Не делайте петлю `AdGuard Home -> Xray -> AdGuard Home` или `Pi-hole -> Xray -> Pi-hole`: при такой схеме DNS может зависнуть.

RuOpenRay не переписывает конфиг AdGuard Home автоматически. Панель только обнаруживает AdGuard Home, показывает его статус, upstream DNS и подсказывает правильный адрес Xray. В диагностический архив добавляется `status/adguard-home.json`, чтобы по нему было видно, смотрит ли AdGuard Home в Xray.

DNS-перехват в разделе `Перехват` — отдельная защита на случай, если клиент пытается обойти DNS роутера и обратиться к другому DNS напрямую. В режиме `TPROXY` RuOpenRay может отправлять TCP и UDP 53 в Xray. В режиме `REDIRECT` надежно перенаправляется только TCP 53, а UDP 53 обычно лучше блокировать защитным правилом. DoH/DoT приложений выглядит как обычный HTTPS/TLS-трафик и обрабатывается уже правилами маршрутизации.

Для мониторинга доменов RuOpenRay читает собственные Xray access/DNS-логи. Если нужно точнее привязывать DNS-запросы к LAN-устройствам при схеме `LAN -> dnsmasq -> Xray`, можно включить `dnsmasq logqueries`: тогда RuOpenRay будет разбирать строки `query[...]` из `logread`. Это удобно для диагностики, но на активной сети увеличивает объем системных логов.

## Перехват трафика и nftables

Перехват нужен, чтобы устройства в LAN не настраивали proxy вручную: телефон или ПК открывает сайт как обычно, а роутер сам решает, отправить соединение через Xray, напрямую или в блокировку.

RuOpenRay включает перехват отдельным набором правил nftables, не переписывая всю конфигурацию firewall4. Активные правила живут в таблице `inet ruopenray`, а постоянный черновик хранится в `/etc/ruopenray-ui/firewall.nft`. При применении старый файл `/etc/nftables.d/ruopenray.nft` удаляется, чтобы правила не дублировались.

Есть два режима перехвата:

- `TPROXY` — основной режим для OpenWrt. Он сохраняет настоящий адрес назначения и умеет TCP+UDP, поэтому лучше подходит для transparent proxy, DNS-перехвата и UDP/QUIC-сценариев.
- `REDIRECT` — более простой режим. Роутер перенаправляет TCP-соединения на локальный порт Xray. Его проще поднять, но он не подходит для полноценного UDP: UDP/QUIC в таком режиме не перехватывается или блокируется защитными правилами.

Логика nftables устроена сверху вниз:

1. RuOpenRay смотрит только трафик с выбранного LAN-интерфейса, обычно `br-lan`.
2. Если выбран режим `Только выбранные` или `Кроме выбранных`, сначала проверяется IP клиента.
3. Локальные и служебные сети пропускаются напрямую, чтобы не ломать доступ к роутеру, принтерам, NAS и другим домашним адресам.
4. Если включен DNS-перехват, запросы TCP/UDP 53 отправляются в Xray DNS или блокируются в ограниченном `REDIRECT`-режиме.
5. Если включена блокировка QUIC, UDP/443 от выбранных клиентов отбрасывается, чтобы браузер перешел на TCP/TLS.
6. Дальше срабатывает выбранная политика: все в Xray, direct-исключения мимо Xray или только выбранные proxy-цели в Xray.
7. После попадания в Xray уже обычные routing-правила Xray решают, куда отправить соединение: proxy, balancer, direct или block.

Важно: nftables не заменяет маршрутизацию Xray. nftables только решает, какие пакеты передать в Xray. Сценарии, правила доменов, группы серверов и балансировщики работают уже внутри Xray.

В режиме `TPROXY` под капотом RuOpenRay:

- принимает LAN-трафик на inbound Xray `transparent_ipv4`, обычно порт `52345`;
- добавляет nft-правила `prerouting` для выбранного LAN-интерфейса, клиентов и портов;
- ставит `meta mark 1` и policy routing `fwmark 1/1 -> table 100`;
- добавляет маршрут `local 0.0.0.0/0 dev lo table 100`, чтобы помеченный трафик попадал в Xray;
- сохраняет hotplug-скрипты `/etc/hotplug.d/iface/90-ruopenray-tproxy` и `/etc/hotplug.d/firewall/90-ruopenray-tproxy`, чтобы правила переживали reload firewall и события интерфейсов.

Базовые локальные сети и служебные адреса исключаются из перехвата, чтобы не ломать доступ к роутеру и домашней сети. DNS-перехват, блокировка QUIC, режимы `Direct мимо Xray`, `Только proxy` и защита от утечек добавляют дополнительные правила и, где нужно, `dnsmasq` `nftset`/`address` записи.

Если Xray недоступен:

- трафик, который nftables уже отправляет в transparent inbound Xray, будет зависать или падать по таймауту;
- локальная сеть и адрес роутера должны остаться доступны, потому что они исключаются до перехвата;
- правила `direct` внутри Xray не спасают, если сам Xray не работает: пакет уже передан в Xray и не может сам вернуться в обычный маршрут;
- режим `Direct мимо Xray` может оставить прямой доступ только для тех IP/доменов, которые действительно обошли Xray на уровне nftables/dnsmasq nftset;
- балансировщики и fallback между proxy работают только внутри запущенного Xray;
- если включена защита `Не выпускать без Xray`, выбранные IP/домены не уйдут напрямую при проблемах с Xray, а будут заблокированы или принудительно направлены в Xray.

Если после применения перехвата пропал интернет, сначала отключите перехват в панели или выполните аварийный откат из раздела ниже. Это быстрее и безопаснее, чем удалять Xray или сбрасывать весь firewall.

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

## API

RuOpenRay UI имеет HTTP API под префиксом `/api`. Оно используется самой панелью и может применяться внешними интеграциями для диагностики, мониторинга, проверки proxy, чтения статуса firewall/DNS и аккуратного переключения режимов совместимости с Podkop/B4.

Публичные точки входа:

```text
GET /api/version
GET /api/openapi.json
```

Остальные ручки требуют cookie `openray_session` или заголовок `Authorization: Bearer <token>`. Подробности, примеры `curl`, стабильные endpoints и предупреждения по небезопасным операциям описаны в [docs/api.md](docs/api.md).

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
- DNS, dnsmasq и, если установлен, AdGuard Home;
- nftables/TPROXY правила;
- статистику Xray или клиентский тест трафика.

Перед публикацией GitHub Release используйте [docs/release.md](docs/release.md): в каждом релизе должно быть понятно написано, что нового, что исправлено и какие проверки пройдены.

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
