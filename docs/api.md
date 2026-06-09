# API RuOpenRay UI

RuOpenRay UI имеет HTTP API под префиксом `/api`. Оно используется самой веб-панелью и может быть полезно внешним интеграциям: диагностическим утилитам, мониторингу, совместимости с B4/Podkop, сценариям настройки роутера.

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

В статусе есть сведения о Xray, ресурсах роутера, DNS, firewall, Podkop и B4.

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

## Интеграция с B4 и Podkop

RuOpenRay сам показывает базовые сведения о B4 и Podkop в `/api/status` и `/api/diagnostics`. Для read-only интеграций обычно достаточно:

```text
GET /api/status
GET /api/diagnostics
GET /api/firewall/status
GET /api/dns/diagnostics
```

Если внешний инструмент хочет переключать владельца перехвата, он должен делать это явно и осторожно:

1. Сначала читать `firewall/status` и `diagnostics`.
2. Предупреждать пользователя, если активны Podkop/B4 или чужие NFQUEUE/DNS/firewall правила.
3. Использовать `/api/compat/stop-ruopenray`, если нужно остановить режим RuOpenRay, не удаляя сторонние сервисы.
4. Не удалять nftables-таблицы и route table сторонних проектов.

## Версионирование

Поле `apiVersion` в `/api/version` относится к контракту API, а `appVersion` — к версии бинарника панели.

Пока `apiVersion` имеет формат `0.x`, это означает: стабильные read-only ручки уже пригодны для интеграций, но payload внутренних UI-действий может уточняться.
