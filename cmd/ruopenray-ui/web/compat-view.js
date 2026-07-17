export function createCompatView({ state, escapeHtml }) {
  function externalLink(url, label) {
    if (!url) return '';
    return `<a class="btn secondary" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  }

  function commandButton(action, label) {
    const busy = state.busyAction === action;
    return `<button class="btn secondary ${busy ? 'is-busy' : ''}" data-action="${escapeHtml(action)}" ${busy ? 'disabled' : ''}>${escapeHtml(busy ? 'Выполняю...' : label)}</button>`;
  }

  function b4Button(action, label, tone = 'secondary') {
    const busy = state.busyAction === `controlB4:${action}`;
    return `<button class="btn ${tone} ${busy ? 'is-busy' : ''}" data-action="controlB4" data-b4-action="${escapeHtml(action)}" ${busy ? 'disabled' : ''}>${escapeHtml(busy ? 'Выполняю...' : label)}</button>`;
  }

  function integrationStep({ number, title, role, status, detail, tone = '', meta = '', action = '' }) {
    return `<article class="compat-flow-step ${tone}">
      <div class="compat-flow-step-head">
        <span class="compat-step-number" aria-hidden="true">${escapeHtml(number)}</span>
        <span class="status-chip ${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : ''}">${escapeHtml(status)}</span>
      </div>
      <span class="eyebrow">${escapeHtml(role)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(detail)}</p>
      <div class="compat-flow-step-foot">
        <strong>${escapeHtml(meta)}</strong>
        ${action}
      </div>
    </article>`;
  }

  function adguardSection(compat = {}) {
    const item = compat.adguardHome || {};
    const found = Boolean(item.available || item.configPath);
    return `<details class="panel compat-secondary-details" data-details-key="compat-dns-services">
      <summary>
        <span><strong>DNS рядом с RuOpenRay</strong><em>AdGuard Home можно использовать как фильтр перед DNS Xray</em></span>
        <b>${escapeHtml(found ? (item.running ? 'запущен' : 'найден') : 'не найден')}</b>
      </summary>
      <div class="compat-secondary-body">
        <div class="compat-card-head">
          <div>
            <span class="eyebrow">AdGuard Home</span>
            <h2>${escapeHtml(found ? (item.running ? 'работает' : 'обнаружен') : 'не найден')}</h2>
            <p>${escapeHtml(item.hint || (found
              ? 'Для совместной работы AdGuard фильтрует запросы, а DNS Xray остается его upstream.'
              : 'RuOpenRay не нашел AdGuard Home на этом роутере.'))}</p>
          </div>
          <span class="status-chip ${item.running ? 'ok' : ''}">${escapeHtml(item.running ? 'запущен' : (found ? 'остановлен' : 'нет'))}</span>
        </div>
        <div class="compat-metrics compact">
          <article><span>Слушает</span><strong>${escapeHtml(item.listen || (item.port ? `:${item.port}` : 'неизвестно'))}</strong></article>
          <article><span>Upstream</span><strong>${escapeHtml(item.usesXray ? 'DNS Xray' : (found ? 'не настроен' : 'нет'))}</strong></article>
          <article><span>Конфигурация</span><strong>${escapeHtml(item.configPath || 'не найдена')}</strong></article>
        </div>
        <div class="split-actions">
          ${externalLink(compat.links?.adguardHome, 'Открыть AdGuard')}
          <button class="btn secondary" data-tab-jump="dns">Настроить DNS</button>
        </div>
      </div>
    </details>`;
  }

  function b4Section(compat = {}) {
    const item = compat.b4 || {};
    const found = Boolean(item.available || item.active || item.running || item.config?.found);
    const enabled = Boolean(item.service?.enabled);
    const apiReady = Boolean(item.api?.available);
    const queueActive = Boolean(item.active || item.api?.queueActive || item.nft?.hasQueue || item.iptables?.hasNFQUEUE);
    const configPaths = Array.isArray(item.config?.paths) ? item.config.paths : [];
    const portOccupied = Boolean(item.ports?.occupied && !item.ports?.ui);
    const mark = item.api?.config?.queue?.mark;
    const title = queueActive ? 'обрабатывает трафик' : item.running ? 'запущен без активного перехвата' : found ? 'установлен, сейчас выключен' : 'не найден';
    return `<section class="panel compat-service-panel">
      <div class="panel-title">
        <div>
          <h2>B4</h2>
          <span>DPI-обход для выбранного direct-трафика. Не должен забирать интерфейсы и метки Xray или AWG.</span>
        </div>
        <span class="status-chip ${queueActive ? 'warn' : item.running ? 'ok' : ''}">${escapeHtml(queueActive ? 'перехват активен' : item.running ? 'запущен' : found ? 'выключен' : 'не найден')}</span>
      </div>
      <div class="compat-service-summary">
        <div>
          <span class="eyebrow">Текущее состояние</span>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(item.summary || 'RuOpenRay проверяет процесс, API и собственные правила NFQUEUE B4.')}</p>
        </div>
        <div class="compat-metrics compact">
          <article><span>API</span><strong>${escapeHtml(apiReady ? (item.api?.version || 'отвечает') : 'не отвечает')}</strong></article>
          <article><span>Сервис</span><strong>${escapeHtml(item.running ? 'запущен' : 'остановлен')}</strong></article>
          <article><span>Перехват</span><strong>${escapeHtml(queueActive ? 'активен' : 'не найден')}</strong></article>
          <article><span>Packet mark</span><strong>${escapeHtml(mark !== undefined && mark !== null && mark !== 0 ? String(mark) : 'не определен')}</strong></article>
        </div>
      </div>
      ${portOccupied ? `<div class="settings-warning compact"><strong>Порт 7000 занят</strong><span>На этом порту отвечает другой процесс, поэтому ссылка на B4 скрыта.</span></div>` : ''}
      <div class="split-actions compat-primary-actions">
        ${found ? (item.running ? b4Button('stop', 'Остановить B4', 'warning') : b4Button('start', 'Запустить B4', 'warning')) : ''}
        ${found ? (enabled ? b4Button('disable', 'Убрать автозапуск') : b4Button('enable', 'Включить автозапуск')) : ''}
        ${item.running ? b4Button('restart', 'Перезапустить') : ''}
        ${externalLink(compat.links?.b4, 'Открыть B4')}
      </div>
      ${found ? `<details class="compat-service-details" data-details-key="compat-b4-service">
        <summary><span><strong>Служебные сведения</strong><em>Конфигурация и очистка оставшихся таблиц</em></span><b>Подробнее</b></summary>
        <div class="compat-service-details-body">
          <div class="settings-info-grid">
            <article><span>Конфигурация</span><strong>${escapeHtml(configPaths.join(', ') || 'не найдена')}</strong></article>
            <article><span>Автозапуск</span><strong>${escapeHtml(enabled ? 'включен' : 'выключен')}</strong></article>
          </div>
          <div class="split-actions">
            ${b4Button('clear', 'Остановить и очистить таблицы', 'danger')}
          </div>
        </div>
      </details>` : ''}
    </section>`;
  }

  function compatPanel() {
    const routerLan = state.compatStatus?.routerLan || state.lanDnsStatus?.routerLan || '192.168.1.1';
    const adguardFallback = state.lanDnsStatus?.adguardHome || {};
    const adguardPort = Number(adguardFallback.webPort || 3000) || 3000;
    const compat = state.compatStatus || {
      adguardHome: adguardFallback,
      b4: state.status?.b4 || {},
      amnezia: state.amneziaStatus || state.status?.amnezia || {},
      links: { adguardHome: `http://${routerLan}:${adguardPort}/`, b4: '' }
    };
    const awg = compat.amnezia || state.amneziaStatus || state.status?.amnezia || {};
    const b4 = compat.b4 || {};
    const xrayRunning = Boolean(state.status?.service?.running);
    const xrayRules = Number(state.status?.config?.routingRules || 0);
    const xrayTransparent = Boolean(awg.xrayIntegration?.transparentReady);
    const awgRunning = Boolean(awg.running || awg.runtime?.connected || awg.runtime?.interfaceRunning);
    const awgReady = Boolean(awg.runtime?.backendReady || awg.available);
    const awgProfiles = Array.isArray(awg.clientConfig?.profiles?.items) ? awg.clientConfig.profiles.items.length : 0;
    const awgMode = awg.clientConfig?.profiles?.mode || 'standby';
    const b4Active = Boolean(b4.active || b4.api?.queueActive || b4.nft?.hasQueue || b4.iptables?.hasNFQUEUE);
    const b4Installed = Boolean(b4.available || b4.config?.found || b4.service?.exists);
    const markConflict = Boolean(b4.routing?.markConflict);
    const queueAll = b4.api?.config?.queueScope === 'all';
    const issues = [];
    if (markConflict) issues.push({ tone: 'danger', text: `B4 и AWG используют одинаковую fwmark ${b4.routing?.ruopenrayAWGMark || ''}. Сначала измените метку одной из систем.` });
    if (b4Active && queueAll) issues.push({ tone: 'danger', text: 'B4 настроен на все интерфейсы. Исключите интерфейсы Xray и AWG до параллельного запуска.' });
    else if (b4Active && xrayTransparent) issues.push({ tone: 'warn', text: 'Xray и B4 одновременно перехватывают трафик. Оставьте Xray владельцем LAN-маршрутизации, а B4 ограничьте direct-трафиком.' });
    const safetyTone = issues.some((item) => item.tone === 'danger') ? 'danger' : issues.length ? 'warn' : 'ok';
    const safetyTitle = safetyTone === 'danger' ? 'Есть конфликт перед параллельным запуском' : safetyTone === 'warn' ? 'Нужно проверить границы перехвата' : 'Явных конфликтов не найдено';

    return `<div class="compat-page">
      <section class="compat-hero">
        <div>
          <span class="eyebrow">Совместная работа</span>
          <h2>Xray + AmneziaWG + B4</h2>
          <p>Все три компонента могут работать одновременно, если Xray выбирает маршрут, AWG служит отдельным выходом, а B4 обрабатывает только явно ограниченный direct-трафик.</p>
        </div>
        ${commandButton('refreshCompatibility', 'Обновить проверку')}
      </section>

      <section class="panel compat-scheme-panel">
        <div class="panel-title">
          <div><h2>Рекомендуемая схема</h2><span>Каждый компонент отвечает только за свой слой.</span></div>
        </div>
        <div class="compat-flow">
          ${integrationStep({
            number: '1', title: 'Xray', role: 'Выбор маршрута',
            status: xrayRunning ? 'работает' : 'остановлен', tone: xrayRunning ? 'ok' : 'warn',
            detail: 'Принимает LAN-трафик и решает: proxy, direct, block или отдельное направление AWG.',
            meta: `${xrayRules} правил`, action: '<button class="btn secondary compact" data-tab-jump="routing">Сценарии</button>'
          })}
          ${integrationStep({
            number: '2', title: 'AmneziaWG', role: 'Дополнительный выход',
            status: awgRunning ? 'подключен' : awgReady ? 'готов' : 'не готов', tone: awgRunning ? 'ok' : awgReady ? '' : 'warn',
            detail: 'Используется как out-amnezia или отдельная policy-маршрутизация, не переключая весь роутер.',
            meta: `${awgProfiles} профилей · ${awgMode}`, action: '<button class="btn secondary compact" data-tab-jump="amnezia">Настроить AWG</button>'
          })}
          ${integrationStep({
            number: '3', title: 'B4', role: 'DPI-обход direct',
            status: b4Active ? 'перехватывает' : b4Installed ? 'выключен' : 'не найден', tone: b4Active ? 'warn' : b4Installed ? '' : '',
            detail: 'Работает только с выбранным direct-трафиком и не забирает метки или интерфейсы Xray/AWG.',
            meta: b4Active ? 'NFQUEUE активен' : b4Installed ? 'перехват не найден' : 'не установлен'
          })}
        </div>
        <div class="compat-safety ${safetyTone}">
          <div><strong>${escapeHtml(safetyTitle)}</strong><span>${issues.length ? 'Проверьте пункты ниже перед изменением firewall.' : 'Xray, AWG и B4 сейчас не используют один и тот же подтвержденный перехват или fwmark.'}</span></div>
          ${issues.length ? `<ul>${issues.map((item) => `<li>${escapeHtml(item.text)}</li>`).join('')}</ul>` : ''}
        </div>
      </section>

      ${b4Section(compat)}
      ${adguardSection(compat)}
    </div>`;
  }

  return { compatPanel };
}
