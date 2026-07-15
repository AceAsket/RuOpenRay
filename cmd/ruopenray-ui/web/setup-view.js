import { isServiceOutbound } from './outbound-tags.js';

export const setupWizardStepIds = Object.freeze(['connection', 'scenarios', 'launch']);

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

function parsedCoreVersion(version = '') {
  const normalized = normalizeCoreVersion(version);
  if (!normalized) return null;
  const [withoutBuild] = normalized.split('+', 1);
  const dash = withoutBuild.indexOf('-');
  const main = dash >= 0 ? withoutBuild.slice(0, dash) : withoutBuild;
  const prerelease = dash >= 0 ? withoutBuild.slice(dash + 1).split('.').filter(Boolean) : [];
  const numbers = main.split('.').map((part) => Number.parseInt(part, 10));
  if (numbers.some((part) => !Number.isFinite(part))) return null;
  return { normalized, numbers, prerelease };
}

function versionParts(version = '') {
  return parsedCoreVersion(version)?.numbers || [];
}

function comparePrereleaseParts(left = [], right = []) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left[i]);
    const rightNumeric = /^\d+$/.test(right[i]);
    if (leftNumeric && rightNumeric) {
      const diff = Number(left[i]) - Number(right[i]);
      if (diff) return diff;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    const diff = left[i].localeCompare(right[i], undefined, { sensitivity: 'base' });
    if (diff) return diff;
  }
  return 0;
}

function compareCoreVersions(a = '', b = '') {
  const left = parsedCoreVersion(a);
  const right = parsedCoreVersion(b);
  if (!left || !right) return left ? 1 : right ? -1 : 0;
  const size = Math.max(left.numbers.length, right.numbers.length);
  for (let i = 0; i < size; i += 1) {
    const diff = (left.numbers[i] || 0) - (right.numbers[i] || 0);
    if (diff) return diff;
  }
  return comparePrereleaseParts(left.prerelease, right.prerelease);
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
  const sorted = [...installable].sort((left, right) => compareCoreVersions(right.tag, left.tag));
  const latestStable = sorted.find((release) => !release.prerelease && !(parsedCoreVersion(release.tag)?.prerelease.length));
  const latestAny = sorted[0];
  const installedVersion = parsedCoreVersion(installed);
  const installedPrereleaseChannel = installedVersion?.prerelease[0]?.toLowerCase() || '';
  const channelReleases = installedPrereleaseChannel
    ? sorted.filter((release) => {
        const candidate = parsedCoreVersion(release.tag);
        if (!candidate) return false;
        if (!candidate.prerelease.length) return true;
        return candidate.prerelease[0]?.toLowerCase() === installedPrereleaseChannel;
      })
    : sorted.filter((release) => !release.prerelease && !(parsedCoreVersion(release.tag)?.prerelease.length));
  const target = channelReleases[0] || (installedPrereleaseChannel ? latestAny : latestStable);
  const current = installed ? `v${installed}` : '';
  const targetVersion = target?.tag || '';
  const hasUpdate = Boolean(targetVersion && (!installed || compareCoreVersions(targetVersion, installed) > 0));
  return {
    installed,
    current,
    target,
    latestStable,
    latestAny,
    channel: installedPrereleaseChannel || 'stable',
    hasUpdate,
  };
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
  const scenariosReady = state.setupFallbackMode === 'proxy' || readiness.proxyRuleCount > 0;
  return [
    { id: setupWizardStepIds[0], title: 'Подключение', detail: 'Сервер или подписка', ok: xrayReady && proxyReady },
    { id: setupWizardStepIds[1], title: 'Сценарии', detail: 'Что направлять', ok: proxyReady && scenariosReady },
    { id: setupWizardStepIds[2], title: 'Запуск', detail: 'Всё остальное — автоматически', ok: Boolean(state.setupResult?.ok) }
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
      return `<button type="button" class="${stateClass}" data-setup-step="${escapeHtml(step.id)}"${index === activeIndex ? ' aria-current="step"' : ''}>
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
      <span>${current?.ok ? 'Готово' : 'Осталось настроить'}</span>
      <strong>${escapeHtml(current?.title || 'Подключение')}</strong>
      </div>
      <em>${done}/${steps.length}</em>
    </div>
    <div class="setup-progress" aria-hidden="true"><span style="width: ${progress}%"></span></div>
    <p>Шаг ${activeIndex + 1} из ${steps.length}. ${left ? `Готово ${done} из ${steps.length}.` : 'Можно запускать RuOpenRay.'}</p>
  </section>`;
}

function setupStepPrimaryLabel(step, isLast) {
  if (state.setupApplying) return 'Запускаю RuOpenRay...';
  if (isLast || step === 'launch') return 'Запустить RuOpenRay';
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

function setupWizardStepBody(readiness, diskFree, snapshot, result, rollback) {
  const step = state.setupStep || 'connection';
  const proxyCount = proxyOutboundsSafe().length;
  const fwMode = state.firewallRouterMode || state.firewallStatus?.routerMode || 'off';
  if (step === 'connection') {
    const xrayReady = Boolean(state.status?.core?.available);
    const geoReady = Boolean(state.geoStatus?.geoip?.exists && state.geoStatus?.geosite?.exists);
    const subscriptionCount = Array.isArray(state.subscriptionPools) ? state.subscriptionPools.length : 0;
    return `<section class="setup-step-panel setup-simple-step">
      <div class="setup-simple-hero">
        <span class="setup-kicker">Шаг 1</span>
        <h3>Добавьте подключение</h3>
        <p>Подойдёт ссылка на один сервер или адрес подписки. RuOpenRay сам подготовит сетевые настройки роутера.</p>
      </div>
      ${xrayReady ? '' : `<section class="setup-callout warn">
        <div><strong>Сначала нужен Xray</strong><span>Мастер установит ядро и необходимые компоненты для OpenWrt.</span></div>
        <button class="btn warning" type="button" data-action="openInstallWizard">Установить Xray</button>
      </section>`}
      <div class="setup-connection-card ${proxyCount ? 'ready' : ''}">
        <div class="setup-connection-icon">${proxyCount ? '✓' : '+'}</div>
        <div>
          <span>${proxyCount ? 'Подключение найдено' : 'Подключения пока нет'}</span>
          <strong>${proxyCount ? 'Основное подключение' : 'Сервер или подписка'}</strong>
          <small>${proxyCount ? `${proxyCount} доступных выходов${subscriptionCount ? ` · ${subscriptionCount} подписок` : ''}` : 'Добавьте данные, которые выдал провайдер VPN или прокси.'}</small>
        </div>
      </div>
      <div class="setup-big-actions">
        <button class="setup-action-card primary" type="button" data-import-dialog="server">
          <span>＋</span><strong>Добавить сервер</strong><small>VLESS, VMess, Trojan или Shadowsocks</small>
        </button>
        <button class="setup-action-card" type="button" data-import-dialog="subscription">
          <span>↻</span><strong>Добавить подписку</strong><small>Ссылка со списком серверов и автообновлением</small>
        </button>
      </div>
      ${proxyCount ? `<button class="btn secondary setup-manage-link" type="button" data-tab-jump="servers">Проверить или сменить сервер</button>` : ''}
      <details class="setup-technical-details">
        <summary>Что мастер проверил автоматически</summary>
        <div class="setup-auto-checks">
          <span class="${xrayReady ? 'ok' : 'warn'}">${xrayReady ? '✓' : '!'} Xray</span>
          <span class="${geoReady ? 'ok' : 'warn'}">${geoReady ? '✓' : '!'} Каталог сайтов</span>
          <span class="ok">✓ Свободно ${escapeHtml(byteSize(diskFree))}</span>
        </div>
      </details>
    </section>`;
  }
  if (step === 'scenarios') {
    const userRuleCount = Number(readiness.proxyRuleCount || 0);
    const allTraffic = state.setupFallbackMode === 'proxy';
    return `<section class="setup-step-panel setup-simple-step">
      <div class="setup-simple-hero">
        <span class="setup-kicker">Шаг 2</span>
        <h3>Выберите, что направлять через подключение</h3>
        <p>Можно взять готовые сценарии для сервисов, добавить свои правила или направить через подключение весь интернет.</p>
      </div>
      <div class="setup-big-actions">
        <button class="setup-action-card primary" type="button" data-tab-jump="routing" data-routing-view-jump="scenarios">
          <span>▦</span><strong>Готовые сценарии</strong><small>YouTube, Discord, AI, игры и другие подборки</small>
        </button>
        <button class="setup-action-card" type="button" data-action="openRouteRuleDialog">
          <span>＋</span><strong>Добавить своё правило</strong><small>Сайт, IP, устройство, порт или протокол</small>
        </button>
      </div>
      <div class="setup-rule-summary ${userRuleCount ? 'ready' : ''}">
        <div><span>${userRuleCount ? 'Правила выбраны' : 'Правила ещё не выбраны'}</span><strong>${userRuleCount}</strong></div>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="rules">Посмотреть правила</button>
      </div>
      <fieldset class="setup-fallback-choice">
        <legend>Остальной интернет</legend>
        <button type="button" class="${allTraffic ? '' : 'active'}" data-setup-fallback="direct" aria-pressed="${allTraffic ? 'false' : 'true'}">
          <span class="setup-choice-mark">${allTraffic ? '' : '✓'}</span>
          <strong>Напрямую</strong>
          <small>Через подключение пойдут только выбранные сценарии и правила. Рекомендуется.</small>
        </button>
        <button type="button" class="${allTraffic ? 'active' : ''}" data-setup-fallback="proxy" aria-pressed="${allTraffic ? 'true' : 'false'}">
          <span class="setup-choice-mark">${allTraffic ? '✓' : ''}</span>
          <strong>Через подключение</strong>
          <small>Весь интернет устройств локальной сети пойдёт через выбранный сервер.</small>
        </button>
      </fieldset>
      <details class="setup-technical-details">
        <summary>Дополнительные параметры</summary>
        <div class="setup-advanced-summary">
          <span>DNS через Xray</span><span>${escapeHtml(String(fwMode).toUpperCase())} для LAN</span><span>Локальная сеть доступна напрямую</span>
          <button class="btn secondary compact" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Выбрать устройства</button>
        </div>
      </details>
    </section>`;
  }
  if (step === 'environment') {
    return `<section class="setup-step-panel">
      <h3>Проверка роутера</h3>
      <p>Сначала мастер проверяет, готов ли роутер: Xray, geo-файлы, свободное место, прокси-сервер, входящий поток перехвата, firewall и LAN DNS. Красные пункты лучше исправить до применения.</p>
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
        <article><span>Свободно</span><strong>${escapeHtml(byteSize(diskFree))}</strong><small>Если места мало, используйте компактные geo и обновляйте без резервной копии.</small></article>
        <article><span>Прокси</span><strong>${proxyCount}</strong><small>Нужен хотя бы один сервер или подписка.</small></article>
        <article><span>Firewall</span><strong>${escapeHtml(String(fwMode).toUpperCase())}</strong><small>Фактический режим сверяется перед финальным применением.</small></article>
      </div>
    </section>`;
  }
  if (step === 'configure') {
    const defaultRoute = readiness.items.find((item) => item.key === 'defaultRoute');
    const transparent = readiness.items.find((item) => item.key === 'transparent');
    const ruleCount = Number((state.config?.routing?.rules || []).length || 0);
    return `<section class="setup-step-panel">
      <div class="setup-section-head">
        <div>
          <h3>Настройка трафика</h3>
          <p>Соберите рабочую схему на одном экране: DNS, прокси, маршрутизация и перехват LAN. Подробные редакторы открываются отдельно и возвращают вас в этот шаг.</p>
        </div>
        <span class="status-chip ${proxyCount && defaultRoute?.ok && transparent?.ok ? 'ok' : 'warn'}">${proxyCount && defaultRoute?.ok && transparent?.ok ? 'основа готова' : 'нужно настроить'}</span>
      </div>
      <div class="setup-config-grid">
        <article class="setup-config-card">
          <div class="setup-config-card-head">
            <div><span>01</span><strong>DNS для LAN</strong></div>
            <small>${escapeHtml(state.setupLanDnsMode === 'xray' ? 'через Xray' : state.setupLanDnsMode === 'upstream' ? 'внешний DNS' : 'без изменений')}</small>
          </div>
          <p>Куда dnsmasq будет отправлять запросы устройств локальной сети.</p>
          ${setupLanDnsBlock()}
        </article>
        <article class="setup-config-card">
          <div class="setup-config-card-head">
            <div><span>02</span><strong>Сервер и правила</strong></div>
            <small>${proxyCount ? `${proxyCount} прокси` : 'нет прокси'}</small>
          </div>
          <p>Активный выход: <strong>${escapeHtml(activeProxyName())}</strong>. Правил маршрутизации: <strong>${ruleCount}</strong>.</p>
          <div class="setup-inline-actions">
            <button class="btn" type="button" data-tab-jump="servers">Серверы</button>
            <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="rules">Правила</button>
            <button class="btn secondary" type="button" data-import-dialog="server">Добавить сервер</button>
          </div>
        </article>
        <article class="setup-config-card ${defaultRoute?.ok ? 'ok' : 'warn'}">
          <div class="setup-config-card-head">
            <div><span>03</span><strong>Остальной трафик</strong></div>
            <small>${defaultRoute?.ok ? 'правило найдено' : 'нужно правило'}</small>
          </div>
          <p>${escapeHtml(defaultRoute?.detail || 'Мастер добавит финальное правило для LAN-трафика, который не совпал с правилами выше.')}</p>
          <div class="setup-inline-actions">
            <button class="btn" type="button" data-action="setupPrepareDraft">Подготовить черновик</button>
            <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="rules">Проверить порядок</button>
          </div>
        </article>
        <article class="setup-config-card ${transparent?.ok ? 'ok' : 'warn'}">
          <div class="setup-config-card-head">
            <div><span>04</span><strong>Перехват LAN</strong></div>
            <small>${escapeHtml(String(fwMode).toUpperCase())}</small>
          </div>
          <p>${escapeHtml(transparent?.detail || 'Мастер подготовит transparent inbound и firewall для выбранных LAN-клиентов.')}</p>
          <div class="setup-inline-actions">
            <button class="btn" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Перехват</button>
            <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="leaks">Защита от утечек</button>
          </div>
        </article>
      </div>
    </section>`;
  }
  if (step === 'mode') {
    return `<section class="setup-step-panel">
      <h3>Режим работы</h3>
      <p>Выберите, как RuOpenRay должен работать после мастера. Сейчас мастер готовит самостоятельный режим: DNS, входящий поток перехвата, правила обхода локальной сети и firewall-перехват.</p>
      <div class="setup-mode-grid">
        <article class="active">
          <strong>LAN через Xray</strong>
          <span>Устройства из LAN попадают в Xray, а правила решают: через прокси, напрямую или заблокировать.</span>
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
      <p>Можно оставить текущий DNS, направить dnsmasq в Xray DNS или использовать внешний DNS, Pi-hole либо AdGuard Home. Для режима через Xray мастер проверит, что DNS-вход Xray действительно слушает порт.</p>
      ${setupLanDnsBlock()}
    </section>`;
  }
  if (step === 'server') {
    return `<section class="setup-step-panel">
      <h3>Прокси-сервер</h3>
      <p>Добавьте сервер или подписку, затем проверьте доступность. Мастер не продолжит безопасно, если в конфигурации нет ни одного прокси-направления.</p>
      <div class="setup-choice-grid compact">
        <article><span>Прокси</span><strong>${proxyCount}</strong><small>${proxyCount ? 'Можно продолжать.' : 'Добавьте VLESS/VMess/Trojan/SS ссылку или подписку.'}</small></article>
        <article><span>Активный сервер</span><strong>${escapeHtml(activeProxyName())}</strong><small>Основные правила “через прокси” будут вести сюда, если не выбран балансировщик.</small></article>
        <article><span>Проверка</span><strong>${escapeHtml(lastServerCheckText())}</strong><small>TCP/HTTP проверку можно запустить в разделе “Серверы”.</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn" type="button" data-tab-jump="servers">Открыть серверы</button>
        <button class="btn secondary" type="button" data-import-dialog="server">Добавить сервер</button>
      </div>
    </section>`;
  }
  if (step === 'routing') {
    return `<section class="setup-step-panel">
      <h3>Маршрутизация</h3>
      <p>Добавьте подборки или свои правила до финального применения. Мастер подготовит служебные правила выше пользовательских: локальные сети напрямую, DNS в DNS-выход Xray, домены прокси-серверов напрямую.</p>
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
  if (step === 'fallback') {
    const defaultRoute = readiness.items.find((item) => item.key === 'defaultRoute');
    const target = defaultRoute?.ok ? defaultRoute.detail : 'Финальное правило еще не подготовлено.';
    return `<section class="setup-step-panel">
      <h3>Остальной трафик</h3>
      <p>Это финальное правило для LAN-трафика, который уже попал в <code>transparent_ipv4</code>, но не совпал ни с одним пользовательским правилом выше. Без явного правила Xray использует первый outbound в конфиге, и это сложно заметить при диагностике.</p>
      <div class="setup-choice-grid compact">
        <article class="${defaultRoute?.ok ? 'ok' : 'warn'}"><span>Финальное правило</span><strong>${defaultRoute?.ok ? 'найдено' : 'не найдено'}</strong><small>${escapeHtml(target)}</small></article>
        <article><span>Порядок</span><strong>последним</strong><small>Правила выше сохраняют приоритет: подборки, свои домены, direct/block и служебные исключения сработают раньше.</small></article>
        <article><span>Назначение</span><strong>${escapeHtml(activeProxyName())}</strong><small>Мастер направит остальной LAN-трафик в первый пользовательский proxy, если отдельный балансировщик не выбран вручную.</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn" type="button" data-action="setupPrepareDraft">Подготовить правило</button>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="rules">Открыть маршруты</button>
      </div>
    </section>`;
  }
  if (step === 'firewall') {
    return `<section class="setup-step-panel">
      <h3>Перехват трафика</h3>
      <p>Firewall-часть решает, какой LAN-трафик попадет в Xray. Перед применением смотрите preview правил nftables, особенно если ограничиваете клиентов или выбираете все порты.</p>
      <div class="setup-choice-grid compact">
        <article><span>Политика</span><strong>${escapeHtml(String(state.firewallBypassMode || 'off').toUpperCase())}</strong><small>Определяет, что отсекать до попадания трафика в Xray.</small></article>
        <article><span>Режим</span><strong>${escapeHtml(String(fwMode).toUpperCase())}</strong><small>TPROXY работает с TCP/UDP. REDIRECT проще, но только для TCP.</small></article>
        <article><span>Порты</span><strong>${state.firewallPortMode === 'all' ? 'Все' : escapeHtml(firewallPorts().join(', ') || '80, 443')}</strong><small>${state.firewallBlockQuic ? 'QUIC будет блокироваться.' : 'QUIC не блокируется.'}</small></article>
      </div>
      <div class="setup-inline-actions">
        <button class="btn" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Открыть перехват</button>
        <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="leaks">Защита от утечек</button>
      </div>
    </section>`;
  }
  const allTraffic = state.setupFallbackMode === 'proxy';
  const launchReady = readiness.canApply && (allTraffic || readiness.proxyRuleCount > 0);
  return `<section class="setup-step-panel setup-simple-step setup-launch-step ${result?.ok ? 'complete' : ''}">
    <div class="setup-simple-hero">
      <span class="setup-kicker">Шаг 3</span>
      <h3>${result?.ok ? 'RuOpenRay запущен' : launchReady ? 'Всё готово к запуску' : 'Осталось завершить настройку'}</h3>
      <p>${result?.ok ? 'Подключение работает, а настройки сохранены на роутере.' : launchReady ? 'Проверьте итог. После запуска мастер сам настроит Xray, DNS и перехват локальной сети.' : 'Вернитесь к предыдущим шагам: добавьте подключение и выберите сценарии либо весь интернет.'}</p>
    </div>
    <div class="setup-launch-summary">
      <article><span>Подключение</span><strong>${proxyCount ? 'Готово' : 'Не выбрано'}</strong><small>${proxyCount} доступных выходов</small></article>
      <article><span>Через подключение</span><strong>${allTraffic ? 'Весь интернет' : `${readiness.proxyRuleCount} правил`}</strong><small>${allTraffic ? 'Кроме локальной сети и служебных адресов' : 'Остальной интернет — напрямую'}</small></article>
      <article><span>Устройства</span><strong>Локальная сеть</strong><small>Охват можно ограничить позднее</small></article>
    </div>
    <section class="setup-auto-plan">
      <strong>${state.setupApplying ? 'Запускаю и проверяю' : 'Мастер сделает автоматически'}</strong>
      <div><span>✓ Сохранит точку отката</span><span>✓ Проверит подключение</span><span>✓ Настроит DNS</span><span>✓ Включит маршрутизацию</span></div>
    </section>
    ${resultBlock(result, rollback)}
    <details class="setup-technical-details">
      <summary>Резервная копия и технические параметры</summary>
      ${setupSnapshotBlock(snapshot)}
      <div class="setup-advanced-summary"><span>DNS: ${escapeHtml(state.setupLanDnsMode === 'xray' ? 'через Xray' : state.setupLanDnsMode)}</span><span>Перехват: ${escapeHtml(String(fwMode).toUpperCase())}</span></div>
    </details>
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
  if (!['direct', 'proxy'].includes(state.setupFallbackMode)) {
    const proxyTags = new Set(proxyOutboundsSafe().map((item) => String(item?.tag || '').trim()).filter(Boolean));
    state.setupFallbackMode = readiness.defaultRouteTarget && proxyTags.has(readiness.defaultRouteTarget) ? 'proxy' : 'direct';
  }
  if (!setupWizardStepIds.includes(state.setupStep)) state.setupStep = setupWizardStepIds[0];
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
  const launchReady = readiness.canApply && (state.setupFallbackMode === 'proxy' || readiness.proxyRuleCount > 0);
  const primaryDisabled = state.setupApplying || (isLast && !launchReady);
  return `
    <section class="setup-page">
      <div class="setup-page-head">
        <div>
          <h2>Быстрый запуск RuOpenRay</h2>
          <p>Добавьте подключение, выберите нужные сервисы и запустите. Сетевые параметры роутера мастер настроит сам.</p>
        </div>
        <div class="split-actions">
          <button class="btn secondary" type="button" data-action="openInstallWizard">Установка Xray</button>
          <button class="btn secondary" type="button" data-tab-jump="dashboard">На панель</button>
        </div>
      </div>

      <div class="setup-guided-layout">
        <aside class="setup-guide-rail">
          <div class="setup-rail-title">
            <strong>Три простых шага</strong>
            <span>Технические параметры уже подобраны. Их можно изменить позже в отдельных разделах.</span>
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
            <button class="btn warning" type="button" data-action="${primaryAction}" ${primaryDisabled ? 'disabled' : ''}>${setupStepPrimaryLabel(currentStep?.id, isLast)}</button>
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
