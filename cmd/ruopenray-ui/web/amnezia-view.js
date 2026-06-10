export function createAmneziaView({ state, escapeHtml }) {
  const array = (value) => Array.isArray(value) ? value : [];

  function statusLabel(status = {}) {
    if (status.active) return 'активен';
    if (status.running) return 'туннель поднят';
    if (status.available) return 'найден';
    return 'не найден';
  }

  function statusTone(status = {}) {
    if (status.active || status.running) return 'ok';
    if (status.available) return 'warn';
    return '';
  }

  function commandButton(action, label) {
    const busy = state.busyAction === action;
    return `<button class="btn secondary ${busy ? 'is-busy' : ''}" data-action="${escapeHtml(action)}" ${busy ? 'disabled' : ''}>${escapeHtml(busy ? 'Обновляю...' : label)}</button>`;
  }

  function metric(label, value, detail = '') {
    return `<article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || 'нет')}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
    </article>`;
  }

  function interfaceCard(item = {}) {
    const addresses = array(item.addresses).join(' · ');
    const routes = array(item.routes).join(' · ');
    return `<article class="amnezia-interface-card ${item.running ? 'ok' : ''}">
      <div>
        <span class="eyebrow">${escapeHtml(item.kind || 'WireGuard')}</span>
        <h3>${escapeHtml(item.name || 'интерфейс')}</h3>
        <p>${escapeHtml(addresses || 'адреса не найдены')}</p>
      </div>
      <span class="status-chip ${item.running ? 'ok' : ''}">${escapeHtml(item.running ? 'UP' : (item.state || 'DOWN'))}</span>
      ${routes ? `<code>${escapeHtml(routes)}</code>` : ''}
    </article>`;
  }

  function warningsView(status = {}) {
    const warnings = array(status.warnings);
    if (!warnings.length) return '';
    return `<div class="settings-warning amnezia-warning">
      <strong>Внимание</strong>
      <span>${escapeHtml(warnings.join(' '))}</span>
    </div>`;
  }

  function amneziaPanel() {
    const status = state.amneziaStatus || state.status?.amnezia || {};
    const interfaces = array(status.interfaces);
    const routing = status.routing || {};
    const services = status.services || {};
    const wg = status.wg || {};
    const configs = status.configs || {};
    const plan = status.routePlan || {};
    return `<section class="amnezia-page">
      <section class="route-hero amnezia-hero">
        <div>
          <span class="eyebrow">AmneziaWG</span>
          <h1>${escapeHtml(statusLabel(status))}</h1>
          <p>${escapeHtml(status.summary || 'RuOpenRay проверяет awg/wg интерфейсы, сервисы, маршруты и готовность к раздельной маршрутизации.')}</p>
        </div>
        <div class="split-actions">
          ${commandButton('refreshAmnezia', 'Обновить статус')}
          <button class="btn secondary" type="button" data-tab-jump="routing">Открыть маршруты</button>
        </div>
      </section>

      ${warningsView(status)}

      <section class="panel amnezia-overview ${statusTone(status)}">
        <div class="panel-title">
          <div>
            <h2>Состояние туннеля</h2>
            <span>Пока это диагностика: RuOpenRay ничего не применяет к AmneziaWG без отдельного действия.</span>
          </div>
          <span class="status-chip ${statusTone(status)}">${escapeHtml(statusLabel(status))}</span>
        </div>
        <div class="compat-metrics">
          ${metric('Интерфейс', status.primaryInterface || (interfaces.length ? `${interfaces.length} найдено` : 'нет'), interfaces.map((item) => item.name).filter(Boolean).join(', '))}
          ${metric('Сервис', services.running ? 'запущен' : (services.found ? 'найден' : 'нет'), array(services.items).map((item) => item.path).join(', '))}
          ${metric('wg/awg', wg.available ? (wg.command || 'доступен') : 'нет', array(wg.interfaces).join(', '))}
          ${metric('Конфиги', configs.found ? `${array(configs.paths).length} найдено` : 'нет', array(configs.paths).join(', '))}
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <div>
            <h2>Интерфейсы</h2>
            <span>RuOpenRay ищет awg*, wg* и интерфейсы с amnezia в имени.</span>
          </div>
        </div>
        ${interfaces.length ? `<div class="amnezia-interface-grid">${interfaces.map(interfaceCard).join('')}</div>` : `<div class="empty-state">Активные awg/wg интерфейсы пока не найдены.</div>`}
      </section>

      <section class="panel">
        <div class="panel-title">
          <div>
            <h2>Раздельная маршрутизация</h2>
            <span>Будущая схема: правила RuOpenRay смогут отправлять часть трафика в Xray, часть в AmneziaWG, остальное напрямую.</span>
          </div>
        </div>
        <div class="compat-metrics">
          ${metric('Route table', plan.table || '5200', plan.tableName || 'ruopenray_awg')}
          ${metric('fwmark', plan.mark || '0x5200', 'метка для выбранных правил')}
          ${metric('Текущий default', routing.defaultViaTunnel ? 'через туннель' : 'не через туннель', routing.defaultRoute || '')}
          ${metric('ip rule', routing.ipRule ? 'найден' : 'не настроен', array(routing.rules).join(' · '))}
        </div>
        <div class="settings-info">
          <strong>Как это будет работать</strong>
          <span>RuOpenRay будет резолвить доменные правила в nft-set, ставить отдельную метку и отправлять только выбранные IP в таблицу AmneziaWG. Глобальный default route туннеля для всего роутера лучше не включать.</span>
        </div>
      </section>
    </section>`;
  }

  return { amneziaPanel };
}
