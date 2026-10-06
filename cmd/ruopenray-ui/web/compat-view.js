import { adguardAdminUrl, adguardSection as adguardSettings } from './adguard-view.js';
import { createAmneziaView } from './amnezia-view.js';
import { b4Panel } from './b4-view.js';

export function createCompatView({ state, escapeHtml, pageUrl = globalThis.location?.href }) {
  const { amneziaPanel } = createAmneziaView({ state, escapeHtml });
  function externalLink(url, label) {
    if (!url) return '';
    return `<a class="btn secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
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
        <span><strong>Технические сведения AdGuard Home</strong><em>DNS-путь, порты и конфигурация сервиса</em></span>
        <b>${escapeHtml(found ? (item.running ? 'запущен' : 'найден') : 'не найден')}</b>
      </summary>
      <div class="compat-secondary-body">
        <div class="compat-card-head">
          <div>
            <span class="eyebrow">AdGuard Home</span>
            <h2>${escapeHtml(found ? (item.running ? 'работает' : 'обнаружен') : 'не найден')}</h2>
            <p>${escapeHtml(item.hint || (found
              ? 'AdGuard фильтрует DNS; upstream и маршрут запросов задаются в настройках DNS.'
              : 'RuOpenRay не нашел AdGuard Home на этом роутере.'))}</p>
          </div>
          <span class="status-chip ${item.running ? 'ok' : ''}">${escapeHtml(item.running ? 'запущен' : (found ? 'остановлен' : 'нет'))}</span>
        </div>
        <div class="compat-metrics compact">
          <article><span>Слушает</span><strong>${escapeHtml(item.listen || (item.port ? `:${item.port}` : 'неизвестно'))}</strong></article>
          <article><span>Upstream</span><strong>${escapeHtml(item.dnsPath === 'doh-vpn' ? 'DoH → Xray' : item.usesXray ? 'DNS Xray' : (found ? 'не подтверждён' : 'нет'))}</strong></article>
          <article><span>Конфигурация</span><strong>${escapeHtml(item.configPath || 'не найдена')}</strong></article>
        </div>
      </div>
    </details>`;
  }

  function b4Section(compat = {}) {
    const item = compat.b4 || {};
    const found = Boolean(item.available || item.active || item.running || item.config?.found);
    const enabled = Boolean(item.service?.enabled);
    const apiReady = Boolean(item.api?.available);
    const queueActive = Boolean(item.active || item.api?.queueActive);
    const configPaths = Array.isArray(item.config?.paths) ? item.config.paths : [];
    const portOccupied = Boolean(item.ports?.occupied && !item.ports?.ui);
    const mark = item.api?.config?.queue?.mark;
    const title = queueActive ? 'найдены правила перехвата' : item.running ? 'запущен без активного перехвата' : found ? 'установлен, сейчас выключен' : 'не найден';
    return `<details class="panel compat-secondary-details compat-b4-details" data-details-key="compat-b4-service">
      <summary>
        <span><strong>Технические сведения B4</strong><em>${escapeHtml(item.summary || title)}</em></span>
        <b>${escapeHtml(queueActive ? 'перехват активен' : item.running ? 'запущен' : found ? 'выключен' : 'не найден')}</b>
      </summary>
      <div class="compat-secondary-body">
        <div class="compat-card-head">
          <div>
            <span class="eyebrow">Состояние B4</span>
            <h2>${escapeHtml(title)}</h2>
            <p>DPI-обход должен получать только выбранный direct-трафик и не использовать интерфейсы или метки Xray и AmneziaWG.</p>
          </div>
          <span class="status-chip ${queueActive ? 'warn' : item.running ? 'ok' : ''}">${escapeHtml(queueActive ? 'перехват активен' : item.running ? 'запущен' : found ? 'выключен' : 'не найден')}</span>
        </div>
        <div class="compat-metrics compact">
          <article><span>API</span><strong>${escapeHtml(apiReady ? (item.api?.version || 'отвечает') : 'не отвечает')}</strong></article>
          <article><span>Сервис</span><strong>${escapeHtml(item.running ? 'запущен' : 'остановлен')}</strong></article>
          <article><span>Перехват</span><strong>${escapeHtml(queueActive ? 'активен' : 'не найден')}</strong></article>
          <article><span>Packet mark</span><strong>${escapeHtml(mark !== undefined && mark !== null && mark !== 0 ? String(mark) : 'не определен')}</strong></article>
        </div>
        ${portOccupied ? `<div class="settings-warning compact"><strong>Порт 7000 занят</strong><span>На этом порту отвечает другой процесс, поэтому ссылка на B4 скрыта.</span></div>` : ''}
        ${found ? `<div class="settings-info-grid">
          <article><span>Конфигурация</span><strong>${escapeHtml(configPaths.join(', ') || 'не найдена')}</strong></article>
          <article><span>Автозапуск</span><strong>${escapeHtml(enabled ? 'включен' : 'выключен')}</strong></article>
        </div>` : ''}
        <div class="split-actions compat-primary-actions">
          ${found && !item.running ? b4Button('start', 'Запустить B4') : ''}
          ${found ? (enabled ? b4Button('disable', 'Убрать автозапуск') : b4Button('enable', 'Включить автозапуск')) : ''}
          ${item.running ? b4Button('restart', 'Перезапустить') : ''}
          ${externalLink(compat.links?.b4, 'Открыть B4')}
          ${found ? b4Button('clear', 'Остановить и очистить таблицы', 'danger') : ''}
        </div>
      </div>
    </details>`;
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
    const sections = [['overview', 'Обзор'], ['b4', 'B4'], ['adguard', 'AdGuard Home'], ['amnezia', 'AmneziaWG']];
    const view = sections.some(([value]) => value === state.compatView) ? state.compatView : 'overview';
    const tabPage = (content) => `<div class="compat-page">
      <div class="routing-subnav compat-tabs" role="tablist" aria-label="Разделы интеграций">
        ${sections.map(([value, label]) => `<button type="button" id="compat-tab-${value}" role="tab" aria-selected="${view === value}" aria-controls="compat-panel-${value}" class="${view === value ? 'active' : ''}" data-compat-view="${value}">${label}</button>`).join('')}
      </div>
      <div class="compat-tab-panel" id="compat-panel-${view}" role="tabpanel" aria-labelledby="compat-tab-${view}">${content}</div>
    </div>`;
    if (view === 'b4') return tabPage(`${b4Panel({ state, escapeHtml, pageUrl })}${b4Section(compat)}`);
    if (view === 'adguard') return tabPage(`${adguardSettings(state, escapeHtml, pageUrl)}${adguardSection(compat)}`);
    if (view === 'amnezia') return tabPage(amneziaPanel());
    const adguard = compat.adguardHome || adguardFallback;
    const adguardStatus = state.adguardStatus || {};
    const adguardFound = Boolean(adguardStatus.configured || adguard.available || adguard.configPath);
    const adguardApiReady = Boolean(adguardStatus.configured && adguardStatus.ok);
    const adguardRunning = adguardApiReady ? Boolean(adguardStatus.running) : Boolean(adguard.running);
    const adguardFiltering = adguardApiReady && adguardStatus.running && adguardStatus.protectionEnabled && adguardStatus.filteringEnabled;
    const adguardLabel = adguardStatus.configured && !adguardApiReady ? 'API не отвечает' : adguardRunning ? 'работает' : adguardFound ? 'остановлен' : 'не найден';
    const adguardMeta = adguardApiReady ? (adguardFiltering ? 'Фильтрация включена' : 'Фильтрация выключена') : adguardFound ? 'Фильтрация не проверена' : 'не установлен';
    const adguardUrl = adguardStatus.configured ? adguardAdminUrl(adguardStatus.url, pageUrl) : compat.links?.adguardHome;
    const adguardDetail = adguardStatus.error || (adguard.dnsPath === 'doh-vpn'
      ? 'Фильтрует DNS и передаёт запросы через DoH в Xray. Направление выбирают правила Xray.'
      : 'Фильтрует рекламу и трекеры на уровне DNS. Настройки и исключения доступны в разделе «Рекламорезка».');
    const awg = compat.amnezia || state.amneziaStatus || state.status?.amnezia || {};
    const b4 = compat.b4 || {};
    const b4Url = b4.api?.available
      ? adguardAdminUrl(b4.api.url || 'http://127.0.0.1:7000', pageUrl)
      : compat.links?.b4;
    const xrayRunning = Boolean(state.status?.service?.running);
    const xrayRules = Number(state.status?.config?.routingRules || 0);
    const xrayTransparent = Boolean(awg.xrayIntegration?.transparentReady);
    const awgRunning = Boolean(awg.running || awg.runtime?.connected || awg.runtime?.interfaceRunning);
    const awgReady = Boolean(awg.runtime?.backendReady || awg.available);
    const awgProfiles = Array.isArray(awg.clientConfig?.profiles?.items) ? awg.clientConfig.profiles.items.length : 0;
    const awgConfigured = awgProfiles > 0;
    const awgMode = awg.clientConfig?.profiles?.mode || 'standby';
    const b4Active = Boolean(b4.active || b4.api?.queueActive);
    const b4Running = Boolean(b4.running || b4.service?.running);
    const b4Installed = Boolean(b4.available || b4.config?.found || b4.service?.exists);
    const markConflict = Boolean(b4.routing?.markConflict);
    const queueAll = b4.api?.config?.queueScope === 'all' && !b4.api?.config?.skipSetup;
    const issues = [];
    if (b4.api?.engine?.state === 'failed') issues.push({ tone: 'warn', text: 'Движок B4 не запустился; DPI-обход не работает. Проверьте NFQUEUE или причину ошибки в карточке B4.' });
    if (markConflict) issues.push({ tone: 'danger', text: `B4 и AWG используют одинаковую fwmark ${b4.routing?.ruopenrayAWGMark || ''}. Сначала измените метку одной из систем.` });
    if (b4Active && queueAll) issues.push({ tone: 'danger', text: 'B4 настроен на все интерфейсы. Исключите интерфейсы Xray и AWG до параллельного запуска.' });
    else if (b4Active && xrayTransparent && !b4.managedDirectOnly) issues.push({ tone: 'warn', text: 'Xray и B4 одновременно перехватывают трафик. Оставьте Xray владельцем LAN-маршрутизации, а B4 ограничьте direct-трафиком.' });
    const safetyTone = issues.some((item) => item.tone === 'danger') ? 'danger' : issues.length ? 'warn' : 'ok';
    const safetyTitle = safetyTone === 'danger' ? 'Есть конфликт перед параллельным запуском' : safetyTone === 'warn' ? 'Нужно проверить границы перехвата' : 'Явных конфликтов не найдено';
    const awgStatus = awgRunning ? 'подключен' : !awgConfigured ? 'нет профиля' : awgReady ? 'готов к запуску' : 'не готов';
    const awgTone = awgRunning ? 'ok' : !awgConfigured || !awgReady ? 'warn' : '';
    const heroTitle = safetyTone === 'danger'
      ? 'Совместный запуск заблокирован'
      : safetyTone === 'warn'
        ? 'Нужно развести перехват'
        : !xrayRunning
          ? 'Сначала запустите Xray'
          : !awgConfigured
            ? 'Подключайте нужные компоненты'
            : !awgRunning
              ? 'Почти готово к совместной работе'
              : !b4Active
                ? 'Осталось настроить B4'
                : 'Компоненты работают совместно';
    let nextStep = {
      tone: 'ok',
      label: 'Схема готова',
      title: 'Компоненты работают без явного конфликта',
      detail: 'Xray выбирает маршруты, AmneziaWG предоставляет отдельный выход, а B4 обрабатывает ограниченный direct-трафик.',
      action: commandButton('refreshCompatibility', 'Повторить проверку')
    };
    if (!xrayRunning) {
      nextStep = {
        tone: 'warn',
        label: 'Следующий шаг',
        title: 'Запустите Xray',
        detail: 'Без Xray нет владельца LAN-маршрутизации и правил proxy, direct и block.',
        action: '<button class="btn warning" data-tab-jump="dashboard">Открыть панель</button>'
      };
    } else if (issues.length) {
      nextStep = {
        tone: safetyTone,
        label: 'Сначала исправьте',
        title: safetyTitle,
        detail: issues[0].text,
        action: b4Active ? b4Button('stop', 'Остановить B4', 'warning') : commandButton('refreshCompatibility', 'Повторить проверку')
      };
    } else if (!awgConfigured) {
      nextStep = {
        tone: 'warn',
        label: 'Необязательный выход',
        title: 'AmneziaWG можно настроить отдельно',
        detail: 'Для B4 и AdGuard Home профиль AWG не нужен. Импортируйте client.conf, если требуется дополнительный VPN-выход.',
        action: '<button class="btn warning" data-compat-view="amnezia">Настроить AmneziaWG</button>'
      };
    } else if (!awgRunning) {
      nextStep = {
        tone: 'warn',
        label: 'Следующий шаг',
        title: 'Проверьте и запустите AmneziaWG',
        detail: 'RuOpenRay сначала проверит профиль и способ запуска, затем поднимет отдельный туннель.',
        action: '<button class="btn warning" data-compat-view="amnezia">Открыть AmneziaWG</button>'
      };
    } else if (!b4Installed) {
      nextStep = {
        tone: '',
        label: 'Необязательный компонент',
        title: 'B4 не установлен',
        detail: 'Xray и AmneziaWG уже могут работать вместе. Для DPI-обхода direct-трафика установите B4 отдельно.',
        action: commandButton('refreshCompatibility', 'Проверить снова')
      };
    } else if (!b4Active) {
      nextStep = {
        tone: '',
        label: 'Последний шаг',
        title: 'Ограничьте B4 direct-трафиком и запустите',
        detail: 'После запуска RuOpenRay повторно проверит NFQUEUE, интерфейсы и packet mark.',
        action: b4Button('start', 'Запустить B4', 'warning')
      };
    }

    return tabPage(`
      <section class="compat-hero ${safetyTone === 'danger' ? 'danger' : safetyTone === 'warn' ? 'warn' : ''}">
        <div>
          <span class="eyebrow">Xray + AmneziaWG + B4 + AdGuard Home</span>
          <h2>${escapeHtml(heroTitle)}</h2>
          <p>Xray выбирает маршрут, AmneziaWG предоставляет дополнительный VPN-выход, B4 обрабатывает ограниченный direct-трафик, а AdGuard Home фильтрует DNS. Дополнительные компоненты можно включать независимо.</p>
        </div>
        ${commandButton('refreshCompatibility', 'Обновить проверку')}
      </section>

      <section class="panel compat-scheme-panel">
        <div class="panel-title">
          <div><h2>Состояние компонентов</h2><span>У каждого компонента одна роль и собственная зона ответственности.</span></div>
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
            status: awgStatus, tone: awgTone,
            detail: 'Используется как out-amnezia или отдельная policy-маршрутизация, не переключая весь роутер.',
            meta: `${awgProfiles} профилей · ${awgMode}`, action: '<button class="btn secondary compact" data-compat-view="amnezia">Настроить AWG</button>'
          })}
          ${integrationStep({
            number: '3', title: 'B4', role: 'DPI-обход direct',
            status: b4Active ? 'перехватывает' : b4Running ? 'запущен' : b4Installed ? 'выключен' : 'не найден', tone: b4Active ? (issues.length ? 'warn' : 'ok') : b4Running ? 'warn' : '',
            detail: 'Работает только с выбранным direct-трафиком и не забирает метки или интерфейсы Xray/AWG.',
            meta: b4Active ? 'NFQUEUE активен' : b4Running ? 'перехват не подтвержден' : b4Installed ? 'перехват не найден' : 'не установлен',
            action: b4Installed ? `<div class="split-actions compat-component-actions">${b4Button('status', 'Проверить B4')}${externalLink(b4Url, 'Открыть B4 ↗')}</div>` : ''
          })}
          ${integrationStep({
            number: '4', title: 'AdGuard Home', role: 'Фильтрация DNS',
            status: adguardLabel, tone: adguardFiltering ? 'ok' : adguardFound ? 'warn' : '',
            detail: adguardDetail, meta: adguardMeta,
            action: `<div class="split-actions compat-component-actions"><button class="btn secondary compact" data-compat-view="adguard">Рекламорезка</button>${adguardFound ? externalLink(adguardUrl, 'Открыть AdGuard Home ↗') : ''}</div>`
          })}
        </div>
        <div class="compat-next-step ${nextStep.tone}">
          <div>
            <span class="eyebrow">${escapeHtml(nextStep.label)}</span>
            <strong>${escapeHtml(nextStep.title)}</strong>
            <p>${escapeHtml(nextStep.detail)}</p>
          </div>
          <div class="compat-next-step-action">${nextStep.action}</div>
        </div>
        ${issues.length > 1 ? `<div class="compat-safety ${safetyTone}"><ul>${issues.slice(1).map((item) => `<li>${escapeHtml(item.text)}</li>`).join('')}</ul></div>` : ''}
      </section>

    `);
  }

  return { compatPanel };
}
