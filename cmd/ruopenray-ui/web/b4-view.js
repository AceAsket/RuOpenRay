import { adguardAdminUrl } from './adguard-view.js';
import { byteSize, fmtUptime } from './formatters.js';

export function b4Panel({ state, escapeHtml: esc, pageUrl }) {
  const b4 = state.compatStatus?.b4 || {};
  const api = b4.api || {};
  const engine = api.engine || {};
  const ready = Boolean(api.authenticated);
  const busy = Boolean(state.busyAction);
  const metrics = api.metrics || {};
  const config = api.config || {};
  const issues = api.startIssues || [];
  const url = adguardAdminUrl(api.url || 'http://127.0.0.1:7000', pageUrl);
  const link = (path, label) => url && api.available ? `<a class="btn secondary" href="${esc(new URL(path, url).href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
  const number = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('ru-RU') : '—';
  const stat = (label, value) => `<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
  const button = (action, label, extra = '') => `<button class="btn secondary" data-action="b4Api" data-b4-api-action="${esc(action)}" ${extra} ${busy ? 'disabled' : ''}>${esc(label)}</button>`;
  const sets = Array.isArray(api.sets) ? api.sets : [];
  const title = !ready ? (api.authRequired ? 'Нужен вход в API' : api.available ? 'API найден' : 'API не подключён') : engine.state === 'failed' ? 'Движок не запустился' : engine.state === 'running' ? 'Движок работает' : 'Движок не подтверждён';
  const matches = state.b4DomainResult;
  return `<section class="panel b4-api-panel">
    <div class="panel-title"><div><h2>B4 — обход DPI</h2><span>Сеты и статистика через локальный API. Стратегии обхода настраиваются в админке B4.</span></div><div class="split-actions">${link('/', 'Открыть B4')}<button class="btn secondary" data-action="refreshCompatibility" ${busy ? 'disabled' : ''}>Обновить B4</button></div></div>
    <div class="compat-metrics compact">
      ${stat('Движок', title)}${stat('Версия', api.version || '—')}${stat('Перехват', b4.active ? 'Правила найдены' : 'Не найден')}${stat('Firewall', config.skipSetup ? 'Внешние правила' : engine.firewall || 'Не проверен')}
    </div>
    ${api.error ? `<div class="settings-warning compact"><strong>Нет доступа к API</strong><span>${esc(api.error)}</span></div>` : ''}
    ${engine.state === 'failed' ? `<div class="settings-warning compact"><strong>B4 запущен без движка пакетов</strong><span>${esc(api.engineFailure?.error || 'Проверьте NFQUEUE и модули ядра в админке B4.')}</span></div>` : ''}
    ${issues.length ? `<div class="settings-warning compact"><strong>Перед запуском или включением сета</strong><span>${esc(issues.join(' '))}</span></div>` : ready ? `<p class="muted">Внешние NFQUEUE-правила управляются отдельно. Работа движка сама по себе не означает перехват. B4 не должен получать VPN-трафик или DNS AdGuard.</p>` : ''}
    <details data-details-key="b4-api-connection" ${ready ? '' : 'open'}><summary>Подключение API B4${ready ? ' · подключено' : ''}</summary>
      <div class="b4-connection-fields">
        <label>Локальный адрес API<input id="b4ApiUrl" value="${esc(state.b4ApiUrl ?? api.url ?? 'http://127.0.0.1:7000')}" placeholder="http://127.0.0.1:7000" autocomplete="off"></label>
        <label>Логин B4<input id="b4ApiUsername" value="${esc(state.b4ApiUsername ?? api.username ?? '')}" autocomplete="username"></label>
        <label>Пароль B4<input id="b4ApiPassword" type="password" value="" autocomplete="new-password" placeholder="${api.hasPassword ? 'Сохранён; пустое поле сохраняет пароль' : 'Если включена авторизация B4'}"></label>
      </div>
      <div class="split-actions"><button class="btn secondary" data-action="b4Connect" ${busy ? 'disabled' : ''}>Проверить и сохранить</button><button class="btn secondary" data-action="b4Connect" data-b4-clear-credentials="1" ${busy ? 'disabled' : ''}>Подключить без авторизации</button></div>
    </details>
    ${ready ? `<div class="b4-set"><div class="panel-title"><div><h3>Выбранный direct → B4</h3><span>${b4.directEnabled ? 'Очередь включена' : 'Очередь выключена'} · ${b4.directPrepared ? 'выход direct-b4 применён' : 'выход direct-b4 ещё не применён'}</span></div></div>
      <p class="muted">Подготовьте отдельный выход direct-b4 и выберите его для нужных правил Xray. Очередь получает только его TCP 80/443 и UDP 443. Обычный direct, VPN и DNS на порту 53 сохраняют свои пути. Для DoH оставьте отдельный маршрут DNS в Xray.</p>
      <div class="split-actions"><button class="btn secondary" data-action="b4PrepareDirect" ${busy ? 'disabled' : ''}>Подготовить выход в черновике</button><button class="btn ${b4.directEnabled ? 'secondary' : 'warning'}" data-action="b4Direct" data-b4-direct-enabled="${b4.directEnabled ? '0' : '1'}" ${busy ? 'disabled' : ''}>${b4.directEnabled ? 'Отключить direct → B4' : 'Включить direct → B4'}</button>${b4.directEnabled ? `<button class="btn secondary" data-action="b4Direct" data-b4-direct-enabled="1" ${busy ? 'disabled' : ''}>Обновить очередь</button>` : ''}</div>
    </div>` : ''}
    ${ready ? `<div class="compat-metrics compact b4-live-metrics">
      ${stat('Соединения', number(metrics.connections))}${stat('Совпали с сетами', number(metrics.connections_in_sets))}${stat('За последнюю минуту', number(metrics.connections_last_minute))}${stat('Обнаружено блокировок', number(metrics.blocked_total))}${stat('Время работы', metrics.uptime || (metrics.uptime_s !== undefined ? fmtUptime(metrics.uptime_s) : '—'))}${stat('Память / CPU', metrics.rss_bytes !== undefined ? `${byteSize(metrics.rss_bytes)} / ${number(metrics.cpu_percent)}%` : '—')}
    </div>${api.metricsError ? `<p class="muted">${esc(api.metricsError)}</p>` : ''}
    <div class="panel-title"><div><h3>Сеты B4 · ${sets.length}</h3><span>Порядок и методы сохраняются. Добавление домена не удаляет его из других сетов.</span></div>${link('/sets', 'Создать или настроить сет')}</div>
    ${api.setsError ? `<p class="settings-warning">${esc(api.setsError)}</p>` : ''}
    <div class="b4-sets">${sets.map((set) => {
      const domains = Array.isArray(set.domains) ? set.domains : [];
      const meta = `data-b4-set-id="${esc(set.id)}" data-b4-revision="${esc(set.revision || '')}"`;
      const editable = Boolean(set.revision) && !busy;
      return `<article class="b4-set"><div class="b4-set-head"><div><strong>${esc(set.name || set.id)}</strong><span class="muted">${set.enabled ? 'Включён' : 'Выключен'} · ${domains.length} доменов · ${(set.ips || []).length} IP / подсетей${set.routingEnabled ? ' · маршрутизация B4' : ''}${set.dnsEnabled ? ' · DNS B4' : ''}</span></div><button class="btn secondary" data-action="b4Api" data-b4-api-action="set-enabled" ${meta} data-b4-enabled="${set.enabled ? '0' : '1'}" ${editable ? '' : 'disabled'}>${set.enabled ? 'Выключить' : 'Включить'}</button></div>
        <p class="muted">${esc([...domains.slice(0, 8), ...(set.geosite || []).map((value) => `geosite:${value}`)].join(', ') || 'Домены не заданы')}${domains.length > 8 ? ` · ещё ${domains.length - 8}` : ''}</p>
        <div class="b4-domain-add"><label>Добавить домен<input data-b4-domain-input="${esc(set.id)}" value="${esc(state.b4Domains?.[set.id] || '')}" placeholder="example.org" ${editable ? '' : 'disabled'}></label>${button('add-domain', 'Добавить домен', `${meta} ${editable ? '' : 'disabled'}`)}</div>
      </article>`;
    }).join('') || '<p class="muted">Сетов пока нет. Создайте стратегию в админке B4, затем обновите список.</p>'}</div>
    <div class="b4-domain-check"><label>Какой сет обрабатывает домен?<input id="b4CheckDomain" value="${esc(state.b4CheckDomain || '')}" placeholder="example.org"></label>${button('check-domain', 'Проверить домен')}</div>
    ${matches?.ok ? `<p>Домен ${esc(matches.domain)}: ${matches.matches?.length ? matches.matches.map((item) => `${esc(item.set_name)} (${item.handles ? 'обрабатывает' : item.enabled ? 'совпадение' : 'выключен'}; ${esc(item.via)}; ${esc(item.relation)})`).join('; ') : 'совпадений с сетами нет'}. Это проверка целей B4; маршрут Xray она не меняет.</p>` : ''}` : ''}
  </section>`;
}
