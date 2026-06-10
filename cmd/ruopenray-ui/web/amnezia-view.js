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

  function clientConfigView(config = {}) {
    const warnings = array(config.warnings);
    const awgOptions = array(config.obfuscationOptions).length ? array(config.obfuscationOptions) : array(config.awgOptions);
    const iface = config.interface || {};
    const peer = config.peer || {};
    const text = state.amneziaConfigText || '';
    return `<section class="panel amnezia-config-panel">
      <div class="panel-title">
        <div>
          <h2>Клиентский конфиг</h2>
          <span>Вставьте конфиг AmneziaWG клиента. RuOpenRay сохранит его отдельно и не будет запускать туннель, пока kernel module не готов.</span>
        </div>
        <div class="split-actions">
          ${commandButton('loadAmneziaConfig', 'Загрузить сохраненный')}
          <button class="btn secondary" type="button" data-action="deleteAmneziaConfig" ${config.exists ? '' : 'disabled'}>Удалить</button>
        </div>
      </div>
      ${config.exists ? `<div class="compat-metrics">
        ${metric('Конфиг', config.summary || 'сохранен', config.updatedAt || '')}
        ${metric('Адрес', iface.address || 'нет', iface.dns ? `DNS ${iface.dns}` : '')}
        ${metric('Endpoint', peer.endpoint || 'нет', peer.allowedIPs ? `AllowedIPs ${peer.allowedIPs}` : '')}
        ${metric('AWG-параметры', awgOptions.length ? awgOptions.join(', ') : 'не найдены', peer.hasPresharedKey ? 'есть PresharedKey' : '')}
      </div>` : ''}
      ${warnings.length ? `<div class="settings-warning compact amnezia-warning">
        <strong>Проверьте конфиг</strong>
        <span>${escapeHtml(warnings.join(' '))}</span>
      </div>` : ''}
      <textarea class="amnezia-config-textarea code-textarea" data-amnezia-config spellcheck="false" placeholder="[Interface]
PrivateKey = ...
Address = ...
Jc = ...

[Peer]
PublicKey = ...
Endpoint = host:port
AllowedIPs = 0.0.0.0/0">${escapeHtml(text)}</textarea>
      <div class="toolbar amnezia-config-actions">
        <button class="btn warning" type="button" data-action="saveAmneziaConfig">Сохранить конфиг</button>
        <span class="muted">Приватный ключ хранится в файле панели с правами 600 и не попадает в обычный статус.</span>
      </div>
    </section>`;
  }

  function glinetBackendView(glinet = {}) {
    const warnings = array(glinet.warnings);
    const packages = array(glinet.packages);
    const network = array(glinet.network);
    if (!glinet.found && !packages.length && !network.length) return '';
    const backend = glinet.recommendedBackend || 'raw-awg';
    return `<section class="panel amnezia-glinet-panel">
      <div class="panel-title">
        <div>
          <h2>GL.iNet backend</h2>
          <span>${escapeHtml(glinet.recommendedBackendNote || 'RuOpenRay проверяет, можно ли опереться на родной VPN-клиент GL.iNet.')}</span>
        </div>
        <span class="status-chip ${glinet.supportsNativeAmnezia ? 'ok' : ''}">${escapeHtml(backend)}</span>
      </div>
      <div class="compat-metrics">
        ${metric('Прошивка', glinet.version || 'не GL.iNet', glinet.supportsNativeAmnezia ? 'native AmneziaWG 2.0 возможен' : 'native AWG 2.0 не подтвержден')}
        ${metric('VPN-клиент', glinet.vpnClientService ? (glinet.vpnClientRunning ? 'запущен' : 'найден') : 'нет', 'GL.iNet service')}
        ${metric('UCI WG', glinet.nativeWireGuard ? (glinet.disabled ? 'есть, выключен' : 'есть') : 'нет', network.slice(0, 2).join(' · '))}
        ${metric('Пакеты', packages.length ? `${packages.length} найдено` : 'нет', packages.slice(0, 2).join(' · '))}
      </div>
      ${warnings.length ? `<div class="settings-warning compact amnezia-warning">
        <strong>GL.iNet</strong>
        <span>${escapeHtml(warnings.join(' '))}</span>
      </div>` : ''}
    </section>`;
  }

  function amneziaPanel() {
    const status = state.amneziaStatus || state.status?.amnezia || {};
    const interfaces = array(status.interfaces);
    const routing = status.routing || {};
    const services = status.services || {};
    const wg = status.wg || {};
    const configs = status.configs || {};
    const kernel = status.kernel || {};
    const glinet = status.glinet || {};
    const clientConfig = status.clientConfig || {};
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

      ${clientConfigView(clientConfig)}

      ${glinetBackendView(glinet)}

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
          ${metric('Kernel module', kernel.loaded ? 'загружен' : (kernel.installed || kernel.moduleFile ? 'найден' : 'нет'), kernel.package || array(kernel.files).join(', '))}
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
