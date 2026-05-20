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
        ${setupFlowStep('2', 'Настроить DNS', dnsReady ? 'dnsmasq → Xray DNS.' : 'Подготовьте DNS inbound и направьте LAN DNS в 127.0.0.1#5353 или внешний Pi-hole.', dnsReady, 'DNS', 'data-tab-jump="dns"')}
        ${setupFlowStep('3', 'Включить перехват', interceptReady ? 'transparent inbound, nftables и policy routing активны.' : transparentReady ? 'Выберите TPROXY/REDIRECT, устройства и порты, затем примените firewall.' : 'Сначала подготовьте transparent inbound, иначе LAN-трафик не попадет в Xray.', interceptReady, 'Перехват', 'data-tab-jump="routing" data-routing-view-jump="intercept"')}
        ${setupFlowStep('4', 'Проверить трафик', statsReady ? 'Статистика Xray включена.' : 'Включите статистику Xray и проверьте рост счетчиков с LAN-устройства.', statsReady, 'Диагностика', 'data-tab-jump="diagnostics" data-diagnostics-jump="chain"')}
      </div>
      ${!readiness.canApply ? '<p class="settings-warning compact"><strong>Перед включением</strong><span>Закройте красные пункты готовности выше: мастер не применяет рискованную схему вслепую.</span></p>' : ''}
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
            <small>${diskFree && diskFree < 16 * 1024 * 1024 ? 'Мало места: выбирайте компактные geo и без бэкапов.' : 'Для слабых роутеров всё равно лучше держать запас.'}</small>
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
            <strong>NAND-friendly профиль</strong>
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
    setupWizardDialog,
    installWizardDialog,
    coreUpdateDialog,
  };
}
