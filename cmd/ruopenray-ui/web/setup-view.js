import { isServiceOutbound } from './outbound-tags.js';
import { routePresetIconView } from './route-visuals.js';
import { serverDisplayName } from './server-location.js';

export function createSetupView({
  state,
  shellQuote,
  escapeHtml,
  byteSize,
  setupReadiness,
  loadSetupSnapshot,
  firewallReadyStatus,
  firewallPorts,
  firewallDeviceChoices,
  builtinRoutePresetEntries,
  customRoutePresetEntries,
  routePresetRules,
  routePresetTitle,
  routePresetDetail,
  routePresetConditionCount,
  routePresetInstallSummary,
  routeTargetOptions,
  activeProxyTag,
}) {
function normalizeCoreVersion(value = '') {
  const text = String(value || '');
  const explicit = text.match(/v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?/);
  return explicit ? explicit[0].replace(/^v/i, '') : '';
}

function versionParts(version = '') {
  return normalizeCoreVersion(version).split(/[.-]/).map((part) => Number.parseInt(part, 10)).filter((part) => Number.isFinite(part));
}

function compareCoreVersions(a = '', b = '') {
  const left = versionParts(a);
  const right = versionParts(b);
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function installedCoreVersion() {
  return normalizeCoreVersion(state.status?.core?.version || '');
}

function releaseDate(release) {
  const date = release?.publishedAt ? new Date(release.publishedAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'дата неизвестна';
}

function filteredCoreReleases() {
  const releases = state.coreReleases || [];
  if (state.coreReleaseFilter === 'stable') return releases.filter((release) => !release.prerelease);
  if (state.coreReleaseFilter === 'pre') return releases.filter((release) => release.prerelease);
  return releases;
}

function coreUpdateInfo() {
  const installed = installedCoreVersion();
  const installable = state.coreReleases.filter((release) => release.assetUrl);
  const latestStable = installable.find((release) => !release.prerelease);
  const latestAny = installable[0];
  const target = latestStable || latestAny;
  const current = installed ? `v${installed}` : '';
  const targetVersion = target?.tag || '';
  const hasUpdate = Boolean(targetVersion && (!installed || compareCoreVersions(targetVersion, installed) > 0));
  return { installed, current, target, latestStable, latestAny, hasUpdate };
}

function coreReleaseBadge(release) {
  if (release.prerelease) return '<span class="release-badge pre">Pre-release</span>';
  return '<span class="release-badge stable">Stable</span>';
}

function appVersionPill() {
  const app = state.status?.app || {};
  const version = app.version || 'dev';
  const release = state.appRelease || {};
  const hasUpdate = Boolean(release.update && release.assetUrl);
  const target = release.tag || '';
  const title = state.appReleaseChecking
    ? 'Проверяю обновления RuOpenRay UI'
    : hasUpdate
      ? `Доступно обновление RuOpenRay UI: ${version} → ${target}`
      : `RuOpenRay UI ${version}. Нажмите, чтобы проверить обновления`;
  const label = hasUpdate ? `RuOpenRay ${version} → ${target}` : `RuOpenRay ${version}`;
  return `<button class="pill app-version-pill ${hasUpdate ? 'has-update' : ''} ${state.appReleaseChecking ? 'checking' : ''}" type="button" data-action="appVersionClick" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
    <i class="dot ${hasUpdate ? 'warn' : 'ok'}"></i>${escapeHtml(state.appReleaseChecking ? 'Проверяю...' : label)}
  </button>`;
}

function coreArchitectureText() {
  const arch = state.coreArch || {};
  const runtimeArch = [arch.goos || arch.platform, arch.goarch || arch.arch].filter(Boolean).join('/');
  const packageArch = arch.packageArch ? `пакет: ${arch.packageArch}` : '';
  const uname = arch.uname ? `ядро: ${arch.uname}` : '';
  const asset = state.coreAsset || arch.githubAsset || '';
  return [
    runtimeArch ? `runtime: ${runtimeArch}` : '',
    packageArch,
    uname,
    asset ? `GitHub: ${asset}` : ''
  ].filter(Boolean).join(' · ') || 'Архитектура будет определена перед установкой.';
}

function githubInstallCommand(withXray = false) {
  const env = [`RUOPENRAY_PASSWORD=${shellQuote(state.installPassword || 'admin')}`];
  if (withXray) env.push('RUOPENRAY_INSTALL_XRAY=1');
  return `${env.join(' ')} sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"`;
}

function setupWizardSteps(readiness) {
  const xrayReady = Boolean(state.status?.core?.available);
  const proxyReady = proxyOutboundsSafe().length > 0;
  const transparentReady = Boolean(readiness.items.find((item) => item.key === 'transparent')?.ok);
  const defaultRouteReady = Boolean(readiness.items.find((item) => item.key === 'defaultRoute')?.ok);
  return [
    { id: 'connection', title: 'Подключения', detail: 'Xray и AmneziaWG', ok: xrayReady && proxyReady },
    { id: 'traffic', title: 'Трафик', detail: 'Устройства и правила', ok: transparentReady && defaultRouteReady },
    { id: 'verify', title: 'Проверка', detail: 'Сводка и включение', ok: Boolean(state.setupResult?.ok) }
  ];
}

function proxyOutboundsSafe() {
  try {
    return (state.config?.outbounds || []).filter((item) => item && !isServiceOutbound(item));
  } catch {
    return [];
  }
}

function setupStepIndex(steps) {
  const index = steps.findIndex((step) => step.id === state.setupStep);
  return index >= 0 ? index : 0;
}

function setupWizardStepper(steps) {
  const activeIndex = setupStepIndex(steps);
  return `<nav class="setup-stepper setup-step-rail" aria-label="Шаги мастера">
    ${steps.map((step, index) => {
      const stateClass = index === activeIndex ? 'active' : step.ok ? 'ok' : index < activeIndex ? 'warn' : 'pending';
      return `<button type="button" class="${stateClass}" data-setup-step="${escapeHtml(step.id)}" aria-label="Шаг ${index + 1}: ${escapeHtml(step.title)}. ${escapeHtml(step.detail || '')}" title="${escapeHtml(step.detail || step.title)}" ${index === activeIndex ? 'aria-current="step"' : ''}>
        <span>${step.ok ? '✓' : index + 1}</span>
        <strong>${escapeHtml(step.title)}</strong>
      </button>`;
    }).join('')}
  </nav>`;
}

function setupWizardSummary(steps) {
  const done = steps.filter((step) => step.ok).length;
  const progress = Math.round((done / Math.max(1, steps.length)) * 100);
  return `<section class="setup-step-summary">
    <div class="setup-step-summary-head">
      <span>Готовность</span>
      <strong>${done} из ${steps.length}</strong>
    </div>
    <div class="setup-progress" role="progressbar" aria-label="Готовность настройки" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><span style="width: ${progress}%"></span></div>
  </section>`;
}

function setupStepPrimaryLabel(isLast) {
  if (state.setupApplying) return 'Применяю...';
  if (isLast) return 'Проверить и включить';
  return 'Продолжить';
}

function setupStepSecondaryAction(step) {
  return '';
}

function setupStepNotice() {
  const notice = state.setupStepNotice;
  if (!notice || notice.step !== state.setupStep) return '';
  return `<section class="setup-step-notice ${escapeHtml(notice.level || 'warn')}" role="status">
    <strong>${escapeHtml(notice.title || 'Проверьте шаг')}</strong>
    <span>${escapeHtml(notice.detail || '')}</span>
  </section>`;
}

function amneziaConnection() {
  const status = state.amneziaStatus || state.status?.amnezia || {};
  const config = status.clientConfig || {};
  const items = Array.isArray(config.profiles?.items) ? config.profiles.items : [];
  const current = items.find((item) => item.active) || items.find((item) => item.id === state.amneziaProfileId) || null;
  const endpoint = String(config.peer?.endpoint || '').trim();
  const endpointName = endpoint.startsWith('[')
    ? endpoint.slice(1, endpoint.indexOf(']') > 0 ? endpoint.indexOf(']') : undefined)
    : endpoint.replace(/:\d+$/, '');
  return {
    count: items.length,
    name: current?.name || config.name || endpointName || (config.exists ? state.amneziaProfileName || 'AmneziaWG' : ''),
    ready: Boolean(current || config.exists),
    running: Boolean(status.control?.managed || status.runtime?.interfaceRunning || status.running)
  };
}

function setupScenarioTargetValue() {
  const options = routeTargetOptions();
  const selected = String(state.setupScenarioTarget || '');
  if (selected && options.some((option) => option.value === selected)) return selected;
  const active = `outbound:${activeProxyTag() || ''}`;
  if (options.some((option) => option.value === active)) return active;
  return options.find((option) => option.value === 'outbound:proxy')?.value || options[0]?.value || '';
}

function setupScenarioTargetDetail(value = '') {
  const target = String(value || '');
  if (target.startsWith('outbound:ruopenray-amnezia-direct:')) return 'Напрямую через выбранный AWG-профиль, без обработки Xray.';
  if (target === 'outbound:out-amnezia') return 'Xray применит свои правила и передаст трафик в активный AWG-профиль.';
  if (target === 'outbound:direct') return 'Напрямую через провайдера, без Xray и AmneziaWG.';
  if (target === 'outbound:block') return 'Соединения по выбранным правилам будут заблокированы.';
  if (target.startsWith('balancer:')) return 'Xray распределит трафик между серверами выбранной группы.';
  return 'Через выбранный Xray-сервер или подписку.';
}

function setupScenarioTargetOptions(options, targetValue) {
  const groups = [
    ['Xray', (value) => !value.startsWith('outbound:ruopenray-amnezia-direct:') && value !== 'outbound:out-amnezia' && !['outbound:direct', 'outbound:block'].includes(value)],
    ['AmneziaWG', (value) => value.startsWith('outbound:ruopenray-amnezia-direct:') || value === 'outbound:out-amnezia'],
    ['Другое', (value) => ['outbound:direct', 'outbound:block'].includes(value)],
  ];
  return groups.map(([label, matches]) => {
    const items = options.filter((option) => matches(String(option.value || '')));
    if (!items.length) return '';
    return `<optgroup label="${escapeHtml(label)}">${items.map((option) => `<option value="${escapeHtml(option.value)}" data-detail="${escapeHtml(setupScenarioTargetDetail(option.value))}" ${option.value === targetValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</optgroup>`;
  }).join('');
}

function setupScenarioInstallState(key) {
  const xray = routePresetInstallSummary(key);
  const title = routePresetTitle(key);
  const proxyRuleCount = routePresetRules(key).filter((rule) => rule?.outboundTag === 'proxy').length;
  const policies = Array.isArray(state.amneziaPolicyRules) ? state.amneziaPolicyRules : [];
  const awgCount = policies.filter((rule) => String(rule?.name || '') === title).length;
  const awgInstalled = proxyRuleCount > 0 && awgCount >= proxyRuleCount;
  return {
    installed: Boolean(xray.installed || awgInstalled),
    partial: Boolean(xray.partial || (awgCount > 0 && !awgInstalled)),
    matched: Math.max(Number(xray.matched || 0), awgCount),
  };
}

function setupScenariosBlock() {
  const entries = [...customRoutePresetEntries(), ...builtinRoutePresetEntries()];
  const seen = new Set();
  const uniqueEntries = entries.filter(([key]) => key && !seen.has(key) && seen.add(key));
  const query = String(state.setupScenarioSearch || '').trim().toLowerCase();
  const selected = new Set(Array.isArray(state.selectedRoutePresets) ? state.selectedRoutePresets : []);
  const options = routeTargetOptions();
  const targetValue = setupScenarioTargetValue();
  const rows = uniqueEntries.map(([key, preset]) => {
    const title = routePresetTitle(key);
    const detail = routePresetDetail(key) || preset?.detail || 'Готовый набор правил маршрутизации.';
    const conditionCount = routePresetConditionCount(key);
    const install = setupScenarioInstallState(key);
    const haystack = `${title} ${detail} ${key}`.toLowerCase();
    const hidden = query && !haystack.includes(query);
    const status = install.installed ? 'добавлен' : install.partial ? `частично ${install.matched}/${conditionCount}` : `${conditionCount} прав.`;
    return `<label class="setup-scenario-row preset-check ${install.installed ? 'installed' : install.partial ? 'partial' : ''}" data-setup-scenario-row data-scenario-search="${escapeHtml(haystack)}" ${hidden ? 'hidden' : ''}>
      <input type="checkbox" data-route-preset-check="${escapeHtml(key)}" ${selected.has(key) ? 'checked' : ''} ${install.installed ? 'disabled' : ''} />
      ${routePresetIconView(escapeHtml, key, preset, 'setup-scenario-icon')}
      <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
      <em>${escapeHtml(status)}</em>
    </label>`;
  }).join('');
  return `<section class="setup-scenarios">
    <div class="setup-scenarios-head">
      <div><h4>Сценарии</h4><p>Отметьте сервисы и сразу выберите, куда направлять их трафик.</p></div>
      <button class="btn secondary" type="button" data-action="updateRoutePresetSources">Обновить</button>
    </div>
    <div class="setup-scenario-controls">
      <label class="setup-scenario-control">
        <span>Сервис</span>
        <input id="setupScenarioSearch" value="${escapeHtml(state.setupScenarioSearch || '')}" placeholder="Найти сценарий" />
      </label>
      <label class="setup-scenario-control setup-scenario-target-control">
        <span>Куда направлять</span>
        <select id="setupScenarioTarget" aria-describedby="setupScenarioTargetDetail">
          ${setupScenarioTargetOptions(options, targetValue)}
        </select>
        <small id="setupScenarioTargetDetail" data-setup-scenario-target-detail>${escapeHtml(setupScenarioTargetDetail(targetValue))}</small>
      </label>
    </div>
    <div class="setup-scenario-list">${rows || '<div class="empty-state">Сценарии пока не загружены. Обновите подключенный источник.</div>'}</div>
    <div class="setup-scenario-footer">
      <span>Выбрано: <strong data-setup-scenario-selected>${selected.size}</strong></span>
      <button class="btn warning" type="button" data-action="applySetupRoutePresets" ${selected.size ? '' : 'disabled'}>Добавить выбранные</button>
    </div>
  </section>`;
}

function setupDeviceScopeText() {
  const count = Array.isArray(state.firewallSelectedDevices) ? state.firewallSelectedDevices.length : 0;
  if (state.firewallDeviceMode === 'selected') return count ? `${count} выбранных устройств` : 'устройства не выбраны';
  if (state.firewallDeviceMode === 'exclude') return count ? `вся сеть, кроме ${count}` : 'вся локальная сеть';
  return 'вся локальная сеть';
}

function setupDeviceScopeBlock() {
  const mode = ['all', 'selected', 'exclude'].includes(state.firewallDeviceMode) ? state.firewallDeviceMode : 'all';
  const devices = typeof firewallDeviceChoices === 'function' ? firewallDeviceChoices() : [];
  const selected = new Set(Array.isArray(state.firewallSelectedDevices) ? state.firewallSelectedDevices : []);
  const needsSelection = mode !== 'all';
  const emptySelected = mode === 'selected' && selected.size === 0;
  return `<section class="setup-device-scope ${emptySelected ? 'warn' : ''}">
    <div class="setup-device-scope-head">
      <div><h4>Устройства</h4><p>Для каких клиентов роутера применять правила RuOpenRay.</p></div>
      <strong>${escapeHtml(setupDeviceScopeText())}</strong>
    </div>
    <div class="segmented setup-device-modes" role="group" aria-label="Охват устройств">
      ${[
        ['all', 'Вся сеть'],
        ['selected', 'Только выбранные'],
        ['exclude', 'Кроме выбранных'],
      ].map(([value, label]) => `<button type="button" class="${mode === value ? 'active' : ''}" data-firewall-device-mode="${value}">${label}</button>`).join('')}
    </div>
    ${needsSelection ? `<div class="setup-device-list">
      ${devices.length ? devices.slice(0, 16).map((device) => `<label class="setup-device-option ${selected.has(device.ip) ? 'active' : ''}">
        <input type="checkbox" data-firewall-device="${escapeHtml(device.ip)}" ${selected.has(device.ip) ? 'checked' : ''} />
        <span><strong>${escapeHtml(device.name || device.ip)}</strong><small>${escapeHtml([device.ip, device.mac].filter(Boolean).join(' · '))}</small></span>
      </label>`).join('') : '<p class="muted">DHCP-клиенты пока не найдены. Подключите устройство к роутеру и обновите страницу.</p>'}
    </div>` : ''}
    ${emptySelected ? '<p class="setup-device-warning" role="status">Выберите хотя бы одно устройство, иначе режим «Только выбранные» не может быть применён.</p>' : ''}
  </section>`;
}

function setupApplyPlan(readiness, snapshot) {
  const byKey = new Map((readiness?.items || []).map((item) => [item.key, item]));
  const xrayReady = Boolean(byKey.get('transparent')?.ok && byKey.get('defaultRoute')?.ok);
  const firewallReady = Boolean(byKey.get('firewall')?.ok);
  const dnsReady = state.setupLanDnsMode === 'keep' || Boolean(byKey.get('dns')?.ok);
  const plan = [
    {
      title: 'Точка отката',
      detail: 'Сохранить config.json, LAN DNS и текущее состояние nftables.',
      ready: Boolean(snapshot),
      pending: 'будет создана',
    },
    {
      title: 'Подготовка Xray',
      detail: xrayReady
        ? 'Transparent inbound, локальные исключения и финальный маршрут уже готовы.'
        : `Добавить перехват, локальные исключения и маршрут остального трафика через ${activeProxyName()}.`,
      ready: xrayReady,
      pending: 'будет настроено',
    },
    {
      title: 'Перехват трафика',
      detail: `${String(state.firewallRouterMode || 'tproxy').toUpperCase()} · ${setupDeviceScopeText()}.`,
      ready: firewallReady,
      pending: 'будет применено',
    },
    {
      title: 'DNS локальной сети',
      detail: state.setupLanDnsMode === 'keep'
        ? 'Оставить текущую настройку OpenWrt без изменений.'
        : state.setupLanDnsMode === 'upstream'
          ? `Направить dnsmasq на ${state.setupLanDnsUpstream || 'указанный внешний DNS'}.`
          : 'Направить dnsmasq на DNS-вход Xray.',
      ready: dnsReady,
      pending: 'будет настроено',
    },
  ];
  return `<section class="setup-apply-plan">
    <div class="setup-apply-plan-head"><h4>Что сделает мастер</h4><span>Сначала проверка, затем применение</span></div>
    <ol>
      ${plan.map((item, index) => `<li class="${item.ready ? 'ready' : ''}">
        <span>${item.ready ? '✓' : index + 1}</span>
        <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>
        <em>${item.ready ? 'готово' : item.pending}</em>
      </li>`).join('')}
    </ol>
  </section>`;
}

function setupWizardStepBody(readiness, diskFree, snapshot, result, rollback) {
  const step = ['connection', 'traffic', 'verify'].includes(state.setupStep) ? state.setupStep : 'connection';
  const proxyCount = proxyOutboundsSafe().length;
  const coreReady = Boolean(state.status?.core?.available);
  const fwMode = state.firewallRouterMode || state.firewallStatus?.routerMode || 'off';
  const awg = amneziaConnection();
  if (step === 'connection') {
    const activeOutbound = activeProxyOutbound();
    const activeTag = String(activeOutbound?.tag || '');
    const xrayEndpoint = proxyEndpoint(activeOutbound);
    return `<section class="setup-step-panel">
      <h3>Подключения</h3>
      <p>Выберите основное подключение Xray. AmneziaWG можно добавить как отдельное назначение для нужных правил.</p>
      ${coreReady ? '' : `<div class="setup-connection-alert">
        <div><strong>Xray не установлен</strong><span>Сначала установите ядро, затем добавьте сервер или подписку.</span></div>
        <button class="btn warning" type="button" data-action="openInstallWizard">Установить Xray</button>
      </div>`}
      <div class="setup-connection-grid">
        <article class="${proxyCount ? 'ok' : 'warn'}">
          <div class="setup-connection-head"><span>Xray</span><em>${proxyCount ? 'готов' : 'нужно подключение'}</em></div>
          <div class="setup-connection-main">
            <small>Основной сервер</small>
            <strong title="${escapeHtml(activeTag)}">${proxyCount ? escapeHtml(activeProxyName()) : 'Не добавлен'}</strong>
            <span>${proxyCount ? `${escapeHtml(xrayEndpoint)}${xrayEndpoint ? ' · ' : ''}${proxyCount} серверов доступно` : 'Добавьте сервер вручную или импортируйте подписку.'}</span>
          </div>
          <div class="setup-connection-actions">
            <button class="btn ${proxyCount ? 'secondary' : 'warning'}" type="button" data-import-dialog="server">Добавить</button>
            <button class="btn secondary" type="button" data-tab-jump="servers">Управление</button>
          </div>
        </article>
        <article class="${awg.ready ? 'ok' : ''}">
          <div class="setup-connection-head"><span>AmneziaWG</span><em>${awg.ready ? (awg.running ? 'работает' : 'готов') : 'необязательно'}</em></div>
          <div class="setup-connection-main">
            <small>AWG-профиль</small>
            <strong>${escapeHtml(awg.name || 'Не настроен')}</strong>
            <span>${awg.ready ? `${awg.count ? `${awg.count} проф.` : 'client.conf сохранен'} · можно выбирать в правилах` : 'Добавьте сейчас или вернитесь к этому позже.'}</span>
          </div>
          <div class="setup-connection-actions">
            <button class="btn ${awg.ready ? 'secondary' : 'warning'}" type="button" data-action="openAmneziaImportDialog">Импорт</button>
            <button class="btn secondary" type="button" data-tab-jump="amnezia">Управление</button>
          </div>
        </article>
      </div>
    </section>`;
  }
  if (step === 'traffic') {
    const rulesCount = Array.isArray(state.config?.routing?.rules) ? state.config.routing.rules.length : 0;
    return `<section class="setup-step-panel">
      <h3>Трафик</h3>
      <p>Выберите устройства, затем отметьте сервисы и назначьте им Xray, AmneziaWG или прямое подключение.</p>
      ${setupDeviceScopeBlock()}
      ${setupScenariosBlock()}
      <div class="setup-traffic-summary">
        <span><small>Правила</small><strong>${rulesCount}</strong></span>
        <span><small>Остальной трафик</small><strong>${escapeHtml(activeProxyName())}</strong></span>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="rules">Расширенные правила</button>
      </div>
    </section>`;
  }
  const dnsMode = state.setupLanDnsMode === 'keep' ? 'без изменений' : state.setupLanDnsMode === 'upstream' ? 'внешний DNS' : 'через Xray';
  const deviceMode = setupDeviceScopeText();
  const rulesCount = Array.isArray(state.config?.routing?.rules) ? state.config.routing.rules.length : 0;
  return `<section class="setup-step-panel">
    <h3>Проверка перед включением</h3>
    <p>Проверьте выбранную схему. RuOpenRay сначала создаст точку отката и проверит конфигурацию.</p>
    <div class="setup-review-list">
      <article><span>Трафик</span><strong>${escapeHtml(deviceMode)} → ${escapeHtml(activeProxyName())}</strong></article>
      <article><span>Правила</span><strong>${rulesCount} · Xray${awg.ready ? ` · AWG ${escapeHtml(awg.name)}` : ''}</strong></article>
      <article><span>DNS</span><strong>${escapeHtml(dnsMode)}</strong></article>
    </div>
    ${setupApplyPlan(readiness, snapshot)}
    <button class="btn secondary setup-advanced-toggle" type="button" data-action="toggleSetupAdvanced" aria-expanded="${state.setupAdvancedOpen ? 'true' : 'false'}">${state.setupAdvancedOpen ? 'Скрыть DNS и перехват' : 'Изменить DNS и перехват'}</button>
    ${state.setupAdvancedOpen ? `<section class="setup-advanced-options">
      <div>
        <h4>DNS для локальной сети</h4>
        ${setupLanDnsBlock()}
      </div>
      <div class="setup-choice-grid compact">
        <article><span>Режим трафика</span><strong>${escapeHtml(String(fwMode).toUpperCase())}</strong><small>Меняется в разделе перехвата.</small></article>
        <article><span>Порты</span><strong>${state.firewallPortMode === 'all' ? 'Все' : escapeHtml(firewallPorts().join(', ') || '80, 443')}</strong><small>${state.firewallBlockQuic ? 'QUIC блокируется.' : 'QUIC разрешен.'}</small></article>
        <article><span>Geo-проверка</span><strong>${escapeHtml(geoDoctorText())}</strong><small>Проверится вместе с конфигурацией.</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn secondary" type="button" data-tab-jump="dns">Открыть DNS</button>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Открыть перехват</button>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="geo">Открыть Geo</button>
      </div>
    </section>` : ''}
    ${setupSnapshotBlock(snapshot)}
    ${resultBlock(result, rollback)}
  </section>`;
}

function setupLanDnsBlock() {
  return `<section class="setup-lan-dns in-step">
    <div class="segmented setup-dns-modes">
      ${[
        ['keep', 'Не трогать'],
        ['xray', 'Через Xray'],
        ['upstream', 'Внешний DNS']
      ].map(([mode, label]) => `<button type="button" class="${state.setupLanDnsMode === mode ? 'active' : ''}" data-setup-dns-mode="${mode}">${label}</button>`).join('')}
    </div>
    ${state.setupLanDnsMode === 'upstream' ? `<div class="form-row">
      <label>DNS / Pi-hole / AdGuard Home</label>
      <input id="setupLanDnsUpstream" value="${escapeHtml(state.setupLanDnsUpstream)}" placeholder="192.168.1.10 или 192.168.1.10:53" />
    </div>` : ''}
    <label class="toggle-row">
      <input id="setupRestartDnsmasq" type="checkbox" ${state.setupRestartDnsmasq ? 'checked' : ''} />
      <span>Перезапустить dnsmasq после изменения</span>
    </label>
  </section>`;
}

function setupSnapshotBlock(snapshot) {
  if (!snapshot) return '';
  return `<section class="setup-snapshot in-step">
    <div>
      <h3>Точка отката</h3>
      <p>Снимок от ${escapeHtml(new Date(snapshot.createdAt).toLocaleString('ru-RU'))}: конфигурация Xray, LAN DNS и nftables.</p>
    </div>
    <div class="split-actions">
      <button class="btn secondary" type="button" data-action="rollbackSetupWizard" ${!state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>${state.setupRollbacking ? 'Откатываю...' : 'Откатить изменения'}</button>
      <button class="btn secondary" type="button" data-action="clearSetupSnapshot" ${!state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>Забыть снимок</button>
    </div>
  </section>`;
}

function resultBlock(result, rollback) {
  return `${result ? `<div class="setup-result ${result.ok ? 'ok' : 'bad'}">
    <strong>${result.ok ? 'Готово' : 'Нужна проверка'}</strong>
    ${result.error ? `<span>${escapeHtml(result.error)}</span>` : ''}
    <div class="setup-result-list">
      ${(result.steps || []).map((step) => `<article class="${step.ok ? 'ok' : 'bad'}">
        <span>${step.ok ? '✓' : '×'}</span>
        <div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail || '')}</small></div>
      </article>`).join('')}
    </div>
  </div>` : ''}
  ${rollback ? `<div class="setup-result ${rollback.ok ? 'ok' : 'bad'}">
    <strong>${rollback.ok ? 'Откат выполнен' : 'Откат требует внимания'}</strong>
    ${rollback.error ? `<span>${escapeHtml(rollback.error)}</span>` : ''}
    <div class="setup-result-list">
      ${(rollback.steps || []).map((step) => `<article class="${step.ok ? 'ok' : 'bad'}">
        <span>${step.ok ? '✓' : '×'}</span>
        <div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail || '')}</small></div>
      </article>`).join('')}
    </div>
  </div>` : ''}`;
}

function activeProxyName() {
  const outbound = activeProxyOutbound();
  if (!outbound) return 'не выбран';
  return serverDisplayName(outbound, state.serverMeta?.[outbound.tag] || {});
}

function activeProxyOutbound() {
  const outbounds = proxyOutboundsSafe();
  const routingRules = state.config?.routing?.rules || [];
  const firstProxy = routingRules.find((rule) => rule?.outboundTag && outbounds.some((outbound) => outbound.tag === rule.outboundTag));
  return outbounds.find((outbound) => outbound.tag === firstProxy?.outboundTag) || outbounds[0] || null;
}

function proxyEndpoint(outbound = {}) {
  const server = outbound?.settings?.vnext?.[0] || outbound?.settings?.servers?.[0] || {};
  return [server.address, server.port].filter(Boolean).join(':');
}

function lastServerCheckText() {
  const checks = state.serverChecks || {};
  const values = Object.values(checks).filter(Boolean);
  const best = values.find((item) => Number.isFinite(Number(item.latencyMs)));
  return best ? `${Math.round(Number(best.latencyMs))} мс` : 'не проверялись';
}

function geoDoctorText() {
  const audit = state.geoStatus?.audit;
  const missing = Number(audit?.summary?.missing || 0);
  if (missing > 0) return `${missing} проблем`;
  if (audit?.summary) return 'ок';
  return 'не запускался';
}

function setupPage() {
  const readiness = setupReadiness();
  const result = state.setupResult;
  const rollback = state.setupRollbackResult;
  const snapshot = loadSetupSnapshot();
  const installPlan = state.installPlan;
  const diskFree = state.geoStatus?.disk?.free || state.status?.system?.disk?.free || installPlan?.disk?.free;
  const steps = setupWizardSteps(readiness);
  const activeIndex = setupStepIndex(steps);
  const isLast = activeIndex >= steps.length - 1;
  const currentStep = steps[activeIndex] || steps[0];
  const primaryAction = isLast ? 'runSetupWizard' : 'setupStepNext';
  const primaryDisabled = state.setupApplying || (isLast && !readiness.canApply);
  return `
    <section class="setup-page">
      <div class="setup-guided-layout">
        <aside class="setup-guide-rail">
          ${setupWizardStepper(steps)}
          ${setupWizardSummary(steps)}
        </aside>
        <div class="setup-guide-workspace">
          ${setupStepNotice()}
          ${setupWizardStepBody(readiness, diskFree, snapshot, result, rollback)}
          <div class="setup-actions setup-step-actions">
            <button class="btn secondary" type="button" data-action="setupStepBack" ${activeIndex <= 0 || state.setupApplying ? 'disabled' : ''}>Назад</button>
            ${setupStepSecondaryAction(currentStep?.id)}
            <button class="btn warning" type="button" data-action="${primaryAction}" ${primaryDisabled ? 'disabled' : ''}>${setupStepPrimaryLabel(isLast)}</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function setupWizardDialog() {
  return '';
}

function installWizardDialog() {
  if (!state.installWizardOpen) return '';
  const plan = state.installPlan;
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const installing = state.coreUpdating || state.installStep === 'installing';
  const geoReady = Boolean(plan?.geo?.geoip?.exists && plan?.geo?.geosite?.exists);
  const canInstall = Boolean(plan?.installable) || !plan;
  const storage = plan?.storage || {};
  const installCommand = githubInstallCommand(false);
  const installWithXrayCommand = githubInstallCommand(true);
  return `
    <div class="modal-backdrop" data-action="closeInstallWizard">
      <section class="modal install-wizard" role="dialog" aria-modal="true" aria-labelledby="installWizardTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="installWizardTitle">Установка Xray на OpenWrt</h2>
            <p>Проверяем окружение роутера: пакетный менеджер, архитектуру, свободное место, geo-файлы и init-сервис.</p>
          </div>
          <button class="icon-btn" type="button" data-action="closeInstallWizard" aria-label="Закрыть">×</button>
        </div>
        <div class="install-steps">
          ${steps.length ? steps.map((step) => `<article class="${step.ok ? 'ok' : 'warn'}">
            <span>${step.ok ? '✓' : '!'}</span>
            <div>
              <strong>${escapeHtml(step.title)}</strong>
              <small>${escapeHtml(step.detail || '')}</small>
            </div>
          </article>`).join('') : '<p class="muted">Загружаю план установки...</p>'}
        </div>
        <div class="install-summary">
          <article><span>Пакетный менеджер</span><strong>${escapeHtml(plan?.packageManager || 'проверяем')}</strong></article>
          <article><span>Архитектура</span><strong>${escapeHtml(plan?.arch?.uname || plan?.arch?.goarch || 'проверяем')}</strong></article>
          <article><span>Свободно</span><strong>${escapeHtml(plan?.disk?.free ? byteSize(plan.disk.free) : 'проверяем')}</strong></article>
          <article><span>Geo-файлы</span><strong>${geoReady ? 'готовы' : 'после установки'}</strong></article>
        </div>
        <section class="install-command-card">
          <div>
            <strong>Установка одной командой с GitHub</strong>
            <span>Команда определит OpenWrt 24/25, пакетный менеджер, архитектуру, поставит зависимости TPROXY и скачает подходящий бинарник RuOpenRay.</span>
          </div>
          <label>
            Пароль панели
            <input id="installPassword" value="${escapeHtml(state.installPassword)}" autocomplete="new-password" />
          </label>
          <pre id="installCommandBasic" class="console compact">${escapeHtml(installCommand)}</pre>
          <pre id="installCommandWithXray" class="console compact">${escapeHtml(installWithXrayCommand)}</pre>
          <div class="split-actions">
            <button class="btn secondary" type="button" data-action="copyInstallCommand">Скопировать базовую</button>
            <button class="btn secondary" type="button" data-action="copyInstallWithXrayCommand">Скопировать с Xray</button>
            <small>Этот пароль уже встроен в обе команды как <code>RUOPENRAY_PASSWORD</code>. Вторая команда дополнительно ставит <code>xray-core</code>.</small>
          </div>
        </section>
        <div class="nand-plan ${storage.leanOk === false ? 'danger' : ''}">
          <div>
            <strong>Экономный режим для роутера</strong>
            <span>${escapeHtml(storage.recommendedMode || 'Без лишних резервных копий, компактные geo и контроль свободного места.')}</span>
          </div>
          <div class="nand-plan-grid">
            <article><span>Панель</span><strong>${escapeHtml(byteSize(storage.panelSize))}</strong></article>
            <article><span>Xray</span><strong>${escapeHtml(byteSize(storage.xraySize || 30 * 1024 * 1024))}</strong></article>
            <article><span>Geo сейчас</span><strong>${escapeHtml(byteSize(storage.geoCurrent))}</strong></article>
            <article><span>Резервные копии</span><strong>${escapeHtml(byteSize(storage.backupCurrent))}</strong></article>
            <article><span>Минимум нужно</span><strong>${escapeHtml(byteSize(storage.leanRequired))}</strong></article>
            <article><span>Полный geo</span><strong>${escapeHtml(byteSize(storage.fullRequired))}</strong></article>
          </div>
        </div>
        <div class="settings-warning">
          <strong>Порядок</strong>
          <span>Сначала ставим xray-core через пакетный менеджер OpenWrt. Затем обновляем geo-файлы, чтобы правила geosite/geoip проходили проверку конфигурации.</span>
        </div>
        <div class="toolbar">
          <button class="btn secondary ${state.busyAction === 'refreshInstallPlan' ? 'is-busy' : ''}" type="button" data-action="refreshInstallPlan" ${installing || state.busyAction === 'refreshInstallPlan' ? 'disabled' : ''}>${state.busyAction === 'refreshInstallPlan' ? 'Проверяю...' : 'Проверить заново'}</button>
          <button class="btn warning ${installing ? 'is-busy' : ''}" type="button" data-action="installCorePackage" ${installing || !canInstall ? 'disabled' : ''}>${installing ? 'Устанавливаю...' : 'Установить Xray'}</button>
          <button class="btn secondary" type="button" data-tab-jump="geo">Geo-файлы</button>
        </div>
        ${state.coreUpdate ? `<div class="core-result">
          <strong>${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.packageManager || '')}</strong>
          <span>${escapeHtml(state.coreUpdate.after || state.coreUpdate.stderr || state.coreUpdate.stdout || '')}</span>
        </div>` : ''}
      </section>
    </div>
  `;
}

function coreUpdateDialog() {
  if (!state.coreDialogOpen) return '';
  const releases = filteredCoreReleases();
  const visibleReleases = releases.slice(0, 8);
  const info = coreUpdateInfo();
  const missing = !state.status?.core?.available;
  const selectedInstalled = !missing && state.selectedCoreVersion && info.current === state.selectedCoreVersion;
  const canInstallSelected = Boolean(state.selectedCoreVersion && !selectedInstalled);
  return `
    <div class="modal-backdrop" data-action="closeCoreDialog">
      <section class="modal core-dialog" role="dialog" aria-modal="true" aria-labelledby="coreDialogTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="coreDialogTitle">${missing ? 'Установка Xray' : 'Обновление ядра Xray'}</h2>
            <span>${escapeHtml(info.current || 'текущая версия не определена')} → ${escapeHtml(state.selectedCoreVersion || info.target?.tag || 'выберите релиз')}</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeCoreDialog" aria-label="Закрыть">×</button>
        </div>
        <div class="core-update-banner ${info.hasUpdate ? 'has-update' : ''}">
          <strong>${missing ? 'Xray не установлен' : info.hasUpdate ? 'Есть обновление' : 'Актуальная стабильная версия уже установлена'}</strong>
          <span>${missing ? 'Для OpenWrt проще начать с пакета xray-core из репозитория, а версии из GitHub оставить для ручного выбора.' : info.target ? `${info.target.prerelease ? 'Последний pre-release' : 'Последний stable'}: ${escapeHtml(info.target.tag)} · ${releaseDate(info.target)}` : 'Релизы пока не загружены'}</span>
        </div>
        <div class="core-arch-strip">
          <strong>Архитектура</strong>
          <span>${escapeHtml(coreArchitectureText())}</span>
        </div>
        <div class="toolbar core-update-toolbar">
          <button class="btn secondary ${state.coreReleaseChecking ? 'is-busy' : ''}" type="button" data-action="checkCoreUpdates" ${state.coreReleaseChecking || state.coreUpdating ? 'disabled' : ''}>${state.coreReleaseChecking ? 'Проверяю...' : 'Проверить обновления'}</button>
          ${state.coreReleasesError ? `<span class="form-error">${escapeHtml(state.coreReleasesError)}</span>` : `<span class="muted">${state.coreReleases.length ? `Загружено релизов: ${state.coreReleases.length}` : 'Список релизов еще не загружен'}</span>`}
        </div>
        ${missing ? `<div class="core-install-card">
          <div>
            <strong>Пакет OpenWrt</strong>
            <span>OpenWrt 25: <code>apk</code>, OpenWrt 24: <code>opkg</code>. Перед установкой backend сверит архитектуру системы и пакетного репозитория.</span>
          </div>
          <button class="btn" type="button" data-action="openInstallWizard" ${state.coreUpdating ? 'disabled' : ''}>${state.coreUpdating ? 'Устанавливаю...' : 'Открыть мастер'}</button>
        </div>` : ''}
        <div class="segmented core-filters" aria-label="Фильтр релизов">
          ${[
            ['stable', 'Stable'],
            ['pre', 'Pre-release']
          ].map(([value, label]) => `<button type="button" class="${state.coreReleaseFilter === value ? 'active' : ''}" data-core-filter="${value}">${label}</button>`).join('')}
        </div>
        <div class="core-dialog-list">
          ${visibleReleases.map((release) => `<button type="button" class="core-dialog-release ${state.selectedCoreVersion === release.tag ? 'active' : ''} ${release.prerelease ? 'is-pre' : ''}" data-core-version="${escapeHtml(release.tag)}" ${release.assetUrl ? '' : 'disabled'}>
            <div>
              <strong>${escapeHtml(release.tag)}</strong>
              <span>${escapeHtml(release.name || release.tag)} · ${releaseDate(release)}</span>
            </div>
            ${release.assetUrl ? '' : '<em class="core-release-missing">нет сборки</em>'}
          </button>`).join('') || '<p class="muted">Для выбранного фильтра релизов нет.</p>'}
          ${releases.length > visibleReleases.length ? `<p class="muted core-release-limit">Показаны последние ${visibleReleases.length} из ${releases.length} релизов в выбранном фильтре.</p>` : ''}
        </div>
        <div class="modal-actions">
          <div class="core-install-options">
            <p class="muted">Pre-release версии могут быть нестабильными. После установки RuOpenRay перезапустит Xray.</p>
            <label class="toggle-row">
              <input id="coreBackup" type="checkbox" ${state.coreBackup ? 'checked' : ''} />
              <span>Сохранить резервную копию текущего бинарника Xray перед заменой</span>
            </label>
            <small class="muted">Резервная копия занимает место примерно как сам бинарник Xray. На маленьком NAND лучше включать только перед рискованной установкой.</small>
          </div>
          <button class="btn warning ${state.coreUpdating ? 'is-busy' : ''}" type="button" data-action="updateCore" ${state.coreUpdating || !canInstallSelected ? 'disabled' : ''}>${state.coreUpdating ? 'Устанавливаю...' : selectedInstalled ? 'Установлено' : 'Установить'}</button>
        </div>
        ${state.coreUpdate ? `<div class="core-result">
          <strong>${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.packageManager || 'пакетный менеджер')}</strong>
          <span>${escapeHtml(state.coreUpdate.before || 'до: неизвестно')} → ${escapeHtml(state.coreUpdate.after || 'после: неизвестно')}</span>
          ${state.coreUpdate.stdout || state.coreUpdate.stderr ? `<pre>${escapeHtml(state.coreUpdate.stdout || state.coreUpdate.stderr).slice(0, 1600)}</pre>` : ''}
        </div>` : ''}
      </section>
    </div>
  `;
}


  return {
    normalizeCoreVersion,
    versionParts,
    compareCoreVersions,
    installedCoreVersion,
    releaseDate,
    filteredCoreReleases,
    coreUpdateInfo,
    coreReleaseBadge,
    appVersionPill,
    coreArchitectureText,
    githubInstallCommand,
    setupPage,
    setupWizardDialog,
    installWizardDialog,
    coreUpdateDialog,
  };
}
