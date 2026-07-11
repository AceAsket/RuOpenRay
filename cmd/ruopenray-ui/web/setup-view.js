import { isServiceOutbound } from './outbound-tags.js';
import { routePresetIconView } from './route-visuals.js';

export function createSetupView({
  state,
  shellQuote,
  escapeHtml,
  byteSize,
  setupReadiness,
  loadSetupSnapshot,
  firewallReadyStatus,
  firewallPorts,
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
      return `<button type="button" class="${stateClass}" data-setup-step="${escapeHtml(step.id)}" ${index === activeIndex ? 'aria-current="step"' : ''}>
        <span>${step.ok ? '✓' : index + 1}</span>
        <strong>${escapeHtml(step.title)}</strong>
        <small>${escapeHtml(step.detail || '')}</small>
      </button>`;
    }).join('')}
  </nav>`;
}

function setupWizardSummary(steps) {
  const activeIndex = setupStepIndex(steps);
  const current = steps[activeIndex] || steps[0];
  const done = steps.filter((step) => step.ok).length;
  const left = Math.max(0, steps.length - done);
  const progress = Math.round((done / Math.max(1, steps.length)) * 100);
  return `<section class="setup-step-summary">
    <div class="setup-step-summary-head">
      <div>
      <span>${current?.ok ? 'Шаг готов' : 'Проверьте шаг'}</span>
      <strong>${escapeHtml(current?.title || 'Проверка')}</strong>
      </div>
      <em>${done}/${steps.length}</em>
    </div>
    <div class="setup-progress" role="progressbar" aria-label="Готовность настройки" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><span style="width: ${progress}%"></span></div>
    <p>Шаг ${activeIndex + 1} из ${steps.length}. ${left ? `Готово ${done} из ${steps.length}.` : 'Настройка завершена.'}</p>
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
  return {
    count: items.length,
    name: current?.name || config.name || (config.exists ? state.amneziaProfileName || 'AmneziaWG' : ''),
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
      <input id="setupScenarioSearch" value="${escapeHtml(state.setupScenarioSearch || '')}" placeholder="Найти сценарий" />
      <select id="setupScenarioTarget" aria-label="Назначение выбранных сценариев">
        ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === targetValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </div>
    <div class="setup-scenario-list">${rows || '<div class="empty-state">Сценарии пока не загружены. Обновите подключенный источник.</div>'}</div>
    <div class="setup-scenario-footer">
      <span>Выбрано: <strong data-setup-scenario-selected>${selected.size}</strong></span>
      <button class="btn warning" type="button" data-action="applySetupRoutePresets" ${selected.size ? '' : 'disabled'}>Добавить выбранные</button>
    </div>
  </section>`;
}

function setupWizardStepBody(readiness, diskFree, snapshot, result, rollback) {
  const step = ['connection', 'traffic', 'verify'].includes(state.setupStep) ? state.setupStep : 'connection';
  const proxyCount = proxyOutboundsSafe().length;
  const coreReady = Boolean(state.status?.core?.available);
  const fwMode = state.firewallRouterMode || state.firewallStatus?.routerMode || 'off';
  const awg = amneziaConnection();
  if (step === 'connection') {
    return `<section class="setup-step-panel">
      <h3>Подключения</h3>
      <p>Добавьте основное подключение Xray. AmneziaWG можно подключить дополнительно и выбирать его в правилах маршрутизации.</p>
      <div class="setup-choice-grid compact">
        <article class="${coreReady ? 'ok' : 'warn'}"><span>Xray</span><strong>${coreReady ? 'установлен' : 'не найден'}</strong><small>${coreReady ? 'Ядро готово к настройке.' : 'Установите Xray перед продолжением.'}</small></article>
        <article class="${proxyCount ? 'ok' : 'warn'}"><span>Основное подключение</span><strong>${proxyCount ? escapeHtml(activeProxyName()) : 'не добавлено'}</strong><small>${proxyCount ? `${proxyCount} серверов доступно` : 'Добавьте сервер или подписку Xray.'}</small></article>
        <article class="${awg.ready ? 'ok' : ''}"><span>AmneziaWG · необязательно</span><strong>${escapeHtml(awg.name || 'не настроен')}</strong><small>${awg.ready ? `${awg.count ? `${awg.count} проф.` : 'client.conf сохранен'} · ${awg.running ? 'туннель работает' : 'профиль готов'}` : 'Можно добавить сейчас или позже.'}</small></article>
      </div>
      <div class="setup-inline-actions">
        ${coreReady ? '' : '<button class="btn warning" type="button" data-action="openInstallWizard">Установить Xray</button>'}
        <button class="btn warning" type="button" data-import-dialog="server">Добавить Xray</button>
        <button class="btn secondary" type="button" data-action="openAmneziaImportDialog">Импорт AWG</button>
        <button class="btn secondary" type="button" data-tab-jump="servers">Все серверы</button>
        <button class="btn secondary" type="button" data-tab-jump="amnezia">Все AWG-профили</button>
      </div>
    </section>`;
  }
  if (step === 'traffic') {
    const selectedDevices = Array.isArray(state.firewallSelectedDevices) ? state.firewallSelectedDevices.length : 0;
    const devicesText = state.firewallDeviceMode === 'selected' ? `${selectedDevices} выбрано` : 'вся локальная сеть';
    const rulesCount = Array.isArray(state.config?.routing?.rules) ? state.config.routing.rules.length : 0;
    return `<section class="setup-step-panel">
      <h3>Куда направлять трафик</h3>
      <p>Выберите устройства и правила. Для каждого правила доступны Xray-сервер, группа, AWG-профиль, прямое подключение или блокировка.</p>
      ${setupScenariosBlock()}
      <div class="setup-choice-grid compact">
        <article><span>Устройства</span><strong>${escapeHtml(devicesText)}</strong><small>Можно ограничить работу конкретными устройствами.</small></article>
        <article><span>Правила</span><strong>${rulesCount}</strong><small>Сценарии и свои домены сохранят выбранные назначения.</small></article>
        <article><span>Остальной трафик</span><strong>${escapeHtml(activeProxyName())}</strong><small>Локальные адреса останутся доступными напрямую.</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="rules">Настроить правила</button>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Выбрать устройства</button>
      </div>
    </section>`;
  }
  const dnsMode = state.setupLanDnsMode === 'keep' ? 'без изменений' : state.setupLanDnsMode === 'upstream' ? 'внешний DNS' : 'через Xray';
  const deviceMode = state.firewallDeviceMode === 'selected' ? 'выбранные устройства' : 'вся локальная сеть';
  return `<section class="setup-step-panel">
    <h3>Проверка перед включением</h3>
    <p>RuOpenRay сохранит текущее состояние для отката, проверит конфигурацию и только затем включит маршрутизацию.</p>
    <div class="setup-review-list">
      <article><span>Основное подключение</span><strong>${escapeHtml(activeProxyName())}</strong></article>
      ${awg.ready ? `<article><span>AmneziaWG</span><strong>${escapeHtml(awg.name)} · ${awg.running ? 'работает' : 'готов как назначение'}</strong></article>` : ''}
      <article><span>Устройства</span><strong>${escapeHtml(deviceMode)}</strong></article>
      <article><span>Остальной трафик</span><strong>через ${escapeHtml(activeProxyName())}</strong></article>
      <article><span>DNS</span><strong>${escapeHtml(dnsMode)}</strong></article>
    </div>
    <button class="btn secondary setup-advanced-toggle" type="button" data-action="toggleSetupAdvanced" aria-expanded="${state.setupAdvancedOpen ? 'true' : 'false'}">${state.setupAdvancedOpen ? 'Скрыть расширенные настройки' : 'Расширенные настройки'}</button>
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
  return `<section class="setup-snapshot in-step">
    <div>
      <h3>Откат мастера</h3>
      <p>${snapshot?.createdAt ? `Есть снимок от ${escapeHtml(new Date(snapshot.createdAt).toLocaleString('ru-RU'))}: конфигурация Xray, LAN DNS и nftables.` : 'Перед включением активного режима мастер сохранит снимок текущего состояния.'}</p>
    </div>
    <div class="split-actions">
      <button class="btn secondary" type="button" data-action="rollbackSetupWizard" ${snapshot && !state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>${state.setupRollbacking ? 'Откатываю...' : 'Откатить изменения'}</button>
      <button class="btn secondary" type="button" data-action="clearSetupSnapshot" ${snapshot && !state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>Забыть снимок</button>
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
  const outbounds = proxyOutboundsSafe();
  const routingRules = state.config?.routing?.rules || [];
  const firstProxy = routingRules.find((rule) => rule?.outboundTag && outbounds.some((outbound) => outbound.tag === rule.outboundTag));
  return firstProxy?.outboundTag || outbounds[0]?.tag || 'не выбран';
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
      <div class="setup-page-head">
        <div>
          <h2>Быстрая настройка RuOpenRay</h2>
          <p>Добавьте подключения, выберите трафик и проверьте итог перед включением.</p>
        </div>
      </div>

      <div class="setup-guided-layout">
        <aside class="setup-guide-rail">
          <div class="setup-rail-title">
            <strong>Три шага</strong>
            <span>Вернуться к предыдущему шагу можно без потери настроек.</span>
          </div>
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
