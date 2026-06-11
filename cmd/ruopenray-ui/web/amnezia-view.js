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

  function checkTone(ok) {
    return ok ? 'ok' : 'warn';
  }

  function activeProfile(items = [], config = {}) {
    return items.find((item) => item.active) || items.find((item) => item.id === state.amneziaProfileId) || (config.exists ? {
      name: config.name || state.amneziaProfileName || 'AmneziaWG',
      summary: config.summary,
      peer: config.peer,
      interface: config.interface,
      obfuscationOptions: config.obfuscationOptions || config.awgOptions,
      active: true,
    } : null);
  }

  function selectedProfileIds(profiles = {}) {
    if (Array.isArray(state.amneziaSelectedProfileIds) && state.amneziaSelectedProfileIds.length) {
      return state.amneziaSelectedProfileIds;
    }
    if (Array.isArray(profiles.selectedIds)) return profiles.selectedIds;
    return array(profiles.items).filter((item) => item.selected || item.active).map((item) => item.id).filter(Boolean);
  }

  function poolStrategyLabel(value) {
    switch (value) {
      case 'round-robin':
        return 'round-robin';
      case 'fallback':
        return 'резерв по порядку';
      case 'random':
        return 'случайный выбор';
      default:
        return 'один профиль';
    }
  }

  function integrationModeLabel(value) {
    switch (value) {
      case 'mixed':
        return 'Xray + AmneziaWG';
      case 'amnezia-first':
        return 'AmneziaWG основной';
      case 'xray-only':
        return 'Только Xray';
      default:
        return 'Резерв';
    }
  }

  function integrationModeDetail(value) {
    switch (value) {
      case 'mixed':
        return 'Xray сохраняет свои proxy/balancer правила, AmneziaWG-пул готовится как отдельное направление для policy routing.';
      case 'amnezia-first':
        return 'AmneziaWG-пул становится основным направлением, Xray остается для локальных прокси и отдельных правил.';
      case 'xray-only':
        return 'AmneziaWG-профили сохраняются, но трафик продолжает идти только по схеме Xray.';
      default:
        return 'Профили готовы к проверке и запуску, но не участвуют в общей маршрутизации.';
    }
  }

  function profileCard(item = {}) {
    const awgOptions = array(item.obfuscationOptions);
    const peer = item.peer || {};
    const iface = item.interface || {};
    const selected = Array.isArray(state.amneziaSelectedProfileIds) && state.amneziaSelectedProfileIds.length
      ? state.amneziaSelectedProfileIds.includes(item.id)
      : Boolean(item.selected || item.active);
    return `<article class="amnezia-profile-card ${item.active ? 'ok' : ''} ${selected ? 'selected' : ''}">
      <label class="amnezia-profile-select" title="Добавить профиль в пул">
        <input type="checkbox" data-amnezia-pool="${escapeHtml(item.id || '')}" ${selected ? 'checked' : ''}>
        <span></span>
      </label>
      <div class="amnezia-profile-main">
        <span class="eyebrow">${escapeHtml(item.active ? 'активный профиль' : 'профиль')}</span>
        <h3>${escapeHtml(item.name || 'AmneziaWG')}</h3>
        <p>${escapeHtml(item.summary || peer.endpoint || 'endpoint не задан')}</p>
        <div class="amnezia-profile-meta">
          ${iface.address ? `<span>${escapeHtml(iface.address)}</span>` : ''}
          ${peer.allowedIPs ? `<span>${escapeHtml(`AllowedIPs ${peer.allowedIPs}`)}</span>` : ''}
          ${awgOptions.length ? `<span>${escapeHtml(`AWG ${awgOptions.length}`)}</span>` : ''}
        </div>
      </div>
      <div class="split-actions">
        <button class="btn secondary" type="button" data-action="loadAmneziaProfile" data-amnezia-profile="${escapeHtml(item.id || '')}">Открыть</button>
        <button class="btn secondary" type="button" data-action="activateAmneziaProfile" data-amnezia-profile="${escapeHtml(item.id || '')}" ${item.active ? 'disabled' : ''}>Выбрать</button>
        <button class="btn danger" type="button" data-action="deleteAmneziaProfile" data-amnezia-profile="${escapeHtml(item.id || '')}">Удалить</button>
      </div>
    </article>`;
  }

  function profilesView(profiles = {}, config = {}, status = {}, preflight = {}) {
    const items = array(profiles.items);
    const current = activeProfile(items, config);
    const selectedIds = selectedProfileIds(profiles);
    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const strategy = state.amneziaPoolStrategy || profiles.strategy || 'single';
    const mode = state.amneziaIntegrationMode || profiles.mode || 'standby';
    const xray = status.xrayIntegration || {};
    const currentPeer = current?.peer || config.peer || {};
    const currentIface = current?.interface || config.interface || {};
    const awgOptions = current ? array(current.obfuscationOptions).length ? array(current.obfuscationOptions) : array(current.awgOptions) : [];
    return `<section class="panel amnezia-profiles-panel">
      <div class="panel-title">
        <div>
          <h2>Управление AmneziaWG</h2>
          <span>Профили, активный client.conf и готовность backend в одном месте.</span>
        </div>
        <span class="status-chip ${statusTone(status)}">${escapeHtml(statusLabel(status))}</span>
      </div>
      <div class="amnezia-control-grid">
        <article class="amnezia-active-profile ${current ? 'ok' : ''}">
          <div>
            <span class="eyebrow">выбранный профиль</span>
            <h3>${escapeHtml(current?.name || 'профиль не выбран')}</h3>
            <p>${escapeHtml(current?.summary || currentPeer.endpoint || 'сохраните или выберите client.conf')}</p>
          </div>
          <div class="compat-metrics compact">
            ${metric('Endpoint', currentPeer.endpoint || 'нет', currentPeer.allowedIPs ? `AllowedIPs ${currentPeer.allowedIPs}` : '')}
            ${metric('Адрес', currentIface.address || 'нет', currentIface.dns ? `DNS ${currentIface.dns}` : '')}
            ${metric('AWG', awgOptions.length ? awgOptions.join(', ') : 'нет', currentPeer.hasPresharedKey ? 'есть PresharedKey' : '')}
            ${metric('Preflight', preflight.ok ? 'готово' : 'проверить', array(preflight.warnings).slice(0, 1).join(' '))}
          </div>
          <div class="amnezia-pool-editor">
            <label class="field-label">Пул профилей</label>
            <strong>${escapeHtml(selectedItems.length ? selectedItems.map((item) => item.name || item.id).join(', ') : 'ничего не выбрано')}</strong>
            <span>${escapeHtml(`${selectedItems.length} проф. · ${poolStrategyLabel(strategy)}`)}</span>
            <select class="input" data-amnezia-strategy>
              ${['single', 'round-robin', 'fallback', 'random'].map((item) => `<option value="${escapeHtml(item)}" ${strategy === item ? 'selected' : ''}>${escapeHtml(poolStrategyLabel(item))}</option>`).join('')}
            </select>
          </div>
          <div class="amnezia-integration-editor">
            <label class="field-label">Работа вместе с Xray</label>
            <strong>${escapeHtml(integrationModeLabel(mode))}</strong>
            <span>${escapeHtml(integrationModeDetail(mode))}</span>
            <select class="input" data-amnezia-mode>
              ${['standby', 'mixed', 'amnezia-first', 'xray-only'].map((item) => `<option value="${escapeHtml(item)}" ${mode === item ? 'selected' : ''}>${escapeHtml(integrationModeLabel(item))}</option>`).join('')}
            </select>
            <div class="amnezia-integration-metrics">
              <span>Xray proxy: ${escapeHtml(String(xray.proxyOutbounds ?? 0))}</span>
              <span>rules: ${escapeHtml(String(xray.rules ?? 0))}</span>
              <span>${escapeHtml(xray.transparentReady ? 'transparent готов' : 'transparent не найден')}</span>
            </div>
          </div>
          <div class="split-actions">
            ${commandButton('refreshAmnezia', 'Обновить статус')}
            <button class="btn secondary" type="button" data-action="saveAmneziaProfilePool" ${items.length ? '' : 'disabled'}>Сохранить пул</button>
            <button class="btn secondary" type="button" data-action="checkAmneziaPreflight" ${current || config.exists ? '' : 'disabled'}>Проверить</button>
            <button class="btn secondary" type="button" data-action="prepareAmnezia" ${current || config.exists ? '' : 'disabled'}>Подготовить</button>
          </div>
        </article>
        <div class="amnezia-profile-list">
          ${items.length ? items.map(profileCard).join('') : `<div class="empty-state">Профилей пока нет. Вставьте client.conf в блоке импорта и сохраните.</div>`}
        </div>
      </div>
    </section>`;
  }

  function preflightView(preflight = {}) {
    const checks = array(preflight.checks);
    const warnings = array(preflight.warnings);
    const plan = array(preflight.plan);
    if (!checks.length && !warnings.length && !plan.length) return '';
    return `<section class="panel amnezia-preflight-panel ${preflight.ok ? 'ok' : 'warn'}">
      <div class="panel-title">
        <div>
          <h2>Preflight</h2>
          <span>Проверка только читает систему и показывает, можно ли безопасно готовить AmneziaWG.</span>
        </div>
        <span class="status-chip ${preflight.ok ? 'ok' : 'warn'}">${escapeHtml(preflight.ok ? 'готово' : 'есть блокеры')}</span>
      </div>
      <div class="amnezia-check-grid">
        ${checks.map((check) => `<article class="${checkTone(check.ok)}">
          <span>${escapeHtml(check.ok ? '✓' : '!')}</span>
          <div>
            <strong>${escapeHtml(check.label || check.id || 'проверка')}</strong>
            ${check.detail ? `<small>${escapeHtml(check.detail)}</small>` : ''}
          </div>
        </article>`).join('')}
      </div>
      ${warnings.length ? `<div class="settings-warning compact amnezia-warning">
        <strong>Предупреждения</strong>
        <span>${escapeHtml(warnings.join(' '))}</span>
      </div>` : ''}
      ${plan.length ? `<div class="settings-info">
        <strong>План без применения</strong>
        <span>${escapeHtml(plan.join(' '))}</span>
      </div>` : ''}
    </section>`;
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
    const profileName = state.amneziaProfileName || 'AmneziaWG';
    return `<section class="panel amnezia-config-panel">
      <div class="panel-title">
        <div>
          <h2>Импорт client.conf</h2>
          <span>Сохраненный конфиг становится отдельным профилем и доступен в списке выше.</span>
        </div>
        <div class="split-actions">
          ${commandButton('loadAmneziaConfig', 'Загрузить сохраненный')}
          <button class="btn secondary" type="button" data-action="deleteAmneziaConfig" ${config.exists ? '' : 'disabled'}>Удалить</button>
        </div>
      </div>
      <label class="field-label">Название профиля</label>
      <input class="input" data-amnezia-name value="${escapeHtml(profileName)}" placeholder="Например: Домашний AmneziaWG">
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
        <button class="btn secondary" type="button" data-action="checkAmneziaPreflight">Проверить</button>
        <button class="btn secondary" type="button" data-action="prepareAmnezia">Подготовить</button>
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

  function userspaceBackendView(userspace = {}) {
    if (!userspace.available && !userspace.tunDevice && !userspace.tunModule && !userspace.awgSetconf) return '';
    const rollback = array(userspace.rollback).join(' ');
    return `<section class="panel amnezia-userspace-panel ${userspace.available ? 'ok' : 'warn'}">
      <div class="panel-title">
        <div>
          <h2>Userspace backend</h2>
          <span>Запасной путь для роутеров без совместимого kmod-amneziawg: amneziawg-go + TUN + awg setconf.</span>
        </div>
        <span class="status-chip ${userspace.available ? 'ok' : 'warn'}">${escapeHtml(userspace.available ? 'amneziawg-go' : 'не найден')}</span>
      </div>
      <div class="compat-metrics">
        ${metric('amneziawg-go', userspace.command || 'нет', userspace.commandSource || '')}
        ${metric('/dev/net/tun', userspace.tunDevice ? 'есть' : 'нет', userspace.tunPackage || userspace.tunLsmod || '')}
        ${metric('awg setconf', userspace.awgSetconf ? 'доступен' : 'нет', 'применение конфигурации интерфейса')}
        ${metric('MTU', userspace.recommendedMTU || '1280', 'рекомендовано для старта')}
      </div>
      ${rollback ? `<div class="settings-info">
        <strong>Откат при ошибке</strong>
        <span>${escapeHtml(rollback)}</span>
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
    const userspace = status.userspace || {};
    const clientConfig = status.clientConfig || {};
    const profiles = clientConfig.profiles || {};
    const preflight = state.amneziaPreflight || clientConfig.preflight || {};
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

      ${profilesView(profiles, clientConfig, status, preflight)}

      ${clientConfigView(clientConfig)}

      ${preflightView(preflight)}

      <section class="amnezia-system-stack">
        <div class="panel-title amnezia-system-title">
          <div>
            <h2>Состояние стенда</h2>
            <span>Backend, интерфейсы и будущая схема раздельной маршрутизации.</span>
          </div>
        </div>
        <div class="amnezia-system-grid">
          ${glinetBackendView(glinet)}
          ${userspaceBackendView(userspace)}
        </div>

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
          ${metric('Userspace', userspace.available ? (userspace.command || 'найден') : 'нет', userspace.tunDevice ? 'TUN готов' : 'TUN не подтвержден')}
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
      </section>
    </section>`;
  }

  return { amneziaPanel };
}
