import { amneziaInterfaceFields, amneziaPeerFields, parseAmneziaConfigText } from './amnezia-config-editor.js';

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

  function commandButton(action, label, tone = 'secondary', disabled = false) {
    const busy = state.busyAction === action;
    return `<button class="btn ${escapeHtml(tone)} ${busy ? 'is-busy' : ''}" type="button" data-action="${escapeHtml(action)}" ${busy || disabled ? 'disabled' : ''}>${escapeHtml(busy ? 'Обновляю...' : label)}</button>`;
  }

  function metric(label, value, detail = '') {
    return `<article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || 'нет')}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
    </article>`;
  }

  function amneziaConfigField(section, field, value = '') {
    return `<label>
      <span class="field-label">${escapeHtml(field.label)}</span>
      <input class="input" data-amnezia-field="${escapeHtml(field.key)}" data-amnezia-section="${escapeHtml(section)}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" spellcheck="false">
    </label>`;
  }

  function amneziaStructuredEditor(text = '') {
    const model = parseAmneziaConfigText(text);
    return `<div class="amnezia-structured-editor">
      <article>
        <div>
          <h3>[Interface]</h3>
          <span>Локальный адрес, ключ клиента, DNS и дополнительные параметры AmneziaWG.</span>
        </div>
        <div class="amnezia-field-grid">
          ${amneziaInterfaceFields.map((field) => amneziaConfigField('interface', field, model.interface?.[field.key])).join('')}
        </div>
        <label class="amnezia-extra-field">
          <span class="field-label">Дополнительные параметры [Interface]</span>
          <textarea class="code-textarea" data-amnezia-extra="interface" rows="4" spellcheck="false" placeholder="Jc = 4&#10;Jmin = 40&#10;Jmax = 70">${escapeHtml((model.interfaceExtra || []).join('\n'))}</textarea>
        </label>
      </article>
      <article>
        <div>
          <h3>[Peer]</h3>
          <span>Сервер, публичный ключ, endpoint и AllowedIPs.</span>
        </div>
        <div class="amnezia-field-grid">
          ${amneziaPeerFields.map((field) => amneziaConfigField('peer', field, model.peer?.[field.key])).join('')}
        </div>
        <label class="amnezia-extra-field">
          <span class="field-label">Дополнительные параметры [Peer]</span>
          <textarea class="code-textarea" data-amnezia-extra="peer" rows="4" spellcheck="false" placeholder="S1 = ...&#10;H1 = ...">${escapeHtml((model.peerExtra || []).join('\n'))}</textarea>
        </label>
      </article>
    </div>`;
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
    if (runtime.connected) return 'подключен';
    if (runtime.interfaceRunning) return 'интерфейс поднят';
    if (runtime.backendReady) return 'готов к запуску';
    return 'способ запуска не готов';
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
    if (Number.isFinite(age) && age >= 0) return `${age} сек. назад`;
    return 'подключений ещё не было';
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
        return 'по очереди';
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
        return 'Для выбранных сайтов и устройств';
      case 'amnezia-first':
        return 'Основной выход в интернет';
      case 'xray-only':
        return 'Не использовать AmneziaWG';
      default:
        return 'Подготовить без маршрутизации';
    }
  }

  function integrationModeDetail(value) {
    switch (value) {
      case 'mixed':
        return 'Xray продолжит работать, а выбранные сценарии можно будет направлять через AmneziaWG.';
      case 'amnezia-first':
        return 'Интернет-трафик по умолчанию пойдёт через AmneziaWG; отдельные правила Xray сохранятся.';
      case 'xray-only':
        return 'Профили останутся сохранены, но трафик продолжит идти только через Xray или напрямую.';
      default:
        return 'Туннель можно проверить и запустить вручную, не меняя текущую маршрутизацию.';
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
      <label class="amnezia-profile-select" title="Добавить в группу серверов">
        <input type="checkbox" data-amnezia-pool="${escapeHtml(item.id || '')}" ${selected ? 'checked' : ''}>
        <span></span>
      </label>
      <div class="amnezia-profile-main">
        <span class="eyebrow">${escapeHtml(item.active ? 'используется' : 'сохранённое подключение')}</span>
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
        <button class="btn secondary compact" type="button" data-action="loadAmneziaProfile" data-amnezia-profile="${escapeHtml(item.id || '')}">Настроить</button>
        <button class="btn secondary compact" type="button" data-action="activateAmneziaProfile" data-amnezia-profile="${escapeHtml(item.id || '')}" ${item.active ? 'disabled' : ''}>Использовать</button>
        <button class="icon-btn danger" type="button" data-action="deleteAmneziaProfile" data-amnezia-profile="${escapeHtml(item.id || '')}" title="Удалить подключение" aria-label="Удалить подключение">×</button>
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
    const canManage = Boolean(current || config.exists);
    const managed = Boolean(status.control?.managed || runtime.interfaceRunning || status.running);
    const checks = array(preflight.checks);
    const checked = checks.length > 0;
    const checkPassed = checked && preflight.ok === true;
    const selectedSummary = selectedItems.length ? `${selectedItems.length} проф. выбрано` : 'ничего не выбрано';
    const connectionState = managed
      ? 'Туннель работает'
      : !canManage
        ? 'Добавьте подключение'
        : checkPassed
          ? 'Готов к запуску'
          : checked
            ? 'Нужны исправления'
            : 'Профиль сохранён';
    const connectionDetail = managed
      ? 'AmneziaWG запущен. Статистика подключения появится после первого обмена трафиком.'
      : !canManage
        ? 'Импортируйте client.conf из приложения Amnezia или от вашего VPN-провайдера.'
        : checkPassed
          ? 'Все обязательные проверки пройдены. Можно запускать туннель.'
          : checked
            ? 'Откройте результаты проверки ниже и устраните отмеченные проблемы.'
            : 'RuOpenRay проверит профиль, способ запуска и безопасность маршрутов перед включением.';
    return `<div class="amnezia-profiles-stack">
    <section class="panel amnezia-profiles-panel">
      <div class="panel-title">
        <div>
          <h2>Подключение AmneziaWG</h2>
          <span>Добавьте профиль, проверьте совместимость роутера и запустите туннель.</span>
        </div>
        <div class="split-actions">
          ${canManage ? '<button class="btn secondary" type="button" data-action="openAmneziaImportDialog">Добавить профиль</button>' : ''}
          <span class="status-chip ${managed ? 'ok' : (checked && !checkPassed ? 'warn' : '')}">${escapeHtml(connectionState)}</span>
        </div>
      </div>
      <div class="amnezia-setup-progress" aria-label="Порядок подключения AmneziaWG">
        <article class="${canManage ? 'done' : 'active'}"><span>${canManage ? '✓' : '1'}</span><div><strong>Профиль</strong><small>${canManage ? 'добавлен' : 'нужен client.conf'}</small></div></article>
        <article class="${checkPassed ? 'done' : (canManage ? 'active' : '')}"><span>${checkPassed ? '✓' : '2'}</span><div><strong>Проверка</strong><small>${checkPassed ? 'пройдена' : (checked ? 'есть замечания' : 'ещё не запускалась')}</small></div></article>
        <article class="${managed ? 'done' : (checkPassed ? 'active' : '')}"><span>${managed ? '✓' : '3'}</span><div><strong>Туннель</strong><small>${managed ? 'работает' : 'не запущен'}</small></div></article>
      </div>

      <div class="amnezia-connection-grid">
        <article class="amnezia-active-profile ${current ? 'ok' : ''}">
          <div>
            <span class="eyebrow">выбранное подключение</span>
            <h3>${escapeHtml(current?.name || 'Подключение не добавлено')}</h3>
            <p>${escapeHtml(current ? profileEndpoint(current) : 'Здесь появится сервер из импортированного client.conf.')}</p>
          </div>
          <div class="amnezia-profile-meta">
            ${currentIface.address ? `<span>${escapeHtml(currentIface.address)}</span>` : ''}
            ${currentPeer.allowedIPs ? `<span>${escapeHtml(`AllowedIPs ${currentPeer.allowedIPs}`)}</span>` : ''}
            ${currentOptions.length ? `<span>${escapeHtml(`AWG ${currentOptions.length}`)}</span>` : ''}
          </div>
          ${profileRuntimeMetrics(current || {}, runtime)}
        </article>

        <article class="amnezia-next-step ${managed ? 'ok' : (checked && !checkPassed ? 'warn' : '')}">
          <span class="eyebrow">следующий шаг</span>
          <h3>${escapeHtml(connectionState)}</h3>
          <p>${escapeHtml(connectionDetail)}</p>
          <div class="amnezia-primary-actions">
            ${!canManage
              ? '<button class="btn warning" type="button" data-action="openAmneziaImportDialog">Импортировать client.conf</button>'
              : managed
                ? commandButton('stopAmnezia', 'Остановить туннель', 'danger')
                : commandButton('checkAndStartAmnezia', 'Проверить и запустить', 'warning')}
            ${canManage && !managed ? '<button class="btn secondary" type="button" data-action="checkAmneziaPreflight">Только проверить</button>' : ''}
            ${canManage ? '<button class="btn secondary" type="button" data-action="loadAmneziaConfig">Настроить профиль</button>' : ''}
            ${commandButton('refreshAmnezia', 'Обновить состояние')}
          </div>
          <div class="amnezia-dashboard-state">
            <span class="${checkPassed ? 'ok' : (checked ? 'warn' : '')}">${escapeHtml(preflightSummary(preflight))}</span>
            <span>${escapeHtml(runtime.protocolVersion || 'AmneziaWG')}</span>
          </div>
        </article>
      </div>

      ${canManage ? `<section class="amnezia-usage-mode">
        <div>
          <span class="eyebrow">как использовать подключение</span>
          <h3>${escapeHtml(integrationModeLabel(mode))}</h3>
          <p>${escapeHtml(integrationModeDetail(mode))}</p>
        </div>
        <label>
          <span class="field-label">Режим трафика</span>
          <select class="input" data-amnezia-mode aria-label="Режим маршрутизации AmneziaWG">
            ${['standby', 'mixed', 'amnezia-first', 'xray-only'].map((item) => `<option value="${escapeHtml(item)}" ${mode === item ? 'selected' : ''}>${escapeHtml(integrationModeLabel(item))}</option>`).join('')}
          </select>
        </label>
        <div class="amnezia-usage-actions">
          <button class="btn secondary" type="button" data-action="saveAmneziaProfilePool">Сохранить режим</button>
          <button class="btn secondary" type="button" data-tab-jump="routing">Выбрать сценарии</button>
        </div>
      </section>` : ''}

      ${items.length ? `<section class="amnezia-saved-profiles">
        <div class="amnezia-subsection-head">
          <div><h3>Сохранённые подключения</h3><p>${escapeHtml(`${items.length} проф. · ${selectedItems.length || 1} используется`)}</p></div>
          <button class="btn secondary compact" type="button" data-action="openAmneziaImportDialog">Добавить</button>
        </div>
        <div class="amnezia-profile-list">${items.map((item) => profileCard(item, runtime)).join('')}</div>
      </section>` : ''}

      ${items.length > 1 ? `<details class="amnezia-advanced-panel">
        <summary>Несколько серверов и резервирование <span>${escapeHtml(`${selectedSummary} · ${poolStrategyLabel(strategy)}`)}</span></summary>
        <div class="amnezia-pool-editor">
          <label class="field-label">Как выбирать сервер</label>
          <select class="input" data-amnezia-strategy aria-label="Стратегия AWG-пула">
            ${['single', 'round-robin', 'fallback', 'random'].map((item) => `<option value="${escapeHtml(item)}" ${strategy === item ? 'selected' : ''}>${escapeHtml(poolStrategyLabel(item))}</option>`).join('')}
          </select>
          <button class="btn secondary" type="button" data-action="saveAmneziaProfilePool">Сохранить группу</button>
        </div>
      </details>` : ''}
    </section>
    ${preflightView(preflight)}
    </div>`;
  }

  function preflightView(preflight = {}) {
    const checks = array(preflight.checks);
    const warnings = array(preflight.warnings);
    const plan = array(preflight.plan);
    if (!checks.length && !warnings.length && !plan.length) return '';
    return `<section class="panel amnezia-preflight-panel ${preflight.ok ? 'ok' : 'warn'}">
      <div class="panel-title">
        <div>
          <h2>Проверка готовности</h2>
          <span>Проверка ничего не меняет: она сверяет профиль, поддержку роутера и безопасность маршрутов.</span>
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
      ${plan.length ? `<details class="amnezia-advanced-panel compact">
        <summary>Технический план запуска</summary>
        <div class="settings-info"><span>${escapeHtml(plan.join(' '))}</span></div>
      </details>` : ''}
    </section>`;
  }

  function warningsView(status = {}) {
    const warnings = array(status.warnings);
    if (!warnings.length) return '';
    return `<details class="amnezia-warning-summary">
      <summary><strong>Запуск требует внимания</strong><span>${escapeHtml(`${warnings.length} ${warnings.length === 1 ? 'пункт' : 'пункта'} для проверки`)}</span></summary>
      <ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
    </details>`;
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
            <h2 id="amneziaImportTitle">Новое подключение AmneziaWG</h2>
            <span>Вставьте client.conf из приложения Amnezia или от вашего VPN-провайдера.</span>
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
      <div class="amnezia-raw-head">
        <strong>client.conf</strong>
        <span>Конфигурация хранится только на роутере и не отправляется во внешние сервисы.</span>
      </div>
      <textarea class="amnezia-config-textarea code-textarea" data-amnezia-config spellcheck="false" placeholder="[Interface]
PrivateKey = ...
Address = ...
Jc = ...

[Peer]
PublicKey = ...
Endpoint = host:port
AllowedIPs = 0.0.0.0/0">${escapeHtml(text)}</textarea>
      <details class="amnezia-advanced-panel">
        <summary>Изменить отдельные поля <span>адрес, ключи, endpoint и параметры обфускации</span></summary>
        <div class="amnezia-import-structured-note">Используйте этот редактор вместо ручного изменения текста выше.</div>
        ${amneziaStructuredEditor(text)}
      </details>
      <div class="import-action-bar amnezia-import-actions">
        <button class="btn warning" type="button" data-action="saveAmneziaConfig">Сохранить подключение</button>
        <button class="btn secondary" type="button" data-action="checkAmneziaPreflight">Проверить конфигурацию</button>
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
    const url = state.amneziaUserspaceUrl || '';
    const sha256 = state.amneziaUserspaceSha256 || '';
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
      <div class="amnezia-userspace-form">
        <label>
          <span class="field-label">URL amneziawg-go</span>
          <input class="input" data-amnezia-userspace-url value="${escapeHtml(url)}" placeholder="https://example.com/amneziawg-go-linux-arm64">
        </label>
        <label>
          <span class="field-label">SHA-256</span>
          <input class="input" data-amnezia-userspace-sha256 value="${escapeHtml(sha256)}" placeholder="64 шестнадцатеричных символа" spellcheck="false">
        </label>
        <button class="btn secondary ${state.busyAction === 'prepareAmneziaUserspace' ? 'is-busy' : ''}" type="button" data-action="prepareAmneziaUserspace" ${state.busyAction === 'prepareAmneziaUserspace' ? 'disabled' : ''}>${state.busyAction === 'prepareAmneziaUserspace' ? 'Готовлю...' : 'Подготовить userspace'}</button>
        <small>${escapeHtml(userspace.installPath ? `HTTPS и SHA-256 обязательны. Будет сохранено в ${userspace.installPath}. Без запуска туннеля.` : 'HTTPS и SHA-256 обязательны. Без запуска туннеля.')}</small>
      </div>
      ${rollback ? `<div class="settings-info">
        <strong>Откат при ошибке</strong>
        <span>${escapeHtml(rollback)}</span>
      </div>` : ''}
    </section>`;
  }

  function amneziaTechnicalView({ status, interfaces, routing, services, wg, configs, kernel, glinet, userspace, plan, runtime }) {
    const runtimeStatus = runtime || {};
    const policy = status.policy || {};
    const policyWarnings = array(policy.warnings);
    const trafficDetail = `packets ${Number(runtimeStatus.rxPackets || 0)} / ${Number(runtimeStatus.txPackets || 0)}`;
    const errorDetail = `errors ${Number(runtimeStatus.rxErrors || 0)} / ${Number(runtimeStatus.txErrors || 0)} · drops ${Number(runtimeStatus.rxDropped || 0)} / ${Number(runtimeStatus.txDropped || 0)}`;
    const backendReady = Boolean(kernel.loaded || userspace.available || glinet.supportsNativeAmnezia);
    const configReady = Boolean(status.clientConfig?.exists);
    const tunnelReady = Boolean(runtimeStatus.interfaceRunning || status.running);
    return `<section class="amnezia-system-stack">
      <div class="panel-title amnezia-system-title">
        <div>
          <h2>Диагностика AmneziaWG</h2>
          <span>Подробности нужны только при проблемах с запуском или раздельной маршрутизацией.</span>
        </div>
      </div>

      <section class="panel amnezia-diagnostics-overview">
        <div class="amnezia-diagnostics-grid">
          <article class="${configReady ? 'ok' : 'warn'}"><span>Профиль</span><strong>${configReady ? 'добавлен' : 'не добавлен'}</strong><small>${escapeHtml(status.clientConfig?.name || 'нужен client.conf')}</small></article>
          <article class="${backendReady ? 'ok' : 'warn'}"><span>Способ запуска</span><strong>${backendReady ? 'готов' : 'не готов'}</strong><small>${escapeHtml(kernel.loaded ? 'модуль ядра' : (userspace.available ? 'userspace' : (glinet.supportsNativeAmnezia ? 'GL.iNet' : 'нужен модуль или userspace')))}</small></article>
          <article class="${tunnelReady ? 'ok' : ''}"><span>Туннель</span><strong>${tunnelReady ? 'работает' : 'остановлен'}</strong><small>${escapeHtml(runtimeStatus.interface || status.primaryInterface || 'интерфейс не создан')}</small></article>
          <article class="${policy.active ? 'ok' : ''}"><span>Сценарии</span><strong>${policy.active ? 'применены' : 'не применены'}</strong><small>${escapeHtml(`${Number(policy.ipTargetCount || 0)} IP/CIDR · ${Number(policy.domainTargets || 0)} доменов`)}</small></article>
        </div>
      </section>

      <details class="amnezia-tech-section">
        <summary><div><strong>Способ запуска</strong><span>Модуль ядра, GL.iNet или userspace</span></div><span class="status-chip ${backendReady ? 'ok' : 'warn'}">${backendReady ? 'готов' : 'требует настройки'}</span></summary>
        <div class="amnezia-tech-section-body"><div class="amnezia-system-grid">${glinetBackendView(glinet)}${userspaceBackendView(userspace)}</div></div>
      </details>

      <details class="amnezia-tech-section">
        <summary><div><strong>Туннель и трафик</strong><span>Сервер, подключение и сетевые счётчики</span></div><span class="status-chip ${tunnelReady ? runtimeTone(runtimeStatus) : ''}">${escapeHtml(tunnelReady ? runtimeLabel(runtimeStatus) : 'остановлен')}</span></summary>
        <div class="amnezia-tech-section-body"><div class="compat-metrics">
          ${metric('Протокол', runtimeStatus.protocolVersion || runtimeStatus.protocol || 'нет', runtimeStatus.backendVersion || runtimeStatus.backend || '')}
          ${metric('Сервер', runtimeStatus.endpoint || 'нет', latencyLabel(runtimeStatus))}
          ${metric('Интерфейс', runtimeStatus.interface || status.primaryInterface || 'нет', runtimeStatus.interfaceRunning ? 'UP' : 'DOWN')}
          ${metric('Подключение', String(runtimeStatus.peerCount ?? 0), runtimeStatus.connected ? 'есть обмен ключами' : handshakeLabel(runtimeStatus))}
          ${metric('Получено / отправлено', `${formatBytes(runtimeStatus.rxBytes)} / ${formatBytes(runtimeStatus.txBytes)}`, trafficDetail)}
          ${metric('Ошибки / потери', errorDetail, runtimeStatus.endpointProbe ? array(runtimeStatus.endpointProbe).slice(0, 1).join('') : '')}
        </div></div>
      </details>

      <details class="amnezia-tech-section">
        <summary><div><strong>Система и интерфейсы</strong><span>Команды, пакеты и найденные awg/wg-интерфейсы</span></div><span>${escapeHtml(statusLabel(status))}</span></summary>
        <div class="amnezia-tech-section-body">
          <div class="compat-metrics">
            ${metric('Интерфейс', status.primaryInterface || (interfaces.length ? `${interfaces.length} найдено` : 'нет'), interfaces.map((item) => item.name).filter(Boolean).join(', '))}
            ${metric('Сервис', services.running ? 'запущен' : (services.found ? 'найден' : 'нет'), array(services.items).map((item) => item.path).join(', '))}
            ${metric('Команда awg', wg.available ? (wg.command || 'доступна') : 'нет', array(wg.interfaces).join(', '))}
            ${metric('Модуль ядра', kernel.loaded ? 'загружен' : (kernel.installed || kernel.moduleFile ? 'найден' : 'нет'), kernel.package || array(kernel.files).join(', '))}
            ${metric('Userspace', userspace.available ? (userspace.command || 'найден') : 'нет', userspace.tunDevice ? 'TUN готов' : 'TUN не подтвержден')}
            ${metric('Конфигурации', configs.found ? `${array(configs.paths).length} найдено` : 'нет', array(configs.paths).join(', '))}
          </div>
          ${interfaces.length ? `<div class="amnezia-interface-grid">${interfaces.map(interfaceCard).join('')}</div>` : `<div class="empty-state compact">Активные awg/wg-интерфейсы пока не найдены.</div>`}
        </div>
      </details>

      <details class="amnezia-tech-section">
        <summary><div><strong>Раздельная маршрутизация</strong><span>Технические правила для выбранных сценариев</span></div><span class="status-chip ${policy.active ? 'ok' : ''}">${policy.active ? 'применена' : 'не применена'}</span></summary>
        <div class="amnezia-tech-section-body">
          <div class="split-actions amnezia-tech-actions">
            ${commandButton('applyAmneziaPolicy', policy.active ? 'Обновить правила AWG' : 'Применить правила AWG', 'warning', (Number(policy.ipTargetCount || 0) + Number(policy.domainNftsetCount || 0)) === 0 || !(status.control?.managed || status.running))}
            ${commandButton('rollbackAmneziaPolicy', 'Снять правила AWG', 'secondary', !policy.active && !policy.persistent)}
          </div>
          <div class="compat-metrics">
            ${metric('Таблица маршрутов', plan.table || '5200', plan.tableName || 'ruopenray_awg')}
            ${metric('Метка трафика', plan.mark || '0x52000000', 'только для выбранных правил')}
            ${metric('Основной маршрут', routing.defaultViaTunnel ? 'через туннель' : 'не изменён', routing.defaultRoute || '')}
            ${metric('Системное правило', routing.ipRule ? 'найдено' : 'не настроено', array(routing.rules).join(' · '))}
            ${metric('Правила AWG', policy.active ? 'применены' : (policy.persistent ? 'сохранены' : 'не применены'), `${Number(policy.appliedCount || 0)} из ${Number(policy.ipTargetCount || 0)} IP/CIDR · ${Number(policy.appliedDomainCount || 0)} из ${Number(policy.domainNftsetCount || 0)} доменов`)}
            ${metric('Доменные правила', String(Number(policy.domainTargets || 0)), `${Number(policy.domainNftsetCount || 0)} наборов${policyWarnings.length ? ` · ${policyWarnings.join(' · ')}` : ''}`)}
          </div>
          <div class="settings-info"><strong>Основной маршрут роутера не меняется</strong><span>Через AmneziaWG пойдут только сайты, подсети или устройства, которые вы явно выбрали в сценариях.</span></div>
        </div>
      </details>
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
    const hasProfile = Boolean(clientConfig.exists || array(profiles.items).length);
    const tunnelRunning = Boolean(status.active || status.running || runtime.interfaceRunning);
    const preflight = state.amneziaPreflight || clientConfig.preflight || {};
    const plan = status.routePlan || {};
    const view = state.amneziaView === 'awg' ? 'awg' : 'profiles';
    const heroTitle = tunnelRunning ? 'Туннель работает' : (hasProfile ? 'Подключение готово к проверке' : 'Можно начать настройку');
    const heroDetail = tunnelRunning
      ? 'AmneziaWG запущен. Вы можете направить через него выбранные сценарии или сделать его основным выходом.'
      : hasProfile
        ? 'Профиль сохранён. RuOpenRay проверит поддержку роутера и безопасно запустит отдельный туннель.'
        : 'Импортируйте client.conf, выберите способ использования и запустите туннель после автоматической проверки.';
    return `<section class="amnezia-page">
      ${amneziaImportDialog(clientConfig)}
      <section class="route-hero amnezia-hero">
        <div>
          <span class="eyebrow">AmneziaWG</span>
          <h1>${escapeHtml(heroTitle)}</h1>
          <p>${escapeHtml(heroDetail)}</p>
        </div>
        <div class="split-actions">
          ${commandButton('refreshAmnezia', 'Обновить статус')}
          <button class="btn secondary" type="button" data-tab-jump="routing">Открыть маршруты</button>
        </div>
      </section>

      ${warningsView(status)}

      <div class="segmented settings-log-levels amnezia-section-tabs" aria-label="Раздел AmneziaWG">
        <button type="button" class="${view === 'profiles' ? 'active' : ''}" data-amnezia-view="profiles">Подключение</button>
        <button type="button" class="${view === 'awg' ? 'active' : ''}" data-amnezia-view="awg">Диагностика</button>
      </div>

      ${view === 'awg'
        ? amneziaTechnicalView({ status, interfaces, routing, services, wg, configs, kernel, glinet, userspace, plan, runtime })
        : profilesView(profiles, clientConfig, status, preflight)}
    </section>`;
  }

  return { amneziaPanel };
}
