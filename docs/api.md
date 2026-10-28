# API RuOpenRay UI

RuOpenRay UI имеет HTTP API под префиксом `/api`. Оно используется самой веб-панелью и может быть полезно внешним интеграциям: диагностическим утилитам, мониторингу, совместимости с B4, сценариям настройки роутера.

Интеграция локального API B4, управление сетами и отдельной очередью `direct-b4` описаны в [b4-integration.md](b4-integration.md).

Машинно-читаемая схема доступна прямо на роутере:

```text
GET /api/openapi.json
```

Проверить версию API и приложения можно без авторизации:

```text
GET /api/version
```

Ответ содержит `apiVersion`, `appVersion`, путь к OpenAPI и краткое описание авторизации.

## Авторизация

API 0.2 добавляет `POST /api/logout`: токен отзывается на сервере, remember-сессия
остаётся отозванной после перезапуска. Обычная сессия действует до 12 часов,
remember — до 30 дней. Смена пароля делает прежние remember-токены недействительными.
После обновления со старой схемы подписи может потребоваться повторный вход.

Изменяющие операции сериализованы с CLI/cron на Linux. При занятой операции
возвращается 409 с `busy:true`; такой ответ не означает, что действие выполнено.
Некорректный JSON отклоняется до записи настроек.

Черновик загружается через `GET /api/config/draft`, который возвращает
`revision`, `activeConfig` и `activeRevision`. Сохранение и удаление требуют
`expectedRevision`; отсутствие — 428, устаревшая ревизия — 409. Для применения
конфигурации передавайте `expectedConfigRevision`, равный `activeRevision`.
Сбой применения сохраняет черновик; `ok:false` даже при HTTP 200 — отказ операции.
`POST /api/config/apply` требует объект `config`; пустой запрос и `config:null`
не перезапускают службу. Для явного перезапуска используйте `/api/service`.

Большинство ручек требуют входа в панель. Есть два способа:

1. Cookie `openray_session`, которую получает браузер после входа.
2. Bearer token из ответа `/api/login`.

Пример входа:

```sh
curl -s http://192.168.1.1:9090/api/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"panel-password","remember":true}'
```

Пример запроса с токеном:

```sh
TOKEN='remember.v1....'
curl -s http://192.168.1.1:9090/api/status \
  -H "Authorization: Bearer $TOKEN"
```

Проверить текущую сессию:

```text
GET /api/auth/check
```

Если токен или cookie не приняты, API возвращает `401` и JSON вида:

```json
{
  "ok": false,
  "error": "..."
}
```

## Стабильность контракта

API пока разделен на два уровня.

**Стабильные для интеграций:**

- `GET /api/version`
- `GET /api/openapi.json`
- `POST /api/login`
- `GET /api/auth/check`
- `GET /api/status`
- `GET /api/diagnostics`
- `GET /api/diagnostics/package`
- `GET /api/firewall/status`
- `GET /api/dns/diagnostics`
- `GET /api/dns/lan-upstream`
- `GET /api/domain-monitor`
- `POST /api/domain-monitor`
- `POST /api/diagnostics/domain-probe`
- `POST /api/diagnostics/dpi-probe`
- `POST /api/outbounds/check`
- `GET /api/subscriptions`
- `GET /api/profiles`

**Внутренние UI-ручки:**

Остальные endpoints тоже описаны в OpenAPI, но их payload может меняться вместе с интерфейсом. Перед использованием в стороннем инструменте лучше смотреть текущий `/api/openapi.json` на конкретной версии панели.

## Безопасность

Некоторые API меняют состояние роутера:

- `/api/config/apply`
- `/api/firewall/apply`
- `/api/firewall/disable`
- `/api/firewall/restore`
- `/api/dns/lan-upstream`
- `/api/service`
- `/api/app/update`
- `/api/core/update`
- `/api/geo/update`
- `/api/backup/restore`

Для сторонних интеграций лучше начинать с read-only ручек: `status`, `diagnostics`, `firewall/status`, `dns/diagnostics`, `domain-monitor`, `outbounds/check`.

## Примеры

### Проверить, что RuOpenRay жив

```sh
curl -s http://192.168.1.1:9090/api/version
```

### Получить статус панели и совместимости

```sh
curl -s http://192.168.1.1:9090/api/status \
  -H "Authorization: Bearer $TOKEN"
```

В статусе есть сведения о Xray, ресурсах роутера, DNS, firewall и B4.

### Скачать диагностический архив

```sh
curl -L http://192.168.1.1:9090/api/diagnostics/package \
  -H "Authorization: Bearer $TOKEN" \
  -o ruopenray-diagnostics.zip
```

Архив рассчитан на передачу в поддержку: чувствительные поля конфигурации обезличиваются.

### Проверить домен напрямую и через proxy

```sh
curl -s http://192.168.1.1:9090/api/diagnostics/domain-probe \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","tag":"proxy"}'
```

### Получить события доменного монитора

```sh
curl -s 'http://192.168.1.1:9090/api/domain-monitor?limit=200' \
  -H "Authorization: Bearer $TOKEN"
```

Запуск и остановка монитора:

```sh
curl -s http://192.168.1.1:9090/api/domain-monitor \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"start"}'
```

```sh
curl -s http://192.168.1.1:9090/api/domain-monitor \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"stop"}'
```

### Проверить proxy-сервер

```sh
curl -s http://192.168.1.1:9090/api/outbounds/check \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tags":["proxy"],"url":"https://www.gstatic.com/generate_204"}'
```

## Диагностика TLS и обслуживание

`POST /api/diagnostics/tls-stability` принимает HTTPS `target`, существующий
proxy-`tag`, `attempts` (по умолчанию 5), `timeoutMs` (4000) и
`compareFragment` (true). Проверяются отдельные новые соединения TLS 1.2/1.3:
прямое с роутера, выбранный выход и копия выхода без фрагментации, если она
обнаружена. Активный Xray и его настройки не меняются. Допускаются 1–10
запросов, таймаут 1–8 с и бюджет двух версий TLS до 40 с на вариант; общий
предел — 50 с. Одновременно выполняется одна такая проверка.

`ok:true` означает выполненный запуск диагностики, а не исправность всех
маршрутов. Смотрите `healthy`, `complete`, а в `results` — `variant`, `tls`,
`passed`, `total`, `requested`, `complete` и `samples`. В каждой попытке есть
проверенный HTTP status, число прочитанных байтов, `bodyComplete`, время и
категория ошибки (`dns`, `certificate`, `tls`, `timeout`, `transfer`, `http`,
`connection`). Чтение ограничено 1 МиБ; ответ большей длины отмечается как
частичный. HTTP 200 с оборванным телом считается ошибкой. Прямой запрос VM
может дополнительно перехватываться внешним шлюзом; это не независимый WAN-тест.

Для AdGuard `GET /api/dns/adguard` дополнен полями `filterLists`,
`filterIntervalHours`, `filtersError` и `filterCatalog`. Через
`POST /api/dns/adguard` доступны действия:

| action | Дополнительные поля | Действие |
| --- | --- | --- |
| `filter-add` | `name`, `url` | Добавить и включить HTTPS blocklist |
| `filter-set` | `url`, `enabled` | Переключить существующий blocklist |
| `filter-remove` | `url` | Удалить выбранный blocklist |
| `filter-refresh` | — | Обновить все blocklists |

Исключения, allowlists и DNS при этих действиях сохраняются. Запись не
повторяется автоматически после таймаута; сначала заново прочитайте статус.

Полная резервная копия, проверка манифеста, скачивание и восстановление через
`/api/backup/full*` описаны в [backup-restore.md](backup-restore.md).

## Интеграция с B4

RuOpenRay сам показывает базовые сведения о B4 в `/api/status` и `/api/diagnostics`. Для read-only интеграций обычно достаточно:

```text
GET /api/status
GET /api/diagnostics
GET /api/firewall/status
GET /api/dns/diagnostics
```

Если внешний инструмент хочет переключать владельца перехвата, он должен делать это явно и осторожно:

1. Сначала читать `firewall/status` и `diagnostics`.
2. Предупреждать пользователя, если активен B4 или найдены чужие NFQUEUE/DNS/firewall правила.
3. Использовать `/api/compat/stop-ruopenray`, если нужно остановить режим RuOpenRay, не удаляя сторонние сервисы.
4. Не удалять nftables-таблицы и route table сторонних проектов.

## Версионирование

Поле `apiVersion` в `/api/version` относится к контракту API, а `appVersion` — к версии бинарника панели.

Пока `apiVersion` имеет формат `0.x`, это означает: стабильные read-only ручки уже пригодны для интеграций, но payload внутренних UI-действий может уточняться.

## Проверки после изменения и самообновления

`POST /api/service`, apply, подписки и обновление ядра возвращают результаты
`readiness`/`health`: стабильность процесса и сравнение DNS/HTTPS/VPN с исходным
состоянием. `health.state=inconclusive` означает неполную проверку, в том числе
исходную недоступность или возможный общий сбой WAN. Это не подтверждение работы LAN.

DNS проверяется положительным ответом и случайным именем вне кеша; корректный
NXDOMAIN тоже подтверждает ответ резолвера. Для рабочего трафика выбирается
фактический локальный HTTP/SOCKS listener без пароля. Из VPN проверяются до четырёх
используемых выходов, включая selector/fallback балансировщиков; превышение
лимита отражается в `uncheckedVPN`. Отсутствие подходящего listener или проверка
транспортов по отдельности не доказывают правильность всех правил маршрутизации.

`POST /api/app/update` возвращает `state=pending`: новый binary установлен,
независимый watchdog ещё проверяет перезапуск. Окончательный результат доступен
в авторизованном `GET /api/app/update-status`: `healthy`, `rolled_back` с
`rollbackOK`, `rollback_failed` или `superseded`. До завершения проверки нельзя
считать обновление подтверждённым. Backup обязателен до подтверждения здоровья.
