import { isServiceOutbound } from './outbound-tags.js';

export function createSetupView({
  state,
  shellQuote,
  escapeHtml,
  byteSize,
  setupReadiness,
  loadSetupSnapshot,
  firewallReadyStatus,
  firewallPorts,
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

function setupFlowStep(id, title, detail, ok, actionLabel, attrs = '') {
  return `<article class="setup-flow-step ${ok ? 'ok' : ''}">
    <span>${ok ? '✓' : id}</span>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
    ${actionLabel ? `<button class="btn secondary" type="button" ${attrs}>${escapeHtml(actionLabel)}</button>` : ''}
  </article>`;
}

function setupFlowGuide(readiness) {
  const xrayReady = state.status?.core?.available;
  const dnsReady = Boolean(state.lanDnsStatus?.ok && state.lanDnsStatus?.mode === 'xray' && state.lanDnsStatus?.readiness?.ready);
  const fwReady = firewallReadyStatus(state.firewallStatus || {});
  const transparentReady = Boolean(readiness.items.find((item) => item.key === 'transparent')?.ok);
  const interceptReady = Boolean(fwReady && transparentReady);
  const statsReady = Boolean(state.status?.xrayStats?.enabled);
  return `
    <section class="setup-flow-guide">
      <div>
        <h3>Порядок настройки</h3>
        <p>Этот мастер собирает самостоятельный режим RuOpenRay: ядро, DNS, перехват и проверку трафика. Если что-то пойдет не так, ниже есть откат снимка.</p>
      </div>
      <div class="setup-flow-grid">
        ${setupFlowStep('1', 'Установить основу', xrayReady ? 'Xray найден. Можно продолжать.' : 'Поставьте Xray и зависимости OpenWrt 24/25.', xrayReady, 'Открыть установку', 'data-action="openInstallWizard"')}
        ${setupFlowStep('2', 'Настроить DNS', dnsReady ? 'dnsmasq → Xray DNS.' : 'Подготовьте DNS inbound и направьте LAN DNS в 127.0.0.1#10535 или внешний Pi-hole.', dnsReady, 'DNS', 'data-tab-jump="dns"')}
        ${setupFlowStep('3', 'Включить перехват', interceptReady ? 'transparent inbound, nftables и policy routing активны.' : transparentReady ? 'Выберите TPROXY/REDIRECT, устройства и порты, затем примените firewall.' : 'Сначала подготовьте transparent inbound, иначе LAN-трафик не попадет в Xray.', interceptReady, 'Перехват', 'data-tab-jump="routing" data-routing-view-jump="intercept"')}
        ${setupFlowStep('4', 'Проверить трафик', statsReady ? 'Статистика Xray включена.' : 'Включите статистику Xray и проверьте рост счетчиков с LAN-устройства.', statsReady, 'Диагностика', 'data-tab-jump="diagnostics" data-diagnostics-jump="chain"')}
      </div>
      ${!readiness.canApply ? '<p class="settings-warning compact"><strong>Перед включением</strong><span>Закройте красные пункты готовности выше: мастер не применяет рискованную схему вслепую.</span></p>' : ''}
    </section>
  `;
}

function setupWizardSteps(readiness) {
  const xrayReady = Boolean(state.status?.core?.available);
  const geoReady = Boolean(state.geoStatus?.geoip?.exists && state.geoStatus?.geosite?.exists);
  const proxyReady = proxyOutboundsSafe().length > 0;
  const dnsReady = Boolean(state.lanDnsStatus?.mode === 'xray' && state.lanDnsStatus?.readiness?.ready);
  const fwReady = firewallReadyStatus(state.firewallStatus || {});
  const transparentReady = Boolean(readiness.items.find((item) => item.key === 'transparent')?.ok);
  const statsReady = Boolean(state.status?.xrayStats?.enabled);
  return [
    { id: 'environment', title: 'Проверка', ok: xrayReady && geoReady },
    { id: 'mode', title: 'Режим', ok: true },
    { id: 'dns', title: 'DNS', ok: dnsReady || state.setupLanDnsMode === 'keep' || state.setupLanDnsMode === 'upstream' },
    { id: 'server', title: 'Сервер', ok: proxyReady },
    { id: 'routing', title: 'Правила', ok: true },
    { id: 'firewall', title: 'Перехват', ok: fwReady && transparentReady },
    { id: 'verify', title: 'Проверка', ok: statsReady || Boolean(state.setupResult?.ok) }
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
  return `<nav class="setup-stepper" aria-label="Шаги мастера">
    ${steps.map((step, index) => `<button type="button" class="${index === activeIndex ? 'active' : ''} ${step.ok ? 'ok' : ''}" data-setup-step="${escapeHtml(step.id)}">
      <span>${step.ok ? '✓' : index + 1}</span>
      <strong>${escapeHtml(step.title)}</strong>
    </button>`).join('')}
  </nav>`;
}

function setupWizardSummary(steps) {
  const activeIndex = setupStepIndex(steps);
  const current = steps[activeIndex] || steps[0];
  const done = steps.filter((step) => step.ok).length;
  const left = Math.max(0, steps.length - done);
  return `<section class="setup-step-summary">
    <div>
      <span>Шаг ${activeIndex + 1} из ${steps.length}</span>
      <strong>${escapeHtml(current?.title || 'Проверка')}</strong>
    </div>
    <p>${left ? `Готово ${done} из ${steps.length}. Осталось закрыть ${left} ${left === 1 ? 'пункт' : left < 5 ? 'пункта' : 'пунктов'} перед уверенным применением.` : 'Все ключевые пункты готовы, можно запускать финальную проверку.'}</p>
  </section>`;
}

function setupStepNotice() {
  const notice = state.setupStepNotice;
  if (!notice || notice.step !== state.setupStep) return '';
  return `<section class="setup-step-notice ${escapeHtml(notice.level || 'warn')}" role="status">
    <strong>${escapeHtml(notice.title || 'Проверьте шаг')}</strong>
    <span>${escapeHtml(notice.detail || '')}</span>
  </section>`;
}

function setupWizardStepBody(readiness, diskFree, snapshot, result, rollback) {
  const step = state.setupStep || 'environment';
  const proxyCount = proxyOutboundsSafe().length;
  const fwMode = state.firewallRouterMode || state.firewallStatus?.routerMode || 'off';
  if (step === 'environment') {
    return `<section class="setup-step-panel">
      <h3>Проверка роутера</h3>
      <p>Сначала мастер смотрит основу: Xray, geo-файлы, серверы, transparent inbound, firewall и LAN DNS. Красные пункты лучше закрыть до применения.</p>
      <div class="setup-readiness">
        ${readiness.items.map((item) => `<article class="${item.ok ? 'ok' : item.warn ? 'warn' : 'bad'}">
          <span>${item.ok ? '✓' : item.warn ? '!' : '×'}</span>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.detail)}</small>
          </div>
        </article>`).join('')}
      </div>
      <div class="setup-choice-grid compact">
        <article><span>Свободно</span><strong>${escapeHtml(byteSize(diskFree))}</strong><small>Если места мало, используйте компактные geo и обновляйте без бэкапа.</small></article>
        <article><span>Серверы</span><strong>${proxyCount}</strong><small>Нужен хотя бы один proxy-сервер или подписка.</small></article>
        <article><span>Firewall</span><strong>${escapeHtml(String(fwMode).toUpperCase())}</strong><small>Фактический режим сверяется перед финальным применением.</small></article>
      </div>
    </section>`;
  }
  if (step === 'mode') {
    return `<section class="setup-step-panel">
      <h3>Режим работы</h3>
      <p>Выберите, как RuOpenRay должен работать после мастера. Сейчас мастер готовит самостоятельный режим: DNS, transparent inbound, правила обхода локальной сети и firewall-перехват.</p>
      <div class="setup-mode-grid">
        <article class="active">
          <strong>LAN через Xray</strong>
          <span>Устройства из LAN попадают в Xray, а маршрутизация решает: proxy, direct или block.</span>
        </article>
        <article>
          <strong>Выбранные клиенты</strong>
          <span>Настраивается в разделе перехвата: можно ограничить схему конкретными IP/MAC.</span>
          <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Открыть перехват</button>
        </article>
        <article>
          <strong>Защита от утечек</strong>
          <span>Для доменов/IP, которые нельзя выпускать наружу без Xray.</span>
          <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="leaks">Открыть защиту</button>
        </article>
      </div>
    </section>`;
  }
  if (step === 'dns') {
    return `<section class="setup-step-panel">
      <h3>DNS для LAN</h3>
      <p>Можно оставить текущий DNS, направить dnsmasq в Xray DNS или использовать внешний DNS/Pi-hole. Для режима через Xray мастер проверит, что DNS inbound действительно поднялся.</p>
      ${setupLanDnsBlock()}
    </section>`;
  }
  if (step === 'server') {
    return `<section class="setup-step-panel">
      <h3>Proxy-сервер</h3>
      <p>Добавьте сервер или подписку, затем проверьте доступность. Мастер не продолжит безопасно, если в конфигурации нет ни одного proxy-направления.</p>
      <div class="setup-choice-grid compact">
        <article><span>Найдено proxy</span><strong>${proxyCount}</strong><small>${proxyCount ? 'Можно продолжать.' : 'Добавьте VLESS/VMess/Trojan/SS ссылку или подписку.'}</small></article>
        <article><span>Активный сервер</span><strong>${escapeHtml(activeProxyName())}</strong><small>Основные proxy-правила будут вести сюда, если не выбран балансировщик.</small></article>
        <article><span>Проверка</span><strong>${escapeHtml(lastServerCheckText())}</strong><small>TCP/HTTP проверку можно запустить в разделе proxy.</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn" type="button" data-tab-jump="servers">Открыть proxy</button>
        <button class="btn secondary" type="button" data-import-dialog="server">Добавить сервер</button>
      </div>
    </section>`;
  }
  if (step === 'routing') {
    return `<section class="setup-step-panel">
      <h3>Маршрутизация</h3>
      <p>Добавьте подборки или свои правила до финального применения. Мастер подготовит служебные правила выше пользовательских: локальные сети напрямую, DNS в dns-out, bootstrap-домены серверов напрямую.</p>
      <div class="setup-choice-grid compact">
        <article><span>Правила</span><strong>${escapeHtml(String((state.config?.routing?.rules || []).length || 0))}</strong><small>Порядок важен: выше = раньше.</small></article>
        <article><span>Geo Doctor</span><strong>${escapeHtml(geoDoctorText())}</strong><small>Geo-ссылки проверяются вместе с конфигурацией.</small></article>
        <article><span>Черновик</span><strong>${state.serverDraftExists ? 'есть' : 'нет'}</strong><small>Перед применением мастер еще раз проверит Xray.</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn" type="button" data-tab-jump="routing" data-routing-view-jump="rules">Открыть правила</button>
        <button class="btn secondary" type="button" data-action="setupPrepareDraft">Подготовить служебные правила</button>
      </div>
    </section>`;
  }
  if (step === 'firewall') {
    return `<section class="setup-step-panel">
      <h3>Перехват трафика</h3>
      <p>Firewall-часть решает, какой LAN-трафик попадет в Xray. Перед применением смотрите preview правил nftables, особенно если ограничиваете клиентов или выбираете все порты.</p>
      <div class="setup-choice-grid compact">
        <article><span>Политика</span><strong>${escapeHtml(String(state.firewallBypassMode || 'off').toUpperCase())}</strong><small>OFF/BYPASS/REDIRECT определяет раннее отсечение трафика.</small></article>
        <article><span>Режим</span><strong>${escapeHtml(String(fwMode).toUpperCase())}</strong><small>TPROXY нужен для TCP/UDP, REDIRECT проще, но TCP-only.</small></article>
        <article><span>Порты</span><strong>${state.firewallPortMode === 'all' ? 'Все' : escapeHtml(firewallPorts().join(', ') || '80, 443')}</strong><small>${state.firewallBlockQuic ? 'QUIC будет блокироваться.' : 'QUIC не блокируется.'}</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Открыть перехват</button>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="leaks">Защита от утечек</button>
      </div>
    </section>`;
  }
  return `<section class="setup-step-panel">
    <h3>Финальная проверка и применение</h3>
    <p>На этом шаге мастер сохранит снимок для отката, подготовит конфигурацию, проверит Xray вместе с Geo Doctor, применит config.json, DNS и firewall.</p>
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
      <label>DNS / Pi-hole</label>
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
  return `
    <section class="setup-page panel">
      <div class="setup-page-head">
        <div>
          <h2>Мастер настройки RuOpenRay</h2>
          <p>Пошаговая настройка самостоятельного режима: проверка роутера, DNS, proxy, правила, перехват и финальная проверка.</p>
        </div>
        <div class="split-actions">
          <button class="btn secondary" type="button" data-action="openInstallWizard">Установка Xray</button>
          <button class="btn secondary" type="button" data-tab-jump="dashboard">На панель</button>
        </div>
      </div>

      ${setupWizardStepper(steps)}
      ${setupWizardSummary(steps)}
      ${setupStepNotice()}
      ${setupWizardStepBody(readiness, diskFree, snapshot, result, rollback)}

      <div class="setup-actions setup-step-actions">
        <button class="btn secondary" type="button" data-action="setupStepBack" ${activeIndex <= 0 || state.setupApplying ? 'disabled' : ''}>Назад</button>
        <button class="btn secondary" type="button" data-tab-jump="dashboard">На панель</button>
        <button class="btn" type="button" data-action="setupPrepareDraft" ${state.setupApplying ? 'disabled' : ''}>Подготовить черновик</button>
        ${isLast
          ? `<button class="btn warning" type="button" data-action="runSetupWizard" ${state.setupApplying || !readiness.canApply ? 'disabled' : ''}>${state.setupApplying ? 'Применяю...' : 'Проверить и применить'}</button>`
          : `<button class="btn warning" type="button" data-action="setupStepNext" ${state.setupApplying ? 'disabled' : ''}>Проверить шаг</button>`}
      </div>
    </section>
  `;
}

function setupWizardDialog() {
  if (!state.setupWizardOpen) return '';
  const readiness = setupReadiness();
  const result = state.setupResult;
  const rollback = state.setupRollbackResult;
  const snapshot = loadSetupSnapshot();
  const installPlan = state.installPlan;
  const diskFree = state.geoStatus?.disk?.free || state.status?.system?.disk?.free || installPlan?.disk?.free;
  const steps = setupWizardSteps(readiness);
  const activeIndex = setupStepIndex(steps);
  const isLast = activeIndex >= steps.length - 1;
  return `
    <div class="modal-backdrop" data-action="closeSetupWizard">
      <section class="modal setup-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="setupWizardTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="setupWizardTitle">Мастер настройки RuOpenRay</h2>
            <p>Пройдите шаги по порядку: проверка роутера, режим, DNS, сервер, правила, перехват и финальная проверка.</p>
          </div>
          <button class="icon-btn" type="button" data-action="closeSetupWizard" aria-label="Закрыть">×</button>
        </div>

        ${setupWizardStepper(steps)}
        ${setupWizardSummary(steps)}
        ${setupWizardStepBody(readiness, diskFree, snapshot, result, rollback)}

        <div class="setup-actions setup-step-actions">
          <button class="btn secondary" type="button" data-action="setupStepBack" ${activeIndex <= 0 || state.setupApplying ? 'disabled' : ''}>Назад</button>
          <button class="btn secondary" type="button" data-action="closeSetupWizard">Закрыть</button>
          <button class="btn" type="button" data-action="setupPrepareDraft" ${state.setupApplying ? 'disabled' : ''}>Подготовить черновик</button>
          ${isLast
            ? `<button class="btn warning" type="button" data-action="runSetupWizard" ${state.setupApplying || !readiness.canApply ? 'disabled' : ''}>${state.setupApplying ? 'Применяю...' : 'Проверить и применить'}</button>`
            : `<button class="btn warning" type="button" data-action="setupStepNext" ${state.setupApplying ? 'disabled' : ''}>Проверить шаг</button>`}
        </div>
      </section>
    </div>
  `;
  return `
    <div class="modal-backdrop" data-action="closeSetupWizard">
      <section class="modal setup-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="setupWizardTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="setupWizardTitle">Мастер активации RuOpenRay</h2>
            <p>Проверяет основу и включает самостоятельный режим: Xray, geo, transparent inbound, nftables и DNS для LAN.</p>
          </div>
          <button class="icon-btn" type="button" data-action="closeSetupWizard" aria-label="Закрыть">×</button>
        </div>

        <div class="setup-readiness">
          ${readiness.items.map((item) => `<article class="${item.ok ? 'ok' : item.warn ? 'warn' : 'bad'}">
            <span>${item.ok ? '✓' : item.warn ? '!' : '×'}</span>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.detail)}</small>
            </div>
          </article>`).join('')}
        </div>

        ${setupFlowGuide(readiness)}

        <div class="setup-choice-grid">
          <article>
            <span>Свободное место</span>
            <strong>${escapeHtml(byteSize(diskFree))}</strong>
            <small>${diskFree && diskFree < 16 * 1024 * 1024 ? 'Свободное место ограничено: используйте компактные geo и отключайте бэкап только осознанно.' : 'Для слабых роутеров лучше оставить запас под временные файлы.'}</small>
          </article>
          <article>
            <span>Режим защиты</span>
            <strong>${escapeHtml(state.firewallRouterMode.toUpperCase())}</strong>
            <small>${state.firewallRouterMode === 'redirect' ? 'TCP-only режим, проще, но без UDP.' : 'TPROXY для TCP/UDP transparent proxy.'}</small>
          </article>
          <article>
            <span>Порты</span>
            <strong>${state.firewallPortMode === 'all' ? 'Все' : escapeHtml(firewallPorts().join(', ') || '80, 443')}</strong>
            <small>${state.firewallBlockQuic ? 'UDP/443 будет заблокирован.' : 'QUIC не блокируется.'}</small>
          </article>
        </div>

        <section class="setup-lan-dns">
          <div>
            <h3>LAN DNS / dnsmasq</h3>
            <p>Можно оставить OpenWrt DNS как есть, направить устройства в Xray DNS или указать внешний DNS/Pi-hole.</p>
          </div>
          <div class="segmented setup-dns-modes">
            ${[
              ['keep', 'Не трогать'],
              ['xray', 'Через Xray'],
              ['upstream', 'Внешний DNS']
            ].map(([mode, label]) => `<button type="button" class="${state.setupLanDnsMode === mode ? 'active' : ''}" data-setup-dns-mode="${mode}">${label}</button>`).join('')}
          </div>
          ${state.setupLanDnsMode === 'upstream' ? `<div class="form-row">
            <label>DNS / Pi-hole</label>
            <input id="setupLanDnsUpstream" value="${escapeHtml(state.setupLanDnsUpstream)}" placeholder="192.168.1.10 или 192.168.1.10:53" />
          </div>` : ''}
          <label class="toggle-row">
            <input id="setupRestartDnsmasq" type="checkbox" ${state.setupRestartDnsmasq ? 'checked' : ''} />
            <span>Перезапустить dnsmasq после изменения</span>
          </label>
        </section>

        <section class="setup-snapshot">
          <div>
            <h3>Откат мастера</h3>
            <p>${snapshot?.createdAt ? `Есть снимок от ${escapeHtml(new Date(snapshot.createdAt).toLocaleString('ru-RU'))}: конфигурация Xray, LAN DNS и nftables.` : 'Перед включением активного режима мастер сохранит снимок текущего состояния.'}</p>
          </div>
          <div class="split-actions">
            <button class="btn secondary" type="button" data-action="rollbackSetupWizard" ${snapshot && !state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>${state.setupRollbacking ? 'Откатываю...' : 'Откатить изменения мастера'}</button>
            <button class="btn secondary" type="button" data-action="clearSetupSnapshot" ${snapshot && !state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>Забыть снимок</button>
          </div>
        </section>

        ${result ? `<div class="setup-result ${result.ok ? 'ok' : 'bad'}">
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
        </div>` : ''}

        <div class="setup-actions">
          <button class="btn secondary" type="button" data-action="openInstallWizard">Установка Xray</button>
          <button class="btn secondary" type="button" data-tab-jump="geo">Geo-файлы</button>
          <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="leaks">Защита от утечек</button>
          <button class="btn" type="button" data-action="setupPrepareDraft" ${state.setupApplying ? 'disabled' : ''}>Подготовить черновик</button>
          <button class="btn warning" type="button" data-action="runSetupWizard" ${state.setupApplying || !readiness.canApply ? 'disabled' : ''}>${state.setupApplying ? 'Включаю...' : 'Включить активный режим'}</button>
        </div>
      </section>
    </div>
  `;
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
            <span>${escapeHtml(storage.recommendedMode || 'Без лишних бэкапов, компактные geo и контроль свободного места.')}</span>
          </div>
          <div class="nand-plan-grid">
            <article><span>Панель</span><strong>${escapeHtml(byteSize(storage.panelSize))}</strong></article>
            <article><span>Xray</span><strong>${escapeHtml(byteSize(storage.xraySize || 30 * 1024 * 1024))}</strong></article>
            <article><span>Geo сейчас</span><strong>${escapeHtml(byteSize(storage.geoCurrent))}</strong></article>
            <article><span>Бэкапы</span><strong>${escapeHtml(byteSize(storage.backupCurrent))}</strong></article>
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
              <span>Сохранить бэкап текущего бинарника Xray перед заменой</span>
            </label>
            <small class="muted">Бэкап занимает место примерно как сам бинарник Xray. На маленьком NAND лучше включать только перед рискованной установкой.</small>
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
    setupFlowStep,
    setupFlowGuide,
    setupPage,
    setupWizardDialog,
    installWizardDialog,
    coreUpdateDialog,
  };
}
