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

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let amount = bytes;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
      amount /= 1024;
      unit += 1;
    }
    const precision = amount >= 10 || unit === 0 ? 0 : 1;
    return `${amount.toFixed(precision)} ${units[unit]}`;
  }

  function runtimeTone(runtime = {}) {
    if (runtime.connected) return 'ok';
    if (runtime.backendReady || runtime.endpointReachable || runtime.interfaceRunning) return 'warn';
    return '';
  }

  function runtimeLabel(runtime = {}) {
    if (runtime.connected) return 'connected';
    if (runtime.interfaceRunning) return 'интерфейс поднят';
    if (runtime.backendReady) return 'backend готов';
    return 'нет backend';
  }

  function latencyLabel(runtime = {}) {
    const latency = Number(runtime.endpointLatencyMs);
    if (runtime.endpointReachable && Number.isFinite(latency) && latency >= 0) return `${latency} ms`;
    if (runtime.endpointError) return 'нет ответа';
    return 'не проверен';
  }

  function handshakeLabel(runtime = {}) {
    const age = Number(runtime.latestHandshakeAgoSec);
    if (runtime.latestHandshake) return runtime.latestHandshake;
    if (Number.isFinite(age) && age >= 0) return `${age} sec ago`;
    return 'нет handshake';
  }

  function profileRuntimeMetrics(item = {}, runtime = {}) {
    if (!item.active) return '';
    const hasRuntime = runtime.backendReady || runtime.endpoint || runtime.interface || runtime.rxBytes || runtime.txBytes;
    if (!hasRuntime) return '';
    return `<div class="amnezia-profile-runtime ${runtimeTone(runtime)}">
      <span>${escapeHtml(runtimeLabel(runtime))}</span>
      <span>${escapeHtml(latencyLabel(runtime))}</span>
      <span>${escapeHtml(handshakeLabel(runtime))}</span>
      <span>${escapeHtml(`${formatBytes(runtime.rxBytes)} / ${formatBytes(runtime.txBytes)}`)}</span>
    </div>`;
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

  function preflightSummary(preflight = {}) {
    const checks = array(preflight.checks);
    if (!checks.length) return 'не проверено';
    const passed = checks.filter((check) => check.ok).length;
    return `${passed}/${checks.length} проверок`;
  }

  function profileEndpoint(profile = {}) {
    return profile.peer?.endpoint || profile.summary || 'endpoint не задан';
  }

  function profileCard(item = {}, runtime = {}) {
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
        ${profileRuntimeMetrics(item, runtime)}
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
    const runtime = status.runtime || {};
    const current = activeProfile(items, config);
    const currentPeer = current?.peer || {};
    const currentIface = current?.interface || {};
    const currentOptions = array(current?.obfuscationOptions);
    const selectedIds = selectedProfileIds(profiles);
    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const strategy = state.amneziaPoolStrategy || profiles.strategy || 'single';
    const mode = state.amneziaIntegrationMode || profiles.mode || 'standby';
    const xray = status.xrayIntegration || {};
    const selectedSummary = selectedItems.length ? `${selectedItems.length} проф. выбрано` : 'ничего не выбрано';
    const configState = config.exists ? `client.conf сохранен${config.updatedAt ? ` · ${config.updatedAt}` : ''}` : 'client.conf не импортирован';
    return `<section class="panel amnezia-profiles-panel">
      <div class="panel-title">
        <div>
          <h2>Управление AmneziaWG</h2>
          <span>Активный сервер, runtime-метрики, пул профилей и назначение маршрутизации в одном месте.</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary" type="button" data-action="openAmneziaImportDialog">Импорт client.conf</button>
          <span class="status-chip ${statusTone(status)}">${escapeHtml(statusLabel(status))}</span>
        </div>
      </div>
      <div class="amnezia-dashboard-grid">
        <article class="amnezia-active-profile ${current ? 'ok' : ''}">
          <div>
            <span class="eyebrow">активный сервер</span>
            <h3>${escapeHtml(current?.name || 'Профиль не выбран')}</h3>
            <p>${escapeHtml(current ? profileEndpoint(current) : 'Импортируйте client.conf или выберите профиль из списка.')}</p>
          </div>
          <div class="amnezia-profile-meta">
            ${currentIface.address ? `<span>${escapeHtml(currentIface.address)}</span>` : ''}
            ${currentPeer.allowedIPs ? `<span>${escapeHtml(`AllowedIPs ${currentPeer.allowedIPs}`)}</span>` : ''}
            ${currentOptions.length ? `<span>${escapeHtml(`AWG ${currentOptions.length}`)}</span>` : ''}
          </div>
          ${profileRuntimeMetrics(current || {}, runtime)}
        </article>

        <article class="amnezia-quick-actions">
          <span class="eyebrow">быстрые действия</span>
          <div class="amnezia-action-stack">
            <button class="btn warning" type="button" data-action="openAmneziaImportDialog">Импорт client.conf</button>
            ${commandButton('refreshAmnezia', 'Обновить статус')}
            <button class="btn secondary" type="button" data-action="checkAmneziaPreflight" ${current || config.exists ? '' : 'disabled'}>Проверить</button>
            <button class="btn secondary" type="button" data-action="prepareAmnezia" ${current || config.exists ? '' : 'disabled'}>Подготовить</button>
          </div>
          <div class="amnezia-dashboard-state">
            <span>${escapeHtml(configState)}</span>
            <span class="${preflight.ok ? 'ok' : 'warn'}">${escapeHtml(preflightSummary(preflight))}</span>
            <span>${escapeHtml(runtime.protocolVersion || 'AWG')}</span>
          </div>
        </article>

        <article class="amnezia-pool-editor">
          <label class="field-label">AWG-пул</label>
          <strong>${escapeHtml(selectedSummary)}</strong>
          <span>${escapeHtml(`${selectedItems.length} проф. · ${poolStrategyLabel(strategy)}`)}</span>
          <select class="input" data-amnezia-strategy>
            ${['single', 'round-robin', 'fallback', 'random'].map((item) => `<option value="${escapeHtml(item)}" ${strategy === item ? 'selected' : ''}>${escapeHtml(poolStrategyLabel(item))}</option>`).join('')}
          </select>
          <button class="btn secondary" type="button" data-action="saveAmneziaProfilePool" ${items.length ? '' : 'disabled'}>Сохранить пул</button>
        </article>

        <article class="amnezia-integration-editor">
          <label class="field-label">Маршрутизация</label>
          <strong>${escapeHtml(integrationModeLabel(mode))}</strong>
          <span>${escapeHtml(integrationModeDetail(mode))}</span>
          <select class="input" data-amnezia-mode>
            ${['standby', 'mixed', 'amnezia-first', 'xray-only'].map((item) => `<option value="${escapeHtml(item)}" ${mode === item ? 'selected' : ''}>${escapeHtml(integrationModeLabel(item))}</option>`).join('')}
          </select>
          <div class="amnezia-integration-metrics">
            <span>Xray proxy: ${escapeHtml(String(xray.proxyOutbounds ?? 0))}</span>
            <span>AWG rules: ${escapeHtml(String(xray.rules ?? 0))}</span>
            <span>${escapeHtml(xray.transparentReady ? 'transparent готов' : 'transparent не найден')}</span>
          </div>
          <button class="btn secondary" type="button" data-tab-jump="routing">Открыть маршрутизацию</button>
        </article>

        <div class="amnezia-profile-list">
          ${items.length ? items.map((item) => profileCard(item, runtime)).join('') : `<div class="empty-state">Профилей пока нет. Вставьте client.conf в блоке импорта и сохраните.</div>`}
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
    const configState = config.exists ? `сохранен${config.updatedAt ? ` · ${config.updatedAt}` : ''}` : 'не импортирован';
    return `<section class="panel amnezia-config-panel">
      <div class="panel-title">
        <div>
          <h2>client.conf</h2>
          <span>Добавление AWG-профиля открывается отдельным окном, как импорт VLESS/VMess.</span>
        </div>
        <div class="split-actions">
          <button class="btn warning" type="button" data-action="openAmneziaImportDialog">Импорт client.conf</button>
          ${commandButton('loadAmneziaConfig', 'Открыть сохраненный')}
          <button class="btn secondary" type="button" data-action="deleteAmneziaConfig" ${config.exists ? '' : 'disabled'}>Удалить</button>
        </div>
      </div>
      <div class="${config.exists ? 'settings-info compact' : 'empty-state'}">
        <strong>client.conf ${escapeHtml(configState)}</strong>
        <span>${escapeHtml(config.exists ? 'Детали профиля показаны в списке выше.' : 'Нажмите «Импорт client.conf», вставьте конфиг и сохраните профиль.')}</span>
      </div>
      ${warnings.length ? `<div class="settings-warning compact amnezia-warning">
        <strong>Проверьте конфиг</strong>
        <span>${escapeHtml(warnings.join(' '))}</span>
      </div>` : ''}
    </section>`;
  }

  function amneziaImportDialog(config = {}) {
    if (!state.amneziaImportDialog) return '';
    const warnings = array(config.warnings);
    const awgOptions = array(config.obfuscationOptions).length ? array(config.obfuscationOptions) : array(config.awgOptions);
    const iface = config.interface || {};
    const peer = config.peer || {};
    const showSavedConfig = state.amneziaConfigLoaded && config.exists;
    const text = state.amneziaConfigText || '';
    const profileName = state.amneziaProfileName || 'AmneziaWG';
    return `<div class="modal-backdrop" data-action="closeAmneziaImportDialog">
      <section class="modal import-dialog amnezia-import-dialog" role="dialog" aria-modal="true" aria-labelledby="amneziaImportTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="amneziaImportTitle">Импорт client.conf</h2>
            <span>Вставьте конфиг AmneziaWG, задайте имя профиля и сохраните его в пул AWG.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeAmneziaImportDialog" aria-label="Закрыть">&times;</button>
        </div>
        <div class="form-row">
          <label>Название профиля</label>
          <input class="input" data-amnezia-name value="${escapeHtml(profileName)}" placeholder="Например: cloudfour AWG">
        </div>
        ${showSavedConfig ? `<div class="compat-metrics">
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
      <div class="import-action-bar amnezia-import-actions">
        <button class="btn warning" type="button" data-action="saveAmneziaConfig">Сохранить конфиг</button>
        <button class="btn secondary" type="button" data-action="checkAmneziaPreflight">Проверить</button>
        <button class="btn secondary" type="button" data-action="prepareAmnezia">Подготовить</button>
      </div>
        ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      </section>
    </div>`;
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

  function amneziaTechnicalView({ status, interfaces, routing, services, wg, configs, kernel, glinet, userspace, plan, runtime }) {
    const runtimeStatus = runtime || {};
    const trafficDetail = `packets ${Number(runtimeStatus.rxPackets || 0)} / ${Number(runtimeStatus.txPackets || 0)}`;
    const errorDetail = `errors ${Number(runtimeStatus.rxErrors || 0)} / ${Number(runtimeStatus.txErrors || 0)} · drops ${Number(runtimeStatus.rxDropped || 0)} / ${Number(runtimeStatus.txDropped || 0)}`;
    return `<section class="amnezia-system-stack">
      <div class="panel-title amnezia-system-title">
        <div>
          <h2>Состояние AWG</h2>
          <span>Backend, команды, kernel module, интерфейсы и будущая схема policy routing.</span>
        </div>
      </div>
      <div class="amnezia-system-grid">
        ${glinetBackendView(glinet)}
        ${userspaceBackendView(userspace)}
      </div>

      <section class="panel amnezia-overview ${runtimeTone(runtimeStatus)}">
        <div class="panel-title">
          <div>
            <h2>AWG 2.0 runtime</h2>
            <span>Живое состояние backend, endpoint, handshake, задержки и сетевых счетчиков.</span>
          </div>
          <span class="status-chip ${runtimeTone(runtimeStatus)}">${escapeHtml(runtimeLabel(runtimeStatus))}</span>
        </div>
        <div class="compat-metrics">
          ${metric('Протокол', runtimeStatus.protocolVersion || runtimeStatus.protocol || 'нет', runtimeStatus.backendVersion || runtimeStatus.backend || '')}
          ${metric('Endpoint', runtimeStatus.endpoint || 'нет', latencyLabel(runtimeStatus))}
          ${metric('Интерфейс', runtimeStatus.interface || status.primaryInterface || 'нет', runtimeStatus.interfaceRunning ? 'UP' : 'DOWN')}
          ${metric('Peers', String(runtimeStatus.peerCount ?? 0), runtimeStatus.connected ? 'есть handshake' : handshakeLabel(runtimeStatus))}
          ${metric('RX / TX', `${formatBytes(runtimeStatus.rxBytes)} / ${formatBytes(runtimeStatus.txBytes)}`, trafficDetail)}
          ${metric('Ошибки / drops', errorDetail, runtimeStatus.endpointProbe ? array(runtimeStatus.endpointProbe).slice(0, 1).join('') : '')}
        </div>
      </section>

      <section class="panel amnezia-overview ${statusTone(status)}">
        <div class="panel-title">
          <div>
            <h2>Техническое состояние</h2>
            <span>Диагностика backend: RuOpenRay ничего не применяет к AmneziaWG без отдельного действия.</span>
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
            <h2>Policy routing</h2>
            <span>Технический план для отправки части трафика в AWG без глобального default route туннеля.</span>
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
    const runtime = status.runtime || {};
    const clientConfig = status.clientConfig || {};
    const profiles = clientConfig.profiles || {};
    const preflight = state.amneziaPreflight || clientConfig.preflight || {};
    const plan = status.routePlan || {};
    const view = state.amneziaView === 'awg' ? 'awg' : 'profiles';
    return `<section class="amnezia-page">
      ${amneziaImportDialog(clientConfig)}
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

      <div class="segmented settings-log-levels amnezia-section-tabs" aria-label="Раздел AmneziaWG">
        <button type="button" class="${view === 'profiles' ? 'active' : ''}" data-amnezia-view="profiles">Профили</button>
        <button type="button" class="${view === 'awg' ? 'active' : ''}" data-amnezia-view="awg">AWG</button>
      </div>

      ${view === 'awg'
        ? amneziaTechnicalView({ status, interfaces, routing, services, wg, configs, kernel, glinet, userspace, plan, runtime })
        : profilesView(profiles, clientConfig, status, preflight)}
    </section>`;
  }

  return { amneziaPanel };
}
